import React, { useState, useEffect } from 'react';
import ipc from '@/lib/ipc';

interface AccountQuotaModalProps {
  zaloId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function AccountQuotaModal({ zaloId, onClose, onSaved }: AccountQuotaModalProps) {
  const [msgLimit, setMsgLimit] = useState(50);
  const [inviteLimit, setInviteLimit] = useState(50);
  const [scanDailyLimit, setScanDailyLimit] = useState(100);
  const [scanHourlyLimit, setScanHourlyLimit] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      ipc.crm.getAccountQuota({ zaloId }),
      ipc.crm.getScanQuotaSummary()
    ]).then(([quotaRes, scanRes]) => {
      if (quotaRes.success) {
        setMsgLimit(quotaRes.msgLimit ?? 50);
        setInviteLimit(quotaRes.inviteLimit ?? 50);
      }
      if (scanRes?.success && scanRes.data) {
        const item = scanRes.data.find(a => a.zaloId === zaloId);
        if (item) {
          setScanDailyLimit(item.scanDailyLimit || 100);
          setScanHourlyLimit(item.scanHourlyLimit || 30);
        }
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [zaloId]);

  const handleSave = async () => {
    if (msgLimit < 1 || inviteLimit < 1 || scanDailyLimit < 1 || scanHourlyLimit < 1) {
      setError('Định mức tối thiểu là 1');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const [res1, res2] = await Promise.all([
        ipc.crm.setAccountQuota({ zaloId, msgLimit, inviteLimit }),
        ipc.crm.setAccountScanLimits({ zaloId, scanDailyLimit, scanHourlyLimit })
      ]);
      if (res1.success && res2.success) {
        onSaved();
        onClose();
      } else {
        setError(res1.error || res2.error || 'Lưu thất bại');
      }
    } catch (e: any) {
      setError(e.message || 'Lỗi không xác định');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            <div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">Định mức An toàn Zalo</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">ID: <span className="font-mono text-blue-500">{zaloId}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-xl leading-none">×</button>
        </div>

        <div className="px-5 py-5 space-y-5 overflow-y-auto">
          {loading ? (
            <div className="text-center py-6 text-gray-400 text-sm">Đang tải...</div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center text-sm">💬</span>
                  Tin nhắn người lạ / ngày
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number" min={1} max={100} value={msgLimit}
                    onChange={e => setMsgLimit(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                    className={`w-24 bg-gray-50 dark:bg-gray-800 border rounded-xl px-3 py-2 text-sm font-bold text-center focus:outline-none transition-colors ${
                      msgLimit > 50 ? 'border-red-500/50 text-red-500' : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'
                    }`}
                  />
                  <div className="flex-1">
                    <input type="range" min={1} max={100} value={Math.min(100, msgLimit)}
                      onChange={e => setMsgLimit(parseInt(e.target.value))}
                      className={`w-full ${msgLimit > 50 ? 'accent-red-500' : 'accent-amber-500'}`} />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-0.5"><span>1</span><span>50</span><span className="text-red-400 font-bold">100</span></div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-sm">👤</span>
                  Lời mời kết bạn / ngày
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number" min={1} max={100} value={inviteLimit}
                    onChange={e => setInviteLimit(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                    className={`w-24 bg-gray-50 dark:bg-gray-800 border rounded-xl px-3 py-2 text-sm font-bold text-center focus:outline-none transition-colors ${
                      inviteLimit > 50 ? 'border-red-500/50 text-red-500' : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'
                    }`}
                  />
                  <div className="flex-1">
                    <input type="range" min={1} max={100} value={Math.min(100, inviteLimit)}
                      onChange={e => setInviteLimit(parseInt(e.target.value))}
                      className={`w-full ${inviteLimit > 50 ? 'accent-red-500' : 'accent-emerald-500'}`} />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-0.5"><span>1</span><span>50</span><span className="text-red-400 font-bold">100</span></div>
                  </div>
                </div>
              </div>

              {/* Định mức Quét SĐT */}
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  <span className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center text-sm">🔍</span>
                  Định mức Quét SĐT Zalo
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-gray-500 block mb-1">Quét tối đa / ngày</span>
                    <input
                      type="number" min={1} max={500} value={scanDailyLimit}
                      onChange={e => setScanDailyLimit(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 dark:text-white text-center focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block mb-1">Quét tối đa / giờ</span>
                    <input
                      type="number" min={1} max={100} value={scanHourlyLimit}
                      onChange={e => setScanHourlyLimit(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 dark:text-white text-center focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Nút chọn nhanh (Quick Presets) */}
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <span>⚡ Chọn nhanh mẫu định mức:</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setMsgLimit(15); setInviteLimit(15); setScanDailyLimit(30); setScanHourlyLimit(10); }}
                    className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-900 dark:text-amber-300 text-[11px] text-center font-bold transition-all active:scale-95"
                  >
                    <div>🌱 Nick mới</div>
                    <div className="text-[10px] opacity-80 font-normal">15 tin / 30 quét</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setMsgLimit(30); setInviteLimit(30); setScanDailyLimit(100); setScanHourlyLimit(30); }}
                    className="p-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-900 dark:text-blue-300 text-[11px] text-center font-bold transition-all active:scale-95"
                  >
                    <div>🌿 N.Thường</div>
                    <div className="text-[10px] opacity-80 font-normal">30 tin / 100 quét</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setMsgLimit(50); setInviteLimit(50); setScanDailyLimit(200); setScanHourlyLimit(30); }}
                    className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-900 dark:text-emerald-300 text-[11px] text-center font-bold transition-all active:scale-95 cursor-pointer"
                  >
                    <div>🌳 Nick cũ</div>
                    <div className="text-[10px] opacity-80 font-normal">50 tin / 200 quét</div>
                  </button>
                </div>
              </div>

              {/* Recommendation Disclaimer Note & Risk Warning */}
              {(msgLimit > 50 || inviteLimit > 50) ? (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2 text-[11px] text-red-600 dark:text-red-400 leading-relaxed">
                  <span className="text-base shrink-0">⚠️</span>
                  <div>
                    <span className="font-bold block">Cảnh báo rủi ro (Vượt ngưỡng an toàn &gt; 50/ngày):</span>
                    <p className="mt-0.5 opacity-90">
                      Đặt định mức trên 50 tin nhắn hoặc lời mời kết bạn mỗi ngày có nguy cơ cao vi phạm chính sách chống spam của Zalo. Người dùng tự chịu trách nhiệm nếu tài khoản bị Zalo khóa hoặc hạn chế tính năng.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-955/30 border border-amber-200 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5 leading-relaxed">
                  <span className="shrink-0 text-amber-500 mt-0.5">💡</span>
                  <span>
                    <strong>Khuyến nghị:</strong> Nguồn định mức an toàn tốt nhất là dưới 50/ngày. Số liệu thực tế có thể thay đổi tùy theo độ tuổi nick và chính sách của Zalo tại từng thời điểm.
                  </span>
                </div>
              )}

              {error && (
                <div className="text-red-500 text-xs text-center bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
            Hủy
          </button>
          <button onClick={handleSave} disabled={saving || loading}
            className="px-5 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md active:scale-95">
            {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
          </button>
        </div>
      </div>
    </div>
  );
}
