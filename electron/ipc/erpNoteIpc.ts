import { ipcHandle } from './proxyHelper';
import ErpNoteService from '../../src/services/erp/ErpNoteService';
import { withErpAuth, erpValidate } from './erpIpcMiddleware';

export function registerErpNoteIpc(): void {
  const noteSvc = () => ErpNoteService.getInstance();

  ipcHandle('erp:note:listFolders', withErpAuth('erp.access', async (_input: any, ctx) => ({
    folders: noteSvc().listFolders(ctx.employeeId),
  })));

  ipcHandle('erp:note:createFolder', withErpAuth('note.create', async (input: any, ctx) => {
    erpValidate.string(input?.name, 'name', { max: 120 });
    return { folder: noteSvc().createFolder(input.name, ctx.employeeId, input.parent_id) };
  }));

  ipcHandle('erp:note:renameFolder', withErpAuth('note.update', async (input: any, ctx) => {
    erpValidate.int(input?.id, 'id');
    erpValidate.string(input?.name, 'name', { max: 120 });
    noteSvc().renameFolderForEmployee(Number(input.id), input.name, ctx.employeeId);
    return {};
  }));

  ipcHandle('erp:note:deleteFolder', withErpAuth('note.delete', async (input: any, ctx) => {
    erpValidate.int(input?.id, 'id');
    noteSvc().deleteFolderForEmployee(Number(input.id), ctx.employeeId);
    return {};
  }));

  ipcHandle('erp:note:list', withErpAuth('erp.access', async (input: any, ctx) => ({
    notes: noteSvc().listNotesForEmployee(ctx.employeeId, input ?? {}),
  })));

  ipcHandle('erp:note:get', withErpAuth('erp.access', async (input: any, ctx) => {
    erpValidate.string(input?.id, 'id');
    const note = noteSvc().getNoteForEmployee(input.id, ctx.employeeId);
    if (!note) throw new Error('Không tìm thấy note');
    return { note };
  }));

  ipcHandle('erp:note:create', withErpAuth('note.create', async (input: any, ctx) => {
    erpValidate.string(input?.input?.title, 'title', { max: 300 });
    return { note: noteSvc().createNote(input.input, ctx.employeeId) };
  }));

  ipcHandle('erp:note:update', withErpAuth('note.update', async (input: any, ctx) => {
    erpValidate.string(input?.id, 'id');
    return { note: noteSvc().updateNoteForEmployee(input.id, input.patch ?? {}, ctx.employeeId) };
  }));

  ipcHandle('erp:note:delete', withErpAuth('note.delete', async (input: any, ctx) => {
    erpValidate.string(input?.id, 'id');
    noteSvc().deleteNoteForEmployee(input.id, ctx.employeeId);
    return {};
  }));

  ipcHandle('erp:note:pin', withErpAuth('note.update', async (input: any, ctx) => {
    erpValidate.string(input?.id, 'id');
    return { note: noteSvc().pinNoteForEmployee(input.id, !!input.pinned, ctx.employeeId) };
  }));

  ipcHandle('erp:note:listTags', withErpAuth('erp.access', async () => ({
    tags: noteSvc().listTags(),
  })));

  ipcHandle('erp:note:createTag', withErpAuth('note.create', async (input: any) => {
    erpValidate.string(input?.name, 'name', { max: 50 });
    return { tag: noteSvc().createTag(input.name, input.color) };
  }));

  ipcHandle('erp:note:addTag', withErpAuth('note.update', async (input: any) => {
    erpValidate.string(input?.noteId, 'noteId');
    erpValidate.int(input?.tagId, 'tagId');
    noteSvc().addTagToNote(input.noteId, Number(input.tagId));
    return {};
  }));

  ipcHandle('erp:note:removeTag', withErpAuth('note.update', async (input: any) => {
    erpValidate.string(input?.noteId, 'noteId');
    erpValidate.int(input?.tagId, 'tagId');
    noteSvc().removeTagFromNote(input.noteId, Number(input.tagId));
    return {};
  }));

  ipcHandle('erp:note:versions', withErpAuth('erp.access', async (input: any, ctx) => {
    erpValidate.string(input?.noteId, 'noteId');
    return { versions: noteSvc().listVersionsForEmployee(input.noteId, ctx.employeeId) };
  }));

  ipcHandle('erp:note:restoreVersion', withErpAuth('note.update', async (input: any, ctx) => {
    erpValidate.int(input?.versionId, 'versionId');
    return { note: noteSvc().restoreVersionForEmployee(Number(input.versionId), ctx.employeeId) };
  }));

  // ─── Share (Phase 2) ──────────────────────────────────────────────────────
  ipcHandle('erp:note:share', withErpAuth('note.share', async (input: any, ctx) => {
    erpValidate.string(input?.noteId, 'noteId');
    const scope = input?.scope || 'custom';
    erpValidate.enum(scope, 'scope', ['private', 'workspace', 'custom'] as const);
    const shares: Array<{ employeeId: string; permission: 'read' | 'edit' }> =
      Array.isArray(input?.shares) ? input.shares : [];
    noteSvc().shareNote(input.noteId, shares, scope, ctx.employeeId);
    return {};
  }));

  ipcHandle('erp:note:listShares', withErpAuth('erp.access', async (input: any, ctx) => {
    erpValidate.string(input?.noteId, 'noteId');
    return { shares: noteSvc().listSharesForEmployee(input.noteId, ctx.employeeId) };
  }));
}

