import React, { useState } from 'react';
import AppIcon from '@/components/common/AppIcon';

interface CampaignCloneModalProps {
  campaignName: string;
  totalContacts: number;
  onClose: () => void;
  onConfirm: (includeContacts: boolean, newName: string) => Promise<void>;
}

export default function CampaignCloneModal({ campaignName, totalContacts, onClose, onConfirm }: CampaignCloneModalProps) {
  const [includeContacts, setIncludeContacts] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneName, setCloneName] = useState(`${campaignName} (bản sao)`);

  const handleConfirm = async () => {
    if (!cloneName.trim()) return;
    setCloning(true);
    try {
      await onConfirm(includeContacts, cloneName.trim());
      onClose();
    } catch {
      // error notification handled by parent
    } finally {
      setCloning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-600 rounded-2xl w-[400px] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <AppIcon name="copy" className="text-blue-500" size={18} />
            <h3 className="font-semibold text-white text-sm">Nhân bản chiến dịch</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Campaign preview */}
          <div className="bg-gray-700/60 rounded-xl px-4 py-3">
            <p className="text-[11px] text-gray-500 mb-0.5">Chiến dịch gốc</p>
            <p className="text-sm text-white font-medium truncate">{campaignName}</p>
            <p className="text-xs text-gray-400 mt-0.5">{totalContacts} liên hệ</p>
          </div>

          {/* New name input */}
          <div>
            <label className="text-xs text-gray-400 font-medium mb-1.5 block">Tên bản sao</label>
            <input
              value={cloneName}
              onChange={e => setCloneName(e.target.value)}
              placeholder="Nhập tên cho bản sao..."
              className="w-full bg-gray-700 border border-gray-600 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {!cloneName.trim() && (
              <p className="text-[11px] text-red-400 mt-1">Tên không được để trống</p>
            )}
          </div>

          {/* Include contacts option */}
          <div>
            <p className="text-xs text-gray-400 font-semibold mb-2">Chọn phương thức sao chép:</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setIncludeContacts(true)}
                className={`flex flex-col items-center gap-1.5 p-3.5 rounded-xl border text-center transition-all ${
                  includeContacts
                    ? 'border-emerald-500 bg-emerald-500/15 text-white ring-1 ring-emerald-500/40 shadow-sm'
                    : 'border-gray-700 bg-gray-900/40 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                }`}
              >
                <AppIcon name="layers" className={includeContacts ? 'text-emerald-400' : 'text-gray-400'} size={20} />
                <span className="text-xs font-bold text-emerald-400">Sao chép CẢ Người Nhận</span>
                <span className="text-[11px] leading-snug opacity-80 mt-0.5">
                  Giữ nguyên kịch bản & toàn bộ <b className="text-white">{totalContacts}</b> người nhận.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIncludeContacts(false)}
                className={`flex flex-col items-center gap-1.5 p-3.5 rounded-xl border text-center transition-all ${
                  !includeContacts
                    ? 'border-blue-500 bg-blue-500/15 text-white ring-1 ring-blue-500/40 shadow-sm'
                    : 'border-gray-700 bg-gray-900/40 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                }`}
              >
                <AppIcon name="file_text" className={!includeContacts ? 'text-blue-400' : 'text-gray-400'} size={20} />
                <span className="text-xs font-bold text-blue-400">KHÔNG sao chép Người Nhận</span>
                <span className="text-[11px] leading-snug opacity-80 mt-0.5">
                  Chỉ clone kịch bản & cài đặt. Danh sách người nhận để trống (0).
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleConfirm}
            disabled={cloning || !cloneName.trim()}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 transition-colors font-medium flex items-center justify-center gap-1.5"
          >
            {cloning ? (
              'Đang nhân bản...'
            ) : (
              <>
                <AppIcon name="copy" className="text-white" size={14} />
                Nhân bản
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
