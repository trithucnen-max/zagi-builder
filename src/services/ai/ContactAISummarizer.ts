/**
 * ContactAISummarizer.ts
 *
 * Main-process singleton service that automatically summarizes customer profiles
 * using AI whenever a configured message-count threshold is reached.
 */

import DatabaseService from '../database/DatabaseService';
import AIAssistantService from './AIAssistantService';
import EventBroadcaster from '../event/EventBroadcaster';
import Logger from '../../utils/Logger';

// Track in-progress summarizations to avoid concurrent duplicate runs
const inProgress = new Set<string>(); // key = `${ownerZaloId}:${contactId}`

// Cooldown tracking in memory to prevent LLM API spam when offline or rate-limited
const lastAttemptTime = new Map<string, number>();
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Background Concurrency Control Queue to avoid heavy concurrent LLM calls
 */
class SummaryQueue {
    private queue: Array<{
        ownerZaloId: string;
        contactId: string;
        assistantId: string | null;
        currentProfile: string | null;
        messageCount: number;
        resolve: (val: { success: boolean; error?: string }) => void;
        reject: (err: any) => void;
    }> = [];
    private running = 0;
    private maxConcurrency = 1;

    public push(
        ownerZaloId: string,
        contactId: string,
        assistantId: string | null,
        currentProfile: string | null,
        messageCount: number
    ): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve, reject) => {
            this.queue.push({ ownerZaloId, contactId, assistantId, currentProfile, messageCount, resolve, reject });
            this.next();
        });
    }

    private next() {
        if (this.running >= this.maxConcurrency || this.queue.length === 0) return;
        this.running++;
        const item = this.queue.shift()!;
        ContactAISummarizer.executeSummaryDirect(
            item.ownerZaloId,
            item.contactId,
            item.assistantId,
            item.currentProfile,
            item.messageCount
        )
            .then(item.resolve)
            .catch(item.reject)
            .finally(() => {
                this.running--;
                this.next();
            });
    }
}

const summaryQueue = new SummaryQueue();

class ContactAISummarizer {
    private constructor() {}

    /**
     * Called by DatabaseService.saveMessage() for every 1-1 (non-group) message.
     * Runs asynchronously so it never blocks message saving.
     */
    public static async onNewMessage(ownerZaloId: string, contactId: string): Promise<void> {
        try {
            const db = DatabaseService.getInstance();
            const state = db.incrementContactMessageCounter(ownerZaloId, contactId);
            if (!state) return;

            const { counter, threshold, autoEnabled, assistantId, currentProfile } = state;
            if (!autoEnabled) return;
            if (counter < threshold) return;

            const key = `${ownerZaloId}:${contactId}`;
            if (inProgress.has(key)) return; // already running

            // Cooldown check
            const lastAttempt = lastAttemptTime.get(key);
            if (lastAttempt && Date.now() - lastAttempt < COOLDOWN_MS) {
                Logger.info(`[ContactAISummarizer] Cooldown active for contact=${contactId}. Skipping auto-summary.`);
                return;
            }

            Logger.info(`[ContactAISummarizer] Threshold reached (${counter}/${threshold}) for contact=${contactId}. Queueing auto-summary...`);
            // Run inside background worker queue
            ContactAISummarizer.runAutoSummary(ownerZaloId, contactId, assistantId, currentProfile, threshold);
        } catch (err: any) {
            Logger.warn(`[ContactAISummarizer] onNewMessage error: ${err.message}`);
        }
    }

    /**
     * Entry point: delegates to SummaryQueue to throttle concurrent executions.
     */
    public static async runAutoSummary(
        ownerZaloId: string,
        contactId: string,
        assistantId: string | null,
        currentProfile: string | null,
        messageCount: number = 30
    ): Promise<{ success: boolean; error?: string }> {
        return summaryQueue.push(ownerZaloId, contactId, assistantId, currentProfile, messageCount);
    }

