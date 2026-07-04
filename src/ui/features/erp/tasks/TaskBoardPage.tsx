import React, { useEffect, useRef, useState } from 'react';
import { useErpTaskStore } from '@/store/erp/erpTaskStore';
import { useErpEmployeeStore } from '@/store/erp/erpEmployeeStore';
import { useEmployeeStore } from '@/store/employeeStore';
import TaskEditorDrawer from './TaskEditorDrawer';
import { ConfirmDialog, ErpModalCard, ErpOverlay } from '../shared/ErpDialogs';
import { ERP_DATE_FILTER_OPTIONS, getDefaultCustomRange, resolveErpDateRange, type ErpDateFilterPreset } from '../shared/erpDateFilters';
import { EmployeeAvatar, RichContentPreview } from '../shared/ErpBadges';
import type { ErpTask, ErpTaskPriority, ErpTaskStatus } from '../../../../models/erp';
import AppIcon from '@/components/common/AppIcon';

const STATUS_COLS: { id: ErpTaskStatus; label: string; color: string }[] = [
  { id: 'todo',      label: 'Cần làm',    color: 'bg-gray-900/60 border-gray-800/40' },
  { id: 'doing',     label: 'Đang làm',   color: 'bg-gray-900/60 border-gray-850/40' },
  { id: 'review',    label: 'Xem xét',    color: 'bg-gray-900/60 border-gray-850/40' },
  { id: 'done',      label: 'Hoàn thành', color: 'bg-gray-900/60 border-gray-850/40' },
  { id: 'cancelled', label: 'Huỷ',        color: 'bg-gray-900/60 border-gray-800/40' },
];

const PRIORITY_META: Record<string, { color: string; label: string; icon: 'alert_circle' | 'zap' | 'alert_triangle' | 'x' }> = {
  low: { color: 'text-slate-500 bg-slate-100 border border-slate-200', label: 'Thấp', icon: 'alert_circle' },
  normal: { color: 'text-blue-600 bg-blue-50 border border-blue-200', label: 'Bình thường', icon: 'zap' },
  high: { color: 'text-orange-600 bg-orange-50 border border-orange-200', label: 'Cao', icon: 'alert_triangle' },
  urgent: { color: 'text-red-600 bg-red-50 border border-red-200', label: 'Khẩn cấp', icon: 'alert_circle' },
};

const STATUS_LABELS: Record<ErpTaskStatus, string> = {
  todo: 'Cần làm',
  doing: 'Đang làm',
  review: 'Xem xét',
  done: 'Hoàn thành',
  cancelled: 'Huỷ',
};

