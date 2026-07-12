import React, { useState, useEffect, useRef } from 'react';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore } from '@/store/appStore';
import ipc from '@/lib/ipc';

interface CRMNote {
  id: number;
  contact_id: string;
  content: string;
  created_by?: string;
  created_at: number;
  updated_at: number;
  creator_name?: string;
}

interface CRMNotesModalProps {
  contactId: string;
  contactName: string;
  onClose: () => void;
}

export default function CRMNotesModal({ contactId, contactName, onClose }: CRMNotesModalProps) {
  const { activeAccountId } = useAccountStore();
  const { showNotification } = useAppStore();

  const [notes, setNotes] = useState<CRMNote[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [editNoteId, setEditNoteId] = useState<number | null>(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const savingRef = useRef(false);

  const loadNotes = async () => {
    if (!activeAccountId || !contactId) return;
    setLoading(true);
    try {
      const res = await ipc.crm?.getNotes({ zaloId: activeAccountId, contactId });
      if (res?.success) {
        setNotes(res.notes || []);
      }
    } catch (err) {
      console.error('Failed to load CRM notes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, [contactId, activeAccountId]);

  const handleAddNote = async () => {
    if (!newNoteText.trim() || !activeAccountId || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await ipc.crm?.saveNote({
        zaloId: activeAccountId,
        note: { contact_id: contactId, content: newNoteText.trim() },
      });
      if (res?.success) {
        setNewNoteText('');
        showNotification('Đã thêm ghi chú CRM mới', 'success');
        // Notify other panels to refresh notes
        window.dispatchEvent(new Event('ui:noteChanged'));
        await loadNotes();
      } else {
        throw new Error(res?.error || 'Lỗi lưu ghi chú');
      }
    } catch (err: any) {
      showNotification('Không thể thêm ghi chú: ' + err.message, 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleEditNote = async (id: number) => {
    if (!editNoteText.trim() || !activeAccountId) return;
    setSaving(true);
    try {
      const res = await ipc.crm?.saveNote({
        zaloId: activeAccountId,
        note: { id, contact_id: contactId, content: editNoteText.trim() },
      });
      if (res?.success) {
        setEditNoteId(null);
        setEditNoteText('');
        showNotification('Đã cập nhật ghi chú CRM', 'success');
        window.dispatchEvent(new Event('ui:noteChanged'));
        await loadNotes();
      } else {
        throw new Error(res?.error || 'Lỗi cập nhật ghi chú');
      }
    } catch (err: any) {
      showNotification('Không thể cập nhật ghi chú: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!activeAccountId || !window.confirm('Bạn có chắc chắn muốn xóa ghi chú này?')) return;
    try {
      const res = await ipc.crm?.deleteNote({ zaloId: activeAccountId, noteId });
      if (res?.success) {
        setNotes(prev => prev.filter(n => n.id !== noteId));
        showNotification('Đã xóa ghi chú CRM', 'success');
        window.dispatchEvent(new Event('ui:noteChanged'));
      } else {
        throw new Error(res?.error || 'Lỗi xóa ghi chú');
      }
    } catch (err: any) {
      showNotification('Không thể xóa ghi chú: ' + err.message, 'error');
    }
  };

  const formatDate = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#1e2535] border border-gray-700 w-full max-w-2xl h-[70vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">📝</span>
            <div>
              <h3 className="text-sm font-semibold text-gray-100">Ghi chú CRM nội bộ</h3>
              <p className="text-xs text-gray-400 mt-0.5">Khách hàng: <span className="text-blue-400 font-medium">{contactName}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-250 transition-colors text-base"
          >
            ✕
          </button>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-gray-900/40">
          {loading && notes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <svg className="animate-spin w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 py-10">
              <span className="text-3xl mb-1.5">📝</span>
              <p className="text-xs">Chưa có ghi chú CRM nào cho khách hàng này.</p>
              <p className="text-[11px] text-gray-600 mt-0.5">Thêm ghi chú bằng ô nhập liệu bên dưới.</p>
            </div>
          ) : (
            notes.map(note => (
              <div key={note.id} className="py-3 border-b border-gray-800/40 dark:border-gray-700/20 last:border-0 relative group">
                {editNoteId === note.id ? (
                  <div className="flex flex-col gap-2 mt-1">
                    <textarea
                      value={editNoteText}
                      onChange={e => setEditNoteText(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 min-h-[60px]"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => {
                          setEditNoteId(null);
                          setEditNoteText('');
                        }}
                        className="px-2.5 py-1 bg-gray-750 rounded text-[11px] text-gray-300 hover:bg-gray-700 transition-colors"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={() => handleEditNote(note.id)}
                        disabled={saving || !editNoteText.trim()}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 rounded text-[11px] text-white transition-colors disabled:opacity-50"
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-gray-400">
                        {formatDate(note.created_at)} {note.creator_name ? `• ${note.creator_name}` : ''}
                      </span>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setEditNoteId(note.id);
                            setEditNoteText(note.content);
                          }}
                          className="text-[10px] text-blue-400 hover:text-blue-300 font-medium transition-colors"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="text-[10px] text-red-400 hover:text-red-300 font-medium transition-colors"
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
 
        {/* Input box */}
        <div className="p-4 border-t border-gray-800 bg-[#151a25] flex flex-col gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 px-3 py-1.5 rounded-2xl focus-within:border-blue-500 transition-colors">
            <textarea
              value={newNoteText}
              onChange={e => setNewNoteText(e.target.value)}
              placeholder="Nhập ghi chú mới..."
              rows={1}
              className="flex-1 bg-transparent text-xs text-gray-200 placeholder-gray-500 focus:outline-none resize-none max-h-16 leading-relaxed"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  if (e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  handleAddNote();
                }
              }}
            />
            <button
              onClick={handleAddNote}
              disabled={saving || !newNoteText.trim()}
              className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-40 self-end shrink-0"
              title="Lưu ghi chú"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
          <span className="text-[10px] text-gray-500 mt-1 select-none">
            * Ghi chú này sẽ được đồng bộ trực tiếp lên hệ thống CRM nội bộ.
          </span>
        </div>
      </div>
    </div>
  );
}
