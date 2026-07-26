/**
 * Tracks which settings tabs the user has already visited.
 * Tabs in WATCHLIST show a red "new" dot until the user opens them.
 * State is persisted in localStorage (per-device, not per-account).
 */

declare const __APP_VERSION__: string;

const LS_KEY = 'settings_seen_tabs';
const LS_CHANGELOG_KEY = 'changelog_last_seen_version';

/** Tabs that show a red dot until first visit */
export const SETTINGS_WATCHLIST = ['storage', 'introduction'] as const;

export function loadSeenTabs(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Mark a tab as seen and fire a window event so other components can react */
export function markTabSeen(tab: string): void {
  try {
    const seen = loadSeenTabs();
    if (seen.has(tab)) return; // already seen — no-op
    seen.add(tab);
    localStorage.setItem(LS_KEY, JSON.stringify([...seen]));
    window.dispatchEvent(new CustomEvent('settings:tabSeen'));
  } catch {}
}

/** Returns true if any watched tab has NOT been seen yet */
export function hasUnseenSettingsTabs(): boolean {
  const seen = loadSeenTabs();
  return SETTINGS_WATCHLIST.some(t => !seen.has(t));
}

/**
 * Returns true if the user has NOT seen the changelog for the current app version.
 * Compares the stored version with the bundled __APP_VERSION__.
 */
export function hasUnseenChangelog(): boolean {
  try {
    const lastSeen = localStorage.getItem(LS_CHANGELOG_KEY);
    return lastSeen !== __APP_VERSION__;
  } catch {
    return false;
  }
}

/** Mark the current version's changelog as seen */
export function markChangelogSeen(): void {
  try {
    localStorage.setItem(LS_CHANGELOG_KEY, __APP_VERSION__);
  } catch {}
}
