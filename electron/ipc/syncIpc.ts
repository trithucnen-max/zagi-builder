import { ipcMain, BrowserWindow } from 'electron';
import HttpClientService from '../../src/services/http/HttpClientService';
import HttpConnectionManager from '../../src/services/http/HttpConnectionManager';
import WorkspaceManager from '../../src/utils/WorkspaceManager';
import DataSyncService from '../../src/services/employee/DataSyncService';
import DatabaseService from '../../src/services/database/DatabaseService';
import Logger from '../../src/utils/Logger';

/** Get the HttpClientService for the currently active remote workspace. */
function getActiveHttpClient(): HttpClientService {
    const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
    if (activeWs?.type === 'remote') {
        const svc = HttpConnectionManager.getInstance().getServiceForWorkspace(activeWs.id);
        if (svc) return svc;
    }
    // Fallback to legacy singleton
    return HttpClientService.getInstance();
}

/** Check if the current context is employee/remote mode. */
function isRemoteMode(): boolean {
    const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
    return activeWs?.type === 'remote';
}

/** Notify the renderer that a sync operation completed so it can reload data. */
function notifySyncComplete(workspaceId: string, syncType: 'full' | 'delta', syncTs?: number): void {
    try {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
            win.webContents.send('workspace:syncComplete', { workspaceId, syncType, syncTs });
            Logger.log(`[syncIpc] Notified renderer: syncComplete (${syncType}) workspace=${workspaceId}`);
        }
    } catch {}
}

export function registerSyncIpc() {
    // ─── Full Sync (Employee requests from Boss) ────────────────────
    ipcMain.handle('sync:requestFullSync', async (_event, params: { zaloIds: string[] }) => {
        Logger.log('[syncIpc] requestFullSync bypassed (running in Thin Client mode)');
        return { success: true, syncTs: Date.now() };
    });

    // ─── Delta Sync (Employee requests incremental from Boss) ───────
    ipcMain.handle('sync:requestDeltaSync', async (_event, params?: { sinceTs?: number }) => {
        Logger.log('[syncIpc] requestDeltaSync bypassed (running in Thin Client mode)');
        return { success: true, syncTs: Date.now() };
    });

    // ─── Reset Employee DB ──────────────────────────────────────────
    ipcMain.handle('sync:resetEmployeeDB', async (_event, params: { zaloIds: string[] }) => {
        try {
            if (!isRemoteMode()) {
                return { success: false, error: 'Chỉ dùng ở chế độ Nhân viên' };
            }
            DataSyncService.getInstance().resetEmployeeDB(params.zaloIds);
            try {
                DatabaseService.getInstance().run(
                    `DELETE FROM app_settings WHERE key = 'employee_last_sync_ts'`
                );
            } catch {}
            return { success: true };
        } catch (err: any) {
            Logger.error(`[syncIpc] resetEmployeeDB error: ${err.message}`);
            return { success: false, error: err.message };
        }
    });

    // ─── Get Sync Status ────────────────────────────────────────────
    ipcMain.handle('sync:getStatus', async () => {
        try {
            // PRIMARY: read lastSyncTs from WorkspaceManager (workspaces.json) — reliable even when DB is not initialized
            const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
            if (activeWs?.lastSyncTs && activeWs.lastSyncTs > 0) {
                Logger.log(`[syncIpc] getStatus: lastSyncTs=${activeWs.lastSyncTs} (from workspaces.json)`);
                return { success: true, lastSyncTs: activeWs.lastSyncTs };
            }

            // FALLBACK: try DB if WorkspaceManager doesn't have it
            try {
                const row = DatabaseService.getInstance().query<any>(
                    `SELECT value FROM app_settings WHERE key = 'employee_last_sync_ts'`
                );
                const lastSyncTs = row[0]?.value ? Number(row[0].value) : 0;
                if (lastSyncTs > 0) {
                    Logger.log(`[syncIpc] getStatus: lastSyncTs=${lastSyncTs} (from DB)`);
                    // Persist to workspaces.json for future use (DB-independent)
                    try {
                        WorkspaceManager.getInstance().updateWorkspace(activeWs.id, { lastSyncTs } as any);
                    } catch {}
                }
                return { success: true, lastSyncTs };
            } catch {
                return { success: true, lastSyncTs: 0 };
            }
        } catch (err: any) {
            return { success: true, lastSyncTs: 0 };
        }
    });

    // ─── Request Media from Boss ────────────────────────────────────
    ipcMain.handle('sync:requestMedia', async (_event, params: { filePath: string }) => {
        try {
            if (!isRemoteMode()) {
                return { success: false, error: 'Chỉ dùng ở chế độ Nhân viên' };
            }
            return await getActiveHttpClient().requestMedia(params.filePath);
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });
}

