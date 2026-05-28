import { useEffect, useRef } from 'react';
import { FriendRequestNotifData } from '../components/common/FriendRequestNotification';
import { useAccountStore } from '../store/accountStore';
import { useChatStore } from '../store/chatStore';
import { useAppStore } from '../store/appStore';
import { useViewStore } from '../store/viewStore';
import { useModalStore } from '../store/modalStore';
import { usePanelStore } from '../store/panelStore';
import { playNotificationSound, showDesktopNotification } from '../utils/NotificationService';
import Logger from '../../utils/Logger';

/**
 * Tách toàn bộ event listeners ra khỏi App.tsx.
 * Xử lý: flash frame, Facebook messages, keyboard shortcuts, reminders, friend requests.
 */
export function useAppEventHandlers(
  isWindowFocusedRef: React.MutableRefObject<boolean>,
  setReminderNotification: (data: any) => void,
  setFriendRequestQueue: React.Dispatch<React.SetStateAction<FriendRequestNotifData[]>>,
  accounts: ReturnType<typeof useAccountStore.getState>['accounts'],
  contacts: ReturnType<typeof useChatStore.getState>['contacts'],
) {
  const { openQuickChat } = useAppStore();

  // ─── Window focus / taskbar flash ─────────────────────────────────────────
  useEffect(() => {
    const unsub = window.electronAPI?.on('app:windowFocus', (focused: boolean) => {
      isWindowFocusedRef.current = focused;
      if (focused) window.electronAPI?.app?.flashFrame?.(false);
    });
    return () => unsub?.();
  }, [isWindowFocusedRef]);

  // ─── Flash on new Zalo message ────────────────────────────────────────────
  useEffect(() => {
    const unsub = window.electronAPI?.on('event:message', (data: any) => {
      if (isWindowFocusedRef.current || data?.message?.isSelf) return;
      const { isMuted, isInOthers } = useAppStore.getState();
      const zaloId = data?.zaloId || '';
      const threadId = data?.message?.threadId || '';
      if (isMuted(zaloId, threadId) || isInOthers(zaloId, threadId)) return;
      window.electronAPI?.app?.flashFrame?.(true);
    });
    return () => unsub?.();
  }, [isWindowFocusedRef]);

  // ─── Flash & notify on new Facebook message ───────────────────────────────
  useEffect(() => {
    const unsub = window.electronAPI?.on('fb:onMessage', (data: any) => {
      const body = data?.message?.body;
      const threadId = data?.message?.replyToID || '';
      const accountId = data?.fbAccountId || '';
      const isSelf = data?.message?.isSelf || (data?.message?.senderID === accountId);
      if (isSelf) return;

      const { notifSettings, isMuted, isInOthers } = useAppStore.getState();
      if (isMuted(accountId, threadId) || isInOthers(accountId, threadId)) return;

      if (!isWindowFocusedRef.current) window.electronAPI?.app?.flashFrame?.(true);

      const { activeThreadId: currentThread } = useChatStore.getState();
      const { activeAccountId: currentAccount } = useAccountStore.getState();
      if (threadId === currentThread && accountId === currentAccount && isWindowFocusedRef.current) return;

      const notifAllowed = !('Notification' in window) || Notification.permission === 'granted';
      if (notifSettings.soundEnabled && notifAllowed) playNotificationSound(notifSettings.volume);
      if (notifSettings.desktopEnabled && notifAllowed && body) {
        const contactList = useChatStore.getState().contacts[accountId] || [];
        const contact = contactList.find((c: any) => c.contact_id === threadId);
        showDesktopNotification(
          contact?.alias || contact?.display_name || 'Facebook',
          body.slice(0, 120),
          contact?.avatar_url,
          { zaloId: accountId, threadId, threadType: 0 }
        );
      }
    });
    return () => unsub?.();
  }, [isWindowFocusedRef]);

  // ─── Keyboard shortcuts: Navigation & Search (Ctrl/Cmd+K, Alt+1..8, Ctrl+Shift+N) ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Shift+N: Quick Chat
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        useModalStore.getState().openQuickChat();
      }

      // Ctrl+K / Cmd+K: toggle search/command palette
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        usePanelStore.getState().toggleCommandPalette();
      }

      // Alt + 1..8: switch views
      if (e.altKey && /^[1-8]$/.test(e.key)) {
        e.preventDefault();
        const views: Array<any> = [
          'dashboard', 'chat', 'crm', 'workflow',
          'integration', 'analytics', 'erp', 'settings'
        ];
        const targetView = views[parseInt(e.key, 10) - 1];
        if (targetView) {
          useViewStore.getState().setView(targetView);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ─── Reminder notification ────────────────────────────────────────────────
  useEffect(() => {
    const handleReminderEvent = (event: any) => {
      const { detail } = event;
      if (!detail) return;
      try {
        const { zaloId, threadId, msgType, content } = detail;
        if (msgType !== 'chat.ecard' || !content?.params) return;
        const params = typeof content.params === 'string' ? JSON.parse(content.params) : content.params;
        const actions = params?.actions?.[0];
        if (!actions?.data) return;
        const actionData = typeof actions.data === 'string' ? JSON.parse(actions.data) : actions.data;
        if (actionData.act !== 'remind_reminder11') return;
        const reminderData = typeof actionData.data === 'string' ? JSON.parse(actionData.data) : actionData.data;
        const account = accounts.find(a => a.zalo_id === zaloId);
        const contactList = contacts[zaloId] || [];
        const contact = contactList.find(c => c.contact_id === threadId);
        setReminderNotification({
          emoji: reminderData.emoji || '⏰',
          title: reminderData.params?.title || content.title || 'Nhắc hẹn',
          description: content.description || '',
          accountName: account?.display_name || account?.phone || 'Tài khoản',
          conversationName: contact?.display_name || 'Hội thoại',
          color: reminderData.color ?? -1,
          zaloId,
          threadId,
          threadType: contact?.contact_type === 'group' ? 1 : 0,
        });
      } catch (err) {
        Logger.error('[ReminderNotification] Parse error:', err);
      }
    };
    window.addEventListener('zalo:reminder', handleReminderEvent);
    return () => window.removeEventListener('zalo:reminder', handleReminderEvent);
  }, [accounts, contacts, setReminderNotification]);

  // ─── Friend request notification ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as FriendRequestNotifData;
      if (!detail?.userId) return;
      setFriendRequestQueue(prev => {
        if (prev.some(r => r.userId === detail.userId && r.zaloId === detail.zaloId)) return prev;
        return [...prev, detail];
      });
    };
    window.addEventListener('friendRequest:show', handler);
    return () => window.removeEventListener('friendRequest:show', handler);
  }, [setFriendRequestQueue]);
}
