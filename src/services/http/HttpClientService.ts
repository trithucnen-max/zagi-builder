import * as http from 'http';
import * as os from 'os';
import Logger from '../../utils/Logger';
import EventBroadcaster from '../event/EventBroadcaster';
import SocketIOClient from '../socket/SocketIOClient';
import DataSyncService, { SyncPayload } from '../employee/DataSyncService';

/**
 * HttpClientService — Employee side only.
 * Replaces SocketClientService.
 *
 * - Runs a lightweight HTTP server to receive pushed events from Boss
 * - Sends proxy actions to Boss via HTTP POST
 * - Heartbeat every 15s to keep registration alive
 */
class HttpClientService {
    private static instance: HttpClientService;
    private connected = false;
    /** True khi đã chủ động đánh dấu mất kết nối (sleep/wake) — proxyAction trả lỗi mềm thay vì throw */
    private degraded = false;
    private bossUrl = '';
    private configuredBossUrl = '';
    private isUsingLan = false;
    private lanProbing = false;
    private token = '';
    private latencyMs = 0;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private localServer: http.Server | null = null;
    private localPort = 9901;
    private workspaceId = '';

    private consecutiveHeartbeatFailures = 0;
    private static MAX_HEARTBEAT_FAILURES = 2;
    private callbackUrl = '';
    private lastKnownLocalIps: string[] = [];
    private lastKnownPort: number = 3000;

    private onStatusChange: ((connected: boolean, latency: number, isUsingLan?: boolean) => void) | null = null;
    private onInitialState: ((data: any) => void) | null = null;
    private onAccountAccessUpdate: ((data: any) => void) | null = null;
    private onSyncProgress: ((phase: string, percent: number) => void) | null = null;
    private onSSEReconnected: (() => void) | null = null;
    private lastSyncTs = 0;

    /** Socket.IO client - transport duy nhất cho real-time event */
    private socketIOClient = new SocketIOClient();

    /** Channels to forward to local EventBroadcaster */
    private static FORWARD_CHANNELS = [
        'event:message',
        'event:reaction',
        'event:groupEvent',
        'event:groupInfoUpdate',
        'event:pollVote',
        'event:pinsUpdated',
        'event:connected',
        'event:disconnected',
        'event:friendRequest',
        'event:friendAccepted',
        'event:typing',
        'event:seen',
        'event:undo',
        'event:delete',
        'event:reminder',
        'event:localPath',
        'event:listenerDead',
        'relay:messageSentByEmployee',
        'erp:event:taskCreated',
        'erp:event:taskUpdated',
        'erp:event:taskDeleted',
        'erp:event:commentAdded',
        'erp:event:projectCreated',
        'erp:event:projectUpdated',
        'erp:event:projectDeleted',
        'erp:event:calendarEventCreated',
        'erp:event:calendarEventUpdated',
        'erp:event:calendarEventDeleted',
        'erp:event:notification',
        'erp:event:reminder',
        'erp:event:noteCreated',
        'erp:event:noteUpdated',
        'erp:event:noteDeleted',
        'erp:event:noteShared',
        'erp:event:leaveCreated',
        'erp:event:leaveDecided',
        'erp:event:attendanceUpdated',
        'erp:event:departmentUpdated',
        'erp:event:employeeProfileUpdated',
        // ─── CRM / Settings real-time sync ────────────────────────────
        'db:localLabelChanged',
        'db:localLabelThreadChanged',
        'db:pinnedMessageChanged',
        'db:localQuickMessageChanged',
        'crm:campaignChanged',
        'crm:noteChanged',
        'db:pinnedConversationChanged',
        'db:contactFlagsChanged',
        'db:contactAliasChanged',
        'db:markAsRead',
        'event:friendRequestSent',
        'event:friendRequestRemoved',
        'crm:queueUpdate',
        'crm:queueStatus',
        'crm:campaignDone',
        'workflow:executed',
        'integration:payment',
        'integration:webhook',
    ];

    public static getInstance(): HttpClientService {
        if (!HttpClientService.instance) {
            HttpClientService.instance = new HttpClientService();
        }
        return HttpClientService.instance;
    }

    // ─── Lifecycle ────────────────────────────────────────────────────

    public async connect(bossUrl: string, token: string): Promise<{ success: boolean; error?: string }> {
        if (this.connected) {
            this.disconnect();
        }

        this.token = token;

        // Normalize URL
        let url = bossUrl;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = `http://${url}`;
        }
        // Remove trailing slash
        this.bossUrl = url.replace(/\/+$/, '');
        this.configuredBossUrl = this.bossUrl; // Store the original configured URL

        Logger.log(`[HttpClientService] Connecting to Boss at ${this.bossUrl}...`);

