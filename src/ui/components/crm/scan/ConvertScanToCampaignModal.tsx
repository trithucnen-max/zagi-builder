import React, { useState, useEffect } from 'react';
import ipc from '@/lib/ipc';
import AppIcon from '@/components/common/AppIcon';
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

  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [selectedZaloId, setSelectedZaloId] = useState<string>(zaloAccounts[0]?.zalo_id || '');
  
  // New campaign state
  const [campaignName, setCampaignName] = useState<string>(`Chiến dịch SĐT Quét #${batchId}: ${batchName}`);
  const [campaignType, setCampaignType] = useState<'message' | 'friend_request' | 'mixed'>('message');
  const [templateMessage, setTemplateMessage] = useState<string>('Chào {salutation} {name}, bên em gửi thông tin tư vấn nhé!');
  const [friendRequestMessage, setFriendRequestMessage] = useState<string>('Chào {salutation} {name}, kết bạn Zalo với em nhé!');
  const [delaySeconds, setDelaySeconds] = useState<number>(30);
  const [delayMinSeconds, setDelayMinSeconds] = useState<number>(20);
  const [delayMaxSeconds, setDelayMaxSeconds] = useState<number>(40);

  // Existing campaign state
  const [existingCampaigns, setExistingCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [fetchingCampaigns, setFetchingCampaigns] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (zaloAccounts.length > 0 && !selectedZaloId) {
      setSelectedZaloId(zaloAccounts[0].zalo_id);
    }
  }, [zaloAccounts, selectedZaloId]);

  useEffect(() => {
    if (mode === 'existing' && selectedZaloId) {
      setFetchingCampaigns(true);
      ipc.crm.getCampaigns({ zaloId: selectedZaloId }).then(res => {
        if (res.success && Array.isArray(res.data)) {
          // Filter campaigns not done
          const activeOrDraft = res.data.filter((c: any) => c.status !== 'done' && !c.is_deleted);
          setExistingCampaigns(activeOrDraft);
          if (activeOrDraft.length > 0) {
            setSelectedCampaignId(activeOrDraft[0].id);
          } else {
            setSelectedCampaignId(null);
          }
        }
      }).catch(() => {
        setExistingCampaigns([]);
      }).finally(() => {
        setFetchingCampaigns(false);
      });
    }
  }, [mode, selectedZaloId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedZaloId) {
      setErrorMsg('Vui lòng chọn tài khoản Zalo làm owner chiến dịch');
      return;
    }

    if (mode === 'new' && !campaignName.trim()) {
      setErrorMsg('Vui lòng nhập tên chiến dịch mới');
      return;
    }

    if (mode === 'existing' && !selectedCampaignId) {
      setErrorMsg('Vui lòng chọn chiến dịch có sẵn để thêm liên hệ');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const payload: any = {
        batchId,
        zaloId: selectedZaloId,
        mode,
        statusFilter: 'found'
      };

      if (mode === 'new') {
        payload.newCampaign = {
          name: campaignName.trim(),
          campaign_type: campaignType,
          template_message: templateMessage.trim(),
          friend_request_message: friendRequestMessage.trim(),
          delay_seconds: delaySeconds,
          delay_min_seconds: delayMinSeconds,
          delay_max_seconds: delayMaxSeconds,
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
        setErrorMsg(res.error || 'Có lỗi xảy ra khi chuyển liên hệ vào chiến dịch');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi kết nối IPC');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-lg w-full border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-blue-50/50 dark:bg-blue-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl font-bold">
              🚀
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Chuyển SĐT Quét Vào Chiến Dịch CRM
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                Lô #{batchId}: {batchName} ({foundCount} SĐT có Zalo)
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Mode Selector Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'new'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60'
              }`}
            >
              <span>🟢</span>
              <span>Tạo chiến dịch MỚI</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('existing')}
              className={`py-2 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'existing'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60'
              }`}
            >
              <span>📦</span>
              <span>Thêm vào chiến dịch CÓ SẴN</span>
            </button>
          </div>

          {/* Owner Zalo Account Selection */}
          <div className="space-y-1">
            <label className="font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
              <span>📱 Tài khoản Zalo phụ trách:</span>
            </label>
            <select
              value={selectedZaloId}
              onChange={e => setSelectedZaloId(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {zaloAccounts.map(acc => (
                <option key={acc.zalo_id} value={acc.zalo_id}>
                  {acc.full_name || acc.zalo_id} ({acc.zalo_id})
                </option>
              ))}
            </select>
          </div>

          {/* Mode: NEW Campaign */}
          {mode === 'new' && (
            <div className="space-y-3.5 pt-2 border-t border-gray-100 dark:border-gray-800">
              <div className="space-y-1">
                <label className="font-bold text-gray-700 dark:text-gray-300">Tên chiến dịch mới:</label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={e => setCampaignName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-semibold text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Nhập tên chiến dịch CRM..."
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-gray-700 dark:text-gray-300">Loại hành động chiến dịch:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'message', label: '💬 Gửi tin nhắn' },
                    { id: 'friend_request', label: '🤝 Gửi kết bạn' },
                    { id: 'mixed', label: '🔄 Hỗn hợp' }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setCampaignType(t.id as any)}
                      className={`p-2 rounded-xl font-bold text-[11px] border transition-all text-center ${
                        campaignType === t.id
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {campaignType !== 'friend_request' && (
                <div className="space-y-1">
                  <label className="font-bold text-gray-700 dark:text-gray-300">Mẫu tin nhắn ban đầu:</label>
                  <textarea
                    value={templateMessage}
                    onChange={e => setTemplateMessage(e.target.value)}
                    rows={2}
                    className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="Mẫu tin nhắn..."
                  />
                  <p className="text-[10px] text-gray-400">Có thể chèn biến: {"{salutation}"}, {"{name}"}, {"{tu_xung}"}, {"{phone}"}</p>
                </div>
              )}

              {campaignType === 'friend_request' && (
                <div className="space-y-1">
                  <label className="font-bold text-gray-700 dark:text-gray-300">Lời nhắn kết bạn:</label>
                  <textarea
                    value={friendRequestMessage}
                    onChange={e => setFriendRequestMessage(e.target.value)}
                    rows={2}
                    className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="Lời nhắn kết bạn..."
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Delay tối thiểu (s):</label>
                  <input
                    type="number"
                    value={delayMinSeconds}
                    onChange={e => setDelayMinSeconds(Number(e.target.value))}
                    min={5}
                    max={300}
                    className="w-full p-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Delay tối đa (s):</label>
                  <input
                    type="number"
                    value={delayMaxSeconds}
                    onChange={e => setDelayMaxSeconds(Number(e.target.value))}
                    min={10}
                    max={600}
                    className="w-full p-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mode: EXISTING Campaign */}
          {mode === 'existing' && (
            <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
              <label className="font-bold text-gray-700 dark:text-gray-300 block">Chọn chiến dịch có sẵn:</label>
              {fetchingCampaigns ? (
                <p className="text-gray-400 italic">Đang tải danh sách chiến dịch...</p>
              ) : existingCampaigns.length === 0 ? (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-700 dark:text-amber-300 text-xs font-semibold">
                  Tài khoản Zalo này chưa có chiến dịch nào đang hoạt động. Vui lòng chuyển sang chọn "Tạo chiến dịch MỚI".
                </div>
              ) : (
                <select
                  value={selectedCampaignId || ''}
                  onChange={e => setSelectedCampaignId(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {existingCampaigns.map(c => (
                    <option key={c.id} value={c.id}>
                      #{c.id} - {c.name} ({c.total_contacts || 0} liên hệ | Trạng thái: {c.status})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Info Banner */}
          <div className="p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 flex items-center gap-2">
            <span className="text-base">ℹ️</span>
            <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
              Sẽ chuyển chính xác <b>{foundCount} SĐT</b> có tài khoản Zalo UID vào danh sách nhận của chiến dịch.
            </span>
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs transition-colors"
            >
              Hủy
            </button>

            <button
              type="submit"
              disabled={loading || (mode === 'existing' && !selectedCampaignId)}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading ? (
                <span>Đang xử lý...</span>
              ) : (
                <>
                  <span>🚀</span>
                  <span>{mode === 'new' ? 'Tạo chiến dịch & Thêm SĐT' : 'Thêm SĐT vào chiến dịch'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
