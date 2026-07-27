import HttpClientService from './HttpClientService';
import WorkspaceManager from '../../utils/WorkspaceManager';
import Logger from '../../utils/Logger';
import { BrowserWindow } from 'electron';
import { net } from 'electron';

function httpPost(url: string, body: any, timeoutMs = 15000): Promise<any> {
    return new Promise((resolve, reject) => {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            reject(new Error('URL không hợp lệ'));
            return;
        }
        const data = JSON.stringify(body);
        const isTunnel = parsed.hostname.includes('loca.lt') ||
                         parsed.hostname.includes('localtunnel') ||
                         parsed.hostname.includes('ngrok') ||
                         parsed.hostname.includes('serveo');

        let timeoutTimer: NodeJS.Timeout | null = null;

        const req = net.request({
            method: 'POST',
            url: url,
            useSessionCookies: false
        });

        req.setHeader('Content-Type', 'application/json');
        if (isTunnel) {
            req.setHeader('bypass-tunnel-reminder', 'true');
        }

        timeoutTimer = setTimeout(() => {
            req.abort();
            reject(new Error(`Hết thời gian kết nối (${timeoutMs / 1000}s) — kiểm tra lại địa chỉ Boss`));
        }, timeoutMs);

        req.on('response', (res) => {
            if (timeoutTimer) {
                clearTimeout(timeoutTimer);
                timeoutTimer = null;
            }
            const responseChunks: any[] = [];
            res.on('data', (chunk: any) => { responseChunks.push(chunk); });
            res.on('end', () => {
                let responseBody = '';
                if (responseChunks.length > 0) {
                    if (typeof responseChunks[0] === 'string') {
                        responseBody = responseChunks.join('');
                    } else {
                        responseBody = Buffer.concat(responseChunks).toString('utf8');
                    }
                }
                try {
                    resolve(JSON.parse(responseBody));
                } catch {
                    const preview = responseBody.slice(0, 200);
                    reject(new Error(`Phản hồi không hợp lệ từ boss server: ${preview}`));
                }
            });
        });

        req.on('error', (err: any) => {
            if (timeoutTimer) {
                clearTimeout(timeoutTimer);
                timeoutTimer = null;
            }
            if (err.code === 'ECONNREFUSED' || err.message?.includes('ERR_CONNECTION_REFUSED')) {
                reject(new Error('Không thể kết nối — kiểm tra lại IP và Port, đảm bảo boss đã bật Relay Server'));
            } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT' || err.message?.includes('ERR_TIMED_OUT')) {
                reject(new Error('Hết thời gian kết nối — kiểm tra lại mạng'));
            } else {
                reject(new Error(`Lỗi kết nối: ${err.message}`));
            }
        });

        req.write(data);
        req.end();
    });
}


interface WorkspaceClient {
    workspaceId: string;
    service: HttpClientService;
}

interface WorkspaceSnapshot {
    permissions?: Array<{ module: string; can_access: boolean }>;
    assignedAccounts?: string[];
    erpRole?: string;
    erpExtraJson?: string;
    employeesData?: any[];
    accountsData?: any[];
    onlineAccounts?: string[];
    updatedAt: number;
    source: 'initialState' | 'accountAccessUpdate';
}

/**
 * HttpConnectionManager — manages one HttpClientService instance per workspace.
 * Replaces SocketConnectionManager — uses HTTP instead of Socket.IO.
 */
class HttpConnectionManager {
    private static instance: HttpConnectionManager;
    private clients: Map<string, WorkspaceClient> = new Map();
    private snapshots: Map<string, WorkspaceSnapshot> = new Map();
    private mainWindow: BrowserWindow | null = null;
    private connecting: Set<string> = new Set();
    private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
    private lastForceReconnectTime = 0;

    public static getInstance(): HttpConnectionManager {
        if (!HttpConnectionManager.instance) {
            HttpConnectionManager.instance = new HttpConnectionManager();
        }
        return HttpConnectionManager.instance;
    }

    public setMainWindow(win: BrowserWindow): void {
        this.mainWindow = win;
    }

