import React from 'react';

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
              🚀
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight text-white">BẢN CẬP NHẬT MỚI</h3>
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
          {/* Release Notes Title */}
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
                <p className="text-emerald-700 dark:text-emerald-400 mt-0.5">Bấm nút bên dưới để tự động khởi động lại và áp dụng ngay.</p>
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
        </div>

        {/* Modal Footer Buttons */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-200/80 dark:border-gray-750 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Để sau
          </button>

          {updateInfo.status === 'available' || updateInfo.status === 'idle' ? (
            <button
              onClick={onStartDownload}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2"
            >
              <span>🚀 Nâng cấp ngay</span>
              <span>→</span>
            </button>
          ) : updateInfo.status === 'downloading' ? (
            <button
              disabled
              className="px-6 py-2.5 rounded-full bg-blue-400/50 text-white text-xs font-bold opacity-75 cursor-not-allowed flex items-center gap-2"
            >
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Đang tải ({updateInfo.percent || 0}%)</span>
            </button>
          ) : updateInfo.status === 'downloaded' ? (
            <button
              onClick={onInstallNow}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-black shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2 animate-pulse"
            >
              <span>🔄 Khởi động lại & Cập nhật (1-Click)</span>
            </button>
          ) : updateInfo.status === 'error' ? (
            <button
              onClick={onStartDownload}
              className="px-5 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md transition-colors"
            >
              Thử lại
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
