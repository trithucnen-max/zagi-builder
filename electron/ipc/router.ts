import { ipcMain, IpcMainInvokeEvent, IpcMainEvent } from 'electron';
import { ZodType } from 'zod';
import Logger from '../../src/utils/Logger';
import DatabaseService from '../../src/services/database/DatabaseService';

function extractZaloId(args: any): string | undefined {
  if (!args) return undefined;
  if (typeof args === 'object') {
    const id = args.zaloId || args.ownerZaloId || args.owner_zalo_id || args.accountId;
    if (typeof id === 'string') return id;
  }
  if (typeof args === 'string' && args.length > 5 && /^[a-zA-Z0-9_-]+$/.test(args)) {
    return args;
  }
  return undefined;
}

class IpcRouter {
  /**
   * Registers an IPC handler (ipcMain.handle) with optional Zod schema validation
   */
  public register<T>(
    channel: string,
    schema: ZodType<T> | null,
    handler: (event: IpcMainInvokeEvent, args: T) => Promise<any>
  ): void {
    ipcMain.handle(channel, async (event, args) => {
      try {
        let validatedArgs = args;
        if (schema) {
          const result = schema.safeParse(args);
          if (!result.success) {
            Logger.error(`[IPCRouter] Validation Error on channel "${channel}": ${JSON.stringify(result.error.issues)}`);
            return {
              success: false,
              error: 'Validation Error',
              details: result.error.issues,
            };
          }
          validatedArgs = result.data;
        }

        const zaloId = extractZaloId(validatedArgs);
        if (zaloId) {
          return await DatabaseService.getInstance().runForAccount(zaloId, async () => {
            return await handler(event, validatedArgs);
          });
        }
        return await handler(event, validatedArgs);
      } catch (err: any) {
        Logger.error(`[IPCRouter] Error handling channel "${channel}": ${err.message}`);
        return {
          success: false,
          error: err.message || 'Internal Server Error',
        };
      }
    });
  }

  /**
   * Registers an IPC event listener (ipcMain.on) with optional Zod schema validation
   */
  public registerOn<T>(
    channel: string,
    schema: ZodType<T> | null,
    handler: (event: IpcMainEvent, args: T) => void
  ): void {
    ipcMain.on(channel, (event, args) => {
      try {
        let validatedArgs = args;
        if (schema) {
          const result = schema.safeParse(args);
          if (!result.success) {
            Logger.error(`[IPCRouter] Validation Error on listener "${channel}": ${JSON.stringify(result.error.issues)}`);
            return;
          }
          validatedArgs = result.data;
        }

        const zaloId = extractZaloId(validatedArgs);
        if (zaloId) {
          DatabaseService.getInstance().runForAccount(zaloId, () => {
            handler(event, validatedArgs);
          });
          return;
        }
        handler(event, validatedArgs);
      } catch (err: any) {
        Logger.error(`[IPCRouter] Error in event listener "${channel}": ${err.message}`);
      }
    });
  }
}

export const ipcRouter = new IpcRouter();
export default ipcRouter;
