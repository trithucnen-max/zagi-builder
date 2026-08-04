/**
 * @file phoneScanQuota.test.ts
 * @description Unit tests for Phone Scan Quota Race Condition & Smart Adaptive Quota Classification Logic
 */

interface MockItem {
    id: number;
    batch_id: number;
    phone: string;
    status: 'pending' | 'scanning' | 'found' | 'not_found' | 'error';
    scanned_by_account_id: string;
    scanned_at?: number | null;
}

interface MockBatch {
    id: number;
    name: string;
    status: string;
    pause_reason?: string | null;
    paused_until?: number | null;
}

class SimulatedPhoneScanDB {
    public items: MockItem[] = [];
    public batches: Map<number, MockBatch> = new Map();
    public accountLimits: Map<string, { scanDailyLimit: number; scanHourlyLimit: number }> = new Map();

    /**
     * BƯỚC 1 FIX LOGIC:
     * Đếm cả items đã hoàn thành (scanned_at >= sinceTimestamp) VÀ items đang in-flight (status='scanning')
     */
    public getDailyScanCountForAccount(zaloId: string, sinceTimestamp: number): number {
        return this.items.filter(item => 
            item.scanned_by_account_id === zaloId &&
            (
                (item.scanned_at != null && item.scanned_at >= sinceTimestamp) ||
                item.status === 'scanning'
            )
        ).length;
    }

    public getHourlyScanCountForAccount(zaloId: string, sinceTimestamp: number): number {
        return this.items.filter(item => 
            item.scanned_by_account_id === zaloId &&
            (
                (item.scanned_at != null && item.scanned_at >= sinceTimestamp) ||
                item.status === 'scanning'
            )
        ).length;
    }

    /**
     * BƯỚC 1b FIX LOGIC:
     * Đếm số items hoàn thành trong 1 giờ qua
     */
    public getHourlyScannedFoundCountForAccount(zaloId: string, oneHourAgo: number): number {
        return this.items.filter(item => 
            item.scanned_by_account_id === zaloId &&
            ['found', 'not_found', 'error'].includes(item.status) &&
            item.scanned_at != null && item.scanned_at >= oneHourAgo
        ).length;
    }

    /**
     * BƯỚC 3 FIX LOGIC:
     * Rollback scanning items về pending khi bị -216
     */
    public rollbackScanningItems(zaloId: string): number {
        let count = 0;
        for (const item of this.items) {
            if (item.scanned_by_account_id === zaloId && item.status === 'scanning') {
                item.status = 'pending';
                (item as any).scanned_by_account_id = null;
                item.scanned_at = null;
                count++;
            }
        }
        return count;
    }

    /**
     * Classified Rate Limit Handler (HOURLY vs DAILY vs BOTH)
     */
    public handleRateLimit(zaloId: string, batchId: number): { pauseReason: string; pausedUntil: number } {
        this.rollbackScanningItems(zaloId);

        const currentLimits = this.accountLimits.get(zaloId) || { scanDailyLimit: 100, scanHourlyLimit: 30 };
        const now = Date.now();
        const startOfToday = new Date().setHours(0, 0, 0, 0);
        const oneHourAgo = now - 3600000;

        const dailyCompleted = this.items.filter(i => i.scanned_by_account_id === zaloId && i.status === 'found' && i.scanned_at != null && i.scanned_at >= startOfToday).length;
        const hourlyCompleted = this.getHourlyScannedFoundCountForAccount(zaloId, oneHourAgo);

        const isHourlyExceeded = hourlyCompleted >= currentLimits.scanHourlyLimit;
        const isDailyExceeded = dailyCompleted >= currentLimits.scanDailyLimit;

        let pauseReason = 'daily_quota';
        let pausedUntil = new Date().setHours(23, 59, 59, 999) + 1;

        if (isHourlyExceeded && !isDailyExceeded) {
            pauseReason = 'hourly_quota';
            pausedUntil = now + 3600000;
        } else if (isDailyExceeded && !isHourlyExceeded) {
            pauseReason = 'daily_quota';
            pausedUntil = new Date().setHours(23, 59, 59, 999) + 1;
        }

        const batch = this.batches.get(batchId);
        if (batch) {
            batch.status = 'paused';
            batch.pause_reason = pauseReason;
            batch.paused_until = pausedUntil;
        }

        return { pauseReason, pausedUntil };
    }

