import React, { useCallback } from 'react';
import ConversationList from '../components/chat/ConversationList';
import ChatHeader from '../components/chat/ChatHeader';
import ChatWindow from '../components/chat/ChatWindow';
import MessageInput from '../components/chat/MessageInput';
import ChatRightPanel from '../components/layout/ChatRightPanel';
import useIsMobile from '../hooks/useIsMobile';
import { useAppStore } from '../store/appStore';

export default function ChatPage() {
  const isMobile = useIsMobile();
  const {
    mobileShowChat,
    showGroupBoard,
    setShowGroupBoard,
    showConversationInfo,
    toggleConversationInfo,
    showIntegrationQuickPanel,
    toggleIntegrationQuickPanel,
    showAIQuickPanel,
    toggleAIQuickPanel,
  } = useAppStore();

  const rightInfoOverlayOpen = showGroupBoard || showConversationInfo || showIntegrationQuickPanel || showAIQuickPanel;

  const closeRightInfoOverlay = useCallback(() => {
    if (showGroupBoard) setShowGroupBoard(false);
    if (showConversationInfo) toggleConversationInfo();
    if (showIntegrationQuickPanel) toggleIntegrationQuickPanel();
    if (showAIQuickPanel) toggleAIQuickPanel();
  }, [showGroupBoard, showConversationInfo, showIntegrationQuickPanel, showAIQuickPanel,
      setShowGroupBoard, toggleConversationInfo, toggleIntegrationQuickPanel, toggleAIQuickPanel]);

  return (
    <>
      {(!isMobile || !mobileShowChat) && <ConversationList />}
      {(!isMobile || mobileShowChat) && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <ChatHeader />
          <div className="flex flex-1 overflow-hidden relative">
            <div className="flex flex-col flex-1 overflow-hidden" onClick={() => { if (rightInfoOverlayOpen) closeRightInfoOverlay(); }}>
              <ChatWindow />
              <MessageInput />
            </div>

            {/* Right overlay panels */}
            <ChatRightPanel onClose={closeRightInfoOverlay} />
          </div>
        </div>
      )}
    </>
  );
}
