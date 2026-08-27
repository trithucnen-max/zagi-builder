import React, { useEffect, useState } from 'react';
import { useCRMStore, PipelineStage, CRMContact } from '@/store/crmStore';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore } from '@/store/appStore';
import ipc from '@/lib/ipc';
import useIsMobile from '@/hooks/useIsMobile';

export default function CRMPipelineTab() {
  const isMobile = useIsMobile();
  const { activeAccountId } = useAccountStore();
  const { showNotification } = useAppStore();
  const {
    contacts,
    pipelineStages,
    pipelineStagesLoading,
    setPipelineStages,
    setPipelineStagesLoading,
    setContacts,
    setContactsLoading,
  } = useCRMStore();

  const [editingStage, setEditingStage] = useState<Partial<PipelineStage> | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // States bộ lọc và tìm kiếm
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedLabelId, setSelectedLabelId] = useState<number | ''>('');
  const [localLabels, setLocalLabels] = useState<any[]>([]);

  // Debounce tìm kiếm 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Tải danh sách trạng thái
  const loadStages = async () => {
    setPipelineStagesLoading(true);
    try {
      const res = await ipc.db?.getPipelineStages();
      if (res?.success && res.stages) {
        const sorted = [...res.stages].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
        setPipelineStages(sorted);
      }
    } catch (e: any) {
      showNotification('Không thể tải các trạng thái: ' + e.message, 'error');
    } finally {
      setPipelineStagesLoading(false);
    }
  };

  // Tải danh sách Nhãn Local phục vụ bộ lọc
  const loadLocalLabelsList = async () => {
    if (!activeAccountId) return;
    try {
      const res = await ipc.db?.getLocalLabels({ zaloId: activeAccountId });
      if (res?.labels) {
        setLocalLabels(res.labels);
      }
    } catch {}
  };

  // Tải danh sách liên hệ (Tải hết liên hệ đã phân loại + 200 liên hệ chưa phân loại khớp bộ lọc)
  const loadContacts = async () => {
    if (!activeAccountId) return;
    setContactsLoading(true);
    try {
      // Bộ lọc cho nhóm đã phân loại (limit = 10000 để tải hết, tránh bị mất liên hệ)
      const classifiedOpts: any = {
        limit: 10000,
        offset: 0,
        pipelineStageId: 'any',
      };
      if (debouncedSearchQuery.trim()) {
        classifiedOpts.search = debouncedSearchQuery.trim();
      }
      if (selectedLabelId !== '') {
        classifiedOpts.tagIds = [selectedLabelId];
      }

      // Bộ lọc cho nhóm chưa phân loại (limit = 200 để tránh lag giao diện)
      const unclassifiedOpts: any = {
        limit: 200,
        offset: 0,
        pipelineStageId: 'unclassified',
      };
      if (debouncedSearchQuery.trim()) {
        unclassifiedOpts.search = debouncedSearchQuery.trim();
      }
      if (selectedLabelId !== '') {
        unclassifiedOpts.tagIds = [selectedLabelId];
      }

      const [classRes, unclassRes] = await Promise.all([
        ipc.crm?.getContacts({ zaloId: activeAccountId, opts: classifiedOpts }),
        ipc.crm?.getContacts({ zaloId: activeAccountId, opts: unclassifiedOpts }),
      ]);

      let combinedContacts: CRMContact[] = [];
      let totalCount = 0;

      if (classRes?.success && classRes.contacts) {
        combinedContacts.push(...classRes.contacts);
        totalCount += classRes.total || 0;
      }
      if (unclassRes?.success && unclassRes.contacts) {
        combinedContacts.push(...unclassRes.contacts);
        totalCount += unclassRes.total || 0;
      }

      setContacts(combinedContacts, totalCount);
    } catch (err: any) {
      console.error('[CRMPipelineTab] loadContacts error:', err.message);
    } finally {
      setContactsLoading(false);
    }
  };

  // Tải dữ liệu ban đầu khi đổi tài khoản
  useEffect(() => {
    loadStages();
    loadLocalLabelsList();
  }, [activeAccountId]);

  // Tải lại liên hệ khi thay đổi bộ lọc/tìm kiếm
  useEffect(() => {
    loadContacts();
  }, [activeAccountId, debouncedSearchQuery, selectedLabelId]);

  // Handle save/create stage
  const handleSaveStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStage || !editingStage.name?.trim()) return;

    try {
      const stageToSave = {
        id: editingStage.id,
        name: editingStage.name.trim(),
        color: editingStage.color || '#3B82F6',
        position: editingStage.position ?? pipelineStages.length,
      };
      const res = await ipc.db?.savePipelineStage({ stage: stageToSave });
      if (res?.success) {
        showNotification(editingStage.id ? 'Đã cập nhật trạng thái' : 'Đã thêm trạng thái mới', 'success');
        setShowEditModal(false);
        setEditingStage(null);
        loadStages();
      } else {
        showNotification('Lỗi: ' + (res?.error || 'Không thể lưu'), 'error');
      }
    } catch (e: any) {
      showNotification('Lỗi: ' + e.message, 'error');
    }
  };

  // Handle delete stage
  const handleDeleteStage = async (id: number) => {
    if (!confirm('Bạn có chắc muốn xóa trạng thái này? Các liên hệ trong cột này sẽ chuyển về trạng thái Chưa phân loại.')) return;
    try {
      const res = await ipc.db?.deletePipelineStage({ id });
      if (res?.success) {
        showNotification('Đã xóa trạng thái', 'success');
        loadStages();
        loadContacts();
      }
    } catch (e: any) {
      showNotification('Lỗi: ' + e.message, 'error');
    }
  };

  // Handle move contact
  const handleMoveContact = async (contactId: string, stageId: number | null) => {
    if (!activeAccountId) return;
    try {
      const res = await ipc.db?.updateContactPipelineStage({
        ownerZaloId: activeAccountId,
        contactId,
        stageId,
      });
      if (res?.success) {
        // Dùng getState() để tránh stale closure — contacts có thể đã thay đổi
        const currentState = useCRMStore.getState();
        currentState.setContacts(
          currentState.contacts.map(c =>
            c.contact_id === contactId ? { ...c, pipeline_stage_id: stageId } : c
          ),
          currentState.totalContacts
        );
        showNotification('Đã cập nhật giai đoạn liên hệ', 'success');
      } else {
        showNotification('Lỗi: ' + (res?.error || 'Không thể cập nhật'), 'error');
      }
    } catch (e: any) {
      showNotification('Lỗi: ' + e.message, 'error');
    }
  };

  // Group contacts by stage ID
  const groupedContacts = contacts.reduce<Record<string, CRMContact[]>>((acc, contact) => {
    const stageId = contact.pipeline_stage_id ? String(contact.pipeline_stage_id) : 'unclassified';
    if (!acc[stageId]) acc[stageId] = [];
    acc[stageId].push(contact);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-gray-50/50 dark:bg-gray-900 text-gray-900 dark:text-white overflow-hidden">
      {/* Integrated Single-Row Header with Title, Search, Filter & Action */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-850 flex items-center justify-between gap-4 flex-wrap flex-shrink-0 min-h-[60px]">
        {/* Left: Title & Subtitle */}
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-base font-extrabold text-gray-900 dark:text-white leading-tight">Pipeline Kanban CRM</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 hidden sm:block">Quản lý cơ hội bán hàng và phân loại liên hệ theo phễu khách hàng</p>
          </div>

          {/* Search Bar */}
          <div className="relative w-52 sm:w-60">
            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-gray-400 pointer-events-none">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Tìm theo tên, sđt..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-8 pr-7 py-1.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-all font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-white cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Nhãn Local Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 hidden md:inline">Nhãn Local:</span>
            <select
              value={selectedLabelId}
              onChange={(e) => setSelectedLabelId(e.target.value === '' ? '' : Number(e.target.value))}
              className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 transition-all cursor-pointer font-medium"
            >
              <option value="">Tất cả nhãn</option>
              {localLabels.map((lbl) => (
                <option key={lbl.id} value={lbl.id}>
                  {lbl.emoji || '🏷️'} {lbl.name}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Button */}
          {(searchQuery || selectedLabelId !== '') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedLabelId('');
              }}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Đặt lại
            </button>
          )}
        </div>

        {/* Right Action: Thêm cột trạng thái */}
        <button
          onClick={() => {
            setEditingStage({ name: '', color: '#3B82F6', position: pipelineStages.length + 1 });
            setShowEditModal(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex-shrink-0"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Thêm cột trạng thái
        </button>
      </div>

      {/* Kanban Board Container */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-5 flex gap-4 items-start">
        {/* Unclassified / Mới tiếp cận */}
        <PipelineColumn
          title="Chưa phân loại"
          color="#6B7280"
          contacts={groupedContacts['unclassified'] || []}
          stages={pipelineStages}
          onMove={handleMoveContact}
          isUnclassified
        />

        {pipelineStages.map((stage, idx) => (
          <PipelineColumn
            key={stage.id}
            stage={stage}
            stepNumber={stage.position !== undefined ? stage.position : idx + 1}
            title={stage.name}
            color={stage.color}
            contacts={groupedContacts[String(stage.id)] || []}
            stages={pipelineStages}
            onMove={handleMoveContact}
            onEdit={(s) => {
              setEditingStage({ ...s, position: s.position !== undefined ? s.position : idx + 1 });
              setShowEditModal(true);
            }}
            onDelete={handleDeleteStage}
          />
        ))}

        {pipelineStages.length === 0 && !pipelineStagesLoading && (
          <div className="flex-1 self-center text-center py-12 text-gray-400 dark:text-gray-500">
            <p className="text-sm font-semibold">Chưa có cột tùy biến nào được tạo</p>
            <p className="text-xs mt-1">Sử dụng nút ở góc phải trên để thêm các giai đoạn mới vào phễu.</p>
          </div>
        )}
      </div>

      {/* Edit/Create Stage Modal */}
      {showEditModal && editingStage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSaveStage} className="bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-150 text-gray-900 dark:text-white">
            <h3 className="text-base font-bold mb-4">
              {editingStage.id ? '✏️ Chỉnh sửa trạng thái' : '➕ Thêm trạng thái mới'}
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase">Tên trạng thái</label>
                  <input
                    type="text"
                    required
                    value={editingStage.name || ''}
                    onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })}
                    placeholder="Ví dụ: Đang đàm phán, Khách VIP..."
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase">Thứ tự bước</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={editingStage.position ?? 1}
                    onChange={(e) => setEditingStage({ ...editingStage, position: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase">Màu sắc cột</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={editingStage.color || '#3B82F6'}
                    onChange={(e) => setEditingStage({ ...editingStage, color: e.target.value })}
                    className="w-9 h-9 rounded-lg border-0 bg-transparent cursor-pointer flex-shrink-0"
                  />
                  <div className="flex flex-wrap gap-2">
                    {['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6B7280'].map((c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setEditingStage({ ...editingStage, color: c })}
                        className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer ${
                          editingStage.color === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingStage(null);
                }}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors font-semibold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors font-bold cursor-pointer"
              >
                Lưu lại
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

interface ColumnProps {
  stage?: PipelineStage;
  stepNumber?: number;
  title: string;
  color: string;
  contacts: CRMContact[];
  stages: PipelineStage[];
  onMove: (contactId: string, stageId: number | null) => void;
  onEdit?: (stage: PipelineStage) => void;
  onDelete?: (id: number) => void;
  isUnclassified?: boolean;
}

function PipelineColumn({
  stage,
  stepNumber,
  title,
  color,
  contacts,
  stages,
  onMove,
  onEdit,
  onDelete,
  isUnclassified = false,
}: ColumnProps) {
  // Support basic drag-and-drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const contactId = e.dataTransfer.getData('text/plain');
    if (contactId) {
      onMove(contactId, isUnclassified ? null : (stage?.id ?? null));
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="w-76 sm:w-80 max-h-full flex flex-col bg-gray-100/70 dark:bg-gray-850 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-xs overflow-hidden flex-shrink-0"
    >
      {/* Column Header */}
      <div className="p-3 px-3.5 border-b border-gray-200/80 dark:border-gray-800 flex items-center justify-between bg-white/80 dark:bg-gray-850">
        <div className="flex items-center gap-2 min-w-0">
          {isUnclassified ? (
            <span className="w-5 h-5 rounded-full bg-gray-400 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              0
            </span>
          ) : (
            <span className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 shadow-xs" style={{ backgroundColor: color }}>
              {stepNumber ?? stage?.position ?? 1}
            </span>
          )}
          <span className="font-extrabold text-xs text-gray-900 dark:text-white truncate max-w-[140px]">{title}</span>
          <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[11px] px-2 py-0.5 rounded-full font-bold">
            {contacts.length}
          </span>
        </div>

        {!isUnclassified && stage && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit?.(stage)}
              className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              title="Sửa tên/màu"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              onClick={() => onDelete?.(stage.id)}
              className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              title="Xóa cột"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Cards List — Tighter spacing & borderless cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 max-h-[calc(100vh-200px)]">
        {contacts.map((contact) => (
          <ContactCard key={contact.contact_id} contact={contact} stages={stages} onMove={onMove} />
        ))}

        {contacts.length === 0 && (
          <div className="py-8 text-center text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-300 dark:border-gray-700/60 rounded-xl bg-white/40 dark:bg-gray-800/20 font-medium">
            Kéo thả hoặc chuyển liên hệ vào đây
          </div>
        )}
      </div>
    </div>
  );
}

function ContactCard({
  contact,
  stages,
  onMove,
}: {
  contact: CRMContact;
  stages: PipelineStage[];
  onMove: (contactId: string, stageId: number | null) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', contact.contact_id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="p-2.5 bg-white dark:bg-gray-800 rounded-xl shadow-2xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing group relative"
    >
      <div className="flex items-center gap-2.5">
        {contact.avatar ? (
          <img
            src={contact.avatar}
            alt={contact.display_name}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0 text-xs">
            {(contact.alias || contact.display_name || 'U').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-xs text-gray-900 dark:text-gray-100 truncate leading-tight">
            {contact.alias || contact.display_name}
          </h4>
          {contact.alias && contact.display_name && contact.alias !== contact.display_name && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">({contact.display_name})</p>
          )}
          {contact.phone && (
            <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mt-0.5 truncate flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400 flex-shrink-0">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              <span>{contact.phone}</span>
            </p>
          )}
        </div>

        {/* Dropdown Menu to move stages */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors cursor-pointer"
          >
            ⋮
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-750 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-50 py-1.5 animate-in fade-in slide-in-from-top-1 duration-100 text-gray-900 dark:text-white">
                <p className="text-[10px] font-bold text-gray-400 px-3 py-1 uppercase tracking-wider">Chuyển trạng thái</p>
                {contact.pipeline_stage_id !== null && (
                  <button
                    onClick={() => {
                      onMove(contact.contact_id, null);
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    Chưa phân loại
                  </button>
                )}
                {stages.map((st) => {
                  if (st.id === contact.pipeline_stage_id) return null;
                  return (
                    <button
                      key={st.id}
                      onClick={() => {
                        onMove(contact.contact_id, st.id);
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                      <span className="truncate">{st.name}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* AI Sentiment & Intent Badges */}
      {(contact.ai_sentiment || contact.ai_intent) && (
        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/60">
          {contact.ai_sentiment && (
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                contact.ai_sentiment === 'Tích cực'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40'
                  : contact.ai_sentiment === 'Tiêu cực'
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40'
                  : 'bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600/40'
              }`}
            >
              {contact.ai_sentiment}
            </span>
          )}
          {contact.ai_intent && (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40">
              {contact.ai_intent}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
