import { z } from 'zod';
import { dbContext } from '../services/database/DatabaseService';
import ipcRouter from '../../electron/ipc/router';

// Capture handlers and listeners registered by the mock
const handlers: Record<string, Function> = {};
const listeners: Record<string, Function> = {};

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn().mockImplementation((channel, cb) => {
      handlers[channel] = cb;
    }),
    on: jest.fn().mockImplementation((channel, cb) => {
      listeners[channel] = cb;
    }),
  },
}));

describe('IPCRouter & Context Propagation Tests', () => {
  const testSchema = z.object({
    zaloId: z.string().optional(),
    ownerZaloId: z.string().optional(),
    message: z.string(),
  });

  beforeEach(() => {
    // Clear captured handlers
    for (const key in handlers) {
      delete handlers[key];
    }
    for (const key in listeners) {
      delete listeners[key];
    }
    jest.clearAllMocks();
  });

  it('should register and execute a handler successfully if arguments validate', async () => {
    const handler = jest.fn().mockResolvedValue({ success: true });
    
    ipcRouter.register('test:success', testSchema, handler);
    
    expect(handlers['test:success']).toBeDefined();

    const result = await handlers['test:success']({}, { message: 'hello' });
    expect(result).toEqual({ success: true });
    expect(handler).toHaveBeenCalledWith(expect.anything(), { message: 'hello' });
  });

  it('should reject call with validation error if arguments fail schema validation', async () => {
    const handler = jest.fn();
    
    ipcRouter.register('test:fail', testSchema, handler);
    
    const result = await handlers['test:fail']({}, { message: 123 }); // message must be a string
    expect(result.success).toBe(false);
    expect(result.error).toBe('Validation Error');
    expect(result.details).toBeDefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('should wrap handler call in DatabaseService.runForAccount context when zaloId is present', async () => {
    const handler = jest.fn().mockImplementation(async () => {
      const store = dbContext.getStore();
      return { storeZaloId: store?.zaloId };
    });

    ipcRouter.register('test:context-zalo', testSchema, handler);

    const result = await handlers['test:context-zalo']({}, { zaloId: 'zalo_123', message: 'test' });
    expect(result).toEqual({ storeZaloId: 'zalo_123' });
    expect(handler).toHaveBeenCalled();
  });

  it('should wrap handler call in DatabaseService.runForAccount context when ownerZaloId is present', async () => {
    const handler = jest.fn().mockImplementation(async () => {
      const store = dbContext.getStore();
      return { storeZaloId: store?.zaloId };
    });

    ipcRouter.register('test:context-owner', testSchema, handler);

    const result = await handlers['test:context-owner']({}, { ownerZaloId: 'owner_456', message: 'test' });
    expect(result).toEqual({ storeZaloId: 'owner_456' });
    expect(handler).toHaveBeenCalled();
  });

  it('should execute without context wrapper if no Zalo ID is present', async () => {
    const handler = jest.fn().mockImplementation(async () => {
      const store = dbContext.getStore();
      return { storeZaloId: store?.zaloId || 'no_store' };
    });

    ipcRouter.register('test:no-context', testSchema, handler);

    const result = await handlers['test:no-context']({}, { message: 'test' });
    expect(result).toEqual({ storeZaloId: 'no_store' });
    expect(handler).toHaveBeenCalled();
  });

  it('should handle raw string arguments representing a Zalo ID', async () => {
    const handler = jest.fn().mockImplementation(async () => {
      const store = dbContext.getStore();
      return { storeZaloId: store?.zaloId || 'no_store' };
    });

    // Register without schema (null) to allow direct string argument
    ipcRouter.register('test:raw-string', null, handler);

    const result = await handlers['test:raw-string']({}, 'zalo_999999');
    expect(result).toEqual({ storeZaloId: 'zalo_999999' });
    expect(handler).toHaveBeenCalled();
  });
});
