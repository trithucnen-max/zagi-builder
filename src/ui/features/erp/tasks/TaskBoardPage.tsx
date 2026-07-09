import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useErpTaskStore } from '@/store/erp/erpTaskStore';
import { useErpEmployeeStore } from '@/store/erp/erpEmployeeStore';
import { useEmployeeStore } from '@/store/employeeStore';
import TaskEditorDrawer from './TaskEditorDrawer';
import TaskCreateModal from './TaskCreateModal';
import { ConfirmDialog, ErpModalCard, ErpOverlay, PromptDialog } from '../shared/ErpDialogs';
import { ERP_DATE_FILTER_OPTIONS, getDefaultCustomRange, resolveErpDateRange, type ErpDateFilterPreset } from '../shared/erpDateFilters';
import { EmployeeAvatar, RichContentPreview } from '../shared/ErpBadges';
import type { ErpTask, ErpTaskPriority, ErpTaskStatus } from '../../../../models/erp';
import AppIcon from '@/components/common/AppIcon';

const STATUS_COLS: { 
  id: ErpTaskStatus; 
  label: string; 
  color: string; 
  textColor: string;
  badgeColor: string;
  borderHeaderColor: string;
}[] = [
  { 
    id: 'todo',      
    label: 'Cần làm',    
    color: 'bg-blue-50/70 border-blue-100/80 dark:bg-blue-950/15 dark:border-blue-900/20',
    textColor: 'text-blue-900 dark:text-blue-200',
    badgeColor: 'bg-blue-100 text-blue-800 border border-blue-200/55 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800/30',
    borderHeaderColor: 'border-blue-100/40 dark:border-blue-900/10'
  },
  { 
    id: 'doing',     
    label: 'Đang làm',   
    color: 'bg-sky-50/70 border-sky-100/80 dark:bg-sky-950/15 dark:border-sky-900/20',
    textColor: 'text-sky-900 dark:text-sky-200',
    badgeColor: 'bg-sky-100 text-sky-800 border border-sky-200/55 dark:bg-sky-900/50 dark:text-sky-300 dark:border-sky-800/30',
    borderHeaderColor: 'border-sky-100/40 dark:border-sky-900/10'
  },
  { 
    id: 'review',    
    label: 'Xem xét',    
    color: 'bg-amber-50/70 border-amber-100/80 dark:bg-amber-950/15 dark:border-amber-900/20',
    textColor: 'text-amber-900 dark:text-amber-200',
    badgeColor: 'bg-amber-100 text-amber-800 border border-amber-200/55 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800/30',
    borderHeaderColor: 'border-amber-100/40 dark:border-amber-900/10'
  },
  { 
    id: 'done',      
    label: 'Hoàn thành', 
    color: 'bg-green-50/70 border-green-100/80 dark:bg-green-950/15 dark:border-green-900/20',
    textColor: 'text-green-900 dark:text-green-200',
    badgeColor: 'bg-green-100 text-green-800 border border-green-200/55 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800/30',
    borderHeaderColor: 'border-green-100/40 dark:border-green-900/10'
  },
  { 
    id: 'cancelled', 
    label: 'Huỷ',        
    color: 'bg-red-50/70 border-red-100/80 dark:bg-red-950/15 dark:border-red-900/20',
    textColor: 'text-red-900 dark:text-red-200',
    badgeColor: 'bg-red-100 text-red-800 border border-red-200/55 dark:bg-red-900/50 dark:text-red-300 dark:border-red-800/30',
    borderHeaderColor: 'border-red-100/40 dark:border-red-900/10'
  },
];

// Priority badge: dùng opacity-based để hoạt động đúng cả dark & light theme
const PRIORITY_META: Record<string, { color: string; label: string; icon: 'alert_circle' | 'zap' | 'alert_triangle' | 'x' }> = {
  low:    { color: 'text-gray-400 bg-gray-800/40 border border-gray-700/60',         label: 'Thấp',      icon: 'alert_circle' },
  normal: { color: 'text-blue-300 bg-blue-500/20 border border-blue-500/30',          label: 'Bình thường', icon: 'zap' },
  high:   { color: 'text-orange-300 bg-orange-500/20 border border-orange-500/30',    label: 'Cao',       icon: 'alert_triangle' },
  urgent: { color: 'text-red-300 bg-red-500/20 border border-red-500/30',             label: 'Khẩn cấp', icon: 'alert_circle' },
};

