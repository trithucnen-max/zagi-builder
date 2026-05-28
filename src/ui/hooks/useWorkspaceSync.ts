import { useEffect } from 'react';
import { useAccountStore } from '../store/accountStore';
import { useChatStore } from '../store/chatStore';
import { useAppStore } from '../store/appStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useEmployeeStore } from '../store/employeeStore';
import ipc from '../lib/ipc';
import { getFilteredUnreadCount } from '../lib/badgeUtils';
import Logger from '../../utils/Logger';

// ─── Local types ─────────────────────────────────────────────────────────────
type WorkspacePermissionCache = { module: string; can_access: boolean };
type WorkspaceAccountCache = {
  zalo_id: string;
  full_name: string;
  avatar_url: string;
  phone?: string;
  is_business?: number;
  is_active?: number;
  listener_active?: number;
};

// ─── Pure helpers (no React deps) ────────────────────────────────────────────
function buildPermissionsMap(permissions?: WorkspacePermissionCache[]): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const permission of (permissions || [])) {
    result[permission.module] = !!permission.can_access;
  }
  return result;
}

function normalizeWorkspaceAccounts(accounts?: WorkspaceAccountCache[]) {
  return (accounts || []).map((account: any) => {
    const listenerState = account.listener_active ?? account.listenerActive ?? (account.isConnected ? 1 : 0);
    const fullName = account.full_name || account.display_name || account.zalo_id;
    return {
      zalo_id: account.zalo_id,
      display_name: fullName,
      full_name: fullName,
      avatar_url: account.avatar_url || '',
      phone: account.phone || '',
      is_business: account.is_business || 0,
      imei: '',
      user_agent: '',
      cookies: '',
      is_active: account.is_active ?? 1,
      created_at: '',
      listenerActive: !!listenerState,
      isConnected: !!listenerState,
      isOnline: !!listenerState,
    };
  });
}

function buildCurrentEmployeeFromWorkspace(ws: any) {
  if (!ws || ws.type !== 'remote') return null;
  const cachedEmployee = ws.cachedEmployeesData?.find((emp: any) => emp.employee_id === (ws.employeeId || ''));
  return {
    employee_id: ws.employeeId || '',
    username: cachedEmployee?.username || ws.employeeUsername || '',
    display_name: cachedEmployee?.display_name || ws.employeeName || ws.name || 'Nhân viên',
    avatar_url: cachedEmployee?.avatar_url || '',
    role: 'employee' as const,
    is_active: cachedEmployee?.is_active ?? 1,
    permissions: cachedEmployee?.permissions || ws.cachedPermissions || [],
    assigned_accounts: cachedEmployee?.assigned_accounts || ws.cachedAssignedAccounts || [],
  };
}

// Export helpers for use in App.tsx init
export { buildPermissionsMap, normalizeWorkspaceAccounts, buildCurrentEmployeeFromWorkspace };

/**
 * Subscribes to all workspace-related IPC events from the Electron main process:
 * - workspace:switched
 * - workspace:initialState
 * - workspace:accountAccessUpdate
 * - workspace:connectionStatus
 *
 * Also applies employee permission guard to redirect on view change.
 */
