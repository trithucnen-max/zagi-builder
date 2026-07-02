import React, { useState, useEffect, useRef } from 'react';
import ipc from '@/lib/ipc';
import { useAppStore } from '@/store/appStore';
import AppIcon from '../common/AppIcon';

// Danh sách các ngân hàng phổ biến tại Việt Nam với mã BIN Napas
const VIETNAM_BANKS = [
  { bin: '970436', name: 'Vietcombank (VCB)', short: 'VCB' },
  { bin: '970407', name: 'Techcombank (TCB)', short: 'TCB' },
  { bin: '970418', name: 'BIDV', short: 'BIDV' },
  { bin: '970415', name: 'VietinBank', short: 'CTG' },
  { bin: '970422', name: 'MBBank (MB)', short: 'MB' },
  { bin: '970405', name: 'Agribank', short: 'VBA' },
  { bin: '970432', name: 'VPBank', short: 'VPB' },
  { bin: '970416', name: 'ACB', short: 'ACB' },
  { bin: '970403', name: 'Sacombank', short: 'STB' },
  { bin: '970423', name: 'TPBank', short: 'TPB' },
  { bin: '970441', name: 'VIB', short: 'VIB' },
  { bin: '970443', name: 'SHB', short: 'SHB' },
  { bin: '970437', name: 'HDBank', short: 'HDB' },
  { bin: '970431', name: 'Eximbank', short: 'EIB' },
  { bin: '970426', name: 'MSB', short: 'MSB' },
  { bin: '970448', name: 'OCB', short: 'OCB' },
  { bin: '970440', name: 'SeABank', short: 'SEAB' },
  { bin: '970428', name: 'Nam A Bank', short: 'NAB' },
  { bin: '970454', name: 'VietCapital Bank (BVBank)', short: 'BVB' },
  { bin: '970424', name: 'Shinhan Bank VN', short: 'SHBP' },
  { bin: '970449', name: 'LPBank (LienVietPostBank)', short: 'LPB' },
  { bin: '970425', name: 'ABBANK', short: 'ABB' },
  { bin: '970406', name: 'DongA Bank', short: 'DAB' },
  { bin: '970434', name: 'Indovina Bank (IVB)', short: 'IVB' },
  { bin: '970412', name: 'PVcomBank', short: 'PVC' },
  { bin: '970438', name: 'BaoViet Bank', short: 'BVB' },
  { bin: '970400', name: 'Saigonbank', short: 'SGB' },
  { bin: '970408', name: 'GPBank', short: 'GPB' },
  { bin: '970442', name: 'Kienlongbank', short: 'KLB' },
  { bin: '970430', name: 'PG Bank', short: 'PGB' },
  { bin: '970449', name: 'VietBank', short: 'VBA' },
  { bin: '970457', name: 'Woori Bank Việt Nam', short: 'WRB' },
];

interface RichMessageActionsProps {
  isOpen: boolean;
  onClose: () => void;
  threadId: string;
  threadType: number;
  zaloId: string;
  auth: any;
  quote?: any;
}