export default function TaskBoardPage() {
  const { projects, tasks, loadProjects, loadTasks, createProject, updateProject, deleteProject, activeProjectId, setActiveProject, updateTaskStatus, deleteTask } = useErpTaskStore();
  const { employees, loadEmployees } = useEmployeeStore();
  const loadProfiles = useErpEmployeeStore(s => s.loadProfiles);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ErpTaskStatus | null>(null);
  const [editorState, setEditorState] = useState<{ taskId?: string | null; status?: ErpTaskStatus } | null>(null);
  const [newProjectModal, setNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'' | ErpTaskPriority>('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState<'' | ErpDateFilterPreset>('');
  const [customDateRange, setCustomDateRange] = useState(() => getDefaultCustomRange());
  const [deleteTarget, setDeleteTarget] = useState<ErpTask | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<{ task: ErpTask } | null>(null);
  const [projectDeleteConfirm, setProjectDeleteConfirm] = useState<string | null>(null);
  const [projectArchiveConfirm, setProjectArchiveConfirm] = useState<string | null>(null);
  const newProjectInputRef = useRef<HTMLInputElement>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  
  // Mặc định ở chế độ Kanban
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');

  useEffect(() => { loadProjects(); loadEmployees(); loadProfiles(); }, []);
  useEffect(() => {
    const resolvedDateRange = dateFilter ? resolveErpDateRange(dateFilter, customDateRange) : null;
    if (dateFilter === 'custom' && !resolvedDateRange) return;
    const nextFilter = { archived: false } as {
      archived: false;
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
  }, [activeProjectId, assigneeFilter, customDateRange, dateFilter, priorityFilter]);

  const handleBoardWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!boardScrollRef.current) return;
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const target = e.target as HTMLElement;
    const col = target.closest('[data-erp-col-body]') as HTMLElement | null;
    if (col && col.scrollHeight > col.clientHeight) return;
    boardScrollRef.current.scrollTo({ left: boardScrollRef.current.scrollLeft + e.deltaY });
  };

  const allTasks = Object.values(tasks);
  const projectTasks = activeProjectId
    ? allTasks.filter(t => t.project_id === activeProjectId)
    : allTasks;

  const tasksByStatus = (status: ErpTaskStatus) =>
    projectTasks.filter(t => t.status === status).sort((a, b) => a.sort_order - b.sort_order);

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

  // Group tasks for List View by Priority
  const priorityGroups: { id: ErpTaskPriority; label: string; color: string }[] = [
    { id: 'urgent', label: 'Khẩn cấp', color: 'text-red-600 border-red-200 bg-red-50' },
    { id: 'high', label: 'Ưu tiên cao', color: 'text-orange-600 border-orange-200 bg-orange-50' },
    { id: 'normal', label: 'Thông thường', color: 'text-blue-600 border-blue-200 bg-blue-50' },
    { id: 'low', label: 'Thấp', color: 'text-slate-600 border-slate-200 bg-slate-50' },
  ];

  const tasksByPriority = (priority: ErpTaskPriority) =>
    projectTasks.filter(t => t.priority === priority);

  const currentProjectName = activeProjectId 
    ? projects.find(p => p.id === activeProjectId)?.name || 'Dự án'
    : 'Tất cả dự án';

  return (
    <div className="flex h-full overflow-hidden bg-gray-900 text-gray-250">
      
      {/* ── Sidebar Dự án bên trái (Chữ đen, nền trắng, viền xám) ──────── */}
      <div className="w-60 bg-gray-950 border-r border-gray-800 p-4 space-y-4 flex-shrink-0 flex flex-col h-full">
        <div className="flex items-center justify-between px-2 flex-shrink-0">
          <span className="text-xs font-bold text-gray-500 tracking-wider uppercase">Dự án</span>
          <button
            onClick={() => { setNewProjectName(''); setNewProjectModal(true); setTimeout(() => newProjectInputRef.current?.focus(), 50); }}
            className="w-6 h-6 flex items-center justify-center rounded-lg bg-gray-850 hover:bg-gray-800 text-gray-400 hover:text-gray-100 transition-colors"
            title="Tạo dự án mới"
          >
            +
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 erp-scroll-y pr-1">
          <button
            onClick={() => setActiveProject(null)}
            className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
              activeProjectId === null
                ? 'bg-blue-600/90 text-white font-semibold'
                : 'text-gray-400 hover:bg-gray-850/60 hover:text-gray-200'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <span className="text-base">💼</span>
              <span className="truncate">Tất cả dự án</span>
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              activeProjectId === null ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400'
            }`}>{allTasks.length}</span>
          </button>

          {projects.map(project => {
            const count = allTasks.filter(t => t.project_id === project.id).length;
            const isSelected = activeProjectId === project.id;
            return (
              <button
                key={project.id}
                onClick={() => setActiveProject(project.id)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                  isSelected
                    ? 'bg-blue-600/90 text-white font-semibold'
                    : 'text-gray-400 hover:bg-gray-855/60 hover:text-gray-200'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: project.color || '#3b82f6' }} />
                  <span className="truncate">{project.name}</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  isSelected ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400'
                }`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Vùng nội dung chính bên phải (Chữ đen, nền trắng, viền xám) ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Header Tab View (Danh sách / Kanban) */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800/60 flex-shrink-0 bg-gray-950/40">
          <div className="min-w-0 flex items-center gap-4">
            <h2 className="text-sm font-semibold text-gray-100 truncate flex items-center gap-2">
              <span className="text-base">🎯</span> {currentProjectName}
            </h2>
            {activeProjectId && (
              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                <button
                  onClick={() => setProjectArchiveConfirm(activeProjectId)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all border border-gray-800 bg-gray-950 text-gray-300 hover:bg-gray-850 hover:text-gray-100 shadow-sm"
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

          <div className="flex bg-gray-850 p-0.5 rounded-xl border border-gray-800">
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'list'
                  ? 'bg-gray-700 text-gray-100 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <AppIcon name="list" size={13} /> Danh sách
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'kanban'
                  ? 'bg-gray-700 text-gray-100 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <AppIcon name="grid" size={13} /> Kanban
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex items-center gap-3 px-5 py-2 border-b border-gray-800/40 flex-shrink-0 flex-wrap bg-gray-900/50">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            
            <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="min-w-[150px] bg-gray-850 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500">
              <option value="" className="bg-gray-950">Tất cả nhân viên</option>
              <option value="boss" className="bg-gray-950">Boss</option>
              {employees.map((employee: any) => <option key={employee.employee_id} value={employee.employee_id} className="bg-gray-950">{employee.display_name}</option>)}
            </select>

            <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as '' | ErpTaskPriority)} className="min-w-[140px] bg-gray-850 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500">
              <option value="" className="bg-gray-950">Mọi mức ưu tiên</option>
              <option value="low" className="bg-gray-950">Thấp</option>
              <option value="normal" className="bg-gray-950">Bình thường</option>
              <option value="high" className="bg-gray-950">Cao</option>
              <option value="urgent" className="bg-gray-950">Khẩn cấp</option>
            </select>

            <select value={dateFilter} onChange={e => setDateFilter(e.target.value as '' | ErpDateFilterPreset)} className="min-w-[150px] bg-gray-850 border border-gray-800 rounded-xl px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500">
              <option value="" className="bg-gray-950">Tất cả hạn chót</option>
              {ERP_DATE_FILTER_OPTIONS.map(option => <option key={option.id} value={option.id} className="bg-gray-950">{option.label}</option>)}
            </select>

            {dateFilter === 'custom' && (
              <>
                <input
                  type="date"
                  value={customDateRange.from}
                  onChange={e => setCustomDateRange(current => ({ ...current, from: e.target.value }))}
                  className="bg-gray-850 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-200"
                />
                <input
                  type="date"
                  value={customDateRange.to}
                  onChange={e => setCustomDateRange(current => ({ ...current, to: e.target.value }))}
                  className="bg-gray-850 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-200"
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
                                  : 'border-gray-650 hover:border-blue-500 text-transparent hover:text-blue-500'
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
                                task.due_date < Date.now() && !isCompleted ? 'text-red-400' : 'text-gray-450'
                              }`}>
                                <span>📅</span>
                                <span>
                                  {new Date(task.due_date).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                            )}

                            {/* Nhiệm vụ con progress */}
                            {task.checklist_total ? (
                              <div className="flex items-center gap-1 text-[11px] text-gray-400 flex-shrink-0 bg-gray-850/40 px-2 py-0.5 rounded-lg border border-gray-800/20">
                                <span>📋</span>
                                <span className="font-semibold text-gray-300">
                                  {task.checklist_done}/{task.checklist_total}
                                </span>
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
                      className={`w-72 flex flex-col rounded-2xl border bg-gray-950/20 ${col.color} ${dragOverCol === col.id ? 'ring-2 ring-blue-500' : ''}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
                      onDragLeave={() => setDragOverCol(null)}
                      onDrop={() => handleDrop(col.id)}
                    >
                      {/* Column Header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/40 flex-shrink-0">
                        <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">{col.label}</span>
                        <span className="text-[10px] font-bold bg-gray-850 border border-gray-800 rounded-full px-2 py-0.5 text-gray-400">{colTasks.length}</span>
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
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-850/60">
                                  {task.checklist_total ? (
                                    <div className="flex items-center gap-1.5 text-[9px] text-gray-400 bg-gray-900/30 px-1.5 py-0.5 rounded border border-gray-800">
                                      <span>📋</span>
                                      <span>{task.checklist_done}/{task.checklist_total}</span>
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
        <TaskEditorDrawer
          taskId={editorState.taskId ?? null}
          defaultStatus={editorState.status ?? 'todo'}
          projectId={activeProjectId ?? undefined}
          onClose={() => setEditorState(null)}
          onSaved={() => undefined}
        />
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
          message={`Kết thúc dự án "${projects.find(p => p.id === projectArchiveConfirm)?.name || ''}"? Dự án và tất cả các task thuộc dự án sẽ được lưu trữ và ẩn đi.`}
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
          message={`Xoá dự án "${projects.find(p => p.id === projectDeleteConfirm)?.name || ''}"? Tất cả các task thuộc dự án cũng sẽ bị lưu trữ/xoá. Hành động không thể hoàn tác.`}
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
        <ErpOverlay onClose={() => setNewProjectModal(false)} className="z-50" backdropClassName="bg-black/50">
          <ErpModalCard className="w-80 p-5 bg-gray-950 border border-gray-800 rounded-2xl">
            <h3 className="text-sm font-semibold text-gray-100 mb-3">Tạo project mới</h3>
            <input
              ref={newProjectInputRef}
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newProjectName.trim()) {
                  createProject({ name: newProjectName.trim() }).then(project => {
                    if (project) setActiveProject(project.id);
                  });
                  setNewProjectModal(false);
                }
                if (e.key === 'Escape') setNewProjectModal(false);
              }}
              placeholder="Tên project..."
              className="w-full bg-gray-850 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (newProjectName.trim()) {
                    createProject({ name: newProjectName.trim() }).then(project => {
                      if (project) setActiveProject(project.id);
                    });
                    setNewProjectModal(false);
                  }
                }}
                disabled={!newProjectName.trim()}
                className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
              >
                Tạo
              </button>
              <button
                onClick={() => setNewProjectModal(false)}
                className="px-4 py-1.5 text-gray-500 hover:text-gray-100 hover:bg-gray-800 rounded-lg text-sm transition-colors"
              >
                Huỷ
              </button>
            </div>
          </ErpModalCard>
        </ErpOverlay>
      )}
    </div>
  );
}
