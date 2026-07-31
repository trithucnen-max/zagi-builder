import React, { useState } from 'react';
import { useVisibleAccounts } from '@/hooks/useVisibleAccounts';
import { useAppStore } from '@/store/appStore';
import ipc from '@/lib/ipc';

interface CopyCampaignToAccountsModalProps {
  campaignId: number;
  campaignName: string;
  currentZaloId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CopyCampaignToAccountsModal({
  campaignId,
  campaignName,
  currentZaloId,
  onClose,
  onSuccess,
}: CopyCampaignToAccountsModalProps) {
  const { showNotification } = useAppStore();
  const visibleAccounts = useVisibleAccounts();

  // Selected target Zalo IDs (exclude current account by default, or empty)
  const [selectedZaloIds, setSelectedZaloIds] = useState<string[]>([]);
  const [copyName, setCopyName] = useState(campaignName);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available target accounts (all accounts or exclude current)
  const availableAccounts = visibleAccounts;

  const toggleSelectAll = () => {
    if (selectedZaloIds.length === availableAccounts.length) {
      setSelectedZaloIds([]);
    } else {
      setSelectedZaloIds(availableAccounts.map(a => a.zalo_id));
    }
  };

  const toggleAccount = (zaloId: string) => {
    setSelectedZaloIds(prev =>
      prev.includes(zaloId) ? prev.filter(id => id !== zaloId) : [...prev, zaloId]
    );
  };

  const handleConfirmCopy = async () => {
    if (selectedZaloIds.length === 0) {
      showNotification('Vui lòng chọn ít nhất 1 tài khoản Zalo đích', 'error');
      return;
    }
    if (!copyName.trim()) {
      showNotification('Vui lòng nhập tên chiến dịch', 'error');
      return;
    }

    setIsSubmitting(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const targetZaloId of selectedZaloIds) {
        const res: any = await ipc.crm.cloneCampaign({
          zaloId: targetZaloId,
          campaignId,
          includeContacts: false, // MANDATORY: only copy campaign content/config, contacts list remains empty (0)
          newName: copyName.trim(),
        });

        if (res?.success) {
          successCount++;
        } else {
          failCount++;
        }
      }

      if (successCount > 0) {
        showNotification(
          `Đã sao chép kịch bản thành công sang ${successCount} tài khoản Zalo! (Trạng thái: Nháp - Đối tượng: 0 liên hệ)`,
          'success'
        );
        if (onSuccess) onSuccess();
        onClose();
      } else {
        showNotification('Không thể sao chép chiến dịch sang các tài khoản đã chọn', 'error');
      }
    } catch (err: any) {
      showNotification(`Lỗi khi sao chép: ${err.message || 'Không xác định'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const allSelected = availableAccounts.length > 0 && selectedZaloIds.length === availableAccounts.length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-750 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center text-base font-bold">
              📋
            </div>
            <div>
              <h3 className="font-extrabold text-gray-900 dark:text-white text-sm">Sao chép sang Zalo khác</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Nhân bản kịch bản gửi tin/kết bạn sang các tài khoản Zalo làm việc
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center font-bold"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Informational Banner */}
          <div className="p-3.5 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl text-xs text-blue-900 dark:text-blue-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-blue-800 dark:text-blue-200">
              <span>💡</span>
              <span>Quy tắc sao chép kịch bản:</span>
            </div>
            <p className="text-[11px] text-blue-800/90 dark:text-blue-300/90 leading-relaxed">
              • Giữ nguyên toàn bộ <b>nội dung tin nhắn, lời kết bạn, thời gian delay ngẫu nhiên & khung giờ yên tĩnh</b>.
              <br />
              • Danh sách người nhận trên Zalo mới sẽ <b>để trống (0 liên hệ)</b> với trạng thái <b>Tạm dừng/Nháp</b> để anh/chị chủ động chọn nhãn hoặc liên hệ phù hợp với nick Zalo đó.
            </p>
          </div>

          {/* Source Campaign Info */}
          <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 rounded-xl p-3">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5">Chiến dịch gốc</span>
            <p className="text-xs font-extrabold text-gray-900 dark:text-white truncate">{campaignName}</p>
          </div>

          {/* New Campaign Name Input */}
          <div>
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1.5">
              Tên chiến dịch tạo ở Zalo mới:
            </label>
            <input
              type="text"
              value={copyName}
              onChange={e => setCopyName(e.target.value)}
              placeholder="Nhập tên chiến dịch..."
              className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Target Zalo Accounts Picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                Chọn Zalo nhận kịch bản ({selectedZaloIds.length}/{availableAccounts.length}):
              </label>
              {availableAccounts.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </button>
              )}
            </div>

            <div className="border border-gray-200 dark:border-gray-700 rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
              {availableAccounts.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400">
                  Không tìm thấy tài khoản Zalo khả dụng
                </div>
              ) : (
                availableAccounts.map(acc => {
                  const isChecked = selectedZaloIds.includes(acc.zalo_id);
                  const isCurrent = acc.zalo_id === currentZaloId;

                  return (
                    <label
                      key={acc.zalo_id}
                      className={`flex items-center justify-between p-2.5 cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-blue-50/50 dark:bg-blue-950/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleAccount(acc.zalo_id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        {acc.avatar || (acc as any).avatar_url ? (
                          <img
                            src={acc.avatar || (acc as any).avatar_url}
                            alt=""
                            className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center text-xs">
                            {(acc.name || acc.display_name || 'Z').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-gray-900 dark:text-white truncate flex items-center gap-1.5">
                            <span>{acc.name || acc.display_name || acc.zalo_id}</span>
                            {isCurrent && (
                              <span className="text-[10px] bg-gray-200 dark:bg-gray-750 text-gray-600 dark:text-gray-300 px-1.5 py-0.2 rounded-md font-medium">
                                Hiện tại
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-gray-400 truncate">
                            {acc.zalo_id}
                          </div>
                        </div>
                      </div>

                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${
                        isChecked
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
                          : 'text-gray-400'
                      }`}>
                        {isChecked ? 'Đã chọn' : 'Chưa chọn'}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-gray-200 dark:border-gray-750 bg-gray-50/50 dark:bg-gray-900/50 flex items-center justify-between">
          <span className="text-xs text-gray-500 font-medium">
            Đã chọn: <b className="text-blue-600 dark:text-blue-400">{selectedZaloIds.length}</b> tài khoản
          </span>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800 transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="button"
              onClick={handleConfirmCopy}
              disabled={isSubmitting || selectedZaloIds.length === 0 || !copyName.trim()}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>⏳ Đang sao chép...</>
              ) : (
                <>📋 Sao chép ngay ({selectedZaloIds.length})</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
