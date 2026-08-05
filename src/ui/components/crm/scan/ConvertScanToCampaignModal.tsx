import React, { useState, useEffect } from 'react';
import ipc from '@/lib/ipc';
import { useAccountStore } from '@/store/accountStore';

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

  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [selectedZaloId, setSelectedZaloId] = useState<string>(zaloAccounts[0]?.zalo_id || '');
  
  // Existing campaign list state
  const [existingCampaigns, setExistingCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);

  // New campaign state
  const [newCampaignName, setNewCampaignName] = useState<string>(`Chiến dịch SĐT Quét #${batchId}: ${batchName}`);
  const [newCampaignType, setNewCampaignType] = useState<'message' | 'friend_request' | 'mixed'>('message');

  const [loading, setLoading] = useState<boolean>(false);
  const [fetchingCampaigns, setFetchingCampaigns] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (zaloAccounts.length > 0 && !selectedZaloId) {
      setSelectedZaloId(zaloAccounts[0].zalo_id);
    }
  }, [zaloAccounts, selectedZaloId]);

  useEffect(() => {
    if (selectedZaloId) {
      setFetchingCampaigns(true);
      ipc.crm.getCampaigns({ zaloId: selectedZaloId }).then(res => {
        if (res.success && Array.isArray(res.data)) {
          const activeOrDraft = res.data.filter((c: any) => c.status !== 'done' && !c.is_deleted);
          setExistingCampaigns(activeOrDraft);
          if (activeOrDraft.length > 0 && !selectedCampaignId) {
            setSelectedCampaignId(activeOrDraft[0].id);
          }
        }
      }).catch(() => {
        setExistingCampaigns([]);
      }).finally(() => {
        setFetchingCampaigns(false);
      });
    }
  }, [selectedZaloId]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!selectedZaloId) {
      setErrorMsg('Vui lòng chọn tài khoản Zalo');
      return;
    }

    if (isCreatingNew && !newCampaignName.trim()) {
      setErrorMsg('Vui lòng nhập tên chiến dịch mới');
      return;
    }

    if (!isCreatingNew && !selectedCampaignId) {
      setErrorMsg('Vui lòng chọn 1 chiến dịch');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const payload: any = {
        batchId,
        zaloId: selectedZaloId,
        mode: isCreatingNew ? 'new' : 'existing',
        statusFilter: 'found'
      };

      if (isCreatingNew) {
        payload.newCampaign = {
          name: newCampaignName.trim(),
          campaign_type: newCampaignType,
          template_message: 'Chào {salutation} {name}, bên em gửi thông tin tư vấn nhé!',
          friend_request_message: 'Chào {salutation} {name}, kết bạn Zalo với em nhé!',
          delay_seconds: 30,
          delay_min_seconds: 20,
          delay_max_seconds: 40,
          daily_send_limit: 50,
          daily_start_time: '08:00',
          mixed_config: JSON.stringify({ actions: ['message'], send_order: 'text_first' })
        };
      } else {
        payload.existingCampaignId = selectedCampaignId;
      }

      const res = await ipc.crm.convertScanToCampaign(payload);
      if (res.success) {
        onSuccess(res.campaignId);
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
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full border border-gray-100 dark:border-gray-800 shadow-2xl overflow-hidden p-6 space-y-5">
        
        {/* Header - Matching Hình 1 */}
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-extrabold text-gray-900 dark:text-white">
            {isCreatingNew ? 'Tạo chiến dịch mới' : 'Chọn chiến dịch'}
          </h3>

          <button
            type="button"
            onClick={() => {
              setIsCreatingNew(!isCreatingNew);
              setErrorMsg('');
            }}
            className="text-sm font-bold text-blue-500 hover:text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            {isCreatingNew ? '← Chọn có sẵn' : '+ Tạo mới'}
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 text-xs font-semibold">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Zalo Account selector if multi-account */}
        {zaloAccounts.length > 1 && (
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Tài khoản Zalo gửi:</label>
            <select
              value={selectedZaloId}
              onChange={e => setSelectedZaloId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-xs focus:outline-none"
            >
              {zaloAccounts.map(acc => (
                <option key={acc.zalo_id} value={acc.zalo_id}>
                  {acc.full_name || acc.zalo_id}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Mode: Existing Campaigns (Hình 1 UI Card List) */}
        {!isCreatingNew && (
          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {fetchingCampaigns ? (
              <div className="py-8 text-center text-xs text-gray-400 italic">Đang tải danh sách chiến dịch...</div>
            ) : existingCampaigns.length === 0 ? (
              <div className="p-5 text-center text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-2xl">
                Chưa có chiến dịch nào đang mở. Bấm <b>+ Tạo mới</b> để bắt đầu.
              </div>
            ) : (
              existingCampaigns.map(c => {
                const isSelected = selectedCampaignId === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCampaignId(c.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                      isSelected
                        ? 'border-2 border-blue-500 bg-blue-50/20 dark:bg-blue-950/20 shadow-xs'
                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-white dark:bg-gray-850'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${
                      isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-400'
                    }`}>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>

                    <div>
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                        {c.name}
                      </h4>
                      <p className="text-xs text-gray-400 font-medium mt-0.5">
                        {c.total_contacts || 0} liên hệ
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Mode: New Campaign Form */}
        {isCreatingNew && (
          <div className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Tên chiến dịch:</label>
              <input
                type="text"
                value={newCampaignName}
                onChange={e => setNewCampaignName(e.target.value)}
                className="w-full p-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Nhập tên chiến dịch mới..."
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Hành động:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewCampaignType('message')}
                  className={`p-2.5 rounded-2xl font-bold text-xs border transition-all text-center ${
                    newCampaignType === 'message'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  💬 Gửi tin nhắn
                </button>
                <button
                  type="button"
                  onClick={() => setNewCampaignType('friend_request')}
                  className={`p-2.5 rounded-2xl font-bold text-xs border transition-all text-center ${
                    newCampaignType === 'friend_request'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  🤝 Gửi kết bạn
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Pill Buttons - Exactly Matching Hình 1 */}
        <div className="pt-2 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-6 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-sm transition-colors text-center cursor-pointer"
          >
            Hủy
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || (!isCreatingNew && !selectedCampaignId)}
            className="py-3 px-6 rounded-full bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm shadow-md transition-all text-center disabled:opacity-50 active:scale-95 cursor-pointer"
          >
            {loading ? 'Đang thêm...' : `Thêm ${foundCount} liên hệ`}
          </button>
        </div>

      </div>
    </div>
  );
};
