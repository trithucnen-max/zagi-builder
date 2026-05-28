/**
 * Logger.test.ts — Unit tests cho Logger service
 */

// Reset singleton giữa các test
let Logger: any;

beforeEach(() => {
  jest.resetModules();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'debug').mockImplementation(() => {});
  Logger = require('../utils/Logger').default;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Logger', () => {
  describe('Singleton pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = Logger;
      const instance2 = require('../utils/Logger').default;
      expect(instance1).toBe(instance2);
    });
  });

  describe('Enable / Disable', () => {
    it('should be enabled by default in non-production', () => {
      process.env.NODE_ENV = 'test';
      jest.resetModules();
      const freshLogger = require('../utils/Logger').default;
      expect(freshLogger.isLoggingEnabled()).toBe(true);
    });

    it('enable() should set isLoggingEnabled to true', () => {
      Logger.enable();
      expect(Logger.isLoggingEnabled()).toBe(true);
    });

    it('disable() should set isLoggingEnabled to false', () => {
      Logger.enable();
      Logger.disable();
      expect(Logger.isLoggingEnabled()).toBe(false);
    });
  });

  describe('log()', () => {
    it('should call console.log when enabled', () => {
      Logger.enable();
      Logger.log('hello');
      expect(console.log).toHaveBeenCalled();
    });

    it('should NOT call console.log when disabled', () => {
      Logger.disable();
      (console.log as jest.Mock).mockClear();
      Logger.log('should not appear');
      expect(console.log).not.toHaveBeenCalled();
    });
  });
 
  describe('warn()', () => {
    it('should call console.warn when enabled', () => {
      Logger.enable();
      Logger.warn('warning');
      expect(console.warn).toHaveBeenCalled();
    });
 
    it('should NOT call console.warn when disabled', () => {
      Logger.disable();
      (console.warn as jest.Mock).mockClear();
      Logger.warn('warning');
      expect(console.warn).not.toHaveBeenCalled();
    });
  });
 
  describe('error()', () => {
    it('should call console.error when enabled', () => {
      Logger.enable();
      Logger.error('error message');
      expect(console.error).toHaveBeenCalled();
    });
 
    it('should call console.error even when disabled', () => {
      Logger.disable();
      Logger.error('error message');
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('debug()', () => {
    it('should call console.debug when enabled', () => {
      Logger.enable();
      if (typeof Logger.debug === 'function') {
        Logger.debug('debug info');
        expect(console.debug).toHaveBeenCalled();
      }
    });
  });
});
