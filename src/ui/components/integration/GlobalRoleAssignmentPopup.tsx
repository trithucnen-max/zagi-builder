import React, { useEffect, useState, useRef } from 'react';
import ipc from '@/lib/ipc';

interface AIAssistantSummary {
  id: string;
  name: string;
  platform: string;
  model: string;
  enabled: boolean;
  isDefault: boolean;
}

export default function GlobalRoleAssignmentPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [roles, setRoles] = useState<Record<string, string | null>>({
    composer: null,
    summarizer: null,
    profiler: null,
    support: null,
  });
  const [assistants, setAssistants] = useState<AIAssistantSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      ipc.ai?.listAssistants(),
      ipc.ai?.getGlobalRoleAssistants(),
    ]).then(([resList, resRoles]) => {
      if (resList?.success) {
        setAssistants(resList.assistants || []);
      }
      if (resRoles?.success) {
        setRoles(resRoles.roles || {});
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (overlayRef.current && e.target === overlayRef.current) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  const handleSetRole = async (role: string, assistantId: string | null) => {
    try {
      const res = await ipc.ai?.setGlobalRoleAssistant(role, assistantId);
      if (res?.success) {
        setRoles(prev => ({ ...prev, [role]: assistantId }));
      }
    } catch {}
  };

  if (!open) return null;

  const enabledAssistants = assistants.filter(a => a.enabled);

  const roleDefinitions = [
    { key: 'composer', name: '🤖 AI 2: Soạn tin & Tạo Workflow', desc: 'Trợ lý hỗ trợ cải thiện văn bản tin nhắn chat và sinh/sửa kịch bản Workflow tự động.' },
    { key: 'summarizer', name: '📝 AI 3: Tổng hợp hội thoại', desc: 'Trợ lý phân tích nội dung cuộc chat, tạo tóm tắt thông tin quan trọng của khách hàng.' },
    { key: 'profiler', name: '👤 AI 4: Chân dung khách hàng', desc: 'Trợ lý phân tích lịch sử chat để phác họa chân dung khách hàng dựa trên tiêu chí prompt.' },
  ];

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">⚙️ Cấu hình Vai trò AI Agent</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Gán các trợ lý chuyên biệt cho từng tính năng tự động của hệ thống ZaGi.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          ) : (
            roleDefinitions.map(role => (
              <div key={role.key} className="bg-gray-900/40 border border-gray-700/50 rounded-xl p-4 space-y-2.5">
                <div>
                  <h3 className="text-sm font-semibold text-white">{role.name}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed mt-0.5">{role.desc}</p>
                </div>
                <div>
                  <select
                    value={roles[role.key] || ''}
                    onChange={e => handleSetRole(role.key, e.target.value || null)}
                    className="w-full bg-gray-800 border border-gray-750 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">— Chưa gán (Sử dụng trợ lý Mặc định) —</option>
                    {enabledAssistants.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.platform} - {a.model}) {a.isDefault ? '[Mặc định]' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-700 flex-shrink-0 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium bg-gray-700 hover:bg-gray-650 text-white rounded-lg transition-colors">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
