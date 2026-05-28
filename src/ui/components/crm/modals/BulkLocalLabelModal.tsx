import React, { useState } from 'react';
import ipc from '@/lib/ipc';
import { useAppStore } from '@/store/appStore';
import { useCRMStore } from '@/store/crmStore';
import LocalLabelSelector from '@/components/common/LocalLabelSelector';

interface BulkLocalLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedContactIds: Set<string>;
  localLabels: Array<{ id: number; name: string; color: string; text_color?: string; emoji?: string }>;
  activeAccountId: string | null;
  onSuccess: () => void;
}

export default function BulkLocalLabelModal({
  isOpen,
  onClose,
  selectedContactIds,
  localLabels,
  activeAccountId,
  onSuccess,
}: BulkLocalLabelModalProps) {
  const [bulkLocalLabelIds, setBulkLocalLabelIds] = useState<number[]>([]);
  const [applyingBulkLabel, setApplyingBulkLabel] = useState(false);
  const { showNotification } = useAppStore();
  const store = useCRMStore();

  if (!isOpen) return null;

  const handleApplyBulkLocalLabel = async () => {
    if (!activeAccountId || bulkLocalLabelIds.length === 0) return;
    setApplyingBulkLabel(true);
    try {
      const contactIds = Array.from(selectedContactIds);
      for (const labelId of bulkLocalLabelIds) {
        for (const contactId of contactIds) {
          await ipc.db?.assignLocalLabelToThread({ zaloId: activeAccountId, labelId, threadId: contactId });
        }
      }
      showNotification(`Đã gán Nhãn Local cho ${contactIds.length} liên hệ`, 'success');
      setBulkLocalLabelIds([]);
      store.clearSelection();
      window.dispatchEvent(new CustomEvent('local-labels-changed', { detail: { zaloId: activeAccountId } }));
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Không rõ';
      showNotification('Lỗi: ' + errMsg, 'error');
    } finally {
      setApplyingBulkLabel(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-600 rounded-2xl w-80 p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-white mb-1">💾 Gán Nhãn Local</h3>
        <p className="text-xs text-gray-400 mb-3">
          Áp dụng cho <span className="text-blue-400 font-medium">{selectedContactIds.size}</span> liên hệ đã chọn
          <span className="text-gray-500 ml-1">(chọn nhiều)</span>
        </p>
        {localLabels.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center">Chưa có Nhãn Local nào.</p>
        ) : (
          <LocalLabelSelector
            labels={localLabels}
            selectedIds={bulkLocalLabelIds}
            onChange={setBulkLocalLabelIds}
            placeholder="Chọn Nhãn Local..."
            emptyText="Chưa có Nhãn Local nào"
          />
        )}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm hover:bg-gray-600">
            Hủy
          </button>
          <button
            onClick={handleApplyBulkLocalLabel}
            disabled={bulkLocalLabelIds.length === 0 || applyingBulkLabel}
            className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40"
          >
            {applyingBulkLabel ? 'Đang gán...' : 'Áp dụng'}
          </button>
        </div>
      </div>
    </div>
  );
}