    public async connect(
        workspaceId: string,
        bossUrl: string,
        token: string,
        options?: {
            onInitialState?: (data: any) => void;
            onAccountAccessUpdate?: (data: any) => void;
            onSyncProgress?: (phase: string, percent: number) => void;
        }
    ): Promise<{ success: boolean; error?: string }> {
        if (this.connecting.has(workspaceId)) {
            Logger.log(`[HttpConnectionManager] Skip connect for "${workspaceId}": already in progress`);
            return { success: true };
        }

        if (this.clients.has(workspaceId)) {
            const existing = this.clients.get(workspaceId)!;
            const existingStatus = existing.service.getStatus();

            // Guard: nếu client đang kết nối healthy với cùng bossUrl và token thì
            // không cần làm gì — tránh destroy rồi tạo mới gây "nháy mất kết nối" ngắn.
            const normalizeUrl = (u: string) => {
                let url = u.trim();
                if (!url.startsWith('http://') && !url.startsWith('https://')) url = `http://${url}`;
                return url.replace(/\/+$/, '');
            };
            if (existingStatus.connected
                && normalizeUrl(existing.service.getBossUrl()) === normalizeUrl(bossUrl)
                && existing.service.getToken() === token) {
                Logger.log(`[HttpConnectionManager] ✅ Skip connect for "${workspaceId}": already connected and healthy`);
                return { success: true };
            }

            Logger.warn(`[HttpConnectionManager] ⚠️ connect() replacing EXISTING client for "${workspaceId}" — old SSE will be destroyed`);
            existing.service.disconnect();
            this.clients.delete(workspaceId);
        }

        this.connecting.add(workspaceId);

        const service = new HttpClientService();
        service.setWorkspaceId(workspaceId);
        this.clients.set(workspaceId, { workspaceId, service });

        service.setOnStatusChange((connected: boolean, latency: number, isUsingLan?: boolean) => {
            this.sendToRenderer('workspace:connectionStatus', { 
                workspaceId, 
                connected, 
                latency, 
                isUsingLan: !!isUsingLan,
                bossUrl: service.getBossUrl() 
            });
        });

        // Gửi ngay trạng thái mất kết nối ban đầu cho renderer
        this.sendToRenderer('workspace:connectionStatus', { 
            workspaceId, 
            connected: false, 
            latency: 0, 
            isUsingLan: service.getStatus().isUsingLan,
            bossUrl: service.getBossUrl()
        });

        service.setOnInitialState((data: any) => {
            const snapshot: WorkspaceSnapshot = {
                permissions: data?.permissions || [],
                assignedAccounts: data?.assignedAccounts || [],
                erpRole: data?.erpRole || '',
                erpExtraJson: data?.erpExtraJson || '',
                employeesData: data?.employeesData || [],
                accountsData: data?.accountsData || [],
                onlineAccounts: data?.onlineAccounts || [],
                updatedAt: Date.now(),
                source: 'initialState',
            };
            this.snapshots.set(workspaceId, snapshot);
            Logger.log(`[HttpConnectionManager] initialState → workspace=${workspaceId} assigned=${snapshot.assignedAccounts?.length || 0}`);
            this.sendToRenderer('workspace:initialState', { workspaceId, ...data });
            options?.onInitialState?.(data);
        });

        service.setOnAccountAccessUpdate((data: any) => {
            const previous = this.snapshots.get(workspaceId);
            const snapshot: WorkspaceSnapshot = {
                permissions: previous?.permissions || [],
                assignedAccounts: data?.assignedAccounts || [],
                erpRole: previous?.erpRole || '',
                erpExtraJson: previous?.erpExtraJson || '',
                employeesData: previous?.employeesData || [],
                accountsData: data?.accountsData || [],
                onlineAccounts: previous?.onlineAccounts || [],
                updatedAt: Date.now(),
                source: 'accountAccessUpdate',
            };
            this.snapshots.set(workspaceId, snapshot);
            this.sendToRenderer('workspace:accountAccessUpdate', { workspaceId, ...data });
            options?.onAccountAccessUpdate?.(data);
        });

        if (options?.onSyncProgress) service.setOnSyncProgress(options.onSyncProgress);

        // Socket.IO tự động reconnect + catch-up (EventBuffer),
        // không cần refresh snapshot khi reconnect nữa.

        const result = await service.connect(bossUrl, token);
        this.connecting.delete(workspaceId);

        if (result.success) {
            Logger.log(`[HttpConnectionManager] ✅ Connected workspace "${workspaceId}"`);
        } else {
            if (this.isUnauthorizedError(result.error)) {
                Logger.warn(`[HttpConnectionManager] ❌ Connection failed due to expired/invalid token. Cleaning up client.`);
                this.disconnect(workspaceId);
            } else {
                // Do NOT delete the client from this.clients so that health check can monitor and retry it in the background!
                Logger.warn(`[HttpConnectionManager] ❌ Failed: ${result.error}`);
            }
        }

        return result;
    }

    public disconnect(workspaceId: string): void {
        const client = this.clients.get(workspaceId);
        if (client) {
            client.service.disconnect();
            this.clients.delete(workspaceId);
            this.sendToRenderer('workspace:connectionStatus', { workspaceId, connected: false, latency: 0 });
        }
    }

