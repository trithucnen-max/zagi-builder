import { ipcMain } from 'electron';
import EmployeeService from '../../src/services/employee/EmployeeService';
import DatabaseService from '../../src/services/database/DatabaseService';
import AppModeManager from '../../src/utils/AppModeManager';
import HttpClientService from '../../src/services/http/HttpClientService';
import HttpConnectionManager from '../../src/services/http/HttpConnectionManager';
import HttpRelayService from '../../src/services/http/HttpRelayService';
import WorkspaceManager from '../../src/utils/WorkspaceManager';
import Logger from '../../src/utils/Logger';

export function registerEmployeeIpc(): void {
    const empSvc = () => EmployeeService.getInstance();

    // ─── CRUD ──────────────────────────────────────────────────────────

    ipcMain.handle('employee:list', async () => {
        try {
            const employees = empSvc().getEmployees();
            // Strip password_hash before sending to renderer
            const safe = employees.map(e => ({ ...e, password_hash: undefined }));
            return { success: true, employees: safe };
        } catch (err: any) {
            Logger.error(`[employeeIpc] list error: ${err.message}`);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('employee:getById', async (_e, { employeeId }: { employeeId: string }) => {
        try {
            const emp = empSvc().getEmployeeById(employeeId);
            if (!emp) return { success: false, error: 'Không tìm thấy nhân viên' };
            return { success: true, employee: { ...emp, password_hash: undefined } };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('employee:create', async (_e, params: {
        username: string; password: string; display_name: string; avatar_url?: string; role?: 'boss' | 'employee';
    }) => {
        try {
            const result = await empSvc().createEmployee(params);
            if (result.employee) result.employee.password_hash = '' as any;
            return result;
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('employee:update', async (_e, { employeeId, updates }: {
        employeeId: string; updates: { display_name?: string; avatar_url?: string; password?: string; is_active?: number; role?: string; group_id?: string | null };
    }) => {
        try {
            return empSvc().updateEmployee(employeeId, updates);
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('employee:delete', async (_e, { employeeId }: { employeeId: string }) => {
        try {
            return empSvc().deleteEmployee(employeeId);
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    // ─── Permissions ──────────────────────────────────────────────────

    ipcMain.handle('employee:setPermissions', async (_e, { employeeId, permissions }: {
        employeeId: string; permissions: Array<{ module: string; can_access: boolean }>;
    }) => {
        try {
            const result = empSvc().setPermissions(employeeId, permissions);
            Logger.log(`[employeeIpc] setPermissions → employee=${employeeId} permissions=${permissions.length} success=${result.success}`);
            if (result.success) {
                // Auto-create ERP profile when erp module is enabled
                const erpPerm = permissions.find(p => p.module === 'erp');
                if (erpPerm?.can_access) {
                    try {
                        const db = DatabaseService.getInstance();
                        const existing = db.queryOne(`SELECT 1 FROM erp_employee_profiles WHERE employee_id = ?`, [employeeId]);
                        if (!existing) {
                            db.run(
                                `INSERT OR IGNORE INTO erp_employee_profiles (employee_id, erp_role, extra_json, created_at, updated_at)
                                 VALUES (?, 'member', '{}', ?, ?)`,
                                [employeeId, Date.now(), Date.now()]
                            );
                            Logger.log(`[employeeIpc] Auto-created ERP profile for employee ${employeeId} with role 'member'`);
                        }
                    } catch (erpErr: any) {
                        Logger.warn(`[employeeIpc] Failed to auto-create ERP profile: ${erpErr.message}`);
                    }
                }
                HttpRelayService.getInstance().refreshEmployeeState(employeeId, 'permissions-updated');
            }
            return result;
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('employee:getPermissions', async (_e, { employeeId }: { employeeId: string }) => {
        try {
            const perms = empSvc().getPermissions(employeeId);
            return { success: true, permissions: perms };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    // ─── Account Access ──────────────────────────────────────────────

    ipcMain.handle('employee:assignAccounts', async (_e, { employeeId, zaloIds }: {
        employeeId: string; zaloIds: string[];
    }) => {
        try {
            const result = empSvc().assignAccounts(employeeId, zaloIds);
            Logger.log(`[employeeIpc] assignAccounts → employee=${employeeId} assigned=${zaloIds.length} success=${result.success} zaloIds=${JSON.stringify(zaloIds)}`);
            if (result.success) {
                HttpRelayService.getInstance().updateEmployeeRooms(employeeId, zaloIds);
                HttpRelayService.getInstance().refreshEmployeeState(employeeId, 'accounts-assigned');
            }
            return result;
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('employee:getAssignedAccounts', async (_e, { employeeId }: { employeeId: string }) => {
        try {
            const accounts = empSvc().getAssignedAccounts(employeeId);
            return { success: true, accounts };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    // ─── Stats ─────────────────────────────────────────────────────────

    ipcMain.handle('employee:getStats', async (_e, { employeeId, sinceTs, untilTs }: {
        employeeId: string; sinceTs?: number; untilTs?: number;
    }) => {
        try {
            const stats = empSvc().getEmployeeStats(employeeId, sinceTs, untilTs);
            return { success: true, stats };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('employee:getSessions', async (_e, { employeeId, limit }: {
        employeeId: string; limit?: number;
    }) => {
        try {
            const sessions = empSvc().getEmployeeSessions(employeeId, limit);
            return { success: true, sessions };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    // ─── Auth (for employee login on employee machines) ──────────────

    ipcMain.handle('employee:login', async (_e, { username, password }: { username: string; password: string }) => {
        try {
            const result = await empSvc().authenticate(username, password);
            if (result.employee) result.employee.password_hash = '' as any;
            return result;
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('employee:validateToken', async (_e, { token }: { token: string }) => {
        try {
            return empSvc().validateToken(token);
        } catch (err: any) {
            return { valid: false, error: err.message };
        }
    });

    // ─── Mode Management ──────────────────────────────────────────────

    ipcMain.handle('employee:setMode', async (_e, { mode }: { mode: 'standalone' | 'boss' | 'employee' }) => {
        try {
            AppModeManager.getInstance().setMode(mode);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('employee:getMode', async () => {
        return { mode: AppModeManager.getInstance().getMode() };
    });

    // ─── HTTP Client (Employee side) ────────────────────────────────

    ipcMain.handle('employee:connectToBoss', async (_e, { bossUrl, token }: { bossUrl: string; token: string }) => {
        try {
            AppModeManager.getInstance().setMode('employee');

            // Extract employee_id from JWT payload (no verification needed — boss already verified)
            try {
                const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                if (payload.employee_id) {
                    AppModeManager.getInstance().setEmployeeId(payload.employee_id);
                }
            } catch {}

            // Workspace-aware: register connection under the active workspace ID
            const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
            const wsId = activeWs?.id || 'legacy';

            const result = await HttpConnectionManager.getInstance().connect(wsId, bossUrl, token);

            // Also update legacy singleton for backward compat with old callers
            if (!result.success) {
                AppModeManager.getInstance().setMode('standalone');
                AppModeManager.getInstance().setEmployeeId(null);
            }
            return result;
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('employee:disconnectFromBoss', async () => {
        try {
            // Disconnect the active workspace's connection
            const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
            if (activeWs) {
                HttpConnectionManager.getInstance().disconnect(activeWs.id);
            }
            // Also disconnect legacy singleton
            HttpClientService.getInstance().disconnect();
            AppModeManager.getInstance().setMode('standalone');
            AppModeManager.getInstance().setEmployeeId(null);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('employee:getConnectionStatus', async () => {
        // Return status for the active workspace connection (or legacy singleton)
        const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
        if (activeWs?.type === 'remote') {
            return HttpConnectionManager.getInstance().getStatus(activeWs.id);
        }
        return HttpClientService.getInstance().getStatus();
    });

    ipcMain.handle('employee:proxyAction', async (_e, { channel, params }: { channel: string; params: any }) => {
        try {
            const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
            if (activeWs?.type === 'remote') {
                return await HttpConnectionManager.getInstance().proxyAction(activeWs.id, channel, params);
            }
            return await HttpClientService.getInstance().proxyAction(channel, params);
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    // ─── Employee Groups ────────────────────────────────────────────────

    ipcMain.handle('employee:listGroups', async () => {
        try {
            const groups = empSvc().getGroups();
            return { success: true, groups };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('employee:createGroup', async (_e, { name, color }: { name: string; color?: string }) => {
        try {
            return empSvc().createGroup({ name, color });
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('employee:updateGroup', async (_e, { groupId, updates }: { groupId: string; updates: { name?: string; color?: string; sort_order?: number } }) => {
        try {
            return empSvc().updateGroup(groupId, updates);
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('employee:deleteGroup', async (_e, { groupId }: { groupId: string }) => {
        try {
            return empSvc().deleteGroup(groupId);
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

    // ─── Employee Analytics (Advanced) ───────────────────────────────

    ipcMain.handle('employee:analytics:comparison', async (_e, { sinceTs, untilTs }: { sinceTs: number; untilTs: number }) => {
        try {
            const data = DatabaseService.getInstance().getEmployeeComparison(sinceTs, untilTs);
            return { success: true, data };
        } catch (err: any) {
            return { success: false, error: err.message, data: [] };
        }
    });

    ipcMain.handle('employee:analytics:messageTimeline', async (_e, { sinceTs, untilTs }: { sinceTs: number; untilTs: number }) => {
        try {
            const data = DatabaseService.getInstance().getEmployeeMessageTimeline(sinceTs, untilTs);
            return { success: true, data };
        } catch (err: any) {
            return { success: false, error: err.message, data: [] };
        }
    });

    ipcMain.handle('employee:analytics:onlineTimeline', async (_e, { sinceTs, untilTs }: { sinceTs: number; untilTs: number }) => {
        try {
            const data = DatabaseService.getInstance().getEmployeeOnlineTimeline(sinceTs, untilTs);
            return { success: true, data };
        } catch (err: any) {
            return { success: false, error: err.message, data: [] };
        }
    });

    ipcMain.handle('employee:analytics:responseDistribution', async (_e, { sinceTs, untilTs }: { sinceTs: number; untilTs: number }) => {
        try {
            const data = DatabaseService.getInstance().getEmployeeResponseDistribution(sinceTs, untilTs);
            return { success: true, data };
        } catch (err: any) {
            return { success: false, error: err.message, data: [] };
        }
    });

    ipcMain.handle('employee:analytics:hourlyActivity', async (_e, { sinceTs, untilTs }: { sinceTs: number; untilTs: number }) => {
        try {
            const data = DatabaseService.getInstance().getEmployeeHourlyActivity(sinceTs, untilTs);
            return { success: true, data };
        } catch (err: any) {
            return { success: false, error: err.message, data: [] };
        }
    });

    Logger.log('[employeeIpc] Registered 26 employee IPC channels');
}
