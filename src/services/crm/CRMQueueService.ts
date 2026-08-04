import DatabaseService from '../database/DatabaseService';
import ConnectionManager from '../../utils/ConnectionManager';
import EventBroadcaster from '../event/EventBroadcaster';
import Logger from '../../utils/Logger';
import ZaloService from '../zalo/ZaloService';
import * as fs from 'fs';
import * as path from 'path';
import imageSize from 'image-size';
import { applySmartSalutation, getSelfRef } from '../../utils/salutationUtils';
import { parseZaloError } from './ZaloErrorDictionary';

/**
 * CRMQueueService — chạy trong main process
 * Token bucket per account: max 60 tin/giờ, refill 1 token mỗi 60s
 * Dispatcher loop: kiểm tra mỗi 5s, nếu đủ delay → gửi 1 tin rồi đợi
 */
class CRMQueueService {
    private static instance: CRMQueueService;
    private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
    private lastSentAt: Map<string, number> = new Map();
    private nextAllowedSendTime: Map<string, number> = new Map();
    private isProcessing: Map<string, boolean> = new Map();
    // Token bucket: max 60/giờ — refill 1 token mỗi 60s
    private tokens: Map<string, number> = new Map();
    private lastRefillAt: Map<string, number> = new Map();
    // Daily limit tracking: campaignId → paused due to daily limit
    private dailyPausedCampaigns: Map<number, boolean> = new Map();

    public readonly MAX_TOKENS = 60;
    private readonly REFILL_INTERVAL_MS = 60 * 1000;  // 1 phút / token → 60/giờ
    private readonly CHECK_INTERVAL_MS = 5000;          // kiểm tra mỗi 5s
    private readonly MIN_DELAY_MS = 5 * 1000;          // tối thiểu 5s
    private readonly PHONE_RESOLVE_TIMEOUT_MS = 15_000; // timeout resolve phone → tránh treo vô hạn

    private constructor() {
        this.startWeeklyFriendRequestWithdrawalScheduler();
    }

    public static getInstance(): CRMQueueService {
        if (!CRMQueueService.instance) CRMQueueService.instance = new CRMQueueService();
        return CRMQueueService.instance;
    }

    public startWeeklyFriendRequestWithdrawalScheduler(): void {
        const getMsUntilNextSunday23 = () => {
            const now = new Date();
            const target = new Date();
            
            // Set target to Sunday (0) at 23:00:00
            target.setDate(now.getDate() + (7 - now.getDay()) % 7);
            target.setHours(23, 0, 0, 0);
            
            // If Sunday 23:00 has already passed today, set to next Sunday
            if (target.getTime() <= now.getTime()) {
                target.setDate(target.getDate() + 7);
            }
            
            return target.getTime() - now.getTime();
        };

        const delay = getMsUntilNextSunday23();
        Logger.log(`[CRMQueue] Weekly friend request withdrawal job scheduled in ${Math.round(delay / 60000)} minutes (next Sunday 23:00)`);
        
        setTimeout(() => {
            this.checkAndWithdrawExpiredFriendRequests().catch((err: any) => {
                Logger.error(`[CRMQueue] checkAndWithdrawExpiredFriendRequests error: ${err.message}`);
            });
            
            // Repeat every 7 days (7 * 24 * 3600 * 1000 ms)
            setInterval(() => {
                this.checkAndWithdrawExpiredFriendRequests().catch((err: any) => {
                    Logger.error(`[CRMQueue] checkAndWithdrawExpiredFriendRequests error: ${err.message}`);
                });
            }, 7 * 24 * 60 * 60 * 1000);
        }, delay);
    }

    public async checkAndWithdrawExpiredFriendRequests(): Promise<void> {
        try {
            Logger.log('[CRMQueue] 🔍 Checking for sent friend requests older than 6 days...');
            const db = DatabaseService.getInstance();
            const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;
            
            const rows = db.query<any>(
                `SELECT owner_zalo_id, user_id, display_name FROM friend_requests WHERE direction = 'sent' AND created_at < ?`,
                [sixDaysAgo]
            );

            if (rows.length === 0) {
                Logger.log('[CRMQueue] No sent friend requests older than 6 days found.');
                return;
            }

            Logger.log(`[CRMQueue] Found ${rows.length} expired sent friend requests. Auto-withdrawing...`);
            for (const row of rows) {
                const { owner_zalo_id: zaloId, user_id: userId, display_name: displayName } = row;
                
                const conn = ConnectionManager.getAllConnections().get(zaloId);
                if (!conn) {
                    Logger.warn(`[CRMQueue] Zalo account ${zaloId} is not connected. Skipping auto-withdrawal for user ${displayName} (${userId}).`);
                    continue;
                }

                try {
                    const zaloService = await ZaloService.getInstance(conn.auth);
                    await zaloService.undoFriendRequest(userId);
                    
                    db.run(
                        `DELETE FROM friend_requests WHERE owner_zalo_id = ? AND user_id = ? AND direction = 'sent'`,
                        [zaloId, userId]
                    );
                    db.save();

                    Logger.log(`[CRMQueue] ✅ Auto-withdrew sent friend request to ${displayName} (${userId}) for owner ${zaloId}`);
                } catch (err: any) {
                    Logger.error(`[CRMQueue] ❌ Failed to auto-withdraw sent friend request to ${displayName} (${userId}): ${err.message}`);
                }
            }
        } catch (err: any) {
            Logger.error(`[CRMQueue] checkAndWithdrawExpiredFriendRequests error: ${err.message}`);
        }
    }

    /** Bắt đầu dispatcher cho account */
    public startForAccount(zaloId: string, campaignId?: number): { ok: boolean; isQueued?: boolean; queuedBehindName?: string; blockedByCampaignId?: number; blockedByCampaignName?: string } {
        // ── Kiểm tra 1 chiến dịch active / 1 tài khoản (Sử dụng Hàng đợi FIFO + Priority) ────
        const targetCampaignId = campaignId || 0;
        const db = DatabaseService.getInstance();

        if (targetCampaignId > 0) {
            const runningCampaigns = db.query<any>(
                `SELECT id, name FROM crm_campaigns
                 WHERE owner_zalo_id=? AND status='active' AND (is_deleted IS NULL OR is_deleted = 0)
                   AND id != ?
                 LIMIT 1`,
                [zaloId, targetCampaignId]
            );

            if (runningCampaigns.length > 0) {
                const blocker = runningCampaigns[0];
                // Tự động chuyển chiến dịch mới vào HÀNG ĐỢI (queued) thay vì từ chối
                db.updateCRMCampaignStatusWithReason(targetCampaignId, 'queued', null);
                const pos = db.getQueuedCampaignPosition(targetCampaignId, zaloId);
                Logger.log(`[CRMQueue] 📦 Campaign ${targetCampaignId} queued behind active campaign "${blocker.name}" (Queue Position #${pos})`);

                EventBroadcaster.emit('crm:queueStatus', {
                    zaloId,
                    type: 'campaign_queued',
                    queuedCampaignId: targetCampaignId,
                    blockedByCampaignId: blocker.id,
                    blockedByCampaignName: blocker.name,
                    queuePosition: pos,
                    tokens: this.tokens.get(zaloId) ?? 0,
                    maxTokens: this.MAX_TOKENS,
                    lastSentAt: this.lastSentAt.get(zaloId) ?? 0,
                    dailyPaused: false,
                });
                return { ok: true, isQueued: true, queuedBehindName: blocker.name };
            } else {
                // Chưa có chiến dịch active -> Đặt chiến dịch này thành ACTIVE
                db.updateCRMCampaignStatusWithReason(targetCampaignId, 'active', null);
            }
        }

        if (this.timers.has(zaloId)) {
            return { ok: true }; // Queue đã chạy, không cần khởi động lại
        }
        Logger.log(`[CRMQueue] ▶ Starting queue for ${zaloId}`);
        if (!this.tokens.has(zaloId)) {
            this.tokens.set(zaloId, this.MAX_TOKENS);
            this.lastRefillAt.set(zaloId, Date.now());
        } else {
            // Queue đã từng chạy trước đó → refill ngay dựa trên thời gian đã qua
            this.refillTokens(zaloId);
        }
        const timer = setInterval(() => this.process(zaloId), this.CHECK_INTERVAL_MS);
        this.timers.set(zaloId, timer);
        return { ok: true };
    }

    /** Tự động kiểm tra và đôn chiến dịch tiếp theo trong Hàng đợi lên ACTIVE */
    public promoteNextQueuedCampaign(zaloId: string): boolean {
        const db = DatabaseService.getInstance();
        const activeCamps = db.query<any>(
            `SELECT id FROM crm_campaigns WHERE owner_zalo_id=? AND status='active' AND (is_deleted IS NULL OR is_deleted = 0) LIMIT 1`,
            [zaloId]
        );
        if (activeCamps.length > 0) return false; // Đã có chiến dịch active đang thực thi

        const nextCamp = db.getNextQueuedCampaign(zaloId);
        if (nextCamp) {
            db.updateCRMCampaignStatusWithReason(nextCamp.id, 'active', null);
            Logger.log(`[CRMQueue] 🚀 Promoted queued campaign "${nextCamp.name}" (id=${nextCamp.id}, priority=${nextCamp.priority}) to ACTIVE for ${zaloId}`);
            this.startForAccount(zaloId, nextCamp.id);
            return true;
        }
        return false;
    }

