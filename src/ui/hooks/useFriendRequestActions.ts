import { useCallback } from 'react';
import { useAccountStore } from '../store/accountStore';
import { useChatStore } from '../store/chatStore';
import { useAppStore } from '../store/appStore';
import ipc from '../lib/ipc';

/**
 * Tách logic xử lý friend request (accept/reject/openAll) ra khỏi App.tsx.
 */
export function useFriendRequestActions(
  accounts: ReturnType<typeof useAccountStore.getState>['accounts'],
) {
  const handleFriendRequestAccept = useCallback(async (zaloId: string, userId: string) => {
    const acc = accounts.find(a => a.zalo_id === zaloId);
    if (!acc) return;
    const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };
    await ipc.zalo?.acceptFriendRequest({ auth, userId });
    await ipc.db?.removeFriendRequest({ zaloId, userId, direction: 'received' }).catch(() => {});
    await ipc.db?.getFriendRequests({ zaloId, direction: 'received' }).then((res: any) => {
      const count = res?.requests?.length ?? 0;
      if (count === 0) useAppStore.getState().clearCRMRequestUnseen(zaloId);
    }).catch(() => {});
    useAppStore.getState().showNotification('Đã chấp nhận lời mời kết bạn!', 'success');
  }, [accounts]);

  const handleFriendRequestReject = useCallback(async (zaloId: string, userId: string) => {
    const acc = accounts.find(a => a.zalo_id === zaloId);
    if (!acc) return;
    const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };
    await ipc.zalo?.rejectFriendRequest({ auth, userId });
    await ipc.db?.removeFriendRequest({ zaloId, userId, direction: 'received' }).catch(() => {});
    await ipc.db?.getFriendRequests({ zaloId, direction: 'received' }).then((res: any) => {
      const count = res?.requests?.length ?? 0;
      if (count === 0) useAppStore.getState().clearCRMRequestUnseen(zaloId);
    }).catch(() => {});
    useAppStore.getState().showNotification('Đã từ chối lời mời kết bạn', 'info');
  }, [accounts]);

  const handleFriendRequestOpenAll = useCallback((zaloId: string) => {
    const { activeAccountId, setActiveAccount } = useAccountStore.getState();
    if (activeAccountId !== zaloId) setActiveAccount(zaloId);
    useAppStore.getState().setView('crm');
    setTimeout(() => window.dispatchEvent(new CustomEvent('nav:friendRequests')), 100);
  }, []);

  return { handleFriendRequestAccept, handleFriendRequestReject, handleFriendRequestOpenAll };
}
