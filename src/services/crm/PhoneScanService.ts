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
            this.tick(false).catch(err => {
                Logger.error(`[PhoneScanService] Tick error: ${err.message}`);
            });
        }, 4000); // Check every 4 seconds
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
        await this.tick(true);
    }

    private async tick(isManual: boolean = false): Promise<void> {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const db = DatabaseService.getInstance();
            if (!db.getIsInitialized()) {
                this.isProcessing = false;
                return;
            }

            // 1. Find the single active batch to process (highest priority first)
            const activeBatches = db.query<any>(`
                SELECT DISTINCT psb.id, psb.scheduled_time
                FROM phone_scan_batches psb
                INNER JOIN phone_scan_items psi ON psi.batch_id = psb.id
                WHERE psb.status = 'active' AND psi.status = 'pending'
                ORDER BY psb.priority DESC, psb.sort_order ASC, psb.id ASC
                LIMIT 5
            `);

            if (!activeBatches || activeBatches.length === 0) {
                this.isProcessing = false;
                return;
            }

            // Find first batch whose scheduled_time is eligible for today
            let activeBatch: any = null;
            const nowTime = new Date();
            const currentTotalMin = nowTime.getHours() * 60 + nowTime.getMinutes();

            for (const b of activeBatches) {
                if (!isManual && b.scheduled_time && typeof b.scheduled_time === 'string' && b.scheduled_time.includes(':')) {
                    const [hStr, mStr] = b.scheduled_time.split(':');
                    const targetHour = parseInt(hStr, 10);
                    const targetMin = parseInt(mStr, 10);
                    if (!isNaN(targetHour) && !isNaN(targetMin)) {
                        const targetTotalMin = targetHour * 60 + targetMin;
                        if (currentTotalMin < targetTotalMin) {
                            // Target scheduled time for today has not arrived yet
                            continue;
                        }
                    }
                }
                activeBatch = b;
                break;
            }

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
            let onlineConnections = ConnectionManager.getAllConnections();

            // Auto-connect active Zalo accounts if no connections in memory yet
            if (onlineConnections.size === 0) {
                const activeAccounts = db.getAccounts() || [];
                const activeZalo = activeAccounts.filter((a: any) => a.is_active !== 0 && (!a.channel || a.channel === 'zalo'));
                if (activeZalo.length > 0) {
                    try {
                        const LoginService = require('../login/LoginService').default;
                        const loginService = new LoginService();
                        for (const acc of activeZalo) {
                            if (acc.cookies) {
                                Logger.log(`[PhoneScanService] Auto-connecting Zalo account ${acc.zalo_id} for scanner...`);
                                await loginService.connectUser({
                                    cookies: acc.cookies,
                                    imei: acc.imei || '',
                                    userAgent: acc.user_agent || ''
                                }).catch(() => {});
                            }
                        }
                        onlineConnections = ConnectionManager.getAllConnections();
                    } catch (err: any) {
                        Logger.warn(`[PhoneScanService] Auto-connect failed: ${err.message}`);
                    }
                }
            }

            if (onlineConnections.size === 0) {
                Logger.warn('[PhoneScanService] ⚠️ Cannot run scan: No online Zalo connections available. Please log in to a Zalo account.');
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
                allowedZaloIds = activeZaloAccounts.map((a: any) => String(a.zalo_id));
            }

            // Filter by online connections
            const eligibleZaloIds = allowedZaloIds.filter(id => {
                const conn = onlineConnections.get(id);
                return conn && conn.connected;
            });

            if (eligibleZaloIds.length === 0) {
                Logger.warn(`[PhoneScanService] ⚠️ No eligible connected Zalo accounts found among allowed: [${allowedZaloIds.join(', ')}]. Online connections: [${Array.from(onlineConnections.keys()).join(', ')}]`);
                this.isProcessing = false;
                return;
            }

            // Midnight local time today to check daily limits
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

            for (const item of pendingItems) {
                let targetZaloId: string | null = null;
                const assignedId = item.assigned_account_id;
                const dailyLimit = item.daily_limit || 100;
                const hourlyLimit = item.hourly_limit || 30;
                const oneHourAgo = Date.now() - 60 * 60 * 1000;

                if (assignedId) {
                    if (eligibleZaloIds.includes(assignedId)) {
                        const todayCount = db.getDailyScanCountForAccount(assignedId, startOfToday);
                        const hourlyCount = db.getHourlyScanCountForAccount(assignedId, oneHourAgo);
                        if (todayCount < dailyLimit && hourlyCount < hourlyLimit) {
                            targetZaloId = assignedId;
                        }
                    }
                } else {
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
                    continue;
                }

                // Check Jitter: don't request too fast on the same account
                const lastScan = this.lastScanTimePerAccount.get(targetZaloId) || 0;
                const randomDelay = 2500 + Math.random() * 3500;
                if (!isManual && Date.now() - lastScan < randomDelay) {
                    continue;
                }

                // Picked! Lock item status to scanning
                db.updatePhoneScanItemStatus({
                    itemId: item.id,
                    status: 'scanning',
                    scannedByAccountId: targetZaloId
                });
                EventBroadcaster.emit('crm:phoneScanUpdate', { batchId: item.batch_id });

                // Update last scan time
                this.lastScanTimePerAccount.set(targetZaloId, Date.now());

                // Execute scan in background
                this.executeScan(item.id, item.phone, item.phone_normalized, item.batch_id, targetZaloId, item.auto_tag_ids)
                    .catch(err => {
                        Logger.error(`[PhoneScanService] Scan execution error for item ${item.id}: ${err.message}`);
                    });

                break; // 1 item per tick per account for rate safety
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

            let zaloUser: { uid: string; name: string; avatar: string } | null = null;

            // Helper to extract user profile from various zca-js response structures
            const extractZaloUser = (raw: any): { uid: string; name: string; avatar: string } | null => {
                if (!raw) return null;
                const u = raw.data ?? raw.response ?? raw;
                if (!u) return null;
                const uid = String(u.uid || u.userId || u.uId || u.id || '');
                if (!uid || uid === '0' || uid === 'undefined' || uid === 'null') return null;
                const name = u.displayName || u.display_name || u.zaloName || u.zalo_name || u.name || u.dpName || phone;
                const avatar = u.avatar || u.avatarUrl || u.avatar_url || '';
                return { uid, name, avatar };
            };

            // 1. Try getMultiUsersByPhones bulk lookup first
            try {
                const res: any = await zaloService.getMultiUsersByPhones([phoneNormalized]);
                const mapObj = res?.data ?? res?.response ?? res;
                if (mapObj && typeof mapObj === 'object') {
                    for (const [phoneKey, userRaw] of Object.entries(mapObj)) {
                        const parsed = extractZaloUser(userRaw);
                        if (parsed) {
                            zaloUser = parsed;
                            break;
                        }
                    }
                }
            } catch (err: any) {
                Logger.warn(`[PhoneScanService] getMultiUsersByPhones failed for ${phoneNormalized}: ${err.message}. Trying findUser fallback...`);
            }

            // 2. Fallback to findUser if bulk lookup did not find the user
            if (!zaloUser) {
                try {
                    const findRes: any = await zaloService.findUser(phoneNormalized);
                    zaloUser = extractZaloUser(findRes);
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
                const uid = zaloUser.uid;
                const name = zaloUser.name || phone;
                const avatar = zaloUser.avatar || '';

                db.updatePhoneScanItemStatus({
                    itemId,
                    status: 'found',
                    scannedByAccountId: zaloId,
                    zaloUid: uid,
                    zaloName: name,
                    zaloAvatar: avatar
                });

                // Resolve target accounts based on batch assignment mode
                const batchInfo = db.queryOne<any>('SELECT name, update_zalo_alias, auto_workflow_id, contact_assignment_mode, assigned_account_id FROM phone_scan_batches WHERE id = ?', [batchId]);
                const assignmentMode = batchInfo?.contact_assignment_mode || (batchInfo?.assigned_account_id ? 'single' : 'distributed');
                
                let targetAccountIds: string[] = [];
                if (assignmentMode === 'single') {
                    const targetId = batchInfo?.assigned_account_id || zaloId;
                    if (targetId) targetAccountIds = [targetId];
                } else if (assignmentMode === 'all_accounts') {
                    const activeAccounts = db.getAccounts() || [];
                    const activeZaloAccounts = activeAccounts.filter((a: any) => a.is_active !== 0 && (!a.channel || a.channel === 'zalo'));
                    targetAccountIds = activeZaloAccounts.map((a: any) => String(a.zalo_id));
                    if (targetAccountIds.length === 0) targetAccountIds = [zaloId];
                } else {
                    targetAccountIds = [zaloId];
                }

                // Create/update CRM contact across target account(s)
                for (const accId of targetAccountIds) {
                    db.updateContactProfile(accId, uid, name, avatar, phoneNormalized, 'user');
                }

                // Update Zalo & CRM Alias based on Campaign/Batch rule if explicitly enabled (update_zalo_alias === 1)
                try {
                    const shouldUpdateAlias = Boolean(batchInfo && batchInfo.update_zalo_alias != null && Number(batchInfo.update_zalo_alias) === 1);
                    if (shouldUpdateAlias && batchInfo?.name) {
                        const batchName = batchInfo.name.trim();
                        const phoneDisplay = phone || phoneNormalized;
                        const rawZaloName = (name && name !== phoneDisplay && name !== phoneNormalized) ? name : 'Khách';
                        const formattedAlias = `${batchName} - ${rawZaloName} - ${phoneDisplay}`;

                        for (const accId of targetAccountIds) {
                            // 1. Update in local CRM DB
                            db.setContactAlias(accId, uid, formattedAlias);
                            EventBroadcaster.emit('db:contactAliasChanged', { ownerZaloId: accId, contactId: uid, alias: formattedAlias });
                        }

                        // 2. Sync to Zalo server (mobile/PC app) for the scanner account
                        if (zaloService && typeof (zaloService as any).changeFriendAlias === 'function') {
                            zaloService.changeFriendAlias(formattedAlias, uid)
                                .then((res: any) => {
                                    if (res && (res.error_code === 0 || res.error_code === '0' || res.status === 0)) {
                                        Logger.log(`[PhoneScanService] ✅ Updated Zalo alias for ${uid} to "${formattedAlias}"`);
                                    } else {
                                        Logger.warn(`[PhoneScanService] ⚠️ Zalo server alias note for ${uid} (Code ${res?.error_code || res?.error}): ${res?.message || res?.error_message || 'Zalo API requires friend relationship to change alias on Zalo mobile/PC app'}`);
                                    }
                                })
                                .catch(aliasErr => {
                                    Logger.warn(`[PhoneScanService] ⚠️ Sync Zalo alias error for ${uid}: ${aliasErr.message}`);
                                });
                        }
                    }
                } catch (aliasErr: any) {
                    Logger.error(`[PhoneScanService] Alias update error: ${aliasErr.message}`);
                }

                // Auto-tagging across target account(s)
                let tagIds: number[] = [];
                try {
                    tagIds = JSON.parse(autoTagIdsStr || '[]');
                } catch {}

                for (const accId of targetAccountIds) {
                    for (const tagId of tagIds) {
                        try {
                            db.assignLocalLabelToThread(accId, tagId, uid);
                        } catch (err: any) {
                            Logger.error(`[PhoneScanService] Failed to assign tag ${tagId} to contact ${uid} for account ${accId}: ${err.message}`);
                        }
                    }
                    if (tagIds.length > 0) {
                        EventBroadcaster.emit('local-labels-changed', { zaloId: accId });
                    }
                }

                // Auto-trigger workflow if configured on batch
                try {
                    const batchInfo = db.queryOne<any>('SELECT auto_workflow_id FROM phone_scan_batches WHERE id = ?', [batchId]);
                    if (batchInfo?.auto_workflow_id) {
                        const WorkflowEngineService = require('../workflow/WorkflowEngineService').default;
                        WorkflowEngineService.getInstance().triggerWorkflowByPhoneScan({
                            workflowId: String(batchInfo.auto_workflow_id),
                            zaloId,
                            phone: phoneNormalized,
                            zaloUid: uid,
                            zaloName: name
                        });
                    }
                } catch (wfErr: any) {
                    Logger.warn(`[PhoneScanService] Auto-workflow trigger error: ${wfErr.message}`);
                }
            } else {
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
