import { ipcHandle } from './proxyHelper';
import ErpEmployeeService from '../../src/services/erp/ErpEmployeeService';
import HttpRelayService from '../../src/services/http/HttpRelayService';
import { withErpAuth, erpValidate } from './erpIpcMiddleware';

const LEAVE_STATUS = ['approved', 'rejected'] as const;
const LEAVE_TYPE = ['annual', 'sick', 'unpaid', 'other'] as const;

export function registerErpHrmIpc(): void {
  const hrmSvc = () => ErpEmployeeService.getInstance();

  // ─── Departments ─────────────────────────────────────────────────────────
  ipcHandle('erp:department:list', withErpAuth('erp.access', async () => ({
    departments: hrmSvc().listDepartments(),
  })));

  ipcHandle('erp:department:create', withErpAuth('department.manage', async (input: any) => {
    erpValidate.string(input?.name, 'name', { max: 120 });
    return { department: hrmSvc().createDepartment(input) };
  }));

  ipcHandle('erp:department:update', withErpAuth('department.manage', async (input: any) => {
    erpValidate.int(input?.id, 'id');
    return { department: hrmSvc().updateDepartment(Number(input.id), input.patch ?? {}) };
  }));

  ipcHandle('erp:department:delete', withErpAuth('department.manage', async (input: any) => {
    erpValidate.int(input?.id, 'id');
    hrmSvc().deleteDepartment(Number(input.id));
    return {};
  }));

  // ─── Positions ───────────────────────────────────────────────────────────
  ipcHandle('erp:position:list', withErpAuth('erp.access', async () => ({
    positions: hrmSvc().listPositions(),
  })));

  ipcHandle('erp:position:create', withErpAuth('position.manage', async (input: any) => {
    erpValidate.string(input?.name, 'name', { max: 120 });
    return { position: hrmSvc().createPosition(input) };
  }));

  ipcHandle('erp:position:update', withErpAuth('position.manage', async (input: any) => {
    erpValidate.int(input?.id, 'id');
    return { position: hrmSvc().updatePosition(Number(input.id), input.patch ?? {}) };
  }));

  ipcHandle('erp:position:delete', withErpAuth('position.manage', async (input: any) => {
    erpValidate.int(input?.id, 'id');
    hrmSvc().deletePosition(Number(input.id));
    return {};
  }));

  // ─── Profiles ────────────────────────────────────────────────────────────
  ipcHandle('erp:employee:getProfile', withErpAuth('erp.access', async (input: any, ctx) => {
    const eid = input?.employeeId || ctx.employeeId;
    erpValidate.string(eid, 'employeeId');
    return { profile: hrmSvc().getProfile(eid) };
  }));

  ipcHandle('erp:employee:updateProfile', withErpAuth(null, async (input: any, ctx) => {
    erpValidate.string(input?.employeeId, 'employeeId');
    const isSelf = input.employeeId === ctx.employeeId;
    const action = isSelf ? 'employee.edit_self' : 'employee.edit_others';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { erpCan } = require('../../src/services/erp/permissions');
    if (!erpCan(ctx.role, action)) throw new Error(`Permission denied: ${action}`);
    const profile = hrmSvc().upsertProfile(input.employeeId, input.patch ?? {});
    HttpRelayService.getInstance().refreshEmployeeState(input.employeeId, 'erp-profile-updated');
    return { profile };
  }));

  ipcHandle('erp:employee:listByDepartment', withErpAuth('employee.view_others', async (input: any) => ({
    profiles: hrmSvc().listProfilesByDepartment(input?.departmentId),
  })));

  ipcHandle('erp:employee:deleteProfile', withErpAuth('employee.edit_others', async (input: any) => {
    erpValidate.string(input?.employeeId, 'employeeId');
    hrmSvc().deleteProfile(input.employeeId);
    HttpRelayService.getInstance().refreshEmployeeState(input.employeeId, 'erp-profile-deleted');
    return {};
  }));

  // ─── Attendance ──────────────────────────────────────────────────────────
  ipcHandle('erp:attendance:checkIn', withErpAuth('attendance.checkin', async (input: any, ctx) => ({
    attendance: hrmSvc().checkIn(ctx.employeeId, input?.note),
  })));

  ipcHandle('erp:attendance:checkOut', withErpAuth('attendance.checkin', async (input: any, ctx) => ({
    attendance: hrmSvc().checkOut(ctx.employeeId, input?.note),
  })));

  ipcHandle('erp:attendance:today', withErpAuth('erp.access', async (_input: any, ctx) => ({
    attendance: hrmSvc().getTodayAttendance(ctx.employeeId) ?? null,
  })));

  ipcHandle('erp:attendance:list', withErpAuth(null, async (input: any, ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { erpCan } = require('../../src/services/erp/permissions');
    // Special mode: renderer requests ALL employees (boss/manager dashboard)
    if (input?.all === true) {
      if (!erpCan(ctx.role, 'attendance.view_others')) throw new Error('Permission denied: attendance.view_others');
      return { list: hrmSvc().listAttendance({ from: input?.from, to: input?.to }) };
    }
    const targetEmp = input?.employeeId || ctx.employeeId;
    if (targetEmp !== ctx.employeeId) {
      if (!erpCan(ctx.role, 'attendance.view_others')) throw new Error('Permission denied: attendance.view_others');
    }
    return { list: hrmSvc().listAttendance({ employeeId: targetEmp, from: input?.from, to: input?.to }) };
  }));

  // ─── Leave ───────────────────────────────────────────────────────────────
  ipcHandle('erp:leave:create', withErpAuth('leave.create', async (input: any, ctx) => {
    erpValidate.string(input?.input?.start_date, 'start_date');
    erpValidate.string(input?.input?.end_date, 'end_date');
    if (input.input.leave_type) erpValidate.enum(input.input.leave_type, 'leave_type', LEAVE_TYPE);
    return { leave: hrmSvc().createLeave(input.input, ctx.employeeId) };
  }));

  ipcHandle('erp:leave:listMy', withErpAuth('erp.access', async (_input: any, ctx) => ({
    leaves: hrmSvc().listMyLeaves(ctx.employeeId),
  })));

  ipcHandle('erp:leave:listPending', withErpAuth('leave.approve', async (_input: any, ctx) => ({
    leaves: hrmSvc().listPendingForManager(ctx.employeeId),
  })));

  ipcHandle('erp:leave:decide', withErpAuth('leave.approve', async (input: any, ctx) => {
    erpValidate.int(input?.id, 'id');
    erpValidate.enum(input?.status, 'status', LEAVE_STATUS);
    return { leave: hrmSvc().decideLeave(Number(input.id), input.status, ctx.employeeId, input.note) };
  }));

  ipcHandle('erp:leave:cancel', withErpAuth('leave.create', async (input: any, ctx) => {
    erpValidate.int(input?.id, 'id');
    hrmSvc().cancelLeave(Number(input.id), ctx.employeeId);
    return {};
  }));

  // ─── Seat status ─────────────────────────────────────────────────────────
  ipcHandle('erp:license:seatStatus', withErpAuth('erp.access', async () => {
    let used = 0;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const DatabaseService = require('../../src/services/database/DatabaseService').default;
      const row: any = DatabaseService.getInstance().queryOne(`SELECT COUNT(*) AS c FROM erp_employee_profiles`);
      used = Number(row?.c ?? 0);
    } catch {}
    const limit = Math.max(used + 9999, 9999);
    return { seat: { limit, used, remaining: Math.max(0, limit - used) } };
  }));
}

