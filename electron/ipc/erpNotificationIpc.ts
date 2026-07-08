import { ipcMain } from 'electron';
import WorkspaceManager from '../../src/utils/WorkspaceManager';
import { proxyToBossAsync } from './proxyHelper';

function isEmployeeMode(): boolean {
  try {
    const activeWs = WorkspaceManager.getInstance().getActiveWorkspace();
    if (activeWs?.type === 'remote') return true;
  } catch {}
  return false;
}

function ipcHandle(channel: string, handler: any) {
  ipcMain.handle(channel, async (event: any, ...args: any[]) => {
    if (isEmployeeMode()) {
      return await proxyToBossAsync(channel, args[0]);
    }
    return handler(event, ...args);
  });
}

import ErpNotificationService from '../../src/services/erp/ErpNotificationService';
import { withErpAuth } from './erpIpcMiddleware';

export function registerErpNotificationIpc(): void {
  const svc = () => ErpNotificationService.getInstance();

  ipcHandle('erp:notify:listInbox', withErpAuth('erp.access', async (input: any, ctx) => ({
    notifications: svc().listInbox(ctx.employeeId, !!input?.unreadOnly, {
      limit: input?.limit,
      offset: input?.offset,
    }),
  })));

  ipcHandle('erp:notify:markRead', withErpAuth('erp.access', async (input: any) => {
    const ids: number[] = Array.isArray(input?.ids) ? input.ids.map(Number).filter(Number.isFinite) : [];
    svc().markRead(ids);
    return {};
  }));

  ipcHandle('erp:notify:markAllRead', withErpAuth('erp.access', async (_input: any, ctx) => {
    svc().markAllRead(ctx.employeeId);
    return {};
  }));

  ipcHandle('erp:notify:unreadCount', withErpAuth('erp.access', async (_input: any, ctx) => ({
    count: svc().getUnreadCount(ctx.employeeId),
  })));

  ipcHandle('erp:notify:delete', withErpAuth('erp.access', async (input: any) => {
    const ids: number[] = Array.isArray(input?.ids) ? input.ids.map(Number).filter(Number.isFinite) : [];
    svc().delete(ids);
    return {};
  }));

  ipcHandle('erp:notify:deleteAll', withErpAuth('erp.access', async (_input: any, ctx) => {
    svc().deleteAll(ctx.employeeId);
    return {};
  }));
}

