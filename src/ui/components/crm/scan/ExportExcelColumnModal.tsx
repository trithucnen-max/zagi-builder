import React, { useState } from 'react';

export interface ColumnOption {
  key: string;
  label: string;
  defaultChecked?: boolean;
}

export const EXPORT_COLUMNS: ColumnOption[] = [
  { key: 'stt', label: 'STT (Số thứ tự)', defaultChecked: true },
  { key: 'phone', label: 'Số điện thoại', defaultChecked: true },
  { key: 'full_name_raw', label: 'Họ tên gốc (CSV / CRM)', defaultChecked: true },
  { key: 'status', label: 'Trạng thái Zalo (Có Zalo / Không / Lỗi)', defaultChecked: true },
  { key: 'zalo_name', label: 'Tên Zalo', defaultChecked: true },
  { key: 'zalo_uid', label: 'Zalo UID', defaultChecked: true },
  { key: 'gender', label: 'Giới tính', defaultChecked: true },
  { key: 'dob', label: 'Ngày sinh', defaultChecked: true },
  { key: 'scanned_by', label: 'Tài khoản quét Zalo', defaultChecked: true },
  { key: 'target_account', label: 'Tài khoản nhận CRM', defaultChecked: true },
  { key: 'error_msg', label: 'Ghi chú lỗi / Thông báo', defaultChecked: true },
  { key: 'scanned_at', label: 'Thời gian quét', defaultChecked: true },
];

interface ExportExcelColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchName: string;
  onConfirmExport: (selectedKeys: string[]) => void;
}

export const ExportExcelColumnModal: React.FC<ExportExcelColumnModalProps> = ({
  isOpen,
  onClose,
  batchName,
  onConfirmExport
}) => {
  const [selectedKeys, setSelectedKeys] = useState<string[]>(
    EXPORT_COLUMNS.filter(c => c.defaultChecked).map(c => c.key)
  );

  if (!isOpen) return null;

  const toggleKey = (key: string) => {
    setSelectedKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const selectAll = () => {
    setSelectedKeys(EXPORT_COLUMNS.map(c => c.key));
  };

  const deselectAll = () => {
    // Keep at least phone & status
    setSelectedKeys(['phone', 'status']);
  };

  const handleExport = () => {
    if (selectedKeys.length === 0) {
      alert('Vui lòng chọn ít nhất 1 trường dữ liệu để xuất file Excel');
      return;
    }
    onConfirmExport(selectedKeys);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-3xl max-w-lg w-full border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3.5">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>📥</span> Xuất Excel báo cáo quét SĐT
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
              Lô: <span className="font-bold text-gray-700 dark:text-gray-200">{batchName}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Column selection header & actions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
              Lựa chọn trường thông tin tải về ({selectedKeys.length}/{EXPORT_COLUMNS.length}):
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs font-semibold text-blue-500 hover:text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Chọn tất cả
              </button>
              <span className="text-gray-300 dark:text-gray-700">|</span>
              <button
                type="button"
                onClick={deselectAll}
                className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:underline cursor-pointer"
              >
                Bỏ chọn
              </button>
            </div>
          </div>

          {/* Checklist Grid */}
          <div className="grid grid-cols-2 gap-2.5 max-h-[280px] overflow-y-auto pr-1 p-1">
            {EXPORT_COLUMNS.map(col => {
              const isChecked = selectedKeys.includes(col.key);
              return (
                <label
                  key={col.key}
                  onClick={() => toggleKey(col.key)}
                  className={`flex items-center gap-2.5 p-3 rounded-2xl border text-xs font-semibold cursor-pointer transition-all ${
                    isChecked
                      ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 shadow-2xs'
                      : 'border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    className="w-4 h-4 rounded-md text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="truncate">{col.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-2 grid grid-cols-2 gap-3 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs transition-colors text-center cursor-pointer"
          >
            Hủy
          </button>

          <button
            type="button"
            onClick={handleExport}
            disabled={selectedKeys.length === 0}
            className="py-2.5 px-5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all text-center disabled:opacity-50 active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>📥</span> Tải file Excel
          </button>
        </div>
      </div>
    </div>
  );
};
