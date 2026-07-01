import React, { useRef, useState } from 'react';
import ipc from '@/lib/ipc';
import { useAppStore } from '@/store/appStore';
import { useCRMStore } from '@/store/crmStore';
import CampaignCreateModal from '../campaigns/CampaignCreateModal';

interface AddToCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedContactIds: Set<string>;
  campaigns: Array<{ id: number; name: string; status: string; total_contacts: number }>;
  activeAccountId: string | null;
  storeContacts: any[];
  onSuccess: () => void;
}

export default function AddToCampaignModal({
  isOpen,
  onClose,
  selectedContactIds,
  campaigns,
  activeAccountId,
  storeContacts,
  onSuccess,
}: AddToCampaignModalProps) {
  const [selectedCampaignForAdd, setSelectedCampaignForAdd] = useState<number | null>(null);
  const [showCreateInAddModal, setShowCreateInAddModal] = useState(false);
  const { showNotification } = useAppStore();
  const store = useCRMStore();
  const creatingRef = useRef(false);

  if (!isOpen) return null;

  const availableCampaigns = campaigns.filter(c => c.status !== 'done');

  const handleAddContactsToCampaign = async () => {
    if (!selectedCampaignForAdd || !activeAccountId) return;
    try {
      const contacts = storeContacts
        .filter(c => selectedContactIds.has(c.contact_id))
        .map(c => ({ contactId: c.contact_id, displayName: c.alias || c.display_name, avatar: c.avatar }));

      const res = await ipc.crm?.addCampaignContacts({
        zaloId: activeAccountId,
        campaignId: selectedCampaignForAdd,
        contacts,
      });

      if (res?.success) {
        if (res.limitExceeded) {
          showNotification(
            `Chiến dịch chỉ cho tối đa 1000 người. Đã thêm ${res.addedCount} và loại bỏ ${res.discardedCount} người vượt quá.`,
            'warning'
          );
        } else {
          showNotification(`Đã thêm ${res.addedCount || contacts.length} liên hệ vào chiến dịch`, 'success');
        }
        store.clearSelection();
        onSuccess();
        onClose();
      } else {
        throw new Error((res as any)?.error || 'Không thể thêm liên hệ');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Không rõ';
      showNotification('Lỗi: ' + errMsg, 'error');
    }
  };

  const handleCreateCampaignInAddModal = async (data: any) => {
    if (!activeAccountId || creatingRef.current) return;
    creatingRef.current = true;
    try {
      const res = await ipc.crm?.saveCampaign({ zaloId: activeAccountId, campaign: data });
      if (res?.success) {
        onSuccess();
        if (res.id) setSelectedCampaignForAdd(res.id);
        showNotification('Đã tạo chiến dịch mới', 'success');
        setShowCreateInAddModal(false);
      } else {
        throw new Error((res as any)?.error || 'Không thể tạo chiến dịch');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Không rõ';
      showNotification('Lỗi: ' + errMsg, 'error');
    } finally {
      creatingRef.current = false;
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-gray-800 border border-gray-600 rounded-2xl w-80 p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white">Chọn chiến dịch</h3>
            <button
              onClick={() => setShowCreateInAddModal(true)}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded-lg hover:bg-blue-500/10"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Tạo mới
            </button>
          </div>

          {availableCampaigns.length === 0 ? (
            <div className="flex flex-col items-center py-4 gap-3">
              <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <p className="text-sm text-gray-300 text-center font-medium">Chưa có chiến dịch phù hợp</p>
              <p className="text-xs text-gray-500 text-center leading-relaxed">
                Tất cả chiến dịch đã hoàn thành hoặc chưa có chiến dịch nào.
              </p>
              <button
                onClick={() => setShowCreateInAddModal(true)}
                className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors flex items-center justify-center gap-1.5"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Tạo chiến dịch mới
              </button>
              <button onClick={onClose} className="w-full py-1.5 rounded-xl bg-gray-700 text-gray-300 text-sm hover:bg-gray-600 transition-colors">
                Hủy
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {availableCampaigns.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCampaignForAdd(c.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors
                      ${selectedCampaignForAdd === c.id
                        ? 'border-blue-500 bg-blue-500/20 text-white'
                        : 'border-gray-600 text-gray-300 hover:border-gray-500'}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        c.status === 'active' ? 'bg-green-400' : c.status === 'paused' ? 'bg-yellow-400' : 'bg-gray-500'
                      }`} />
                      {c.name}
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5 pl-3">{c.total_contacts} liên hệ</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-gray-700 text-gray-300 text-sm hover:bg-gray-600">
                  Hủy
                </button>
                <button
                  disabled={!selectedCampaignForAdd}
                  onClick={handleAddContactsToCampaign}
                  className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40"
                >
                  Thêm {selectedContactIds.size} liên hệ
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showCreateInAddModal && (
        <CampaignCreateModal
          zaloId={activeAccountId || ''}
          onClose={() => setShowCreateInAddModal(false)}
          onSave={handleCreateCampaignInAddModal}
        />
      )}
    </>
  );
}
