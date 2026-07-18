import DatabaseService from '../database/DatabaseService';
import ConnectionManager from '../../utils/ConnectionManager';
import ZaloService from '../zalo/ZaloService';
import AppModeManager from '../../utils/AppModeManager';
import Logger from '../../utils/Logger';
import EventBroadcaster from '../event/EventBroadcaster';

class PhoneScanService {
    private static instance: PhoneScanService;
    private timer: ReturnType<typeof setInterval> | null = null;
    private isProcessing = false;
    private lastScanTimePerAccount: Map<string, number> = new Map();

    private constructor() {}

    public static getInstance(): PhoneScanService {
        if (!PhoneScanService.instance) {
            PhoneScanService.instance = new PhoneScanService();
        }
        return PhoneScanService.instance;
    }

    public start(): void {
        if (this.timer) return;
        Logger.log('[PhoneScanService] Starting background phone scan scheduler...');
        this.timer = setInterval(() => {
            this.tick().catch(err => {
                Logger.error(`[PhoneScanService] Tick error: ${err.message}`);
            });
        }, 5000); // Check every 5 seconds
    }

    public stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            Logger.log('[PhoneScanService] Stopped background phone scan scheduler.');
        }
    }

    public async triggerImmediateScan(): Promise<void> {
        Logger.log('[PhoneScanService] Immediate scan triggered manually.');
        await this.tick();
    }

    private async tick(): Promise<void> {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const db = DatabaseService.getInstance();
            if (!db.getIsInitialized()) {
                this.isProcessing = false;
                return;
            }

            // 1. Find the single active batch to process (only 1 batch runs at any given time, highest priority first)
            const activeBatch = db.queryOne<any>(`
                SELECT DISTINCT psb.id
                FROM phone_scan_batches psb
                INNER JOIN phone_scan_items psi ON psi.batch_id = psb.id
                WHERE psb.status = 'active' AND psi.status = 'pending'
                ORDER BY psb.priority DESC, psb.id ASC
                LIMIT 1
            `);

            if (!activeBatch) {
                this.isProcessing = false;
                return;
            }

            // Fetch pending items ONLY for this batch
            const pendingItems = db.query<any>(`
                SELECT psi.*, psb.assigned_account_id, psb.auto_tag_ids, psb.daily_limit, psb.hourly_limit
                FROM phone_scan_items psi
                INNER JOIN phone_scan_batches psb ON psi.batch_id = psb.id
                WHERE psi.status = 'pending' AND psb.status = 'active' AND psb.id = ?
                ORDER BY psi.id ASC
                LIMIT 10
            `, [activeBatch.id]);

            if (pendingItems.length === 0) {
                this.isProcessing = false;
                return;
            }

            // 2. Resolve eligible Zalo accounts currently online/connected on this machine
            const onlineConnections = ConnectionManager.getAllConnections();
            if (onlineConnections.size === 0) {
                this.isProcessing = false;
                return;
            }

            let allowedZaloIds: string[] = [];
            const isEmp = AppModeManager.getInstance().isEmployeeMode();
            const activeAccounts = db.getAccounts() || [];
            const activeZaloAccounts = activeAccounts.filter((a: any) => a.is_active !== 0 && (!a.channel || a.channel === 'zalo'));

            if (isEmp) {
                const employeeId = AppModeManager.getInstance().getEmployeeId();
                if (!employeeId) {
                    this.isProcessing = false;
                    return;
                }
                const empAccounts = db.getEmployeeAccountAccess(employeeId) || [];
                allowedZaloIds = empAccounts.filter(zaloId => activeZaloAccounts.some((a: any) => a.zalo_id === zaloId));
            } else {
                // Boss or standalone mode can use any active Zalo accounts in DB
                allowedZaloIds = activeZaloAccounts.map((a: any) => a.zalo_id);
            }

            // Filter by online connections
            const eligibleZaloIds = allowedZaloIds.filter(id => {
                const conn = onlineConnections.get(id);
                return conn && conn.connected;
            });

            if (eligibleZaloIds.length === 0) {
                this.isProcessing = false;
                return;
            }

            // Midnight local time today to check daily limits
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

            // Process one item per tick or loop through items, but enforce jitter/delays
            for (const item of pendingItems) {
                // Determine which account to use for this item
                let targetZaloId: string | null = null;
                const assignedId = item.assigned_account_id;
                const dailyLimit = item.daily_limit || 100;
                const hourlyLimit = item.hourly_limit || 30;
                const oneHourAgo = Date.now() - 60 * 60 * 1000;

                if (assignedId) {
                    if (eligibleZaloIds.includes(assignedId)) {
                        // Check daily & hourly limit for assigned account
                        const todayCount = db.getDailyScanCountForAccount(assignedId, startOfToday);
                        const hourlyCount = db.getHourlyScanCountForAccount(assignedId, oneHourAgo);
                        if (todayCount < dailyLimit && hourlyCount < hourlyLimit) {
                            targetZaloId = assignedId;
                        }
                    }
                } else {
                    // Automatically choose an online eligible account with remaining daily & hourly quota
                    let bestZaloId: string | null = null;
                    let minScannedCount = Infinity;

                    for (const zaloId of eligibleZaloIds) {
                        const todayCount = db.getDailyScanCountForAccount(zaloId, startOfToday);
                        const hourlyCount = db.getHourlyScanCountForAccount(zaloId, oneHourAgo);

                        if (todayCount < dailyLimit && hourlyCount < hourlyLimit) {
                            if (todayCount < minScannedCount) {
                                minScannedCount = todayCount;
                                bestZaloId = zaloId;
                            }
                        }
                    }
                    targetZaloId = bestZaloId;
                }

                if (!targetZaloId) {
                    // No eligible online account or limit reached for this item/batch, skip
                    continue;
                }

                // Check Jitter: don't request too fast on the same account
                const lastScan = this.lastScanTimePerAccount.get(targetZaloId) || 0;
                // Random delay between 3 and 8 seconds
                const randomDelay = 3000 + Math.random() * 5000;
                if (Date.now() - lastScan < randomDelay) {
                    continue; // Skip this tick for this account, wait next time
                }

                // Picked! Lock item status to scanning
                db.updatePhoneScanItemStatus({
                    itemId: item.id,
                    status: 'scanning',
                    scannedByAccountId: targetZaloId
                });
                EventBroadcaster.emit('crm:phoneScanUpdate', { batchId: item.batch_id });

                // Execute scan in a background promise to avoid blocking the main tick loop, but with locking
                this.executeScan(item.id, item.phone, item.phone_normalized, item.batch_id, targetZaloId, item.auto_tag_ids)
                    .catch(err => {
                        Logger.error(`[PhoneScanService] Scan execution error for item ${item.id}: ${err.message}`);
                    });

                // Update last scan time
                this.lastScanTimePerAccount.set(targetZaloId, Date.now());
                break; // Break the items loop to process only 1 item per tick per online connection to keep rates safe
            }
        } catch (err: any) {
            Logger.error(`[PhoneScanService] tick error: ${err.message}`);
        } finally {
            this.isProcessing = false;
        }
    }

    private async executeScan(
        itemId: number,
        phone: string,
        phoneNormalized: string,
        batchId: number,
        zaloId: string,
        autoTagIdsStr: string
    ): Promise<void> {
        const db = DatabaseService.getInstance();
        try {
            const conn = ConnectionManager.getConnection(zaloId);
            if (!conn) {
                db.updatePhoneScanItemStatus({
                    itemId,
                    status: 'error',
                    scannedByAccountId: zaloId,
                    errorMsg: 'Zalo account disconnected'
                });
                EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
                return;
            }

            const zaloService = await ZaloService.getInstance(conn.auth);

            // Execute Zalo lookup (API calls)
            let zaloUser: any = null;
            try {
                // Try batch lookups (though we pass 1 phone, Zalo's bulk API is safer/faster)
                const res = await zaloService.getMultiUsersByPhones([phoneNormalized]);
                if (res?.success && res.response) {
                    // Key can be starts with 84, e.g. 84xxxxxxxxx
                    for (const [phoneKey, user] of Object.entries(res.response)) {
                        const norm = phoneKey.startsWith('84') ? '0' + phoneKey.slice(2) : phoneKey;
                        if (norm === phoneNormalized || phoneKey === phoneNormalized) {
                            zaloUser = user;
                            break;
                        }
                    }
                }
            } catch (err: any) {
                Logger.warn(`[PhoneScanService] getMultiUsersByPhones failed for ${phoneNormalized}: ${err.message}. Trying findUser fallback...`);
            }

            // Fallback to findUser if bulk lookup did not find the user
            if (!zaloUser) {
                try {
                    const findRes: any = await zaloService.findUser(phoneNormalized);
                    const user = findRes?.response ?? findRes;
                    if (user?.uid) {
                        zaloUser = user;
                    }
                } catch (err: any) {
                    Logger.error(`[PhoneScanService] findUser failed for ${phoneNormalized}: ${err.message}`);
                    db.updatePhoneScanItemStatus({
                        itemId,
                        status: 'error',
                        scannedByAccountId: zaloId,
                        errorMsg: err.message || 'Lookup failed'
                    });
                    EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
                    return;
                }
            }

            if (zaloUser?.uid) {
                // Found Zalo account!
                const uid = String(zaloUser.uid);
                const name = zaloUser.display_name || zaloUser.zalo_name || zaloUser.name || phone;
                const avatar = zaloUser.avatar || zaloUser.avatarUrl || '';

                db.updatePhoneScanItemStatus({
                    itemId,
                    status: 'found',
                    scannedByAccountId: zaloId,
                    zaloUid: uid,
                    zaloName: name,
                    zaloAvatar: avatar
                });

                // Check and create/update CRM contact
                db.updateContactProfile(zaloId, uid, name, avatar, phoneNormalized, 'user');

                // Auto-tagging logic
                let tagIds: number[] = [];
                try {
                    tagIds = JSON.parse(autoTagIdsStr || '[]');
                } catch {}

                // Ensure the "Zalo Active" system label exists and add it to tagIds
                let activeLabelId = -1;
                try {
                    const existingLabels = db.getLocalLabels(zaloId) || [];
                    const activeLabel = existingLabels.find((l: any) => l.name === 'Zalo Active');
                    if (activeLabel) {
                        activeLabelId = activeLabel.id;
                    } else {
                        // Create it!
                        activeLabelId = db.upsertLocalLabel({
                            name: 'Zalo Active',
                            color: '#3B82F6', // Blue
                            emoji: '✓',
                            pageIds: zaloId
                        });
                    }
                } catch (err: any) {
                    Logger.error(`[PhoneScanService] Error ensuring Zalo Active label: ${err.message}`);
                }

                if (activeLabelId !== -1 && !tagIds.includes(activeLabelId)) {
                    tagIds.push(activeLabelId);
                }

                // Assign tags to contact
                for (const tagId of tagIds) {
                    try {
                        db.assignLocalLabelToThread(zaloId, tagId, uid);
                    } catch (err: any) {
                        Logger.error(`[PhoneScanService] Failed to assign tag ${tagId} to contact ${uid}: ${err.message}`);
                    }
                }

                // Dispatch label change event so UI refreshes
                EventBroadcaster.emit('local-labels-changed', { zaloId });
            } else {
                // User does not exist on Zalo
                db.updatePhoneScanItemStatus({
                    itemId,
                    status: 'not_found',
                    scannedByAccountId: zaloId
                });
            }

            EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
        } catch (err: any) {
            Logger.error(`[PhoneScanService] executeScan error: ${err.message}`);
            db.updatePhoneScanItemStatus({
                itemId,
                status: 'error',
                scannedByAccountId: zaloId,
                errorMsg: err.message
            });
            EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
        }
    }
}

export default PhoneScanService;
