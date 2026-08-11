import React, { useEffect, useState, useCallback } from 'react';
import UpdateModal, { UpdateInfoState, GitHubAsset } from '../modals/UpdateModal';
import pkg from '../../../../package.json';

const CURRENT_VERSION = pkg.version || '3.0.8';
const GITHUB_RELEASES_API = 'https://api.github.com/repos/trithucnen-max/zagi-builder/releases';

interface ReleaseInfo {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  assets?: GitHubAsset[];
}

function parseSemver(tag: string): { major: number; minor: number; patch: number } | null {
  if (!tag) return null;
  const clean = tag.trim().replace(/^v/i, '');
  const parts = clean.split('.').map(n => parseInt(n, 10));
  if (parts.length >= 3 && parts.every(n => !isNaN(n))) {
    return { major: parts[0], minor: parts[1], patch: parts[2] };
  }
  return null;
}

function isNewerVersion(latestTag: string, currentVersion: string): boolean {
  const latest = parseSemver(latestTag);
  const current = parseSemver(currentVersion);
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
    status: 'idle',
    assets: []
  });
  const [showModal, setShowModal] = useState(false);
  const [dismissedToast, setDismissedToast] = useState(false);

  const checkGitHubRelease = useCallback(async () => {
    try {
      const res = await fetch(GITHUB_RELEASES_API, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      if (!res.ok) return;

      const releases: ReleaseInfo[] = await res.json();
      if (!Array.isArray(releases) || releases.length === 0) return;

      const validReleases = releases
        .filter(r => parseSemver(r.tag_name) !== null)
        .sort((a, b) => {
          const vA = parseSemver(a.tag_name)!;
          const vB = parseSemver(b.tag_name)!;
          if (vA.major !== vB.major) return vB.major - vA.major;
          if (vA.minor !== vB.minor) return vB.minor - vA.minor;
          return vB.patch - vA.patch;
        });

      if (validReleases.length === 0) return;

      const latest = validReleases[0];
      const dismissedTag = localStorage.getItem('zagi_dismissed_update_tag');

      if (isNewerVersion(latest.tag_name, CURRENT_VERSION) && dismissedTag !== latest.tag_name) {
        setUpdateState({
          version: latest.tag_name,
          releaseNotes: latest.body,
          htmlUrl: latest.html_url,
          publishedAt: latest.published_at,
          assets: latest.assets || [],
          status: 'available'
        });
      }
    } catch {
      // Non-fatal if offline
    }
  }, []);

  useEffect(() => {
    // Check on mount
    checkGitHubRelease();

    // Check every 30 minutes while app is open
    const timer = setInterval(checkGitHubRelease, 30 * 60 * 1000);

    // Check immediately when user focuses back to Zagi
    const handleFocus = () => {
      checkGitHubRelease();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkGitHubRelease]);

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
          {/* Clean daytime high-contrast popup card */}
          <div className="pointer-events-auto w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-6">
            
            {/* Header */}
            <div className="px-5 pt-5 pb-3.5 flex items-start justify-between border-b border-slate-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-xl shadow-xs">
                  🚀
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                    Có bản cập nhật mới!
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Zagi <span className="font-bold text-blue-600 dark:text-blue-400">{updateState.version}</span> đã sẵn sàng
                  </p>
                </div>
              </div>
              <button
                onClick={handleDismissToast}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:hover:bg-gray-700 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white text-xs transition-colors cursor-pointer"
                title="Bỏ qua"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 bg-slate-50/50 dark:bg-gray-850">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Bản hiện tại: <span className="font-semibold text-slate-800 dark:text-slate-200">v{CURRENT_VERSION}</span>
                &nbsp;→&nbsp;
                <span className="font-extrabold text-blue-600 dark:text-blue-400">{updateState.version}</span>
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Tải trực tiếp bản cài đặt tương thích cho máy tính của bạn chỉ với 1 cú nhấp.
              </p>
            </div>

            {/* Footer buttons */}
            <div className="px-5 py-4 bg-white dark:bg-gray-900 border-t border-slate-100 dark:border-gray-800 flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleDismissToast}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors cursor-pointer border border-slate-200 dark:border-gray-700"
              >
                Để sau
              </button>
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="flex-[2] py-2.5 rounded-xl text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-98 transition-all shadow-md shadow-blue-500/25 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Xem &amp; Tải về</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <UpdateModal
        open={showModal}
        onClose={() => setShowModal(false)}
        updateInfo={updateState}
      />
    </>
  );
}
