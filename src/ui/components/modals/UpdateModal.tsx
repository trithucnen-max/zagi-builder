import React, { useState, useMemo } from 'react';
import ipc from '@/lib/ipc';
import pkg from '../../../../package.json';

const CURRENT_VERSION = pkg.version || '3.0.8';

export interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type?: string;
}

export interface UpdateInfoState {
  version: string;
  releaseNotes?: string | any;
  htmlUrl?: string;
  publishedAt?: string;
  assets?: GitHubAsset[];
  status: 'idle' | 'available' | 'error';
  error?: string;
}

interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
  updateInfo: UpdateInfoState;
}

type PlatformKey = 'windows' | 'mac_arm64' | 'mac_intel' | 'surface' | 'linux';

interface PlatformOption {
  key: PlatformKey;
  name: string;
  shortName: string;
  icon: string;
  ext: string;
  desc: string;
}

const PLATFORMS: PlatformOption[] = [
  { key: 'windows', name: 'Windows (64-bit)', shortName: 'Windows', icon: '🪟', ext: '.exe', desc: 'Dành cho máy tính Windows 10/11' },
  { key: 'mac_arm64', name: 'macOS (Apple Silicon M1/M2/M3/M4)', shortName: 'Mac M1+', icon: '🍎', ext: '.dmg', desc: 'Dành cho Macbook chip Apple M1/M2/M3/M4' },
  { key: 'mac_intel', name: 'macOS (Chip Intel)', shortName: 'Mac Intel', icon: '🍏', ext: '.dmg', desc: 'Dành cho Macbook chip Intel' },
  { key: 'surface', name: 'Windows Surface / ARM', shortName: 'Surface', icon: '💻', ext: '.exe', desc: 'Dành cho Surface hoặc Windows chip ARM' },
  { key: 'linux', name: 'Linux (Ubuntu / Debian)', shortName: 'Linux', icon: '🐧', ext: '.AppImage', desc: 'Dành cho hệ điều hành Linux' },
];

