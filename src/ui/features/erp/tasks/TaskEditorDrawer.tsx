import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import ipc from '@/lib/ipc';
import { toLocalMediaUrl } from '@/lib/localMedia';
import { useAppStore } from '@/store/appStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useErpEmployeeStore } from '@/store/erp/erpEmployeeStore';
import { useErpTaskStore } from '@/store/erp/erpTaskStore';
import type {
  CreateTaskInput,
  ErpAttachment,
  ErpTask,
  ErpTaskDetail,
  ErpTaskPriority,
  ErpTaskStatus,
  TaskAttachmentInput,
  UpdateTaskInput,
} from '../../../../models/erp';
import { EmployeeAvatar, PriorityBadge, RichContentPreview, StatusBadge } from '../shared/ErpBadges';
import TaskMultiSelect from './TaskMultiSelect';

interface Props {
  taskId?: string | null;
  defaultStatus?: ErpTaskStatus;
  projectId?: string;
  onClose: () => void;
  onSaved?: (task: ErpTask) => void;
}

interface AttachmentDraft extends TaskAttachmentInput {
  id: string;
  previewUrl?: string;
}

interface TaskFormState {
  title: string;
  description: string;
  project_id: string;
  status: ErpTaskStatus;
  priority: ErpTaskPriority;
  due_date: string;
  assignees: string[];
  watchers: string[];
}