const STATUS_LABELS: Record<ErpTaskStatus, string> = {
  todo: 'Cần làm',
  doing: 'Đang làm',
  review: 'Xem xét',
  done: 'Hoàn thành',
  cancelled: 'Huỷ',
};

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
  const iconSvg = PROJECT_ICONS[iconKey];
  if (iconSvg) {
    return React.cloneElement(iconSvg as React.ReactElement, {
      className: 'w-3.5 h-3.5 flex-shrink-0 text-white-important'
    });
  }
  return React.cloneElement(PROJECT_ICONS.folder as React.ReactElement, {
    className: 'w-3.5 h-3.5 flex-shrink-0 text-white-important'
  });
};

const renderHeaderProjectIcon = (iconKey: string) => {
  const iconSvg = PROJECT_ICONS[iconKey];
  if (iconSvg) {
    return React.cloneElement(iconSvg as React.ReactElement, {
      className: 'w-4 h-4 text-gray-300 flex-shrink-0'
    });
  }
  return <span className="text-base">{iconKey}</span>;
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

export default function TaskBoardPage() {
  const { projects, archivedProjects, tasks, loadProjects, loadArchivedProjects, loadTasks, createProject, updateProject, deleteProject, activeProjectId, setActiveProject, updateTaskStatus, deleteTask } = useErpTaskStore();
  const { employees, loadEmployees } = useEmployeeStore();
  const loadProfiles = useErpEmployeeStore(s => s.loadProfiles);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ErpTaskStatus | null>(null);
  const [editorState, setEditorState] = useState<{ taskId?: string | null; status?: ErpTaskStatus } | null>(null);
  const [newProjectModal, setNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectIcon, setNewProjectIcon] = useState('folder');
  const [newProjectColor, setNewProjectColor] = useState('#0068FF');
  const creatingProjectRef = useRef(false);
  const [priorityFilter, setPriorityFilter] = useState<'' | ErpTaskPriority>('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState<'' | ErpDateFilterPreset>('');
  const [customDateRange, setCustomDateRange] = useState(() => getDefaultCustomRange());
  const [deleteTarget, setDeleteTarget] = useState<ErpTask | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<{ task: ErpTask } | null>(null);
  const [projectDeleteConfirm, setProjectDeleteConfirm] = useState<string | null>(null);
  const [projectArchiveConfirm, setProjectArchiveConfirm] = useState<string | null>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  
  // Mặc định ở chế độ Kanban
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');

  useEffect(() => { loadProjects(); loadArchivedProjects(); loadEmployees(); loadProfiles(); }, []);
  useEffect(() => {
    const resolvedDateRange = dateFilter ? resolveErpDateRange(dateFilter, customDateRange) : null;
    if (dateFilter === 'custom' && !resolvedDateRange) return;
    const isArchivedProject = activeProjectId ? (archivedProjects || []).some(p => p && p.id === activeProjectId) : false;
    const nextFilter = { archived: isArchivedProject } as {
      archived: boolean;
      projectId?: string;
      assigneeId?: string;
      priority?: ErpTaskPriority;
      dueRange?: [number, number];
    };
    if (activeProjectId) nextFilter.projectId = activeProjectId;
    if (assigneeFilter) nextFilter.assigneeId = assigneeFilter;
    if (priorityFilter) nextFilter.priority = priorityFilter;
    if (resolvedDateRange) nextFilter.dueRange = [resolvedDateRange.from, resolvedDateRange.to];
    loadTasks(nextFilter);
  }, [activeProjectId, assigneeFilter, customDateRange, dateFilter, priorityFilter, archivedProjects]);

  const handleCreateProject = async () => {
    const trimmed = newProjectName.trim();
    if (!trimmed || creatingProjectRef.current) return;
    creatingProjectRef.current = true;
    try {
      const fullName = `[${newProjectIcon}] ${trimmed}`;
      const project = await createProject({ name: fullName, color: newProjectColor });
      if (project) setActiveProject(project.id);
      setNewProjectName('');
      setNewProjectIcon('folder');
      setNewProjectColor('#0068FF');
      setNewProjectModal(false);
    } finally {
      creatingProjectRef.current = false;
    }
  };

  const handleBoardWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!boardScrollRef.current) return;
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const target = e.target as HTMLElement;
    const col = target.closest('[data-erp-col-body]') as HTMLElement | null;
    if (col && col.scrollHeight > col.clientHeight) return;
    boardScrollRef.current.scrollTo({ left: boardScrollRef.current.scrollLeft + e.deltaY });
  };

  const allTasks = Object.values(tasks || {}).filter(Boolean);
  const projectTasks = activeProjectId
    ? allTasks.filter(t => t && t.project_id === activeProjectId)
    : allTasks;

  const tasksByStatus = (status: ErpTaskStatus) =>
    projectTasks.filter(t => t && t.status === status).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const handleDrop = (status: ErpTaskStatus) => {
    if (draggingTaskId) {
      const dragged = allTasks.find(t => t.id === draggingTaskId);
      if (dragged && status === 'cancelled' && dragged.status !== 'cancelled') {
        setCancelConfirm({ task: dragged });
        setDraggingTaskId(null);
        setDragOverCol(null);
        return;
      }
      updateTaskStatus(draggingTaskId, status);
    }
    setDraggingTaskId(null);
    setDragOverCol(null);
  };

  // Group tasks for List View by Priority — dùng opacity-based để tương thích dark/light
  const priorityGroups: { id: ErpTaskPriority; label: string; color: string }[] = [
    { id: 'urgent', label: 'Khẩn cấp',    color: 'text-red-300 border-red-500/30 bg-red-500/10' },
    { id: 'high',   label: 'Ưu tiên cao', color: 'text-orange-300 border-orange-500/30 bg-orange-500/10' },
    { id: 'normal', label: 'Thông thường', color: 'text-blue-300 border-blue-500/30 bg-blue-500/10' },
    { id: 'low',    label: 'Thấp',         color: 'text-gray-400 border-gray-700/60 bg-gray-800/40' },
  ];

  const tasksByPriority = (priority: ErpTaskPriority) =>
    projectTasks.filter(t => t.priority === priority);

  const { activeProjIcon, activeProjName } = useMemo(() => {
    if (!activeProjectId) return { activeProjIcon: '💼', activeProjName: 'Tất cả dự án' };
    const found = (projects || []).find(p => p && p.id === activeProjectId) || (archivedProjects || []).find(p => p && p.id === activeProjectId);
    if (found) {
      const { icon, cleanName } = getProjectDisplay(found.name);
      return { activeProjIcon: icon, activeProjName: cleanName + (found.status === 'archived' ? ' (Đã lưu trữ)' : '') };
    }
    return { activeProjIcon: '💼', activeProjName: 'Tất cả dự án' };
  }, [activeProjectId, projects, archivedProjects]);

  return (
    <div className="flex h-full overflow-hidden bg-gray-900 text-gray-100">
      
      {/* ── Sidebar Dự án bên trái (Chữ đen, nền trắng, viền xám) ──────── */}
      <div className="w-60 bg-gray-950 border-r border-gray-800 p-4 space-y-4 flex-shrink-0 flex flex-col h-full">
        <div className="flex items-center justify-between px-2 flex-shrink-0">
          <span className="text-xs font-bold text-gray-400 tracking-wider uppercase">Dự án</span>
          <button
            onClick={() => setNewProjectModal(true)}
            className="w-6 h-6 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-100 transition-colors"
            title="Tạo dự án mới"
          >
            +
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 erp-scroll-y pr-1">
          <button
            onClick={() => setActiveProject(null)}
            className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all ${
              activeProjectId === null
                ? 'bg-gray-800 border border-gray-700/80 text-white font-semibold shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/30'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-blue-500 flex-shrink-0">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
              </svg>
              <span className="truncate">Tất cả dự án</span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-gray-900 text-gray-400 border border-gray-800`}>
              {allTasks.length}
            </span>
          </button>

          {(projects || []).map(project => {
            if (!project) return null;
            const count = allTasks.filter(t => t.project_id === project.id).length;
            const isSelected = activeProjectId === project.id;
            const { icon, cleanName } = getProjectDisplay(project.name);
            return (
              <button
                key={project.id}
                onClick={() => setActiveProject(project.id)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all ${
                  isSelected
                    ? 'bg-gray-800 border border-gray-700/80 text-white font-semibold shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/30'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: project.color || '#3b82f6' }} />
                  <span className="truncate">{cleanName}</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-gray-900 text-gray-400 border border-gray-800`}>
                  {count}
                </span>
              </button>
            );
          })}

          {/* Archived Projects Section */}
          {(archivedProjects || []).length > 0 && (
            <div className="pt-3 border-t border-gray-850 mt-3 space-y-1">
              <div className="px-2 pb-1 text-[9px] font-bold text-gray-500 uppercase tracking-wider">Dự án đã lưu trữ</div>
              {(archivedProjects || []).map(project => {
                if (!project || !project.name) return null;
                const count = allTasks.filter(t => t.project_id === project.id).length;
                const isSelected = activeProjectId === project.id;
                const { icon, cleanName } = getProjectDisplay(project.name);
                return (
                  <button
                    key={project.id}
                    onClick={() => setActiveProject(project.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-gray-800 border border-gray-700/80 text-white font-semibold shadow-sm'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 opacity-50" style={{ backgroundColor: project.color || '#64748b' }} />
                      <span className="truncate line-through text-gray-500">{cleanName}</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-gray-900 text-gray-500 border border-gray-800`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Vùng nội dung chính bên phải (Chữ đen, nền trắng, viền xám) ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Header Tab View (Danh sách / Kanban) */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800/60 flex-shrink-0 bg-gray-950">
          <div className="min-w-0 flex items-center gap-4">
            <h2 className="text-sm font-semibold text-gray-100 truncate flex items-center gap-2">
              {renderHeaderProjectIcon(activeProjIcon)} {activeProjName}
            </h2>
            {activeProjectId && (
              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                <button
                  onClick={() => setProjectArchiveConfirm(activeProjectId)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all border border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-gray-100 shadow-sm"
                  title="Kết thúc dự án và lưu trữ"
                >
                  <AppIcon name="check" size={12} />
                  <span>Kết thúc</span>
                </button>
                <button
                  onClick={() => setProjectDeleteConfirm(activeProjectId)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all border border-red-950 bg-gray-950 text-red-400 hover:bg-red-950/30 hover:text-red-300 shadow-sm"
                  title="Xoá dự án khi làm sai"
                >
                  <AppIcon name="trash" size={12} />
                  <span>Xoá</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex bg-gray-900 p-0.5 rounded-xl border border-gray-800">
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'list'
                  ? 'bg-gray-950 text-gray-100 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <AppIcon name={"list" as any} size={13} /> Danh sách
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'kanban'
                  ? 'bg-gray-950 text-gray-100 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <AppIcon name={"grid" as any} size={13} /> Kanban
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex items-center gap-3 px-5 py-2 border-b border-gray-800/40 flex-shrink-0 flex-wrap bg-gray-900/50">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            
            <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="appearance-none min-w-[150px] bg-gray-900 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 cursor-pointer">
              <option value="" className="bg-gray-950">Tất cả nhân viên</option>
              <option value="boss" className="bg-gray-950">Boss</option>
              {employees.map((employee: any) => <option key={employee.employee_id} value={employee.employee_id} className="bg-gray-950">{employee.display_name}</option>)}
            </select>

            <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as '' | ErpTaskPriority)} className="appearance-none min-w-[140px] bg-gray-900 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 cursor-pointer">
              <option value="" className="bg-gray-950">Mọi mức ưu tiên</option>
              <option value="low" className="bg-gray-950">Thấp</option>
              <option value="normal" className="bg-gray-950">Bình thường</option>
              <option value="high" className="bg-gray-950">Cao</option>
              <option value="urgent" className="bg-gray-950">Khẩn cấp</option>
            </select>

            <select value={dateFilter} onChange={e => setDateFilter(e.target.value as '' | ErpDateFilterPreset)} className="appearance-none min-w-[150px] bg-gray-900 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 cursor-pointer">
              <option value="" className="bg-gray-950">Tất cả hạn chót</option>
              {ERP_DATE_FILTER_OPTIONS.map(option => <option key={option.id} value={option.id} className="bg-gray-950">{option.label}</option>)}
            </select>

            {dateFilter === 'custom' && (
              <>
                <input
                  type="date"
                  value={customDateRange.from}
                  onChange={e => setCustomDateRange(current => ({ ...current, from: e.target.value }))}
                  className="bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-200"
                />
                <input
                  type="date"
                  value={customDateRange.to}
                  onChange={e => setCustomDateRange(current => ({ ...current, to: e.target.value }))}
                  className="bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-200"
                />
              </>
            )}

            {(assigneeFilter || priorityFilter || dateFilter) && (
              <button
                type="button"
                onClick={() => {
                  setAssigneeFilter('');
                  setPriorityFilter('');
                  setDateFilter('');
                  setCustomDateRange(getDefaultCustomRange());
                }}
                className="px-3 py-1.5 rounded-xl text-xs text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
              >
                Xóa lọc
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditorState({ status: 'todo' })}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-all flex items-center gap-1"
            >
              + Tạo task
            </button>
          </div>
        </div>

        {/* ── View Area ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'list' ? (
            
            /* ── VIEW DANH SÁCH (LIST VIEW) ────────────────────────────────── */
            <div className="h-full overflow-y-auto p-5 space-y-6 erp-scroll-y">
              {priorityGroups.map(group => {
                const groupTasks = tasksByPriority(group.id);
                if (groupTasks.length === 0) return null;

                return (
                  <div key={group.id} className="space-y-2.5">
                    {/* Header Group */}
                    <div className="flex items-center gap-2 px-1">
                      <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md border ${group.color}`}>
                        {group.label}
                      </span>
                      <span className="text-[11px] text-gray-400 font-medium">({groupTasks.length})</span>
                    </div>

                    {/* Danh sách Task */}
                    <div className="bg-gray-950/20 rounded-2xl border border-gray-800/40 divide-y divide-gray-800/30 overflow-hidden shadow-sm">
                      {groupTasks.map(task => {
                        const isCompleted = task.status === 'done';
                        return (
                          <div
                            key={task.id}
                            onClick={() => setEditorState({ taskId: task.id })}
                            className="group flex items-center gap-4 px-4 py-3.5 hover:bg-gray-800/35 cursor-pointer transition-colors"
                          >
                            {/* Checkbox hoàn thành */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateTaskStatus(task.id, isCompleted ? 'todo' : 'done');
                              }}
                              className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center border transition-all ${
                                isCompleted
                                  ? 'bg-blue-600 border-blue-500 text-white'
                                  : 'border-gray-600 hover:border-blue-500 text-transparent hover:text-blue-500'
                              }`}
                            >
                              ✓
                            </button>

                            {/* Tiêu đề */}
                            <div className="flex-1 min-w-0">
                              <span className={`text-xs font-semibold block truncate transition-all ${
                                isCompleted ? 'line-through text-gray-500 opacity-50' : 'text-gray-100'
                              }`}>
                                {task.title}
                              </span>
                            </div>

                            {/* Hạn chót */}
                            {task.due_date && (
                              <div className={`flex items-center gap-1 text-[11px] font-medium flex-shrink-0 ${
                                task.due_date < Date.now() && !isCompleted ? 'text-red-400' : 'text-gray-400'
                              }`}>
                                <span>📅</span>
                                <span>
                                  {new Date(task.due_date).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                            )}

                             {/* Nhiệm vụ con progress */}
                             {task.checklist_total ? (
                               <div className="flex items-center gap-2 text-[11px] text-gray-400 flex-shrink-0 bg-gray-800/40 px-2 py-1 rounded-lg border border-gray-800/30 min-w-[90px]">
                                 <span>📋</span>
                                 <span className="font-semibold text-gray-300">
                                   {task.checklist_done}/{task.checklist_total}
                                 </span>
                                 <div className="w-12 h-1 bg-gray-900 rounded-full overflow-hidden">
                                   <div 
                                     className="h-full bg-blue-500 transition-all duration-300" 
                                     style={{ width: `${Math.round((task.checklist_done / task.checklist_total) * 100)}%` }} 
                                   />
                                 </div>
                               </div>
                             ) : null}

                            {/* Người gán (Avatars) */}
                            {!!task.assignees?.length && (
                              <div className="flex flex-row-reverse items-center flex-shrink-0 pl-2">
                                {task.assignees.slice(0, 3).map((employeeId: string) => (
                                  <div key={employeeId} className="-ml-1.5 first:ml-0 relative z-10">
                                    <EmployeeAvatar employeeId={employeeId} size={20} showName={false} />
                                  </div>
                                ))}
                                {task.assignees.length > 3 && (
                                  <span className="text-[10px] text-gray-500 mr-1">+{task.assignees.length - 3}</span>
                                )}
                              </div>
                            )}

                            {/* Nút xoá nhanh khi hover */}
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(task); }}
                              title="Xoá task"
                              className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {projectTasks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                  <span className="text-4xl">📂</span>
                  <p className="text-xs text-gray-400">Dự án này chưa có task nào được tạo</p>
                  <button
                    onClick={() => setEditorState({ status: 'todo' })}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-300"
                  >
                    + Tạo task đầu tiên
                  </button>
                </div>
              )}
            </div>
          ) : (
            
            /* ── VIEW KANBAN ──────────────────────────────────────────────── */
            <div
              ref={boardScrollRef}
              onWheel={handleBoardWheel}
              className="h-full overflow-x-auto overflow-y-hidden p-5 erp-scroll-x"
            >
              <div className="flex gap-4 h-full min-w-max">
                {STATUS_COLS.map(col => {
                  const colTasks = tasksByStatus(col.id);
                  return (
                    <div
                      key={col.id}
                      className={`w-72 flex flex-col rounded-2xl border ${col.color} ${dragOverCol === col.id ? 'ring-2 ring-blue-500' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
                      onDragLeave={() => setDragOverCol(null)}
                      onDrop={() => handleDrop(col.id)}
                    >
                      {/* Column Header */}
                      <div className={`flex items-center justify-between px-4 py-3 border-b ${col.borderHeaderColor} flex-shrink-0`}>
                        <span className={`text-xs font-bold ${col.textColor} uppercase tracking-wide`}>{col.label}</span>
                        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${col.badgeColor}`}>{colTasks.length}</span>
                      </div>

                      {/* Lane Cards Container */}
                      <div data-erp-col-body className="flex-1 overflow-y-auto p-3 space-y-3 erp-scroll-y">
                        {colTasks.map(task => {
                          const isCompleted = task.status === 'done';
                          return (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={() => setDraggingTaskId(task.id)}
                              onDragEnd={() => { setDraggingTaskId(null); setDragOverCol(null); }}
                              onClick={() => setEditorState({ taskId: task.id })}
                              className="group relative bg-gray-950 border border-gray-800/60 hover:border-gray-700/80 rounded-xl p-3 cursor-pointer transition-all shadow-sm"
                            >
                              {/* Xoá nhanh */}
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(task); }}
                                title="Xoá task"
                                className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded text-[11px] text-gray-500 hover:text-red-400 hover:bg-gray-800 opacity-0 group-hover:opacity-100 transition-opacity"
                              >✕</button>

                              <div className="flex items-start gap-2.5">
                                {/* Checkbox nhanh */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateTaskStatus(task.id, isCompleted ? 'todo' : 'done');
                                  }}
                                  className={`w-4 h-4 rounded-full mt-0.5 flex-shrink-0 flex items-center justify-center border transition-all text-[9px] ${
                                    isCompleted
                                      ? 'bg-blue-600 border-blue-500 text-white'
                                      : 'border-gray-600 hover:border-blue-500 text-transparent hover:text-blue-500'
                                  }`}
                                >
                                  ✓
                                </button>

                                <div className="flex-1 min-w-0 pr-3">
                                  <p className={`text-xs font-semibold leading-snug mb-1.5 ${
                                    isCompleted ? 'line-through text-gray-500 opacity-50' : 'text-gray-100'
                                  }`}>{task.title}</p>
                                  {task.description?.trim() && (
                                    <div className="mb-2 rounded-lg border border-gray-800 bg-gray-900/40 px-2 py-1">
                                      <RichContentPreview source={task.description} compact className="text-[10px] text-gray-400" />
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-800/40 flex-wrap">
                                <span className={`text-[9px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full flex items-center gap-0.5 ${PRIORITY_META[task.priority]?.color || 'text-gray-400'}`}>
                                  {PRIORITY_META[task.priority]?.label || task.priority}
                                </span>
                                
                                {task.due_date && (
                                  <span className={`text-[9px] font-semibold ${task.due_date < Date.now() && !isCompleted ? 'text-red-400' : 'text-gray-500'}`}>
                                    {new Date(task.due_date).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                              </div>

                              {/* checklist progress & assignees */}
                              {(!!task.assignees?.length || !!task.checklist_total) && (
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-800/60 gap-2 flex-wrap">
                                  {task.checklist_total ? (
                                    <div className="flex flex-col gap-1 flex-1 min-w-[80px]">
                                      <div className="flex items-center gap-1 text-[9px] text-gray-400">
                                        <span>📋</span>
                                        <span className="font-semibold text-gray-300">{task.checklist_done}/{task.checklist_total}</span>
                                      </div>
                                      <div className="w-full h-1 bg-gray-900 rounded-full overflow-hidden">
                                        <div 
                                          className="h-full bg-blue-500 transition-all duration-300" 
                                          style={{ width: `${Math.round((task.checklist_done / task.checklist_total) * 100)}%` }} 
                                        />
                                      </div>
                                    </div>
                                  ) : <div />}

                                  {!!task.assignees?.length && (
                                    <div className="flex flex-row-reverse items-center pl-2">
                                      {task.assignees.slice(0, 3).map((employeeId: string) => (
                                        <div key={employeeId} className="-ml-1 first:ml-0">
                                          <EmployeeAvatar employeeId={employeeId} size={16} showName={false} />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Thêm nhanh */}
                        <button
                          onClick={() => setEditorState({ status: col.id })}
                          className="w-full text-left text-[11px] text-gray-500 hover:text-gray-300 hover:bg-gray-800/40 px-3 py-2 rounded-xl transition-all"
                        >
                          + Thêm task
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {editorState && (
        editorState.taskId ? (
          <TaskEditorDrawer
            taskId={editorState.taskId}
            defaultStatus={editorState.status ?? 'todo'}
            projectId={activeProjectId ?? undefined}
            onClose={() => setEditorState(null)}
            onSaved={() => undefined}
          />
        ) : (
          <TaskCreateModal
            defaultStatus={editorState.status ?? 'todo'}
            projectId={activeProjectId ?? undefined}
            onClose={() => setEditorState(null)}
            onSaved={(created) => {
              if (created?.id) {
                setEditorState({ taskId: created.id, status: created.status });
              } else {
                setEditorState(null);
              }
            }}
          />
        )
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <ConfirmDialog
          message={`Xoá task "${deleteTarget.title}"? Hành động không thể hoàn tác.`}
          onConfirm={async () => { await deleteTask(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Cancel confirm */}
      {cancelConfirm && (
        <ConfirmDialog
          message={`Chuyển task "${cancelConfirm.task.title}" sang cột "Huỷ"?`}
          confirmLabel="Huỷ task"
          danger
          onConfirm={() => { updateTaskStatus(cancelConfirm.task.id, 'cancelled'); setCancelConfirm(null); }}
          onCancel={() => setCancelConfirm(null)}
        />
      )}

      {/* Project Archive Confirm */}
      {projectArchiveConfirm && (
        <ConfirmDialog
          message={`Kết thúc dự án "${(projects || []).find(p => p && p.id === projectArchiveConfirm)?.name || ''}"? Dự án và tất cả các task thuộc dự án sẽ được lưu trữ và ẩn đi.`}
          confirmLabel="Kết thúc"
          onConfirm={async () => {
            await updateProject(projectArchiveConfirm, { status: 'archived' });
            setProjectArchiveConfirm(null);
          }}
          onCancel={() => setProjectArchiveConfirm(null)}
        />
      )}

      {/* Project Delete Confirm */}
      {projectDeleteConfirm && (
        <ConfirmDialog
          message={`Xoá dự án "${(projects || []).find(p => p && p.id === projectDeleteConfirm)?.name || ''}"? Tất cả các task thuộc dự án cũng sẽ bị lưu trữ/xoá. Hành động không thể hoàn tác.`}
          confirmLabel="Xoá dự án"
          danger
          onConfirm={async () => {
            await deleteProject(projectDeleteConfirm);
            setProjectDeleteConfirm(null);
          }}
          onCancel={() => setProjectDeleteConfirm(null)}
        />
      )}

      {/* New Project Modal */}
      {newProjectModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[9999]" onClick={() => setNewProjectModal(false)}>
          <div className="bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl w-80 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-100">Tạo project mới</h3>
            <input
              autoFocus
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newProjectName.trim()) {
                  handleCreateProject();
                }
                if (e.key === 'Escape') setNewProjectModal(false);
              }}
              placeholder="Tên project..."
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />

            {/* Icon Picker (SVGs) */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Chọn Icon đại diện</label>
              <div className="grid grid-cols-6 gap-1.5">
                {Object.keys(PROJECT_ICONS).map(slug => {
                  const iconSvg = PROJECT_ICONS[slug];
                  return (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => setNewProjectIcon(slug)}
                      className={`h-8 w-8 flex items-center justify-center rounded-lg border transition-all ${
                        newProjectIcon === slug 
                          ? 'bg-blue-600/20 border-blue-500 text-white font-bold' 
                          : 'bg-gray-900 border-gray-850 hover:border-gray-800 text-gray-400'
                      }`}
                    >
                      {React.cloneElement(iconSvg as React.ReactElement, {
                        className: 'w-4 h-4',
                        style: { color: newProjectIcon === slug ? '#3b82f6' : '#9ca3af' }
                      })}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Color Picker */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Chọn màu sắc</label>
              <div className="flex flex-wrap gap-2">
                {[
                  '#3b82f6', // Blue
                  '#0ea5e9', // Sky
                  '#22c55e', // Green
                  '#10b981', // Emerald
                  '#eab308', // Yellow
                  '#f59e0b', // Amber
                  '#f97316', // Orange
                  '#ef4444', // Red
                  '#ec4899', // Pink
                  '#f43f5e', // Rose
                  '#64748b'  // Slate
                ].map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewProjectColor(color)}
                    className={`h-5 w-5 rounded-full border-2 transition-all ${
                      newProjectColor === color 
                        ? 'border-white scale-110 shadow-md' 
                        : 'border-transparent opacity-80 hover:opacity-100 hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || creatingProjectRef.current}
                className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded-lg transition-colors font-semibold"
              >
                Tạo
              </button>
              <button
                type="button"
                onClick={() => setNewProjectModal(false)}
                className="px-4 py-1.5 text-gray-500 hover:text-gray-100 hover:bg-gray-800 rounded-lg text-sm transition-colors"
              >
                Huỷ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
