import HttpClientService from './HttpClientService';
import WorkspaceManager from '../../utils/WorkspaceManager';
import Logger from '../../utils/Logger';
import { BrowserWindow } from 'electron';
import * as http from 'http';
import * as https from 'https';

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
        const isHttps = parsed.protocol === 'https:';
        const transport = isHttps ? https : http;
        const isTunnel = parsed.hostname.includes('loca.lt') ||
                         parsed.hostname.includes('localtunnel') ||
                         parsed.hostname.includes('ngrok') ||
                         parsed.hostname.includes('serveo');

        const req = (transport as typeof https).request({
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? '443' : '80'),
            path: parsed.pathname + (parsed.search || ''),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                ...(isTunnel ? { 'bypass-tunnel-reminder': 'true' } : {}),
            },
            timeout: timeoutMs,
        }, (res) => {
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
            if (err.code === 'ECONNREFUSED') {
                reject(new Error('Không thể kết nối — kiểm tra lại IP và Port, đảm bảo boss đã bật Relay Server'));
            } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
                reject(new Error('Hết thời gian kết nối — kiểm tra lại mạng'));
            } else {
                reject(new Error(`Lỗi kết nối: ${err.message}`));
            }
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Hết thời gian kết nối (${timeoutMs / 1000}s) — kiểm tra lại địa chỉ Boss`));
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
            Logger.warn(`[HttpConnectionManager] ⚠️ connect() replacing EXISTING client for "${workspaceId}" — old SSE will be destroyed`);
            this.clients.get(workspaceId)!.service.disconnect();
            this.clients.delete(workspaceId);
        }

        this.connecting.add(workspaceId);

        const service = new HttpClientService();
        service.setWorkspaceId(workspaceId);
        this.clients.set(workspaceId, { workspaceId, service });

        service.setOnStatusChange((connected: boolean, latency: number, isUsingLan?: boolean) => {
            this.sendToRenderer('workspace:connectionStatus', { workspaceId, connected, latency, isUsingLan: !!isUsingLan });
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
            const current = this.clients.get(workspaceId);
            if (current?.service === service) {
                this.clients.delete(workspaceId);
            }
            Logger.warn(`[HttpConnectionManager] ❌ Failed: ${result.error}`);
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
        for (const ws of autoConnects) {
            if (!ws.bossUrl) continue;
            if (this.isConnected(ws.id)) continue;
            try {
                // Thử kết nối với token đã lưu
                let token = ws.token || '';
                if (token) {
                    const result = await this.connect(ws.id, ws.bossUrl, token);
                    if (result.success) continue;
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
        }
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

                // Read connection details from the service itself (not WorkspaceManager)
                // This ensures reconnect works for all connected workspaces regardless of their stored type
                const bossUrl = client.service.getBossUrl();
                const token = client.service.getToken();

                if (!bossUrl || !token) {
                    Logger.log(`[HttpConnectionManager] Health check: "${wsId}" disconnected but no credentials stored — skipping`);
                    continue;
                }

                Logger.log(`[HttpConnectionManager] Health check: "${wsId}" disconnected — attempting reconnect to ${bossUrl}`);
                try {
                    await this.connect(wsId, bossUrl, token);
                } catch (err: any) {
                    Logger.warn(`[HttpConnectionManager] Health check reconnect failed for "${wsId}": ${err.message}`);
                }
            }
        }, intervalMs);
        Logger.log(`[HttpConnectionManager] Health check started (interval=${intervalMs}ms)`);
    }


    public async forceReconnectAll(): Promise<void> {
        Logger.log(`[HttpConnectionManager] ⚡ Force reconnect triggered for all workspaces...`);
        for (const [wsId, client] of this.clients) {
            const bossUrl = client.service.getBossUrl();
            const token = client.service.getToken();
            if (!bossUrl || !token) continue;
            
            Logger.log(`[HttpConnectionManager] ⚡ Force reconnecting "${wsId}" to ${bossUrl}...`);
            this.connecting.delete(wsId);
            this.connect(wsId, bossUrl, token).catch((err: any) => {
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