        try {
            // 1. Verify Boss is reachable via health check
            const health = await this.httpGet(`${this.bossUrl}/api/health`, {}, 8000).catch(() => null);
            if (!health?.status) {
                return { success: false, error: 'Không thể kết nối tới Boss. Kiểm tra địa chỉ và relay server đã bật chưa.' };
            }

            // 2. Start local HTTP server for LAN callback fallback (non-fatal if fails)
            this.callbackUrl = '';
            try {
                await this.startLocalServer();
                this.callbackUrl = `http://${this.getLocalIP()}:${this.localPort}`;
                Logger.log(`[HttpClientService] LAN callback server ready at ${this.callbackUrl}`);
            } catch {
                // WAN-only mode — local server not needed, SSE is the only channel
                Logger.log('[HttpClientService] Local server not available (WAN-only mode)');
            }

            // 3. Register with Boss via heartbeat (sends callbackUrl for LAN fallback)
            const hbResult = await this.httpPost(
                `${this.bossUrl}/api/auth/heartbeat`,
                { callbackUrl: this.callbackUrl },
                { Authorization: `Bearer ${token}` }
            );

            if (!hbResult.success) {
                this.stopLocalServer(); // Clean up local server before returning
                return { success: false, error: hbResult.error || 'Không thể kết nối tới Boss' };
            }

            this.connected = true;
            Logger.log('[HttpClientService] ✅ Connected to Boss');
            this.onStatusChange?.(true, 0, this.isUsingLan);
            this.startHeartbeat();

            // 4. Start Socket.IO for real-time event delivery (primary transport)
            this.socketIOClient.setWorkspaceId(this.workspaceId);
            this.socketIOClient.setOnEvent((channel, eventData) => {
                this.handlePushedEvent(channel, eventData);
            });
            let isInitialSocketConnect = true;
            this.socketIOClient.setOnStatusChange((connected) => {
                Logger.log(`[HttpClientService] Socket.IO ${connected ? '🟢' : '🔴'} (workspace=${this.workspaceId})`);
                if (connected) {
                    if (!isInitialSocketConnect) {
                        Logger.log(`[HttpClientService] ⚡ Socket.IO reconnected! Requesting snapshot & triggering catch-up...`);
                        this.requestSnapshot().catch(() => {});
                        try { this.onSSEReconnected?.(); } catch {}
                    }
                    isInitialSocketConnect = false;
                }
            });
            this.socketIOClient.connect(this.bossUrl, this.token);

            // 5. Fetch initial snapshot
            try {
                const snapshot = await this.httpGet(
                    `${this.bossUrl}/api/sync/snapshot`,
                    { Authorization: `Bearer ${token}` }
                );
                if (snapshot?.success && snapshot?.snapshot) {
                    this.onInitialState?.(snapshot.snapshot);
                }
            } catch (_) {
                // Non-critical
            }

            // 6. Save last known LAN details for manual triggering
            if (Array.isArray(hbResult.localIps) && hbResult.port) {
                this.lastKnownLocalIps = hbResult.localIps;
                this.lastKnownPort = hbResult.port;
            }

            return { success: true };
        } catch (err: any) {
            Logger.error(`[HttpClientService] Connect error: ${err.message}`);
            this.stopLocalServer();
            return { success: false, error: err.message };
        }
    }

    public disconnect(): void {
        this.stopHeartbeat();
        this.stopLocalServer();
        this.socketIOClient.disconnect();
        
        try {
            this.onStatusChange?.(false, 0, false);
        } catch {}

        this.onStatusChange = null;
        this.onInitialState = null;
        this.onAccountAccessUpdate = null;
        this.onSyncProgress = null;
        this.connected = false;
        this.callbackUrl = '';
        
        // Revert active bossUrl to configured URL on disconnect
        if (this.isUsingLan) {
            Logger.log(`[HttpClientService] Disconnecting LAN: reverting bossUrl to configured WAN URL: ${this.configuredBossUrl}`);
            this.bossUrl = this.configuredBossUrl;
            this.isUsingLan = false;
        }
        
        Logger.log('[HttpClientService] Disconnected');
    }

    public isConnected(): boolean {
        return this.connected;
    }

    public getBossUrl(): string {
        return this.bossUrl;
    }

    public getToken(): string {
        return this.token;
    }

    public getStatus(): { connected: boolean; bossUrl: string; latency: number; isUsingLan: boolean } {
        return { connected: this.connected, bossUrl: this.bossUrl, latency: this.latencyMs, isUsingLan: this.isUsingLan };
    }

    public async triggerManualLanProbe(): Promise<{ success: boolean; error?: string }> {
        if (this.isUsingLan) {
            return { success: true };
        }
        if (this.lastKnownLocalIps.length === 0) {
            return { success: false, error: 'Chưa nhận được danh sách IP LAN từ Boss' };
        }
        
        await this.probeAndSwitchToLan(this.lastKnownLocalIps, this.lastKnownPort);
        
        if (this.isUsingLan) {
            return { success: true };
        } else {
            return { success: false, error: 'Không tìm thấy máy Boss trong mạng LAN' };
        }
    }

    public revertToWan(): void {
        if (!this.isUsingLan) return;
        Logger.log(`[HttpClientService] Manually reverting bossUrl to configured WAN URL: ${this.configuredBossUrl}`);
        this.bossUrl = this.configuredBossUrl;
        this.isUsingLan = false;
        
        // Reconnect Socket.IO to WAN
        this.socketIOClient.connect(this.bossUrl, this.token);
        
        // Notify manager and UI of status change to WAN
        this.onStatusChange?.(true, this.latencyMs, false);
        
        // Update RestQueryService too
        try {
            const RestQueryService = require('./RestQueryService').default;
            RestQueryService.getInstance().init(this.bossUrl, this.token);
        } catch (err: any) {
            Logger.warn(`[HttpClientService] Failed to reinit RestQueryService: ${err.message}`);
        }
    }

    // ─── Proxy actions through Boss ──────────────────────────────────

    public async proxyAction(channel: string, params: any): Promise<any> {
        if (!this.connected || this.degraded) {
            // Trả về lỗi mềm thay vì throw để tránh Unhandled Rejection crash app
            return { success: false, error: 'Mất kết nối tới Boss. Đang chờ kết nối lại...' };
        }

        return this.httpPost(
            `${this.bossUrl}/api/proxy/action`,
            { channel, params },
            { Authorization: `Bearer ${this.token}` },
            30000
        );
    }

    /**
     * Đánh dấu ngay lập tức là đã mất kết nối (không chờ heartbeat thất bại).
     * Dùng khi nhận powerMonitor.resume hoặc network-offline.
     * Heartbeat sẽ tiếp tục chạy ngầm, khi kết nối lại thành công sẽ tự clear degraded.
     */
    public markDisconnectedImmediately(): void {
        if (!this.connected && this.degraded) return; // Đã ở trạng thái này rồi
        Logger.log('[HttpClientService] ⚡ Marking connection as degraded immediately (sleep/network change detected)');
        this.connected = false;
        this.degraded = true;
        this.consecutiveHeartbeatFailures = 0;
        // Rollback sang WAN URL nếu đang dùng LAN
        if (this.isUsingLan) {
            Logger.log(`[HttpClientService] LAN reverted to WAN on degraded: ${this.configuredBossUrl}`);
            this.bossUrl = this.configuredBossUrl;
            this.isUsingLan = false;
        }
        this.onStatusChange?.(false, 0, false);
    }

    /**
     * Fast ping tới máy chủ Boss (timeout 2500ms) để xác thực trạng thái kết nối tức thì khi Window Focus / Wake-up.
     */
    public async fastPing(): Promise<{ success: boolean; latency?: number; error?: string }> {
        if (!this.bossUrl || !this.token) {
            return { success: false, error: 'Chưa cấu hình thông tin máy chủ Boss' };
        }

        const start = Date.now();
        try {
            const result = await this.httpPost(
                `${this.bossUrl}/api/auth/heartbeat`,
                { callbackUrl: this.callbackUrl },
                { Authorization: `Bearer ${this.token}` },
                2500
            );

            if (result?.success) {
                const latency = Date.now() - start;
                this.latencyMs = latency;
                this.consecutiveHeartbeatFailures = 0;
                const wasDisconnected = !this.connected || this.degraded;
                this.connected = true;
                this.degraded = false;
                this.onStatusChange?.(true, this.latencyMs, this.isUsingLan);

                if (wasDisconnected) {
                    Logger.log(`[HttpClientService] 🟢 Fast ping re-established connection to ${this.bossUrl}!`);
                }

                // Tự động kết nối lại Socket.IO nếu đang rớt
                if (!this.socketIOClient.isConnected()) {
                    this.socketIOClient.reconnectIfNeeded();
                }

                return { success: true, latency };
            } else {
                return { success: false, error: result?.error || 'Fast ping thất bại' };
            }
        } catch (err: any) {
            this.consecutiveHeartbeatFailures++;
            if (this.consecutiveHeartbeatFailures >= 2) {
                this.connected = false;
                this.degraded = true;
                this.onStatusChange?.(false, 0, false);
            }
            return { success: false, error: err.message };
        }
    }

    // ─── Media request ────────────────────────────────────────────────

    public async requestMedia(filePath: string): Promise<{ success: boolean; data?: Buffer; fileName?: string; error?: string }> {
        if (!this.connected) {
            return { success: false, error: 'Not connected' };
        }

        try {
            return await this.httpPostRaw(
                `${this.bossUrl}/api/media/request`,
                { filePath },
                { Authorization: `Bearer ${this.token}` },
                60000
            );
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    // ─── Media upload (Employee → Boss) ──────────────────────────────

    /**
     * Upload a media file from Employee to Boss storage.
     * Boss saves the file and returns its absolute path.
     */
    public async uploadMedia(base64: string, filename: string, zaloId?: string): Promise<{ success: boolean; bossPath?: string; error?: string }> {
        if (!this.connected) {
            return { success: false, error: 'Not connected' };
        }

        // 2MB chunk size in characters for base64 (around 1.5MB binary)
        const CHUNK_SIZE = 2 * 1024 * 1024;
        
        // If file is small, use legacy upload directly to maintain compatibility and speed
        if (base64.length <= CHUNK_SIZE) {
            try {
                return await this.httpPost(
                    `${this.bossUrl}/api/media/upload`,
                    { base64, filename, zaloId },
                    { Authorization: `Bearer ${this.token}` },
                    120000 // 2 phút cho ảnh lớn qua tunnel
                );
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        }

        // Otherwise, split into chunks and upload via /api/media/upload-chunk
        const { v4: uuidv4 } = require('uuid');
        const uploadId = uuidv4();
        const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);

        Logger.log(`[HttpClientService] Starting chunked upload for ${filename}: size=${base64.length} chars, totalChunks=${totalChunks}, uploadId=${uploadId}`);

        let bossPath = '';
        for (let i = 0; i < totalChunks; i++) {
            const chunkBase64 = base64.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            try {
                const res = await this.httpPost(
                    `${this.bossUrl}/api/media/upload-chunk`,
                    {
                        uploadId,
                        chunkIndex: i,
                        totalChunks,
                        filename,
                        zaloId,
                        chunkBase64,
                    },
                    { Authorization: `Bearer ${this.token}` },
                    120000
                );
                if (!res || !res.success) {
                    return { success: false, error: res?.error || `Chunk ${i} upload failed` };
                }
                if (res.completed && res.bossPath) {
                    bossPath = res.bossPath;
                }
            } catch (err: any) {
                return { success: false, error: `Chunk ${i} failed: ${err.message}` };
            }
        }

        if (!bossPath) {
            return { success: false, error: 'Chunked upload finished but bossPath was not returned' };
        }

        return { success: true, bossPath };
    }

    // ─── Callbacks ────────────────────────────────────────────────────

    public setOnStatusChange(cb: (connected: boolean, latency: number, isUsingLan?: boolean) => void): void {
        this.onStatusChange = cb;
    }
    public setOnInitialState(cb: (data: any) => void): void {
        this.onInitialState = cb;
    }
    public setOnAccountAccessUpdate(cb: (data: any) => void): void {
        this.onAccountAccessUpdate = cb;
    }
    public setOnSyncProgress(cb: (phase: string, percent: number) => void): void {
        this.onSyncProgress = cb;
    }
    public setOnSSEReconnected(cb: () => void): void {
        this.onSSEReconnected = cb;
    }
    public setWorkspaceId(id: string): void {
        this.workspaceId = id;
    }
    public setLastSyncTs(ts: number): void {
        this.lastSyncTs = ts;
    }
    public getLastSyncTs(): number {
        return this.lastSyncTs;
    }

    // ─── Data Sync ────────────────────────────────────────────────────

    /** Request fresh account/employee snapshot from Boss (for SSE reconnect recovery) */
    public async requestSnapshot(): Promise<{ success: boolean; snapshot?: any; error?: string }> {
        if (!this.connected) {
            return { success: false, error: 'Chưa kết nối tới BOSS' };
        }
        try {
            const result = await this.httpGet(
                `${this.bossUrl}/api/sync/snapshot`,
                { Authorization: `Bearer ${this.token}` },
                15000
            );
            if (!result?.success || !result?.snapshot) {
                return { success: false, error: result?.error || 'Snapshot failed' };
            }
            // Forward snapshot to renderer as initialState (refreshes account status)
            this.onInitialState?.(result.snapshot);
            Logger.log(`[HttpClientService] Snapshot refreshed: assigned=${result.snapshot.assignedAccounts?.length || 0}, online=${result.snapshot.onlineAccounts?.length || 0}`);
            return { success: true, snapshot: result.snapshot };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    public async requestFullSync(_zaloIds: string[]): Promise<{ success: boolean; payload?: SyncPayload; syncTs?: number; error?: string }> {
        if (!this.connected) {
            return { success: false, error: 'Chưa kết nối tới BOSS' };
        }

        try {
            this.onSyncProgress?.('Đang yêu cầu dữ liệu...', 0);
            const result = await this.httpGet(
                `${this.bossUrl}/api/sync/full`,
                { Authorization: `Bearer ${this.token}` },
                600000
            );

            if (!result?.success) {
                // Log chi tiết lý do sync thất bại
                Logger.error(`[HttpClientService] Full sync failed: ${result?.error || 'unknown'}. Boss may have 100k+ messages - try increasing server timeout or reducing batch size.`);
                return { success: false, error: result?.error || 'Sync failed - dữ liệu quá lớn, vui lòng thử lại' };
            }

            this.onSyncProgress?.('Đang xử lý dữ liệu...', 50);
            return { success: true, payload: result.payload, syncTs: result.syncTs };
        } catch (err: any) {
            Logger.error(`[HttpClientService] Full sync exception: ${err.message}. Boss may have too many messages - consider paginated sync.`);
            return { success: false, error: err.message };
        }
    }

    public async requestDeltaSync(sinceTs: number): Promise<{ success: boolean; payload?: SyncPayload; syncTs?: number; error?: string }> {
        if (!this.connected) {
            return { success: false, error: 'Chưa kết nối tới BOSS' };
        }

        try {
            this.onSyncProgress?.('Đang yêu cầu cập nhật...', 0);
            const result = await this.httpGet(
                `${this.bossUrl}/api/sync/delta?sinceTs=${sinceTs}`,
                { Authorization: `Bearer ${this.token}` },
                600000
            );

            if (!result?.success) {
                return { success: false, error: result?.error || 'Delta sync failed' };
            }

            this.onSyncProgress?.('Đang xử lý cập nhật...', 50);
            return { success: true, payload: result.payload, syncTs: result.syncTs };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    public async performFullSync(zaloIds: string[]): Promise<{ success: boolean; syncTs?: number; error?: string }> {
        try {
            this.onSyncProgress?.('Đang tải dữ liệu từ Boss...', 5);
            const result = await this.requestFullSync(zaloIds);
            if (!result.success || !result.payload) {
                this.onSyncProgress?.(`Lỗi: ${result.error}`, 0);
                return { success: false, error: result.error };
            }

            this.onSyncProgress?.('Đang nhập dữ liệu...', 55);
            DataSyncService.getInstance().importFullSync(
                result.payload,
                zaloIds,
                (phase, percent) => {
                    this.onSyncProgress?.(phase, 55 + Math.round(percent * 0.45));
                }
            );

            // Track sync timestamp for auto delta sync on reconnect
            if (result.syncTs) {
                this.lastSyncTs = result.syncTs;
            }

            this.onSyncProgress?.('Hoàn tất đồng bộ!', 100);
            return { success: true, syncTs: result.syncTs };
        } catch (err: any) {
            Logger.error(`[HttpClientService] Full sync error: ${err.message}`);
            this.onSyncProgress?.(`Lỗi: ${err.message}`, 0);
            return { success: false, error: err.message };
        }
    }

    public async performDeltaSync(sinceTs: number): Promise<{ success: boolean; syncTs?: number; error?: string }> {
        try {
            this.onSyncProgress?.('Đang kiểm tra cập nhật...', 5);
            const result = await this.requestDeltaSync(sinceTs);
            if (!result.success || !result.payload) {
                return { success: false, error: result.error };
            }

            const totalRows = Object.values(result.payload.tables).reduce((s, arr) => s + arr.length, 0);
            const hasPrivateSnapshots = ['erp_calendar_events', 'erp_event_reminders', 'erp_event_attendees', 'erp_note_folders', 'erp_notes', 'erp_note_shares', 'erp_note_versions', 'erp_note_tag_map', 'erp_note_tags']
                .some(tableName => Object.prototype.hasOwnProperty.call(result.payload?.tables || {}, tableName));
            if (totalRows === 0 && !hasPrivateSnapshots) {
                this.onSyncProgress?.('Không có cập nhật mới', 100);
                return { success: true, syncTs: result.syncTs };
            }

            this.onSyncProgress?.('Đang cập nhật dữ liệu...', 50);
            DataSyncService.getInstance().importDeltaSync(
                result.payload,
                (phase, percent) => {
                    this.onSyncProgress?.(phase, 50 + Math.round(percent * 0.5));
                }
            );

            // Track sync timestamp for auto delta sync on reconnect
            if (result.syncTs) {
                this.lastSyncTs = result.syncTs;
            }

            this.onSyncProgress?.('Hoàn tất cập nhật!', 100);
            return { success: true, syncTs: result.syncTs };
        } catch (err: any) {
            Logger.error(`[HttpClientService] Delta sync error: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    // ─── Local HTTP Server (legacy fallback — kept for backward compat) ──

    /** Local HTTP server for LAN callback fallback — boss can push events via POST when SSE is down. */
    private startLocalServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.localServer) {
                resolve();
                return;
            }

            this.localServer = http.createServer((req, res) => {
                if (req.method === 'POST' && req.url === '/event') {
                    const chunks: any[] = [];
                    req.on('data', (chunk: any) => { chunks.push(chunk); });
                    req.on('end', () => {
                        try {
                            let body = '';
                            if (chunks.length > 0) {
                                if (typeof chunks[0] === 'string') {
                                    body = chunks.join('');
                                } else {
                                    body = Buffer.concat(chunks).toString('utf8');
                                }
                            }
                            const { channel, data } = JSON.parse(body);
                            this.handlePushedEvent(channel, data);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end('{"ok":true}');
                        } catch (err) {
                            res.writeHead(400);
                            res.end('{"error":"bad request"}');
                        }
                    });
                    return;
                }

                // Health
                if (req.method === 'GET' && req.url === '/health') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end('{"status":"ok"}');
                    return;
                }

                res.writeHead(404);
                res.end();
            });

            // Try ports 9901-9910 if default is busy
            const tryListen = (port: number, attempts: number) => {
                this.localServer!.listen(port, () => {
                    this.localPort = port;
                    Logger.log(`[HttpClientService] Local event server started on port ${port}`);
                    resolve();
                });
                this.localServer!.on('error', (err: any) => {
                    if (err.code === 'EADDRINUSE' && attempts > 0) {
                        this.localServer!.removeAllListeners('error');
                        tryListen(port + 1, attempts - 1);
                    } else {
                        reject(new Error(`Cannot start local server: ${err.message}`));
                    }
                });
            };

            tryListen(this.localPort, 10);
        });
    }

    private stopLocalServer(): void {
        if (this.localServer) {
            try { this.localServer.close(); } catch (_) {}
            this.localServer = null;
        }
    }

    private handlePushedEvent(channel: string, data: any): void {
        // Special relay channels
        if (channel === 'relay:initialState') {
            Logger.log(`[HttpClientService] Received initial state push: assigned=${data?.assignedAccounts?.length || 0}`);
            this.onInitialState?.(data);
            return;
        }
        if (channel === 'relay:accountAccessUpdate') {
            Logger.log(`[HttpClientService] Account access updated: assigned=${data?.assignedAccounts?.length || 0}`);
            this.onAccountAccessUpdate?.(data);
            return;
        }
        if (channel === 'relay:kicked') {
            Logger.log(`[HttpClientService] Kicked by boss: ${data?.reason}`);
            this.disconnect();
            this.onStatusChange?.(false, 0);
            return;
        }
        if (channel === 'relay:fallbackDeltaSync') {
            Logger.warn(`[HttpClientService] SSE recovery miss! Triggering fallback delta sync.`);
            try { this.onSSEReconnected?.(); } catch {}
            return;
        }
        if (channel === 'db:workflowChanged') {
            Logger.log(`[HttpClientService] Received workflow changed event: action=${data?.action} id=${data?.id || data?.workflow?.id}`);
            try {
                const DatabaseService = require('../database/DatabaseService').default;
                const WorkflowEngineService = require('../workflow/WorkflowEngineService').default;
                const db = DatabaseService.getInstance();
                
                // Resolve target DB path for this workspace
                const WorkspaceManager = require('../../utils/WorkspaceManager').default;
                let targetDbPath: string | null = null;
                if (this.workspaceId) {
                    const ws = WorkspaceManager.getInstance().getWorkspaceById(this.workspaceId);
                    if (ws) targetDbPath = WorkspaceManager.getInstance().resolveDbPath(ws.dbPath || 'zagi-tool.db');
                }
                const activeDbPath = db.getDbPath();

                const updateLocalDb = () => {
                    if (data.action === 'save' && data.workflow) {
                        db.saveWorkflow(data.workflow);
                        WorkflowEngineService.getInstance().reloadWorkflow(data.workflow.id);
                    } else if (data.action === 'delete' && data.id) {
                        db.deleteWorkflow(data.id);
                        WorkflowEngineService.getInstance().removeWorkflow(data.id);
                    } else if (data.action === 'toggle' && data.id) {
                        db.toggleWorkflow(data.id, data.enabled);
                        WorkflowEngineService.getInstance().reloadWorkflow(data.id);
                    }
                };

                if (targetDbPath && targetDbPath !== activeDbPath) {
                    db.withDbPath(targetDbPath, () => {
                        updateLocalDb();
                        db.save();
                    });
                } else {
                    updateLocalDb();
                    db.save();
                }

                // Forward to renderer so store merges changes
                const activeWsId = WorkspaceManager.getInstance().getActiveWorkspaceId();
                if (activeWsId === this.workspaceId) {
                    const EventBroadcaster = require('../event/EventBroadcaster').default;
                    EventBroadcaster.sendDirect(channel, data);
                }
            } catch (err: any) {
                Logger.warn(`[HttpClientService] db:workflowChanged sync error: ${err.message}`);
            }
            return;
        }

        if (channel === 'db:integrationChanged') {
            Logger.log(`[HttpClientService] Received integration changed event: action=${data?.action} id=${data?.id || data?.integration?.id}`);
            try {
                const DatabaseService = require('../database/DatabaseService').default;
                const IntegrationRegistry = require('../integrations/IntegrationRegistry').IntegrationRegistry;
                const db = DatabaseService.getInstance();
                
                // Resolve target DB path for this workspace
                const WorkspaceManager = require('../../utils/WorkspaceManager').default;
                let targetDbPath: string | null = null;
                if (this.workspaceId) {
                    const ws = WorkspaceManager.getInstance().getWorkspaceById(this.workspaceId);
                    if (ws) targetDbPath = WorkspaceManager.getInstance().resolveDbPath(ws.dbPath || 'zagi-tool.db');
                }
                const activeDbPath = db.getDbPath();

                const updateLocalDb = () => {
                    if (data.action === 'save' && data.integration) {
                        db.upsertIntegration(data.integration);
                        IntegrationRegistry.reloadAdapter(data.integration.id);
                    } else if (data.action === 'delete' && data.id) {
                        db.deleteIntegration(data.id);
                        IntegrationRegistry.reloadAdapter(data.id);
                    } else if (data.action === 'toggle' && data.id) {
                        db.toggleIntegration(data.id, data.enabled);
                        IntegrationRegistry.reloadAdapter(data.id);
                    }
                };

                if (targetDbPath && targetDbPath !== activeDbPath) {
                    db.withDbPath(targetDbPath, () => {
                        updateLocalDb();
                        db.save();
                    });
                } else {
                    updateLocalDb();
                    db.save();
                }

                // Forward to renderer so store merges changes
                const activeWsId = WorkspaceManager.getInstance().getActiveWorkspaceId();
                if (activeWsId === this.workspaceId) {
                    const EventBroadcaster = require('../event/EventBroadcaster').default;
                    EventBroadcaster.sendDirect(channel, data);
                }
            } catch (err: any) {
                Logger.warn(`[HttpClientService] db:integrationChanged sync error: ${err.message}`);
            }
            return;
        }

        // Forward Zalo events to local EventBroadcaster
        // Use sendDirect to bypass onBeforeSend hooks — prevents infinite relay loop
        // when HttpRelayService hooks are active in the same process.
        if (channel === 'event:message' && data?.zaloId && data?.message) {
            this.saveRelayMessageToWorkspaceDb(data.zaloId, data.message);
            this.triggerWorkflowEngine(channel, data);
            return;
        }

        // Persist reaction to employee DB (regardless of whether workspace is active),
        // then forward to renderer if active. Mirrors saveRelayMessageToWorkspaceDb logic.
        if (channel === 'event:reaction' && data?.zaloId && data?.reaction) {
            this.saveRelayReactionToWorkspaceDb(data.zaloId, data.reaction);
            this.triggerWorkflowEngine(channel, data);
            return;
        }

        // Persist undo/recall to employee DB — boss uses runOnBossDb, so employee DB
        // must be updated separately on the employee side.
        if (channel === 'event:undo' && data?.zaloId && data?.msgId) {
            this.saveRelayRecallToWorkspaceDb('event:undo', data, data.zaloId, [String(data.msgId)], data.threadId);
            this.triggerWorkflowEngine(channel, data);
            return;
        }

        // Persist delete (chat.delete) to employee DB — same as undo, mark as recalled.
        if (channel === 'event:delete' && data?.zaloId && Array.isArray(data?.msgIds) && data.msgIds.length) {
            this.saveRelayRecallToWorkspaceDb('event:delete', data, data.zaloId, data.msgIds.map(String), data.threadId);
            this.triggerWorkflowEngine(channel, data);
            return;
        }

        // Employee sender info: update DB + forward to renderer for store merge
        if (channel === 'relay:messageSentByEmployee' && data?.zaloId && data?.employee_id) {
            try {
                const DatabaseService = require('../database/DatabaseService').default;
                const WorkspaceManager = require('../../utils/WorkspaceManager').default;
                const db = DatabaseService.getInstance();

                // Resolve target DB path for this workspace
                let targetDbPath: string | null = null;
                if (this.workspaceId) {
                    const ws = WorkspaceManager.getInstance().getWorkspaceById(this.workspaceId);
                    if (ws) targetDbPath = WorkspaceManager.getInstance().resolveDbPath(ws.dbPath || 'zagi-tool.db');
                }
                const activeDbPath = db.getDbPath();
                const msgId = String(data.msgId || '');
                const cliMsgId = String(data.cliMsgId || data.cli_msg_id || '');
                const threadId = String(data.threadId || data.thread_id || '');

                // Update DB (match by msg_id OR cli_msg_id when available)
                if (msgId || cliMsgId) {
                    const updateFn = () => {
                        if (msgId) db.setMessageHandledByEmployeeFlexible(data.zaloId, msgId, data.employee_id);
                        if (cliMsgId && cliMsgId !== msgId) db.setMessageHandledByEmployeeFlexible(data.zaloId, cliMsgId, data.employee_id);
                    };
                    if (targetDbPath && targetDbPath !== activeDbPath) {
                        db.withDbPath(targetDbPath, updateFn);
                    } else {
                        updateFn();
                    }
                } else if (threadId) {
                    // Thread-based fallback for attachment-only sends (image/file) where msgId is empty
                    const updateFn = () => {
                        try {
                            const rows = db.query(
                                `SELECT msg_id FROM messages WHERE owner_zalo_id = ? AND thread_id = ? AND is_sent = 1
                                 AND handled_by_employee IS NULL ORDER BY timestamp DESC LIMIT 1`,
                                [data.zaloId, threadId]
                            ) as any[];
                            if (rows?.[0]?.msg_id) {
                                db.setMessageHandledByEmployee(data.zaloId, String(rows[0].msg_id), data.employee_id);
                            }
                        } catch {}
                    };
                    if (targetDbPath && targetDbPath !== activeDbPath) {
                        db.withDbPath(targetDbPath, updateFn);
                    } else {
                        updateFn();
                    }
                }

                // Forward to renderer so useZaloEvents can update the store
                const activeWsId = WorkspaceManager.getInstance().getActiveWorkspaceId();
                if (activeWsId === this.workspaceId) {
                    EventBroadcaster.sendDirect(channel, data);
                }
                Logger.log(`[HttpClientService] relay:messageSentByEmployee DB update: msgId="${msgId}", threadId="${threadId}", empId="${data.employee_id}"`);
            } catch (err: any) {
                Logger.warn(`[HttpClientService] relay:messageSentByEmployee error: ${err.message}`);
            }
            return;
        }

        // Persist conversation-level events from Boss to employee's local DB
        // (labels, pins, quick messages, CRM, pinned conversations, contact settings)
        if (HttpClientService.FORWARD_CHANNELS.includes(channel)) {
            this.persistRelayConversationEvent(channel, data);
            this.triggerWorkflowEngine(channel, data);
            // Only forward to renderer when this employee workspace is the active one.
            try {
                const WorkspaceManager = require('../../utils/WorkspaceManager').default;
                const activeWsId = WorkspaceManager.getInstance().getActiveWorkspaceId();
                if (activeWsId === this.workspaceId) {
                    EventBroadcaster.sendDirect(channel, data);
                } else {
                    Logger.log(`[HttpClientService] Skipping renderer forward for ${channel}: activeWs="${activeWsId}" !== ourWs="${this.workspaceId}"`);
                }
            } catch {
                EventBroadcaster.sendDirect(channel, data);
            }
        }
    }

    /**
     * Kích hoạt workflow engine cục bộ khi nhận sự kiện chuyển tiếp từ Boss
     */
    private triggerWorkflowEngine(channel: string, data: any): void {
        try {
            const EVENT_MAP: Record<string, string> = {
                'event:message':       'trigger.message',
                'event:friendRequest': 'trigger.friendRequest',
                'event:groupEvent':    'trigger.groupEvent',
                'event:reaction':      'trigger.reaction',
                'event:undo':          'trigger.undo',
                'db:localLabelThreadChanged': 'trigger.labelAssigned',
                'integration:payment': 'trigger.payment',
            };

            const triggerType = EVENT_MAP[channel];
            if (!triggerType) return;

            const WorkflowEngineService = require('../workflow/WorkflowEngineService').default;
            
            let triggerData = data;
            if (channel === 'db:localLabelThreadChanged') {
                const db = require('../database/DatabaseService').default.getInstance();
                const label = db.getLocalLabel(data.labelId);
                triggerData = {
                    zaloId: data.zaloId,
                    threadId: data.threadId,
                    threadType: data.threadId?.startsWith('g') ? 1 : 0,
                    labelId: data.labelId,
                    labelText: label?.name || '',
                    labelColor: label?.color || '',
                    labelEmoji: label?.emoji || '',
                    labelSource: 'local',
                    action: data.action || 'assigned',
                };
            }

            WorkflowEngineService.getInstance().triggerWorkflows(triggerType, triggerData);
            Logger.log(`[HttpClientService] Triggered workflow engine for ${channel} -> ${triggerType}`);
        } catch (err: any) {
            Logger.warn(`[HttpClientService] Failed to trigger workflow engine for ${channel}: ${err.message}`);
        }
    }

    /**
     * Persist conversation-level relay events from Boss to the employee's local DB.
     * Without this, the renderer re-fetches from an empty local DB and sees nothing.
     */
    private persistRelayConversationEvent(channel: string, data: any): void {
        try {
            const DatabaseService = require('../database/DatabaseService').default;
            const WorkspaceManager = require('../../utils/WorkspaceManager').default;
            const db = DatabaseService.getInstance();

            // Resolve workspace DB path
            let targetDbPath: string | null = null;
            if (this.workspaceId) {
                const ws = WorkspaceManager.getInstance().getWorkspaceById(this.workspaceId);
                if (ws) targetDbPath = WorkspaceManager.getInstance().resolveDbPath(ws.dbPath || 'zagi-tool.db');
            }
            const runOnWsDb = (fn: () => void) => {
                if (targetDbPath && targetDbPath !== db.getDbPath()) {
                    db.withDbPath(targetDbPath, fn);
                } else {
                    fn();
                }
            };

            // ── Labels ──
            if (channel === 'db:localLabelChanged' && data) {
                runOnWsDb(() => {
                    if (data.action === 'upsert' && data.label) {
                        db.upsertLocalLabel(data.label);
                    } else if (data.action === 'delete' && data.labelId != null) {
                        db.deleteLocalLabel(data.labelId);
                    } else if (data.action === 'active' && data.labelId != null) {
                        db.setLocalLabelActive(data.labelId, data.isActive);
                    } else if (data.action === 'reorder' && data.labelId != null) {
                        db.setLocalLabelOrder(data.labelId, data.order);
                    }
                });
                return;
            }

            // ── Label-Thread assignments ──
            if (channel === 'db:localLabelThreadChanged' && data) {
                runOnWsDb(() => {
                    if (data.action === 'assign' && data.ownerZaloId && data.labelId != null && data.threadId) {
                        db.assignLocalLabelToThread(data.ownerZaloId, data.labelId, data.threadId);
                    } else if (data.action === 'remove' && data.ownerZaloId && data.labelId != null && data.threadId) {
                        db.removeLocalLabelFromThread(data.ownerZaloId, data.labelId, data.threadId);
                    }
                });
                return;
            }

            // ── Pinned messages ──
            if (channel === 'db:pinnedMessageChanged' && data) {
                runOnWsDb(() => {
                    if (data.action === 'pin' && data.ownerZaloId && data.threadId && data.pin) {
                        db.pinMessage(data.ownerZaloId, data.threadId, data.pin);
                    } else if (data.action === 'unpin' && data.ownerZaloId && data.threadId && data.msgId) {
                        db.unpinMessage(data.ownerZaloId, data.threadId, data.msgId);
                    } else if (data.action === 'bringToTop' && data.ownerZaloId && data.threadId && data.msgId) {
                        db.bringPinnedToTop(data.ownerZaloId, data.threadId, data.msgId);
                    }
                });
                return;
            }

            // ── Quick messages ──
            if (channel === 'db:localQuickMessageChanged' && data) {
                runOnWsDb(() => {
                    if (data.action === 'upsert' && data.ownerZaloId && data.item) {
                        db.upsertLocalQuickMessage(data.ownerZaloId, data.item);
                    } else if (data.action === 'delete' && data.ownerZaloId && data.id != null) {
                        db.deleteLocalQuickMessage(data.ownerZaloId, data.id);
                    } else if (data.action === 'active' && data.id != null) {
                        db.setLocalQMActive(data.id, data.isActive);
                    } else if (data.action === 'reorder' && data.id != null) {
                        db.setLocalQMOrder(data.id, data.order);
                    }
                });
                return;
            }

            // ── CRM notes ──
            if (channel === 'crm:noteChanged' && data) {
                runOnWsDb(() => {
                    if (data.action === 'save' && data.note) {
                        db.saveCRMNote({ ...data.note, owner_zalo_id: data.ownerZaloId });
                    } else if (data.action === 'delete' && data.noteId != null) {
                        db.deleteCRMNote(data.noteId, data.ownerZaloId);
                    }
                });
                return;
            }

            // ── CRM campaigns ──
            if (channel === 'crm:campaignChanged' && data) {
                runOnWsDb(() => {
                    if (data.action === 'save' && data.campaign) {
                        db.saveCRMCampaign({ ...data.campaign, owner_zalo_id: data.ownerZaloId });
                    } else if (data.action === 'delete' && data.campaignId != null) {
                        db.deleteCRMCampaign(data.campaignId, data.ownerZaloId);
                    } else if (data.action === 'status' && data.campaignId != null) {
                        db.updateCRMCampaignStatus(data.campaignId, data.status);
                    }
                });
                return;
            }

            if (channel === 'crm:queueUpdate' && data) {
                runOnWsDb(() => {
                    if (data.campaignId && data.contactId) {
                        db.updateCampaignContactStatusByContactId(data.campaignId, data.contactId, data.status, data.error);
                        const contacts = db.getCampaignContacts(data.campaignId);
                        const hasPending = contacts.some((c: any) => c.status === 'pending' || c.status === 'sending');
                        if (!hasPending && contacts.length > 0) {
                            db.updateCRMCampaignStatus(data.campaignId, 'done');
                            db.save();
                            EventBroadcaster.sendDirect('crm:campaignChanged', { action: 'status', ownerZaloId: data.zaloId || '', campaignId: data.campaignId, status: 'done' });
                        }
                    }
                });
                return;
            }

            if (channel === 'crm:campaignDone' && data) {
                runOnWsDb(() => {
                    if (data.campaignId) {
                        db.updateCRMCampaignStatus(data.campaignId, 'done');
                        db.save();
                        EventBroadcaster.sendDirect('crm:campaignChanged', { action: 'status', ownerZaloId: data.zaloId || '', campaignId: data.campaignId, status: 'done' });
                    }
                });
                return;
            }

            // ── Pinned conversations ──
            if (channel === 'db:pinnedConversationChanged' && data) {
                runOnWsDb(() => {
                    if (data.ownerZaloId && data.threadId) {
                        db.setLocalPinnedConversation(data.ownerZaloId, data.threadId, data.isPinned);
                    }
                });
                return;
            }

            // ── Contact flags ──
            if (channel === 'db:contactFlagsChanged' && data) {
                runOnWsDb(() => {
                    if (data.ownerZaloId && data.contactId && data.flags) {
                        db.setContactFlags(data.ownerZaloId, data.contactId, data.flags);
                    }
                });
                return;
            }

            // ── Contact alias ──
            if (channel === 'db:contactAliasChanged' && data) {
                runOnWsDb(() => {
                    if (data.ownerZaloId && data.contactId) {
                        db.setContactAlias(data.ownerZaloId, data.contactId, data.alias);
                    }
                });
                return;
            }

            // ── Mark As Read ──
            if (channel === 'db:markAsRead' && data) {
                runOnWsDb(() => {
                    const zid = data.ownerZaloId || data.zaloId;
                    if (zid && data.contactId) {
                        db.markAsRead(zid, data.contactId);
                    }
                });
                return;
            }

            // ── Shared Media Library Events ──
            if ((channel === 'library:itemAdded' || channel === 'library:itemUpdated' || channel === 'library:itemDeleted') && data) {
                runOnWsDb(() => {
                    EventBroadcaster.sendDirect(channel, data);
                });
                return;
            }

            // ── ERP Notifications ──
            if (channel === 'erp:event:notification' && data?.notification) {
                runOnWsDb(() => {
                    const n = data.notification;
                    db.run(
                        `INSERT OR REPLACE INTO erp_notifications (id, recipient_id, type, title, body, link, payload, read, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            n.id,
                            n.recipient_id,
                            n.type,
                            n.title,
                            n.body || '',
                            n.link || '',
                            typeof n.payload === 'object' ? JSON.stringify(n.payload) : n.payload || '{}',
                            n.read || 0,
                            n.created_at
                        ]
                    );
                });
                return;
            }

            // ── ERP Project ──
            if ((channel === 'erp:event:projectCreated' || channel === 'erp:event:projectUpdated') && data?.project) {
                runOnWsDb(() => {
                    this.upsertRow(db, 'erp_projects', data.project);
                    if (data.project.status === 'archived') {
                        db.run('UPDATE erp_tasks SET archived = 1, updated_at = ? WHERE project_id = ?', [Date.now(), data.project.id]);
                    } else if (data.project.status === 'active') {
                        db.run('UPDATE erp_tasks SET archived = 0, updated_at = ? WHERE project_id = ?', [Date.now(), data.project.id]);
                    }
                });
                return;
            }
            if (channel === 'erp:event:projectDeleted' && data?.projectId) {
                runOnWsDb(() => {
                    db.run('DELETE FROM erp_projects WHERE id = ?', [data.projectId]);
                    db.run('UPDATE erp_tasks SET archived = 1, updated_at = ? WHERE project_id = ?', [Date.now(), data.projectId]);
                });
                return;
            }

            // ── ERP Task ──
            if ((channel === 'erp:event:taskCreated' || channel === 'erp:event:taskUpdated') && data?.task) {
                runOnWsDb(() => {
                    const t = data.task;
                    this.upsertRow(db, 'erp_tasks', t);
                    
                    if (Array.isArray(t.assignees)) {
                        db.run('DELETE FROM erp_task_assignees WHERE task_id = ?', [t.id]);
                        for (const empId of t.assignees) {
                            if (empId) {
                                db.run('INSERT INTO erp_task_assignees (task_id, employee_id, assigned_at) VALUES (?, ?, ?)', [t.id, empId, Date.now()]);
                            }
                        }
                    }
                    
                    if (Array.isArray(t.watchers)) {
                        db.run('DELETE FROM erp_task_watchers WHERE task_id = ?', [t.id]);
                        for (const empId of t.watchers) {
                            if (empId) {
                                db.run('INSERT INTO erp_task_watchers (task_id, employee_id, added_at) VALUES (?, ?, ?)', [t.id, empId, Date.now()]);
                            }
                        }
                    }

                    if (Array.isArray(t.checklist)) {
                        db.run('DELETE FROM erp_task_checklist WHERE task_id = ?', [t.id]);
                        for (const item of t.checklist) {
                            if (item) {
                                this.upsertRow(db, 'erp_task_checklist', item);
                            }
                        }
                    }
                });
                return;
            }
            if (channel === 'erp:event:taskDeleted' && data?.taskId) {
                runOnWsDb(() => {
                    db.run('DELETE FROM erp_tasks WHERE id = ?', [data.taskId]);
                    db.run('DELETE FROM erp_task_assignees WHERE task_id = ?', [data.taskId]);
                    db.run('DELETE FROM erp_task_watchers WHERE task_id = ?', [data.taskId]);
                    db.run('DELETE FROM erp_task_checklist WHERE task_id = ?', [data.taskId]);
                    db.run('DELETE FROM erp_task_comments WHERE task_id = ?', [data.taskId]);
                });
                return;
            }

            // ── ERP Comment ──
            if (channel === 'erp:event:commentAdded' && data?.comment) {
                runOnWsDb(() => {
                    this.upsertRow(db, 'erp_task_comments', data.comment);
                    if (data.task) {
                        this.upsertRow(db, 'erp_tasks', data.task);
                    }
                });
                return;
            }

            // ── ERP Calendar Event ──
            if ((channel === 'erp:event:calendarEventCreated' || channel === 'erp:event:calendarEventUpdated') && data?.event) {
                runOnWsDb(() => {
                    const e = data.event;
                    this.upsertRow(db, 'erp_calendar_events', e);
                    
                    if (Array.isArray(e.attendees)) {
                        db.run('DELETE FROM erp_event_attendees WHERE event_id = ?', [e.id]);
                        for (const att of e.attendees) {
                            const empId = typeof att === 'string' ? att : att.employee_id;
                            if (empId) {
                                db.run('INSERT INTO erp_event_attendees (event_id, employee_id) VALUES (?, ?)', [e.id, empId]);
                            }
                        }
                    }
                });
                return;
            }
            if (channel === 'erp:event:calendarEventDeleted' && data?.eventId) {
                runOnWsDb(() => {
                    db.run('DELETE FROM erp_calendar_events WHERE id = ?', [data.eventId]);
                    db.run('DELETE FROM erp_event_attendees WHERE event_id = ?', [data.eventId]);
                });
                return;
            }
            if (channel === 'erp:event:reminder' && data?.reminder) {
                runOnWsDb(() => {
                    this.upsertRow(db, 'erp_event_reminders', data.reminder);
                });
                return;
            }

            // ── ERP Note ──
            if ((channel === 'erp:event:noteCreated' || channel === 'erp:event:noteUpdated') && data?.note) {
                runOnWsDb(() => {
                    this.upsertRow(db, 'erp_notes', data.note);
                    
                    if (Array.isArray(data.shares)) {
                        db.run('DELETE FROM erp_note_shares WHERE note_id = ?', [data.note.id]);
                        for (const sh of data.shares) {
                            this.upsertRow(db, 'erp_note_shares', sh);
                        }
                    }
                });
                return;
            }
            if (channel === 'erp:event:noteDeleted' && data?.noteId) {
                runOnWsDb(() => {
                    db.run('DELETE FROM erp_notes WHERE id = ?', [data.noteId]);
                    db.run('DELETE FROM erp_note_shares WHERE note_id = ?', [data.noteId]);
                    db.run('DELETE FROM erp_note_versions WHERE note_id = ?', [data.noteId]);
                });
                return;
            }
            if (channel === 'erp:event:noteShared' && data?.noteId) {
                runOnWsDb(() => {
                    if (data.note) {
                        this.upsertRow(db, 'erp_notes', data.note);
                    }
                    if (Array.isArray(data.shares)) {
                        db.run('DELETE FROM erp_note_shares WHERE note_id = ?', [data.noteId]);
                        for (const sh of data.shares) {
                            this.upsertRow(db, 'erp_note_shares', sh);
                        }
                    }
                });
                return;
            }

            // ── ERP HRM ──
            if (channel === 'erp:event:leaveCreated' || channel === 'erp:event:leaveDecided') {
                if (data?.leave) {
                    runOnWsDb(() => {
                        this.upsertRow(db, 'erp_leave_requests', data.leave);
                    });
                }
                return;
            }
            if (channel === 'erp:event:attendanceUpdated' && data?.attendance) {
                runOnWsDb(() => {
                    this.upsertRow(db, 'erp_attendance', data.attendance);
                });
                return;
            }
            if (channel === 'erp:event:departmentUpdated') {
                runOnWsDb(() => {
                    if (data?.deleted && data?.departmentId) {
                        db.run('DELETE FROM erp_departments WHERE id = ?', [data.departmentId]);
                    } else if (data?.department) {
                        this.upsertRow(db, 'erp_departments', data.department);
                    }
                });
                return;
            }
            if (channel === 'erp:event:employeeProfileUpdated' && data?.profile) {
                runOnWsDb(() => {
                    this.upsertRow(db, 'erp_employee_profiles', data.profile);
                });
                return;
            }
            if (channel === 'erp:event:employeeProfileDeleted' && data?.employeeId) {
                runOnWsDb(() => {
                    db.run('DELETE FROM erp_employee_profiles WHERE employee_id = ?', [data.employeeId]);
                });
                return;
            }

            // Developer fallback warning for unhandled ERP SSE events
            if (channel.startsWith('erp:event:')) {
                Logger.warn(`[HttpClientService] Unhandled ERP SSE event channel: ${channel}. Data:`, data);
            }
        } catch (err: any) {
            Logger.warn(`[HttpClientService] persistRelayConversationEvent error (${channel}): ${err.message}`);
        }
    }

    private getTableColumns(db: any, tableName: string): string[] {
        try {
            const rows = db.query(`PRAGMA table_info(${tableName})`);
            return rows.map((r: any) => r.name);
        } catch (err: any) {
            Logger.warn(`[HttpClientService] getTableColumns error for ${tableName}: ${err.message}`);
            return [];
        }
    }

    private upsertRow(db: any, tableName: string, row: any): void {
        if (!row || typeof row !== 'object') return;
        const validCols = this.getTableColumns(db, tableName);
        if (validCols.length === 0) return;

        const colsToInsert = Object.keys(row).filter(key => validCols.includes(key));
        if (colsToInsert.length === 0) return;

        const colList = colsToInsert.join(', ');
        const placeholders = colsToInsert.map(() => '?').join(', ');
        const vals = colsToInsert.map(c => {
            const v = row[c];
            if (v && (typeof v === 'object' || Array.isArray(v))) {
                return JSON.stringify(v);
            }
            return v;
        });

        db.run(`INSERT OR REPLACE INTO ${tableName} (${colList}) VALUES (${placeholders})`, vals);
    }

    // ─── SSE client (receive events from Boss) ──────────────────────



    // ─── Heartbeat ────────────────────────────────────────────────────

    /**
     * Save a relayed reaction to this employee workspace's DB, then send to renderer.
     * Uses withDbPath to target the correct DB when another workspace is active.
     * Mirrors saveRelayMessageToWorkspaceDb — ensures boss reactions are persisted
     * on the employee side even when the employee workspace is not the active window.
     */
    private saveRelayReactionToWorkspaceDb(zaloId: string, reaction: any): void {
        try {
            const DatabaseService = require('../database/DatabaseService').default;
            const WorkspaceManager = require('../../utils/WorkspaceManager').default;
            const db = DatabaseService.getInstance();
            const wm = WorkspaceManager.getInstance();

            // Parse reaction fields (mirrors ZaloLoginHelper / EventBroadcaster logic)
            const rData = reaction.data || {};
            const userId = String(rData.uidFrom || reaction.uidFrom || '');
            const rMsg: any[] = rData.content?.rMsg || reaction.content?.rMsg || [];
            const targetMsgId = rMsg.length > 0
                ? String(rMsg[0].gMsgID || rMsg[0].cMsgID || '')
                : String(rData.msgId || reaction.msgId || '');
            const rawIcon: string = rData.content?.rIcon || reaction.content?.rIcon || reaction.rIcon || rData.rIcon || '';
            const ICON_MAP: Record<string, string> = {
                '/-heart': '❤️', '/-strong': '👍', ':>': '😆', ':o': '😮',
                ':-((':  '😢', ':-h': '😡', ':-*': '😘', ":')": '😂',
                '/-shit': '💩', '/-rose': '🌹', '/-break': '💔', '/-weak': '👎',
                ';xx': '😍', ';-/': '😕', ';-)': '😉', '/-fade': '🥱',
                '_()_': '🙏', '/-no': '🙅', '/-ok': '👌', '/-v': '✌️',
                '/-thanks': '🙏', '/-punch': '👊', ':-bye': '👋', ':((': '😭',
                ':))': '😁', '$-)': '🤑',
            };
            const emoji = ICON_MAP[rawIcon] || rawIcon;

            if (!userId || !targetMsgId) {
                Logger.warn(`[HttpClientService] saveRelayReaction: missing userId or targetMsgId`);
                return;
            }

            // Determine this employee workspace's DB path
            let targetDbPath: string | null = null;
            if (this.workspaceId) {
                const ws = wm.getWorkspaceById(this.workspaceId);
                if (ws) {
                    targetDbPath = wm.resolveDbPath(ws.dbPath || 'zagi-tool.db');
                }
            }

            const activeDbPath = db.getDbPath();
            const needSwitch = targetDbPath && targetDbPath !== activeDbPath;

            if (needSwitch) {
                db.withDbPath(targetDbPath!, () => {
                    db.updateMessageReaction(zaloId, targetMsgId, userId, emoji);
                });
                Logger.log(`[HttpClientService] Saved relay reaction to ${targetDbPath} via withDbPath`);
            } else {
                db.updateMessageReaction(zaloId, targetMsgId, userId, emoji);
                Logger.log(`[HttpClientService] Saved relay reaction to active DB (our workspace)`);
            }

            // Forward to renderer only when this employee workspace is the active one
            const activeWsId = wm.getActiveWorkspaceId();
            if (activeWsId === this.workspaceId) {
                EventBroadcaster.sendDirect('event:reaction', { zaloId, reaction });
            }
        } catch (err: any) {
            Logger.warn(`[HttpClientService] saveRelayReaction error: ${err.message}`);
        }
    }

    /**
     * Mark relayed recalled/deleted messages in this employee workspace's DB.
     * Called for event:undo and event:delete — both just mark messages as recalled.
     * Uses withDbPath to target the correct DB when another workspace is active.
     */
    private saveRelayRecallToWorkspaceDb(_channel: string, _originalData: any, zaloId: string, msgIds: string[], threadId?: string): void {
        try {
            const DatabaseService = require('../database/DatabaseService').default;
            const WorkspaceManager = require('../../utils/WorkspaceManager').default;
            const db = DatabaseService.getInstance();
            const wm = WorkspaceManager.getInstance();

            let targetDbPath: string | null = null;
            if (this.workspaceId) {
                const ws = wm.getWorkspaceById(this.workspaceId);
                if (ws) {
                    targetDbPath = wm.resolveDbPath(ws.dbPath || 'zagi-tool.db');
                }
            }

            const activeDbPath = db.getDbPath();
            const needSwitch = targetDbPath && targetDbPath !== activeDbPath;

            const doRecall = () => {
                for (const msgId of msgIds) {
                    db.markMessageRecalled(zaloId, msgId);
                    if (threadId) {
                        try { db.updateLastMessageIfRecalled(zaloId, threadId, msgId); } catch {}
                    }
                }
            };

            if (needSwitch) {
                db.withDbPath(targetDbPath!, doRecall);
                Logger.log(`[HttpClientService] Saved relay recall (${msgIds.length} msgs) to ${targetDbPath} via withDbPath`);
            } else {
                doRecall();
                Logger.log(`[HttpClientService] Saved relay recall (${msgIds.length} msgs) to active DB`);
            }

            // Determine channel from msgIds count (single = undo, multiple = delete)
            const channel = msgIds.length === 1 ? 'event:undo' : 'event:delete';
            const eventData = msgIds.length === 1
                ? { zaloId, msgId: msgIds[0], threadId }
                : { zaloId, msgIds, threadId };

            const activeWsId = wm.getActiveWorkspaceId();
            if (activeWsId === this.workspaceId) {
                EventBroadcaster.sendDirect(channel, eventData);
            }
        } catch (err: any) {
            Logger.warn(`[HttpClientService] saveRelayRecall error: ${err.message}`);
        }
    }

    /**
     * Save a relayed message to this employee workspace's DB, then send to renderer.
     * Uses withDbPath to target the correct DB when another workspace is active.
     * Bypasses EventBroadcaster hooks to prevent infinite relay loop.
     */
    private saveRelayMessageToWorkspaceDb(zaloId: string, message: any): void {
        try {
            const DatabaseService = require('../database/DatabaseService').default;
            const WorkspaceManager = require('../../utils/WorkspaceManager').default;
            const db = DatabaseService.getInstance();
            const wm = WorkspaceManager.getInstance();

            // Determine this employee workspace's DB path
            let targetDbPath: string | null = null;
            if (this.workspaceId) {
                const ws = wm.getWorkspaceById(this.workspaceId);
                if (ws) {
                    targetDbPath = wm.resolveDbPath(ws.dbPath || 'zagi-tool.db');
                }
            }

            const activeDbPath = db.getDbPath();
            const needSwitch = targetDbPath && targetDbPath !== activeDbPath;

            if (needSwitch) {
                // Save to a DIFFERENT workspace DB (not the currently active one)
                db.withDbPath(targetDbPath!, () => {
                    db.saveMessage(zaloId, message);
                    // Persist employee sender info so it survives conversation reload
                    const empInfo = message.data?._employeeInfo;
                    const msgId = message.data?.msgId;
                    if (empInfo?.employee_id && msgId) {
                        db.setMessageHandledByEmployeeFlexible(zaloId, String(msgId), empInfo.employee_id);
                    }
                });
                Logger.log(`[HttpClientService] Saved relay message to ${targetDbPath} via withDbPath`);
            } else {
                // Active DB IS our workspace — save directly
                db.saveMessage(zaloId, message);
                // Persist employee sender info so it survives conversation reload
                const empInfo = message.data?._employeeInfo;
                const msgId = message.data?.msgId;
                if (empInfo?.employee_id && msgId) {
                    db.setMessageHandledByEmployeeFlexible(zaloId, String(msgId), empInfo.employee_id);
                }
                Logger.log(`[HttpClientService] Saved relay message to active DB (our workspace)`);
            }

            // Only send to renderer when THIS employee workspace is the active one.
            // When boss workspace is active, the boss's broadcastMessage.send() already
            // sent to renderer — sending again would cause double notification.
            const activeWsId = wm.getActiveWorkspaceId();
            if (activeWsId === this.workspaceId) {
                EventBroadcaster.sendDirect('event:message', { zaloId, message });
            }
        } catch (err: any) {
            Logger.warn(`[HttpClientService] saveRelayMessage error: ${err.message}`);
        }
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.consecutiveHeartbeatFailures = 0;
        this.heartbeatTimer = setInterval(async () => {
            if (!this.bossUrl || !this.token) return;

            const start = Date.now();
            try {
                // Send callbackUrl for LAN fallback — boss can push via HTTP POST if Socket.IO is down
                const result = await this.httpPost(
                    `${this.bossUrl}/api/auth/heartbeat`,
                    { callbackUrl: this.callbackUrl },
                    { Authorization: `Bearer ${this.token}` },
                    4000
                );

                if (result?.success) {
                    const wasDisconnected = !this.connected || this.degraded;
                    this.latencyMs = Date.now() - start;
                    this.consecutiveHeartbeatFailures = 0;
                    // Kết nối thành công — xóa trạng thái degraded
                    this.connected = true;
                    this.degraded = false;
                    this.onStatusChange?.(true, this.latencyMs, this.isUsingLan);

                    if (wasDisconnected) {
                        Logger.log(`[HttpClientService] 🟢 Heartbeat auto-recovered connection to ${this.bossUrl}!`);
                        if (!this.socketIOClient.isConnected()) {
                            this.socketIOClient.reconnectIfNeeded();
                        }
                    }

                    // Save last known LAN details for manual triggering
                    if (Array.isArray(result.localIps) && result.port) {
                        this.lastKnownLocalIps = result.localIps;
                        this.lastKnownPort = result.port;
                    }
                } else {
                    this.consecutiveHeartbeatFailures++;
                    // After MAX failures, mark as disconnected
                    const maxFailures = this.isUsingLan ? 2 : HttpClientService.MAX_HEARTBEAT_FAILURES;
                    if (this.consecutiveHeartbeatFailures >= maxFailures) {
                        if (this.connected || !this.degraded) {
                            Logger.warn(`[HttpClientService] ${this.consecutiveHeartbeatFailures} consecutive heartbeat failures — marking disconnected`);
                        }
                        this.connected = false;
                        this.degraded = true;
                        
                        // Rollback to original WAN/Tunnel URL
                        if (this.isUsingLan) {
                            Logger.log(`[HttpClientService] LAN connection lost, reverting bossUrl to: ${this.configuredBossUrl}`);
                            this.bossUrl = this.configuredBossUrl;
                            this.isUsingLan = false;
                        }
                        
                        this.onStatusChange?.(false, 0);
                    }
                }
            } catch (err: any) {
                this.latencyMs = 0;
                this.consecutiveHeartbeatFailures++;
                const maxFailures = this.isUsingLan ? 2 : HttpClientService.MAX_HEARTBEAT_FAILURES;
                if (this.consecutiveHeartbeatFailures >= maxFailures) {
                    if (this.connected || !this.degraded) {
                        Logger.warn(`[HttpClientService] ${this.consecutiveHeartbeatFailures} consecutive heartbeat failures (error: ${err.message}) — marking disconnected`);
                    }
                    this.connected = false;
                    this.degraded = true;
                    
                    // Rollback to original WAN/Tunnel URL
                    if (this.isUsingLan) {
                        Logger.log(`[HttpClientService] LAN connection lost (error), reverting bossUrl to: ${this.configuredBossUrl}`);
                        this.bossUrl = this.configuredBossUrl;
                        this.isUsingLan = false;
                    }
                    
                    this.onStatusChange?.(false, 0);
                }
            }
        }, 12_000);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    // ─── HTTP helpers ─────────────────────────────────────────────────

    /**
     * Returns extra headers needed to bypass localtunnel / loca.lt interstitial pages.
     * loca.lt shows an HTML "Visitor Pass" page for programmatic requests unless the
     * bypass header is present.
     */
    private getTunnelBypassHeaders(): Record<string, string> {
        try {
            const hostname = new URL(this.bossUrl).hostname;
            // loca.lt, localtunnel.me, or any custom tunnel subdomain
            if (hostname.endsWith('.loca.lt') || hostname.endsWith('.localtunnel.me')) {
                return { 'bypass-tunnel-reminder': 'true' };
            }
        } catch { /* ignore */ }
        return {};
    }

    /**
     * Parses a raw HTTP response body as JSON.
     * If the body is an HTML page (e.g., loca.lt interstitial) a descriptive error is returned.
     */
    private parseJsonResponse(data: string): any {
        const trimmed = data.trimStart();
        if (trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!doctype')) {
            // HTML interstitial — likely a tunnel challenge page
            Logger.warn('[HttpClientService] Received HTML response instead of JSON (tunnel interstitial?)');
            return {
                success: false,
                error: 'URL tunnel cần xác nhận trình duyệt. Vui lòng mở địa chỉ Boss trong trình duyệt một lần để kích hoạt, sau đó thử lại.',
            };
        }
        try {
            return JSON.parse(data);
        } catch {
            return { success: false, error: 'Invalid JSON response' };
        }
    }

    private httpPost(url: string, body: any, headers: Record<string, string> = {}, timeout = 15000): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                const { net } = require('electron');
                const payload = JSON.stringify(body);
                const req = net.request({
                    method: 'POST',
                    url: url,
                    useSessionCookies: false
                });

                req.setHeader('Content-Type', 'application/json');
                const bypassHeaders = this.getTunnelBypassHeaders();
                for (const [k, v] of Object.entries({ ...bypassHeaders, ...headers })) {
                    req.setHeader(k, v);
                }

                let timeoutTimer: NodeJS.Timeout | null = setTimeout(() => {
                    req.abort();
                    reject(new Error('Request timeout'));
                }, timeout);

                req.on('response', (res) => {
                    if (timeoutTimer) {
                        clearTimeout(timeoutTimer);
                        timeoutTimer = null;
                    }
                    const chunks: any[] = [];
                    res.on('data', (chunk: any) => { chunks.push(chunk); });
                    res.on('end', () => {
                        let data = '';
                        if (chunks.length > 0) {
                            if (typeof chunks[0] === 'string') {
                                data = chunks.join('');
                            } else {
                                data = Buffer.concat(chunks).toString('utf8');
                            }
                        }
                        resolve(this.parseJsonResponse(data));
                    });
                });

                req.on('error', (err: Error) => {
                    if (timeoutTimer) {
                        clearTimeout(timeoutTimer);
                        timeoutTimer = null;
                    }
                    reject(err);
                });

                req.write(payload);
                req.end();
            } catch (err) {
                reject(err);
            }
        });
    }

    private httpGet(url: string, headers: Record<string, string> = {}, timeout = 15000): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                const { net } = require('electron');
                const req = net.request({
                    method: 'GET',
                    url: url,
                    useSessionCookies: false
                });

                const bypassHeaders = this.getTunnelBypassHeaders();
                for (const [k, v] of Object.entries({ ...bypassHeaders, ...headers })) {
                    req.setHeader(k, v);
                }

                let timeoutTimer: NodeJS.Timeout | null = setTimeout(() => {
                    req.abort();
                    reject(new Error('Request timeout'));
                }, timeout);

                req.on('response', (res) => {
                    if (timeoutTimer) {
                        clearTimeout(timeoutTimer);
                        timeoutTimer = null;
                    }
                    const chunks: any[] = [];
                    res.on('data', (chunk: any) => { chunks.push(chunk); });
                    res.on('end', () => {
                        let data = '';
                        if (chunks.length > 0) {
                            if (typeof chunks[0] === 'string') {
                                data = chunks.join('');
                            } else {
                                data = Buffer.concat(chunks).toString('utf8');
                            }
                        }
                        resolve(this.parseJsonResponse(data));
                    });
                });

                req.on('error', (err: Error) => {
                    if (timeoutTimer) {
                        clearTimeout(timeoutTimer);
                        timeoutTimer = null;
                    }
                    reject(err);
                });

                req.end();
            } catch (err) {
                reject(err);
            }
        });
    }

    private httpPostRaw(url: string, body: any, headers: Record<string, string> = {}, timeout = 60000): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                const { net } = require('electron');
                const payload = JSON.stringify(body);
                const req = net.request({
                    method: 'POST',
                    url: url,
                    useSessionCookies: false
                });

                req.setHeader('Content-Type', 'application/json');
                const bypassHeaders = this.getTunnelBypassHeaders();
                for (const [k, v] of Object.entries({ ...bypassHeaders, ...headers })) {
                    req.setHeader(k, v);
                }

                let timeoutTimer: NodeJS.Timeout | null = setTimeout(() => {
                    req.abort();
                    reject(new Error('Request timeout'));
                }, timeout);

                req.on('response', (res) => {
                    if (timeoutTimer) {
                        clearTimeout(timeoutTimer);
                        timeoutTimer = null;
                    }
                    const contentType = res.headers['content-type'] || '';
                    const contentTypeStr = Array.isArray(contentType) ? contentType.join('') : contentType;
                    if (contentTypeStr.includes('application/octet-stream')) {
                        const chunks: Buffer[] = [];
                        res.on('data', (chunk: Buffer) => chunks.push(chunk));
                        res.on('end', () => {
                            const buffer = Buffer.concat(chunks);
                            const contentDisposition = res.headers['content-disposition'] || '';
                            const contentDispositionStr = Array.isArray(contentDisposition) ? contentDisposition.join('') : contentDisposition;
                            const fileName = contentDispositionStr.match(/filename="?([^"]+)"?/)?.[1] || 'file';
                            resolve({ success: true, data: buffer, fileName });
                        });
                    } else {
                        const stringChunks: any[] = [];
                        res.on('data', (chunk: any) => { stringChunks.push(chunk); });
                        res.on('end', () => {
                            let data = '';
                            if (stringChunks.length > 0) {
                                if (typeof stringChunks[0] === 'string') {
                                    data = stringChunks.join('');
                                } else {
                                    data = Buffer.concat(stringChunks).toString('utf8');
                                }
                            }
                            resolve(this.parseJsonResponse(data));
                        });
                    }
                });

                req.on('error', (err: Error) => {
                    if (timeoutTimer) {
                        clearTimeout(timeoutTimer);
                        timeoutTimer = null;
                    }
                    reject(err);
                });

                req.write(payload);
                req.end();
            } catch (err) {
                reject(err);
            }
        });
    }

    private getLocalIP(): string {
        const nets = require('os').networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name] || []) {
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
        return '127.0.0.1';
    }



    private isLocalAddress(url: string): boolean {
        try {
            const u = new URL(url);
            const hostname = u.hostname;
            if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
            // IPv4 LAN ranges
            if (hostname.startsWith('192.168.')) return true;
            if (hostname.startsWith('10.')) return true;
            if (hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) return true;
            return false;
        } catch {
            return false;
        }
    }

    private async probeAndSwitchToLan(localIps: string[], port: number): Promise<void> {
        if (this.lanProbing || this.isUsingLan) return;
        this.lanProbing = true;

        Logger.log(`[HttpClientService] Start probing ${localIps.length} LAN IP(s) on port ${port}...`);

        const probePromises = localIps.map(async (ip) => {
            const url = `http://${ip}:${port}`;
            try {
                // Short timeout for LAN checks
                const res = await this.httpGet(`${url}/api/health`, {}, 3500);
                if (res?.status === 'ok') {
                    return url;
                }
            } catch {}
            return null;
        });

        try {
            const results = await Promise.all(probePromises);
            const activeLanUrl = results.find(Boolean);

            if (activeLanUrl) {
                Logger.log(`[HttpClientService] 🚀 Found reachable LAN IP: ${activeLanUrl}. Switching connection from WAN to LAN.`);
                
                // Set LAN flag and update bossUrl
                this.isUsingLan = true;
                this.bossUrl = activeLanUrl;

                // Restart Socket.IO to active local IP stream
                this.socketIOClient.connect(this.bossUrl, this.token);

                // Notify manager and UI of status change to LAN
                this.onStatusChange?.(true, this.latencyMs, true);

                // Update RestQueryService too
                try {
                    const RestQueryService = require('./RestQueryService').default;
                    RestQueryService.getInstance().init(this.bossUrl, this.token);
                } catch (err: any) {
                    Logger.warn(`[HttpClientService] Failed to reinit RestQueryService: ${err.message}`);
                }

                // Notify Boss of our callbackUrl with the new local IP endpoint
                this.httpPost(
                    `${this.bossUrl}/api/auth/heartbeat`,
                    { callbackUrl: this.callbackUrl },
                    { Authorization: `Bearer ${this.token}` }
                ).catch(() => {});
            } else {
                Logger.log('[HttpClientService] No LAN IPs are reachable. Remaining on WAN/Tunnel.');
            }
        } catch (err: any) {
            Logger.warn(`[HttpClientService] LAN probing error: ${err.message}`);
        } finally {
            this.lanProbing = false;
        }
    }
}

export default HttpClientService;

