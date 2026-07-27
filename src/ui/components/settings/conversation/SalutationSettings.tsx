import React, { useState, useEffect, useMemo } from 'react';
import ipc from '@/lib/ipc';
import { showConfirm } from '../../common/ConfirmDialog';
import { applySmartSalutation, DEFAULT_SALUTATION_SELF_REF_MAP } from '@/utils/salutationUtils';

interface RuleItem {
  key: string;   // Xưng hô của khách (lowercase)
  value: string; // Từ tự xưng của người gửi
}

export default function SalutationSettings() {
  const [map, setMap] = useState<Record<string, string>>({ ...DEFAULT_SALUTATION_SELF_REF_MAP });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  
  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState('');
  const [inputValue, setInputValue] = useState('');
  
  // Live Preview tester state
  const [testSalutation, setTestSalutation] = useState('Chị');
  const [toast, setToast] = useState<string | null>(null);

  // Load custom map on mount
  useEffect(() => {
    loadMap();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadMap = async () => {
    setLoading(true);
    try {
      const res = await ipc.crm.getSalutationMap();
      if (res?.success && res.map) {
        setMap(res.map);
      } else {
        setMap({ ...DEFAULT_SALUTATION_SELF_REF_MAP });
      }
    } catch (err: any) {
      console.error('Failed to load salutation map:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMap = async (newMap: Record<string, string>) => {
    setSaving(true);
    try {
      const res = await ipc.crm.saveSalutationMap({ map: newMap });
      if (res?.success) {
        setMap(newMap);
        showToast('✅ Đã lưu quy tắc xưng hô thành công!');
      } else {
        alert(res?.error || 'Không thể lưu quy tắc xưng hô');
      }
    } catch (err: any) {
      alert(`Lỗi khi lưu quy tắc: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    const ok = await showConfirm({
      title: 'Khôi phục quy tắc mặc định',
      message: 'Bạn có chắc chắn muốn xóa tất cả các quy tắc tùy chỉnh và khôi phục về bảng quy tắc mặc định ban đầu không?',
      confirmText: 'Khôi phục mặc định',
      cancelText: 'Hủy bỏ',
      type: 'warning'
    });

    if (!ok) return;

    setSaving(true);
    try {
      const res = await ipc.crm.resetSalutationMap();
      if (res?.success && res.map) {
        setMap(res.map);
        showToast('🔄 Đã khôi phục bảng quy tắc mặc định!');
      }
    } catch (err: any) {
      alert(`Lỗi khi khôi phục: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Open Add modal
  const handleOpenAdd = () => {
    setEditingKey(null);
    setInputKey('');
    setInputValue('');
    setIsModalOpen(true);
  };

  // Open Edit modal
  const handleOpenEdit = (key: string, value: string) => {
    setEditingKey(key);
    setInputKey(key);
    setInputValue(value);
    setIsModalOpen(true);
  };

  // Save Modal submission
  const handleSaveRule = () => {
    const k = inputKey.trim().toLowerCase();
    const v = inputValue.trim();

    if (!k) {
      alert('Vui lòng nhập xưng hô của khách hàng');
      return;
    }
    if (!v) {
      alert('Vui lòng nhập từ tự xưng của người gửi');
      return;
    }

    const updated = { ...map };
    // If editing and key changed, delete old key
    if (editingKey && editingKey !== k) {
      delete updated[editingKey];
    }
    updated[k] = v;

    setIsModalOpen(false);
    handleSaveMap(updated);
  };

  // Delete rule
  const handleDeleteRule = async (key: string) => {
    const ok = await showConfirm({
      title: 'Xóa quy tắc xưng hô',
      message: `Bạn có chắc muốn xóa quy tắc xưng hô "${key}" không?`,
      confirmText: 'Xóa quy tắc',
      cancelText: 'Hủy',
      type: 'danger'
    });

    if (!ok) return;

    const updated = { ...map };
    delete updated[key];
    handleSaveMap(updated);
  };

  // Convert map to list and filter by search
  const rulesList: RuleItem[] = useMemo(() => {
    const list = Object.entries(map).map(([k, v]) => ({ key: k, value: v }));
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(item => item.key.includes(q) || item.value.toLowerCase().includes(q));
  }, [map, search]);

  // Live preview outputs
  const livePreviewStart = useMemo(() => {
    return applySmartSalutation('{salutation} ơi! {tu_xung} xin gửi thông tin ạ.', testSalutation, map[testSalutation.toLowerCase()]);
  }, [testSalutation, map]);

  const livePreviewMiddle = useMemo(() => {
    return applySmartSalutation('Dạ em xin chào {salutation}, {tu_xung} chúc {salutation} ngày mới tốt lành!', testSalutation, map[testSalutation.toLowerCase()]);
  }, [testSalutation, map]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-900 text-gray-100 overflow-y-auto p-4 space-y-4">
      
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-xs font-semibold animate-fade-in flex items-center gap-2">
          {toast}
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gray-800/80 border border-gray-700/80 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">🗣️</span>
            <h2 className="text-base font-bold text-white">Quy Tắc Xưng Hô & Tự Xưng Tiếng Việt</h2>
          </div>
          <p className="text-xs text-gray-400 max-w-2xl leading-relaxed">
            Hệ thống tự động thay thế <code className="text-blue-400 font-mono bg-blue-500/10 px-1 py-0.5 rounded">{'{salutation}'}</code> (danh xưng khách) và <code className="text-emerald-400 font-mono bg-emerald-500/10 px-1 py-0.5 rounded">{'{tu_xung}'}</code> (từ tự xưng người gửi) theo chuẩn ngữ pháp: <strong className="text-gray-300">Viết Hoa đầu câu</strong> và <strong className="text-gray-300">viết thường giữa câu</strong>. Bạn có thể tùy chỉnh danh sách tự xưng bên dưới.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleResetDefault}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white text-xs font-semibold transition-colors flex items-center gap-1.5 bg-gray-800 disabled:opacity-50"
            title="Khôi phục về bảng quy tắc mặc định của hệ thống"
          >
            <span>🔄</span> Khôi phục mặc định
          </button>
          <button
            onClick={handleOpenAdd}
            disabled={saving}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <span>+</span> Thêm quy tắc mới
          </button>
        </div>
      </div>

      {/* Live Interactive Tester */}
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
            <span>🧪</span> Xem trước hoạt động thực tế (Live Preview)
          </span>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">Thử danh xưng:</span>
            <select
              value={testSalutation}
              onChange={e => setTestSalutation(e.target.value)}
              className="bg-gray-900 border border-gray-700 text-xs rounded-md px-2 py-1 text-blue-400 font-semibold focus:outline-none focus:border-blue-500"
            >
              {rulesList.slice(0, 10).map(r => (
                <option key={r.key} value={r.key}>{r.key.toUpperCase()}</option>
              ))}
              <option value="Thầy">THẦY</option>
              <option value="Sếp">SẾP</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-gray-900/80 border border-gray-800 rounded-lg p-2.5 space-y-1">
            <div className="text-[10px] uppercase font-bold text-gray-500">Đầu câu / Sau dấu ngắt câu (Tự viết Hoa):</div>
            <div className="text-gray-200 font-medium">"{livePreviewStart}"</div>
          </div>

          <div className="bg-gray-900/80 border border-gray-800 rounded-lg p-2.5 space-y-1">
            <div className="text-[10px] uppercase font-bold text-gray-500">Giữa câu / Nối câu (Tự viết thường):</div>
            <div className="text-gray-200 font-medium">"{livePreviewMiddle}"</div>
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm kiếm danh xưng hoặc tự xưng..."
            className="w-full bg-gray-800 border border-gray-700 text-xs rounded-lg pl-8 pr-3 py-1.5 text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <svg className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
        </div>

        <div className="text-xs text-gray-400 font-medium">
          Tổng cộng: <strong className="text-blue-400">{rulesList.length}</strong> quy tắc
        </div>
      </div>

      {/* Rules Grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 text-xs">Đang tải danh sách quy tắc...</div>
      ) : rulesList.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/30 rounded-xl border border-gray-800 space-y-2">
          <p className="text-2xl">🔍</p>
          <p className="text-xs font-semibold text-gray-400">Không tìm thấy quy tắc xưng hô nào</p>
          <p className="text-[11px] text-gray-600">Thử tìm từ khóa khác hoặc bấm nút "Thêm quy tắc mới"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rulesList.map(item => (
            <div
              key={item.key}
              className="bg-gray-800/60 hover:bg-gray-800 border border-gray-700/60 hover:border-gray-600 rounded-xl p-3 flex items-center justify-between transition-all group shadow-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                {/* Khách xưng hô */}
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase font-bold text-gray-500">Khách:</span>
                  <span className="text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded capitalize">
                    {item.key}
                  </span>
                </div>

                <span className="text-gray-600 text-xs">➔</span>

                {/* Người gửi tự xưng */}
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase font-bold text-gray-500">Tự xưng:</span>
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded capitalize">
                    {item.value}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleOpenEdit(item.key, item.value)}
                  className="p-1 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                  title="Sửa quy tắc"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDeleteRule(item.key)}
                  className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  title="Xóa quy tắc"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Add / Edit Rule */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setIsModalOpen(false)}>
          <div
            className="bg-gray-800 border border-gray-700 rounded-xl p-5 w-full max-w-md space-y-4 shadow-2xl animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-700/80 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>{editingKey ? '✏️ Chỉnh sửa quy tắc' : '✨ Thêm quy tắc xưng hô mới'}</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white text-xs">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 font-semibold mb-1">
                  1. Danh xưng xưng hô của KHÁCH HÀNG (<code className="text-blue-400">{'{salutation}'}</code>):
                </label>
                <input
                  type="text"
                  value={inputKey}
                  onChange={e => setInputKey(e.target.value)}
                  placeholder="Ví dụ: Thầy, Sếp, Chú, Bác, Anh..."
                  className="w-full bg-gray-900 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
                <p className="text-[10px] text-gray-500 mt-0.5">Danh xưng lưu trong trường "Xưng hô" của liên hệ CRM.</p>
              </div>

              <div>
                <label className="block text-gray-400 font-semibold mb-1">
                  2. Từ TỰ XƯNG tương ứng của NGƯỜI GỬI (<code className="text-emerald-400">{'{tu_xung}'}</code>):
                </label>
                <input
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder="Ví dụ: em, con, cháu, mình..."
                  className="w-full bg-gray-900 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
                <p className="text-[10px] text-gray-500 mt-0.5">Viết ở dạng chữ thường. Hệ thống sẽ tự viết Hoa nếu đứng đầu câu.</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-700/80">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveRule}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : (editingKey ? 'Lưu thay đổi' : 'Thêm mới')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
