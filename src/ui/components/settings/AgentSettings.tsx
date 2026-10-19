import React, { useState, useEffect, useCallback } from 'react';
import ipc from '@/lib/ipc';
import { useAppStore } from '@/store/appStore';
import AppIcon from '../common/AppIcon';
import { showConfirm } from '../common/ConfirmDialog';

interface AgentKeyItem {
  id: number;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_revoked: number;
  isActive: boolean;
}

export default function AgentSettings() {
  const showNotification = useAppStore(s => s.showNotification);
  const [keys, setKeys] = useState<AgentKeyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyResult, setNewKeyResult] = useState<any | null>(null);

  // Form state
  const [formName, setFormName] = useState('Hermes Agent');
  const [formScopes, setFormScopes] = useState<string[]>(['read', 'send', 'crm']);
  const [formExpiresDays, setFormExpiresDays] = useState<number>(0);
  const [creating, setCreating] = useState(false);
  const [autoConfiguring, setAutoConfiguring] = useState(false);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ipc.agent?.listKeys();
      if (res?.success) {
        setKeys(res.keys || []);
      } else {
        showNotification(res?.error || 'Không tải được danh sách API Key', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showNotification('Vui lòng nhập tên ứng dụng / Agent', 'warning');
      return;
    }
    if (formScopes.length === 0) {
      showNotification('Vui lòng chọn ít nhất một quyền hạn (Scope)', 'warning');
      return;
    }

    setCreating(true);
    try {
      const res = await ipc.agent?.createKey({
        name: formName.trim(),
        scopes: formScopes,
        expiresDays: formExpiresDays > 0 ? formExpiresDays : undefined
      });

      if (res?.success && res.key) {
        setNewKeyResult(res.key);
        setShowCreateModal(false);
        setFormName('Hermes Agent');
        fetchKeys();
        showNotification('Đã tạo API Key mới thành công!', 'success');
      } else {
        showNotification(res?.error || 'Lỗi khi tạo API Key', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (item: AgentKeyItem) => {
    const ok = await showConfirm({
      title: 'Thu hồi API Key?',
      message: `Bạn có chắc muốn thu hồi quyền truy cập của "${item.name}" (${item.key_prefix})? Các Agent sử dụng key này sẽ bị ngắt kết nối ngay lập tức.`,
      confirmText: 'Thu hồi Key',
      variant: 'danger'
    });
    if (!ok) return;

    try {
      const res = await ipc.agent?.revokeKey(item.id);
      if (res?.success) {
        showNotification(`Đã thu hồi key "${item.name}"`, 'success');
        fetchKeys();
      } else {
        showNotification(res?.error || 'Lỗi khi thu hồi key', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleAutoConfigure = async (rawKey: string) => {
    setAutoConfiguring(true);
    try {
      const res = await ipc.agent?.autoConfigureMCP(rawKey);
      if (res?.success) {
        const details = [];
        if (res.results?.hermes) details.push('Hermes Agent');
        if (res.results?.antigravity) details.push('Antigravity IDE');
        showNotification(`Đã tự động cập nhật cấu hình cho: ${details.join(', ') || 'các hệ thống AI'}`, 'success');
      } else {
        showNotification(res?.error || 'Lỗi tự động cấu hình MCP', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setAutoConfiguring(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    showNotification('Đã sao chép vào bộ nhớ tạm!', 'success');
  };

  const toggleScope = (scope: string) => {
    setFormScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <AppIcon name="integration" size={18} className="text-blue-500" />
            AI Agent & MCP Access Keys
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Quản lý khóa xác thực API và phân quyền cho Hermes, Antigravity và các trợ lý AI điều khiển Zagi an toàn.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
        >
          <span>+</span> Tạo API Key Mới
        </button>
      </div>

      {/* ── Key List Card ── */}
      <div className="bg-gray-900/60 border border-gray-700/60 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
            Danh sách khóa hoạt động ({keys.length})
          </span>
          <button
            onClick={fetchKeys}
            disabled={loading}
            className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
          >
            <span>Làm mới</span>
          </button>
        </div>

        {keys.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-xs">
            Chưa có API Key nào được tạo. Bấm "+ Tạo API Key Mới" để cấp quyền kết nối cho Agent.
          </div>
        ) : (
          <div className="divide-y divide-gray-800/80">
            {keys.map(item => (
              <div key={item.id} className="p-4 flex items-center justify-between hover:bg-gray-800/30 transition-colors">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{item.name}</span>
                    <span className="font-mono text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded border border-gray-700">
                      {item.key_prefix}
                    </span>
                    {item.isActive ? (
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[11px] font-medium">
                        Hoạt động
                      </span>
                    ) : (
                      <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full text-[11px] font-medium">
                        Đã thu hồi
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-gray-400">Quyền:</span>
                    {item.scopes.map(s => (
                      <span key={s} className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.2 rounded text-[10px] font-mono">
                        {s}
                      </span>
                    ))}
                    <span className="text-[11px] text-gray-500 ml-2">
                      Tạo lúc: {new Date(item.created_at).toLocaleDateString('vi-VN')}
                    </span>
                    {item.last_used_at && (
                      <span className="text-[11px] text-gray-400 ml-2">
                        • Dùng lần cuối: {new Date(item.last_used_at).toLocaleTimeString('vi-VN')}
                      </span>
                    )}
                  </div>
                </div>

                {item.is_revoked === 0 && (
                  <button
                    onClick={() => handleRevokeKey(item)}
                    className="text-xs text-red-400 hover:text-red-300 hover:bg-red-950/30 px-2.5 py-1.5 rounded-lg border border-red-500/20 transition-colors"
                  >
                    Thu hồi
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal: New Key Created (Shows Raw Key Once) ── */}
      {newKeyResult && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5">
                <span>✓</span> API Key Đã Được Khởi Tạo Thành Công
              </h3>
              <button onClick={() => setNewKeyResult(null)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs p-3 rounded-lg leading-relaxed">
              ⚠️ <strong>Lưu ý bảo mật:</strong> Đây là lần duy nhất khóa bí mật này hiển thị dưới dạng văn bản. Vui lòng sao chép và lưu trữ an toàn hoặc bấm nút tự động cấu hình bên dưới.
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-300">Khóa API của bạn:</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={newKeyResult.rawKey}
                  className="flex-1 bg-gray-950 border border-gray-700 font-mono text-xs text-white px-3 py-2 rounded-lg select-all"
                />
                <button
                  onClick={() => handleCopy(newKeyResult.rawKey)}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-2 rounded-lg transition-colors font-medium"
                >
                  Sao chép
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleAutoConfigure(newKeyResult.rawKey)}
                disabled={autoConfiguring}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-colors font-medium shadow-sm"
              >
                <span>⚡</span> {autoConfiguring ? 'Đang cấu hình...' : 'Tự động chèn vào Hermes & Antigravity'}
              </button>

              <button
                type="button"
                onClick={() => setNewKeyResult(null)}
                className="text-xs text-gray-400 hover:text-white px-3 py-2"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Create Key Form ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form onSubmit={handleCreateKey} className="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-sm font-semibold text-white">Tạo API Key Mới</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-300">Tên Agent / Ứng dụng</label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Ví dụ: Hermes Production Agent, N8N Auto-Reply..."
                className="w-full bg-gray-950 border border-gray-700 text-xs text-white px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-300">Phân quyền hạn (Scopes)</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: 'read', label: 'read (Đọc tin & danh bạ)' },
                  { id: 'send', label: 'send (Gửi tin nhắn Zalo)' },
                  { id: 'crm', label: 'crm (Quản trị CRM)' },
                  { id: 'admin', label: 'admin (Toàn quyền hệ thống)' }
                ].map(item => (
                  <label key={item.id} className="flex items-center gap-2 p-2 bg-gray-950 border border-gray-800 rounded-lg cursor-pointer hover:border-gray-700">
                    <input
                      type="checkbox"
                      checked={formScopes.includes(item.id)}
                      onChange={() => toggleScope(item.id)}
                      className="rounded text-blue-500"
                    />
                    <span className="text-gray-300 text-[11px]">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-300">Thời hạn hết hạn</label>
              <select
                value={formExpiresDays}
                onChange={e => setFormExpiresDays(Number(e.target.value))}
                className="w-full bg-gray-950 border border-gray-700 text-xs text-white px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value={0}>Không bao giờ hết hạn (Khuyên dùng cho Agent nội bộ)</option>
                <option value={30}>30 Ngày</option>
                <option value={90}>90 Ngày</option>
                <option value={365}>1 Năm</option>
              </select>
            </div>

            <div className="pt-3 border-t border-gray-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-xs text-gray-400 hover:text-white px-3 py-2"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={creating}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                {creating ? 'Đang tạo...' : 'Tạo Key'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
