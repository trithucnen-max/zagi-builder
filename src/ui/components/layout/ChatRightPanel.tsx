import React from 'react';

import GroupBoardPanel from '../chat/GroupBoardPanel';
import ConversationInfo from '../chat/ConversationInfo';
import IntegrationQuickPanel from '../integration/IntegrationQuickPanel';
import AIQuickPanel from '../integration/AIQuickPanel';

import { usePanelStore } from '../../store/panelStore';
import { useAccountStore } from '../../store/accountStore';
import { useChatStore, useActiveThreadId, useActiveThreadType, useContacts } from '../../store/chatStore';
import ipc from '../../lib/ipc';
import Logger from '../../../utils/Logger';

interface ChatRightPanelProps {
  /** Callback khi overlay cần đóng (click ra ngoài) */
  onClose: () => void;
}

/**
 * Tách toàn bộ right-panel logic từ App.tsx.
 * Render: GroupBoardPanel, ConversationInfo, IntegrationQuickPanel, AIQuickPanel.
 * Mỗi panel render exclusive (chỉ 1 cái ở z-top).
 */
export default function ChatRightPanel({ onClose }: ChatRightPanelProps) {
  const {
    showGroupBoard, setShowGroupBoard,
    showConversationInfo,
    showIntegrationQuickPanel, toggleIntegrationQuickPanel,
    showAIQuickPanel, toggleAIQuickPanel,
  } = usePanelStore();

  const { activeAccountId } = useAccountStore();
  const activeThreadId = useActiveThreadId();
  const activeThreadType = useActiveThreadType();
  const contacts = useContacts();

  // ─── GroupBoard ──────────────────────────────────────────────────────────
  if (showGroupBoard && activeThreadId && activeAccountId) {
    const contact = (contacts[activeAccountId] || []).find(c => c.contact_id === activeThreadId);
    const isGroup = activeThreadType === 1 || contact?.contact_type === 'group';
    if (!isGroup) return null;

    const scrollAndHighlight = (el: HTMLElement) => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-yellow-400', 'ring-opacity-75');
      setTimeout(() => el.classList.remove('ring-2', 'ring-yellow-400', 'ring-opacity-75'), 2000);
    };

    const handleScrollToMsg = async (msgId: string) => {
      setShowGroupBoard(false);
      await new Promise(r => setTimeout(r, 100));

      const el = document.getElementById(`msg-${msgId}`);
      if (el) { scrollAndHighlight(el); return; }
      if (!activeAccountId || !activeThreadId) return;

      try {
        const msgRes = await ipc.db?.getMessageById({ zaloId: activeAccountId, msgId });
        const targetMsg = msgRes?.message;
        if (!targetMsg?.timestamp) return;

        const { setMessages } = useChatStore.getState();
        const aroundRes = await ipc.db?.getMessagesAround({
          zaloId: activeAccountId,
          threadId: activeThreadId,
          timestamp: targetMsg.timestamp,
          limit: 80,
        });
        const aroundMsgs = aroundRes?.messages;
        if (!aroundMsgs?.length) return;

        setMessages(activeAccountId, activeThreadId, aroundMsgs);
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const finalEl = document.getElementById(`msg-${msgId}`);
        if (finalEl) scrollAndHighlight(finalEl);
      } catch (err) {
        Logger.error('[GroupBoard:onScrollToMsg] Failed to load messages around target:', err);
      }
    };

    return (
      <div
        className="absolute inset-y-0 right-0 z-50 w-80 max-w-[92vw] border-l border-gray-700 bg-gray-800 flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <GroupBoardPanel
          zaloId={activeAccountId}
          threadId={activeThreadId}
          onBack={() => setShowGroupBoard(false)}
          onCreateNote={() => window.dispatchEvent(new CustomEvent('groupinfo:createNote', { detail: { groupId: activeThreadId } }))}
          onScrollToMsg={handleScrollToMsg}
          onNoteClick={(note) => window.dispatchEvent(new CustomEvent('groupinfo:viewNote', { detail: note }))}
        />
      </div>
    );
  }

  // ─── ConversationInfo ────────────────────────────────────────────────────
  if (showConversationInfo && activeThreadId) {
    return (
      <div
        className="absolute inset-y-0 right-0 z-40 max-w-[92vw] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <ConversationInfo />
        <button
          type="button"
          onClick={onClose}
          title="Đóng"
          className="absolute top-2 left-2 z-50 w-8 h-8 rounded-full text-gray-200 flex items-center justify-center transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    );
  }

  // ─── Integration quick panel ──────────────────────────────────────────────
  if (showIntegrationQuickPanel) {
    const contactList = activeAccountId ? (contacts[activeAccountId] || []) : [];
    const activeContact = contactList.find((x: any) => x.contact_id === activeThreadId);

    const rawPhone = activeContact?.phone || '';
    const digits = rawPhone.startsWith('+') ? rawPhone.slice(1) : rawPhone;
    const contextPhone = (digits.startsWith('84') && digits.length >= 11) ? '0' + digits.slice(2) : rawPhone;
    const contextName = activeContact?.alias || activeContact?.display_name || '';

    return (
      <div
        className="absolute inset-y-0 right-0 z-40 max-w-[92vw] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <IntegrationQuickPanel
          onClose={toggleIntegrationQuickPanel}
          contextPhone={contextPhone}
          contextName={contextName}
        />
      </div>
    );
  }

  // ─── AI quick panel ───────────────────────────────────────────────────────
  if (showAIQuickPanel) {
    return (
      <div
        className="absolute inset-y-0 right-0 z-40 max-w-[92vw] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <AIQuickPanel onClose={toggleAIQuickPanel} />
      </div>
    );
  }

  return null;
}
