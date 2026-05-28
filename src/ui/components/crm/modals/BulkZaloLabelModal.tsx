import React, { useState } from 'react';
import ipc from '@/lib/ipc';
import { useAppStore, LabelData } from '@/store/appStore';
import { useCRMStore } from '@/store/crmStore';
import { useAccountStore } from '@/store/accountStore';
import ZaloLabelSelector from '../tags/ZaloLabelSelector';

interface BulkZaloLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedContactIds: Set<string>;
  zaloLabels: LabelData[];
  activeAccountId: string | null;
}

export default function BulkZaloLabelModal({
  isOpen,
  onClose,
  selectedContactIds,
  zaloLabels,
  activeAccountId,
}: BulkZaloLabelModalProps) {
  const [bulkLabelIds, setBulkLabelIds] = useState<number[]>([]);
  const [applyingBulkLabel, setApplyingBulkLabel] = useState(false);
  const { showNotification, setLabels } = useAppStore();
  const store = useCRMStore();

  if (!isOpen) return null;

  const handleApplyBulkLabel = async () => {
    if (!activeAccountId || bulkLabelIds.length === 0) return;
    setApplyingBulkLabel(true);
    try {
      const acc = useAccountStore.getState().getActiveAccount();
      if (!acc) throw new Error('Không tìm thấy tài khoản hoạt động');
      const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };

      // Fetch fresh labels to avoid version mismatch
      const freshRes = await ipc.zalo?.getLabels({ auth });
      const freshLabels: LabelData[] = freshRes?.response?.labelData || zaloLabels;
      const version: number = freshRes?.response?.version || 0;

      const contactIds = Array.from(selectedContactIds);
      const updated = freshLabels.map(label => {
        if (!bulkLabelIds.includes(label.id)) return label;
        const existing = new Set(label.conversations || []);
        contactIds.forEach(id => existing.add(id));
        return { ...label, conversations: [...existing] };
      });

      const res = await ipc.zalo?.updateLabels({ auth, labelData: updated, version });
      if (res?.success) {
        const finalLabels: LabelData[] = res.response?.labelData || updated;
        setLabels(activeAccountId, finalLabels);
        showNotification(`Đã gán nhãn Zalo cho ${contactIds.length} liên hệ`, 'success');
        setBulkLabelIds([]);
        store.clearSelection();
        onClose();
      } else {
        throw new Error(res?.error || 'Không thể gán nhãn');
      }
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
        <h3 className="font-semibold text-white mb-1">☁️ Gán nhãn Zalo</h3>
        <p className="text-xs text-gray-400 mb-3">
          Áp dụng cho <span className="text-blue-400 font-medium">{selectedContactIds.size}</span> liên hệ đã chọn
          <span className="text-gray-500 ml-1">(chỉ 1 nhãn / hội thoại)</span>
        </p>
        {zaloLabels.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center">Chưa có nhãn Zalo nào. Hãy đồng bộ nhãn từ header trước.</p>
        ) : (
          <ZaloLabelSelector
            allLabels={zaloLabels}
            selectedIds={bulkLabelIds}
            onChange={setBulkLabelIds}
            singleSelect
          />
        )}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm hover:bg-gray-600">
            Hủy
          </button>
          <button
            onClick={handleApplyBulkLabel}
            disabled={bulkLabelIds.length === 0 || applyingBulkLabel}
            className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40"
          >
            {applyingBulkLabel ? 'Đang gán...' : 'Áp dụng'}
          </button>
        </div>
      </div>
    </div>
  );
}
