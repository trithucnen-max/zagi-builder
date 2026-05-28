/**
 * EventBroadcaster.test.ts — Unit tests cho EventBroadcaster.ts
 */

const mockSend = jest.fn();

// Mock electron
jest.mock('electron', () => ({
  BrowserWindow: jest.fn()
}));

// Mock database service
jest.mock('../services/database/DatabaseService', () => ({
  default: {
    getInstance: () => ({
      withDbPath: jest.fn().mockImplementation((path, cb) => cb())
    })
  }
}));

// Mock WorkspaceManager (required dynamically in resolveBossContext)
jest.mock('../utils/WorkspaceManager', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getActiveWorkspaceId: () => 'default',
      getWorkspaceById: jest.fn().mockReturnValue({ dbPath: 'custom.db' }),
      resolveDbPath: (path: string) => `/mock/path/${path}`
    })
  }
}), { virtual: true });

// Mock Logger
jest.mock('../utils/Logger', () => ({
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

import EventBroadcaster from '../services/event/EventBroadcaster';

describe('EventBroadcaster', () => {
  let mockWin: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockClear();

    mockWin = {
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: {
        send: mockSend
      }
    };
  });

  afterEach(() => {
    EventBroadcaster.clearBeforeSendHooks();
  });

  describe('setWindow and window status', () => {
    it('should not emit events if window is not set', () => {
      EventBroadcaster.emit('test-channel', { data: 123 });
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should send events to window webContents if window is set and not destroyed', () => {
      EventBroadcaster.setWindow(mockWin);
      EventBroadcaster.emit('test-channel', { data: 123 });
      expect(mockSend).toHaveBeenCalledWith('test-channel', { data: 123 });
    });

    it('should not send events if window is destroyed', () => {
      mockWin.isDestroyed.mockReturnValue(true);
      EventBroadcaster.setWindow(mockWin);
      EventBroadcaster.emit('test-channel', { data: 123 });
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('beforeSendHooks', () => {
    it('should trigger hooks registered via onBeforeSend before sending to renderer', () => {
      const hookCallback = jest.fn();
      EventBroadcaster.setWindow(mockWin);

      const unsubscribe = EventBroadcaster.onBeforeSend('test-channel', hookCallback);

      EventBroadcaster.emit('test-channel', { data: 'test-data' });

      expect(hookCallback).toHaveBeenCalledWith({ data: 'test-data' });
      expect(mockSend).toHaveBeenCalledWith('test-channel', { data: 'test-data' });

      // Unsubscribe and test again
      hookCallback.mockClear();
      mockSend.mockClear();
      unsubscribe();

      EventBroadcaster.emit('test-channel', { data: 'test-data2' });
      expect(hookCallback).not.toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith('test-channel', { data: 'test-data2' });
    });

    it('should allow multiple hooks for same channel', () => {
      const hook1 = jest.fn();
      const hook2 = jest.fn();

      EventBroadcaster.onBeforeSend('test-channel', hook1);
      EventBroadcaster.onBeforeSend('test-channel', hook2);

      EventBroadcaster.emit('test-channel', 'payload');

      expect(hook1).toHaveBeenCalledWith('payload');
      expect(hook2).toHaveBeenCalledWith('payload');
    });

    it('should clear all hooks via clearBeforeSendHooks', () => {
      const hook = jest.fn();
      EventBroadcaster.onBeforeSend('test-channel', hook);
      EventBroadcaster.clearBeforeSendHooks();

      EventBroadcaster.emit('test-channel', 'payload');
      expect(hook).not.toHaveBeenCalled();
    });

    it('should catch exceptions in hooks and not prevent main sending logic', () => {
      const faultyHook = jest.fn().mockImplementation(() => {
        throw new Error('Hook failure');
      });
      EventBroadcaster.setWindow(mockWin);
      EventBroadcaster.onBeforeSend('test-channel', faultyHook);

      expect(() => {
        EventBroadcaster.emit('test-channel', 'payload');
      }).not.toThrow();

      expect(mockSend).toHaveBeenCalledWith('test-channel', 'payload');
    });
  });

  describe('sendDirect', () => {
    it('should send directly to webContents without triggering beforeSendHooks', () => {
      const hook = jest.fn();
      EventBroadcaster.setWindow(mockWin);
      EventBroadcaster.onBeforeSend('test-channel', hook);

      EventBroadcaster.sendDirect('test-channel', 'payload');

      expect(hook).not.toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith('test-channel', 'payload');
    });
  });

  describe('fireHooksOnly', () => {
    it('should execute beforeSend hooks without sending to webContents', () => {
      const hook = jest.fn();
      EventBroadcaster.setWindow(mockWin);
      EventBroadcaster.onBeforeSend('test-channel', hook);

      EventBroadcaster.fireHooksOnly('test-channel', 'payload');

      expect(hook).toHaveBeenCalledWith('payload');
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('seedGroupSettings', () => {
    it('should cache and allow retrieving seeded group settings', () => {
      const zaloId = 'zalo123';
      const groupId = 'group456';
      const settings = { mute: 1, hide: 0 };

      // Since previousGroupSettings is private, we can test seedGroupSettings by ensuring it accepts settings without throwing
      expect(() => {
        EventBroadcaster.seedGroupSettings(zaloId, groupId, settings);
      }).not.toThrow();
    });
  });
});
