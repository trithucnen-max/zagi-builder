import ChatRightPanel from '../ui/components/layout/ChatRightPanel';
import { usePanelStore } from '../ui/store/panelStore';
import { useAccountStore } from '../ui/store/accountStore';
import { useActiveThreadId, useActiveThreadType, useContacts } from '../ui/store/chatStore';

jest.mock('../ui/store/panelStore', () => {
  const storeHook: any = jest.fn(() => ({
    showGroupBoard: false,
    showConversationInfo: false,
    showIntegrationQuickPanel: false,
    showAIQuickPanel: false,
  }));
  storeHook.getState = jest.fn(() => ({
    showGroupBoard: false,
    showConversationInfo: false,
    showIntegrationQuickPanel: false,
    showAIQuickPanel: false,
  }));
  storeHook.subscribe = jest.fn(() => jest.fn());
  storeHook.setState = jest.fn();
  return { usePanelStore: storeHook };
});

jest.mock('../ui/store/viewStore', () => {
  const storeHook: any = jest.fn(() => ({
    view: 'dashboard',
    isLoading: false,
    theme: 'light',
  }));
  storeHook.getState = jest.fn(() => ({
    view: 'dashboard',
    isLoading: false,
    theme: 'light',
  }));
  storeHook.subscribe = jest.fn(() => jest.fn());
  storeHook.setState = jest.fn();
  return { useViewStore: storeHook };
});

jest.mock('../ui/store/modalStore', () => {
  const storeHook: any = jest.fn(() => ({
    notification: null,
    erpPermissionDialog: null,
  }));
  storeHook.getState = jest.fn(() => ({
    notification: null,
    erpPermissionDialog: null,
  }));
  storeHook.subscribe = jest.fn(() => jest.fn());
  storeHook.setState = jest.fn();
  return { useModalStore: storeHook };
});

jest.mock('../ui/store/accountStore', () => {
  const storeHook: any = jest.fn(() => ({
    activeAccountId: 'acc1',
    accounts: [],
  }));
  storeHook.getState = jest.fn(() => ({
    activeAccountId: 'acc1',
    accounts: [],
  }));
  storeHook.subscribe = jest.fn(() => jest.fn());
  storeHook.setState = jest.fn();
  return { useAccountStore: storeHook };
});

jest.mock('../ui/store/chatStore', () => ({
  useChatStore: jest.fn(),
  useActiveThreadId: jest.fn(),
  useActiveThreadType: jest.fn(),
  useContacts: jest.fn(),
}));

jest.mock('../ui/lib/ipc', () => ({
  db: {
    getMessageById: jest.fn(),
    getMessagesAround: jest.fn(),
  },
  __esModule: true,
  default: {
    db: {
      getMessageById: jest.fn(),
      getMessagesAround: jest.fn(),
    },
  },
}));

// Mock sub-components to prevent rendering issues
jest.mock('../ui/components/chat/GroupBoardPanel', () => () => 'GroupBoardPanel');
jest.mock('../ui/components/chat/ConversationInfo', () => () => 'ConversationInfo');
jest.mock('../ui/components/integration/IntegrationQuickPanel', () => () => 'IntegrationQuickPanel');
jest.mock('../ui/components/integration/AIQuickPanel', () => () => 'AIQuickPanel');

describe('ChatRightPanel component', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAccountStore as any).mockReturnValue({ activeAccountId: 'acc1' });
    (useActiveThreadId as any).mockReturnValue('thread1');
    (useActiveThreadType as any).mockReturnValue(1); // Group
    (useContacts as any).mockReturnValue([
      { contact_id: 'thread1', contact_type: 'group' },
    ]);
  });

  it('should render null when no panels are active', () => {
    (usePanelStore as any).mockReturnValue({
      showGroupBoard: false,
      showConversationInfo: false,
      showIntegrationQuickPanel: false,
      showAIQuickPanel: false,
    });

    const result = ChatRightPanel({ onClose });
    expect(result).toBeNull();
  });

  it('should render GroupBoardPanel when showGroupBoard is active', () => {
    (usePanelStore as any).mockReturnValue({
      showGroupBoard: true,
      showConversationInfo: false,
      showIntegrationQuickPanel: false,
      showAIQuickPanel: false,
      setShowGroupBoard: jest.fn(),
    });

    const result = ChatRightPanel({ onClose });
    expect(result).not.toBeNull();
  });

  it('should render ConversationInfo when showConversationInfo is active', () => {
    (usePanelStore as any).mockReturnValue({
      showGroupBoard: false,
      showConversationInfo: true,
      showIntegrationQuickPanel: false,
      showAIQuickPanel: false,
    });

    const result = ChatRightPanel({ onClose });
    expect(result).not.toBeNull();
  });

  it('should render IntegrationQuickPanel when showIntegrationQuickPanel is active', () => {
    (usePanelStore as any).mockReturnValue({
      showGroupBoard: false,
      showConversationInfo: false,
      showIntegrationQuickPanel: true,
      showAIQuickPanel: false,
    });

    const result = ChatRightPanel({ onClose });
    expect(result).not.toBeNull();
  });

  it('should render AIQuickPanel when showAIQuickPanel is active', () => {
    (usePanelStore as any).mockReturnValue({
      showGroupBoard: false,
      showConversationInfo: false,
      showIntegrationQuickPanel: false,
      showAIQuickPanel: true,
    });

    const result = ChatRightPanel({ onClose });
    expect(result).not.toBeNull();
  });
});
