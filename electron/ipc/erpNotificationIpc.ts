import { ipcHandle } from './proxyHelper';
import ErpNotificationService from '../../src/services/erp/ErpNotificationService';
import { withErpAuth } from './erpIpcMiddleware';

export function registerErpNotificationIpc(): void {
  const notifySvc = () => ErpNotificationService.getInstance();

  ipcHandle('erp:notify:listInbox', withErpAuth('erp.access', async (input: any, ctx) => ({
    notifications: notifySvc().listInbox(ctx.employeeId, !!input?.unreadOnly, {
      limit: input?.limit,
      offset: input?.offset,
    }),
  })));

  ipcHandle('erp:notify:markRead', withErpAuth('erp.access', async (input: any) => {
    const ids: number[] = Array.isArray(input?.ids) ? input.ids.map(Number).filter(Number.isFinite) : [];
    notifySvc().markRead(ids);
    return {};
  }));

  ipcHandle('erp:notify:markAllRead', withErpAuth('erp.access', async (_input: any, ctx) => {
    notifySvc().markAllRead(ctx.employeeId);
    return {};
  }));

  ipcHandle('erp:notify:unreadCount', withErpAuth('erp.access', async (_input: any, ctx) => ({
    count: notifySvc().getUnreadCount(ctx.employeeId),
  })));

  ipcHandle('erp:notify:delete', withErpAuth('erp.access', async (input: any) => {
    const ids: number[] = Array.isArray(input?.ids) ? input.ids.map(Number).filter(Number.isFinite) : [];
    notifySvc().delete(ids);
    return {};
  }));

  ipcHandle('erp:notify:deleteAll', withErpAuth('erp.access', async (_input: any, ctx) => {
    notifySvc().deleteAll(ctx.employeeId);
    return {};
  }));
}

