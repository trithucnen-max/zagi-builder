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

    /**
     * Option C — Per-account bulk mode state (PERSISTED IN DATABASE).
     * When getMultiUsersByPhones hits -216, switch account to 'single' mode in DB
     * so all subsequent scans and app restarts use findUser instead of the exhausted bulk endpoint.
     * Resets automatically after BULK_MODE_COOLDOWN_MS (60 min) or at 00:00.
     */
    private readonly BULK_MODE_COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes
    private consecutiveSingleRateLimitCount: Map<string, number> = new Map();
    private accountCooldownUntil: Map<string, number> = new Map();

    /** True if account should use findUser (single) instead of getMultiUsersByPhones */
    public isInSingleMode(zaloId: string): boolean {
        const db = DatabaseService.getInstance();
        const state = db.getAccountScanBulkMode(zaloId);
        if (!state || state.mode === 'bulk') return false;
        if (Date.now() - state.switchedAt >= this.BULK_MODE_COOLDOWN_MS) {
            // Auto-reset: 60 min has passed, restore bulk mode in DB
            db.setAccountScanBulkMode(zaloId, 'bulk');
            Logger.log(`[PhoneScanService] 🔄 Account ${zaloId} bulk quota likely reset (60 min elapsed). Restored bulk mode in DB.`);
            return false;
        }
        return true;
    }

    /** Option C — switch account to single mode after bulk -216 (saved to DB across restarts) */
    public switchToSingleMode(zaloId: string): void {
        const db = DatabaseService.getInstance();
        const existing = db.getAccountScanBulkMode(zaloId);
        if (existing?.mode === 'single' && (Date.now() - existing.switchedAt < this.BULK_MODE_COOLDOWN_MS)) {
            return; // already switched and within cooldown
        }
        db.setAccountScanBulkMode(zaloId, 'single', Date.now());
        Logger.warn(`[PhoneScanService] 🔀 Account ${zaloId} switched to PERSISTENT SINGLE mode (findUser). Saved to DB. Will restore bulk mode in 60 min.`);
    }

    /** Reset cooldown and rate limit counts for an account */
    public clearAccountCooldown(zaloId: string): void {
        this.accountCooldownUntil.delete(zaloId);
        this.consecutiveSingleRateLimitCount.delete(zaloId);
        const db = DatabaseService.getInstance();
        db.setAccountScanPauseState(zaloId, null, null);
        Logger.log(`[PhoneScanService] ⚡ Cleared cooldown & pause state for account ${zaloId}`);
    }

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

                    const cooldown = this.accountCooldownUntil.get(zaloId) || 0;
                    if (cooldown > Date.now()) continue;

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

                // Giãn cách Dàn đều 90s - 120s giữa các lần quét trên cùng 1 tài khoản (Steady Pacing Rate Limiter)
                // Giúp tài khoản quét bền bỉ 25 - 34 số/giờ xuyên suốt cả ngày, hoàn toàn biến mất khỏi hệ thống chống spam của Zalo
                const lastScan = this.lastScanTimePerAccount.get(targetZaloId) || 0;
                const steadyPacingDelay = isManual ? (2500 + Math.random() * 2500) : (90_000 + Math.random() * 30_000);
                if (Date.now() - lastScan < steadyPacingDelay) {
                    accountsUsedInTick.add(targetZaloId); // Bỏ qua nick này trong tick hiện tại cho đến khi hết 90s-120s
                    continue;
                }

                // Ở chế độ Bulk: Quét tối đa 5 số/lần request API. Ở chế độ Single (findUser): Quét 1 số/lần.
                const isSingle = this.isInSingleMode(targetZaloId);
                const maxBatchChunk = isSingle ? 1 : 5;
                const actualChunkSize = Math.min(maxBatchChunk, maxAvailableQuota, remainingPendingItems.length);

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

            // Put account on 3-minute cool-down
            const cooldownUntil = Date.now() + 3 * 60 * 1000;
            this.accountCooldownUntil.set(zaloId, cooldownUntil);
            db.setAccountScanPauseState(zaloId, 'hourly_quota', cooldownUntil);

            // Rollback in-flight item to pending
            if (itemId !== null) {
                db.run(
                    `UPDATE phone_scan_items SET status = 'pending', scanned_by_account_id = NULL, scanned_at = NULL WHERE id = ?`,
                    [itemId]
                );
            }

            Logger.warn(`[PhoneScanService] ⚡ Code 50004 (rate limit warning) for account ${zaloId}. Cooldown 3 min until ${new Date(cooldownUntil).toLocaleTimeString()}.`);
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
        if (!err) return false;
        const code = Number(err?.errorCode ?? err?.code ?? err?.error_code ?? 0);
        const msg = String(err?.message || err?.error_message || err?.error || '').toLowerCase();
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

            // 3. Classify rate limit: Hourly Window Limit (60m) vs Daily Quota (00:00)
            const currentLimits = db.getAccountScanLimits(zaloId);
            const dailyCompleted = db.getTodayScannedCountForAccount(zaloId);       // counts 'found' since 00:00
            const hourlyCompleted = db.getHourlyScannedFoundCountForAccount(zaloId); // counts completed in last hour

            // Check if account truly hit the full daily limit configured (e.g. >= 100)
            const isDailyExceeded = dailyCompleted >= currentLimits.scanDailyLimit;

            let pauseReason: 'hourly_quota' | 'daily_quota' = 'hourly_quota';
            let pausedUntil: number = Date.now() + 60 * 60 * 1000; // Default: 60 minutes cooldown for hourly rate limit

            if (isDailyExceeded) {
                // Truly reached/exceeded full daily quota (>= 100) -> Sleep until 00:00 midnight tonight
                pauseReason = 'daily_quota';
                pausedUntil = new Date().setHours(23, 59, 59, 999) + 1;
                Logger.warn(`[PhoneScanService] 🌙 Account ${zaloId} completed ${dailyCompleted}/${currentLimits.scanDailyLimit} numbers today. Pausing until midnight (00:00).`);
            } else {
                // Rate limit -216 encountered during hourly window -> Cooldown 60 minutes, KEEP daily limit intact!
                pauseReason = 'hourly_quota';
                pausedUntil = Date.now() + 60 * 60 * 1000;
                Logger.warn(`[PhoneScanService] ⏳ Account ${zaloId} hit hourly rate limit -216 (${hourlyCompleted}/hr, ${dailyCompleted}/${currentLimits.scanDailyLimit} daily). Cooldown 60 min until ${new Date(pausedUntil).toLocaleTimeString()}. Daily limit preserved at ${currentLimits.scanDailyLimit}.`);
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

            db.save();
        } catch (err: any) {
            Logger.error(`[PhoneScanService] handleRateLimit error: ${err.message}`);
        }
    }

    /**
     * Classify why a phone lookup failed or returned no user.
     * Distinguishes: 'not_registered' vs 'privacy_restricted' vs 'temp_error' vs 'rate_limit'.
     */
    private classifyPhoneLookupError(err: any): { errorMsg: string; isPrivacy: boolean; isRateLimit: boolean; isTooFast: boolean; isTemp: boolean } {
        const code = Number(err?.errorCode ?? err?.code ?? err?.error_code ?? 0);
        const msg = String(err?.message || err?.error || '').toLowerCase();

        const isRateLimit = (
            code === -216 || code === 216 ||
            msg.includes('-216') || msg.includes('216') ||
            msg.includes('search limit') || msg.includes('find user limit') ||
            msg.includes('quá số lần tìm') || msg.includes('hạn ngạch')
        );

        const isTooFast = (
            code === 50004 || msg.includes('50004') || msg.includes('quá nhanh')
        );

        const isPrivacy = (
            [201, -201, 202, -202, 204, -204, 214, 576, 579, 5001].includes(code) ||
            msg.includes('chặn') || msg.includes('riêng tư') || msg.includes('privacy') ||
            msg.includes('không cho phép') || msg.includes('tắt tìm kiếm') ||
            msg.includes('không nhận tin nhắn') || msg.includes('stranger')
        );

        const isTemp = (
            msg.includes('timeout') || msg.includes('econnreset') ||
            msg.includes('enotfound') || msg.includes('disconnected') ||
            msg.includes('socket') || msg.includes('network')
        );

        let errorMsg = 'SĐT chưa đăng ký tài khoản Zalo';
        if (isRateLimit) {
            errorMsg = 'Tài khoản Zalo đã đạt giới hạn quét SĐT trong ngày (Mã -216). Vui lòng chờ reset giờ/ngày hoặc đổi nick';
        } else if (isTooFast) {
            errorMsg = 'Tần suất tìm kiếm quá nhanh (Mã 50004). Đang tạm nghỉ để bảo vệ tài khoản';
        } else if (isPrivacy) {
            errorMsg = 'Khách hàng cài đặt quyền riêng tư (Tắt tìm kiếm qua SĐT / Chặn người lạ)';
        } else if (isTemp) {
            errorMsg = `Lỗi kết nối tạm thời (${err?.message || 'Network'}), hệ thống sẽ tự động thử lại`;
        }

        return { errorMsg, isPrivacy, isRateLimit, isTooFast, isTemp };
    }

    /**
     * Execute bulk scan for a chunk of 6-10 phone numbers in 1 single getMultiUsersByPhones API request
     */
    private async executeBulkScan(
        chunkItems: Array<{ id: number; phone: string; phone_normalized: string; real_name?: string | null; full_name_raw?: string | null }>,
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
            const phones = chunkItems.map(item => item.phone_normalized || item.phone);

            // Helper to extract user profile
            const extractZaloUser = (raw: any, phoneFallback: string = ''): { uid: string; name: string; avatar: string; gender?: number | null } | null => {
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
            let bulkHitRateLimit = false;

            // Option C: skip bulk entirely if account already in single mode
            if (this.isInSingleMode(zaloId)) {
                Logger.log(`[PhoneScanService] 🔀 Account ${zaloId} is in SINGLE mode — skipping bulk, using findUser fallback directly.`);
                bulkHitRateLimit = true;
            } else {
                try {
                    Logger.log(`[PhoneScanService] 🚀 Executing bulk lookup for ${phones.length} phones using account ${zaloId}...`);
                    const res: any = await zaloService.getMultiUsersByPhones(phones);
                    const rawResult = res?.data ?? res?.response ?? res;

                    if (this.isWarningTooFastError(res) || this.isWarningTooFastError(rawResult)) {
                        await this.handleScanWarningRateLimit(zaloId, batchId, chunkItems[0]?.id || null);
                        return;
                    }

                    if (this.isRateLimitError(res) || this.isRateLimitError(rawResult) || (res as any)?.error_code === -216) {
                        this.switchToSingleMode(zaloId);
                        Logger.warn(`[PhoneScanService] ⚠️ Bulk -216 detected in response for account ${zaloId}. Switched to SINGLE mode (findUser).`);
                        bulkHitRateLimit = true;
                    } else if (rawResult && typeof rawResult === 'object') {
                        mapObj = rawResult;
                    }
                } catch (err: any) {
                    if (this.isWarningTooFastError(err)) {
                        await this.handleScanWarningRateLimit(zaloId, batchId, chunkItems[0]?.id || null);
                        return;
                    }
                    if (this.isRateLimitError(err)) {
                        this.switchToSingleMode(zaloId);
                        Logger.warn(`[PhoneScanService] ⚠️ Bulk -216 thrown on account ${zaloId}. Switched to SINGLE mode. Retrying ${chunkItems.length} phones via findUser...`);
                        bulkHitRateLimit = true;
                    } else {
                        Logger.warn(`[PhoneScanService] Bulk getMultiUsersByPhones error: ${err.message}. Retrying via findUser fallback.`);
                        bulkHitRateLimit = true;
                    }
                }
            }

            // Process each item in chunk
            // Always assign contact to the scanner account directly to ensure valid Zalo UID
            const targetAccountIds: string[] = [zaloId];
            const batchInfo = db.queryOne<any>('SELECT name, update_zalo_alias, auto_workflow_id, auto_tag_ids FROM phone_scan_batches WHERE id = ?', [batchId]);

            for (const item of chunkItems) {
                const phoneKey = item.phone_normalized || item.phone;
                const phoneRaw = item.phone || phoneKey;

                let zaloUser: { uid: string; name: string; avatar: string; gender?: number | null } | null = null;
                let notFoundErrorMsg = 'SĐT chưa đăng ký tài khoản Zalo';

                if (bulkHitRateLimit) {
                    // Option 3: Add jitter delay between each single findUser call to prevent 50004
                    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));

                    // Option A & C — resilient single mode: try each phone individually via findUser
                    try {
                        const findRes: any = await zaloService.findUser(phoneKey);
                        if (this.isRateLimitError(findRes) || this.isRateLimitError(findRes?.data)) {
                            throw new Error('Zalo -216 rate limit on findUser response');
                        }

                        const u = findRes?.data ?? findRes?.response ?? findRes;
                        if (u) {
                            const uid = String(u.uid || u.userId || u.uId || u.id || '');
                            if (uid && uid !== '0' && uid !== 'undefined' && uid !== 'null') {
                                const name = u.displayName || u.display_name || u.zaloName || u.zalo_name || u.name || u.dpName || phoneRaw;
                                const avatar = u.avatar || u.avatarUrl || u.avatar_url || '';
                                let gender: number | null = null;
                                const gVal = u.gender ?? u.sd?.gender ?? u.sex;
                                if (gVal === 0 || gVal === '0' || gVal === 'male' || gVal === 'Male') gender = 0;
                                else if (gVal === 1 || gVal === '1' || gVal === 'female' || gVal === 'Female') gender = 1;
                                zaloUser = { uid, name, avatar, gender };
                                this.consecutiveSingleRateLimitCount.delete(zaloId);
                                Logger.log(`[PhoneScanService] ✅ findUser fallback found ${phoneRaw} → UID ${uid} (${name})`);
                            }
                        }
                    } catch (findErr: any) {
                        const classified = this.classifyPhoneLookupError(findErr);
                        notFoundErrorMsg = classified.errorMsg;

                        if (this.isWarningTooFastError(findErr)) {
                            // Too fast on findUser too — rollback item and cool-down
                            await this.handleScanWarningRateLimit(zaloId, batchId, item.id || null);
                            db.run(
                                `UPDATE phone_scan_items SET status = 'pending', scanned_by_account_id = NULL, scanned_at = NULL WHERE id = ?`,
                                [item.id]
                            );
                            continue;
                        }
                        if (classified.isRateLimit) {
                            const count = (this.consecutiveSingleRateLimitCount.get(zaloId) || 0) + 1;
                            this.consecutiveSingleRateLimitCount.set(zaloId, count);

                            if (count < 3) {
                                // Option C: Smart Cooldown (3 minutes) before next phone, rollback item to pending
                                Logger.warn(`[PhoneScanService] ⏳ findUser -216 (${count}/3) on ${phoneRaw}. Smart cooldown 3 min for account ${zaloId}...`);
                                this.accountCooldownUntil.set(zaloId, Date.now() + 180_000);
                                db.run(
                                    `UPDATE phone_scan_items SET status = 'pending', scanned_by_account_id = NULL, scanned_at = NULL WHERE id = ?`,
                                    [item.id]
                                );
                                EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
                                return;
                            } else {
                                // 3 consecutive -216 on findUser → truly exhausted daily/hourly limit
                                Logger.warn(`[PhoneScanService] 🛑 3 consecutive findUser -216 exhausted for account ${zaloId}. Pausing account.`);
                                this.consecutiveSingleRateLimitCount.delete(zaloId);
                                await this.handleRateLimit(zaloId, batchId, item.id || null);
                                EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
                                return;
                            }
                        }
                        if (classified.isTemp) {
                            // Temporary network issue — rollback to pending so it will be retried
                            Logger.warn(`[PhoneScanService] Temporary network issue for ${phoneRaw}: ${findErr.message}. Resetting to pending.`);
                            db.run(`UPDATE phone_scan_items SET status = 'pending', scanned_by_account_id = NULL, scanned_at = NULL, error_msg = ? WHERE id = ?`, [classified.errorMsg, item.id]);
                            continue;
                        }
                        Logger.warn(`[PhoneScanService] findUser fallback note for ${phoneRaw}: ${classified.errorMsg}`);
                    }
                } else {
                    // Normal path: extract result from bulk mapObj
                    let rawUser = mapObj[phoneKey] || mapObj[phoneRaw];
                    if (!rawUser) {
                        const keyAlt1 = phoneKey.startsWith('84') ? '0' + phoneKey.slice(2) : '84' + phoneKey.replace(/^0/, '');
                        rawUser = mapObj[keyAlt1];
                    }
                    zaloUser = extractZaloUser(rawUser, phoneRaw);

                    // Instant single fallback if not found in bulk
                    if (!zaloUser) {
                        try {
                            const findRes: any = await zaloService.findUser(phoneKey);
                            const u = findRes?.data ?? findRes?.response ?? findRes;
                            if (u) {
                                const uid = String(u.uid || u.userId || u.uId || u.id || '');
                                if (uid && uid !== '0' && uid !== 'undefined' && uid !== 'null') {
                                    const name = u.displayName || u.display_name || u.zaloName || u.zalo_name || u.name || u.dpName || phoneRaw;
                                    const avatar = u.avatar || u.avatarUrl || u.avatar_url || '';
                                    let gender: number | null = null;
                                    const gVal = u.gender ?? u.sd?.gender ?? u.sex;
                                    if (gVal === 0 || gVal === '0' || gVal === 'male' || gVal === 'Male') gender = 0;
                                    else if (gVal === 1 || gVal === '1' || gVal === 'female' || gVal === 'Female') gender = 1;
                                    zaloUser = { uid, name, avatar, gender };
                                    Logger.log(`[PhoneScanService] ✅ Instant findUser fallback found ${phoneRaw} → UID ${uid}`);
                                }
                            }
                        } catch {}
                    }
                }

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

                    // Auto-assign batch tags/labels to CRM contact in local_label_threads
                    try {
                        let autoTagIds: number[] = [];
                        if (batchInfo?.auto_tag_ids) {
                            const parsed = JSON.parse(batchInfo.auto_tag_ids);
                            if (Array.isArray(parsed)) autoTagIds = parsed.map(Number).filter(n => !isNaN(n) && n > 0);
                        }
                        for (const accId of targetAccountIds) {
                            for (const tagId of autoTagIds) {
                                db.assignLocalLabelToThread(accId, tagId, uid);
                                EventBroadcaster.emit('db:localLabelThreadChanged', {
                                    action: 'assign',
                                    ownerZaloId: accId,
                                    labelId: tagId,
                                    threadId: uid
                                });
                            }
                            if (autoTagIds.length > 0) {
                                EventBroadcaster.emit('db:localLabelChanged', { zaloId: accId });
                                EventBroadcaster.emit('local-labels-changed', { zaloId: accId });
                                EventBroadcaster.emit('ui:threadLabelsChanged', { zaloId: accId, threadId: uid });
                            }
                        }
                    } catch (tagErr: any) {
                        Logger.warn(`[PhoneScanService] Auto assign tags error: ${tagErr.message}`);
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
                    // SĐT không có Zalo hoặc bị chặn tìm kiếm
                    db.updatePhoneScanItemStatus({
                        itemId: item.id,
                        status: 'not_found',
                        scannedByAccountId: zaloId,
                        errorMsg: notFoundErrorMsg
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
            let notFoundErrorMsg = 'SĐT chưa đăng ký tài khoản Zalo';

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

            // 1. Try getMultiUsersByPhones bulk lookup first (skip if account already in single mode — Option C)
            if (!this.isInSingleMode(zaloId)) {
                try {
                    const res: any = await zaloService.getMultiUsersByPhones([phoneNormalized]);
                    if (this.isRateLimitError(res) || this.isRateLimitError(res?.data) || (res as any)?.error_code === -216) {
                        this.switchToSingleMode(zaloId);
                        Logger.warn(`[PhoneScanService] ⚠️ Bulk -216 in executeScan for ${phoneNormalized}. Switched to SINGLE mode.`);
                    } else {
                        const mapObj = res?.data ?? res?.response ?? res;
                        if (mapObj && typeof mapObj === 'object') {
                            for (const [, userRaw] of Object.entries(mapObj)) {
                                const parsed = extractZaloUser(userRaw);
                                if (parsed) {
                                    zaloUser = parsed;
                                    break;
                                }
                            }
                        }
                    }
                } catch (err: any) {
                    if (this.isWarningTooFastError(err)) {
                        await this.handleScanWarningRateLimit(zaloId, batchId, itemId);
                        return;
                    }
                    if (this.isRateLimitError(err)) {
                        this.switchToSingleMode(zaloId);
                        Logger.warn(`[PhoneScanService] ⚠️ Bulk -216 on executeScan for ${phoneNormalized}. Switched to SINGLE mode. Falling through to findUser...`);
                    } else {
                        Logger.warn(`[PhoneScanService] getMultiUsersByPhones failed for ${phoneNormalized}: ${err.message}. Trying findUser fallback...`);
                    }
                }
            } else {
                Logger.log(`[PhoneScanService] 🔀 Account ${zaloId} in SINGLE mode — skipping bulk for ${phoneNormalized}.`);
            }

            // 2. Fallback to findUser if bulk lookup did not find the user
            if (!zaloUser) {
                // Option 3: Jitter delay before single findUser call
                if (this.isInSingleMode(zaloId)) {
                    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
                }

                try {
                    const findRes: any = await zaloService.findUser(phoneNormalized);
                    if (this.isRateLimitError(findRes) || this.isRateLimitError(findRes?.data)) {
                        throw new Error('Zalo -216 rate limit on findUser response');
                    }
                    zaloUser = extractZaloUser(findRes);
                    if (zaloUser?.uid) {
                        this.consecutiveSingleRateLimitCount.delete(zaloId);
                    }
                } catch (err: any) {
                    const classified = this.classifyPhoneLookupError(err);
                    notFoundErrorMsg = classified.errorMsg;

                    if (this.isWarningTooFastError(err)) {
                        await this.handleScanWarningRateLimit(zaloId, batchId, itemId);
                        return;
                    }

                    if (classified.isRateLimit) {
                        const count = (this.consecutiveSingleRateLimitCount.get(zaloId) || 0) + 1;
                        this.consecutiveSingleRateLimitCount.set(zaloId, count);

                        if (count < 3) {
                            // Smart Cooldown
                            Logger.warn(`[PhoneScanService] ⏳ findUser -216 (${count}/3) for ${phoneNormalized}. Cooldown 3 min for account ${zaloId}...`);
                            this.accountCooldownUntil.set(zaloId, Date.now() + 180_000);
                            db.run(`UPDATE phone_scan_items SET status = 'pending', scanned_by_account_id = NULL, scanned_at = NULL WHERE id = ?`, [itemId]);
                            EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
                            return;
                        } else {
                            Logger.error(`[PhoneScanService] 🛑 3 consecutive findUser -216 for ${zaloId}. Pausing account.`);
                            this.consecutiveSingleRateLimitCount.delete(zaloId);
                            db.updatePhoneScanItemStatus({
                                itemId,
                                status: 'error',
                                scannedByAccountId: zaloId,
                                errorMsg: classified.errorMsg
                            });
                            await this.handleRateLimit(zaloId, batchId, null);
                            EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
                            return;
                        }
                    }

                    if (classified.isTemp) {
                        // Reset to pending on network glitch
                        db.run(`UPDATE phone_scan_items SET status = 'pending', scanned_by_account_id = NULL, scanned_at = NULL, error_msg = ? WHERE id = ?`, [classified.errorMsg, itemId]);
                        EventBroadcaster.emit('crm:phoneScanUpdate', { batchId });
                        return;
                    }

                    Logger.warn(`[PhoneScanService] findUser note for ${phoneNormalized}: ${classified.errorMsg}`);
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

                // Auto-assign batch tags/labels to CRM contact in local_label_threads
                try {
                    let autoTagIds: number[] = [];
                    if (batchInfo?.auto_tag_ids) {
                        const parsed = JSON.parse(batchInfo.auto_tag_ids);
                        if (Array.isArray(parsed)) autoTagIds = parsed.map(Number).filter(n => !isNaN(n) && n > 0);
                    }
                    for (const accId of targetAccountIds) {
                        for (const tagId of autoTagIds) {
                            db.assignLocalLabelToThread(accId, tagId, uid);
                            EventBroadcaster.emit('db:localLabelThreadChanged', {
                                action: 'assign',
                                ownerZaloId: accId,
                                labelId: tagId,
                                threadId: uid
                            });
                        }
                        if (autoTagIds.length > 0) {
                            EventBroadcaster.emit('db:localLabelChanged', { zaloId: accId });
                            EventBroadcaster.emit('local-labels-changed', { zaloId: accId });
                            EventBroadcaster.emit('ui:threadLabelsChanged', { zaloId: accId, threadId: uid });
                        }
                    }
                } catch (tagErr: any) {
                    Logger.warn(`[PhoneScanService] Auto assign tags error: ${tagErr.message}`);
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
                    scannedByAccountId: zaloId,
                    errorMsg: notFoundErrorMsg
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
