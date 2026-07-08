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

const priorityLabels: Record<string, string> = {
  low: 'Thấp',
  normal: 'Bình thường',
  high: 'Cao',
  urgent: 'Khẩn cấp',
};

const statusLabels: Record<string, string> = {
  todo: 'Cần làm',
  doing: 'Đang làm',
  review: 'Xem xét',
  done: 'Hoàn thành',
  cancelled: 'Huỷ',
};

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
  try {
    const offset = new Date(ts).getTimezoneOffset() * 60000;
    return new Date(ts - offset).toISOString().slice(0, 16);
  } catch {
    return '';
  }
}

function toDateInputValue(ts?: number | null) {
  if (!ts) return '';
  try {
    return new Date(ts).toISOString().split('T')[0];
  } catch {
    return '';
  }
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

const PROJECT_ICONS: Record<string, React.ReactNode> = {
  folder: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
  ),
  rocket: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M4.5 16.5c-1.5 1.25-2.5 3.5-2.5 3.5s2.25-1 3.5-2.5M12 2C6.5 2 2 6.5 2 12c0 2.2 1 4.2 2.5 5.5l12-12C15.2 3 13.2 2 12 2zm9 1c-.5-.5-1.5-.5-2 0l-5 5 2 2 5-5c.5-.5.5-1.5 0-2z"></path>
    </svg>
  ),
  target: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10"></circle>
      <circle cx="12" cy="12" r="6"></circle>
      <circle cx="12" cy="12" r="2"></circle>
    </svg>
  ),
  code: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="16 18 22 12 16 6"></polyline>
      <polyline points="8 6 2 12 8 18"></polyline>
    </svg>
  ),
  palette: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.02845 19.1699 5.28186 19.2241 5.50853 19.1388C5.7352 19.0535 5.89737 18.8427 5.92485 18.6015C5.97441 18.167 6 17.7208 6 17.27C6 15.4641 7.4641 14 9.27 14H10.73C12.5359 14 14 15.4641 14 17.27C14 19.8823 11.8823 22 9.27 22H12zm-3.5-12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-6 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"></path>
    </svg>
  ),
  chart: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="20" x2="18" y2="10"></line>
      <line x1="12" y1="20" x2="12" y2="4"></line>
      <line x1="6" y1="20" x2="6" y2="14"></line>
    </svg>
  ),
  home: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>
  ),
  fire: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
    </svg>
  ),
  bulb: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .5 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5h6z"></path>
      <line x1="9" y1="18" x2="15" y2="18"></line>
      <line x1="10" y1="22" x2="14" y2="22"></line>
    </svg>
  ),
  sparkles: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707-.707M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"></path>
    </svg>
  ),
  phone: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
    </svg>
  ),
  bag: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
      <line x1="3" y1="6" x2="21" y2="6"></line>
      <path d="M16 10a4 4 0 0 1-8 0"></path>
    </svg>
  )
};

const renderProjectIcon = (iconKey: string) => {
  if (iconKey === '💼') return <span className="text-sm">💼</span>;
  const iconSvg = PROJECT_ICONS[iconKey];
  if (iconSvg) {
    return React.cloneElement(iconSvg as React.ReactElement, {
      className: 'w-3.5 h-3.5 flex-shrink-0 text-gray-400'
    });
  }
  if (iconKey && iconKey.length > 0 && !/^[a-zA-Z0-9_-]+$/.test(iconKey)) {
    return <span className="text-sm flex-shrink-0">{iconKey}</span>;
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 flex-shrink-0 text-gray-400">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
  );
};