    /**
     * Auto-resume HOURLY quota after 60 mins
     */
    public checkAutoResumeQuotas(now: number): number {
        let resumedCount = 0;
        for (const [, batch] of this.batches) {
            if (batch.status === 'paused' && batch.pause_reason === 'hourly_quota') {
                if (!batch.paused_until || batch.paused_until <= now) {
                    batch.status = 'queued';
                    batch.pause_reason = 'auto_resumed_hourly';
                    batch.paused_until = null;
                    resumedCount++;
                }
            }
        }
        return resumedCount;
    }
}

describe('Phone Scan Quota & Rate Limit Logic Tests', () => {
    let db: SimulatedPhoneScanDB;

    beforeEach(() => {
        db = new SimulatedPhoneScanDB();
    });

    test('BƯỚC 1: getDailyScanCount includes in-flight scanning items to prevent race condition over-dispatch', () => {
        const zaloId = 'zalo_acc_001';
        const now = Date.now();
        const startOfToday = new Date().setHours(0, 0, 0, 0);

        // 1 completed item
        db.items.push({ id: 1, batch_id: 10, phone: '0912345678', status: 'found', scanned_by_account_id: zaloId, scanned_at: now });

        // 2 in-flight items currently scanning (scanned_at is null)
        db.items.push({ id: 2, batch_id: 10, phone: '0987654321', status: 'scanning', scanned_by_account_id: zaloId });
        db.items.push({ id: 3, batch_id: 10, phone: '0933333333', status: 'scanning', scanned_by_account_id: zaloId });

        // Verify: daily count MUST be 3 (1 finished + 2 scanning) so dispatcher knows account is at limit
        const dailyCount = db.getDailyScanCountForAccount(zaloId, startOfToday);
        expect(dailyCount).toBe(3);
    });

    test('BƯỚC 3: handleRateLimit rolls back scanning items to pending and sets pause_reason = hourly_quota when hourly limit reached', () => {
        const zaloId = 'zalo_acc_002';
        const now = Date.now();
        db.accountLimits.set(zaloId, { scanDailyLimit: 100, scanHourlyLimit: 30 });
        db.batches.set(101, { id: 101, name: 'Batch 101', status: 'active' });

        // Simulate 30 completed items in the last hour
        for (let i = 0; i < 30; i++) {
            db.items.push({ id: i + 1, batch_id: 101, phone: `09100000${i}`, status: 'found', scanned_by_account_id: zaloId, scanned_at: now - 60000 });
        }

        // Add 2 items currently scanning when -216 rate limit occurs
        db.items.push({ id: 991, batch_id: 101, phone: '0999999991', status: 'scanning', scanned_by_account_id: zaloId });
        db.items.push({ id: 992, batch_id: 101, phone: '0999999992', status: 'scanning', scanned_by_account_id: zaloId });

        // Trigger rate limit handler
        const result = db.handleRateLimit(zaloId, 101);

        // Verify:
        // 1. Classification should be 'hourly_quota'
        expect(result.pauseReason).toBe('hourly_quota');
        expect(result.pausedUntil).toBeGreaterThan(now);

        // 2. Batch status updated correctly
        const batch = db.batches.get(101);
        expect(batch?.status).toBe('paused');
        expect(batch?.pause_reason).toBe('hourly_quota');
        expect(batch?.paused_until).toBeDefined();

        // 3. Scanning items rolled back to 'pending'
        const item1 = db.items.find(i => i.id === 991);
        const item2 = db.items.find(i => i.id === 992);
        expect(item1?.status).toBe('pending');
        expect(item2?.status).toBe('pending');
    });

    test('AUTO-RESUME: checkAutoResumeQuotas auto-resumes hourly_quota batches after 60 mins', () => {
        const now = Date.now();
        const pastPauseTime = now - 1000; // 1 second ago (expired)

        db.batches.set(201, { id: 201, name: 'Hourly Paused Batch', status: 'paused', pause_reason: 'hourly_quota', paused_until: pastPauseTime });

        // Run checkAutoResumeQuotas
        const resumedCount = db.checkAutoResumeQuotas(now);
        expect(resumedCount).toBe(1);

        const batch = db.batches.get(201);
        expect(batch?.status).toBe('queued');
        expect(batch?.pause_reason).toBe('auto_resumed_hourly');
        expect(batch?.paused_until).toBeNull();
    });
});
