import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { useAccountStore } from '../store/accountStore';
import { useChatStore } from '../store/chatStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useEmployeeStore } from '../store/employeeStore';
import ipc from '../lib/ipc';
import { getFilteredUnreadCount } from '../lib/badgeUtils';
import { checkAccountInitNeeds } from '../lib/zaloInitUtils';
import {
  buildPermissionsMap,
  normalizeWorkspaceAccounts,
  buildCurrentEmployeeFromWorkspace,
} from './useWorkspaceSync';
import Logger from '../../utils/Logger';

/**
 * Tách toàn bộ logic khởi tạo App ra khỏi App.tsx.
 *
 * @param initCheckedRef  Set theo dõi account IDs đã qua init check (tránh check lại)
 * @param setAccountInitId Callback để App.tsx render AccountInitPanel khi cần
 * @param setInitializing  Callback cập nhật loading state
 */
export function useAppInit(
  initCheckedRef: React.MutableRefObject<Set<string>>,
  setAccountInitId: (id: string | null) => void,
  setInitializing: (v: boolean) => void,
) {
  const { setAccounts } = useAccountStore();
  const { setContacts } = useChatStore();
  const { activeAccountId } = useAccountStore();
  const { view } = useAppStore();

  // ─── App initialization ───────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const accountsRes = await ipc.login?.getAccounts();
        if (accountsRes?.accounts) {
          setAccounts(accountsRes.accounts);

          for (const acc of accountsRes.accounts) {
            const contactsRes = await ipc.db?.getContacts(acc.zalo_id);
            if (contactsRes?.contacts) setContacts(acc.zalo_id, contactsRes.contacts);
          }

          const { loadFlags } = useAppStore.getState();
          for (const acc of accountsRes.accounts) {
            await loadFlags(acc.zalo_id);
          }

          ipc.app?.setBadge(getFilteredUnreadCount());

          for (const acc of accountsRes.accounts) {
            if ((acc.channel || 'zalo') !== 'zalo' || !acc.isConnected) {
              const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };
              ipc.login?.connectAccount(auth).catch(() => {});
            }
          }

          const fbAccounts = accountsRes.accounts.filter((a: any) => (a.channel || 'zalo') === 'facebook');
          if (fbAccounts.length > 0) {
            setTimeout(async () => {
              for (const fbAcc of fbAccounts) {
                try {
                  const health = await ipc.fb?.checkHealth({ accountId: fbAcc.zalo_id });
                  if (health?.success && health.alive) {
                    useAccountStore.getState().updateAccountStatus(fbAcc.zalo_id, true, true);
                  }
                } catch { /* non-fatal */ }
              }
            }, 2000);
          }
        }

        try {
          const activeWsRes = await ipc.workspace?.getActive();
          const activeWs = activeWsRes?.workspace;
          if (activeWs?.id) useWorkspaceStore.getState().setActiveWorkspaceId(activeWs.id);
          if (activeWs?.type === 'remote') {
            const empStore = useEmployeeStore.getState();
            empStore.reset();
            empStore.setMode('employee');
            empStore.setCurrentEmployee(buildCurrentEmployeeFromWorkspace(activeWs));
            empStore.setBossUrl(activeWs.bossUrl || '');
            const connStatus = await ipc.workspace?.getConnectionStatus?.(activeWs.id).catch(() => null);
            empStore.setBossConnected(!!connStatus?.connected);
            if (connStatus?.latency !== undefined) empStore.setLatency(connStatus.latency);
            empStore.setPermissions(buildPermissionsMap(activeWs.cachedPermissions));
            empStore.setAssignedAccounts(activeWs.cachedAssignedAccounts || []);
            if (useAccountStore.getState().accounts.length === 0 && activeWs.cachedAccountsData?.length) {
              setAccounts(normalizeWorkspaceAccounts(activeWs.cachedAccountsData) as any);
            }
          }
        } catch { /* non-fatal */ }
      } catch (err) {
        Logger.error('[useAppInit] Init error:', err);
      } finally {
        setInitializing(false);
      }
    };
    init();
  }, [setAccounts, setContacts, setInitializing]);

  // ─── Account init check (Zalo / Facebook) ────────────────────────────────
  useEffect(() => {
    if (!activeAccountId || view !== 'chat') return;
    const acc = useAccountStore.getState().accounts.find(a => a.zalo_id === activeAccountId);
    const channel = acc?.channel || 'zalo';
    if (initCheckedRef.current.has(activeAccountId)) return;
    initCheckedRef.current.add(activeAccountId);

    const accountId = activeAccountId;
    if (channel === 'facebook') {
      import('@/lib/fbInitUtils').then(({ checkFBAccountInitNeeds }) => {
        checkFBAccountInitNeeds(accountId).then(needs => {
          if (needs.any) setAccountInitId(accountId);
        }).catch(() => {});
      });
    } else {
      checkAccountInitNeeds(accountId).then(needs => {
        if (needs.any) setAccountInitId(accountId);
      }).catch(() => {});
    }
  }, [activeAccountId, view, initCheckedRef, setAccountInitId]);
}
