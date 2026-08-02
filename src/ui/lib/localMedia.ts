/**
 * Convert absolute local file path → local-media:// URL or boss REST URL.
 *
 * - Standalone/Boss mode: dùng local-media:// (Electron custom protocol)
 * - Employee mode: dùng boss /api/media/ URL
 *
 * Usage:
 *   <img src={toLocalMediaUrl(filePath, zaloId)} />
 */

import { useEmployeeStore } from '../store/employeeStore';

function getBossBaseUrl(): string {
  try {
    return useEmployeeStore.getState().bossUrl || '';
  } catch {
    return '';
  }
}

export function toLocalMediaUrl(filePath: string, zaloId?: string): string {
  if (!filePath) return '';

  const isWeb = typeof window !== 'undefined' && !(window as any).electronAPI;
  const isEmployee = getMode() === 'employee';

  if (isWeb || isEmployee) {
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }

    let bossUrl = getBossBaseUrl();
    if (!bossUrl && isWeb) {
      try {
        const saved = localStorage.getItem('zagi_browser_workspaces');
        if (saved) {
          const parsed = JSON.parse(saved);
          const activeWs = parsed.workspaces?.find((w: any) => w.id === parsed.activeId) || parsed.workspaces?.[0];
          if (activeWs && activeWs.bossUrl) bossUrl = activeWs.bossUrl;
        }
      } catch {}
    }
    if (!bossUrl) bossUrl = 'http://127.0.0.1:9900';
    bossUrl = bossUrl.trim().replace(/\/+$/, '');
    if (!bossUrl.startsWith('http://') && !bossUrl.startsWith('https://')) bossUrl = `http://${bossUrl}`;

    const cleanPath = filePath.replace(/^local-media:\/*/, '').replace(/^file:\/\/*/, '');
    if (cleanPath.startsWith('api/library/') || cleanPath.startsWith('api/media/')) {
      return `${bossUrl}/${cleanPath}`;
    }
    return `${bossUrl}/api/media/file?path=${encodeURIComponent(cleanPath)}`;
  }

  // Standalone/Boss Electron App: use local-media:// custom protocol
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }
  if (filePath.startsWith('local-media://')) {
    const clean = filePath.replace(/^local-media:\/*/, '/');
    return 'local-media://' + (clean.startsWith('/') ? clean : '/' + clean);
  }

  const stripped = filePath.replace(/^file:\/*/, '/');
  const normalized = stripped.replace(/\\/g, '/');
  const withSlash = normalized.startsWith('/') ? normalized : '/' + normalized;
  return 'local-media://' + withSlash;
}

/**
 * Convert boss filesystem path → boss REST media URL
 * Input:  /home/boss/media/zaloId/2024/06/27/abc.jpg
 *         D:\media\zaloId\2024\06\27\abc.jpg
 * Output: https://boss/api/media/zaloId/2024/06/27/abc.jpg
 */
function toBossMediaUrl(localPath: string, bossUrl: string, zaloId?: string): string {
  try {
    // Normalize path separators
    let normalized = localPath.replace(/\\/g, '/');

    const mediaMatch = normalized.match(/(?:^|\/)(media|_uploads|avatar)\/(.+)/i);
    if (mediaMatch) {
      const type = mediaMatch[1].toLowerCase();
      const rest = mediaMatch[2];
      if (type === 'media') {
        return `${bossUrl}/api/media/${rest}`;
      }
      return `${bossUrl}/api/media/${type}/${rest}`;
    }

    // Fallback: use as-is with media prefix
    // Extract filename from path
    const filename = normalized.split('/').pop() || 'file';
    if (zaloId) {
      return `${bossUrl}/api/media/${zaloId}/misc/${filename}`;
    }

    // Last resort: construct from the full path (may not work on boss)
    return `${bossUrl}/api/media/external/${encodeURIComponent(normalized)}`;
  } catch {
    return localPath;
  }
}

function getMode(): string {
  try {
    return useEmployeeStore.getState().mode;
  } catch {
    return 'standalone';
  }
}

/**
 * Check if a path is a local file path (not a remote URL)
 */
export function isLocalPath(path: string): boolean {
  if (!path) return false;
  return !path.startsWith('http://') && !path.startsWith('https://') && !path.startsWith('data:');
}