const getProjectDisplay = (name: string) => {
  if (!name) return { icon: 'folder', cleanName: '' };
  const slugMatch = name.match(/^\[([a-zA-Z0-9_-]+)\]\s*(.*)$/);
  if (slugMatch) {
    return { icon: slugMatch[1], cleanName: slugMatch[2] };
  }
  const emojiRegex = /^([\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation}|\p{Emoji})\s+(.*)$/u;
  const match = name.match(emojiRegex);
  if (match) {
    return { icon: match[1], cleanName: match[2] };
  }
  return { icon: 'folder', cleanName: name };
};

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
  
  // Subtasks & checklist states
  const [subtaskContent, setSubtaskContent] = useState('');
  const [subtaskAssignee, setSubtaskAssignee] = useState<string | null>(null);
  const [subtaskDueDate, setSubtaskDueDate] = useState<string>('');

  // UI Dropdown States
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showWatcherDropdown, setShowWatcherDropdown] = useState(false);
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [showSubtaskAssignee, setShowSubtaskAssignee] = useState(false);
  const [showSubtaskDatePicker, setShowSubtaskDatePicker] = useState(false);

  // Refs for closing dropdowns and inputs
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const watcherDropdownRef = useRef<HTMLDivElement>(null);
  const subtaskAssigneeRef = useRef<HTMLDivElement>(null);

  // Hỗ trợ lưu trữ nhiệm vụ con khi tạo mới (chưa có taskId)
  const [localSubtasks, setLocalSubtasks] = useState<{ id: string; content: string; assignee_id: string | null; due_date: number | null; done: boolean }[]>([]);

  const assigneeOptions = useMemo(() => {
    const employeeItems = (employees || []).filter(Boolean).map((employee: any) => ({
      employee_id: employee.employee_id,
      display_name: employee.display_name || employeeNameMap[employee.employee_id] || employee.employee_id,
      avatar_url: employee.avatar_url,
    }));
    const profileItems = (profiles || []).filter(Boolean).map((profile: any) => ({
      employee_id: profile.employee_id,
      display_name: profile.full_name || profile.display_name || employeeNameMap[profile.employee_id] || profile.employee_id,
      avatar_url: profile.avatar_url,
    }));
    const fallbackSelected = Array.from(new Set([...(form.assignees || []), ...(form.watchers || [])]))
      .filter(id => id && id !== 'boss')
      .map(employeeId => ({
        employee_id: employeeId,
        display_name: profileItems.find(profile => profile && profile.employee_id === employeeId)?.display_name || employeeNameMap[employeeId] || employeeId,
        avatar_url: undefined,
      }));
    const all = [...employeeItems, ...profileItems, ...fallbackSelected];
    const seen = new Set<string>();
    return all.filter(item => {
      if (!item || !item.employee_id) return false;
      if (seen.has(item.employee_id)) return false;
      seen.add(item.employee_id);
      return true;
    });
  }, [employees, profiles, form.assignees, form.watchers, employeeNameMap]);

  const isOnlyWatcher = useMemo(() => {
    if (!taskId || !task || !currentEmployee) return false;
    const empId = currentEmployee.employee_id;
    if (empId === 'boss') return false; // Boss has full access

    const isCreator = (task as any).creator_id === empId;
    const isAssignee = task.assignees?.includes(empId);

    return !isCreator && !isAssignee;
  }, [taskId, task, currentEmployee]);

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

  // Click outside listener for dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(target)) {
        setShowAssigneeDropdown(false);
      }
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(target)) {
        setShowPriorityDropdown(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(target)) {
        setShowStatusDropdown(false);
      }
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(target)) {
        setShowProjectDropdown(false);
      }
      if (watcherDropdownRef.current && !watcherDropdownRef.current.contains(target)) {
        setShowWatcherDropdown(false);
      }
      if (subtaskAssigneeRef.current && !subtaskAssigneeRef.current.contains(target)) {
        setShowSubtaskAssignee(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      setSubtaskContent(''); setSubtaskAssignee(null); setSubtaskDueDate('');
      setShowSubtaskAssignee(false); setShowSubtaskDatePicker(false);
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
      setSubtaskContent(''); setSubtaskAssignee(null); setSubtaskDueDate('');
      setShowSubtaskAssignee(false); setShowSubtaskDatePicker(false);
    }
  };

  const handleDueDatePreset = (preset: 'today' | 'tomorrow' | 'clear') => {
    if (isOnlyWatcher) return;
    if (preset === 'clear') {
      setForm(curr => ({ ...curr, due_date: '' }));
      return;
    }
    const date = new Date();
    if (preset === 'tomorrow') {
      date.setDate(date.getDate() + 1);
    }
    date.setHours(18, 0, 0, 0);
    const offset = date.getTimezoneOffset() * 60000;
    const localISOTime = new Date(date.getTime() - offset).toISOString().slice(0, 16);
    setForm(curr => ({ ...curr, due_date: localISOTime }));
    setShowCustomDate(false);
  };

  const toggleWatcher = (empId: string) => {
    if (isOnlyWatcher) return;
    setForm(curr => {
      const isSelected = curr.watchers.includes(empId);
      return {
        ...curr,
        watchers: isSelected 
          ? curr.watchers.filter(id => id !== empId)
          : [...curr.watchers, empId]
      };
    });
  };

  // Get current assignee's metadata for display
  const currentAssignee = useMemo(() => {
    if (form.assignees.length === 0) return null;
    const primaryId = form.assignees[0];
    return assigneeOptions.find(opt => opt.employee_id === primaryId) || { employee_id: primaryId, display_name: primaryId, avatar_url: undefined };
  }, [form.assignees, assigneeOptions]);

  // Project display details
  const currentProjectDisplay = useMemo(() => {
    if (!form.project_id) return { icon: '💼', cleanName: 'Chọn dự án...', color: '#64748b' };
    const found = projects.find(p => p && p.id === form.project_id);
    if (found) {
      const { icon, cleanName } = getProjectDisplay(found.name);
      return { icon, cleanName, color: found.color || '#3b82f6' };
    }
    return { icon: '📁', cleanName: 'Không thuộc dự án', color: '#64748b' };
  }, [form.project_id, projects]);

  const handleAttachmentPick = () => {
    attachmentInputRef.current?.click();
  };

  // Checklist statistics
  const checklists = taskId ? (task?.checklist || []) : localSubtasks;
  const checklistTotal = checklists.length;
  const checklistDone = checklists.filter(c => c.done).length;
  const checklistPercent = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
      <div 
        className="w-full max-w-[1050px] h-[85vh] bg-gray-950 border border-gray-800/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-gray-200 animate-fade-in mx-4" 
        onClick={e => e.stopPropagation()}
      >
        {/* Drawer Header (Chữ đen, nền trắng, viền xám) */}
        <div className="flex items-center justify-between px-7 py-4 border-b border-gray-800/30 flex-shrink-0 bg-gray-950/20">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-100">Chi tiết nhiệm vụ</h3>
            {taskId && (
              <button 
                type="button" 
                disabled={isOnlyWatcher}
                onClick={handleToggleCompleted} 
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all border ${task?.status === 'done' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {task?.status === 'done' ? '✓ Đã hoàn thành' : 'Đánh dấu là đã hoàn thành'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3.5 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-all">Đóng</button>
            <button onClick={saveTask} disabled={!form.title.trim() || saving || loading} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-all">{saving ? 'Đang lưu...' : 'Lưu nhiệm vụ'}</button>
          </div>
        </div>

        {/* Modal Main Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-gray-950">
            <div className="animate-spin w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-5 bg-gray-950">
            {/* LEFT COLUMN (60%): Task Details */}
            <div className="lg:col-span-3 overflow-y-auto px-7 py-6 space-y-5 erp-scroll-y h-full border-r border-gray-800/30">
              {/* Title Input */}
              <div>
                <input 
                  disabled={isOnlyWatcher}
                  type="text"
                  value={form.title} 
                  onChange={event => setForm(current => ({ ...current, title: event.target.value }))}
                  placeholder="Nhập tiêu đề công việc..." 
                  className="w-full bg-transparent border-0 py-1 text-lg text-gray-100 font-semibold focus:ring-0 focus:outline-none placeholder-gray-500 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>

              {/* Metadata Row: Assignee & Priority & Status */}
              <div className="flex items-center gap-3 text-sm text-gray-400 border-t border-gray-800/30 pt-4">
                {/* User Icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>

                {/* Assignee Selector */}
                <div className="relative" ref={assigneeDropdownRef}>
                  <button 
                    disabled={isOnlyWatcher}
                    type="button"
                    onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)} 
                    className="flex items-center gap-2 hover:text-gray-100 py-1 px-2 rounded-lg hover:bg-gray-900/60 transition-colors disabled:opacity-75 disabled:hover:bg-transparent"
                  >
                    {form.assignees.length > 0 ? (
                      <div className="flex items-center -space-x-1.5 overflow-hidden">
                        {form.assignees.map(id => (
                          <EmployeeAvatar key={id} employeeId={id} size={18} showName={false} />
                        ))}
                        <span className="text-gray-200 font-medium ml-2">
                          {form.assignees.length === 1 
                            ? (assigneeOptions.find(o => o.employee_id === form.assignees[0])?.display_name || form.assignees[0])
                            : `${form.assignees.length} người thực hiện`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400">Chọn người thực hiện</span>
                    )}
                  </button>

                  {showAssigneeDropdown && !isOnlyWatcher && (
                    <div className="absolute left-0 mt-1.5 w-60 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl py-1.5 z-[1000] max-h-56 overflow-y-auto erp-scroll-y">
                      <div 
                        onClick={() => { setForm(curr => ({ ...curr, assignees: [] })); }}
                        className="px-3 py-1.5 hover:bg-gray-800 text-xs text-gray-400 cursor-pointer flex items-center justify-between"
                      >
                        <span>Không gán ai</span>
                        {form.assignees.length === 0 && <span className="text-blue-500 font-bold">✓</span>}
                      </div>
                      {assigneeOptions.map(emp => {
                        const isSelected = form.assignees.includes(emp.employee_id);
                        return (
                          <div 
                            key={emp.employee_id} 
                            onClick={() => {
                              setForm(curr => ({
                                ...curr,
                                assignees: isSelected
                                  ? curr.assignees.filter(id => id !== emp.employee_id)
                                  : [...curr.assignees, emp.employee_id]
                              }));
                            }}
                            className="px-3 py-1.5 hover:bg-gray-800 text-xs text-gray-200 cursor-pointer flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <EmployeeAvatar employeeId={emp.employee_id} size={18} showName={false} />
                              <span>{emp.display_name}</span>
                            </div>
                            {isSelected && <span className="text-blue-500 font-bold">✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <span className="text-gray-700">|</span>

                {/* Priority Selector */}
                <div className="relative" ref={priorityDropdownRef}>
                  <button 
                    disabled={isOnlyWatcher}
                    type="button"
                    onClick={() => setShowPriorityDropdown(!showPriorityDropdown)} 
                    className="flex items-center gap-1.5 hover:text-gray-100 py-1 px-2 rounded-lg hover:bg-gray-900/60 transition-colors disabled:opacity-75 disabled:hover:bg-transparent"
                  >
                    <span className="text-gray-200 font-medium">{priorityLabels[form.priority] || form.priority}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </button>

                  {showPriorityDropdown && !isOnlyWatcher && (
                    <div className="absolute left-0 mt-1.5 w-36 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl py-1.5 z-[1000]">
                      {(['low', 'normal', 'high', 'urgent'] as ErpTaskPriority[]).map(p => (
                        <div 
                          key={p} 
                          onClick={() => { setForm(curr => ({ ...curr, priority: p })); setShowPriorityDropdown(false); }}
                          className="px-3 py-1.5 hover:bg-gray-800 text-xs text-gray-200 cursor-pointer"
                        >
                          {priorityLabels[p]}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <span className="text-gray-700">|</span>

                {/* Status Selector */}
                <div className="relative" ref={statusDropdownRef}>
                  <button 
                    disabled={isOnlyWatcher}
                    type="button"
                    onClick={() => setShowStatusDropdown(!showStatusDropdown)} 
                    className="flex items-center gap-1.5 hover:text-gray-100 py-1 px-2 rounded-lg hover:bg-gray-900/60 transition-colors disabled:opacity-75 disabled:hover:bg-transparent"
                  >
                    <span className="text-gray-200 font-medium">{statusLabels[form.status] || form.status}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </button>

                  {showStatusDropdown && !isOnlyWatcher && (
                    <div className="absolute left-0 mt-1.5 w-36 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl py-1.5 z-[1000]">
                      {STATUS_OPTS.map(opt => (
                        <div 
                          key={opt.value} 
                          onClick={() => { setForm(curr => ({ ...curr, status: opt.value as ErpTaskStatus })); setShowStatusDropdown(false); }}
                          className="px-3 py-1.5 hover:bg-gray-800 text-xs text-gray-200 cursor-pointer"
                        >
                          {opt.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Due Date Presets */}
              <div className="flex items-center gap-3 text-sm text-gray-400">
                {/* Calendar Icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>

                {/* Date Tags */}
                <div className="flex items-center gap-2">
                  <button 
                    disabled={isOnlyWatcher}
                    type="button" 
                    onClick={() => handleDueDatePreset('today')}
                    className="flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-blue-900/30 text-blue-400 border border-blue-500/40 hover:bg-blue-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>📅</span> Hôm nay
                  </button>

                  <button 
                    disabled={isOnlyWatcher}
                    type="button" 
                    onClick={() => handleDueDatePreset('tomorrow')}
                    className="flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-green-900/30 text-green-400 border border-green-600/40 hover:bg-green-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>➔</span> Ngày mai
                  </button>

                  <button 
                    disabled={isOnlyWatcher}
                    type="button" 
                    onClick={() => setShowCustomDate(!showCustomDate)}
                    className="flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-gray-900 text-gray-300 border border-gray-800 hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>📅</span> Khác
                  </button>

                  {form.due_date && !isOnlyWatcher && (
                    <button 
                      type="button" 
                      onClick={() => handleDueDatePreset('clear')}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors pl-1"
                    >
                      Xoá ngày
                    </button>
                  )}
                </div>

                {/* Display Selected Due Date */}
                {form.due_date && !showCustomDate && (
                  <span className="text-xs text-gray-300 font-medium">
                    {new Date(form.due_date).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                  </span>
                )}
              </div>

              {/* Custom Date Input Panel */}
              {showCustomDate && (
                <div className="pl-7">
                  <input 
                    disabled={isOnlyWatcher}
                    type="datetime-local" 
                    value={form.due_date} 
                    onChange={e => setForm(curr => ({ ...curr, due_date: e.target.value }))} 
                    className="bg-gray-900 border border-gray-850 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500 focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              )}

              {/* Project Selection */}
              <div className="flex items-center gap-3 text-sm text-gray-400">
                {/* File Icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>

                <div className="relative flex-1" ref={projectDropdownRef}>
                  <button 
                    disabled={isOnlyWatcher}
                    type="button"
                    onClick={() => setShowProjectDropdown(!showProjectDropdown)} 
                    className="hover:text-gray-100 py-1 px-2 -ml-2 rounded-lg hover:bg-gray-900/60 transition-colors inline-flex items-center gap-1.5 text-gray-300 text-xs font-medium disabled:opacity-75 disabled:hover:bg-transparent"
                  >
                    {renderProjectIcon(currentProjectDisplay.icon)}
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: currentProjectDisplay.color }} />
                    <span className="truncate">{currentProjectDisplay.cleanName}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 flex-shrink-0">
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </button>

                  {showProjectDropdown && !isOnlyWatcher && (
                    <div className="absolute left-0 mt-1.5 w-64 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl py-1.5 z-[1000] max-h-56 overflow-y-auto erp-scroll-y">
                      <div 
                        onClick={() => { setForm(curr => ({ ...curr, project_id: '' })); setShowProjectDropdown(false); }}
                        className="px-3 py-1.5 hover:bg-gray-800 text-xs text-gray-400 cursor-pointer flex items-center gap-2"
                      >
                        <span className="text-sm">💼</span>
                        <span className="w-2 h-2 rounded-full bg-gray-600" />
                        <span>Không thuộc dự án</span>
                      </div>
                      {projects.map(proj => {
                        if (!proj || !proj.name) return null;
                        const { icon, cleanName } = getProjectDisplay(proj.name);
                        return (
                          <div 
                            key={proj.id} 
                            onClick={() => { setForm(curr => ({ ...curr, project_id: proj.id })); setShowProjectDropdown(false); }}
                            className="px-3 py-1.5 hover:bg-gray-800 text-xs text-gray-200 cursor-pointer flex items-center gap-2"
                          >
                            {renderProjectIcon(icon)}
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: proj.color || '#3b82f6' }} />
                            <span className="truncate">{cleanName}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Description Editor */}
              <div className="space-y-2 pt-2 border-t border-gray-800/30">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">Nội dung công việc</label>
                  {!isOnlyWatcher && (
                    <button type="button" onClick={handleEditorImagePick} className="text-[10px] font-semibold text-blue-600 hover:text-blue-500">+ Chèn ảnh</button>
                  )}
                </div>
                <div className="task-rich-editor-wrap rounded-xl border border-gray-850 overflow-hidden bg-gray-950/20">
                  <ReactQuill ref={quillRef} theme="snow" value={form.description} onChange={value => setForm(current => ({ ...current, description: value }))} modules={quillModules} formats={[...QUILL_FORMATS]} className="task-rich-editor" placeholder="Mô tả công việc chi tiết..." readOnly={isOnlyWatcher} />
                </div>
              </div>

              {/* Render local uploaded attachments if any */}
              {attachments.length > 0 && (
                <div className="pl-7 space-y-2 border-t border-gray-800/30 pt-5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block">Tệp đính kèm</label>
                  <div className="grid grid-cols-1 gap-2">
                    {attachments.map(att => (
                      <div key={att.id} className="rounded-xl border border-gray-800/30 bg-gray-900/20 p-2.5 flex items-center justify-between gap-3">
                        <span className="text-xs text-gray-300 truncate flex-1">{att.file_name}</span>
                        <div className="flex items-center gap-1.5">
                          <button 
                            type="button" 
                            onClick={() => openAttachment(att)} 
                            className="px-2.5 py-1 rounded-lg border border-gray-800 bg-gray-800 hover:bg-gray-700 text-[10px] font-semibold text-gray-300 transition-all"
                          >
                            Mở
                          </button>
                          <button 
                            type="button" 
                            onClick={() => removeAttachment(att.id)}
                            className="text-xs text-gray-500 hover:text-red-400"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN (40%): Chat, Comments & Feedback Sidebar */}
            <div className="lg:col-span-2 overflow-y-auto p-6 flex flex-col h-full bg-gray-900/30 border-l border-gray-800/30">
              {/* Checklist / Subtasks Section in Right Column */}
              <div className="mb-6 space-y-3.5 border-b border-gray-800/30 pb-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                      <line x1="6" y1="3" x2="6" y2="15"></line>
                      <circle cx="18" cy="6" r="3"></circle>
                      <circle cx="6" cy="18" r="3"></circle>
                      <path d="M18 9a9 9 0 0 1-9 9"></path>
                    </svg>
                    <label className="text-[10px] uppercase font-bold tracking-wider text-gray-500 block font-semibold">Nhiệm vụ con</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-400">{checklistDone}/{checklistTotal}</span>
                    {checklistTotal > 0 && (
                      <div className="w-20 flex items-center gap-1.5">
                        <div className="flex-1 h-1 bg-gray-900 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${checklistPercent}%` }} />
                        </div>
                        <span className="text-[9px] font-bold text-gray-400">{checklistPercent}%</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Checklist items list */}
                {checklistTotal > 0 && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 erp-scroll-y">
                    {checklists.map(item => (
                      <div key={item.id} className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-transparent border border-gray-800/30 hover:border-gray-800/60 hover:bg-gray-900/10 transition-all">
                        <input 
                          disabled={isOnlyWatcher}
                          type="checkbox" 
                          checked={!!item.done} 
                          onChange={e => handleChecklistToggle(item.id, e.target.checked)} 
                          className="w-3.5 h-3.5 rounded border-gray-700 text-blue-600 focus:ring-0 bg-transparent cursor-pointer disabled:opacity-50"
                        />
                        <span className={`text-[11px] flex-1 min-w-0 truncate ${item.done ? 'line-through text-gray-500 opacity-50' : 'text-gray-200'}`}>
                          {item.content}
                        </span>
                        
                        {/* Subtask Assignee and Date Selectors */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <select 
                            disabled={isOnlyWatcher}
                            value={item.assignee_id || ''} 
                            onChange={e => handleChecklistAssigneeChange(item.id, e.target.value)} 
                            className="bg-transparent border-0 p-0 text-[9px] text-gray-400 hover:text-gray-200 cursor-pointer focus:outline-none w-16 truncate disabled:opacity-50"
                          >
                            <option value="" className="bg-gray-900 text-gray-500">Chưa gán</option>
                            {assigneeOptions.map(opt => <option key={opt.employee_id} value={opt.employee_id} className="bg-gray-900 text-gray-300">{opt.display_name.split(' ').pop()}</option>)}
                          </select>
                          <input 
                            disabled={isOnlyWatcher}
                            type="date" 
                            value={item.due_date ? new Date(item.due_date).toISOString().split('T')[0] : ''} 
                            onChange={e => handleChecklistDueDateChange(item.id, e.target.value)} 
                            className="bg-transparent border-0 p-0 text-[9px] text-gray-400 hover:text-gray-200 cursor-pointer focus:outline-none w-20 text-right disabled:opacity-50" 
                          />
                        </div>

                        {!isOnlyWatcher && (
                          <button 
                            type="button" 
                            onClick={() => handleChecklistDelete(item.id)} 
                            className="w-4 h-4 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-gray-900 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Subtask Input Box */}
                {!isOnlyWatcher && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl border border-dashed border-gray-800/50 bg-gray-950/10 relative">
                      <span className="w-3.5 h-3.5 rounded-full border border-gray-700 flex-shrink-0" />
                      <input 
                        value={subtaskContent} 
                        onChange={e => setSubtaskContent(e.target.value)} 
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSubtask();
                          }
                        }} 
                        placeholder="Nhấn Enter để tạo tác vụ con" 
                        className="text-[11px] bg-transparent border-0 flex-1 focus:ring-0 focus:outline-none p-0 placeholder-gray-500 text-gray-200" 
                      />
                      
                      {/* Icons inside input right-aligned */}
                      <div className="flex items-center gap-1.5 text-gray-500 flex-shrink-0 relative">
                        {subtaskAssignee && (
                          <span className="text-[9px] text-blue-400 bg-blue-900/20 px-1 py-0.5 rounded-full font-medium">
                            {assigneeOptions.find(o => o.employee_id === subtaskAssignee)?.display_name.split(' ').pop()}
                          </span>
                        )}
                        {subtaskDueDate && (
                          <span className="text-[9px] text-emerald-400 bg-emerald-900/20 px-1 py-0.5 rounded-full font-medium">
                            {subtaskDueDate.split('-').slice(1).reverse().join('/')}
                          </span>
                        )}

                        {/* Calendar Toggle */}
                        <div className="relative">
                          <svg 
                            onClick={() => setShowSubtaskDatePicker(!showSubtaskDatePicker)}
                            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
                            className={`cursor-pointer hover:text-gray-300 ${showSubtaskDatePicker || subtaskDueDate ? 'text-blue-500' : ''}`}
                          >
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                          </svg>
                          
                          {showSubtaskDatePicker && (
                            <div className="absolute right-0 bottom-full mb-2 bg-gray-900 border border-gray-800 rounded-xl p-2 z-[1000] shadow-2xl">
                              <input 
                                type="date" 
                                value={subtaskDueDate} 
                                onChange={e => {
                                  setSubtaskDueDate(e.target.value);
                                  setShowSubtaskDatePicker(false);
                                }} 
                                className="bg-gray-950 border border-gray-800 rounded-lg p-1 text-[9px] text-gray-200 focus:outline-none"
                              />
                            </div>
                          )}
                        </div>

                        {/* Assignee Toggle */}
                        <div className="relative" ref={subtaskAssigneeRef}>
                          <svg 
                            onClick={() => setShowSubtaskAssignee(!showSubtaskAssignee)}
                            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
                            className={`cursor-pointer hover:text-gray-300 ${showSubtaskAssignee || subtaskAssignee ? 'text-blue-500' : ''}`}
                          >
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                          </svg>

                          {showSubtaskAssignee && (
                            <div className="absolute right-0 bottom-full mb-2 w-40 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl py-1 z-[1000] max-h-40 overflow-y-auto erp-scroll-y">
                              <div 
                                onClick={() => { setSubtaskAssignee(null); setShowSubtaskAssignee(false); }}
                                className="px-2 py-1 hover:bg-gray-800 text-[9px] text-gray-400 cursor-pointer"
                              >
                                Không gán
                              </div>
                              {assigneeOptions.map(emp => (
                                <div 
                                  key={emp.employee_id} 
                                  onClick={() => { setSubtaskAssignee(emp.employee_id); setShowSubtaskAssignee(false); }}
                                  className="px-2 py-1 hover:bg-gray-800 text-[9px] text-gray-200 cursor-pointer flex items-center gap-1"
                                >
                                  <EmployeeAvatar employeeId={emp.employee_id} size={12} showName={false} />
                                  <span className="truncate">{emp.display_name.split(' ').pop()}</span>
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

              {/* Comment Section (BÌNH LUẬN & TRAO ĐỔI) */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <label className="text-[10px] uppercase font-bold tracking-wider text-gray-500 mb-3 block">BÌNH LUẬN & TRAO ĐỔI</label>
                
                {/* Scrollable list of comments */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 erp-scroll-y">
                {(task?.comments || []).map(comm => (
                  <div key={comm.id} className="flex gap-3 items-start">
                    <EmployeeAvatar employeeId={comm.author_id} size={26} showName={false} />
                    <div className="flex-1 bg-gray-900/20 border border-gray-800/40 rounded-2xl px-4 py-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-300">
                          {assigneeOptions.find(o => o.employee_id === comm.author_id)?.display_name || comm.author_id}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {new Date(comm.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">{comm.content}</p>
                    </div>
                  </div>
                ))}
                {(task?.comments || []).length === 0 && (
                  <p className="text-xs text-gray-600 italic pl-1 text-center py-8">Chưa có bình luận nào.</p>
                )}
              </div>

              {/* Comment input row */}
              <div className="flex gap-2.5 items-start mt-auto pt-3 border-t border-gray-800/20">
                <textarea 
                  value={comment} 
                  onChange={e => setComment(e.target.value)} 
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                  placeholder="Viết nhận xét hoặc lời nhắn..." 
                  className="text-xs bg-gray-900/30 border border-gray-800 rounded-xl px-4 py-3 flex-1 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 text-gray-200 placeholder-gray-500 resize-none h-16 min-h-[40px] erp-scroll-y" 
                />
                <button 
                  onClick={handleAddComment} 
                  disabled={!comment.trim()} 
                  className="px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-all self-end"
                >
                  Gửi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

        {/* Footer Bar */}
        <div className="relative z-50 flex items-center justify-between px-7 py-5 border-t border-gray-800/30 bg-gray-950 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            {/* Attachment Button */}
            <input 
              ref={attachmentInputRef} 
              type="file" 
              multiple 
              className="hidden" 
              onChange={handleAttachmentFiles} 
            />
            <input 
              ref={editorImageInputRef} 
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={handleInlineImageSelected} 
            />
            <button 
              type="button"
              onClick={handleAttachmentPick}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-900 rounded-lg transition-all"
              title="Đính kèm tệp"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
            </button>

            {/* Vertical Divider */}
            <span className="text-gray-800">|</span>

            {/* Watchers Trigger */}
            <div className="relative" ref={watcherDropdownRef}>
              <button 
                disabled={isOnlyWatcher}
                type="button"
                onClick={() => setShowWatcherDropdown(!showWatcherDropdown)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-900 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {/* Ribbon / Bookmark Icon */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                  <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
                </svg>
                <span>Thêm người theo dõi ({form.watchers.length})</span>
              </button>

              {showWatcherDropdown && !isOnlyWatcher && (
                <div className="absolute left-0 bottom-full mb-1.5 w-60 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl py-1.5 z-[1000] max-h-56 overflow-y-auto erp-scroll-y">
                  {assigneeOptions.map(emp => {
                    const isSelected = form.watchers.includes(emp.employee_id);
                    return (
                      <div 
                        key={emp.employee_id} 
                        onClick={() => toggleWatcher(emp.employee_id)}
                        className="px-3 py-1.5 hover:bg-gray-800 text-xs text-gray-200 cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <EmployeeAvatar employeeId={emp.employee_id} size={18} showName={false} />
                          <span>{emp.display_name}</span>
                        </div>
                        {isSelected && <span className="text-blue-500">✓</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