    /**
     * Direct executor method triggered sequentially by SummaryQueue
     */
    public static async executeSummaryDirect(
        ownerZaloId: string,
        contactId: string,
        assistantId: string | null,
        currentProfile: string | null,
        messageCount: number
    ): Promise<{ success: boolean; error?: string }> {
        const key = `${ownerZaloId}:${contactId}`;
        if (inProgress.has(key)) return { success: false, error: 'Already running' };

        // Final safeguard: Check cooldown right before executing
        const lastAttempt = lastAttemptTime.get(key);
        if (lastAttempt && Date.now() - lastAttempt < COOLDOWN_MS) {
            Logger.info(`[ContactAISummarizer] Cooldown active in executor for contact=${contactId}. Skipping execution.`);
            return { success: false, error: 'Cooldown active' };
        }

        inProgress.add(key);

        // Record attempt timestamp to implement cooldown
        lastAttemptTime.set(key, Date.now());

        try {
            const db = DatabaseService.getInstance();
            const aiService = AIAssistantService.getInstance();
            const assistant = assistantId
                ? aiService.getAssistant(assistantId)
                : aiService.getDefaultAssistant();

            if (!assistant) {
                Logger.warn('[ContactAISummarizer] No AI assistant available. Skipping.');
                return { success: false, error: 'No AI assistant configured' };
            }

            const contactRow = db.queryOne<{ display_name: string; alias: string }>(
                `SELECT display_name, alias FROM contacts WHERE owner_zalo_id=? AND contact_id=?`,
                [ownerZaloId, contactId]
            );
            const contactName = contactRow?.alias || contactRow?.display_name || contactId;

            const recentMessages = db.getMessages(ownerZaloId, contactId, messageCount, 0);
            if (recentMessages.length === 0) {
                Logger.warn(`[ContactAISummarizer] No messages found for contact=${contactId}. Skipping.`);
                return { success: false, error: 'No messages found' };
            }

            const prompt = ContactAISummarizer.buildMergePrompt(contactName, currentProfile, recentMessages);
            const chatRes = await aiService.chat(assistant.id, [{ role: 'user', content: prompt }], false);
            if (!chatRes?.result) {
                Logger.warn('[ContactAISummarizer] AI returned empty response.');
                return { success: false, error: 'AI returned no response' };
            }

            const newProfile = chatRes.result.trim();
            db.updateContactAIProfile({ ownerZaloId, contactId, aiProfile: newProfile, resetCounter: true });

            // Success: clear cooldown
            lastAttemptTime.delete(key);

            Logger.info(`[ContactAISummarizer] Auto-summary complete for contact=${contactId}.`);
            EventBroadcaster.broadcastAIProfileUpdated(ownerZaloId, contactId, newProfile);
            return { success: true };
        } catch (err: any) {
            Logger.error(`[ContactAISummarizer] runAutoSummary error: ${err.message}`);
            return { success: false, error: err.message };
        } finally {
            inProgress.delete(key);
        }
    }

    private static buildMergePrompt(contactName: string, oldProfile: string | null, recentMessages: any[]): string {
        const messagesText = recentMessages
            .filter((m: any) => {
                // Filter out system, stickers, and recalled messages to optimize token usage
                const type = m.msg_type || 'text';
                if (type === 'system' || type === 'sticker' || m.is_recalled) return false;
                return true;
            })
            .map((m: any) => {
                const sender = m.is_sent ? '[Nhân viên]' : `[${contactName}]`;
                const time = m.timestamp ? new Date(m.timestamp).toLocaleString('vi-VN') : '';
                let text = '';
                try {
                    const parsed = JSON.parse(m.content || '{}');
                    text = parsed.msg || parsed.message || parsed.title || '';
                } catch {
                    text = String(m.content || '');
                }
                if (!text) return null;
                return `${time} ${sender}: ${text}`;
            })
            .filter(Boolean)
            .join('\n');

        const profileSection = oldProfile
            ? `HỒ SƠ HIỆN TẠI:\n${oldProfile}`
            : 'HỒ SƠ HIỆN TẠI: (Chưa có thông tin)';

        return `Bạn là trợ lý AI chuyên phân tích hồ sơ khách hàng.
Dưới đây là hồ sơ hiện tại của khách hàng tên "${contactName}" va ${recentMessages.length} tin nhắn trao đổi gần nhất.

${profileSection}

${recentMessages.length} TIN NHẮN MỚI NHẤT:
${messagesText}

YÊU CẦU:
- Cập nhật hồ sơ bằng cách tích hợp thông tin mới từ các tin nhắn trên.
- Nếu có thông tin MỚI hoặc THAY ĐỔI (ví dụ: gia từ 4 tỷ tăng lên 6 tỷ):
  -> Cập nhật thành giá mới, kèm chú thích: "(Trước: 4 tỷ -> Cập nhật: 6 tỷ)"
- Giữ nguyên các thông tin cũ không đổi. Không tự ý xóa các đề mục đã có.
- Trả về hồ sơ hoàn chỉnh format đề mục bằng tiếng Việt.`;
    }
}

export default ContactAISummarizer;