    public async probeAndSwitchToLan(workspaceId: string): Promise<{ success: boolean; error?: string }> {
        const client = this.clients.get(workspaceId);
        if (!client) {
            return { success: false, error: 'Workspace chưa kết nối' };
        }
        return client.service.triggerManualLanProbe();
    }

    public revertToWan(workspaceId: string): void {
        const client = this.clients.get(workspaceId);
        if (client) {
            client.service.revertToWan();
        }
    }

    public disconnectAll(): void {
        for (const [wsId] of this.clients) this.disconnect(wsId);
    }

    public isConnected(workspaceId: string): boolean {
        if (this.connecting.has(workspaceId)) return true;
        return this.clients.get(workspaceId)?.service.isConnected() ?? false;
    }

    public getStatus(workspaceId: string): { connected: boolean; bossUrl: string; latency: number; isUsingLan: boolean } {
        const client = this.clients.get(workspaceId);
        if (!client) {
            if (this.connecting.has(workspaceId)) return { connected: true, bossUrl: '', latency: 0, isUsingLan: false };
            return { connected: false, bossUrl: '', latency: 0, isUsingLan: false };
        }
        return client.service.getStatus();
    }

    public getAllStatuses(): Record<string, { connected: boolean; bossUrl: string; latency: number; isUsingLan: boolean }> {
        const result: Record<string, { connected: boolean; bossUrl: string; latency: number; isUsingLan: boolean }> = {};
        for (const [wsId, client] of this.clients) result[wsId] = client.service.getStatus();
        return result;
    }

    public getServiceForWorkspace(workspaceId: string): HttpClientService | null {
        return this.clients.get(workspaceId)?.service ?? null;
    }

    public getSnapshot(workspaceId: string): WorkspaceSnapshot | null {
        return this.snapshots.get(workspaceId) ?? null;
    }

    public replaySnapshotToRenderer(workspaceId: string): boolean {
        const snapshot = this.snapshots.get(workspaceId);
        if (!snapshot) return false;

        this.sendToRenderer('workspace:initialState', {
            workspaceId,
            permissions: snapshot.permissions || [],
            assignedAccounts: snapshot.assignedAccounts || [],
            erpRole: snapshot.erpRole || '',
            erpExtraJson: snapshot.erpExtraJson || '',
            employeesData: snapshot.employeesData || [],
            accountsData: snapshot.accountsData || [],
            onlineAccounts: snapshot.onlineAccounts || [],
            replayed: true,
            replaySource: snapshot.source,
            replayedAt: Date.now(),
        });
        return true;
    }

    public async proxyAction(workspaceId: string, channel: string, params: any): Promise<any> {
        const client = this.clients.get(workspaceId);
        if (!client) throw new Error(`Workspace "${workspaceId}" chưa kết nối tới BOSS`);
        return client.service.proxyAction(channel, params);
    }

    public async proxyActiveWorkspace(channel: string, params: any): Promise<any> {
        const ws = WorkspaceManager.getInstance().getActiveWorkspace();
        if (!ws || ws.type !== 'remote') throw new Error('Workspace đang active không phải remote workspace');
        return this.proxyAction(ws.id, channel, params);
    }

    public async connectAutoWorkspaces(): Promise<void> {
        const autoConnects = WorkspaceManager.getInstance().getAutoConnectRemotes();
        if (autoConnects.length === 0) return;

        Logger.log(`[HttpConnectionManager] Auto-connecting ${autoConnects.length} remote workspace(s)...`);
        await Promise.all(autoConnects.map(async (ws) => {
            if (!ws.bossUrl) return;
            if (this.isConnected(ws.id)) return;
            try {
                // Thử kết nối với token đã lưu
                let token = ws.token || '';
                if (token) {
                    const result = await this.connect(ws.id, ws.bossUrl, token);
                    if (result.success) return;
                }

                // Token thất bại hoặc không có — thử login lại nếu có password đã lưu
                if (ws.employeeUsername && ws.employeePassword) {
                    Logger.log(`[HttpConnectionManager] Token expired for "${ws.name}" — re-logging in with saved credentials...`);
                    try {
                        let url = ws.bossUrl.trim();
                        if (!url.startsWith('http://') && !url.startsWith('https://')) {
                            url = `http://${url}`;
                        }
                        url = url.replace(/\/+$/, '');

                        const loginRes = await httpPost(`${url}/api/auth/login`, {
                            username: ws.employeeUsername,
                            password: ws.employeePassword
                        });

                        if (loginRes?.success && loginRes.token) {
                            // Lưu token mới vào workspace
                            WorkspaceManager.getInstance().updateWorkspace(ws.id, { token: loginRes.token });
                            await this.connect(ws.id, ws.bossUrl, loginRes.token);
                            Logger.log(`[HttpConnectionManager] ✅ Re-login success for "${ws.name}"`);
                        } else {
                            Logger.warn(`[HttpConnectionManager] Re-login failed for "${ws.name}": ${loginRes?.error || 'Unknown'}`);
                        }
                    } catch (err: any) {
                        Logger.warn(`[HttpConnectionManager] Re-login error for "${ws.name}": ${err.message}`);
                    }
                }
            } catch (err: any) {
                Logger.warn(`[HttpConnectionManager] Auto-connect failed for "${ws.name}": ${err.message}`);
            }
        }));
    }

