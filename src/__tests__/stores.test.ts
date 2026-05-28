const mockLocalStorage: Record<string, string> = {};
global.localStorage = {
  getItem: jest.fn((key) => mockLocalStorage[key] || null),
  setItem: jest.fn((key, value) => {
    mockLocalStorage[key] = String(value);
  }),
  removeItem: jest.fn((key) => {
    delete mockLocalStorage[key];
  }),
  clear: jest.fn(() => {
    for (const key of Object.keys(mockLocalStorage)) {
      delete mockLocalStorage[key];
    }
  }),
  length: 0,
  key: jest.fn(() => null),
};

import { useViewStore } from '../ui/store/viewStore';
import { useModalStore } from '../ui/store/modalStore';
import { usePanelStore } from '../ui/store/panelStore';

describe('viewStore', () => {
  beforeEach(() => {
    // Reset viewStore state
    useViewStore.setState({
      view: 'dashboard',
      isLoading: false,
      theme: 'light',
      mergedInboxMode: false,
      mergedInboxAccounts: [],
      mergedInboxFilterAccount: null,
      mobileShowChat: false,
    });
    localStorage.clear();
  });

  it('should initialize with correct default state', () => {
    const state = useViewStore.getState();
    expect(state.view).toBe('dashboard');
    expect(state.isLoading).toBe(false);
    expect(state.theme).toBe('light');
    expect(state.mergedInboxMode).toBe(false);
  });

  it('should update view on setView', () => {
    useViewStore.getState().setView('chat');
    expect(useViewStore.getState().view).toBe('chat');
  });

  it('should update loading state', () => {
    useViewStore.getState().setLoading(true);
    expect(useViewStore.getState().isLoading).toBe(true);
  });

  it('should update theme and store it in localStorage', () => {
    useViewStore.getState().setTheme('dark');
    expect(useViewStore.getState().theme).toBe('dark');
    expect(localStorage.getItem('app_theme')).toBe('dark');
  });

  it('should configure merged inbox and auto-navigate to chat view', () => {
    useViewStore.getState().enterMergedInbox(['acc1', 'acc2']);
    const state = useViewStore.getState();
    expect(state.mergedInboxMode).toBe(true);
    expect(state.mergedInboxAccounts).toEqual(['acc1', 'acc2']);
    expect(state.view).toBe('chat');
  });

  it('should exit merged inbox and clear filters', () => {
    useViewStore.getState().enterMergedInbox(['acc1', 'acc2']);
    useViewStore.getState().setMergedInboxFilter('acc1');
    useViewStore.getState().exitMergedInbox();

    const state = useViewStore.getState();
    expect(state.mergedInboxMode).toBe(false);
    expect(state.mergedInboxAccounts).toEqual([]);
    expect(state.mergedInboxFilterAccount).toBeNull();
  });
});

describe('modalStore', () => {
  beforeEach(() => {
    useModalStore.setState({
      notification: null,
      erpPermissionDialog: null,
      addAccountModalOpen: false,
      quickChatOpen: false,
      quickChatTarget: null,
      quickChatZaloId: null,
    });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should display notification and auto-dismiss after 4 seconds', () => {
    useModalStore.getState().showNotification('Success message', 'success');
    expect(useModalStore.getState().notification).toEqual({
      message: 'Success message',
      type: 'success',
    });

    jest.advanceTimersByTime(4000);
    expect(useModalStore.getState().notification).toBeNull();
  });

  it('should open and close erp permission dialog', () => {
    useModalStore.getState().showErpPermissionDialog({ title: 'Test Limit', message: 'Not allowed' });
    expect(useModalStore.getState().erpPermissionDialog).toEqual({
      title: 'Test Limit',
      message: 'Not allowed',
      details: undefined,
    });

    useModalStore.getState().hideErpPermissionDialog();
    expect(useModalStore.getState().erpPermissionDialog).toBeNull();
  });

  it('should open and close quick chat with details', () => {
    const target = { userId: 'u1', displayName: 'User 1', threadType: 0 };
    useModalStore.getState().openQuickChat({ target, zaloId: 'acc1' });

    let state = useModalStore.getState();
    expect(state.quickChatOpen).toBe(true);
    expect(state.quickChatTarget).toEqual(target);
    expect(state.quickChatZaloId).toBe('acc1');

    useModalStore.getState().closeQuickChat();
    state = useModalStore.getState();
    expect(state.quickChatOpen).toBe(false);
    expect(state.quickChatTarget).toBeNull();
    expect(state.quickChatZaloId).toBeNull();
  });
});

describe('panelStore', () => {
  beforeEach(() => {
    usePanelStore.setState({
      showConversationInfo: false,
      showGroupBoard: false,
      showIntegrationQuickPanel: false,
      showAIQuickPanel: false,
      openReminderPanel: false,
      searchOpen: false,
      searchHighlightQuery: '',
    });
  });

  it('should toggle Conversation Info and close other exclusive panels', () => {
    usePanelStore.setState({ showGroupBoard: true });
    usePanelStore.getState().toggleConversationInfo();

    const state = usePanelStore.getState();
    expect(state.showConversationInfo).toBe(true);
    expect(state.showGroupBoard).toBe(false);
  });

  it('should toggle AI Panel and close other panels', () => {
    usePanelStore.setState({ showConversationInfo: true });
    usePanelStore.getState().toggleAIQuickPanel();

    const state = usePanelStore.getState();
    expect(state.showAIQuickPanel).toBe(true);
    expect(state.showConversationInfo).toBe(false);
  });

  it('should toggle Search state', () => {
    usePanelStore.getState().toggleSearch();
    expect(usePanelStore.getState().searchOpen).toBe(true);
  });
});