export default function RichMessageActions({
  isOpen,
  onClose,
  threadId,
  threadType,
  zaloId,
  auth,
  quote,
}: RichMessageActionsProps) {
  const { showNotification } = useAppStore();
  const [activeTab, setActiveTab] = useState<'voice' | 'bank' | 'card'>('voice');
  const [loading, setLoading] = useState(false);

  // 1. Voice note state
  const [voiceFilePath, setVoiceFilePath] = useState('');

  // 2. Bank card state
  const [selectedBankBin, setSelectedBankBin] = useState(VIETNAM_BANKS[0].bin);
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  // 3. Card/Contact state
  const [cardUserId, setCardUserId] = useState('');
  const [cardPhone, setCardPhone] = useState('');
  const [searchingCard, setSearchingCard] = useState(false);
  const [cardUserResult, setCardUserResult] = useState<any | null>(null);

  if (!isOpen) return null;

  // ── Voice File Selection ───────────────────────────────────────────────
  const handleSelectVoiceFile = async () => {
    try {
      const result = await ipc.file?.openDialog({
        filters: [{ name: 'Audio Files', extensions: ['m4a', 'mp3', 'wav', 'ogg'] }],
        multiSelect: false,
      });
      if (result?.canceled || !result?.filePaths?.length) return;
      setVoiceFilePath(result.filePaths[0]);
    } catch (err: any) {
      showNotification('Không thể chọn file: ' + err.message, 'error');
    }
  };

  const handleSendVoice = async () => {
    if (!voiceFilePath) return;
    setLoading(true);
    try {
      // 1. Upload voice file to Zalo server
      const uploadRes = await ipc.zalo?.uploadVoiceFile({
        auth,
        voicePath: voiceFilePath,
        threadId,
        type: threadType,
      });
      const resp = uploadRes?.response;
      const voiceUrl = resp?.fileUrl || resp?.url || resp?.href || '';
      if (!voiceUrl) {
        throw new Error('Không lấy được URL file ghi âm sau khi upload');
      }

      // 2. Send voice message
      await ipc.zalo?.sendVoice({
        auth,
        options: { voiceUrl },
        threadId,
        type: threadType,
        ...(quote ? { quote } : {}),
      });

      showNotification('Đã gửi tin nhắn thoại!', 'success');
      setVoiceFilePath('');
      onClose();
    } catch (err: any) {
      showNotification('Gửi tin nhắn thoại thất bại: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Bank Card Sending ──────────────────────────────────────────────────
  const handleSendBank = async () => {
    if (!accountNumber.trim()) {
      showNotification('Vui lòng nhập số tài khoản', 'warning');
      return;
    }
    const bankObj = VIETNAM_BANKS.find(b => b.bin === selectedBankBin);
    if (!bankObj) return;

    setLoading(true);
    try {
      const payload = {
        binBank: selectedBankBin,
        numAccBank: accountNumber.trim(),
        nameAccBank: accountName.trim().toUpperCase() || bankObj.short,
      };

      await ipc.zalo?.sendBankCard({
        auth,
        payload: JSON.stringify(payload),
        threadId,
        type: threadType,
      });

      showNotification('Đã gửi thông tin tài khoản ngân hàng!', 'success');
      setAccountNumber('');
      setAccountName('');
      onClose();
    } catch (err: any) {
      showNotification('Gửi thông tin ngân hàng thất bại: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Contact Card Sending ───────────────────────────────────────────────
  const handleSearchCardUser = async () => {
    if (!cardPhone.trim()) {
      showNotification('Vui lòng nhập số điện thoại cần tìm', 'warning');
      return;
    }
    setSearchingCard(true);
    setCardUserResult(null);
    try {
      const res = await ipc.zalo?.findUser({ auth, phone: cardPhone.trim() });
      if (res?.success && res?.response?.uid) {
        setCardUserResult(res.response);
        setCardUserId(res.response.uid);
      } else {
        showNotification('Không tìm thấy tài khoản Zalo ứng với SĐT này', 'info');
      }
    } catch (err: any) {
      showNotification('Lỗi tìm kiếm tài khoản: ' + err.message, 'error');
    } finally {
      setSearchingCard(false);
    }
  };

  const handleSendCard = async () => {
    const targetUid = cardUserId.trim();
    if (!targetUid) {
      showNotification('Vui lòng cung cấp User ID cần gửi', 'warning');
      return;
    }

    setLoading(true);
    try {
      await ipc.zalo?.sendCard({
        auth,
        options: {
          userId: targetUid,
          phoneNumber: cardPhone.trim() || undefined,
        },
        threadId,
        type: threadType,
        ...(quote ? { quote } : {}),
      });

      showNotification('Đã gửi danh thiếp thành công!', 'success');
      setCardUserId('');
      setCardPhone('');
      setCardUserResult(null);
      onClose();
    } catch (err: any) {
      showNotification('Gửi danh thiếp thất bại: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-800 bg-gray-900">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <h3 className="text-sm font-semibold text-gray-100">Gửi tin nhắn nâng cao</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Pills */}
        <div className="flex bg-gray-950 p-1 m-4 rounded-xl border border-gray-800/80">
          <button
            onClick={() => setActiveTab('voice')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'voice' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
          >
            🎤 Gửi Voice Note
          </button>
          <button
            onClick={() => setActiveTab('bank')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'bank' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
          >
            💳 Thẻ ngân hàng
          </button>
          <button
            onClick={() => setActiveTab('card')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${activeTab === 'card' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
          >
            📇 Danh thiếp
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 px-5 pb-5 overflow-y-auto max-h-[350px] space-y-4">
          
          {/* TAB 1: Voice Note */}
          {activeTab === 'voice' && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-950/80 border border-gray-800/60 rounded-xl flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-12 h-12 bg-blue-600/10 text-blue-500 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-200">Gửi file âm thanh dạng voice note</p>
                  <p className="text-[10px] text-gray-500 mt-1">Hỗ trợ các định dạng .m4a, .mp3, .wav</p>
                </div>

                {voiceFilePath ? (
                  <div className="bg-gray-850 px-3 py-1.5 rounded-lg border border-gray-700/80 flex items-center gap-2 max-w-full">
                    <span className="text-[11px] font-mono text-green-400 truncate max-w-[180px]">
                      {voiceFilePath.split(/[\\/]/).pop()}
                    </span>
                    <button onClick={() => setVoiceFilePath('')} className="text-red-400 hover:text-red-300 text-xs">
                      Xóa
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleSelectVoiceFile}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-xs text-gray-200 rounded-xl transition-all border border-gray-700"
                  >
                    Chọn file âm thanh...
                  </button>
                )}
              </div>

              <button
                disabled={loading || !voiceFilePath}
                onClick={handleSendVoice}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-lg"
              >
                {loading ? 'Đang gửi...' : 'Gửi Voice Note'}
              </button>
            </div>
          )}

          {/* TAB 2: Bank Card */}
          {activeTab === 'bank' && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Ngân hàng nhận</label>
                <select
                  value={selectedBankBin}
                  onChange={e => setSelectedBankBin(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 text-xs text-gray-200 rounded-xl px-3 py-2 outline-none transition-colors"
                >
                  {VIETNAM_BANKS.map(b => (
                    <option key={b.bin} value={b.bin}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Số tài khoản</label>
                <input
                  type="text"
                  placeholder="Nhập số tài khoản ngân hàng..."
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value.replace(/\s+/g, ''))}
                  className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 text-xs text-gray-200 rounded-xl px-3 py-2 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Tên chủ tài khoản (Không dấu)</label>
                <input
                  type="text"
                  placeholder="Ví dụ: NGUYEN VAN A..."
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 text-xs text-gray-200 rounded-xl px-3 py-2 outline-none transition-colors uppercase"
                />
              </div>

              <div className="pt-2">
                <button
                  disabled={loading || !accountNumber}
                  onClick={handleSendBank}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white rounded-xl transition-colors shadow-lg"
                >
                  {loading ? 'Đang gửi...' : 'Gửi Thẻ Ngân Hàng'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Contact Card */}
          {activeTab === 'card' && (
            <div className="space-y-4">
              <div className="bg-gray-950 border border-gray-800/80 rounded-xl p-3.5 space-y-3">
                <p className="text-[11px] font-medium text-gray-400">Cách 1: Tìm Zalo theo SĐT</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nhập số điện thoại..."
                    value={cardPhone}
                    onChange={e => setCardPhone(e.target.value)}
                    className="flex-1 bg-gray-900 border border-gray-800 focus:border-blue-500 text-xs text-gray-200 rounded-xl px-3 py-2 outline-none transition-colors"
                  />
                  <button
                    disabled={searchingCard || !cardPhone}
                    onClick={handleSearchCardUser}
                    className="px-3 bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-200 rounded-xl border border-gray-700 transition-colors"
                  >
                    {searchingCard ? 'Đang tìm...' : 'Tìm kiếm'}
                  </button>
                </div>

                {cardUserResult && (
                  <div className="flex items-center gap-2.5 p-2 bg-gray-900 rounded-lg border border-gray-800 mt-2">
                    {cardUserResult.avatar ? (
                      <img src={cardUserResult.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                        {(cardUserResult.display_name || 'U').charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-200 truncate">{cardUserResult.display_name}</p>
                      <p className="text-[10px] text-gray-500 truncate">ID: {cardUserResult.uid}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-gray-950 border border-gray-800/80 rounded-xl p-3.5 space-y-3">
                <p className="text-[11px] font-medium text-gray-400">Cách 2: Nhập trực tiếp Zalo ID (UID)</p>
                <input
                  type="text"
                  placeholder="Nhập UID người nhận..."
                  value={cardUserId}
                  onChange={e => setCardUserId(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-800 focus:border-blue-500 text-xs text-gray-200 rounded-xl px-3 py-2 outline-none transition-colors"
                />
              </div>

              <button
                disabled={loading || !cardUserId}
                onClick={handleSendCard}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white rounded-xl transition-colors shadow-lg"
              >
                {loading ? 'Đang gửi...' : 'Gửi Danh Thiếp'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
