/**
 * AppModeManager.test.ts — Unit tests cho AppModeManager singleton
 */

// Mock dependencies trước khi import
jest.mock('../utils/Logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/WorkspaceManager', () => {
  const mockInstance = {
    getActiveModeType: jest.fn(() => 'standalone'),
    getActiveWorkspaceId: jest.fn(() => 'default'),
  };
  return {
    __esModule: true,
    default: { getInstance: jest.fn(() => mockInstance) },
    mockInstance, // expose for test control
  };
});

import AppModeManager from '../utils/AppModeManager';

describe('AppModeManager', () => {
  let manager: AppModeManager;

  beforeEach(() => {
    // Reset singleton state giữa tests bằng cách dùng manual override
    manager = AppModeManager.getInstance();
    manager.clearOverride();
    manager.setEmployeeId(null);
  });

  describe('Singleton', () => {
    it('should always return the same instance', () => {
      const a = AppModeManager.getInstance();
      const b = AppModeManager.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('setMode() / getMode()', () => {
    it('should return overridden mode after setMode()', () => {
      manager.setMode('boss');
      expect(manager.getMode()).toBe('boss');
    });

    it('should return "employee" after setMode("employee")', () => {
      manager.setMode('employee');
      expect(manager.getMode()).toBe('employee');
    });

    it('should return "standalone" after setMode("standalone")', () => {
      manager.setMode('standalone');
      expect(manager.getMode()).toBe('standalone');
    });
  });

  describe('clearOverride()', () => {
    it('should delegate to WorkspaceManager after clearOverride()', () => {
      manager.setMode('boss');
      expect(manager.getMode()).toBe('boss');
      manager.clearOverride();
      // Now delegates to WorkspaceManager mock which returns 'standalone'
      expect(manager.getMode()).toBe('standalone');
    });
  });

  describe('isEmployeeMode()', () => {
    it('should be true when mode is "employee"', () => {
      manager.setMode('employee');
      expect(manager.isEmployeeMode()).toBe(true);
    });

    it('should be false when mode is "standalone"', () => {
      manager.setMode('standalone');
      expect(manager.isEmployeeMode()).toBe(false);
    });

    it('should be false when mode is "boss"', () => {
      manager.setMode('boss');
      expect(manager.isEmployeeMode()).toBe(false);
    });
  });

  describe('isBossMode()', () => {
    it('should be true when mode is "boss"', () => {
      manager.setMode('boss');
      expect(manager.isBossMode()).toBe(true);
    });

    it('should be false when mode is "standalone"', () => {
      manager.setMode('standalone');
      expect(manager.isBossMode()).toBe(false);
    });
  });

  describe('isStandalone()', () => {
    it('should be true when mode is "standalone"', () => {
      manager.setMode('standalone');
      expect(manager.isStandalone()).toBe(true);
    });

    it('should be false when mode is "boss"', () => {
      manager.setMode('boss');
      expect(manager.isStandalone()).toBe(false);
    });
  });

  describe('EmployeeId', () => {
    it('should return null initially', () => {
      expect(manager.getEmployeeId()).toBeNull();
    });

    it('should store and retrieve employeeId', () => {
      manager.setEmployeeId('emp-001');
      expect(manager.getEmployeeId()).toBe('emp-001');
    });

    it('should allow clearing employeeId', () => {
      manager.setEmployeeId('emp-001');
      manager.setEmployeeId(null);
      expect(manager.getEmployeeId()).toBeNull();
    });
  });
});