export function useWorkspaceSync(initCheckedRef: React.MutableRefObject<Set<string>>) {
  const { setAccounts } = useAccountStore();
  const { setContacts } = useChatStore();

  // ── Employee permission guard ─────────────────────────────────────────────
  useEffect(() => {
    return useEmployeeStore.subscribe((empState) => {
      const { mode, permissions } = empState;
      if (mode !== 'employee') return;

      const VIEW_PERM_MAP: Record<string, string | null> = {
        dashboard:   null,
        settings:    null,
        chat:        'chat',
        friends:     'friends',
        crm:         'crm',
        workflow:    'workflow',
        integration: 'integration',
        analytics:   'analytics',
      };
      const currentView = useAppStore.getState().view;
      const requiredPerm = VIEW_PERM_MAP[currentView];
      if (requiredPerm !== undefined && requiredPerm !== null && !permissions[requiredPerm]) {
        useAppStore.getState().setView('dashboard');
      }
    });
  }, []);

  // ── workspace:switched ────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = window.electronAPI?.on('workspace:switched', async (data: any) => {
      if (!data?.workspace) {
        useWorkspaceStore.getState().setIsSwitching(false);
        return;
      }
      const switchTimeout = setTimeout(() => {
        Logger.warn('[WorkspaceSync] workspace:switched handler timeout — forcing isSwitching=false');
        useWorkspaceStore.getState().setIsSwitching(false);
      }, 15000);

      try {
        const ws = data.workspace;
        useWorkspaceStore.getState().setActiveWorkspaceId(ws.id);
        initCheckedRef.current.clear();

        useChatStore.getState().resetForWorkspaceSwitch();
        useAccountStore.getState().setActiveAccount(null);

        const appState = useAppStore.getState();
        if (appState.mergedInboxMode) appState.exitMergedInbox();
        useAppStore.setState({ groupInfoCache: {} } as any);

        const empStore = useEmployeeStore.getState();
        empStore.setPreviewEmployeeId?.(null);

        if (ws.type === 'remote') {
          empStore.reset();
          empStore.setMode('employee');
          empStore.setCurrentEmployee(buildCurrentEmployeeFromWorkspace(ws));
          empStore.setBossUrl(ws.bossUrl || '');
          empStore.setPermissions(buildPermissionsMap(ws.cachedPermissions));
          empStore.setAssignedAccounts(ws.cachedAssignedAccounts || []);
          empStore.setEmployees(ws.cachedEmployeesData || []);
          const snapshot = ws._snapshot;
          if (snapshot) {
            empStore.setBossConnected(true);
            if (snapshot.assignedAccounts?.length) empStore.setAssignedAccounts(snapshot.assignedAccounts);
            if (snapshot.permissions?.length) empStore.setPermissions(buildPermissionsMap(snapshot.permissions));
            if (snapshot.employeesData) empStore.setEmployees(snapshot.employeesData);
          } else {
            empStore.setBossConnected(!!ws._connected);
          }
        } else {
          empStore.reset();
        }

        let nextAccounts: any[];
        if (ws.type === 'remote') {
          const snapshotAccounts = ws._snapshot?.accountsData;
          nextAccounts = normalizeWorkspaceAccounts(
            snapshotAccounts?.length ? snapshotAccounts : (ws.cachedAccountsData || [])
          );
        } else {
          const accountsRes = await ipc.login?.getAccounts();
          nextAccounts = accountsRes?.accounts || [];
        }

        setAccounts(nextAccounts);
        if (nextAccounts.length > 0) {
          useAccountStore.getState().setActiveAccount(nextAccounts[0].zalo_id);
        }

        for (const acc of nextAccounts) {
          try {
            const contactsRes = await Promise.race([
              ipc.db?.getContacts(acc.zalo_id),
              new Promise(r => setTimeout(() => r(null), 5000)),
            ]) as any;
            if (contactsRes?.contacts) setContacts(acc.zalo_id, contactsRes.contacts);
          } catch { /* non-fatal */ }
        }

        const { loadFlags } = useAppStore.getState();
        for (const acc of nextAccounts) {
          try {
            await Promise.race([loadFlags(acc.zalo_id), new Promise(r => setTimeout(r, 3000))]);
          } catch { /* non-fatal */ }
        }

        ipc.app?.setBadge(getFilteredUnreadCount());
      } catch (err) {
        Logger.error('[WorkspaceSync] workspace:switched error:', err);
      } finally {
        clearTimeout(switchTimeout);
        useWorkspaceStore.getState().setIsSwitching(false);
      }
    });
    return () => unsub?.();
  }, [setAccounts, setContacts]);

  // ── workspace:initialState ────────────────────────────────────────────────
  useEffect(() => {
    const unsub = window.electronAPI?.on('workspace:initialState', async (data: any) => {
      if (!data?.workspaceId) return;

      const storeActiveWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId;
      const activeWorkspaceId = storeActiveWorkspaceId
        || (await ipc.workspace?.getActive?.().then((res: any) => res?.workspace?.id).catch(() => ''));

      const cachedAccounts = normalizeWorkspaceAccounts(data.accountsData || []);
      const permissions = data.permissions || [];
      const assignedAccounts = data.assignedAccounts || [];
      const employeesData = data.employeesData || [];

      await ipc.workspace?.update(data.workspaceId, {
        cachedPermissions: permissions,
        cachedAssignedAccounts: assignedAccounts,
        cachedErpRole: data.erpRole || '',
        cachedErpExtraJson: data.erpExtraJson || '',
        cachedEmployeesData: employeesData,
        cachedAccountsData: cachedAccounts,
      }).catch(() => null);

      useWorkspaceStore.getState().setWorkspaces(
        useWorkspaceStore.getState().workspaces.map((ws: any) =>
          ws.id === data.workspaceId
            ? { ...ws, cachedPermissions: permissions, cachedAssignedAccounts: assignedAccounts, cachedErpRole: data.erpRole || '', cachedErpExtraJson: data.erpExtraJson || '', cachedEmployeesData: employeesData, cachedAccountsData: cachedAccounts }
            : ws
        )
      );

      if (data.workspaceId !== activeWorkspaceId) return;

      const empStore = useEmployeeStore.getState();
      if (empStore.mode !== 'employee') {
        empStore.reset();
        empStore.setMode('employee');
      }
      empStore.setCurrentEmployee(buildCurrentEmployeeFromWorkspace(useWorkspaceStore.getState().activeWorkspace()));
      empStore.setPermissions(buildPermissionsMap(permissions));
      empStore.setAssignedAccounts(assignedAccounts);
      empStore.setBossConnected(true);
      empStore.setEmployees(employeesData);
      empStore.setCurrentEmployee(buildCurrentEmployeeFromWorkspace({
        ...useWorkspaceStore.getState().activeWorkspace(),
        cachedPermissions: permissions,
        cachedAssignedAccounts: assignedAccounts,
        cachedEmployeesData: employeesData,
      }));

      if (cachedAccounts.length > 0) {
        setAccounts(cachedAccounts as any);
      } else {
        setAccounts([]);
      }

      const syncAccountIds = assignedAccounts;
      if (syncAccountIds.length > 0) {
        try {
          const syncStatus = await ipc.sync?.getStatus();
          if (!syncStatus?.lastSyncTs) {
            ipc.sync?.requestFullSync(syncAccountIds).catch(() => {});
          }
        } catch { /* non-fatal */ }
      }
    });
    return () => unsub?.();
  }, [setAccounts]);

  // ── workspace:accountAccessUpdate ─────────────────────────────────────────
  useEffect(() => {
    const unsub = window.electronAPI?.on('workspace:accountAccessUpdate', async (data: any) => {
      if (!data?.workspaceId) return;

      const assignedAccounts = data.assignedAccounts || [];
      const cachedAccounts = normalizeWorkspaceAccounts(data.accountsData || []);

      await ipc.workspace?.update(data.workspaceId, {
        cachedAssignedAccounts: assignedAccounts,
        cachedAccountsData: cachedAccounts,
      }).catch(() => null);

      useWorkspaceStore.getState().setWorkspaces(
        useWorkspaceStore.getState().workspaces.map((ws: any) =>
          ws.id === data.workspaceId
            ? { ...ws, cachedAssignedAccounts: assignedAccounts, cachedAccountsData: cachedAccounts }
            : ws
        )
      );

      const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
        || (await ipc.workspace?.getActive?.().then((res: any) => res?.workspace?.id).catch(() => ''));

      if (data.workspaceId !== activeWorkspaceId) return;

      useEmployeeStore.getState().setAssignedAccounts(assignedAccounts);
      const assignedSet = new Set(assignedAccounts);
      const nextAccounts = cachedAccounts.length > 0
        ? cachedAccounts.filter((a: any) => assignedSet.has(a.zalo_id))
        : useAccountStore.getState().accounts.filter(a => assignedSet.has(a.zalo_id));

      setAccounts(nextAccounts as any);
    });
    return () => unsub?.();
  }, [setAccounts]);

  // ── workspace:connectionStatus ────────────────────────────────────────────
  useEffect(() => {
    const unsub = window.electronAPI?.on('workspace:connectionStatus', (data: any) => {
      if (!data?.workspaceId) return;
      useWorkspaceStore.getState().setConnectionStatus(data.workspaceId, {
        connected: !!data.connected,
        latency: data.latency ?? 0,
      });
      const activeWsId = useWorkspaceStore.getState().activeWorkspaceId;
      if (data.workspaceId === activeWsId) {
        const empStore = useEmployeeStore.getState();
        if (empStore.mode === 'employee') {
          empStore.setBossConnected(!!data.connected);
          if (data.latency !== undefined) empStore.setLatency(data.latency);
        }
      }
    });
    return () => unsub?.();
  }, []);
}
