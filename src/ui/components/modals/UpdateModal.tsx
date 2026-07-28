import React, { useState } from 'react';
import { useCRMStore } from '@/store/crmStore';

export interface UpdateInfoState {
  version: string;
  releaseNotes?: string | any;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
  status: 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';
  error?: string;
}

interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
  updateInfo: UpdateInfoState;
  onStartDownload: () => void;
  onInstallNow: () => void;
}

export default function UpdateModal({
  open,
  onClose,
  updateInfo,
  onStartDownload,
  onInstallNow,
}: UpdateModalProps) {
  const [confirmStage, setConfirmStage] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const campaigns = useCRMStore(s => s.campaigns || []);
  const runningCampaigns = campaigns.filter((c: any) => c.status === 'running');

  if (!open) return null;

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond?: number) => {
    if (!bytesPerSecond) return '';
    return `${formatBytes(bytesPerSecond)}/s`;
  };

  const handleInstallOnQuit = () => {
    try {
      localStorage.setItem('zagi_install_on_quit_version', updateInfo.version || '3.0.9');
    } catch {}
    setToastMessage(`Đã cài đặt! Zagi sẽ tự động nâng cấp phiên bản v${updateInfo.version || '3.0.9'} vào lần bạn tắt ứng dụng tiếp theo.`);
    setTimeout(() => {
      setToastMessage(null);
      setConfirmStage(false);
      onClose();
    }, 2800);
  };

  const renderReleaseNotes = (notes?: string | any) => {
    if (!notes) {
      return (
        <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300 list-disc list-inside">
          <li>Cải tiến hiệu năng & tối ưu hóa bộ nhớ cho hệ thống.</li>
          <li>Nâng cấp tính năng Xưng hô thông minh & Tự xưng tự động theo chuẩn Tiếng Việt.</li>
          <li>Sửa lỗi nhỏ và tăng cường độ ổn định kết nối Zalo.</li>
        </ul>
      );
    }

    if (typeof notes === 'string') {
      const lines = notes.split('\n').filter(l => l.trim().length > 0);
      return (
        <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300 font-sans">
          {lines.map((line, idx) => (
            <p key={idx} className="leading-relaxed">
              {line.startsWith('-') || line.startsWith('*') ? (
                <span className="flex items-start gap-1.5">
                  <span className="text-blue-500 font-bold">•</span>
                  <span>{line.replace(/^[-*]\s*/, '')}</span>
                </span>
              ) : (
                line
              )}
            </p>
          ))}
        </div>
      );
    }

    return <p className="text-xs text-gray-500">{JSON.stringify(notes)}</p>;
  };

  const osName = React.useMemo(() => {
    if (typeof navigator === 'undefined') return 'Cross-Platform';
    const platform = (navigator.platform || navigator.userAgent || '').toLowerCase();
    if (platform.includes('win')) return 'Windows 🪟';
    if (platform.includes('mac')) return 'macOS 🍎';
    if (platform.includes('linux')) return 'Linux 🐧';
    return 'Desktop';
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Toast Feedback Notification */}
        {toastMessage && (
          <div className="absolute top-4 left-4 right-4 z-[10000] p-3.5 bg-emerald-600 text-white rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-3">
            <span>🌙</span>
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Modal Top Banner Gradient Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-2xl flex-shrink-0 shadow-sm">
              {confirmStage ? '⚠️' : '🚀'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight text-white">
                  {confirmStage ? 'XÁC NHẬN NÂNG CẤP ZAGI' : 'BẢN CẬP NHẬT MỚI'}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-white/25 border border-white/40 text-white font-extrabold text-xs shadow-2xs">
                  v{updateInfo.version || '3.0.9'}
                </span>
              </div>
              <p className="text-xs text-blue-100 mt-0.5">Zagi {osName} Auto-Update System</p>
            </div>
          </div>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 space-y-4 flex-1">
          {confirmStage ? (
            /* Option A + B Safety Confirmation View */
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
              <div className="text-xs text-gray-700 dark:text-gray-200 space-y-1">
                <p className="font-extrabold text-sm text-gray-900 dark:text-white">
                  Bạn có muốn khởi động lại Zagi ngay bây giờ?
                </p>
                <p className="text-gray-500 dark:text-gray-400 leading-relaxed">
                  Bản cập nhật v{updateInfo.version || '3.0.9'} đã sẵn sàng. Bạn có thể chọn khởi động lại ngay hoặc để hệ thống tự áp dụng khi bạn tắt Zagi.
                </p>
              </div>

              {/* Running CRM Campaigns Warning Card */}
              {runningCampaigns.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-955/40 border border-amber-300 dark:border-amber-700/60 rounded-2xl p-4 flex items-start gap-3 text-amber-900 dark:text-amber-200">
                  <span className="text-2xl shrink-0">⚠️</span>
                  <div className="text-xs leading-relaxed">
                    <p className="font-extrabold text-amber-950 dark:text-amber-100 text-sm">
                      Cảnh báo: Đang có {runningCampaigns.length} chiến dịch CRM đang chạy!
                    </p>
                    <p className="mt-1 text-amber-800 dark:text-amber-300">
                      Nếu khởi động lại ngay, chiến dịch sẽ <span className="font-bold underline">tạm dừng</span> và sẽ tự động tiếp tục gửi tin nhắn sau khi Zagi mở lại. Hoặc bạn có thể chọn <span className="font-bold text-amber-900 dark:text-amber-200">🌙 Cài khi tôi tắt Zagi</span> để chiến dịch chạy hết.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Standard Release Notes View */
            <>
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                  <span>✨ CÓ GÌ MỚI TRONG BẢN CẬP NHẬT NÀY</span>
                </h4>
                <div className="max-h-48 overflow-y-auto bg-gray-50 dark:bg-gray-800/60 border border-gray-200/80 dark:border-gray-700/60 rounded-2xl p-4 custom-scrollbar">
                  {renderReleaseNotes(updateInfo.releaseNotes)}
                </div>
              </div>

              {/* Downloading Progress Section */}
              {updateInfo.status === 'downloading' && (
                <div className="bg-blue-50/60 dark:bg-blue-955/30 border border-blue-200 dark:border-blue-900/50 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-gray-800 dark:text-gray-200">
                    <span className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                      Đang tải bản cập nhật ngầm...
                    </span>
                    <span className="font-mono">{updateInfo.percent || 0}%</span>
                  </div>

                  {/* Progress Track */}
                  <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(3, updateInfo.percent || 0)}%` }}
                    />
                  </div>

                  {/* Details (MB & Speed) */}
                  <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                    <span>
                      {formatBytes(updateInfo.transferred)} / {formatBytes(updateInfo.total)}
                    </span>
                    <span>{formatSpeed(updateInfo.bytesPerSecond)}</span>
                  </div>
                </div>
              )}

              {/* Downloaded Ready Status */}
              {updateInfo.status === 'downloaded' && (
                <div className="bg-emerald-50 dark:bg-emerald-955/30 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-4 flex items-center gap-3 text-emerald-800 dark:text-emerald-300">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
                    ✓
                  </div>
                  <div className="text-xs">
                    <p className="font-extrabold text-emerald-900 dark:text-emerald-200">Đã tải xong bản cập nhật v{updateInfo.version}!</p>
                    <p className="text-emerald-700 dark:text-emerald-400 mt-0.5">Bấm nút bên dưới để chọn thời điểm nâng cấp thích hợp.</p>
                  </div>
                </div>
              )}

              {/* Error Status */}
              {updateInfo.status === 'error' && (
                <div className="bg-rose-50 dark:bg-rose-955/30 border border-rose-200 dark:border-rose-900/50 rounded-2xl p-4 flex items-start gap-3 text-xs text-rose-800 dark:text-rose-300">
                  <span className="text-lg">⚠️</span>
                  <div>
                    <p className="font-bold">Không thể tải bản cập nhật:</p>
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">{updateInfo.error || 'Vui lòng kiểm tra lại kết nối mạng.'}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer Buttons */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-200/80 dark:border-gray-750 flex items-center justify-end gap-2 text-xs">
          {confirmStage ? (
            /* Option A + B Buttons */
            <>
              <button
                onClick={() => setConfirmStage(false)}
                className="px-4 py-2 rounded-full font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                Quay lại
              </button>
              <button
                onClick={handleInstallOnQuit}
                className="px-4 py-2.5 rounded-full bg-gray-700 hover:bg-gray-600 text-white font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                title="Tự nâng cấp ngầm khi bạn chủ động tắt ứng dụng"
              >
                <span>🌙 Cài khi tôi tắt Zagi</span>
              </button>
              <button
                onClick={onInstallNow}
                className="px-5 py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer animate-pulse"
              >
                <span>🚀 Khởi động lại ngay</span>
              </button>
            </>
          ) : (
            /* Main Stage Buttons */
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-full font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                Để sau
              </button>

              {updateInfo.status === 'available' || updateInfo.status === 'idle' ? (
                <button
                  onClick={onStartDownload}
                  className="px-6 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <span>🚀 Nâng cấp ngay</span>
                  <span>→</span>
                </button>
              ) : updateInfo.status === 'downloading' ? (
                <button
                  disabled
                  className="px-6 py-2.5 rounded-full bg-blue-400/50 text-white font-bold opacity-75 cursor-not-allowed flex items-center gap-2"
                >
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Đang tải ({updateInfo.percent || 0}%)</span>
                </button>
              ) : updateInfo.status === 'downloaded' ? (
                <button
                  onClick={() => setConfirmStage(true)}
                  className="px-6 py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2 cursor-pointer animate-pulse"
                >
                  <span>🔄 Khởi động lại & Cập nhật</span>
                </button>
              ) : updateInfo.status === 'error' ? (
                <button
                  onClick={onStartDownload}
                  className="px-5 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md transition-colors cursor-pointer"
                >
                  Thử lại
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
