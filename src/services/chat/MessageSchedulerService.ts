import fs from 'fs';
import path from 'path';
import imageSize from 'image-size';
import DatabaseService from '../database/DatabaseService';
import ConnectionManager from '../../utils/ConnectionManager';
import FacebookConnectionManager from '../../utils/FacebookConnectionManager';
import Logger from '../../utils/Logger';

export default class MessageSchedulerService {
    private static instance: MessageSchedulerService;
    private timer: NodeJS.Timeout | null = null;
    private running = false;

    public static getInstance(): MessageSchedulerService {
        if (!MessageSchedulerService.instance) {
            MessageSchedulerService.instance = new MessageSchedulerService();
        }
        return MessageSchedulerService.instance;
    }

    public startScheduler(): void {
        if (this.timer) return;
        Logger.log('[MessageScheduler] Starting scheduled message scheduler...');
        this.timer = setInterval(() => this.checkAndSendScheduledMessages(), 15000); // Check every 15s
    }

    public stopScheduler(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async checkAndSendScheduledMessages(): Promise<void> {
        if (this.running) return;
        if (!DatabaseService.getInstance().getIsInitialized()) {
            return;
        }
        this.running = true;
        try {
            const db = DatabaseService.getInstance();
            const now = Date.now();
            
            // Query pending messages
            const pendingMsgs = db.query<any>(
                `SELECT * FROM scheduled_chat_messages WHERE status = 'pending' AND send_at <= ?`,
                [now]
            );
            
            if (pendingMsgs.length === 0) {
                this.running = false;
                return;
            }

            Logger.log(`[MessageScheduler] Found ${pendingMsgs.length} pending scheduled messages to send.`);
            
            for (const item of pendingMsgs) {
                try {
                    // Update status to sending so it doesn't get picked up by another tick
                    db.run(
                        `UPDATE scheduled_chat_messages SET status = 'sending', updated_at = ? WHERE id = ?`,
                        [Date.now(), item.id]
                    );

                    let success = false;

                    if (item.channel === 'zalo') {
                        const conn = ConnectionManager.getConnection(item.owner_zalo_id);
                        if (!conn || !conn.api) {
                            throw new Error(`Zalo account connection not found or offline: ${item.owner_zalo_id}`);
                        }
                        
                        // Handle attachments (e.g. images)
                        let payload: any = { msg: item.message };
                        if (item.attachments) {
                            try {
                                const parsedAttach = JSON.parse(item.attachments);
                                if (Array.isArray(parsedAttach) && parsedAttach.length > 0) {
                                    const attachments: any[] = [];
                                    
                                    for (const attachItem of parsedAttach) {
                                        let filePath = attachItem.localPath || attachItem._localPath;
                                        if (!filePath && attachItem.uuid) {
                                            // query CRM media items
                                            const mediaItem = db.queryOne<any>(
                                                `SELECT file_path FROM media_library_items WHERE uuid = ?`,
                                                [attachItem.uuid]
                                            );
                                            if (mediaItem?.file_path) {
                                                filePath = mediaItem.file_path;
                                            }
                                        }
                                        // Also support plain string path
                                        if (!filePath && typeof attachItem === 'string') {
                                            filePath = attachItem;
                                        }
                                        if (filePath && fs.existsSync(filePath)) {
                                            const buffer = fs.readFileSync(filePath);
                                            const baseName = path.basename(filePath);
                                            const ext = path.extname(baseName) || '.jpg';
                                            const safeFilename = (path.extname(baseName) ? baseName : `${baseName}${ext}`) as `${string}.${string}`;
                                            let width = 0, height = 0;
                                            try { const dim = imageSize(buffer); width = dim.width ?? 0; height = dim.height ?? 0; } catch {}
                                            attachments.push({ data: buffer, filename: safeFilename, metadata: { totalSize: buffer.length, width, height } });
                                        }
                                    }
                                    if (attachments.length > 0) {
                                        payload.attachments = attachments;
                                    }
                                }
                            } catch (e: any) {
                                Logger.error(`[MessageScheduler] Error parsing attachments: ${e.message}`);
                            }
                        }

                        const resp = await (conn.api as any).sendMessage(payload, item.thread_id, item.thread_type);
                        if (resp && (resp.error || resp.success === false)) {
                            throw new Error(resp.error || 'Unknown Zalo send failure');
                        }
                        success = true;
                    } else if (item.channel === 'facebook') {
                        const service = FacebookConnectionManager.get(item.owner_zalo_id);
                        if (!service) {
                            throw new Error(`Facebook account session not found: ${item.owner_zalo_id}`);
                        }
                        
                        const resp = await service.sendMessage(item.thread_id, item.message);
                        if (!resp || !resp.success) {
                            throw new Error(resp?.error || 'Unknown Facebook send failure');
                        }
                        success = true;
                    } else {
                        throw new Error(`Unsupported channel: ${item.channel}`);
                    }

                    if (success) {
                        db.run(
                            `UPDATE scheduled_chat_messages SET status = 'sent', updated_at = ? WHERE id = ?`,
                            [Date.now(), item.id]
                        );
                        Logger.log(`[MessageScheduler] Sent scheduled message ${item.id} successfully.`);
                    }
                } catch (sendErr: any) {
                    Logger.error(`[MessageScheduler] Failed to send message ${item.id}: ${sendErr.message}`);
                    db.run(
                        `UPDATE scheduled_chat_messages SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`,
                        [sendErr.message, Date.now(), item.id]
                    );
                }
            }
            db.save();
        } catch (globalErr: any) {
            Logger.error(`[MessageScheduler] Global tick error: ${globalErr.message}`);
        } finally {
            this.running = false;
        }
    }
}
