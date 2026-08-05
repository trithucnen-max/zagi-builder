import React, { useState, useEffect } from 'react';
import ipc from '@/lib/ipc';
import { useVisibleAccounts } from '@/hooks/useVisibleAccounts';

interface AccountQuotaModalProps {
  zaloId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function AccountQuotaModal({ zaloId, onClose, onSaved }: AccountQuotaModalProps) {
  const visibleAccounts = useVisibleAccounts();
  const zaloAccounts = visibleAccounts.filter(a => (a.channel || 'zalo') === 'zalo');

  const [selectedZaloId, setSelectedZaloId] = useState<string>(zaloId || (zaloAccounts[0]?.zalo_id ?? ''));
  const [msgLimit, setMsgLimit] = useState(50);
  const [inviteLimit, setInviteLimit] = useState(50);
  const [scanDailyLimit, setScanDailyLimit] = useState(100);
  const [scanHourlyLimit, setScanHourlyLimit] = useState(30);
  const [applyToAll, setApplyToAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [scanQuotaInfo, setScanQuotaInfo] = useState<any>(null);
  const selectedAccount = zaloAccounts.find(a => a.zalo_id === selectedZaloId);

  useEffect(() => {
    if (!selectedZaloId) return;
    setLoading(true);
    Promise.all([
      ipc.crm.getAccountQuota({ zaloId: selectedZaloId }),
      ipc.crm.getScanQuotaSummary()
    ]).then(([quotaRes, scanRes]) => {
      if (quotaRes.success) {
        setMsgLimit(quotaRes.msgLimit ?? 50);
        setInviteLimit(quotaRes.inviteLimit ?? 50);
      }
      if (scanRes?.success && scanRes.data) {
        const item = scanRes.data.find((a: any) => a.zaloId === selectedZaloId);
        if (item) {
          setScanDailyLimit(item.scanDailyLimit || 100);
          setScanHourlyLimit(item.scanHourlyLimit || 30);
          setScanQuotaInfo(item);
        } else {
          setScanQuotaInfo(null);
        }
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedZaloId]);

  const handleSave = async () => {
    if (msgLimit < 1 || inviteLimit < 1 || scanDailyLimit < 1 || scanHourlyLimit < 1) {
      setError('Định mức tối thiểu là 1');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (applyToAll && zaloAccounts.length > 0) {
        const promises = zaloAccounts.flatMap(acc => [
          ipc.crm.setAccountQuota({ zaloId: acc.zalo_id, msgLimit, inviteLimit }),
          ipc.crm.setAccountScanLimits({ zaloId: acc.zalo_id, scanDailyLimit, scanHourlyLimit })
        ]);
        await Promise.all(promises);
      } else {
        const [res1, res2] = await Promise.all([
          ipc.crm.setAccountQuota({ zaloId: selectedZaloId, msgLimit, inviteLimit }),
          ipc.crm.setAccountScanLimits({ zaloId: selectedZaloId, scanDailyLimit, scanHourlyLimit })
        ]);
        if (!res1.success || !res2.success) {
          setError(res1.error || res2.error || 'Lưu thất bại');
          setSaving(false);
          return;
        }
      }
      onSaved();
      onClose();
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
        {/* Header với Avatar, Tên Nick Zalo thực tế & Dropdown chuyển nick */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {selectedAccount?.avatar ? (
              <img
                src={selectedAccount.avatar}
                alt=""
                className="w-9 h-9 rounded-full object-cover border border-gray-200 dark:border-gray-700 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-sm shrink-0">
                {(selectedAccount?.name || selectedAccount?.display_name || 'Z').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                Định mức An toàn Zalo
              </h3>
              {zaloAccounts.length > 1 ? (
                <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-semibold mt-0.5">
                  <span>👤</span>
                  <select
                    value={selectedZaloId}
                    onChange={e => setSelectedZaloId(e.target.value)}
                    className="bg-transparent text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline focus:outline-none cursor-pointer p-0 border-none truncate max-w-[200px]"
                  >
                    {zaloAccounts.map(acc => (
                      <option key={acc.zalo_id} value={acc.zalo_id} className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-medium">
                        {acc.name || acc.display_name || acc.zalo_id} {acc.phone ? `(${acc.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium truncate">
                  👤 <span className="font-bold text-gray-800 dark:text-gray-200">{selectedAccount?.name || selectedAccount?.display_name || selectedZaloId}</span>
                  {selectedAccount?.phone ? ` (${selectedAccount.phone})` : ''}
                </p>
              )}
              {scanQuotaInfo && (
                <div className="mt-1">
                  {scanQuotaInfo.status === 'active' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                      🟢 Bình thường (Đã quét: {scanQuotaInfo.todayCount}/{scanQuotaInfo.scanDailyLimit} số hôm nay)
                    </span>
                  ) : scanQuotaInfo.status === 'hourly_quota' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                      ⏱️ Chạm hạn ngạch GIỜ (Mã -216)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">
                      🔴 Chạm hạn ngạch NGÀY (Mã -216) - Reset 00:00
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-xl leading-none ml-2">×</button>
        </div>

        <div className="px-5 py-5 space-y-5 overflow-y-auto">
          {loading ? (
            <div className="text-center py-6 text-gray-400 text-sm">Đang tải định mức...</div>
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

              {/* Tùy chọn Áp dụng cho TẤT CẢ Tài khoản Zalo (Option C feature) */}
              {zaloAccounts.length > 1 && (
                <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-300 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                    <input
                      type="checkbox"
                      checked={applyToAll}
                      onChange={e => setApplyToAll(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                    <span>🌐 Áp dụng mẫu định mức này cho <strong>tất cả ({zaloAccounts.length}) tài khoản Zalo</strong></span>
                  </label>
                </div>
              )}

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

        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
            Hủy
          </button>
          <button onClick={handleSave} disabled={saving || loading}
            className="px-5 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md active:scale-95">
            {saving ? 'Đang lưu...' : (applyToAll ? `Lưu cho tất cả (${zaloAccounts.length}) nick` : 'Lưu cài đặt')}
          </button>
        </div>
      </div>
    </div>
  );
}
