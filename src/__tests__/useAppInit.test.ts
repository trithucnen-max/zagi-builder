import { useAppInit } from '../ui/hooks/useAppInit';
import React from 'react';
import ipc from '../ui/lib/ipc';
import { useAccountStore } from '../ui/store/accountStore';
import { useChatStore } from '../ui/store/chatStore';
import { useAppStore } from '../ui/store/appStore';
import { useWorkspaceStore } from '../ui/store/workspaceStore';
import { useEmployeeStore } from '../ui/store/employeeStore';
import { checkAccountInitNeeds } from '../ui/lib/zaloInitUtils';

// Mock React
jest.spyOn(React, 'useEffect').mockImplementation((cb) => cb());

// Mock ipc
jest.mock('../ui/lib/ipc', () => ({
  login: {
    getAccounts: jest.fn().mockResolvedValue({ accounts: [] }),
    connectAccount: jest.fn().mockResolvedValue(undefined),
  },
  db: {
    getContacts: jest.fn().mockResolvedValue({ contacts: [] }),
  },
  app: {
    setBadge: jest.fn(),
  },
  workspace: {
    getActive: jest.fn().mockResolvedValue({ workspace: null }),
    getConnectionStatus: jest.fn().mockResolvedValue({ connected: true, latency: 10 }),
  },
}));

// Mock stores with self-contained functions
jest.mock('../ui/store/appStore', () => {
  const mockHook: any = jest.fn();
  mockHook.getState = jest.fn().mockReturnValue({
    loadFlags: jest.fn().mockResolvedValue(undefined),
  });
  return { useAppStore: mockHook };
});

jest.mock('../ui/store/accountStore', () => {
  const mockHook: any = jest.fn();
  mockHook.getState = jest.fn().mockReturnValue({
    accounts: [] as any[],
    updateAccountStatus: jest.fn(),
  });
  return { useAccountStore: mockHook };
});

jest.mock('../ui/store/chatStore', () => {
  const mockHook: any = jest.fn();
  mockHook.getState = jest.fn().mockReturnValue({});
  return { useChatStore: mockHook };
});

jest.mock('../ui/store/workspaceStore', () => {
  const mockHook: any = jest.fn();
  mockHook.getState = jest.fn().mockReturnValue({
    setActiveWorkspaceId: jest.fn(),
  });
  return { useWorkspaceStore: mockHook };
});

jest.mock('../ui/store/employeeStore', () => {
  const mockHook: any = jest.fn();
  mockHook.getState = jest.fn().mockReturnValue({
    reset: jest.fn(),
    setMode: jest.fn(),
    setCurrentEmployee: jest.fn(),
    setBossUrl: jest.fn(),
    setBossConnected: jest.fn(),
    setLatency: jest.fn(),
    setPermissions: jest.fn(),
    setAssignedAccounts: jest.fn(),
  });
  return { useEmployeeStore: mockHook };
});

// Mock utilities
jest.mock('../ui/lib/badgeUtils', () => ({
  getFilteredUnreadCount: jest.fn().mockReturnValue(5),
}));

jest.mock('../ui/lib/zaloInitUtils', () => ({
  checkAccountInitNeeds: jest.fn().mockResolvedValue({ any: true }),
}));

