import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import ipc from '@/lib/ipc';
import UpdateModal, { UpdateInfoState } from '../modals/UpdateModal';
import pkg from '../../../../package.json';

const CURRENT_VERSION = pkg.version || '3.0.8';
const GITHUB_RELEASES_API = 'https://api.github.com/repos/trithucnen-max/zagi-builder/releases';

interface ReleaseInfo {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
}

function parseV3Version(tag: string): { major: number; minor: number; patch: number } | null {
  if (!tag) return null;
  const clean = tag.trim().replace(/^v/i, '');
  const parts = clean.split('.').map(n => parseInt(n, 10));
  if (parts.length >= 3 && parts[0] === 3 && parts.every(n => !isNaN(n))) {
    return { major: parts[0], minor: parts[1], patch: parts[2] };
  }
  return null;
}

function isNewerV3Version(latestTag: string, currentVersion: string): boolean {
  const latest = parseV3Version(latestTag);
  const current = parseV3Version(currentVersion);
  if (!latest || !current) return false;

  if (latest.major > current.major) return true;
  if (latest.major < current.major) return false;

  if (latest.minor > current.minor) return true;
  if (latest.minor < current.minor) return false;

  return latest.patch > current.patch;
}

export function UpdateNotification() {
  const [updateState, setUpdateState] = useState<UpdateInfoState>({
    version: '',
    releaseNotes: '',
    status: 'idle'
  });
  const [showModal, setShowModal] = useState(false);
  const [dismissedToast, setDismissedToast] = useState(false);
  const theme = useAppStore(s => s.resolvedTheme || (s.theme === 'light' ? 'light' : 'dark'));
  const isLight = theme === 'light';

  useEffect(() => {
    if (!ipc.on) return;

    const unAvailable = ipc.on('update:available', (info: any) => {
      const ver = info?.version ? `v${info.version.replace(/^v/i, '')}` : '';
      setUpdateState(prev => ({
        ...prev,
        version: ver || prev.version,
        releaseNotes: info?.releaseNotes || prev.releaseNotes,
        status: 'available'
      }));
      setDismissedToast(false);
    });

    const unProgress = ipc.on('update:progress', (progress: any) => {
      setUpdateState(prev => ({
        ...prev,
        status: 'downloading',
        percent: progress?.percent ?? prev.percent ?? 0,
        bytesPerSecond: progress?.bytesPerSecond ?? prev.bytesPerSecond,
        transferred: progress?.transferred ?? prev.transferred,
        total: progress?.total ?? prev.total
      }));
    });

    const unDownloaded = ipc.on('update:downloaded', (info: any) => {
      const ver = info?.version ? `v${info.version.replace(/^v/i, '')}` : '';
      setUpdateState(prev => ({
        ...prev,
        version: ver || prev.version,
        status: 'downloaded',
        percent: 100
      }));
      setShowModal(true);
    });

    const unError = ipc.on('update:error', (err: any) => {
      setUpdateState(prev => ({
        ...prev,
        status: 'error',
        error: err?.message || 'Không thể tải bản cập nhật.'
      }));
    });

    return () => {
      if (unAvailable) unAvailable();
      if (unProgress) unProgress();
      if (unDownloaded) unDownloaded();
      if (unError) unError();
    };
  }, []);

  const checkGitHubRelease = useCallback(async () => {
    try {
      const res = await fetch(GITHUB_RELEASES_API, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      if (!res.ok) return;

      const releases: ReleaseInfo[] = await res.json();
      if (!Array.isArray(releases) || releases.length === 0) return;

      const validV3Releases = releases
        .filter(r => parseV3Version(r.tag_name) !== null)
        .sort((a, b) => {
          const vA = parseV3Version(a.tag_name)!;
          const vB = parseV3Version(b.tag_name)!;
          if (vA.major !== vB.major) return vB.major - vA.major;
          if (vA.minor !== vB.minor) return vB.minor - vA.minor;
          return vB.patch - vA.patch;
        });

      if (validV3Releases.length === 0) return;

      const latestV3 = validV3Releases[0];
      const dismissedTag = localStorage.getItem('zagi_dismissed_update_tag');

      if (isNewerV3Version(latestV3.tag_name, CURRENT_VERSION) && dismissedTag !== latestV3.tag_name) {
        setUpdateState(prev => {
          if (prev.status !== 'idle') return prev;
          return {
            ...prev,
            version: latestV3.tag_name,
            releaseNotes: latestV3.body,
            status: 'available'
          };
        });
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    checkGitHubRelease();
    const timer = setInterval(checkGitHubRelease, 4 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [checkGitHubRelease]);

  const handleStartDownload = () => {
    setUpdateState(prev => ({ ...prev, status: 'downloading', percent: 5 }));
    if (ipc.update?.download) {
      ipc.update.download();
    }
  };

  const handleInstallNow = () => {
    if (ipc.update?.install) {
      ipc.update.install();
    }
  };

  const handleDismissToast = () => {
    if (updateState.version) {
      localStorage.setItem('zagi_dismissed_update_tag', updateState.version);
    }
    setDismissedToast(true);
  };

  const hasUpdate = updateState.status !== 'idle' && !!updateState.version;

  return (
    <>
      {hasUpdate && !dismissedToast && !showModal && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 pointer-events-none">
          {/* Centered update notification card */}
          <div className={`pointer-events-auto w-full max-w-sm rounded-3xl shadow-2xl border overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-6 ${
            isLight
              ? 'bg-white border-blue-100 shadow-blue-500/15'
              : 'bg-gray-900 border-blue-800/40 shadow-blue-900/30'
          }`}>
            {/* Blue header strip */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-2xl shadow-sm animate-bounce">
                  🚀
                </div>
                <div>
                  <h4 className="text-sm font-black text-white leading-tight">
                    Có bản cập nhật mới!
                  </h4>
                  <p className="text-xs text-blue-100 mt-0.5">
                    Zagi <span className="font-bold">{updateState.version}</span> đã sẵn sàng
                  </p>
                </div>
              </div>
              <button
                onClick={handleDismissToast}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white text-xs transition-colors cursor-pointer"
                title="Bỏ qua"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <p className={`text-xs leading-relaxed ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                Bản hiện tại: <span className="font-semibold">v{CURRENT_VERSION}</span>
                &nbsp;→&nbsp;
                <span className={`font-bold ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>{updateState.version}</span>
              </p>
            </div>

            {/* Footer buttons */}
            <div className={`px-5 pb-5 flex items-center gap-3`}>
              <button
                onClick={handleDismissToast}
                className={`flex-1 py-2.5 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                  isLight
                    ? 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    : 'border-gray-700 text-gray-400 hover:bg-gray-800'
                }`}
              >
                Để sau
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="flex-[2] py-2.5 rounded-full text-xs font-black text-white bg-blue-600 hover:bg-blue-500 active:scale-95 transition-all shadow-md shadow-blue-500/25 cursor-pointer"
              >
                Xem điểm mới &amp; Nâng cấp →
              </button>
            </div>
          </div>
        </div>
      )}

      <UpdateModal
        open={showModal}
        onClose={() => setShowModal(false)}
        updateInfo={updateState}
        onStartDownload={handleStartDownload}
        onInstallNow={handleInstallNow}
      />
    </>
  );
}