export default function UpdateModal({
  open,
  onClose,
  updateInfo,
}: UpdateModalProps) {
  const [showOtherPlatforms, setShowOtherPlatforms] = useState(false);
  const [downloadTriggered, setDownloadTriggered] = useState(false);

  // Detect current operating system
  const detectedOS = useMemo<PlatformKey>(() => {
    if (typeof navigator === 'undefined') return 'windows';
    const ua = (navigator.userAgent || '').toLowerCase();
    const plat = (navigator.platform || '').toLowerCase();

    if (plat.includes('mac') || ua.includes('macintosh') || ua.includes('mac os')) {
      const isIntel = ua.includes('intel') && !ua.includes('arm64') && !ua.includes('aarch64');
      // Most modern macs are Apple Silicon
      return isIntel ? 'mac_intel' : 'mac_arm64';
    }

    if (plat.includes('linux') || ua.includes('linux')) {
      return 'linux';
    }

    // Windows
    if (ua.includes('surface') || ua.includes('arm64')) {
      return 'surface';
    }
    return 'windows';
  }, []);

  const [selectedPlatform, setSelectedPlatform] = useState<PlatformKey>(detectedOS);

  // Keep selectedPlatform in sync when modal opens
  React.useEffect(() => {
    if (open) {
      setSelectedPlatform(detectedOS);
      setDownloadTriggered(false);
    }
  }, [open, detectedOS]);

  if (!open) return null;

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getAssetForPlatform = (key: PlatformKey): GitHubAsset | null => {
    const assets = updateInfo.assets || [];
    if (assets.length === 0) return null;

    if (key === 'windows') {
      return assets.find(a => a.name.toLowerCase().includes('window.exe') || (a.name.toLowerCase().endsWith('.exe') && !a.name.toLowerCase().includes('surface'))) || null;
    }
    if (key === 'mac_arm64') {
      return assets.find(a => (a.name.toLowerCase().includes('arm64') || a.name.toLowerCase().includes('m1')) && a.name.toLowerCase().endsWith('.dmg')) ||
             assets.find(a => a.name.toLowerCase().endsWith('.dmg') && !a.name.toLowerCase().includes('intel')) || null;
    }
    if (key === 'mac_intel') {
      return assets.find(a => a.name.toLowerCase().includes('intel') && a.name.toLowerCase().endsWith('.dmg')) ||
             assets.find(a => a.name.toLowerCase().endsWith('.dmg')) || null;
    }
    if (key === 'surface') {
      return assets.find(a => a.name.toLowerCase().includes('surface') && a.name.toLowerCase().endsWith('.exe')) || null;
    }
    if (key === 'linux') {
      return assets.find(a => a.name.toLowerCase().endsWith('.appimage') || a.name.toLowerCase().endsWith('.deb')) || null;
    }
    return null;
  };

  const currentPlatformInfo = PLATFORMS.find(p => p.key === selectedPlatform) || PLATFORMS[0];
  const currentAsset = getAssetForPlatform(selectedPlatform);

  const fallbackDownloadUrl = currentAsset?.browser_download_url || updateInfo.htmlUrl || 'https://github.com/trithucnen-max/zagi-builder/releases/latest';

  const handleDownload = (targetUrl?: string) => {
    const url = targetUrl || fallbackDownloadUrl;
    setDownloadTriggered(true);

    if (ipc.shell?.openExternal) {
      ipc.shell.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const renderReleaseNotes = (notes?: string | any) => {
    if (!notes) {
      return (
        <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 list-disc list-inside">
          <li>Cải tiến hiệu năng &amp; tối ưu hóa bộ nhớ cho hệ thống.</li>
          <li>Nâng cấp tính năng Xưng hô thông minh &amp; Tự xưng tự động theo chuẩn Tiếng Việt.</li>
          <li>Sửa lỗi và tăng cường độ ổn định kết nối Zalo &amp; Quét danh bạ.</li>
        </ul>
      );
    }

    if (typeof notes === 'string') {
      const lines = notes.split('\n').filter(l => l.trim().length > 0);
      return (
        <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 font-sans">
          {lines.map((line, idx) => (
            <p key={idx} className="leading-relaxed">
              {line.startsWith('-') || line.startsWith('*') ? (
                <span className="flex items-start gap-1.5">
                  <span className="text-blue-600 font-bold">•</span>
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

    return <p className="text-xs text-slate-500">{JSON.stringify(notes)}</p>;
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">

        {/* Modal Top Header — Clean Bright Banner with High Contrast */}
        <div className="bg-white dark:bg-gray-900 px-6 pt-6 pb-4 border-b border-slate-100 dark:border-gray-800 flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-2xl shadow-xs">
              🚀
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                  CẬP NHẬT BẢN MỚI
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 font-bold text-xs">
                  v{(updateInfo.version || '3.1.8').replace(/^v+/i, '')}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Bản hiện tại: <span className="font-semibold text-slate-700 dark:text-slate-300">v{CURRENT_VERSION}</span> &nbsp;→&nbsp; Bản mới nhất: <span className="font-bold text-blue-600 dark:text-blue-400">v{(updateInfo.version || '3.1.8').replace(/^v+/i, '')}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Đóng"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4.5 flex-1 overflow-y-auto max-h-[68vh] bg-white dark:bg-gray-900">
          {/* Release Notes Card */}
          <div>
            <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
              <span>✨ CÓ GÌ MỚI TRONG BẢN CẬP NHẬT NÀY</span>
            </h4>
            <div className="max-h-40 overflow-y-auto bg-slate-50 dark:bg-gray-800/60 border border-slate-200/80 dark:border-gray-700/60 rounded-2xl p-4 custom-scrollbar">
              {renderReleaseNotes(updateInfo.releaseNotes)}
            </div>
          </div>

          {/* Direct Download Card */}
          <div className="bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 rounded-2xl p-4.5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{currentPlatformInfo.icon}</span>
                <div>
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Hệ điều hành của bạn:</span>
                    <span className="text-blue-700 dark:text-blue-300 font-black">{currentPlatformInfo.name}</span>
                  </div>
                  {currentAsset && (
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                      {currentAsset.name} {currentAsset.size ? `(${formatBytes(currentAsset.size)})` : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Main Download Button (Blue with White Text) */}
            <button
              type="button"
              onClick={() => handleDownload()}
              className="w-full py-3.5 px-5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-2xl text-sm font-extrabold shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>
                Tải về bản cài đặt cho {currentPlatformInfo.shortName} ({currentPlatformInfo.ext}{currentAsset?.size ? ` - ${formatBytes(currentAsset.size)}` : ''})
              </span>
            </button>

            {downloadTriggered && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-medium flex items-start gap-2 animate-in fade-in">
                <span>✓</span>
                <div>
                  <span className="font-bold">Đang tải file cài đặt qua trình duyệt!</span>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                    Sau khi tải xong, bạn chỉ cần nhấp đúp vào file để cập nhật phiên bản mới.
                  </p>
                </div>
              </div>
            )}

            {/* Toggle other platforms selector */}
            <div className="pt-2 border-t border-blue-200/60 dark:border-blue-900/40 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowOtherPlatforms(!showOtherPlatforms)}
                className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{showOtherPlatforms ? '▴ Thu gọn danh sách phiên bản khác' : '▾ Bạn muốn tải cho hệ điều hành khác? (Mac Intel, Surface, Linux...)'}</span>
              </button>
            </div>

            {/* Other Platforms List */}
            {showOtherPlatforms && (
              <div className="space-y-1.5 pt-1 animate-in fade-in duration-150">
                {PLATFORMS.map(p => {
                  const asset = getAssetForPlatform(p.key);
                  const isCurrent = p.key === selectedPlatform;
                  return (
                    <div
                      key={p.key}
                      onClick={() => {
                        setSelectedPlatform(p.key);
                        if (asset) handleDownload(asset.browser_download_url);
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                        isCurrent
                          ? 'bg-blue-100/70 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 font-bold'
                          : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{p.icon}</span>
                        <div>
                          <p className="text-slate-800 dark:text-white">{p.name}</p>
                          <p className="text-[10px] text-slate-400 font-normal">{p.desc}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold shrink-0 shadow-xs cursor-pointer"
                      >
                        ⬇️ Tải {asset?.size ? `(${formatBytes(asset.size)})` : ''}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-gray-850 border-t border-slate-200/80 dark:border-gray-800 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-400">
            Dữ liệu tài khoản &amp; CRM được bảo toàn 100% khi nâng cấp.
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              Để sau
            </button>

            <button
              type="button"
              onClick={() => handleDownload()}
              className="px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
            >
              ⬇️ Tải ngay
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
