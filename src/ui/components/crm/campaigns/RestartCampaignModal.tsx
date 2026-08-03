import React, { useState } from 'react';
import ipc from '@/lib/ipc';
import { useAppStore } from '@/store/appStore';

interface RestartCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: any;
  zaloId: string;
  onSuccess: () => void;
}

export const RestartCampaignModal: React.FC<RestartCampaignModalProps> = ({
  isOpen,
  onClose,
  campaign,
  zaloId,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'failed_only' | 'all'>('failed_only');
  const [autoTagBlocked, setAutoTagBlocked] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen || !campaign) return null;

  const total = Number(campaign.total_contacts || 0);
  const sent = Number(campaign.sent_count || 0);
  const failed = Number(campaign.failed_count || 0);

  const handleStart = async () => {
    const showNotification = useAppStore.getState().showNotification;
    setSubmitting(true);
    try {
      if (mode === 'all') {
        const res = await ipc.crm?.restartCampaign({ zaloId, campaignId: campaign.id });
        if (res?.success === false) {
          showNotification(res.error || 'Không thể chạy lại chiến dịch', 'error');
        } else {
          showNotification('🔄 Đã đặt lại và bắt đầu chạy chiến dịch cho toàn bộ liên hệ', 'success');
          onSuccess();
          onClose();
        }
      } else {
        const res = await ipc.crm?.retryFailedContacts({
          zaloId,
          campaignId: campaign.id,
          autoTagBlocked,
        });
        if (res?.success === false) {
          showNotification(res.error || 'Không thể chạy lại các liên hệ lỗi', 'error');
        } else {
          const resetCount = res?.resetCount ?? failed;
          const blockedCount = res?.blockedCount ?? 0;
          let msg = `🎯 Đã bắt đầu chạy lại cho ${resetCount} liên hệ`;
          if (blockedCount > 0) {
            msg += ` (đã bỏ qua & gắn tag cho ${blockedCount} liên hệ bị chặn người lạ)`;
          }
          showNotification(msg, 'info');
          onSuccess();
          onClose();
        }
      }
    } catch (err: any) {
      showNotification(err.message || 'Lỗi xử lý', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-lg w-full border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-blue-500/5 to-indigo-500/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl font-bold">
              🔄
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Chọn chế độ chạy lại chiến dịch
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[280px]">
                {campaign.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Stats summary bar */}
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400 font-medium">Thống kê hiện tại:</span>
          <div className="flex items-center gap-3 font-bold">
            <span className="text-gray-700 dark:text-gray-300">Tổng: {total}</span>
            <span className="text-emerald-600 dark:text-emerald-400">✓ Thành công: {sent}</span>
            <span className="text-rose-600 dark:text-rose-400">✕ Thất bại: {failed}</span>
          </div>
        </div>

        {/* Modal Body - Card Options */}
        <div className="p-6 space-y-4">
          {/* Card Option 2: Retry Failed (Recommended) */}
          <div
            onClick={() => setMode('failed_only')}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
              mode === 'failed_only'
                ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 shadow-md scale-[1.01]'
                : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="restartMode"
                checked={mode === 'failed_only'}
                onChange={() => setMode('failed_only')}
                className="mt-1 accent-blue-600"
              />
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    🎯 Chỉ chạy các liên hệ chưa gửi được
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-600 text-white uppercase tracking-wider">
                    Khuyên dùng
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  Giữ nguyên <strong className="text-emerald-600 dark:text-emerald-400">{sent}</strong> liên hệ đã gửi thành công. Chỉ đặt lại các liên hệ bị lỗi (quá hạn mức ngày/lỗi mạng) về trạng thái chờ gửi để gửi bổ sung.
                </p>
                <div className="pt-1.5 text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <span>ℹ️</span>
                  <span>Tự động phân loại và bỏ qua các liên hệ cài đặt chặn người lạ/SĐT rác.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card Option 1: Restart All */}
          <div
            onClick={() => setMode('all')}
            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
              mode === 'all'
                ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 shadow-md scale-[1.01]'
                : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="restartMode"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
                className="mt-1 accent-blue-600"
              />
              <div className="flex-1 space-y-1">
                <span className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  👥 Chạy lại cho toàn bộ liên hệ ({total} liên hệ)
                </span>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                  Đặt lại trạng thái của tất cả {total} liên hệ (cả thành công & thất bại) về trạng thái <strong>Chờ gửi</strong> và gửi lại từ đầu cho toàn bộ danh sách.
                </p>
              </div>
            </div>
          </div>

          {/* Auto Tag Option */}
          {mode === 'failed_only' && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200/60 dark:border-gray-800 flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                id="autoTagCheckbox"
                checked={autoTagBlocked}
                onChange={(e) => setAutoTagBlocked(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 accent-blue-600"
              />
              <label htmlFor="autoTagCheckbox" className="cursor-pointer select-none font-medium">
                Tự động gắn nhãn <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 font-bold border border-red-500/20">🚫 Chặn người lạ</span> trong CRM cho các liên hệ bị chặn
              </label>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-2xs"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={submitting}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <span>🔄</span>
                <span>Bắt đầu chạy lại</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
