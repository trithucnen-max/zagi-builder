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
        <div className={`fixed bottom-5 right-5 z-[9990] max-w-sm w-full p-4 rounded-3xl shadow-2xl border transition-all duration-300 ${
          isLight 
            ? 'bg-white/95 border-blue-200 text-gray-800 shadow-blue-500/10' 
            : 'bg-gray-900/95 border-blue-800/50 text-gray-100 shadow-blue-900/20'
        } backdrop-blur-md animate-in fade-in slide-in-from-bottom-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-md shrink-0 animate-bounce">
                🚀
              </div>
              <div>
                <h4 className="text-sm font-extrabold leading-tight">
                  Có bản cập nhật mới Zagi {updateState.version}!
                </h4>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Bản hiện tại: v{CURRENT_VERSION}
                </p>
              </div>
            </div>

            <button
              onClick={handleDismissToast}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg transition-colors text-xs cursor-pointer"
              title="Bỏ qua"
            >
              ✕
            </button>
          </div>

          <div className="mt-3.5 flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={handleDismissToast}
              className="px-3.5 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full transition-colors"
            >
              Để sau
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 text-xs font-black text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 rounded-full transition-all shadow-md shadow-blue-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <span>Xem điểm mới & Nâng cấp</span>
              <span>→</span>
            </button>
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