    /**
     * Start periodic health check that detects dead connections and triggers reconnect.
     * Called once at app startup after connectAutoWorkspaces.
     *
     * Uses client service's stored bossUrl/token directly instead of WorkspaceManager
     * so reconnect works even for workspaces not marked as 'remote' (e.g., manual employee connections).
     */
    public startHealthCheck(intervalMs = 60_000): void {
        this.stopHealthCheck();
        this.healthCheckTimer = setInterval(async () => {
            for (const [wsId, client] of this.clients) {
                const status = client.service.getStatus();
                if (status.connected) continue; // Already connected — skip

                const bossUrl = client.service.getBossUrl();
                const token = client.service.getToken();

                if (!bossUrl || !token) {
                    Logger.log(`[HttpConnectionManager] Health check: "${wsId}" disconnected but no credentials stored — skipping`);
                    continue;
                }

                Logger.log(`[HttpConnectionManager] Health check: "${wsId}" disconnected — attempting reconnect to ${bossUrl}`);
                try {
                    const result = await this.connect(wsId, bossUrl, token);
                    // Token hết hạn / bị thu hồi → DỪNG retry, yêu cầu đăng nhập lại.
                    // Tiếp tục retry với token cũ chỉ tạo vòng lặp vô hạn và log spam.
                    if (!result.success && this.isUnauthorizedError(result.error)) {
                        Logger.warn(`[HttpConnectionManager] Health check: "${wsId}" token expired — stopping retry, requesting re-auth`);
                        this.sendToRenderer('workspace:authExpired', { workspaceId: wsId });
                    }
                } catch (err: any) {
                    Logger.warn(`[HttpConnectionManager] Health check reconnect failed for "${wsId}": ${err.message}`);
                }
            }
        }, intervalMs);
        Logger.log(`[HttpConnectionManager] Health check started (interval=${intervalMs}ms)`);
    }

    /** Kiểm tra error string có phải Unauthorized (401) không. */
    private isUnauthorizedError(error?: string): boolean {
        if (!error) return false;
        return /unauthorized|401|invalid.*token|token.*invalid|token.*expired|hết hạn/i.test(error);
    }


    public async forceReconnectAll(): Promise<void> {
        const now = Date.now();
        if (now - this.lastForceReconnectTime < 10_000) {
            Logger.log(`[HttpConnectionManager] ⚡ Force reconnect throttled (last run was ${Math.round((now - this.lastForceReconnectTime) / 1000)}s ago)`);
            return;
        }
        this.lastForceReconnectTime = now;

        Logger.log(`[HttpConnectionManager] ⚡ Force reconnect triggered for all workspaces...`);
        for (const [wsId, client] of this.clients) {
            const bossUrl = client.service.getBossUrl();
            const token = client.service.getToken();
            if (!bossUrl || !token) continue;
            
            if (this.connecting.has(wsId)) {
                Logger.log(`[HttpConnectionManager] ⚡ Force reconnect: "${wsId}" is already connecting — skipping to avoid race condition`);
                continue;
            }
            Logger.log(`[HttpConnectionManager] ⚡ Force reconnecting "${wsId}" to ${bossUrl}...`);
            this.connect(wsId, bossUrl, token).then((result) => {
                if (!result.success && this.isUnauthorizedError(result.error)) {
                    Logger.warn(`[HttpConnectionManager] ⚡ Force reconnect: "${wsId}" token expired — requesting re-auth`);
                    this.sendToRenderer('workspace:authExpired', { workspaceId: wsId });
                }
            }).catch((err: any) => {
                Logger.warn(`[HttpConnectionManager] Force reconnect failed for "${wsId}": ${err.message}`);
            });
        }
    }

    public stopHealthCheck(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    private sendToRenderer(channel: string, data: any): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }
}

export default HttpConnectionManager;