    /** Dừng dispatcher cho account */
    public stopForAccount(zaloId: string): void {
        const timer = this.timers.get(zaloId);
        if (timer) { clearInterval(timer); this.timers.delete(zaloId); }
        // Clean up satellite maps to prevent unbounded memory growth
        this.lastSentAt.delete(zaloId);
        this.nextAllowedSendTime.delete(zaloId);
        this.isProcessing.delete(zaloId);
        this.tokens.delete(zaloId);
        this.lastRefillAt.delete(zaloId);
        Logger.log(`[CRMQueue] ⏹ Stopped queue for ${zaloId}`);
        // Notify renderer so the status bar disappears
        EventBroadcaster.emit('crm:queueStatus', {
            zaloId,
            type: 'stopped',
            running: false,
            tokens: this.tokens.get(zaloId) ?? this.MAX_TOKENS,
            maxTokens: this.MAX_TOKENS,
            lastSentAt: this.lastSentAt.get(zaloId) ?? 0,
        });
    }

    /** Dừng nếu không còn campaign active & không còn campaign queued */
    public checkAndStopIfIdle(zaloId: string): void {
        const promoted = this.promoteNextQueuedCampaign(zaloId);
        if (!promoted) {
            const hasActive = DatabaseService.getInstance().hasActiveCampaigns(zaloId);
            if (!hasActive) this.stopForAccount(zaloId);
        }
    }