describe('useAppInit hook', () => {
  let initCheckedRef: React.MutableRefObject<Set<string>>;
  let setAccountInitId: jest.Mock;
  let setInitializing: jest.Mock;
  let setAccountsMock: jest.Mock;
  let setContactsMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    initCheckedRef = { current: new Set<string>() };
    setAccountInitId = jest.fn();
    setInitializing = jest.fn();
    setAccountsMock = jest.fn();
    setContactsMock = jest.fn();

    // Reset store getState values
    const appState = useAppStore.getState();
    const accountState = useAccountStore.getState();
    const workspaceState = useWorkspaceStore.getState();
    const employeeState = useEmployeeStore.getState();

    accountState.accounts = [];

    // Mock store hooks return values
    (useAccountStore as any).mockReturnValue({
      setAccounts: setAccountsMock,
      activeAccountId: '123456',
    });
    (useChatStore as any).mockReturnValue({
      setContacts: setContactsMock,
      contacts: {},
    });
    (useAppStore as any).mockReturnValue({ view: 'chat' }); // view is 'chat'
  });

  it('should initialize accounts, contacts, load flags, and set badge count', async () => {
    const mockAccounts = [
      { zalo_id: '123456', channel: 'zalo', isConnected: true, cookies: 'c', imei: 'i', user_agent: 'u' },
    ];
    (ipc.login!.getAccounts as jest.Mock).mockResolvedValue({ accounts: mockAccounts });
    (ipc.db!.getContacts as jest.Mock).mockResolvedValue({ contacts: [{ contact_id: 'c1' }] });
    (ipc.workspace!.getActive as jest.Mock).mockResolvedValue({ workspace: null });

    useAppInit(initCheckedRef, setAccountInitId, setInitializing);

    // Allow async init() microtasks to flush
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ipc.login!.getAccounts).toHaveBeenCalled();
    expect(setAccountsMock).toHaveBeenCalledWith(mockAccounts);
    expect(ipc.db!.getContacts).toHaveBeenCalledWith('123456');
    expect(setContactsMock).toHaveBeenCalledWith('123456', [{ contact_id: 'c1' }]);
    expect(useAppStore.getState().loadFlags).toHaveBeenCalledWith('123456');
    expect(ipc.app!.setBadge).toHaveBeenCalledWith(5);
    expect(setInitializing).toHaveBeenCalledWith(false);
  });

  it('should connect unconnected zalo accounts during initialization', async () => {
    const mockAccounts = [
      { zalo_id: '123456', channel: 'zalo', isConnected: false, cookies: 'cookies1', imei: 'imei1', user_agent: 'ua1' },
    ];
    (ipc.login!.getAccounts as jest.Mock).mockResolvedValue({ accounts: mockAccounts });
    (ipc.workspace!.getActive as jest.Mock).mockResolvedValue({ workspace: null });

    useAppInit(initCheckedRef, setAccountInitId, setInitializing);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ipc.login!.connectAccount).toHaveBeenCalledWith({
      cookies: 'cookies1',
      imei: 'imei1',
      userAgent: 'ua1',
    });
  });

  it('should configure employee store if active workspace is remote', async () => {
    const mockAccounts = [];
    const mockWorkspace = {
      id: 'ws_remote_1',
      type: 'remote',
      bossUrl: 'http://boss.local',
      cachedPermissions: ['read'],
      cachedAssignedAccounts: ['123456'],
      cachedAccountsData: [],
    };
    (ipc.login!.getAccounts as jest.Mock).mockResolvedValue({ accounts: mockAccounts });
    (ipc.workspace!.getActive as jest.Mock).mockResolvedValue({ workspace: mockWorkspace });
    (ipc.workspace!.getConnectionStatus as jest.Mock).mockResolvedValue({ connected: true, latency: 15 });

    useAppInit(initCheckedRef, setAccountInitId, setInitializing);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useWorkspaceStore.getState().setActiveWorkspaceId).toHaveBeenCalledWith('ws_remote_1');
    expect(useEmployeeStore.getState().reset).toHaveBeenCalled();
    expect(useEmployeeStore.getState().setMode).toHaveBeenCalledWith('employee');
    expect(useEmployeeStore.getState().setBossUrl).toHaveBeenCalledWith('http://boss.local');
    expect(useEmployeeStore.getState().setBossConnected).toHaveBeenCalledWith(true);
    expect(useEmployeeStore.getState().setLatency).toHaveBeenCalledWith(15);
    expect(useEmployeeStore.getState().setAssignedAccounts).toHaveBeenCalledWith(['123456']);
  });

  it('should check if account initialization is needed and trigger callback', async () => {
    const mockAccounts = [
      { zalo_id: '123456', channel: 'zalo' },
    ];
    const accountState = useAccountStore.getState();
    accountState.accounts = mockAccounts as any;
    (checkAccountInitNeeds as jest.Mock).mockResolvedValue({ any: true });

    useAppInit(initCheckedRef, setAccountInitId, setInitializing);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(checkAccountInitNeeds).toHaveBeenCalledWith('123456');
    expect(setAccountInitId).toHaveBeenCalledWith('123456');
  });
});
