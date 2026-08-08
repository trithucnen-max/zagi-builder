import DatabaseService from '../database/DatabaseService';
import ConnectionManager from '../../utils/ConnectionManager';
import ZaloService from '../zalo/ZaloService';
import AppModeManager from '../../utils/AppModeManager';
import Logger from '../../utils/Logger';
import EventBroadcaster from '../event/EventBroadcaster';
import { splitRealName } from './import/nameSplitter';

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

    private checkAutoResumeQuotas(): void {
        try {
            const db = DatabaseService.getInstance();
            if (!db || !db.getIsInitialized()) return;

            const now = Date.now();

            // 1. Check auto-resume HOURLY quota (after 60 minutes)
            const pausedHourlyBatches = db.query<any>(
                `SELECT id, name FROM phone_scan_batches 
                 WHERE status = 'paused' AND pause_reason = 'hourly_quota' 
                   AND (paused_until IS NULL OR paused_until <= ?)`
            , [now]);

            if (pausedHourlyBatches && pausedHourlyBatches.length > 0) {
                db.run(
                    `UPDATE phone_scan_batches 
                     SET status = 'queued', pause_reason = 'auto_resumed_hourly', queued_at = ?, paused_until = NULL 
                     WHERE status = 'paused' AND pause_reason = 'hourly_quota' 
                       AND (paused_until IS NULL OR paused_until <= ?)`,
                    [now, now]
                );
                db.save();
                Logger.log(`[PhoneScanService] ⏱️ Auto-resumed ${pausedHourlyBatches.length} batches paused by hourly_quota (60 min elapsed)`);
                EventBroadcaster.emit('crm:phoneScanUpdate', {});
            }

            // 2. Check auto-resume DAILY quota when date changes (after 00:00)
            const todayStr = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD'
            if (!this.lastAutoResumeCheckDate) {
                this.lastAutoResumeCheckDate = todayStr;
                return;
            }

            if (this.lastAutoResumeCheckDate !== todayStr) {
                const pausedQuotaBatches = db.query<any>(
                    `SELECT id, name FROM phone_scan_batches WHERE status = 'paused' AND (pause_reason = 'daily_quota' OR pause_reason = 'hourly_quota')`
                );

                if (pausedQuotaBatches && pausedQuotaBatches.length > 0) {
                    db.run(
                        `UPDATE phone_scan_batches 
                         SET status = 'queued', pause_reason = 'auto_resumed_daily', queued_at = ?, paused_until = NULL 
                         WHERE status = 'paused' AND (pause_reason = 'daily_quota' OR pause_reason = 'hourly_quota')`,
                        [now]
                    );
                    db.save();
                    Logger.log(`[PhoneScanService] 🌅 Auto-resumed ${pausedQuotaBatches.length} batches paused by quota for new day (${todayStr})`);
                    EventBroadcaster.emit('crm:phoneScanUpdate', {});
                }
                this.lastAutoResumeCheckDate = todayStr;
            }
        } catch (err: any) {
            Logger.error(`[PhoneScanService] checkAutoResumeQuotas error: ${err.message}`);
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

            // Check & auto-resume batches paused by quota when hourly/daily limit resets
            this.checkAutoResumeQuotas();

            // 1. Find the single active batch (Strict Single Active Batch Queue)
            let activeBatch = db.queryOne<any>(`
                SELECT * FROM phone_scan_batches
                WHERE status = 'active'
                LIMIT 1
            `);

            if (!activeBatch) {
                // Try promoting next queued batch if no active batch currently running
                const promoted = this.promoteNextQueuedBatch();
                if (promoted) {
                    activeBatch = db.queryOne<any>(`
                        SELECT * FROM phone_scan_batches
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
            // Fetch pending items ONLY for this active batch (up to 500)
            const pendingItems = db.query<any>(`
                SELECT psi.*, psb.assigned_account_id, psb.auto_tag_ids, psb.daily_limit, psb.hourly_limit
                FROM phone_scan_items psi
                INNER JOIN phone_scan_batches psb ON psi.batch_id = psb.id
                WHERE psi.status = 'pending' AND psb.status = 'active' AND psb.id = ?
                ORDER BY psi.id ASC
                LIMIT 500
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

            // Filter and extract weights from assigned_account_id (format: "zaloId1:50,zaloId2:30,zaloId3:20" or "zaloId1,zaloId2")
            const weightMap = new Map<string, number>();
            if (activeBatch.assigned_account_id) {
                const assignedParts = String(activeBatch.assigned_account_id).split(',').map(s => s.trim()).filter(Boolean);
                const assignedList: string[] = [];
                for (const part of assignedParts) {
                    const [id, wStr] = part.split(':');
                    const cleanId = id.trim();
                    if (cleanId) {
                        assignedList.push(cleanId);
                        const weight = wStr ? parseFloat(wStr) : 0;
                        if (weight > 0) weightMap.set(cleanId, weight);
                    }
                }
                if (assignedList.length > 0) {
                    allowedZaloIds = allowedZaloIds.filter(id => assignedList.includes(id));
                }
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

            // Query batch scan counts per account so far for weighted ratio distribution
            const batchCounts: Record<string, number> = {};
            try {
                const rows = db.query<any>('SELECT scanned_by_account_id, COUNT(*) as cnt FROM phone_scan_items WHERE batch_id = ? AND scanned_by_account_id IS NOT NULL GROUP BY scanned_by_account_id', [activeBatch.id]);
                for (const r of rows) {
                    if (r.scanned_by_account_id) batchCounts[r.scanned_by_account_id] = Number(r.cnt) || 0;
                }
            } catch {}
            const totalBatchProcessed = Object.values(batchCounts).reduce((a, b) => a + b, 0);
            const totalAssignedWeight = Array.from(weightMap.values()).reduce((a, b) => a + b, 0) || (eligibleZaloIds.length * (100 / (eligibleZaloIds.length || 1)));

            let remainingPendingItems = [...pendingItems];

            while (remainingPendingItems.length > 0) {
                let targetZaloId: string | null = null;
                const oneHourAgo = Date.now() - 60 * 60 * 1000;
                let bestZaloId: string | null = null;
                let highestScore = -Infinity;
                let maxAvailableQuota = 0;

                for (const zaloId of eligibleZaloIds) {
                    if (accountsUsedInTick.has(zaloId)) continue;

                    const pauseState = db.getAccountScanPauseState(zaloId);
                    if (pauseState.pausedUntil && pauseState.pausedUntil > Date.now()) continue;

                    const limits = db.getAccountScanLimits(zaloId);
                    const todayCount = db.getDailyScanCountForAccount(zaloId, startOfToday);
                    const hourlyCount = db.getHourlyScanCountForAccount(zaloId, oneHourAgo);

                    const availableDaily = limits.scanDailyLimit - todayCount;
                    const availableHourly = limits.scanHourlyLimit - hourlyCount;
                    const availableQuota = Math.min(availableDaily, availableHourly);

                    if (availableQuota > 0) {
                        // Weighted ratio scoring
                        const targetWeight = weightMap.get(zaloId) ?? (100 / (eligibleZaloIds.length || 1));
                        const targetShare = targetWeight / (totalAssignedWeight || 1);
                        const actualShare = totalBatchProcessed > 0 ? ((batchCounts[zaloId] || 0) / totalBatchProcessed) : 0;
                        const deficit = targetShare - actualShare;
                        const score = deficit * 1000 - hourlyCount;

                        if (score > highestScore) {
                            highestScore = score;
                            bestZaloId = zaloId;
                            maxAvailableQuota = availableQuota;
                        }
                    }
                }

                targetZaloId = bestZaloId;
                if (!targetZaloId) {
                    break; // No more eligible accounts with quota available in this tick
                }

                // Check Jitter between requests on the same account
                const lastScan = this.lastScanTimePerAccount.get(targetZaloId) || 0;
                const randomDelay = 2500 + Math.random() * 3500;
                if (!isManual && Date.now() - lastScan < randomDelay) {
                    accountsUsedInTick.add(targetZaloId); // skip trying this account again in current tick
                    continue;
                }

                // Điều chỉnh gom ngẫu nhiên 6 - 10 SĐT vào 1 request (Phù hợp chuẩn định mức Zalo: 30 số/giờ, 100-200 số/ngày)
                const randomChunkSize = Math.floor(Math.random() * (10 - 6 + 1)) + 6; // random integer between 6 and 10
                const actualChunkSize = Math.min(randomChunkSize, maxAvailableQuota, remainingPendingItems.length);

                if (actualChunkSize <= 0) {
                    accountsUsedInTick.add(targetZaloId);
                    continue;
                }

                // Slice chunk items for this request
                const chunkItems = remainingPendingItems.slice(0, actualChunkSize);
                remainingPendingItems = remainingPendingItems.slice(actualChunkSize);

                // Mark account as used in this tick
                accountsUsedInTick.add(targetZaloId);

                // Lock chunk items status to 'scanning'
                for (const item of chunkItems) {
                    db.updatePhoneScanItemStatus({
                        itemId: item.id,
                        status: 'scanning',
                        scannedByAccountId: targetZaloId
                    });
                }
                EventBroadcaster.emit('crm:phoneScanUpdate', { batchId: activeBatch.id });

                // Update last scan time
                this.lastScanTimePerAccount.set(targetZaloId, Date.now());

                // Execute bulk scan in background
                this.executeBulkScan(chunkItems, activeBatch.id, targetZaloId)
                    .catch(err => {
                        Logger.error(`[PhoneScanService] Bulk scan execution error for batch ${activeBatch.id}: ${err.message}`);
                    });
            }
        } catch (err: any) {
            Logger.error(`[PhoneScanService] tick error: ${err.message}`);
        } finally {
            this.isProcessing = false;
        }
    }

    private consecutive50004Count: Map<string, number> = new Map();

    /**
     * Detect whether a Zalo API error is code 50004 (rate limit warning: scan too fast).
     */
    private isWarningTooFastError(err: any): boolean {
        const code = Number(err?.errorCode ?? err?.code ?? err?.error_code ?? 0);
        const msg = String(err?.message || '').toLowerCase();
        return code === 50004 || msg.includes('50004') || msg.includes('quá nhanh');
    }

    /**
     * Handle a code 50004 rate limit warning:
     * Put account on a 3-minute cool-down, rollback in-flight item to pending, and failover to other accounts.
     */
    private async handleScanWarningRateLimit(zaloId: string, batchId: number, itemId: number | null): Promise<void> {
        const db = DatabaseService.getInstance();
        try {
            const count = (this.consecutive50004Count.get(zaloId) || 0) + 1;
            this.consecutive50004Count.set(zaloId, count);

            if (count >= 3) {
                Logger.warn(`[PhoneScanService] ⚠️ 3 consecutive 50004 warnings on account ${zaloId}. Escalating to rate limit pause to protect account.`);
                this.consecutive50004Count.delete(zaloId);
                await this.handleRateLimit(zaloId, batchId, itemId);
                return;
            }

            const pausedUntil = Date.now() + 3 * 60 * 1000; // 3-minute cool-down
            Logger.warn(`[PhoneScanService] ⚠️ Code 50004 (quét quá nhanh) on account ${zaloId}. Cooling down for 3 min until ${new Date(pausedUntil).toLocaleTimeString()}. Failover to other active accounts.`);

            if (itemId !== null) {
                db.run(`UPDATE phone_scan_items SET status = 'pending', scanned_by_account_id = NULL, scanned_at = NULL WHERE id = ?`, [itemId]);
            }
            db.setAccountScanPauseState(zaloId, 'hourly_quota', pausedUntil);
            db.save();
            EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
        } catch (err: any) {
            Logger.error(`[PhoneScanService] handleScanWarningRateLimit error: ${err.message}`);
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

            // 3. Smart Adaptive Quota: classify and reduce limits
            const currentLimits = db.getAccountScanLimits(zaloId);
            const dailyCompleted = db.getTodayScannedCountForAccount(zaloId);       // counts 'found' since 00:00
            const hourlyCompleted = db.getHourlyScannedFoundCountForAccount(zaloId); // counts completed in last hour

            const isHourlyExceeded = hourlyCompleted >= currentLimits.scanHourlyLimit;
            const isDailyExceeded = dailyCompleted >= currentLimits.scanDailyLimit;

            let newDailyLimit = currentLimits.scanDailyLimit;
            let newHourlyLimit = currentLimits.scanHourlyLimit;

            let pauseReason: 'hourly_quota' | 'daily_quota' = 'daily_quota';
            let pausedUntil: number = new Date().setHours(23, 59, 59, 999) + 1; // Default midnight tonight

            if (isHourlyExceeded && !isDailyExceeded) {
                // Clearly hourly limit: only reduce hourly, preserve daily
                newHourlyLimit = Math.max(3, hourlyCompleted);
                pauseReason = 'hourly_quota';
                pausedUntil = Date.now() + 60 * 60 * 1000; // 60 minutes from now
                Logger.warn(`[PhoneScanService] 📉 Smart Adaptive Quota [HOURLY]: ${zaloId} hourly ${currentLimits.scanHourlyLimit}→${newHourlyLimit} (daily unchanged). Paused until ${new Date(pausedUntil).toLocaleTimeString()}`);
            } else if (isDailyExceeded && !isHourlyExceeded) {
                // Clearly daily limit: only reduce daily, preserve hourly
                newDailyLimit = Math.max(5, dailyCompleted);
                pauseReason = 'daily_quota';
                pausedUntil = new Date().setHours(23, 59, 59, 999) + 1;
                Logger.warn(`[PhoneScanService] 📉 Smart Adaptive Quota [DAILY]: ${zaloId} daily ${currentLimits.scanDailyLimit}→${newDailyLimit} (hourly unchanged). Paused until 00:00`);
            } else {
                // Both exceeded or unknown: Zalo's real limit is lower than configured — reduce both
                newDailyLimit = Math.max(5, dailyCompleted);
                newHourlyLimit = Math.max(3, hourlyCompleted);
                pauseReason = 'daily_quota';
                pausedUntil = new Date().setHours(23, 59, 59, 999) + 1;
                Logger.warn(`[PhoneScanService] 📉 Smart Adaptive Quota [BOTH]: ${zaloId} daily ${currentLimits.scanDailyLimit}→${newDailyLimit}, hourly ${currentLimits.scanHourlyLimit}→${newHourlyLimit}`);
            }

            // 4. Record pause state for this specific account
            db.setAccountScanPauseState(zaloId, pauseReason, pausedUntil);

            // Check if there are remaining connected eligible Zalo accounts with available quota
            const activeAccounts = (db.getAccounts() || []).filter((a: any) => a.is_active !== 0 && (!a.channel || a.channel === 'zalo'));
            const onlineConnections = ConnectionManager.getAllConnections();
            const nowMs = Date.now();
            const startOfToday = new Date().setHours(0,0,0,0);
            const oneHourAgo = nowMs - 3600000;

            const remainingEligibleAccounts = activeAccounts.filter((a: any) => {
                const id = String(a.zalo_id);
                if (id === zaloId) return false;
                const conn = onlineConnections.get(id);
                if (!conn || !conn.connected) return false;

                const pauseState = db.getAccountScanPauseState(id);
                if (pauseState.pausedUntil && pauseState.pausedUntil > nowMs) return false;

                const limits = db.getAccountScanLimits(id);
                const todayCount = db.getDailyScanCountForAccount(id, startOfToday);
                const hourlyCount = db.getHourlyScanCountForAccount(id, oneHourAgo);
                return todayCount < limits.scanDailyLimit && hourlyCount < limits.scanHourlyLimit;
            });

            if (remainingEligibleAccounts.length > 0) {
                Logger.warn(`[PhoneScanService] ⚡ Rate limit -216 for account ${zaloId}. Paused account ${zaloId} until ${new Date(pausedUntil).toLocaleTimeString()}. Failover: ${remainingEligibleAccounts.length} other accounts available, batch ${batchId} stays ACTIVE.`);
                // Notify UI of update without pausing batch
                EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
            } else {
                // Pause the batch only when NO active accounts remain
                Logger.warn(`[PhoneScanService] 🛑 Rate limit -216 for account ${zaloId}. All accounts depleted. Pausing batch ${batchId} (Reason: ${pauseReason}), rolling back scanning items.`);
                db.updatePhoneScanBatchStatus(batchId, 'paused', pauseReason, pausedUntil);
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

    /**
     * Execute bulk scan for a chunk of 70-95 phone numbers in 1 single getMultiUsersByPhones API request
     */
    private async executeBulkScan(
        chunkItems: any[],
        batchId: number,
        zaloId: string
    ): Promise<void> {
        const db = DatabaseService.getInstance();
        try {
            const conn = ConnectionManager.getConnection(zaloId);
            if (!conn) {
                for (const item of chunkItems) {
                    db.updatePhoneScanItemStatus({
                        itemId: item.id,
                        status: 'error',
                        scannedByAccountId: zaloId,
                        errorMsg: 'Zalo account disconnected'
                    });
                }
                EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
                return;
            }

            const zaloService = await ZaloService.getInstance(conn.auth);

            // Extract phone list for bulk lookup
            const phones = chunkItems.map(item => item.phone_normalized || item.phone);

            // Helper to extract user profile
            const extractZaloUser = (raw: any, phoneFallback: string): { uid: string; name: string; avatar: string; gender?: number | null } | null => {
                if (!raw) return null;
                const u = raw.data ?? raw.response ?? raw;
                if (!u) return null;
                const uid = String(u.uid || u.userId || u.uId || u.id || '');
                if (!uid || uid === '0' || uid === 'undefined' || uid === 'null') return null;
                const name = u.displayName || u.display_name || u.zaloName || u.zalo_name || u.name || u.dpName || phoneFallback;
                const avatar = u.avatar || u.avatarUrl || u.avatar_url || '';
                let gender: number | null = null;
                const gVal = u.gender ?? u.sd?.gender ?? u.sex;
                if (gVal === 0 || gVal === '0' || gVal === 'male' || gVal === 'Male') gender = 0;
                else if (gVal === 1 || gVal === '1' || gVal === 'female' || gVal === 'Female') gender = 1;
                return { uid, name, avatar, gender };
            };

            let mapObj: Record<string, any> = {};

            try {
                Logger.log(`[PhoneScanService] 🚀 Executing bulk lookup for ${phones.length} phones (Random Chunk 70-95) using account ${zaloId}...`);
                const res: any = await zaloService.getMultiUsersByPhones(phones);
                const rawResult = res?.data ?? res?.response ?? res;
                if (rawResult && typeof rawResult === 'object') {
                    mapObj = rawResult;
                }
            } catch (err: any) {
                if (this.isWarningTooFastError(err)) {
                    await this.handleScanWarningRateLimit(zaloId, batchId, chunkItems[0]?.id || null);
                    return;
                }
                if (this.isRateLimitError(err)) {
                    Logger.warn(`[PhoneScanService] 🛑 Rate limit -216 on getMultiUsersByPhones bulk lookup. Pausing account ${zaloId}.`);
                    await this.handleRateLimit(zaloId, batchId, chunkItems[0]?.id || null);
                    EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
                    return;
                }
                Logger.warn(`[PhoneScanService] Bulk getMultiUsersByPhones error: ${err.message}.`);
            }

            // Process each item in chunk
            // Always assign contact to the scanner account directly to ensure valid Zalo UID
            const targetAccountIds: string[] = [zaloId];
            const batchInfo = db.queryOne<any>('SELECT name, update_zalo_alias, auto_workflow_id FROM phone_scan_batches WHERE id = ?', [batchId]);

            for (const item of chunkItems) {
                const phoneKey = item.phone_normalized || item.phone;
                const phoneRaw = item.phone || phoneKey;

                // Match phone in mapObj
                let rawUser = mapObj[phoneKey] || mapObj[phoneRaw];
                if (!rawUser) {
                    const keyAlt1 = phoneKey.startsWith('84') ? '0' + phoneKey.slice(2) : '84' + phoneKey.replace(/^0/, '');
                    rawUser = mapObj[keyAlt1];
                }

                let zaloUser = extractZaloUser(rawUser, phoneRaw);

                if (zaloUser?.uid) {
                    const uid = zaloUser.uid;
                    const name = zaloUser.name || phoneRaw;
                    const avatar = zaloUser.avatar || '';

                    db.updatePhoneScanItemStatus({
                        itemId: item.id,
                        status: 'found',
                        scannedByAccountId: zaloId,
                        zaloUid: uid,
                        zaloName: name,
                        zaloAvatar: avatar
                    });

                    // Update CRM contact
                    const cleanNameSplit = splitRealName(name || '');
                    const realNameFromFile = item.real_name || cleanNameSplit.realName || null;
                    const fullNameRawFromFile = item.full_name_raw || (name && name !== phoneRaw && name !== phoneKey ? name : null);

                    for (const accId of targetAccountIds) {
                        db.updateContactProfile(accId, uid, name, avatar, phoneKey, 'user', zaloUser?.gender, null, realNameFromFile, fullNameRawFromFile);
                    }

                    // Alias update if enabled
                    try {
                        const shouldUpdateAlias = Boolean(batchInfo && batchInfo.update_zalo_alias != null && Number(batchInfo.update_zalo_alias) === 1);
                        if (shouldUpdateAlias && batchInfo?.name) {
                            const batchName = batchInfo.name.trim();
                            const phoneDisplay = phoneRaw;
                            const rawZaloName = (name && name !== phoneDisplay && name !== phoneKey) ? name : 'Khách';
                            const formattedAlias = `${batchName} - ${rawZaloName} - ${phoneDisplay}`;

                            for (const accId of targetAccountIds) {
                                db.setContactAlias(accId, uid, formattedAlias);
                                EventBroadcaster.emit('db:contactAliasChanged', { ownerZaloId: accId, contactId: uid, alias: formattedAlias });
                            }

                            if (zaloService && typeof (zaloService as any).changeFriendAlias === 'function') {
                                zaloService.changeFriendAlias(formattedAlias, uid).catch(() => {});
                            }
                        }
                    } catch (aliasErr: any) {}
                } else {
                    // SĐT không có Zalo
                    db.updatePhoneScanItemStatus({
                        itemId: item.id,
                        status: 'not_found',
                        scannedByAccountId: zaloId
                    });
                }
            }

            EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
        } catch (err: any) {
            Logger.error(`[PhoneScanService] executeBulkScan error: ${err.message}`);
            for (const item of chunkItems) {
                db.updatePhoneScanItemStatus({
                    itemId: item.id,
                    status: 'error',
                    scannedByAccountId: zaloId,
                    errorMsg: err.message || 'Scan error'
                });
            }
            EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
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
                if (this.isWarningTooFastError(err)) {
                    await this.handleScanWarningRateLimit(zaloId, batchId, itemId);
                    return;
                }
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
                    if (this.isWarningTooFastError(err)) {
                        await this.handleScanWarningRateLimit(zaloId, batchId, itemId);
                        return;
                    }

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

                // Always assign contact to the scanner account directly to ensure valid Zalo UID
                const targetAccountIds: string[] = [zaloId];
                const batchInfo = db.queryOne<any>('SELECT name, update_zalo_alias, auto_workflow_id FROM phone_scan_batches WHERE id = ?', [batchId]);

                // Fetch real_name & full_name_raw from phone_scan_items if available
                const itemData = db.queryOne<any>('SELECT real_name, full_name_raw FROM phone_scan_items WHERE id = ?', [itemId]);
                const cleanNameSplit = splitRealName(name || '');
                const realNameFromFile = itemData?.real_name || cleanNameSplit.realName || null;
                const fullNameRawFromFile = itemData?.full_name_raw || (name && name !== phoneNormalized && name !== phone ? name : null);

                // Create/update CRM contact across target account(s)
                for (const accId of targetAccountIds) {
                    db.updateContactProfile(accId, uid, name, avatar, phoneNormalized, 'user', zaloUser?.gender, null, realNameFromFile, fullNameRawFromFile);
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
