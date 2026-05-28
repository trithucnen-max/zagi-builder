import React, { useCallback, useEffect, useState, useRef } from 'react';

import AppRouter from './router/AppRouter';
import MainLayout from './layouts/MainLayout';
import TopBar from './components/layout/TopBar';

// Common UI
import AccountInitPanel from './components/common/AccountInitPanel';
import AddAccountModal from '@/components/auth/AddAccountModal';
import EmployeeConnectionBanner from '@/components/common/EmployeeConnectionBanner';
import { UpdateNotification } from './components/common/UpdateNotification';
import { GlobalNotification } from './components/common/GlobalNotification';
import { ErpPermissionDialog } from './components/common/ErpPermissionDialog';
import ReminderNotification from './components/chat/ReminderNotification';
import FriendRequestNotification, { FriendRequestNotifData } from './components/common/FriendRequestNotification';
import QuickChatModal from './components/chat/QuickChatModal';
import CommandPalette from './components/common/CommandPalette';
import LicenseWarningBanner from './components/common/LicenseWarningBanner';


// Stores
import { useAppStore } from './store/appStore';
import { useViewStore } from './store/viewStore';
import { useModalStore } from './store/modalStore';
import { usePanelStore } from './store/panelStore';
import { useAccountStore } from './store/accountStore';
import { useChatStore } from './store/chatStore';

// Hooks
import { useZaloEvents } from './hooks/useZaloEvents';
import { useChatEvents } from './hooks/useChatEvents';
import useIsMobile from './hooks/useIsMobile';
import { useConnectionHealth } from './hooks/useConnectionHealth';
import { useWorkspaceSync } from './hooks/useWorkspaceSync';
import { useAppInit } from './hooks/useAppInit';
import { useAppEventHandlers } from './hooks/useAppEventHandlers';
import { useFriendRequestActions } from './hooks/useFriendRequestActions';

// Lib
import ipc from './lib/ipc';
import { sendSeenForThread } from './lib/sendSeenHelper';

export default function App() {
  const { view, setView, theme } = useViewStore();
  const { addAccountModalOpen, setAddAccountModalOpen, quickChatOpen } = useModalStore();
  const {
    showConversationInfo, toggleConversationInfo,
    showGroupBoard, setShowGroupBoard,
    showIntegrationQuickPanel, toggleIntegrationQuickPanel,
    showAIQuickPanel, toggleAIQuickPanel,
  } = usePanelStore();

  const { accounts } = useAccountStore();
  const { activeThreadId, activeThreadType, contacts } = useChatStore();
  const { activeAccountId } = useAccountStore();

  const [initializing, setInitializing] = useState(true);
  const isMobile = useIsMobile();
  const { mobileShowChat, setMobileShowChat } = useViewStore();

  const initCheckedRef = useRef<Set<string>>(new Set());
  const isWindowFocusedRef = useRef(true);

  const [reminderNotification, setReminderNotification] = useState<{
    emoji: string; title: string; description: string;
    accountName: string; conversationName: string;
    color: number; zaloId: string; threadId: string; threadType: number;
  } | null>(null);
  const [friendRequestQueue, setFriendRequestQueue] = useState<FriendRequestNotifData[]>([]);
  const [accountInitId, setAccountInitId] = useState<string | null>(null);
  const [isInGracePeriod, setIsInGracePeriod] = useState(false);


  // ─── Domain hooks ─────────────────────────────────────────────────────────
  useZaloEvents();
  useChatEvents();
  useConnectionHealth();
  useWorkspaceSync(initCheckedRef);

  // ─── Feature hooks (extracted from this file) ─────────────────────────────
  useAppInit(initCheckedRef, setAccountInitId, setInitializing);
  useAppEventHandlers(isWindowFocusedRef, setReminderNotification, setFriendRequestQueue, accounts, contacts);
  const { handleFriendRequestAccept, handleFriendRequestReject, handleFriendRequestOpenAll } =
    useFriendRequestActions(accounts);

  // ─── Grace period check ────────────────────────────────────────────────
  useEffect(() => {
    (window as any).licenseAPI?.isInGracePeriod?.().then((grace: boolean) => {
      setIsInGracePeriod(!!grace);
    }).catch(() => {});
  }, []);

  // ─── Sync theme to <html> element ─────────────────────────────────────────
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // ─── Reset mobile chat on desktop resize ──────────────────────────────────
  useEffect(() => {
    if (!isMobile) setMobileShowChat(false);
  }, [isMobile, setMobileShowChat]);

  // ─── nav:view event ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { view: targetView } = (e as CustomEvent).detail || {};
      if (targetView) setView(targetView);
    };
    window.addEventListener('nav:view', handler);
    return () => window.removeEventListener('nav:view', handler);
  }, [setView]);



  // ─── Loading state ────────────────────────────────────────────────────────
  if (initializing) {
    return (
      <div className="h-screen flex flex-col bg-gray-900">
        <TopBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <svg className="animate-spin w-10 h-10 text-blue-400 mx-auto mb-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-400 text-sm">Đang khởi động...</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <>
      {/* Banner cảnh báo sắp hết hạn / grace period */}
      <LicenseWarningBanner onRenew={() => useViewStore.getState().setView('settings')} />

      <MainLayout onAddAccount={() => setAddAccountModalOpen(true)}>
        <AppRouter view={view} />
      </MainLayout>

      {/* ─── Modals & Overlays ─────────────────────────────────────────────── */}
      {addAccountModalOpen && <AddAccountModal onClose={() => setAddAccountModalOpen(false)} />}
      <GlobalNotification />
      <ErpPermissionDialog />

      {reminderNotification && (
        <ReminderNotification
          data={reminderNotification}
          onClose={() => setReminderNotification(null)}
          onOpenThread={(zaloId, threadId, threadType) => {
            setReminderNotification(null);
            const { setActiveThread, setMessages, clearUnread } = useChatStore.getState();
            const { setActiveAccount } = useAccountStore.getState();
            setActiveAccount(zaloId);
            setActiveThread(threadId, threadType);
            clearUnread(zaloId, threadId);
            ipc.db?.markAsRead({ zaloId, contactId: threadId }).catch(() => {});
            sendSeenForThread(zaloId, threadId, threadType);
            ipc.db?.getMessages({ zaloId, threadId, limit: 50, offset: 0 }).then((res: any) => {
              const msgs = res?.messages || [];
              if (msgs.length > 0) setMessages(zaloId, threadId, [...msgs].reverse());
            }).catch(() => {});
            useAppStore.getState().setView('chat');
          }}
        />
      )}

      {friendRequestQueue.length > 0 && (
        <FriendRequestNotification
          key={`${friendRequestQueue[0].zaloId}_${friendRequestQueue[0].userId}`}
          data={friendRequestQueue[0]}
          onAccept={handleFriendRequestAccept}
          onReject={handleFriendRequestReject}
          onOpenRequests={handleFriendRequestOpenAll}
          onClose={() => setFriendRequestQueue(prev => prev.slice(1))}
        />
      )}

      {quickChatOpen && <QuickChatModal />}

      {accountInitId && (
        <AccountInitPanel accountId={accountInitId} onClose={() => setAccountInitId(null)} />
      )}

      <UpdateNotification />
      <CommandPalette />
    </>
  );
}
