import React, { useEffect, useState } from 'react';
import { useCRMStore, PipelineStage, CRMContact } from '@/store/crmStore';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore } from '@/store/appStore';
import ipc from '@/lib/ipc';

export default function CRMPipelineTab() {
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

  // Load pipeline stages from DB
  const loadStages = async () => {
    setPipelineStagesLoading(true);
    try {
      const res = await ipc.db?.getPipelineStages();
      if (res?.success && res.stages) {
        setPipelineStages(res.stages);
      }
    } catch (e: any) {
      showNotification('Không thể tải các trạng thái: ' + e.message, 'error');
    } finally {
      setPipelineStagesLoading(false);
    }
  };

  // Load contacts
  const loadContacts = async () => {
    if (!activeAccountId) return;
    setContactsLoading(true);
    try {
      const res = await ipc.crm?.getContacts({
        zaloId: activeAccountId,
        opts: { limit: 1000, offset: 0 },
      });
      if (res?.success) {
        setContacts(res.contacts, res.total);
      }
    } catch {}
    setContactsLoading(false);
  };

  useEffect(() => {
    loadStages();
    loadContacts();
  }, [activeAccountId]);

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
    <div className="flex flex-col h-full bg-gray-900 overflow-hidden">
      {/* Tab Header with Actions */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900 flex-shrink-0">
        <div>
          <h2 className="text-base font-semibold text-white">Pipeline Kanban CRM</h2>
          <p className="text-xs text-gray-400 mt-0.5">Quản lý cơ hội bán hàng và phân loại liên hệ theo phễu khách hàng</p>
        </div>
        <button
          onClick={() => {
            setEditingStage({ name: '', color: '#3B82F6', position: pipelineStages.length });
            setShowEditModal(true);
          }}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-blue-500/10"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Thêm cột trạng thái
        </button>
      </div>

      {/* Kanban Board Container */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-5 items-start">
        {/* Unclassified / Mới tiếp cận (if empty, we show it) */}
        <PipelineColumn
          title="Chưa phân loại"
          color="#6B7280"
          contacts={groupedContacts['unclassified'] || []}
          stages={pipelineStages}
          onMove={handleMoveContact}
          isUnclassified
        />

        {pipelineStages.map((stage) => (
          <PipelineColumn
            key={stage.id}
            stage={stage}
            title={stage.name}
            color={stage.color}
            contacts={groupedContacts[String(stage.id)] || []}
            stages={pipelineStages}
            onMove={handleMoveContact}
            onEdit={(s) => {
              setEditingStage(s);
              setShowEditModal(true);
            }}
            onDelete={handleDeleteStage}
          />
        ))}

        {pipelineStages.length === 0 && !pipelineStagesLoading && (
          <div className="flex-1 self-center text-center py-12 text-gray-500">
            <p className="text-sm">Chưa có cột tùy biến nào được tạo</p>
            <p className="text-xs text-gray-600 mt-1">Sử dụng nút ở góc phải trên để thêm các giai đoạn mới vào phễu.</p>
          </div>
        )}
      </div>

      {/* Edit/Create Stage Modal */}
      {showEditModal && editingStage && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <form onSubmit={handleSaveStage} className="bg-gray-800 border border-gray-700 rounded-2xl w-96 p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <h3 className="text-base font-bold text-white mb-4">
              {editingStage.id ? '✏️ Chỉnh sửa trạng thái' : '➕ Thêm trạng thái mới'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase">Tên trạng thái</label>
                <input
                  type="text"
                  required
                  value={editingStage.name || ''}
                  onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })}
                  placeholder="Ví dụ: Đang đàm phán, Khách VIP..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase">Màu sắc cột</label>
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
                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                          editingStage.color === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'
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
                className="flex-1 py-2.5 rounded-xl bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors font-semibold"
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
      className="w-80 max-h-full flex flex-col bg-gray-850 rounded-2xl border border-gray-800 shadow-xl overflow-hidden flex-shrink-0"
    >
      {/* Column Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-850/60">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="font-semibold text-sm text-white truncate max-w-[150px]">{title}</span>
          <span className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full font-medium">
            {contacts.length}
          </span>
        </div>

        {!isUnclassified && stage && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onEdit?.(stage)}
              className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
              title="Sửa tên/màu"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              onClick={() => onDelete?.(stage.id)}
              className="p-1 text-gray-400 hover:text-red-400 rounded-lg hover:bg-gray-800 transition-colors"
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

      {/* Cards List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-[calc(100vh-250px)]">
        {contacts.map((contact) => (
          <ContactCard key={contact.contact_id} contact={contact} stages={stages} onMove={onMove} />
        ))}

        {contacts.length === 0 && (
          <div className="py-8 text-center text-xs text-gray-600 border border-dashed border-gray-800 rounded-xl">
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
      className="p-3.5 bg-gray-800 border border-gray-700/80 rounded-xl hover:border-gray-600 hover:shadow-lg transition-all cursor-grab active:cursor-grabbing group relative"
    >
      <div className="flex items-center gap-3">
        {contact.avatar ? (
          <img
            src={contact.avatar}
            alt={contact.display_name}
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0 text-sm">
            {(contact.alias || contact.display_name || 'U').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <h4 className="font-semibold text-sm text-gray-100 truncate">
            {contact.alias || contact.display_name}
          </h4>
          {contact.alias && contact.display_name && contact.alias !== contact.display_name && (
            <p className="text-xs text-gray-500 truncate mt-0.5">({contact.display_name})</p>
          )}
          {contact.phone && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">📞 {contact.phone}</p>
          )}
        </div>

        {/* Dropdown Menu to move stages */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            ⋮
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-1 w-48 bg-gray-750 border border-gray-700 rounded-xl shadow-2xl z-50 py-1.5 animate-in fade-in slide-in-from-top-1 duration-100">
                <p className="text-[10px] font-semibold text-gray-400 px-3 py-1 uppercase tracking-wider">Chuyển trạng thái</p>
                {contact.pipeline_stage_id !== null && (
                  <button
                    onClick={() => {
                      onMove(contact.contact_id, null);
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-1.5"
                  >
                    <span className="w-2 h-2 rounded-full bg-gray-500" />
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
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-1.5"
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st.color }} />
                      {st.name}
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
        <div className="flex flex-wrap gap-1.5 mt-3 pt-2.5 border-t border-gray-700/60">
          {contact.ai_sentiment && (
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                contact.ai_sentiment === 'Tích cực'
                  ? 'bg-green-950/40 text-green-300 border border-green-800/40'
                  : contact.ai_sentiment === 'Tiêu cực'
                  ? 'bg-red-950/40 text-red-300 border border-red-800/40'
                  : 'bg-gray-700/50 text-gray-300 border border-gray-600/40'
              }`}
            >
              {contact.ai_sentiment}
            </span>
          )}
          {contact.ai_intent && (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-950/40 text-blue-300 border border-blue-800/40">
              {contact.ai_intent}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
