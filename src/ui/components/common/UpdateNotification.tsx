import React, { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import pkg from '../../../../package.json';

const CURRENT_VERSION = pkg.version || '3.0.6';
const GITHUB_RELEASES_API = 'https://api.github.com/repos/trithucnen-max/zagi-builder/releases';

interface ReleaseInfo {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
}

/**
 * Tách và kiểm tra phiên bản dải v3.x.x
 * Bỏ qua hoàn toàn dải v27.x.x cũ hoặc các định dạng sai chuẩn.
 */
function parseV3Version(tag: string): { major: number; minor: number; patch: number } | null {
  if (!tag) return null;
  const clean = tag.trim().replace(/^v/i, '');
  const parts = clean.split('.').map(n => parseInt(n, 10));
  // Chỉ chấp nhận phiên bản thuộc chuỗi v3.x.x (major === 3)
  if (parts.length >= 3 && parts[0] === 3 && parts.every(n => !isNaN(n))) {
    return { major: parts[0], minor: parts[1], patch: parts[2] };
  }
  return null;
}

/**
 * So sánh phiên bản v3 mới nhất với phiên bản hiện tại
 */
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
  const [updateRelease, setUpdateRelease] = useState<ReleaseInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const theme = useAppStore(s => s.resolvedTheme || (s.theme === 'light' ? 'light' : 'dark'));
  const isLight = theme === 'light';

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch(GITHUB_RELEASES_API, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      if (!res.ok) return;

      const releases: ReleaseInfo[] = await res.json();
      if (!Array.isArray(releases) || releases.length === 0) return;

      // Lọc các bản release hợp lệ thuộc dải v3.x.x
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
        setUpdateRelease(latestV3);
      }
    } catch {
      // Im lặng khi không có mạng hoặc lỗi API GitHub
    }
  }, []);

  useEffect(() => {
    checkVersion();
    // Quét kiểm tra phiên bản mới mỗi 4 giờ
    const timer = setInterval(checkVersion, 4 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [checkVersion]);

  const handleDismiss = () => {
    if (updateRelease) {
      localStorage.setItem('zagi_dismissed_update_tag', updateRelease.tag_name);
    }
    setDismissed(true);
  };

  const handleOpenReleaseUrl = () => {
    if (updateRelease?.html_url) {
      window.open(updateRelease.html_url, '_blank', 'noopener,noreferrer');
    }
  };

  if (!updateRelease || dismissed) return null;

  return (
    <div className={`fixed bottom-5 right-5 z-[9999] max-w-sm w-full p-4 rounded-2xl shadow-2xl border transition-all duration-300 ${
      isLight 
        ? 'bg-white/95 border-blue-200 text-gray-800 shadow-blue-500/10' 
        : 'bg-gray-900/95 border-blue-800/50 text-gray-100 shadow-blue-900/20'
    } backdrop-blur-md animate-in fade-in slide-in-from-bottom-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-md shrink-0">
            🚀
          </div>
          <div>
            <h4 className="text-sm font-bold leading-tight">
              Có phiên bản mới Zagi {updateRelease.tag_name}!
            </h4>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Bản hiện tại: v{CURRENT_VERSION}
            </p>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg transition-colors text-xs"
          title="Bỏ qua"
        >
          ✕
        </button>
      </div>

      <p className="text-xs mt-2.5 text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
        {updateRelease.body ? updateRelease.body.replace(/[#*`]/g, '').slice(0, 120) + '...' : 'Cập nhật giao diện và tối ưu hóa tính năng Zagi.'}
      </p>

      <div className="mt-3.5 flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={handleDismiss}
          className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg transition-colors"
        >
          Để sau
        </button>
        <button
          onClick={handleOpenReleaseUrl}
          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-lg transition-all shadow-md shadow-blue-500/20 flex items-center gap-1.5"
        >
          <span>Xem & Tải về</span>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>
    </div>
  );
}