    public getStatus(zaloId: string): { running: boolean; tokens: number; maxTokens: number; lastSentAt: number; dailyPaused: boolean } {
        const isDailyPaused = Array.from(this.dailyPausedCampaigns.values()).some(v => v);
        return {
            running: this.timers.has(zaloId),
            tokens: this.tokens.get(zaloId) ?? this.MAX_TOKENS,
            maxTokens: this.MAX_TOKENS,
            lastSentAt: this.lastSentAt.get(zaloId) ?? 0,
            dailyPaused: isDailyPaused,
        };
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
                db.run(
                    `UPDATE crm_campaigns 
                     SET status = 'queued', pause_reason = 'auto_resumed_daily' 
                     WHERE (status = 'paused_quota' OR pause_reason = 'daily_quota') AND (is_deleted IS NULL OR is_deleted = 0)`
                );
                db.save();
                Logger.log(`[CRMQueue] 🌅 Auto-resumed campaigns paused by daily quota for new day (${todayStr})`);
                this.lastAutoResumeCheckDate = todayStr;
                // Auto promote next queued campaign for all accounts
                const accounts = db.getAccounts() || [];
                for (const acc of accounts) {
                    if (acc.zalo_id) {
                        this.promoteNextQueuedCampaign(acc.zalo_id);
                    }
                }
            }
        } catch (err: any) {
            Logger.error(`[CRMQueue] checkAutoResumeDailyQuota error: ${err.message}`);
        }
    }

    /** Khởi động lại tất cả campaigns đang active (sau khi app restart) */
    public resumeActiveCampaigns(): void {
        try {
            const db = DatabaseService.getInstance();

            // Auto-resume any quota-paused campaigns if app restarted on a new day
            const todayStr = new Date().toLocaleDateString('en-CA');
            this.lastAutoResumeCheckDate = todayStr;

            const owners = db.getActiveCampaignOwners();
            for (const zaloId of owners) {
                // Tự động dọn dẹp nếu DB lỡ chứa nhiều hơn 1 chiến dịch active cho cùng 1 tài khoản
                const activeCamps = db.query<any>(
                    `SELECT id, name FROM crm_campaigns WHERE owner_zalo_id=? AND status='active' AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY updated_at DESC, id DESC`,
                    [zaloId]
                );
                if (activeCamps.length > 1) {
                    // Giữ lại chiến dịch mới nhất, tạm dừng các chiến dịch cũ hơn
                    for (let i = 1; i < activeCamps.length; i++) {
                        Logger.warn(`[CRMQueue] Tự động tạm dừng chiến dịch trùng lặp id=${activeCamps[i].id} ("${activeCamps[i].name}") của tài khoản ${zaloId}`);
                        db.updateCRMCampaignStatus(activeCamps[i].id, 'paused');
                    }
                    db.save();
                }
                if (activeCamps.length === 0) {
                    this.promoteNextQueuedCampaign(zaloId);
                } else {
                    Logger.log(`[CRMQueue] Resuming queue for ${zaloId}`);
                    this.startForAccount(zaloId, activeCamps[0].id);
                }
            }
        } catch (err: any) {
            Logger.warn(`[CRMQueue] resumeActiveCampaigns: ${err.message}`);
        }
    }

    /** Dừng tất cả dispatcher */
    public stopAllQueues(): void {
        const activeZaloIds = Array.from(this.timers.keys());
        for (const zaloId of activeZaloIds) {
            this.stopForAccount(zaloId);
        }
        Logger.log(`[CRMQueue] ⏹ Stopped all queues`);
    }

    private refillTokens(zaloId: string): void {
        const now = Date.now();
        const lastRefill = this.lastRefillAt.get(zaloId) || now;
        const elapsed = now - lastRefill;
        const tokensToAdd = Math.floor(elapsed / this.REFILL_INTERVAL_MS);
        if (tokensToAdd > 0) {
            const current = this.tokens.get(zaloId) ?? 0;
            this.tokens.set(zaloId, Math.min(this.MAX_TOKENS, current + tokensToAdd));
            this.lastRefillAt.set(zaloId, lastRefill + tokensToAdd * this.REFILL_INTERVAL_MS);
        }
    }

    private async process(zaloId: string): Promise<void> {
        if (this.isProcessing.get(zaloId)) return;

        // Check & auto-resume campaigns paused by daily quota when date changes (after 00:00)
        this.checkAutoResumeDailyQuota();

        // Refill tokens
        this.refillTokens(zaloId);

        const tokens = this.tokens.get(zaloId) ?? 0;
        if (tokens <= 0) {
            Logger.log(`[CRMQueue] ${zaloId}: No tokens left, waiting for refill`);
            this.broadcastStatus(zaloId, 'rate_limited');
            return;
        }

        const db = DatabaseService.getInstance();
        const item = db.getNextPendingCampaignContactCooperative(zaloId);
        if (!item) {
            this.checkAndStopIfIdle(zaloId);
            return;
        }

        // ── Daily send limit check ──────────────────────────────────────
        const campaignData = db.getCRMCampaign(item.campaign_id);

        // ── Precise Date-Time Scheduling ────────────────────────────────
        if (campaignData && campaignData.scheduled_start_at > 0) {
            if (Date.now() < campaignData.scheduled_start_at) {
                Logger.log(`[CRMQueue] Campaign ${item.campaign_id}: waiting until scheduled time: ${new Date(campaignData.scheduled_start_at).toLocaleString()}`);
                this.broadcastStatus(zaloId, 'waiting_for_scheduled_time');
                return;
            }
        }

        // ── Quiet hours check (Default: 23:30 to 07:00 ICT) ────────────────────
        if (campaignData && (campaignData.quiet_hours_enabled === undefined || Number(campaignData.quiet_hours_enabled) === 1)) {
            const quietStart = campaignData.quiet_hours_start || '23:30';
            const quietEnd = campaignData.quiet_hours_end || '07:00';
            
            const nowICT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
            
            let isQuiet = false;
            if (quietStart > quietEnd) {
                // Crosses midnight (e.g. 23:30 -> 07:00)
                isQuiet = nowICT >= quietStart || nowICT < quietEnd;
            } else {
                // Same day (e.g. 01:00 -> 06:00)
                isQuiet = nowICT >= quietStart && nowICT < quietEnd;
            }
            
            if (isQuiet) {
                Logger.log(`[CRMQueue] Campaign ${item.campaign_id} currently in Quiet Hours (${quietStart} - ${quietEnd}). Skipping send.`);
                this.broadcastStatus(zaloId, 'quiet_hours');
                return;
            }
        }

        // Kiểm tra contact hiện tại có phải bạn bè không
        const contactIsFriend = (() => {
            try {
                const friendRow = db.queryOne<any>(
                    `SELECT 1 FROM contacts WHERE owner_zalo_id=? AND contact_id=? AND is_friend=1 LIMIT 1`,
                    [zaloId, item.contact_id]
                );
                if (friendRow) return true;
                // Fallback: kiểm tra bảng friends
                const f2 = db.queryOne<any>(
                    `SELECT 1 FROM friends WHERE owner_zalo_id=? AND user_id=? LIMIT 1`,
                    [zaloId, item.contact_id]
                );
                return !!f2;
            } catch { return false; }
        })();

        // ── Per-Account Safety Quota Check (thay thế daily_send_limit per-campaign) ───────────────
        //
        // Logic:
        //  - Tin nhắn gửi cho NGƯỜI LẠ (chưa kết bạn) mới tính vào định mức tin nhắn
        //  - Lời mời kết bạn luôn tính vào định mức kết bạn
        //  - Bạn bè (đã kết bạn) KHÔNG tính vào bất kỳ định mức nào
        //  - Mixed campaign: dừng khi chạm BẤT KỲ định mức nào (không cố chuyển mode)
        if (campaignData) {
            const contactType = (item as any).campaign_type || campaignData.campaign_type || 'message';

            // Lấy số đã gửi hôm nay (cross-campaign) và các định mức an toàn tài khoản
            const todayCount = db.getTodayStrangerSentCount(zaloId);
            const msgLimit   = db.getStrangerMsgLimit(zaloId);
            const invLimit   = db.getFriendReqLimit(zaloId);

            let limitReached = false;
            let limitType = '';

            // 1. Lời mời kết bạn luôn bị kiểm tra hạn ngạch Zalo gửi kết bạn (friend_req_daily_limit)
            //    Zalo tính số lượt API sendFriendRequest / ngày, bất kể đối tượng là ai.
            if (contactType === 'friend_request') {
                if (todayCount.invites >= invLimit) {
                    limitReached = true;
                    limitType = 'friend_req_limit_reached';
                    Logger.log(`[CRMQueue] ⚠️ Account ${zaloId}: Friend request quota reached (${todayCount.invites}/${invLimit})`);
                }
            } else if (!contactIsFriend) {
                // 2. Gửi tin nhắn người lạ (chưa kết bạn) mới bị tính vào hạn ngạch tin nhắn người lạ
                if (contactType === 'mixed') {
                    if (todayCount.messages >= msgLimit) {
                        limitReached = true;
                        limitType = 'msg_daily_limit_reached';
                        Logger.log(`[CRMQueue] ⚠️ Account ${zaloId}: Message quota reached (${todayCount.messages}/${msgLimit}) — Mixed campaign paused`);
                    } else if (todayCount.invites >= invLimit) {
                        limitReached = true;
                        limitType = 'friend_req_limit_reached';
                        Logger.log(`[CRMQueue] ⚠️ Account ${zaloId}: Friend request quota reached (${todayCount.invites}/${invLimit}) — Mixed campaign paused`);
                    }
                } else {
                    // message campaign for stranger
                    if (todayCount.messages >= msgLimit) {
                        limitReached = true;
                        limitType = 'msg_daily_limit_reached';
                        Logger.log(`[CRMQueue] ⚠️ Account ${zaloId}: Message quota reached (${todayCount.messages}/${msgLimit})`);
                    }
                }
            }

            if (limitReached) {
                this.dailyPausedCampaigns.set(item.campaign_id, true);
                db.updateCRMCampaignStatusWithReason(item.campaign_id, 'paused_quota', 'daily_quota');
                this.broadcastStatus(zaloId, limitType);
                this.promoteNextQueuedCampaign(zaloId);
                return;
            }
            this.dailyPausedCampaigns.delete(item.campaign_id);
        }

        // ── Per-Campaign Daily Limit Check (Hạn mức riêng cho Chiến dịch - áp dụng cho cả Bạn bè & Người lạ) ──
        if (campaignData && campaignData.daily_send_limit && campaignData.daily_send_limit > 0) {
            const campaignDailyCount = db.getDailySentCountForCampaign(item.campaign_id, zaloId);
            if (campaignDailyCount >= campaignData.daily_send_limit) {
                this.dailyPausedCampaigns.set(item.campaign_id, true);
                Logger.log(`[CRMQueue] Campaign ${item.campaign_id} daily limit reached (${campaignDailyCount}/${campaignData.daily_send_limit})`);
                this.broadcastStatus(zaloId, 'daily_limit_reached');
                return;
            }
            this.dailyPausedCampaigns.delete(item.campaign_id);
        }

        // ── Kiểm tra giờ hẹn daily (scheduled_time_of_day): chạy mỗi ngày vào giờ cố định ───────────
        if (campaignData) {
            const timeOfDay = (campaignData as any).scheduled_time_of_day as string | undefined;
            if (timeOfDay && timeOfDay.trim()) {
                const nowICT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
                if (nowICT < timeOfDay.trim()) {
                    Logger.log(`[CRMQueue] Campaign ${item.campaign_id}: waiting for daily scheduled time ${timeOfDay} (now ${nowICT} ICT)`);
                    this.broadcastStatus(zaloId, 'waiting_for_start_time');
                    return;
                }
            }
        }

        // Check delay: random between delay_min_seconds and delay_max_seconds (range-based)
        const itemAny = item as any;
        const rawMin = itemAny.delay_min_seconds ?? Math.max(5, (item.delay_seconds || 60) - 10);
        const rawMax = itemAny.delay_max_seconds ?? Math.max(rawMin, (item.delay_seconds || 60) + 10);
        const delayMinSec = Math.max(this.MIN_DELAY_MS / 1000, rawMin);
        const delayMaxSec = Math.max(delayMinSec, rawMax);

        let nextTime = this.nextAllowedSendTime.get(zaloId);
        if (!nextTime) {
            const lastSent = this.lastSentAt.get(zaloId) || 0;
            const initialRandomSec = delayMinSec + Math.random() * (delayMaxSec - delayMinSec);
            nextTime = (lastSent > 0 ? lastSent : Date.now()) + (initialRandomSec * 1000);
            this.nextAllowedSendTime.set(zaloId, nextTime);
        }
        if (Date.now() < nextTime) return;

        // Get connection
        const conn = ConnectionManager.getConnection(zaloId);
        if (!conn?.api) {
            Logger.warn(`[CRMQueue] No connection for ${zaloId}, skipping`);
            return;
        }

        // ── Bắt đầu processing ──────────────────────────────────────────────
        // Đặt isProcessing bên ngoài try, nhưng sẽ reset trong finally
        this.isProcessing.set(zaloId, true);

        // Khai báo tất cả vars ở đây để catch block có thể truy cập
        let effectiveContactId = item.contact_id;
        let effectiveDisplayName = item.display_name || '';
        let campaignType: string = 'message';
        let isGroup: boolean = false;
        let friendMsg = '';
        let mixedActions: string[] = [];
        let mixedGroupIds: string[] = [];
        let blocksToSend: any[] = [];
        let sendMode: 'random' | 'all' = 'random';
        let message = '';
        let logBase: any = {};
        let describeBlock: (b: any) => string = () => '';
        let substitute: (tpl: string) => string = (t) => t;

        try {
            db.updateCampaignContactStatus(item.id!, 'sending');

            // ── Phone resolution at send time ──────────────────────────────
            const rawContactId = String(item.contact_id || '').trim();
            const rawPhone = String((item as any).phone || (item as any).contact_phone || '').trim();
            const isPhoneFormat = rawContactId.startsWith('phone:') ||
                                  /^(0|84)[35789]\d{8}$/.test(rawContactId) ||
                                  (rawPhone && (rawContactId === rawPhone || /^(0|84)[35789]\d{8}$/.test(rawPhone)));

            if (isPhoneFormat) {
                const phone = rawContactId.startsWith('phone:') ? rawContactId.slice(6) : (rawPhone || rawContactId);
                Logger.log(`[CRMQueue] Resolving phone ${phone} at send time...`);
                const resolved = await this.resolvePhoneContact(phone, conn.api);
                if (!resolved || !resolved.success || !resolved.uid) {
                    const failMsg = resolved?.error || 'SĐT chưa đăng ký Zalo hoặc bị chặn tìm kiếm';
                    Logger.warn(`[CRMQueue] Phone ${phone} resolve failed: ${failMsg}`);
                    db.updateCampaignContactStatus(item.id!, 'failed', failMsg);
                    db.save();
                    this.broadcastProgress(zaloId, item.campaign_id, item.contact_id, 'failed', failMsg);

                    // 🛑 USER DIRECTIVE: Immediately pause campaign if rate limit -216 is detected
                    if (resolved?.isRateLimit) {
                        Logger.warn(`[CRMQueue] 🛑 Rate limit -216 hit on Zalo ${zaloId}. Immediately pausing campaign ${item.campaign_id}...`);
                        db.updateCRMCampaignStatusWithReason(item.campaign_id, 'paused', failMsg);
                        db.save();
                        EventBroadcaster.emit('crm:campaignChanged', { action: 'pause', ownerZaloId: zaloId, campaignId: item.campaign_id, reason: 'rate_limit' });
                    }

                    this.isProcessing.set(zaloId, false);
                    return;
                }
                effectiveContactId = resolved.uid;
                effectiveDisplayName = resolved.name || phone;
                try { db.updateCampaignContactId(item.id!, resolved.uid, effectiveDisplayName); } catch { /* non-critical */ }
                Logger.log(`[CRMQueue] Phone ${phone} → UID ${resolved.uid} (${effectiveDisplayName})`);
            }

            // ── UID resolution at send time ────────────────────────────────
            if (!effectiveDisplayName && /^\d{5,}$/.test(effectiveContactId)) {
                Logger.log(`[CRMQueue] Resolving UID ${effectiveContactId} via getUserInfo...`);
                try {
                    const infoRes = await (conn.api as any).getUserInfo(effectiveContactId);
                    const profile = infoRes?.response?.changed_profiles?.[effectiveContactId]
                        ?? infoRes?.changed_profiles?.[effectiveContactId];
                    if (profile) effectiveDisplayName = profile.displayName || profile.zaloName || profile.name || '';
                    if (effectiveDisplayName) {
                        try { db.updateCampaignContactId(item.id!, effectiveContactId, effectiveDisplayName); } catch { /* */ }
                        Logger.log(`[CRMQueue] UID ${effectiveContactId} → "${effectiveDisplayName}"`);
                    } else Logger.warn(`[CRMQueue] UID ${effectiveContactId}: getUserInfo returned no name`);
                } catch (uidErr: any) {
                    Logger.warn(`[CRMQueue] UID ${effectiveContactId} getUserInfo failed: ${uidErr.message}`);
                }
            }

            // ── Template preparation ───────────────────────────────────────
            const nowDate = new Date();
            const todayDD = String(nowDate.getDate()).padStart(2, '0');
            const todayMM = String(nowDate.getMonth() + 1).padStart(2, '0');
            const todayYYYY = nowDate.getFullYear();
            const todayTime = `${String(nowDate.getHours()).padStart(2, '0')}:${String(nowDate.getMinutes()).padStart(2, '0')}`;

            const genderVal = (item as any).gender;
            const genderGreeting = genderVal === 0 ? 'Anh' : (genderVal === 1 ? 'Chị' : 'Anh/Chị');

            // {salutation}: ưu tiên giá trị tùy chỉnh từ DB, fallback về genderGreeting
            const salutationVal = (item as any).salutation;
            const effectiveSalutation = (salutationVal && typeof salutationVal === 'string' && salutationVal.trim())
                ? salutationVal.trim()
                : genderGreeting;

            const realName     = (item as any).real_name || (item as any).realName || '';
            const contactAlias = (item as any).alias || '';
            const zaloName     = (item as any).zalo_name || item.display_name || item.contact_id || '';
            const smartName    = contactAlias || effectiveDisplayName || zaloName;

            let bDay = '';
            let bMonth = '';
            const bdayStr = (item as any).birthday;
            if (bdayStr && typeof bdayStr === 'string') {
                const parts = bdayStr.split('/');
                if (parts.length >= 2) {
                    bDay = parts[0];
                    bMonth = parts[1];
                }
            }

            const campaignName = (item as any).campaign_name || '';

            const contactPhone = (item as any).contact_phone || (item as any).phone || '';
            const aiProfile    = (item as any).ai_profile || '';

            // Extra data (custom fields): parse JSON dữ liệu mở rộng
            let extraDataObj: Record<string, any> = {};
            try {
                const rawExtra = (item as any).extra_data;
                if (rawExtra) extraDataObj = JSON.parse(rawExtra);
            } catch { /* ignore parse error */ }

            substitute = (tpl: string) => {
                // Bước 1: Thay thế xưng hô thông minh (context-aware capitalize)
                // {salutation}/{gender_greeting} → viết Hoa đầu câu, thường giữa câu
                // {tu_xung} → tự xưng phù hợp (Em/Con/Cháu/Mình...)
                let result = applySmartSalutation(tpl || '', effectiveSalutation);

                // Bước 2: Thay thế các biến còn lại
                result = result
                    .replace(/\{name\}/g,             smartName || item.contact_id)
                    .replace(/\{zalo_name\}/g,        zaloName)
                    .replace(/\{real_name\}/g,        realName || smartName || item.contact_id)
                    .replace(/\{realName\}/g,         realName || smartName || item.contact_id)
                    .replace(/\{ten_that\}/g,         realName || smartName || item.contact_id)
                    .replace(/\{userId\}/g,           effectiveContactId)
                    .replace(/\{alias\}/g,            contactAlias)
                    .replace(/\{phone\}/g,            contactPhone)
                    .replace(/\{birthday\}/g,         bdayStr || '')
                    .replace(/\{birthday_day\}/g,     bDay)
                    .replace(/\{birthday_month\}/g,   bMonth)
                    .replace(/\{ai_profile\}/g,       aiProfile)
                    .replace(/\{campaign_name\}/g,    campaignName)
                    .replace(/\{date\}/g,             `${todayDD}/${todayMM}/${todayYYYY}`)
                    .replace(/\{time\}/g,             todayTime);

                // {extra.<field>} — thay thế custom fields từ extraData
                result = result.replace(/\{extra\.([^}]+)\}/g, (_match, field) => {
                    const val = extraDataObj[field];
                    return val !== undefined && val !== null && val !== '' ? String(val) : '';
                });

                // Cleanup: xóa bất kỳ biến {xyz} nào còn sót lại chưa được thay thế
                result = result.replace(/\{[a-z_][a-z0-9_.]*\}/gi, '');

                // Dọn khoảng trắng thừa do xóa biến
                result = result.replace(/  +/g, ' ').trim();

                return result;
            };

            campaignType = (item as any).campaign_type || 'message';
            isGroup = (item as any).contact_type === 'group';
            friendMsg = substitute((item as any).friend_request_message || '') || substitute(item.template_message || '') || 'Xin chào!';

            let mixedConfig: { actions?: string[]; group_ids?: string[] } = {};
            try { mixedConfig = JSON.parse((item as any).mixed_config || '{}'); } catch {}
            mixedActions = mixedConfig.actions || [];
            mixedGroupIds = mixedConfig.group_ids || [];

            // ── Multi-block template support ───────────────────────────────
            type ContentBlock = { id: string; text: string; images: string[] };
            const parseContentBlocks = (raw: string): { blocks: ContentBlock[]; mode: 'random' | 'all' } => {
                try {
                    const p = JSON.parse(raw);
                    if (p && Array.isArray(p.blocks)) return { blocks: p.blocks as ContentBlock[], mode: p.mode === 'all' ? 'all' : 'random' };
                } catch {}
                return { blocks: [{ id: '', text: raw, images: [] }], mode: 'random' };
            };

            const { blocks: allBlocks, mode: parsedMode } = parseContentBlocks(item.template_message || '');
            sendMode = parsedMode;

            if (sendMode === 'random') {
                const idx = allBlocks.length > 0 ? Math.floor(Math.random() * allBlocks.length) : 0;
                blocksToSend = allBlocks.length > 0 ? [allBlocks[idx]] : [];
            } else {
                blocksToSend = allBlocks;
            }

            // ── Check if contact is a stranger (unfriended) ──
            let isStranger = false;
            if (!isGroup && effectiveContactId) {
                try {
                    const status = await (conn.api as any).getFriendRequestStatus(effectiveContactId);
                    if (status && status.is_friend === false) {
                        isStranger = true;
                        Logger.log(`[CRMQueue] Target ${effectiveContactId} is confirmed to be a stranger.`);
                    }
                } catch (e: any) {
                    Logger.warn(`[CRMQueue] getFriendRequestStatus failed for ${effectiveContactId}: ${e.message}`);
                }
            }

            // Stranger optimization: restrict to sending only 1 block to fit 1-message stranger limit
            if (isStranger && blocksToSend.length > 1) {
                Logger.log(`[CRMQueue] Stranger target ${effectiveContactId} detected. Restricting to send only the first block to comply with Zalo stranger limit.`);
                blocksToSend = [blocksToSend[0]];
            }

            const sendOrder = (mixedConfig as any)?.send_order || 'image_first';

            // Helper: send one block (text + images)
            const sendBlock = async (block: ContentBlock, threadId: string, threadType: number, isStrangerTarget: boolean): Promise<any[]> => {
                const responses: any[] = [];
                const text = substitute(block.text || '');
                let imgs = (block.images || []).filter((p): p is string => typeof p === 'string' && p.trim().length > 0);

                if (isStrangerTarget && imgs.length > 1) {
                    Logger.log(`[CRMQueue] Stranger target ${threadId} detected. Sending only the first image with text caption to comply with Zalo stranger limit.`);
                    imgs = [imgs[0]];
                }

                if (imgs.length > 0) {
                    Logger.log(`[CRMQueue] Sending ${imgs.length} image(s) (order=${sendOrder}) to ${threadId} (threadType=${threadType})`);
                    
                    const resolvedPaths: string[] = [];
                    for (const p of imgs) {
                        let resolvedPath = p;
                        
                        // Check if p is a UUID or URL containing UUID
                        let uuid = '';
                        if (p.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                            uuid = p;
                        } else {
                            // Try to extract UUID from URL (e.g. /api/library/file/uuid or /api/media/uuid)
                            const match = p.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
                            if (match) {
                                uuid = match[1];
                            }
                        }
                        
                        if (uuid) {
                            try {
                                const db = DatabaseService.getInstance();
                                const row = db.queryOne<{ file_path: string }>(
                                    'SELECT file_path FROM media_library_items WHERE uuid = ?',
                                    [uuid]
                                );
                                if (row && row.file_path && fs.existsSync(row.file_path)) {
                                    resolvedPath = row.file_path;
                                    Logger.log(`[CRMQueue] Resolved image UUID/URL ${p} to Boss local path: ${resolvedPath}`);
                                } else {
                                    Logger.warn(`[CRMQueue] ⚠️ Could not resolve UUID ${uuid} to local path or file does not exist`);
                                }
                            } catch (dbErr: any) {
                                Logger.error(`[CRMQueue] DB resolve error for UUID ${uuid}: ${dbErr.message}`);
                            }
                        }
                        
                        if (fs.existsSync(resolvedPath)) {
                            resolvedPaths.push(resolvedPath);
                        } else {
                            Logger.warn(`[CRMQueue] ⚠️ Image path not found on disk: ${resolvedPath} (from original: ${p})`);
                        }
                    }

                    if (resolvedPaths.length > 0) {
                        if (isStrangerTarget || !text.trim()) {
                            // Stranger target or no text -> single message
                            const resp = await (conn.api as any).sendMessage({ msg: text, attachments: resolvedPaths }, threadId, threadType);
                            responses.push(resp);
                        } else {
                            // Friend target & both text and images exist -> Controlled sequential send based on sendOrder
                            if (sendOrder === 'text_first') {
                                Logger.log(`[CRMQueue] Sending Text FIRST for ${threadId}...`);
                                const textResp = await (conn.api as any).sendMessage({ msg: text }, threadId, threadType);
                                responses.push(textResp);

                                await new Promise(resolve => setTimeout(resolve, 300));

                                Logger.log(`[CRMQueue] Sending Images SECOND for ${threadId}...`);
                                const imgResp = await (conn.api as any).sendMessage({ msg: '', attachments: resolvedPaths }, threadId, threadType);
                                responses.push(imgResp);
                            } else {
                                Logger.log(`[CRMQueue] Sending Images FIRST for ${threadId}...`);
                                const imgResp = await (conn.api as any).sendMessage({ msg: '', attachments: resolvedPaths }, threadId, threadType);
                                responses.push(imgResp);

                                await new Promise(resolve => setTimeout(resolve, 300));

                                Logger.log(`[CRMQueue] Sending Text SECOND for ${threadId}...`);
                                const textResp = await (conn.api as any).sendMessage({ msg: text }, threadId, threadType);
                                responses.push(textResp);
                            }
                        }
                    }
                } else {
                    // Không có ảnh -> Chỉ gửi tin nhắn văn bản
                    if (text.trim()) {
                        const resp = await (conn.api as any).sendMessage({ msg: text }, threadId, threadType);
                        responses.push(resp);
                    }
                }
                return responses;
            };

            // Legacy single-message string for log display
            const firstBlock = blocksToSend[0];
            const firstBlockText = firstBlock ? substitute(firstBlock.text || '') : '';
            const firstBlockImgCount = firstBlock?.images?.filter(Boolean).length || 0;
            message = firstBlockText.trim()
              ? firstBlockText + (firstBlockImgCount > 0 ? ` + ${firstBlockImgCount} ảnh` : '')
              : firstBlockImgCount > 0
                ? `[${firstBlockImgCount} ảnh]`
                : '(trống)';

            // Helper: describe block content for log (dùng trong catch)
            describeBlock = (block: ContentBlock): string => {
                const txt = substitute(block.text || '').trim();
                const imgCount = (block.images || []).filter(Boolean).length;
                if (txt && imgCount > 0) return `${txt} + ${imgCount} ảnh`;
                if (txt) return txt;
                if (imgCount > 0) return `[${imgCount} ảnh]`;
                return '(trống)';
            };

            // Common log base fields
            logBase = {
                owner_zalo_id: zaloId,
                contact_id: effectiveContactId,
                display_name: effectiveDisplayName || '',
                phone: (item as any).contact_phone || (item as any).phone || '',
                contact_type: isGroup ? 'group' : 'user',
                campaign_id: item.campaign_id,
                sent_at: Date.now(),
            };

            // Helper: send multiple blocks with per-block error catching
            const sendBlocks = async (blocks: ContentBlock[], threadId: string, threadType: number, isStrangerTarget: boolean): Promise<{ sent: number; errors: string[]; responses: any[] }> => {
                let sent = 0;
                const errors: string[] = [];
                const responses: any[] = [];
                for (let bi = 0; bi < blocks.length; bi++) {
                    if (bi > 0) {
                        let perContactDelayMs = 1000;
                        if (campaignData) {
                            const pcMin = (campaignData as any).per_contact_delay_min_seconds || 0;
                            const pcMax = (campaignData as any).per_contact_delay_max_seconds || 0;
                            if (pcMax > pcMin) {
                                perContactDelayMs = (pcMin + Math.random() * (pcMax - pcMin)) * 1000;
                            } else if (pcMin > 0) {
                                perContactDelayMs = pcMin * 1000;
                            }
                        }
                        await new Promise(r => setTimeout(r, perContactDelayMs));
                    }
                    try {
                        const resps = await sendBlock(blocks[bi], threadId, threadType, isStrangerTarget);
                        responses.push(...resps);
                        sent++;
                    } catch (blockErr: any) {
                        const errMsg = blockErr?.message || String(blockErr);
                        errors.push(errMsg);
                        Logger.error(`[CRMQueue] Block ${bi + 1}/${blocks.length} failed for ${threadId}: ${errMsg}`);
                    }
                }
                return { sent, errors, responses };
            };

            // ── Actual send logic ──────────────────────────────────────────
            if (isGroup) {
                // ── Gửi vào nhóm ─────────────────────────────────────────────────
                const threadType = 1;
                const result = await sendBlocks(blocksToSend, effectiveContactId, threadType, false);
                const logMsg = sendMode === 'all'
                    ? `[Nhóm] ${result.sent}/${blocksToSend.length} nội dung: ${blocksToSend.map(describeBlock).join(' | ')}`
                    : `[Nhóm] ${message}`;
                db.updateCampaignContactStatus(item.id!, result.errors.length > 0 ? 'failed' : 'sent', result.errors.join('; ') || undefined);
                db.saveSendLog({ ...logBase, message: logMsg, status: result.errors.length > 0 ? 'failed' : 'sent',
                    error: result.errors.join('; ') || '', send_type: 'message',
                    data_request: JSON.stringify({ type: 'sendMessage', threadId: effectiveContactId, threadType, blocks: blocksToSend.length, sent: result.sent }),
                    data_response: result.responses.length > 0 ? JSON.stringify(result.responses.length === 1 ? result.responses[0] : result.responses) : '' });

            } else if (campaignType === 'mixed' && mixedActions.length > 0) {
                // ── Hỗn hợp (mới) ────────────────────────────────────────────────
                let actionErrors: string[] = [];
                for (const action of mixedActions) {
                    try {
                        if (action === 'message') {
                            const threadType = 0;
                            const result = await sendBlocks(blocksToSend, effectiveContactId, threadType, isStranger);
                            const logMsg = sendMode === 'all'
                                ? `[Hỗn hợp/Tin nhắn] ${result.sent}/${blocksToSend.length} nội dung: ${blocksToSend.map(describeBlock).join(' | ')}`
                                : `[Hỗn hợp/Tin nhắn] ${message}`;
                            db.saveSendLog({ ...logBase, message: logMsg, status: result.errors.length > 0 ? 'failed' : 'sent',
                                error: result.errors.join('; ') || '', send_type: 'message',
                                data_request: JSON.stringify({ type: 'sendMessage', threadId: effectiveContactId, threadType, blocks: blocksToSend.length, sent: result.sent }),
                                data_response: result.responses.length > 0 ? JSON.stringify(result.responses.length === 1 ? result.responses[0] : result.responses) : '' });
                            if (result.errors.length > 0) {
                                actionErrors.push(`[Lỗi gửi tin] ${result.errors.join('; ')}`);
                            }
                            Logger.log(`[CRMQueue] Mixed/message ${result.errors.length > 0 ? '❌' : '✅'} → ${effectiveContactId} (${result.sent}/${blocksToSend.length} blocks)`);

                        } else if (action === 'friend_request') {
                            const contactPhone = (item as any).contact_phone || (item as any).phone || '';
                            const alreadySent = db.hasSentFriendRequest(zaloId, effectiveContactId, contactPhone);
                            if (contactIsFriend) {
                                Logger.log(`[CRMQueue] Mixed/friend_request ⏭ Target ${effectiveContactId} is ALREADY a friend. Skipping.`);
                                db.saveSendLog({ ...logBase, message: `[Hỗn hợp/Kết bạn - Đã là bạn bè] ${friendMsg}`, status: 'sent', send_type: 'friend_request', error: 'Đã là bạn bè trên Zalo' });
                            } else if (alreadySent) {
                                Logger.log(`[CRMQueue] Mixed/friend_request ⏭ Target ${effectiveContactId} ALREADY received friend request previously. Skipping.`);
                                db.saveSendLog({ ...logBase, message: `[Hỗn hợp/Kết bạn - Đã gửi trước đó] ${friendMsg}`, status: 'sent', send_type: 'friend_request', error: 'Đã gửi lời mời kết bạn trước đó' });
                            } else {
                                const req = { type: 'sendFriendRequest', msg: friendMsg, userId: effectiveContactId };
                                const resp = await (conn.api as any).sendFriendRequest(friendMsg, effectiveContactId);
                                db.saveSendLog({ ...logBase, message: `[Hỗn hợp/Kết bạn] ${friendMsg}`, status: 'sent', send_type: 'friend_request',
                                    data_request: JSON.stringify(req), data_response: JSON.stringify(resp) });
                                Logger.log(`[CRMQueue] Mixed/friend_request ✅ → ${effectiveContactId}`);
                            }

                        } else if (action === 'invite_to_groups' && mixedGroupIds.length > 0) {
                            const req = { type: 'inviteUserToGroups', userId: effectiveContactId, groupIds: mixedGroupIds };
                            const resp = await (conn.api as any).inviteUserToGroups(effectiveContactId, mixedGroupIds);
                            let errorMsg: string | undefined = undefined;
                            if (resp && resp.grid_message_map) {
                                const errors: string[] = [];
                                for (const gId of Object.keys(resp.grid_message_map)) {
                                    const info = resp.grid_message_map[gId];
                                    if (info && info.error_code !== 0) {
                                        errors.push(`${gId}: ${info.error_message || `Lỗi ${info.error_code}`}`);
                                    }
                                }
                                if (errors.length > 0) {
                                    errorMsg = errors.join('; ');
                                }
                            }
                            const finalStatus = errorMsg ? 'failed' : 'sent';
                            if (errorMsg) {
                                actionErrors.push(`[Lỗi mời nhóm] ${errorMsg}`);
                            }
                            db.saveSendLog({ ...logBase,
                                message: `[Hỗn hợp/Mời nhóm] Mời vào ${mixedGroupIds.length} nhóm: ${mixedGroupIds.join(', ')}`,
                                status: finalStatus, send_type: 'invite_to_group',
                                error: errorMsg || '',
                                data_request: JSON.stringify(req), data_response: JSON.stringify(resp) });
                            Logger.log(`[CRMQueue] Mixed/invite_to_groups ${errorMsg ? '❌' : '✅'} → ${effectiveContactId} into ${mixedGroupIds.length} groups`);
                        }
                    } catch (actionErr: any) {
                        const errCode = Number(actionErr?.errorCode ?? actionErr?.code ?? actionErr?.error_code ?? -1);
                        const req = { type: action, userId: effectiveContactId };
                        const errResponse = {
                            error: true,
                            message: actionErr.message,
                            errorCode: errCode !== -1 ? errCode : undefined,
                        };
                        db.saveSendLog({ ...logBase,
                            message: `[Hỗn hợp/${action}] Lỗi: ${actionErr.message}`,
                            status: 'failed', error: actionErr.message,
                            send_type: action === 'friend_request' ? 'friend_request' : action === 'invite_to_groups' ? 'invite_to_group' : 'message',
                            data_request: JSON.stringify(req), data_response: JSON.stringify(errResponse) });
                        Logger.warn(`[CRMQueue] Mixed/${action} ❌ → ${effectiveContactId}: ${actionErr.message}`);

                        const actionNameTag = action === 'friend_request' ? 'Lỗi kết bạn' : action === 'invite_to_groups' ? 'Lỗi mời nhóm' : 'Lỗi gửi tin';
                        actionErrors.push(`[${actionNameTag}] ${actionErr.message}`);
                    }
                }
                if (actionErrors.length > 0) {
                    db.updateCampaignContactStatus(item.id!, 'failed', actionErrors.join(' | '));
                } else {
                    db.updateCampaignContactStatus(item.id!, 'sent');
                }

            } else if (campaignType === 'mixed') {
                // ── Hỗn hợp (cũ / fallback) ──────────────────────────────────────
                let actionLabel = 'message';
                let mixedResp: any[] = [];
                try {
                    mixedResp = await sendBlock(blocksToSend[0] ?? { id: '', text: '', images: [] }, effectiveContactId, 0, isStranger);
                } catch (msgErr: any) {
                    if (isMixedFallbackError(msgErr)) {
                        Logger.log(`[CRMQueue] Mixed fallback → sendFriendRequest for ${effectiveContactId}`);
                        const friendResp = await (conn.api as any).sendFriendRequest(friendMsg, effectiveContactId);
                        mixedResp = [friendResp];
                        actionLabel = 'friend_request_fallback';
                    } else { throw msgErr; }
                }
                db.updateCampaignContactStatus(item.id!, 'sent');
                db.saveSendLog({ ...logBase,
                    message: actionLabel === 'message' ? message : `[Kết bạn dự phòng] ${friendMsg}`,
                    status: 'sent',
                    send_type: actionLabel === 'message' ? 'message' : 'friend_request',
                    data_request: JSON.stringify({ type: actionLabel, contact_id: effectiveContactId }),
                    data_response: mixedResp.length > 0 ? JSON.stringify(mixedResp.length === 1 ? mixedResp[0] : mixedResp) : '' });

            } else if (campaignType === 'friend_request') {
                // ── Kết bạn only ─────────────────────────────────────────────────
                const contactPhone = (item as any).contact_phone || (item as any).phone || '';
                const alreadySent = db.hasSentFriendRequest(zaloId, effectiveContactId, contactPhone);
                
                if (contactIsFriend) {
                    Logger.log(`[CRMQueue] ⏭ Target ${effectiveContactId} (${effectiveDisplayName}) is ALREADY a friend. Skipping sendFriendRequest.`);
                    db.updateCampaignContactStatus(item.id!, 'sent', 'Đã là bạn bè trên Zalo');
                    db.saveSendLog({ ...logBase, message: `[Bỏ qua - Đã là bạn bè] ${friendMsg}`, status: 'sent', send_type: 'friend_request', error: 'Đã là bạn bè trên Zalo' });
                } else if (alreadySent) {
                    Logger.log(`[CRMQueue] ⏭ Target ${effectiveContactId} (${effectiveDisplayName}) ALREADY received a friend request previously from account ${zaloId}. Skipping duplicate API call.`);
                    db.updateCampaignContactStatus(item.id!, 'sent', 'Đã gửi lời mời kết bạn trước đó');
                    db.saveSendLog({ ...logBase, message: `[Bỏ qua - Đã gửi lời mời trước đó] ${friendMsg}`, status: 'sent', send_type: 'friend_request', error: 'Đã gửi lời mời kết bạn trước đó' });
                } else {
                    const req = { type: 'sendFriendRequest', msg: friendMsg, userId: effectiveContactId };
                    const resp = await (conn.api as any).sendFriendRequest(friendMsg, effectiveContactId);
                    db.updateCampaignContactStatus(item.id!, 'sent');
                    db.saveSendLog({ ...logBase, message: `[Kết bạn] ${friendMsg}`, status: 'sent', send_type: 'friend_request',
                        data_request: JSON.stringify(req), data_response: JSON.stringify(resp) });
                }

            } else if (campaignType === 'invite_to_group') {
                // ── Mời vào nhóm (standalone) ─────────────────────────────────────
                const groupIds = mixedGroupIds;
                if (groupIds.length === 0) throw new Error('Không có nhóm nào được chỉ định trong chiến dịch');
                const req = { type: 'inviteUserToGroups', userId: effectiveContactId, groupIds };
                const resp = await (conn.api as any).inviteUserToGroups(effectiveContactId, groupIds);
                let errorMsg: string | undefined = undefined;
                if (resp && resp.grid_message_map) {
                    const errors: string[] = [];
                    for (const gId of Object.keys(resp.grid_message_map)) {
                        const info = resp.grid_message_map[gId];
                        if (info && info.error_code !== 0) {
                            errors.push(`${gId}: ${info.error_message || `Lỗi ${info.error_code}`}`);
                        }
                    }
                    if (errors.length > 0) {
                        errorMsg = errors.join('; ');
                    }
                }
                const finalStatus = errorMsg ? 'failed' : 'sent';
                db.updateCampaignContactStatus(item.id!, finalStatus, errorMsg);
                db.saveSendLog({ ...logBase,
                    message: `[Mời nhóm] Mời vào ${groupIds.length} nhóm: ${groupIds.join(', ')}`,
                    status: finalStatus, send_type: 'invite_to_group',
                    error: errorMsg || '',
                    data_request: JSON.stringify(req), data_response: JSON.stringify(resp) });
                Logger.log(`[CRMQueue] Invite ${errorMsg ? '❌' : '✅'} → ${effectiveContactId} into ${groupIds.length} groups`);

            } else {
                // ── Tin nhắn only (default) ───────────────────────────────────────
                const threadType = 0;
                const result = await sendBlocks(blocksToSend, effectiveContactId, threadType, isStranger);
                const logMsg = sendMode === 'all'
                    ? `[${result.sent}/${blocksToSend.length} nội dung] ${blocksToSend.map(describeBlock).join(' | ')}`
                    : message;
                const finalStatus = result.errors.length > 0 ? 'failed' : 'sent';
                db.updateCampaignContactStatus(item.id!, finalStatus, result.errors.join('; ') || undefined);
                db.saveSendLog({ ...logBase, message: logMsg, status: finalStatus,
                    error: result.errors.join('; ') || '', send_type: 'message',
                    data_request: JSON.stringify({ type: 'sendMessage', threadId: effectiveContactId, threadType, blocks: blocksToSend.length, sent: result.sent }),
                    data_response: result.responses.length > 0 ? JSON.stringify(result.responses.length === 1 ? result.responses[0] : result.responses) : '' });
            }

            // Auto Label on Success
            const currentStatus = db.queryOne<{ status: string }>(
                'SELECT status FROM crm_campaign_contacts WHERE id = ?',
                [item.id!]
            )?.status;

            if (currentStatus === 'sent') {
                let mixedConfig: any = {};
                try {
                    mixedConfig = JSON.parse((campaignData as any).mixed_config || '{}');
                } catch {}

                if (!isGroup && effectiveContactId) {
                    try {
                        await this.trySyncZaloAliasOnSendSuccess(
                            zaloId,
                            effectiveContactId,
                            campaignName,
                            contactPhone,
                            effectiveDisplayName,
                            conn.auth,
                            mixedConfig
                        );
                    } catch (aliasErr: any) {
                        Logger.warn(`[CRMQueue] Alias sync error for ${effectiveContactId}: ${aliasErr.message}`);
                    }
                }

                if (mixedConfig.auto_label && mixedConfig.auto_label.enabled) {
                    const autoLabel = mixedConfig.auto_label;
                    if (autoLabel.type === 'local') {
                        let labelId = autoLabel.id;
                        if (!labelId && autoLabel.name) {
                            try {
                                labelId = db.upsertLocalLabel({
                                    name: autoLabel.name,
                                    color: autoLabel.color || '#3b82f6',
                                    textColor: autoLabel.textColor || '#FFFFFF',
                                    emoji: autoLabel.emoji || '🏷️',
                                    pageIds: zaloId,
                                    isActive: 1,
                                    sortOrder: 0
                                });
                            } catch (labelErr: any) {
                                Logger.error(`[CRMQueue] Failed to create auto local label "${autoLabel.name}": ${labelErr.message}`);
                            }
                        }
                        if (labelId && labelId > 0) {
                            try {
                                db.assignLocalLabelToThread(zaloId, labelId, effectiveContactId);
                                Logger.log(`[CRMQueue] Automatically assigned local label ID ${labelId} to contact ${effectiveContactId}`);
                            } catch (assignErr: any) {
                                Logger.error(`[CRMQueue] Failed to assign local label ID ${labelId}: ${assignErr.message}`);
                            }
                        }
                    } else if (autoLabel.type === 'zalo') {
                        try {
                            const labelsRes = await (conn.api as any).getLabels();
                            if (labelsRes && Array.isArray(labelsRes.labelData)) {
                                const labelData: any[] = labelsRes.labelData;
                                const version = labelsRes.version;
                                let targetLabel: any = labelData.find((l: any) => l.id === autoLabel.id || l.name === autoLabel.name);
                                if (!targetLabel && autoLabel.name) {
                                    // Create Zalo label
                                    const newId = Date.now();
                                    targetLabel = {
                                        id: newId,
                                        name: autoLabel.name,
                                        color: '#3b82f6',
                                        conversations: []
                                    };
                                    labelData.push(targetLabel);
                                }
                                if (targetLabel) {
                                    if (!targetLabel.conversations) targetLabel.conversations = [];
                                    const sId = String(effectiveContactId);
                                    if (!targetLabel.conversations.includes(sId)) {
                                        targetLabel.conversations.push(sId);
                                        await (conn.api as any).updateLabels({ labelData, version });
                                        Logger.log(`[CRMQueue] Automatically assigned Zalo label "${targetLabel.name}" to contact ${effectiveContactId}`);
                                    }
                                }
                            }
                        } catch (zaloLabelErr: any) {
                            Logger.error(`[CRMQueue] Failed to assign Zalo label: ${zaloLabelErr.message}`);
                        }
                    }
                }
            }

            // Tiêu thụ 1 token
            const nowMs = Date.now();
            this.tokens.set(zaloId, Math.max(0, (this.tokens.get(zaloId) ?? 1) - 1));
            this.lastSentAt.set(zaloId, nowMs);

            // Sinh khoảng delay ngẫu nhiên MỚI hoàn toàn cho tin tiếp theo trong dải [delayMinSec, delayMaxSec]
            const nextRandomSec = delayMinSec + Math.random() * (delayMaxSec - delayMinSec);
            const nextSendAt = nowMs + Math.round(nextRandomSec * 1000);
            this.nextAllowedSendTime.set(zaloId, nextSendAt);
            Logger.log(`[CRMQueue] ⏱ Next message for account ${zaloId} scheduled in ${nextRandomSec.toFixed(1)}s (at ${new Date(nextSendAt).toLocaleTimeString('vi-VN')})`);
            db.save();

            Logger.log(`[CRMQueue] ✅ Sent to ${effectiveContactId} (campaign ${item.campaign_id})`);
            this.broadcastProgress(zaloId, item.campaign_id, effectiveContactId, 'sent');
            this.checkCampaignCompletion(item.campaign_id, zaloId);

        } catch (err: any) {
            const errNowMs = Date.now();
            this.lastSentAt.set(zaloId, errNowMs);
            const errMinSec = (item as any).delay_min_seconds ?? 5;
            const errMaxSec = (item as any).delay_max_seconds ?? (errMinSec + 10);
            const nextRandomSec = errMinSec + Math.random() * (Math.max(errMinSec, errMaxSec) - errMinSec);
            this.nextAllowedSendTime.set(zaloId, errNowMs + Math.round(nextRandomSec * 1000));

            const errMsg = err?.message || String(err);
            Logger.error(`[CRMQueue] ❌ Failed to send to ${effectiveContactId}: ${errMsg}`);

            // Auto-detect if user blocked messaging
            const isBlockedErr = (() => {
                const lower = errMsg.toLowerCase();
                const code = Number(err?.errorCode ?? err?.code ?? err?.error_code ?? 0);
                if (code === -201 || code === -202 || code === 108 || code === 127 || code === 300) return true;
                return lower.includes('chặn') || lower.includes('blocked') || lower.includes('không thể nhận') || lower.includes('không thể gửi tin') || lower.includes('người lạ');
            })();

            if (isBlockedErr) {
                Logger.warn(`[CRMQueue] 🚫 Auto-detected BLOCKED contact ${effectiveContactId} for Zalo ${zaloId}`);
                try {
                    db.markContactBlocked(zaloId, String(effectiveContactId), true);
                } catch {}
            }

            // Parse error via ZaloErrorDictionary
            const errorDetail = parseZaloError(err);
            const finalErrMsg = errorDetail.userMessage || errMsg;

            if (errorDetail.shouldAutoPauseCampaign) {
                Logger.warn(`[CRMQueue] 🛑 Account limit / policy error (${errorDetail.code}: ${errorDetail.title}) detected! Pausing campaign ${item.campaign_id}...`);
                try {
                    db.updateCRMCampaignStatusWithReason(item.campaign_id, 'paused_quota', 'daily_quota');
                    EventBroadcaster.emit('crm:campaignChanged', { action: 'pause', ownerZaloId: zaloId, campaignId: item.campaign_id, reason: String(errorDetail.code) });
                    this.promoteNextQueuedCampaign(zaloId);
                } catch {}
            }

            // Always save log on failure — use describeBlock for human-readable message
            const fallbackLogMsg = blocksToSend.length > 0
                ? blocksToSend.map(describeBlock).join(' | ')
                : (item.template_message || '(unknown)');
            try {
                db.updateCampaignContactStatus(item.id!, 'failed', finalErrMsg);
                // Capture error response details if available
                const errResponse: any = {
                    error: true,
                    message: finalErrMsg,
                    errorCode: err?.errorCode ?? err?.code ?? err?.error_code ?? undefined,
                };
                db.saveSendLog({ ...logBase,
                    message: `[Lỗi] ${finalErrMsg} — ${fallbackLogMsg}`,
                    status: 'failed', error: finalErrMsg,
                    send_type: campaignType === 'friend_request' ? 'friend_request' : campaignType === 'mixed' ? 'mixed' : 'message',
                    data_request: JSON.stringify({ type: campaignType, contact_id: effectiveContactId }),
                    data_response: JSON.stringify(errResponse) });
                db.save();
            } catch (logErr: any) {
                Logger.error(`[CRMQueue] ❌ Failed to save error log: ${logErr.message}`);
            }
            this.broadcastProgress(zaloId, item.campaign_id, effectiveContactId, 'failed', finalErrMsg);
            this.checkCampaignCompletion(item.campaign_id, zaloId);
        } finally {
            this.isProcessing.set(zaloId, false);
        }
    }

    private checkCampaignCompletion(campaignId: number, zaloId: string): void {
        try {
            const db = DatabaseService.getInstance();
            const contacts = db.getCampaignContacts(campaignId);
            const hasPending = contacts.some(c => c.status === 'pending' || c.status === 'sending');
            if (!hasPending) {
                db.updateCRMCampaignStatus(campaignId, 'done');
                db.save();
                Logger.log(`[CRMQueue] Campaign ${campaignId} completed`);
                EventBroadcaster.emit('crm:campaignDone', { zaloId, campaignId });

                this.checkAndStopIfIdle(zaloId);
            }
        } catch (err: any) {
            Logger.warn(`[CRMQueue] checkCampaignCompletion: ${err.message}`);
        }
    }

    private broadcastProgress(zaloId: string, campaignId: number, contactId: string, status: string, error?: string): void {
        const db = DatabaseService.getInstance();
        const dailyCount = db.getDailySentCountForCampaign(campaignId);
        EventBroadcaster.emit('crm:queueUpdate', {
            zaloId, campaignId, contactId, status, error,
            tokens: this.tokens.get(zaloId) ?? 0,
            maxTokens: this.MAX_TOKENS,
            lastSentAt: this.lastSentAt.get(zaloId) ?? 0,
            dailySentCount: dailyCount,
        });
    }

    private broadcastStatus(zaloId: string, type: string): void {
        const isDailyPaused = type === 'daily_limit_reached'
            || type === 'msg_daily_limit_reached'
            || type === 'friend_req_limit_reached'
            || type === 'all_limits_reached'
            || type === 'waiting_for_start_time'
            || type === 'waiting_for_scheduled_time';
        EventBroadcaster.emit('crm:queueStatus', {
            zaloId, type,
            tokens: this.tokens.get(zaloId) ?? 0,
            maxTokens: this.MAX_TOKENS,
            lastSentAt: this.lastSentAt.get(zaloId) ?? 0,
            dailyPaused: isDailyPaused,
        });
    }

    /**
     * Resolve a phone number to Zalo UID via API.
     * Called at send time to avoid rate limiting when importing phones.
     * Returns { uid, name } or null if not found.
     */
    private async resolvePhoneContact(phone: string, api: any): Promise<{ success: boolean; uid?: string; name?: string; error?: string; isRateLimit?: boolean }> {
        // Timeout để tránh API treo vô hạn → queue tê liệt
        /** Helper tạo promise với timeout */
        const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
            Promise.race([
                promise,
                new Promise<T>((_, reject) => setTimeout(() => reject(new Error('API timeout')), ms)),
            ]);
        try {
            const res: any = await withTimeout(api.findUser(phone), this.PHONE_RESOLVE_TIMEOUT_MS);
            const u: any = res?.response ?? res;

            // Check for explicit rate limit -216 / 216 / 50004 in Zalo response
            const code = Number(res?.errorCode ?? res?.code ?? res?.error_code ?? u?.errorCode ?? u?.code ?? u?.error_code ?? 0);
            const resMsg = String(res?.error || res?.message || u?.error || u?.message || '').toLowerCase();
            if (code === -216 || code === 216 || code === 50004 || resMsg.includes('-216') || resMsg.includes('216') || resMsg.includes('search limit') || resMsg.includes('find user limit') || resMsg.includes('giới hạn tìm kiếm')) {
                return {
                    success: false,
                    error: 'Tài khoản Zalo hiện tại đã đạt giới hạn quét SĐT trong ngày (Mã -216). Vui lòng đổi nick hoặc chờ 24h',
                    isRateLimit: true
                };
            }

            if (!u?.uid) {
                return {
                    success: false,
                    error: 'SĐT chưa đăng ký Zalo hoặc bị chặn tìm kiếm'
                };
            }
            let name = u.display_name || u.zalo_name || phone;
            try {
                const infoRes: any = await withTimeout(api.getUserInfo(u.uid), this.PHONE_RESOLVE_TIMEOUT_MS);
                const profile: any = infoRes?.response?.changed_profiles?.[u.uid] ?? infoRes?.changed_profiles?.[u.uid];
                if (profile) {
                    name = profile.displayName || profile.zaloName || profile.name || name;
                }
            } catch { /* getUserInfo failure is non-fatal */ }
            return { success: true, uid: String(u.uid), name };
        } catch (err: any) {
            const code = Number(err?.errorCode ?? err?.code ?? err?.error_code ?? 0);
            const errStr = String(err?.message || err || '').toLowerCase();
            if (code === -216 || code === 216 || code === 50004 || errStr.includes('-216') || errStr.includes('216') || errStr.includes('search limit') || errStr.includes('find user limit') || errStr.includes('giới hạn tìm kiếm')) {
                return {
                    success: false,
                    error: 'Tài khoản Zalo hiện tại đã đạt giới hạn quét SĐT trong ngày (Mã -216). Vui lòng đổi nick hoặc chờ 24h',
                    isRateLimit: true
                };
            }
            return {
                success: false,
                error: 'SĐT chưa đăng ký Zalo hoặc bị chặn tìm kiếm'
            };
        }
    }

    private extractCoreZaloName(rawName: string, phone: string): string {
        let name = (rawName || '').trim();
        if (!name) return 'Khách';
        // Strip trailing phone number if present at the end
        if (phone && name.endsWith(phone)) {
            name = name.slice(0, -phone.length).replace(/[\s\-\_]+$/, '');
        }
        // If name contains hyphen '-', e.g. "VIP - Khánh Ly - 0898904529" or "VIP - Khánh Ly"
        const parts = name.split(/\s*[\-\–\—]\s*/);
        if (parts.length >= 2) {
            // Find core name part that is not equal to phone number
            const middle = parts.find(p => p !== phone && p.trim().length > 0);
            if (middle) {
                name = middle;
            } else {
                name = parts[1];
            }
        }
        return name.trim() || 'Khách';
    }

    private async trySyncZaloAliasOnSendSuccess(
        zaloId: string,
        contactId: string,
        campaignName: string,
        contactPhone: string,
        contactName: string,
        auth: any,
        mixedConfig?: any
    ): Promise<void> {
        if (!contactId || contactId.includes('@g.us') || contactId.includes('@group')) return;

        const rule = mixedConfig?.zalo_alias_rule || 'none';
        if (rule === 'none') {
            Logger.log(`[CRMQueue] Zalo alias rule is 'none' for ${contactId}. Preserving existing name.`);
            return;
        }

        try {
            const db = DatabaseService.getInstance();
            const cleanCampaignName = (campaignName || 'Campaign').trim();
            const cleanPhone = (contactPhone || '').trim();

            const dbContact = db.queryOne<{ zalo_name?: string; name?: string; display_name?: string }>(
                'SELECT zalo_name, name, display_name FROM crm_contacts WHERE owner_zalo_id = ? AND contact_id = ?',
                [zaloId, contactId]
            );

            const rawName = dbContact?.zalo_name || dbContact?.name || contactName || '';
            const coreName = this.extractCoreZaloName(rawName, cleanPhone);

            let formattedAlias = '';
            if (rule === 'campaign_name_phone') {
                formattedAlias = cleanPhone
                    ? `${cleanCampaignName} - ${coreName} - ${cleanPhone}`
                    : `${cleanCampaignName} - ${coreName}`;
            } else if (rule === 'name_phone') {
                formattedAlias = cleanPhone
                    ? `${coreName} - ${cleanPhone}`
                    : coreName;
            } else {
                return;
            }

            // 1. Update local CRM SQLite DB
            db.setContactAlias(zaloId, contactId, formattedAlias);
            EventBroadcaster.emit('db:contactAliasChanged', { ownerZaloId: zaloId, contactId, alias: formattedAlias });

            // 2. Sync to Zalo Server API (App Zalo Mobile/PC)
            const zaloService = await ZaloService.getInstance(auth);
            if (zaloService && typeof (zaloService as any).changeFriendAlias === 'function') {
                zaloService.changeFriendAlias(formattedAlias, contactId)
                    .then((res: any) => {
                        if (res && (res.error_code === 0 || res.error_code === '0' || res.status === 0)) {
                            Logger.log(`[CRMQueue] ✅ Updated Zalo server alias for ${contactId} to "${formattedAlias}"`);
                        } else {
                            Logger.warn(`[CRMQueue] ⚠️ Zalo server alias note for ${contactId} (Code ${res?.error_code || res?.error}): ${res?.message || res?.error_message || 'Zalo API response'}`);
                        }
                    })
                    .catch((err: any) => {
                        Logger.warn(`[CRMQueue] ⚠️ Failed to sync Zalo server alias for ${contactId}: ${err.message}`);
                    });
            }
        } catch (err: any) {
            Logger.warn(`[CRMQueue] ⚠️ trySyncZaloAliasOnSendSuccess error for ${contactId}: ${err.message}`);
        }
    }
}

export default CRMQueueService;

/**
 * Kiểm tra lỗi gửi tin nhắn có phải do người dùng chặn người lạ không.
 * Nếu đúng → chế độ hỗn hợp sẽ fallback sang gửi lời mời kết bạn.
 */
function isMixedFallbackError(err: any): boolean {
    const code = Number(err?.errorCode ?? err?.code ?? err?.error_code ?? -1);
    // Zalo error codes for "can only receive from friends" or "blocked"
    if ([4, 9, 127, 214, 216, 576, 579].includes(code)) return true;
    const msg = String(err?.message || '').toLowerCase();
    return (
        msg.includes('block') ||
        msg.includes('chặn') ||
        msg.includes('không thể nhận') ||
        msg.includes('bạn bè') ||
        msg.includes('không thể gửi') ||
        msg.includes('không hợp lệ') ||
        msg.includes('stranger') ||
        msg.includes('not friend') ||
        msg.includes('permission')
    );
}

