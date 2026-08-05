import React, { useState, useEffect } from 'react';
import ipc from '@/lib/ipc';
import { DEFAULT_SALUTATION_SELF_REF_MAP, capitalizeVietnamese } from '../../../../utils/salutationUtils';

interface BulkSalutationModalProps {
  selectedCount: number;
  onConfirm: (salutation: string, customSelfRef?: string) => Promise<void>;
  onClose: () => void;
}

export default function BulkSalutationModal({
  selectedCount,
  onConfirm,
  onClose,
}: BulkSalutationModalProps) {
  const [salutationMap, setSalutationMap] = useState<Record<string, string>>({ ...DEFAULT_SALUTATION_SELF_REF_MAP });
  const [selectedKey, setSelectedKey] = useState<string>('Anh');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customSalutation, setCustomSalutation] = useState<string>('');
  const [customSelfRef, setCustomSelfRef] = useState<string>('em');
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    async function fetchMap() {
      try {
        const res = await ipc.crm.getSalutationMap();
        if (res?.success && res.map) {
          setSalutationMap(res.map);
        }
      } catch (err) {
        console.error('Failed to load salutation map:', err);
      }
    }
    fetchMap();
  }, []);

  const handleSelectChange = (val: string) => {
    if (val === '__custom__') {
      setIsCustomMode(true);
    } else {
      setIsCustomMode(false);
      setSelectedKey(val);
    }
  };

  const currentSelfRef = isCustomMode
    ? customSelfRef.trim()
    : salutationMap[selectedKey.trim().toLowerCase()] || 'em';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    let targetSalutation = '';
    let targetSelfRef = '';

    if (isCustomMode) {
      if (!customSalutation.trim()) return;
      targetSalutation = capitalizeVietnamese(customSalutation.trim());
      targetSelfRef = customSelfRef.trim() || 'em';
    } else {
      targetSalutation = capitalizeVietnamese(selectedKey.trim());
      targetSelfRef = currentSelfRef;
    }

    setSubmitting(true);
    try {
      await onConfirm(targetSalutation, isCustomMode ? targetSelfRef : undefined);
      onClose();
    } catch (err: any) {
      alert(`Lỗi khi gán xưng hô: ${err.message || 'Không thể thực hiện'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-850">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🗣️</span>
            <div>
              <h3 className="font-semibold text-white text-base">Gán xưng hô hàng loạt</h3>
              <p className="text-xs text-gray-400">Đang chọn <span className="text-blue-400 font-bold">{selectedCount}</span> liên hệ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-700"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Chọn xưng hô của khách hàng
            </label>
            <select
              value={isCustomMode ? '__custom__' : selectedKey}
              onChange={e => handleSelectChange(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
            >
              {Object.keys(salutationMap).map(k => {
                const titleKey = capitalizeVietnamese(k);
                return (
                  <option key={k} value={titleKey}>
                    {titleKey} (Tự xưng: {salutationMap[k]})
                  </option>
                );
              })}
              <option value="__custom__">➕ Tạo xưng hô mới...</option>
            </select>
          </div>

          {/* Form thêm xưng hô mới */}
          {isCustomMode && (
            <div className="p-4 bg-blue-950/40 border border-blue-800/60 rounded-xl space-y-3 animate-fadeIn">
              <div>
                <label className="block text-xs font-medium text-blue-300 mb-1">
                  Xưng hô mới của Khách hàng <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={customSalutation}
                  onChange={e => setCustomSalutation(e.target.value)}
                  placeholder="Ví dụ: Sếp, Thầy, Cô giáo..."
                  required
                  autoFocus
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-blue-300 mb-1">
                  Từ tự xưng tương ứng của Người gửi <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={customSelfRef}
                  onChange={e => setCustomSelfRef(e.target.value)}
                  placeholder="Ví dụ: em, trò, cháu..."
                  required
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <p className="text-[11px] text-blue-300/80 leading-relaxed">
                ℹ️ Xưng hô mới sẽ được tự động lưu vào quy tắc hệ thống để dùng cho biến <code className="text-blue-400">{'{salutation}'}</code> và <code className="text-emerald-400">{'{tu_xung}'}</code> trong chiến dịch & tin nhắn.
              </p>
            </div>
          )}

          {/* Preview Card */}
          <div className="p-3.5 bg-gray-900/80 border border-gray-750 rounded-xl flex items-center justify-between text-xs">
            <span className="text-gray-400">Xem trước giao tiếp:</span>
            <div className="text-right font-medium">
              <span className="text-blue-400">{isCustomMode ? (customSalutation.trim() || 'Khách') : selectedKey}</span>
              <span className="text-gray-500 mx-1.5">↔</span>
              <span className="text-emerald-400">{currentSelfRef || 'em'}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting || (isCustomMode && (!customSalutation.trim() || !customSelfRef.trim()))}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  Đang cập nhật...
                </>
              ) : (
                'Xác nhận gán xưng hô'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
