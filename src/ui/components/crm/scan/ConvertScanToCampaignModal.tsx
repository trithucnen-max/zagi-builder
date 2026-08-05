import React, { useState, useEffect, useCallback } from 'react';
import ipc from '@/lib/ipc';
import { useAccountStore } from '@/store/accountStore';
import CampaignCreateModal from '../campaigns/CampaignCreateModal';

interface ConvertScanToCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchId: number;
  batchName: string;
  foundCount: number;
  onSuccess: (campaignId: number) => void;
}

export const ConvertScanToCampaignModal: React.FC<ConvertScanToCampaignModalProps> = ({
  isOpen,
  onClose,
  batchId,
  batchName,
  foundCount,
  onSuccess
}) => {
  const { accounts } = useAccountStore();
  const zaloAccounts = accounts.filter(a => a.is_active !== 0 && (!a.channel || a.channel === 'zalo'));

  const [selectedZaloId, setSelectedZaloId] = useState<string>(zaloAccounts[0]?.zalo_id || '');
  
  // Existing campaign list state
  const [existingCampaigns, setExistingCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);

  // Full module CampaignCreateModal state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [fetchingCampaigns, setFetchingCampaigns] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (zaloAccounts.length > 0 && !selectedZaloId) {
      setSelectedZaloId(zaloAccounts[0].zalo_id);
    }
  }, [zaloAccounts, selectedZaloId]);

  // Load ONLY campaigns ready to accept contacts (status !== 'done' && status !== 'stopped' && status !== 'completed')
  const loadCampaigns = useCallback(async (autoSelectId?: number) => {
    setFetchingCampaigns(true);
    try {
      const res = await ipc.crm.getCampaigns({ zaloId: selectedZaloId || '' });
      const campaignList = res?.campaigns || res?.data || [];
      if (Array.isArray(campaignList)) {
        // Filter ONLY ready / active campaigns
        const readyCampaigns = campaignList.filter((c: any) => 
          c.status !== 'done' && 
          c.status !== 'stopped' && 
          c.status !== 'completed' && 
          !c.is_deleted
        );
        setExistingCampaigns(readyCampaigns);

        if (autoSelectId) {
          setSelectedCampaignId(autoSelectId);
        } else if (readyCampaigns.length > 0) {
          // If previous selected is still valid keep it, else select first
          if (!selectedCampaignId || !readyCampaigns.some((c: any) => c.id === selectedCampaignId)) {
            setSelectedCampaignId(readyCampaigns[0].id);
          }
        } else {
          setSelectedCampaignId(null);
        }
      }
    } catch (err) {
      setExistingCampaigns([]);
    } finally {
      setFetchingCampaigns(false);
    }
  }, [selectedZaloId, selectedCampaignId]);

  useEffect(() => {
    if (isOpen) {
      loadCampaigns();
    }
  }, [isOpen, selectedZaloId]);

  if (!isOpen) return null;

  // Handle saving new campaign created via standard CampaignCreateModal
  const handleSaveNewCampaign = async (formData: any) => {
    try {
      const targetZaloId = selectedZaloId || (zaloAccounts[0]?.zalo_id || '');
      const res = await ipc.crm.saveCampaign({
        zaloId: targetZaloId,
        campaign: formData
      });

      if (res?.success) {
        const newCampaignId = res.campaignId || res.data?.id || res.id;
        setShowCreateModal(false);
        // Reload campaigns list and automatically select newly created campaign
        await loadCampaigns(newCampaignId);
      } else {
        alert('Có lỗi khi tạo chiến dịch: ' + (res?.error || 'Không xác định'));
      }
    } catch (err: any) {
      alert('Lỗi kết nối khi tạo chiến dịch: ' + (err.message || err));
    }
  };

  const handleSubmit = async () => {
    if (!selectedCampaignId) {
      setErrorMsg('Vui lòng chọn 1 chiến dịch sẵn sàng');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const payload: any = {
        batchId,
        zaloId: selectedZaloId || (zaloAccounts[0]?.zalo_id || ''),
        mode: 'existing',
        existingCampaignId: selectedCampaignId,
        statusFilter: 'found'
      };

      const res = await ipc.crm.convertScanToCampaign(payload);
      if (res.success) {
        onSuccess(selectedCampaignId);
        onClose();
      } else {
        setErrorMsg(res.error || 'Có lỗi xảy ra khi thêm liên hệ vào chiến dịch');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150" onClick={onClose}>
        <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-sm w-full border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden p-5 space-y-4" onClick={e => e.stopPropagation()}>
          
          {/* Header - Matching Hình 2 */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Chọn chiến dịch
            </h3>

            <button
              type="button"
              onClick={() => {
                setErrorMsg('');
                setShowCreateModal(true);
              }}
              className="text-xs font-semibold text-blue-500 hover:text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              + Tạo mới
            </button>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 text-xs font-semibold">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Zalo Account Selector (If multiple active accounts) */}
          {zaloAccounts.length > 1 && (
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-gray-400">Tài khoản Zalo chiến dịch:</label>
              <select
                value={selectedZaloId}
                onChange={e => setSelectedZaloId(e.target.value)}
                className="w-full p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-xs focus:outline-none cursor-pointer"
              >
                {zaloAccounts.map(acc => (
                  <option key={acc.zalo_id} value={acc.zalo_id}>
                    {acc.full_name || acc.zalo_id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Mode: Existing READY Campaigns List (Hình 2) */}
          <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
            {fetchingCampaigns ? (
              <div className="py-8 text-center text-xs text-gray-400 italic">Đang kiểm tra các chiến dịch sẵn sàng...</div>
            ) : existingCampaigns.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/60 rounded-2xl space-y-2">
                <p>Chưa có chiến dịch nào đang mở sẵn sàng.</p>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs cursor-pointer"
                >
                  + Tạo chiến dịch mới
                </button>
              </div>
            ) : (
              existingCampaigns.map(c => {
                const isSelected = selectedCampaignId === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCampaignId(c.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                      isSelected
                        ? 'border-2 border-blue-500 bg-blue-50/20 dark:bg-blue-950/20 shadow-xs'
                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-850'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border flex-shrink-0 ${
                      isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-400'
                    }`}>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>

                    <div>
                      <h4 className="font-bold text-xs text-gray-900 dark:text-white">
                        {c.name}
                      </h4>
                      <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                        {c.total_contacts || 0} liên hệ
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Pill Buttons - Exactly Matching Hình 2 */}
          <div className="pt-2 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs transition-colors text-center cursor-pointer"
            >
              Hủy
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !selectedCampaignId}
              className="py-2.5 px-5 rounded-full bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs shadow-md transition-all text-center disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              {loading ? 'Đang thêm...' : `Thêm ${foundCount} liên hệ`}
            </button>
          </div>

        </div>
      </div>

      {/* Full Module Campaign Creation Modal */}
      {showCreateModal && (
        <CampaignCreateModal
          zaloId={selectedZaloId}
          initialData={{
            name: `Chiến dịch SĐT Quét #${batchId}: ${batchName}`
          }}
          onClose={() => setShowCreateModal(false)}
          onSave={handleSaveNewCampaign}
        />
      )}
    </>
  );
};