const STATUS_OPTS: Array<{ value: ErpTaskStatus; label: string }> = [
  { value: 'todo', label: 'Cần làm' },
  { value: 'doing', label: 'Đang làm' },
  { value: 'review', label: 'Xem xét' },
  { value: 'done', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Huỷ' },
];

const PRIORITY_OPTS: Array<{ value: ErpTaskPriority; label: string }> = [
  { value: 'low', label: 'Thấp' },
  { value: 'normal', label: 'Bình thường' },
  { value: 'high', label: 'Cao' },
  { value: 'urgent', label: 'Khẩn cấp' },
];

const QUILL_FORMATS = [
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'blockquote',
  'list',
  'bullet',
  'indent',
  'link',
  'image',
  'code-block',
  'align',
  'color',
  'background',
] as const;

function emptyForm(defaultStatus: ErpTaskStatus, projectId?: string): TaskFormState {
  return {
    title: '',
    description: '',
    project_id: projectId ?? '',
    status: defaultStatus,
    priority: 'normal',
    due_date: '',
    assignees: [],
    watchers: [],
  };
}

function toDateTimeInputValue(ts?: number | null) {
  if (!ts) return '';
  const offset = new Date(ts).getTimezoneOffset() * 60000;
  return new Date(ts - offset).toISOString().slice(0, 16);
}

function toAttachmentDraft(attachment: ErpAttachment): AttachmentDraft {
  return {
    id: `saved-${attachment.id}`,
    file_name: attachment.file_name,
    file_path: attachment.file_path,
    mime_type: attachment.mime_type,
    size: attachment.size,
    previewUrl: attachment.mime_type?.startsWith('image/') ? toFileSrc(attachment.file_path) : undefined,
  };
}

function toFileSrc(filePath?: string) {
  if (!filePath) return '';
  return toLocalMediaUrl(filePath);
}

function isImageAttachment(attachment: TaskAttachmentInput) {
  return attachment.mime_type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(attachment.file_name);
}

export default function TaskEditorDrawer({ taskId, defaultStatus = 'todo', projectId, onClose, onSaved }: Props) {
  const quillRef = useRef<ReactQuill | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const editorImageInputRef = useRef<HTMLInputElement>(null);
  const { showNotification } = useAppStore();
  const { employees, currentEmployee, employeeNameMap, loadEmployees } = useEmployeeStore();
  const { profiles, loadProfiles } = useErpEmployeeStore();
  const { projects, loadProjects, createTask, updateTask } = useErpTaskStore();
  const [task, setTask] = useState<ErpTaskDetail | null>(null);
  const [form, setForm] = useState<TaskFormState>(() => emptyForm(defaultStatus, projectId));
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [loading, setLoading] = useState(!!taskId);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [subtaskContent, setSubtaskContent] = useState('');
  const [subtaskAssignee, setSubtaskAssignee] = useState('');
  const [subtaskDueDate, setSubtaskDueDate] = useState('');

  // Hỗ trợ lưu trữ nhiệm vụ con khi tạo mới (chưa có taskId)
  const [localSubtasks, setLocalSubtasks] = useState<{ id: string; content: string; assignee_id: string | null; due_date: number | null; done: boolean }[]>([]);

  const assigneeOptions = useMemo(() => {
    const employeeItems = employees.map((employee: any) => ({
      employee_id: employee.employee_id,
      display_name: employee.display_name || employeeNameMap[employee.employee_id] || employee.employee_id,
      avatar_url: employee.avatar_url,
    }));
    const profileItems = profiles.map((profile: any) => ({
      employee_id: profile.employee_id,
      display_name: profile.full_name || profile.display_name || employeeNameMap[profile.employee_id] || profile.employee_id,
      avatar_url: profile.avatar_url,
    }));
    const fallbackSelected = Array.from(new Set([...(form.assignees || []), ...(form.watchers || [])]))
      .filter(id => id && id !== 'boss')
      .map(employeeId => ({
        employee_id: employeeId,
        display_name: profileItems.find(profile => profile.employee_id === employeeId)?.display_name || employeeNameMap[employeeId] || employeeId,
        avatar_url: undefined,
      }));
    const all = [...employeeItems, ...profileItems, ...fallbackSelected];
    const seen = new Set<string>();
    return all.filter(item => {
      if (seen.has(item.employee_id)) return false;
      seen.add(item.employee_id);
      return true;
    });
  }, [employees, profiles, form.assignees, form.watchers, employeeNameMap]);

  const syncFormFromTask = useCallback((nextTask: ErpTaskDetail | null) => {
    if (!nextTask) {
      setForm(emptyForm(defaultStatus, projectId));
      setAttachments([]);
      setLocalSubtasks([]);
      return;
    }
    setForm({
      title: nextTask.title,
      description: nextTask.description ?? '',
      project_id: nextTask.project_id ?? '',
      status: nextTask.status,
      priority: nextTask.priority,
      due_date: toDateTimeInputValue(nextTask.due_date),
      assignees: nextTask.assignees ?? [],
      watchers: nextTask.watchers ?? [],
    });
    setAttachments((nextTask.attachments ?? []).map(toAttachmentDraft));
  }, [defaultStatus, projectId]);

  const refresh = useCallback(async (nextTaskId = taskId) => {
    if (!nextTaskId) {
      setTask(null);
      syncFormFromTask(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await ipc.erp?.taskGet({ id: nextTaskId });
    if (res?.success && res.task) {
      setTask(res.task);
      syncFormFromTask(res.task);
    }
    setLoading(false);
  }, [syncFormFromTask, taskId]);

  useEffect(() => {
    loadEmployees();
    loadProfiles();
    loadProjects();
  }, []);

  useEffect(() => {
    if (taskId) {
      refresh(taskId);
      return;
    }
    setTask(null);
    setLoading(false);
    setComment('');
    syncFormFromTask(null);
  }, [taskId, defaultStatus, projectId, refresh, syncFormFromTask]);

  const handleEditorImagePick = useCallback(() => {
    editorImageInputRef.current?.click();
  }, []);

  const quillModules = useMemo(() => ({
    toolbar: {
      container: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote', 'code-block'],
        [{ align: [] }],
        ['link', 'image'],
        ['clean'],
      ],
      handlers: { image: handleEditorImagePick },
    },
  }), [handleEditorImagePick]);

  const handleInlineImageSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const editor = quillRef.current?.getEditor();
      if (!editor || typeof reader.result !== 'string') return;
      const range = editor.getSelection(true);
      editor.insertEmbed(range?.index ?? editor.getLength(), 'image', reader.result, 'user');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleAttachmentFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const nextDrafts = files.map((file, index) => ({
      id: `new-${Date.now()}-${index}`,
      file_name: file.name,
      file_path: (file as any).path || file.name,
      mime_type: file.type,
      size: file.size,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    } satisfies AttachmentDraft));
    setAttachments(current => [...current, ...nextDrafts]);
    event.target.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments(current => current.filter(item => item.id !== id));
  };

  const openAttachment = async (attachment: AttachmentDraft) => {
    const res = await ipc.shell?.openPath?.(attachment.file_path);
    if (!res?.success) showNotification(res?.error || 'Không thể mở file', 'error');
  };

  const saveTask = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const attachmentPayload = attachments.map(({ file_name, file_path, mime_type, size }) => ({ file_name, file_path, mime_type, size }));
      if (!taskId) {
        // Tạo task mới
        const created = await createTask({
          ...form,
          title: form.title.trim(),
          due_date: form.due_date ? new Date(form.due_date).getTime() : undefined,
          attachments: attachmentPayload
        });
        
        if (created) {
          // Lưu các nhiệm vụ con (checklist) khai báo cục bộ khi tạo mới
          for (const item of localSubtasks) {
            await ipc.erp?.taskAddChecklist({
              taskId: created.id,
              content: item.content,
              assigneeId: item.assignee_id,
              dueDate: item.due_date
            });
          }
          
          showNotification('Đã tạo nhiệm vụ thành công', 'success');
          onSaved?.(created);
          onClose();
        }
      } else {
        // Cập nhật task đã có
        await updateTask(taskId, {
          ...form,
          title: form.title.trim(),
          due_date: form.due_date ? new Date(form.due_date).getTime() : null,
          attachments: attachmentPayload
        });
        await refresh(taskId);
        showNotification('Đã lưu thành công', 'success');
        onClose();
      }
    } finally { setSaving(false); }
  };

  const handleToggleCompleted = async () => {
    if (!taskId || !task) return;
    const nextStatus = task.status === 'done' ? 'todo' : 'done';
    await ipc.erp?.taskUpdateStatus({ id: taskId, status: nextStatus });
    await refresh(taskId);
  };

  const handleAddComment = async () => {
    if (!taskId || !comment.trim()) return;
    await ipc.erp?.taskAddComment({ taskId, content: comment });
    setComment('');
    await refresh(taskId);
  };

  const handleChecklistToggle = async (itemId: number | string, done: boolean) => {
    if (taskId) {
      await ipc.erp?.taskToggleChecklist({ id: Number(itemId), done });
      await refresh(taskId);
    } else {
      setLocalSubtasks(current => current.map(item => item.id === String(itemId) ? { ...item, done } : item));
    }
  };

  const handleChecklistAssigneeChange = async (itemId: number | string, employeeId: string) => {
    if (taskId) {
      await ipc.erp?.taskUpdateChecklist({ id: Number(itemId), patch: { assignee_id: employeeId || null } });
      await refresh(taskId);
    } else {
      setLocalSubtasks(current => current.map(item => item.id === String(itemId) ? { ...item, assignee_id: employeeId || null } : item));
    }
  };

  const handleChecklistDueDateChange = async (itemId: number | string, dateStr: string) => {
    const val = dateStr ? new Date(dateStr).getTime() : null;
    if (taskId) {
      await ipc.erp?.taskUpdateChecklist({ id: Number(itemId), patch: { due_date: val } });
      await refresh(taskId);
    } else {
      setLocalSubtasks(current => current.map(item => item.id === String(itemId) ? { ...item, due_date: val } : item));
    }
  };

  const handleChecklistDelete = async (itemId: number | string) => {
    if (taskId) {
      await ipc.erp?.taskDeleteChecklist({ id: Number(itemId) });
      await refresh(taskId);
    } else {
      setLocalSubtasks(current => current.filter(item => item.id !== String(itemId)));
    }
  };

  const handleAddSubtask = async () => {
    if (!subtaskContent.trim()) return;
    if (taskId) {
      await ipc.erp?.taskAddChecklist({
        taskId,
        content: subtaskContent.trim(),
        assigneeId: subtaskAssignee || null,
        dueDate: subtaskDueDate ? new Date(subtaskDueDate).getTime() : null
      });
      setSubtaskContent(''); setSubtaskAssignee(''); setSubtaskDueDate('');
      await refresh(taskId);
    } else {
      const tempId = `temp-${Date.now()}`;
      setLocalSubtasks(current => [
        ...current,
        {
          id: tempId,
          content: subtaskContent.trim(),
          assignee_id: subtaskAssignee || null,
          due_date: subtaskDueDate ? new Date(subtaskDueDate).getTime() : null,
          done: false
        }
      ]);
      setSubtaskContent(''); setSubtaskAssignee(''); setSubtaskDueDate('');
    }
  };

  // Checklist statistics
  const checklists = taskId ? (task?.checklist || []) : localSubtasks;
  const checklistTotal = checklists.length;
  const checklistDone = checklists.filter(c => c.done).length;
  const checklistPercent = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[1100px] bg-gray-800 border-l border-gray-800 h-full overflow-hidden shadow-2xl flex flex-col text-gray-200 animate-slide-in" onClick={event => event.stopPropagation()}>
        
        {/* Drawer Header (Chữ đen, nền trắng, viền xám khi sáng) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/80 flex-shrink-0 bg-gray-950/20">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-white">{taskId ? 'Chi tiết nhiệm vụ' : 'Tạo nhiệm vụ mới'}</h3>
            {taskId && (
              <button type="button" onClick={handleToggleCompleted} className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all border ${task?.status === 'done' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`}>
                {task?.status === 'done' ? '✓ Đã hoàn thành' : 'Đánh dấu là đã hoàn thành'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-all">Đóng</button>
            <button onClick={saveTask} disabled={!form.title.trim() || saving || loading} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-all">{saving ? 'Đang lưu...' : 'Lưu nhiệm vụ'}</button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center"><div className="animate-spin w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full" /></div>
        ) : (
          <div className="flex-1 overflow-hidden bg-gray-800">
            <div className="h-full grid grid-cols-1 lg:grid-cols-5 overflow-hidden">
              
              {/* ── CỘT BÊN TRÁI: Nội dung chi tiết, Nhiệm vụ con, Comments (60%) ── */}
              <div className="lg:col-span-3 overflow-y-auto p-6 space-y-6 erp-scroll-y h-full border-r border-gray-800/60 bg-gray-800">
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-wider text-gray-500 mb-1.5 block">Tiêu đề</label>
                  <input autoFocus={!taskId} value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} className="w-full bg-transparent border-b border-gray-800 hover:border-gray-700 focus:border-blue-500 py-2 text-base text-gray-100 font-semibold focus:outline-none transition-all placeholder-gray-600" placeholder="Nhập tiêu đề công việc..." />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">Nội dung công việc</label>
                    <button type="button" onClick={handleEditorImagePick} className="text-[10px] font-semibold text-blue-400 hover:text-blue-300">+ Chèn ảnh</button>
                  </div>
                  <div className="task-rich-editor-wrap rounded-xl border border-gray-800/80 overflow-hidden bg-gray-950/20">
                    <ReactQuill ref={quillRef} theme="snow" value={form.description} onChange={value => setForm(current => ({ ...current, description: value }))} modules={quillModules} formats={[...QUILL_FORMATS]} className="task-rich-editor" placeholder="Mô tả công việc chi tiết..." />
                  </div>
                </div>

                {/* Nhiệm vụ con (Checklist) */}
                <div className="space-y-3.5 border-t border-gray-800/60 pt-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">Nhiệm vụ con</label>
                      <span className="text-xs font-semibold text-gray-400">{checklistDone}/{checklistTotal}</span>
                    </div>
                    {checklistTotal > 0 && (
                      <div className="w-32 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${checklistPercent}%` }} /></div>
                        <span className="text-[10px] font-bold text-gray-400">{checklistPercent}%</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-1.5">
                    {checklists.map(item => (
                      <div key={item.id} className="group flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-950/20 border border-gray-800/30 hover:border-gray-800 transition-all">
                        <input type="checkbox" checked={!!item.done} onChange={e => handleChecklistToggle(item.id, e.target.checked)} className="w-4 h-4 rounded border-gray-700 text-blue-600 focus:ring-0 bg-transparent" />
                        <span className={`text-xs flex-1 min-w-0 truncate ${item.done ? 'line-through text-gray-500 opacity-50' : 'text-slate-200'}`}>{item.content}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <select value={item.assignee_id || ''} onChange={e => handleChecklistAssigneeChange(item.id, e.target.value)} className="bg-transparent border-0 text-[10px] text-gray-400 hover:text-slate-200 cursor-pointer focus:outline-none w-20 truncate">
                            <option value="" className="bg-gray-900 text-gray-500">Chưa gán</option>
                            {assigneeOptions.map(opt => <option key={opt.employee_id} value={opt.employee_id} className="bg-gray-900 text-slate-300">{opt.display_name}</option>)}
                          </select>
                          <input type="date" value={item.due_date ? new Date(item.due_date).toISOString().split('T')[0] : ''} onChange={e => handleChecklistDueDateChange(item.id, e.target.value)} className="bg-transparent border-0 text-[10px] text-gray-400 hover:text-slate-200 cursor-pointer focus:outline-none w-24 text-right" />
                          <button type="button" onClick={() => handleChecklistDelete(item.id)} className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-gray-850 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                        </div>
                      </div>
                    ))}
                    
                    {/* Hàng nhập nhanh nhiệm vụ con mới */}
                    <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-dashed border-gray-800 bg-gray-950/5">
                      <span className="w-4 h-4 rounded-full border border-gray-700 flex-shrink-0" />
                      <input value={subtaskContent} onChange={e => setSubtaskContent(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddSubtask()} placeholder="Nhấn Enter để tạo nhiệm vụ con..." className="text-xs bg-transparent border-0 flex-1 focus:ring-0 focus:outline-none p-0 placeholder-gray-600 text-gray-200" />
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <select value={subtaskAssignee} onChange={e => setSubtaskAssignee(e.target.value)} className="bg-transparent border-0 text-[10px] text-gray-500 hover:text-slate-300 cursor-pointer focus:outline-none w-20">
                          <option value="" className="bg-gray-900 text-gray-500">Gán...</option>
                          {assigneeOptions.map(opt => <option key={opt.employee_id} value={opt.employee_id} className="bg-gray-900 text-slate-300">{opt.display_name}</option>)}
                        </select>
                        <input type="date" value={subtaskDueDate} onChange={e => setSubtaskDueDate(e.target.value)} className="bg-transparent border-0 text-[10px] text-gray-500 hover:text-slate-300 cursor-pointer focus:outline-none w-24 text-right" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bình luận */}
                {taskId && (
                  <div className="space-y-4 border-t border-gray-800/60 pt-5">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">Bình luận & Nhận xét</label>
                    <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1 erp-scroll-y">
                      {(task?.comments || []).map(comm => (
                        <div key={comm.id} className="flex gap-3 items-start">
                          <EmployeeAvatar employeeId={comm.author_id} size={26} showName={false} />
                          <div className="flex-1 bg-gray-950/20 border border-gray-800/40 rounded-2xl px-4 py-2.5 space-y-1">
                            <div className="flex items-center justify-between"><span className="text-xs font-bold text-gray-300">{assigneeOptions.find(o => o.employee_id === comm.author_id)?.display_name || comm.author_id}</span><span className="text-[10px] text-gray-500">{new Date(comm.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span></div>
                            <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{comm.content}</p>
                          </div>
                        </div>
                      ))}
                      {(task?.comments || []).length === 0 && <p className="text-xs text-gray-600 italic pl-1">Chưa có bình luận nào.</p>}
                    </div>
                    <div className="flex gap-3 items-start">
                      <input value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAddComment())} placeholder="Viết nhận xét..." className="text-xs bg-gray-950/30 border border-gray-800 rounded-xl px-4 py-3 flex-1 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 text-gray-200 placeholder-gray-600" />
                      <button onClick={handleAddComment} disabled={!comment.trim()} className="px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-all">Gửi</button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── CỘT BÊN PHẢI: Metadata & Tệp đính kèm (40% - Nền xám nhẹ khi sáng) ── */}
              <div className="lg:col-span-2 overflow-y-auto p-6 space-y-6 erp-scroll-y h-full bg-gray-950/10 border-l border-gray-800/60">
                <Field label="Dự án">
                  <select value={form.project_id} onChange={event => setForm(current => ({ ...current, project_id: event.target.value }))} className="task-editor-select w-full bg-gray-800/80 border border-gray-700/80 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white">
                    <option value="" className="bg-gray-900 text-gray-500">Không thuộc dự án</option>
                    {projects.map(project => <option key={project.id} value={project.id} className="bg-gray-900 text-white">{project.name}</option>)}
                  </select>
                </Field>
                <Field label="Trạng thái">
                  <select value={form.status} onChange={event => setForm(current => ({ ...current, status: event.target.value as ErpTaskStatus }))} className="task-editor-select w-full bg-gray-800/80 border border-gray-700/80 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white">
                    {STATUS_OPTS.map(option => <option key={option.value} value={option.value} className="bg-gray-900 text-white">{option.label}</option>)}
                  </select>
                </Field>
                <Field label="Độ ưu tiên">
                  <select value={form.priority} onChange={event => setForm(current => ({ ...current, priority: event.target.value as ErpTaskPriority }))} className="task-editor-select w-full bg-gray-800/80 border border-gray-700/80 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white">
                    {PRIORITY_OPTS.map(option => <option key={option.value} value={option.value} className="bg-gray-900 text-white">{option.label}</option>)}
                  </select>
                </Field>
                <Field label="Hạn hoàn thành">
                  <input type="datetime-local" value={form.due_date} onChange={event => setForm(current => ({ ...current, due_date: event.target.value }))} className="task-editor-select w-full bg-gray-800/80 border border-gray-700/80 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 text-white" />
                </Field>
                <Field label="Người thực hiện">
                  <TaskMultiSelect options={assigneeOptions.map((employee: any) => ({ value: employee.employee_id, label: employee.display_name }))} value={form.assignees} placeholder="Chọn người thực hiện" onChange={next => setForm(current => ({ ...current, assignees: next }))} />
                </Field>
                <Field label="Người theo dõi">
                  <TaskMultiSelect options={assigneeOptions.map((employee: any) => ({ value: employee.employee_id, label: employee.display_name }))} value={form.watchers} placeholder="Chọn người theo dõi" onChange={next => setForm(current => ({ ...current, watchers: next }))} tone="blue" />
                </Field>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">Tệp đính kèm</label>
                    <button type="button" onClick={() => attachmentInputRef.current?.click()} className="text-[10px] font-semibold text-blue-400 hover:text-blue-300">+ Thêm tệp</button>
                  </div>
                  <input ref={attachmentInputRef} type="file" multiple className="hidden" onChange={handleAttachmentFiles} />
                  <input ref={editorImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleInlineImageSelected} />
                  
                  {attachments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-850 bg-gray-900/10 px-4 py-5 text-center text-xs text-gray-500">Chưa có tệp đính kèm</div>
                  ) : (
                    <div className="space-y-2">
                      {attachments.map(attachment => (
                        <div key={attachment.id} className="rounded-xl border border-gray-800 bg-gray-900/30 p-2.5 flex items-center justify-between gap-3 shadow-sm">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-gray-200 font-medium truncate">{attachment.file_name}</div>
                            <div className="text-[10px] text-gray-500 mt-0.5 truncate">{attachment.mime_type || 'Tệp'}{attachment.size ? ` · ${(attachment.size / 1024).toFixed(1)} KB` : ''}</div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button type="button" onClick={() => openAttachment(attachment)} className="px-2.5 py-1 rounded-lg border border-gray-800 hover:bg-gray-700 text-[10px] font-semibold text-gray-300 transition-all">Mở</button>
                            <button type="button" onClick={() => removeAttachment(attachment.id)} className="w-7 h-7 flex items-center justify-center rounded-lg border border-red-500/20 hover:bg-red-500/10 text-[10px] text-red-400 transition-all">✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">{label}</label>
      {children}
    </div>
  );
}
