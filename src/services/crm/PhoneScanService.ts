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
        try {
            const db = DatabaseService.getInstance();
            if (db && db.getIsInitialized()) {
                // Reset any items interrupted mid-scan back to pending for power-cut/restart recovery
                db.run("UPDATE phone_scan_items SET status = 'pending' WHERE status = 'scanning'");
                db.save();
            }
        } catch {}
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

    public promoteNextQueuedBatch(): boolean {
        const db = DatabaseService.getInstance();
        if (!db || !db.getIsInitialized()) return false;

        const activeBatch = db.queryOne<any>('SELECT id FROM phone_scan_batches WHERE status = "active" LIMIT 1');
        if (activeBatch) return false;

        const nextBatch = db.getNextQueuedPhoneScanBatch();
        if (nextBatch) {
            db.run('UPDATE phone_scan_batches SET status = "active", queued_at = NULL WHERE id = ?', [nextBatch.id]);
            db.save();
            Logger.log(`[PhoneScanService] 🚀 Promoted queued batch "${nextBatch.name}" (id=${nextBatch.id}) to ACTIVE`);
            EventBroadcaster.emit('crm:phoneScanUpdate', { batchId: nextBatch.id });
            return true;
        }
        return false;
    }

    public async triggerImmediateScan(): Promise<void> {
        Logger.log('[PhoneScanService] Immediate scan triggered manually.');
        await this.tick(true);
    }

    private lastAutoResumeCheckDate: string = '';

    private checkAutoResumeDailyQuota(): void {
        try {
            const db = DatabaseService.getInstance();
            if (!db || !db.getIsInitialized()) return;

            const todayStr = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD'
            if (!this.lastAutoResumeCheckDate) {
                this.lastAutoResumeCheckDate = todayStr;
                return;
            }

            if (this.lastAutoResumeCheckDate !== todayStr) {
                const pausedQuotaBatches = db.query<any>(
                    `SELECT id, name FROM phone_scan_batches WHERE status = 'paused' AND pause_reason = 'daily_quota'`
                );

                if (pausedQuotaBatches && pausedQuotaBatches.length > 0) {
                    const now = Date.now();
                    db.run(
                        `UPDATE phone_scan_batches 
                         SET status = 'queued', pause_reason = 'auto_resumed_daily', queued_at = ? 
                         WHERE status = 'paused' AND pause_reason = 'daily_quota'`,
                        [now]
                    );
                    db.save();
                    Logger.log(`[PhoneScanService] 🌅 Auto-resumed ${pausedQuotaBatches.length} batches paused by daily_quota for new day (${todayStr})`);
                    EventBroadcaster.emit('crm:phoneScanUpdate', {});
                }
                this.lastAutoResumeCheckDate = todayStr;
            }
        } catch (err: any) {
            Logger.error(`[PhoneScanService] checkAutoResumeDailyQuota error: ${err.message}`);
        }
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

            // Check & auto-resume batches paused by daily quota when date changes (after 00:00)
            this.checkAutoResumeDailyQuota();

            // 1. Find the single active batch (Strict Single Active Batch Queue)
            let activeBatch = db.queryOne<any>(`
                SELECT id, name FROM phone_scan_batches
                WHERE status = 'active'
                LIMIT 1
            `);

            if (!activeBatch) {
                // Try promoting next queued batch if no active batch currently running
                const promoted = this.promoteNextQueuedBatch();
                if (promoted) {
                    activeBatch = db.queryOne<any>(`
                        SELECT id, name FROM phone_scan_batches
                        WHERE status = 'active'
                        LIMIT 1
                    `);
                }
            }

            if (!activeBatch) {
                this.isProcessing = false;
                return;
            }

            // Fetch pending items ONLY for this active batch
            const pendingItems = db.query<any>(`
                SELECT psi.*, psb.assigned_account_id, psb.auto_tag_ids, psb.daily_limit, psb.hourly_limit
                FROM phone_scan_items psi
                INNER JOIN phone_scan_batches psb ON psi.batch_id = psb.id
                WHERE psi.status = 'pending' AND psb.status = 'active' AND psb.id = ?
                ORDER BY psi.id ASC
                LIMIT 10
            `, [activeBatch.id]);

            if (!pendingItems || pendingItems.length === 0) {
                // Check if active batch has any items currently in 'scanning'
                const scanningCount = db.queryOne<any>(`
                    SELECT COUNT(*) as sc FROM phone_scan_items
                    WHERE batch_id = ? AND status = 'scanning'
                `, [activeBatch.id])?.sc ?? 0;

                if (scanningCount === 0) {
                    // No pending and no scanning items -> mark batch completed and promote next
                    db.run('UPDATE phone_scan_batches SET status = "completed", completed_at = ? WHERE id = ?', [Date.now(), activeBatch.id]);
                    db.save();
                    EventBroadcaster.emit('crm:phoneScanUpdate', { batchId: activeBatch.id });
                    this.promoteNextQueuedBatch();
                }

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
            const accountsUsedInTick = new Set<string>();

            for (const item of pendingItems) {
                let targetZaloId: string | null = null;
                const oneHourAgo = Date.now() - 60 * 60 * 1000;
                let bestZaloId: string | null = null;
                let minHourlyCount = Infinity;

                for (const zaloId of eligibleZaloIds) {
                    if (accountsUsedInTick.has(zaloId)) continue;

                    const limits = db.getAccountScanLimits(zaloId);
                    const todayCount = db.getDailyScanCountForAccount(zaloId, startOfToday);
                    const hourlyCount = db.getHourlyScanCountForAccount(zaloId, oneHourAgo);

                    if (todayCount < limits.scanDailyLimit && hourlyCount < limits.scanHourlyLimit) {
                        if (hourlyCount < minHourlyCount) {
                            minHourlyCount = hourlyCount;
                            bestZaloId = zaloId;
                        }
                    }
                }
                targetZaloId = bestZaloId;

                if (!targetZaloId) {
                    continue;
                }

                // Check Jitter: don't request too fast on the same account
                const lastScan = this.lastScanTimePerAccount.get(targetZaloId) || 0;
                const randomDelay = 2500 + Math.random() * 3500;
                if (!isManual && Date.now() - lastScan < randomDelay) {
                    continue;
                }

                // Mark account as used in this tick for parallel multi-account batching
                accountsUsedInTick.add(targetZaloId);

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
            }
        } catch (err: any) {
            Logger.error(`[PhoneScanService] tick error: ${err.message}`);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Detect whether a Zalo API error is a -216 phone search rate limit.
     * Works for both getMultiUsersByPhones and findUser error shapes.
     */
    private isRateLimitError(err: any): boolean {
        const code = Number(err?.errorCode ?? err?.code ?? err?.error_code ?? 0);
        const msg = String(err?.message || '').toLowerCase();
        return (
            code === -216 || code === 216 || code === 50004 ||
            msg.includes('-216') || msg.includes('search limit') ||
            msg.includes('find user limit') || msg.includes('quá nhiều lần') ||
            msg.includes('quá nhiều') || msg.includes('quá hạn') ||
            msg.includes('hạn ngạch')
        );
    }

    /**
     * Handle a -216 rate limit event:
     * 1. Rollback all 'scanning' items for this account → 'pending' (prevent stuck items)
     * 2. Pause the batch
     * 3. Smart Adaptive Quota: classify hourly vs daily vs unknown, reduce only what's needed
     */
    private async handleRateLimit(zaloId: string, batchId: number, triggerItemId: number | null): Promise<void> {
        const db = DatabaseService.getInstance();
        try {
            // 1. Rollback all in-flight 'scanning' items → 'pending' so other accounts can pick them up
            db.run(`
                UPDATE phone_scan_items
                SET status = 'pending', scanned_by_account_id = NULL, scanned_at = NULL
                WHERE scanned_by_account_id = ? AND status = 'scanning'
            `, [zaloId]);

            // 2. Mark trigger item as error if not already marked by caller
            if (triggerItemId !== null) {
                db.updatePhoneScanItemStatus({
                    itemId: triggerItemId,
                    status: 'error',
                    scannedByAccountId: zaloId,
                    errorMsg: 'Tài khoản Zalo đã đạt giới hạn quét SĐT (Mã -216). Vui lòng chờ reset giờ/ngày hoặc đổi nick'
                });
            }

            // 3. Pause the batch
            Logger.warn(`[PhoneScanService] 🛑 Rate limit -216 for account ${zaloId}. Pausing batch ${batchId}, rolling back scanning items.`);
            db.updatePhoneScanBatchStatus(batchId, 'paused', 'daily_quota');

            // 4. Smart Adaptive Quota: classify and reduce limits
            const currentLimits = db.getAccountScanLimits(zaloId);
            const dailyCompleted = db.getTodayScannedCountForAccount(zaloId);       // counts 'found' since 00:00
            const hourlyCompleted = db.getHourlyScannedFoundCountForAccount(zaloId); // counts completed in last hour

            const isHourlyExceeded = hourlyCompleted >= currentLimits.scanHourlyLimit;
            const isDailyExceeded = dailyCompleted >= currentLimits.scanDailyLimit;

            let newDailyLimit = currentLimits.scanDailyLimit;
            let newHourlyLimit = currentLimits.scanHourlyLimit;

            if (isHourlyExceeded && !isDailyExceeded) {
                // Clearly hourly limit: only reduce hourly, preserve daily
                newHourlyLimit = Math.max(3, hourlyCompleted);
                Logger.warn(`[PhoneScanService] 📉 Smart Adaptive Quota [HOURLY]: ${zaloId} hourly ${currentLimits.scanHourlyLimit}→${newHourlyLimit} (daily unchanged)`);
            } else if (isDailyExceeded && !isHourlyExceeded) {
                // Clearly daily limit: only reduce daily, preserve hourly
                newDailyLimit = Math.max(5, dailyCompleted);
                Logger.warn(`[PhoneScanService] 📉 Smart Adaptive Quota [DAILY]: ${zaloId} daily ${currentLimits.scanDailyLimit}→${newDailyLimit} (hourly unchanged)`);
            } else {
                // Both exceeded or unknown: Zalo's real limit is lower than configured — reduce both
                newDailyLimit = Math.max(5, dailyCompleted);
                newHourlyLimit = Math.max(3, hourlyCompleted);
                Logger.warn(`[PhoneScanService] 📉 Smart Adaptive Quota [BOTH]: ${zaloId} daily ${currentLimits.scanDailyLimit}→${newDailyLimit}, hourly ${currentLimits.scanHourlyLimit}→${newHourlyLimit}`);
            }

            const dailyChanged = newDailyLimit < currentLimits.scanDailyLimit;
            const hourlyChanged = newHourlyLimit < currentLimits.scanHourlyLimit;
            if (dailyChanged || hourlyChanged) {
                db.setAccountScanLimits(zaloId, newDailyLimit, newHourlyLimit);
                EventBroadcaster.emit('crm:accountQuotaUpdate', { zaloId, newDailyLimit, newHourlyLimit });
            }

            db.save();
        } catch (err: any) {
            Logger.error(`[PhoneScanService] handleRateLimit error: ${err.message}`);
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

            let zaloUser: { uid: string; name: string; avatar: string; gender?: number | null } | null = null;

            // Helper to extract user profile from various zca-js response structures
            const extractZaloUser = (raw: any): { uid: string; name: string; avatar: string; gender?: number | null } | null => {
                if (!raw) return null;
                const u = raw.data ?? raw.response ?? raw;
                if (!u) return null;
                const uid = String(u.uid || u.userId || u.uId || u.id || '');
                if (!uid || uid === '0' || uid === 'undefined' || uid === 'null') return null;
                const name = u.displayName || u.display_name || u.zaloName || u.zalo_name || u.name || u.dpName || phone;
                const avatar = u.avatar || u.avatarUrl || u.avatar_url || '';
                let gender: number | null = null;
                const gVal = u.gender ?? u.sd?.gender ?? u.sex;
                if (gVal === 0 || gVal === '0' || gVal === 'male' || gVal === 'Male') gender = 0;
                else if (gVal === 1 || gVal === '1' || gVal === 'female' || gVal === 'Female') gender = 1;
                return { uid, name, avatar, gender };
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
                // Detect -216 early — don't waste a second findUser call when account is already blocked
                if (this.isRateLimitError(err)) {
                    Logger.warn(`[PhoneScanService] 🛑 Rate limit -216 on getMultiUsersByPhones for ${phoneNormalized}. Stopping early.`);
                    await this.handleRateLimit(zaloId, batchId, itemId);
                    EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
                    return;
                }
                Logger.warn(`[PhoneScanService] getMultiUsersByPhones failed for ${phoneNormalized}: ${err.message}. Trying findUser fallback...`);
            }

            // 2. Fallback to findUser if bulk lookup did not find the user
            if (!zaloUser) {
                try {
                    const findRes: any = await zaloService.findUser(phoneNormalized);
                    zaloUser = extractZaloUser(findRes);
                } catch (err: any) {
                    const isRateLimit = this.isRateLimitError(err);
                    const errorMsg = isRateLimit
                        ? 'Tài khoản Zalo hiện tại đã đạt giới hạn quét SĐT (Mã -216). Vui lòng chờ reset giờ/ngày hoặc đổi nick'
                        : (err.message || 'Lookup failed');

                    Logger.error(`[PhoneScanService] findUser failed for ${phoneNormalized}: ${errorMsg}`);
                    db.updatePhoneScanItemStatus({
                        itemId,
                        status: 'error',
                        scannedByAccountId: zaloId,
                        errorMsg
                    });
                    if (isRateLimit) {
                        // triggerItemId=null: item already marked as error above
                        await this.handleRateLimit(zaloId, batchId, null);
                    }
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
                const batchInfo = db.queryOne<any>('SELECT name, update_zalo_alias, auto_workflow_id, contact_assignment_mode, assigned_account_id, target_account_id FROM phone_scan_batches WHERE id = ?', [batchId]);
                const assignmentMode = batchInfo?.contact_assignment_mode || (batchInfo?.assigned_account_id ? 'single' : 'distributed');
                
                let targetAccountIds: string[] = [];
                if (assignmentMode === 'single') {
                    const targetId = batchInfo?.target_account_id || batchInfo?.assigned_account_id || zaloId;
                    if (targetId) targetAccountIds = [targetId];
                } else if (assignmentMode === 'all_accounts') {
                    const activeAccounts = db.getAccounts() || [];
                    const activeZaloAccounts = activeAccounts.filter((a: any) => a.is_active !== 0 && (!a.channel || a.channel === 'zalo'));
                    targetAccountIds = activeZaloAccounts.map((a: any) => String(a.zalo_id));
                    if (targetAccountIds.length === 0) targetAccountIds = [zaloId];
                } else {
                    targetAccountIds = [zaloId];
                }

                // Fetch real_name from phone_scan_items if available
                const itemData = db.queryOne<any>('SELECT real_name FROM phone_scan_items WHERE id = ?', [itemId]);
                const realNameFromFile = itemData?.real_name || null;

                // Create/update CRM contact across target account(s)
                for (const accId of targetAccountIds) {
                    db.updateContactProfile(accId, uid, name, avatar, phoneNormalized, 'user', zaloUser?.gender, null, realNameFromFile);
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
                            EventBroadcaster.emit('db:localLabelThreadChanged', {
                                action: 'assign',
                                ownerZaloId: accId,
                                labelId: tagId,
                                threadId: uid
                            });
                        } catch (err: any) {
                            Logger.error(`[PhoneScanService] Failed to assign tag ${tagId} to contact ${uid} for account ${accId}: ${err.message}`);
                        }
                    }
                    if (tagIds.length > 0) {
                        EventBroadcaster.emit('db:localLabelChanged', { zaloId: accId });
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
