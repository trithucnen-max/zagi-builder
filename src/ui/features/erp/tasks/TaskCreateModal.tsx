import React, { useState, useRef, useEffect, useMemo } from 'react';
import ipc from '@/lib/ipc';
import { useAppStore } from '@/store/appStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useErpEmployeeStore } from '@/store/erp/erpEmployeeStore';
import { useErpTaskStore } from '@/store/erp/erpTaskStore';
import type { ErpTaskStatus, ErpTaskPriority, ErpTask, TaskAttachmentInput } from '../../../../models/erp';
import { EmployeeAvatar } from '../shared/ErpBadges';

interface Props {
  defaultStatus: ErpTaskStatus;
  projectId?: string;
  onClose: () => void;
  onSaved?: (task: ErpTask) => void;
}

interface SubtaskDraft {
  id: string;
  content: string;
  assignee_id: string | null;
  due_date: number | null;
  done: boolean;
}

interface AttachmentDraft {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  size: number;
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

export default function TaskCreateModal({ defaultStatus, projectId, onClose, onSaved }: Props) {
  const { showNotification } = useAppStore();
  const { employees, employeeNameMap, loadEmployees } = useEmployeeStore();
  const { profiles, loadProfiles } = useErpEmployeeStore();
  const { projects, loadProjects, createTask } = useErpTaskStore();

  // Basic Form States
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || '');
  const [status] = useState<ErpTaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<ErpTaskPriority>('normal');
  const [dueDate, setDueDate] = useState<string>('');

  // Assignees & Watchers (Subscribers)
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedWatchers, setSelectedWatchers] = useState<string[]>([]);

  // Subtasks & Attachments
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [subtaskAssignee, setSubtaskAssignee] = useState<string | null>(null);
  const [subtaskDueDate, setSubtaskDueDate] = useState<string>('');
  const [showSubtaskAssignee, setShowSubtaskAssignee] = useState(false);
  const [showSubtaskDatePicker, setShowSubtaskDatePicker] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);

  // UI Dropdown States
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showWatcherDropdown, setShowWatcherDropdown] = useState(false);
  const [showCustomDate, setShowCustomDate] = useState(false);

  // Refs for closing dropdowns and inputs
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const watcherDropdownRef = useRef<HTMLDivElement>(null);
  const subtaskAssigneeRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    loadEmployees();
    loadProfiles();
    loadProjects();
  }, []);

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

  // Employee options processing (same logic as TaskEditorDrawer)
  const employeeOptions = useMemo(() => {
    const employeeItems = (employees || []).filter(Boolean).map((emp: any) => ({
      employee_id: emp.employee_id,
      display_name: emp.display_name || employeeNameMap[emp.employee_id] || emp.employee_id,
      avatar_url: emp.avatar_url,
    }));
    const profileItems = (profiles || []).filter(Boolean).map((prof: any) => ({
      employee_id: prof.employee_id,
      display_name: prof.full_name || prof.display_name || employeeNameMap[prof.employee_id] || prof.employee_id,
      avatar_url: prof.avatar_url,
    }));
    const all = [...employeeItems, ...profileItems];
    const seen = new Set<string>();
    return all.filter(item => {
      if (!item || !item.employee_id) return false;
      if (seen.has(item.employee_id)) return false;
      seen.add(item.employee_id);
      return true;
    });
  }, [employees, profiles, employeeNameMap]);

  // Priority mapping labels
  const priorityLabels: Record<ErpTaskPriority, string> = {
    low: 'Thấp',
    normal: 'Thông thường',
    high: 'Cao',
    urgent: 'Khẩn cấp',
  };

  // Due Date preset helper
  const setDueDatePreset = (preset: 'today' | 'tomorrow' | 'clear') => {
    if (preset === 'clear') {
      setDueDate('');
      setShowCustomDate(false);
      return;
    }
    const date = new Date();
    if (preset === 'tomorrow') {
      date.setDate(date.getDate() + 1);
    }
    // Set to 18:00 (6:00 PM) as default time
    date.setHours(18, 0, 0, 0);
    const offset = date.getTimezoneOffset() * 60000;
    const localISOTime = new Date(date.getTime() - offset).toISOString().slice(0, 16);
    setDueDate(localISOTime);
    setShowCustomDate(false);
  };

  // Subtasks Handlers
  const handleAddSubtask = () => {
    if (!subtaskInput.trim()) return;
    const newSub: SubtaskDraft = {
      id: `temp-${Date.now()}-${Math.random()}`,
      content: subtaskInput.trim(),
      assignee_id: subtaskAssignee,
      due_date: subtaskDueDate ? new Date(subtaskDueDate).getTime() : null,
      done: false,
    };
    setSubtasks(prev => [...prev, newSub]);
    setSubtaskInput('');
    setSubtaskAssignee(null);
    setSubtaskDueDate('');
    setShowSubtaskAssignee(false);
    setShowSubtaskDatePicker(false);
  };

  const handleToggleSubtask = (id: string) => {
    setSubtasks(prev => prev.map(sub => sub.id === id ? { ...sub, done: !sub.done } : sub));
  };

  const handleDeleteSubtask = (id: string) => {
    setSubtasks(prev => prev.filter(sub => sub.id !== id));
  };

  // Subtask statistics
  const subtasksTotal = subtasks.length;
  const subtasksDone = subtasks.filter(s => s.done).length;
  const progressPercent = subtasksTotal > 0 ? Math.round((subtasksDone / subtasksTotal) * 100) : 0;

  // Attachment Handlers
  const handleAttachmentPick = () => {
    attachmentInputRef.current?.click();
  };

  const handleAttachmentFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const nextDrafts = files.map((file, index) => ({
      id: `new-${Date.now()}-${index}`,
      file_name: file.name,
      file_path: (file as any).path || file.name,
      mime_type: file.type,
      size: file.size,
    } satisfies AttachmentDraft));
    setAttachments(current => [...current, ...nextDrafts]);
    event.target.value = '';
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(current => current.filter(item => item.id !== id));
  };

  // Submit Handler with Double-Save Protection
  const handleCreate = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || savingRef.current) return;
    savingRef.current = true;

    try {
      const attachmentPayload = attachments.map(({ file_name, file_path, mime_type, size }) => ({ file_name, file_path, mime_type, size }));
      const created = await createTask({
        title: trimmedTitle,
        description: description.trim(),
        project_id: selectedProjectId || undefined,
        status,
        priority,
        due_date: dueDate ? new Date(dueDate).getTime() : undefined,
        assignees: selectedAssignees,
        watchers: selectedWatchers,
        attachments: attachmentPayload,
      });

      if (created) {
        // Add subtasks
        for (const sub of subtasks) {
          await ipc.erp?.taskAddChecklist({
            taskId: created.id,
            content: sub.content,
            assigneeId: sub.assignee_id,
            dueDate: sub.due_date,
          });
        }
        showNotification('Đã tạo nhiệm vụ thành công', 'success');
        onSaved?.(created);
        onClose();
      }
    } catch (err: any) {
      showNotification(err.message || 'Lỗi khi tạo nhiệm vụ', 'error');
    } finally {
      savingRef.current = false;
    }
  };

  // Get current assignee's metadata for display
  const currentAssignee = useMemo(() => {
    if (selectedAssignees.length === 0) return null;
    const primaryId = selectedAssignees[0];
    return employeeOptions.find(opt => opt.employee_id === primaryId) || { employee_id: primaryId, display_name: primaryId, avatar_url: undefined };
  }, [selectedAssignees, employeeOptions]);

  // Project display details
  const currentProjectDisplay = useMemo(() => {
    if (!selectedProjectId) return { icon: '💼', cleanName: 'Chọn dự án...', color: '#64748b' };
    const found = projects.find(p => p && p.id === selectedProjectId);
    if (found) {
      const { icon, cleanName } = getProjectDisplay(found.name);
      return { icon, cleanName, color: found.color || '#3b82f6' };
    }
    return { icon: '📁', cleanName: 'Không thuộc dự án', color: '#64748b' };
  }, [selectedProjectId, projects]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
      <div 
        className="w-full max-w-[620px] bg-gray-950 border border-gray-800/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-gray-200 animate-fade-in mx-4" 
        onClick={e => e.stopPropagation()}
      >
        {/* Header Close */}
        <div className="flex justify-end p-3 flex-shrink-0">
          <button 
            type="button" 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-900 rounded-lg transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Modal Scroll Content */}
        <div className="flex-1 overflow-y-auto px-7 pb-6 space-y-5 max-h-[75vh] erp-scroll-y">
          
          {/* Title Input */}
          <div>
            <input 
              autoFocus 
              type="text"
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              onKeyDown={e => {
                if (e.key === 'Enter' && title.trim()) {
                  handleCreate();
                }
              }}
              placeholder="Nhấn Enter để thêm nhiệm vụ" 
              className="w-full bg-transparent border-0 py-1 text-lg text-gray-100 font-semibold focus:ring-0 focus:outline-none placeholder-gray-500"
            />
          </div>

          {/* Metadata Row: Assignee & Priority */}
          <div className="flex items-center gap-3 text-sm text-gray-400 border-t border-gray-800/30 pt-4">
            {/* User Icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>

            {/* Assignee Selector */}
            <div className="relative" ref={assigneeDropdownRef}>
              <button 
                type="button"
                onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)} 
                className="flex items-center gap-2 hover:text-gray-100 py-1 px-2 rounded-lg hover:bg-gray-900/60 transition-colors"
              >
                {selectedAssignees.length > 0 ? (
                  <div className="flex items-center -space-x-1.5 overflow-hidden">
                    {selectedAssignees.map(id => (
                      <EmployeeAvatar key={id} employeeId={id} size={18} showName={false} />
                    ))}
                    <span className="text-gray-200 font-medium ml-2">
                      {selectedAssignees.length === 1 
                        ? (employeeOptions.find(o => o.employee_id === selectedAssignees[0])?.display_name || selectedAssignees[0])
                        : `${selectedAssignees.length} người thực hiện`}
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-400">Chọn người thực hiện</span>
                )}
              </button>

              {showAssigneeDropdown && (
                <div className="absolute left-0 mt-1.5 w-60 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl py-1.5 z-[1000] max-h-56 overflow-y-auto erp-scroll-y">
                  <div 
                    onClick={() => { setSelectedAssignees([]); }}
                    className="px-3 py-1.5 hover:bg-gray-800 text-xs text-gray-400 cursor-pointer flex items-center justify-between"
                  >
                    <span>Không gán ai</span>
                    {selectedAssignees.length === 0 && <span className="text-blue-500 font-bold">✓</span>}
                  </div>
                  {employeeOptions.map(emp => {
                    const isSelected = selectedAssignees.includes(emp.employee_id);
                    return (
                      <div 
                        key={emp.employee_id} 
                        onClick={() => {
                          setSelectedAssignees(prev => 
                            isSelected 
                              ? prev.filter(id => id !== emp.employee_id) 
                              : [...prev, emp.employee_id]
                          );
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
                type="button"
                onClick={() => setShowPriorityDropdown(!showPriorityDropdown)} 
                className="flex items-center gap-1.5 hover:text-gray-100 py-1 px-2 rounded-lg hover:bg-gray-900/60 transition-colors"
              >
                <span className="text-gray-200 font-medium">{priorityLabels[priority]}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>

              {showPriorityDropdown && (
                <div className="absolute left-0 mt-1.5 w-36 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl py-1.5 z-[1000]">
                  {(['low', 'normal', 'high', 'urgent'] as ErpTaskPriority[]).map(p => (
                    <div 
                      key={p} 
                      onClick={() => { setPriority(p); setShowPriorityDropdown(false); }}
                      className="px-3 py-1.5 hover:bg-gray-800 text-xs text-gray-200 cursor-pointer"
                    >
                      {priorityLabels[p]}
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
                type="button" 
                onClick={() => setDueDatePreset('today')}
                className="flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-blue-900/30 text-blue-400 border border-blue-500/40 hover:bg-blue-900/50 transition-colors"
              >
                <span>📅</span> Hôm nay
              </button>

              <button 
                type="button" 
                onClick={() => setDueDatePreset('tomorrow')}
                className="flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-green-900/30 text-green-400 border border-green-600/40 hover:bg-green-900/50 transition-colors"
              >
                <span>➔</span> Ngày mai
              </button>

              <button 
                type="button" 
                onClick={() => setShowCustomDate(!showCustomDate)}
                className="flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-gray-900 text-gray-300 border border-gray-800 hover:bg-gray-800 transition-colors"
              >
                <span>📅</span> Khác
              </button>

              {dueDate && (
                <button 
                  type="button" 
                  onClick={() => setDueDatePreset('clear')}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors pl-1"
                >
                  Xoá ngày
                </button>
              )}
            </div>

            {/* Display Selected Due Date */}
            {dueDate && !showCustomDate && (
              <span className="text-xs text-gray-300 font-medium">
                {new Date(dueDate).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
              </span>
            )}
          </div>

          {/* Custom Date Input Panel */}
          {showCustomDate && (
            <div className="pl-7">
              <input 
                type="datetime-local" 
                value={dueDate} 
                onChange={e => setDueDate(e.target.value)} 
                className="bg-gray-900 border border-gray-850 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500 focus:ring-0"
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
                type="button"
                onClick={() => setShowProjectDropdown(!showProjectDropdown)} 
                className="hover:text-gray-100 py-1 px-2 -ml-2 rounded-lg hover:bg-gray-900/60 transition-colors inline-flex items-center gap-1.5 text-gray-300 text-xs font-medium"
              >
                {renderProjectIcon(currentProjectDisplay.icon)}
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: currentProjectDisplay.color }} />
                <span className="truncate">{currentProjectDisplay.cleanName}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 flex-shrink-0">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>

              {showProjectDropdown && (
                <div className="absolute left-0 mt-1.5 w-64 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl py-1.5 z-[1000] max-h-56 overflow-y-auto erp-scroll-y">
                  <div 
                    onClick={() => { setSelectedProjectId(''); setShowProjectDropdown(false); }}
                    className="px-3 py-1.5 hover:bg-gray-800 text-xs text-gray-400 cursor-pointer flex items-center gap-2"
                  >
                    <span className="text-sm">💼</span>
                    <span className="w-2 h-2 rounded-full bg-gray-650" />
                    <span>Không thuộc dự án</span>
                  </div>
                  {projects.map(proj => {
                    if (!proj) return null;
                    const { icon, cleanName } = getProjectDisplay(proj.name);
                    return (
                      <div 
                        key={proj.id} 
                        onClick={() => { setSelectedProjectId(proj.id); setShowProjectDropdown(false); }}
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

          {/* Description Textarea */}
          <div className="flex items-start gap-3 text-sm text-gray-400">
            {/* Document Lines Icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 mt-1.5 flex-shrink-0">
              <line x1="21" y1="10" x2="3" y2="10"></line>
              <line x1="21" y1="6" x2="3" y2="6"></line>
              <line x1="21" y1="14" x2="3" y2="14"></line>
              <line x1="21" y1="18" x2="3" y2="18"></line>
            </svg>

            <textarea 
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Thêm mô tả" 
              className="w-full bg-transparent border-0 py-1.5 text-xs text-gray-300 placeholder-gray-500 focus:ring-0 focus:outline-none resize-none h-16 min-h-[40px] erp-scroll-y"
            />
          </div>

          {/* Checklist / Subtasks Section */}
          <div className="border-t border-gray-800/30 pt-5 space-y-3.5">
            <div className="flex items-center gap-3 text-sm text-gray-400">
              {/* Branch / Checklist Icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                <line x1="6" y1="3" x2="6" y2="15"></line>
                <circle cx="18" cy="6" r="3"></circle>
                <circle cx="6" cy="18" r="3"></circle>
                <path d="M18 9a9 9 0 0 1-9 9"></path>
              </svg>

              {/* Progress Indicator */}
              <div className="flex items-center gap-3 flex-1">
                <span className="text-xs font-semibold text-gray-400">{subtasksDone}/{subtasksTotal}</span>
                {subtasksTotal > 0 && (
                  <div className="w-32 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-900 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400">{progressPercent}%</span>
                  </div>
                )}
              </div>
            </div>

            {/* Checklist items list */}
            {subtasks.length > 0 && (
              <div className="pl-7 space-y-2">
                {subtasks.map(sub => (
                  <div key={sub.id} className="group flex items-center gap-3 px-3 py-1.5 rounded-xl bg-gray-900/10 border border-gray-800/30 hover:border-gray-800 transition-all">
                    <input 
                      type="checkbox" 
                      checked={sub.done} 
                      onChange={() => handleToggleSubtask(sub.id)} 
                      className="w-4 h-4 rounded border-gray-700 text-blue-600 focus:ring-0 bg-transparent cursor-pointer"
                    />
                    <span className={`text-xs flex-1 min-w-0 truncate ${sub.done ? 'line-through text-gray-500 opacity-50' : 'text-gray-300'}`}>
                      {sub.content}
                    </span>
                    
                    {/* Subtask Assignee and Date Selectors */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select 
                        value={sub.assignee_id || ''} 
                        onChange={e => {
                          const val = e.target.value || null;
                          setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, assignee_id: val } : s));
                        }} 
                        className="bg-transparent border-0 text-[10px] text-gray-400 hover:text-gray-200 cursor-pointer focus:outline-none w-20 truncate"
                      >
                        <option value="" className="bg-gray-900 text-gray-500">Chưa gán</option>
                        {employeeOptions.map(opt => <option key={opt.employee_id} value={opt.employee_id} className="bg-gray-900 text-gray-300">{opt.display_name}</option>)}
                      </select>
                      <input 
                        type="date" 
                        value={sub.due_date ? new Date(sub.due_date).toISOString().split('T')[0] : ''} 
                        onChange={e => {
                          const val = e.target.value ? new Date(e.target.value).getTime() : null;
                          setSubtasks(prev => prev.map(s => s.id === sub.id ? { ...s, due_date: val } : s));
                        }} 
                        className="bg-transparent border-0 text-[10px] text-gray-400 hover:text-gray-200 cursor-pointer focus:outline-none w-24 text-right" 
                      />
                    </div>

                    <button 
                      type="button" 
                      onClick={() => handleDeleteSubtask(sub.id)} 
                      className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-gray-900 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Subtask Input Box */}
            <div className="pl-7 space-y-2">
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-dashed border-gray-800/50 bg-gray-950/10 relative">
                <span className="w-4 h-4 rounded-full border border-gray-700 flex-shrink-0" />
                <input 
                  value={subtaskInput} 
                  onChange={e => setSubtaskInput(e.target.value)} 
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSubtask();
                    }
                  }} 
                  placeholder="Nhấn Enter để tạo tác vụ con" 
                  className="text-xs bg-transparent border-0 flex-1 focus:ring-0 focus:outline-none p-0 placeholder-gray-500 text-gray-200" 
                />
                
                {/* Icons inside input right-aligned */}
                <div className="flex items-center gap-2 text-gray-500 flex-shrink-0 relative">
                  {/* Selected assignee indicator */}
                  {subtaskAssignee && (
                    <span className="text-[10px] text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded-full font-medium">
                      {employeeOptions.find(o => o.employee_id === subtaskAssignee)?.display_name.split(' ').pop()}
                    </span>
                  )}
                  {/* Selected date indicator */}
                  {subtaskDueDate && (
                    <span className="text-[10px] text-emerald-400 bg-emerald-900/20 px-1.5 py-0.5 rounded-full font-medium">
                      {subtaskDueDate.split('-').slice(1).reverse().join('/')}
                    </span>
                  )}

                  {/* Calendar Toggle */}
                  <div className="relative">
                    <svg 
                      onClick={() => setShowSubtaskDatePicker(!showSubtaskDatePicker)}
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
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
                          className="bg-gray-950 border border-gray-800 rounded-lg p-1.5 text-[10px] text-gray-200 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Assignee Toggle */}
                  <div className="relative" ref={subtaskAssigneeRef}>
                    <svg 
                      onClick={() => setShowSubtaskAssignee(!showSubtaskAssignee)}
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
                      className={`cursor-pointer hover:text-gray-300 ${showSubtaskAssignee || subtaskAssignee ? 'text-blue-500' : ''}`}
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <line x1="19" y1="8" x2="19" y2="14" />
                      <line x1="22" y1="11" x2="16" y2="11" />
                    </svg>

                    {showSubtaskAssignee && (
                      <div className="absolute right-0 bottom-full mb-2 w-48 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl py-1.5 z-[1000] max-h-40 overflow-y-auto erp-scroll-y">
                        <div 
                          onClick={() => { setSubtaskAssignee(null); setShowSubtaskAssignee(false); }}
                          className="px-2.5 py-1 hover:bg-gray-800 text-[10px] text-gray-400 cursor-pointer"
                        >
                          Không gán
                        </div>
                        {employeeOptions.map(emp => (
                          <div 
                            key={emp.employee_id} 
                            onClick={() => { setSubtaskAssignee(emp.employee_id); setShowSubtaskAssignee(false); }}
                            className="px-2.5 py-1 hover:bg-gray-800 text-[10px] text-gray-200 cursor-pointer flex items-center gap-1.5"
                          >
                            <EmployeeAvatar employeeId={emp.employee_id} size={14} showName={false} />
                            <span className="truncate">{emp.display_name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Add subtask button */}
              <button 
                type="button"
                onClick={handleAddSubtask}
                className="text-xs text-gray-400 hover:text-gray-100 flex items-center gap-1.5 py-1 px-2 hover:bg-gray-900 rounded-lg transition-colors font-medium"
              >
                <span>+</span> Thêm tác vụ con
              </button>
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
                    <button 
                      type="button" 
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="text-xs text-gray-500 hover:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

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

            {/* Watchers (Subscribers) Trigger */}
            <div className="relative" ref={watcherDropdownRef}>
              <button 
                type="button"
                onClick={() => setShowWatcherDropdown(!showWatcherDropdown)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-900 rounded-lg transition-all"
              >
                {/* Ribbon / Bookmark Icon */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                  <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
                </svg>
                <span>Thêm người theo dõi ({selectedWatchers.length})</span>
              </button>

              {showWatcherDropdown && (
                <div className="absolute left-0 bottom-full mb-1.5 w-60 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl py-1.5 z-[1000] max-h-56 overflow-y-auto erp-scroll-y">
                  {employeeOptions.map(emp => {
                    const isSelected = selectedWatchers.includes(emp.employee_id);
                    return (
                      <div 
                        key={emp.employee_id} 
                        onClick={() => {
                          if (isSelected) {
                            setSelectedWatchers(prev => prev.filter(id => id !== emp.employee_id));
                          } else {
                            setSelectedWatchers(prev => [...prev, emp.employee_id]);
                          }
                        }}
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

          <div className="flex items-center gap-2">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4.5 py-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-900 rounded-xl text-xs font-semibold transition-all"
            >
              Hủy
            </button>
            <button 
              type="button" 
              onClick={handleCreate} 
              disabled={!title.trim() || savingRef.current} 
              className="px-5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white text-xs font-semibold rounded-xl transition-all shadow-lg"
            >
              Tạo
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
