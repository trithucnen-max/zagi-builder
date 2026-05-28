import { create } from 'zustand';

function loadAiDisabledThreads(): Record<string, boolean> {
  try {
    const s = localStorage.getItem('ai_disabled_threads');
    if (s) return JSON.parse(s);
  } catch {}
  return {};
}

function loadAiDisabledAccounts(): Record<string, boolean> {
  try {
    const s = localStorage.getItem('ai_disabled_accounts');
    if (s) return JSON.parse(s);
  } catch {}
  return {};
}

function loadAiSuggestionsEnabled(): boolean {
  try {
    return localStorage.getItem('ai_suggestions_enabled') === 'true';
  } catch {}
  return false;
}

function loadAiAutoInjectZaloContext(): boolean {
  try {
    const stored = localStorage.getItem('ai_auto_inject_zalo_context');
    return stored === null ? true : stored === 'true';
  } catch {}
  return true;
}

function loadAiQuickPanelContextCountOverride(): number | null {
  try {
    const stored = localStorage.getItem('ai_quick_panel_context_count_override');
    if (!stored) return null;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return null;
    return Math.min(100, Math.max(1, Math.round(parsed)));
  } catch {}
  return null;
}

export interface AiStore {
  aiSuggestionsEnabled: boolean;
  aiSuggestions: string[];
  aiSuggestionsLoading: boolean;
  aiAutoInjectZaloContext: boolean;
  aiQuickPanelContextCountOverride: number | null;
  aiSuggestDisabledThreads: Record<string, boolean>;
  aiSuggestDisabledAccounts: Record<string, boolean>;

  setAiSuggestionsEnabled: (enabled: boolean) => void;
  setAiSuggestions: (suggestions: string[]) => void;
  setAiSuggestionsLoading: (loading: boolean) => void;
  setAiAutoInjectZaloContext: (enabled: boolean) => void;
  setAiQuickPanelContextCountOverride: (count: number | null) => void;
  toggleAiDisableForThread: (zaloId: string, threadId: string) => void;
  toggleAiDisableForAccount: (zaloId: string) => void;
  isAiSuggestDisabled: (zaloId: string, threadId: string) => boolean;
}

export const useAiStore = create<AiStore>((set, get) => ({
  aiSuggestionsEnabled: loadAiSuggestionsEnabled(),
  aiSuggestions: [],
  aiSuggestionsLoading: false,
  aiAutoInjectZaloContext: loadAiAutoInjectZaloContext(),
  aiQuickPanelContextCountOverride: loadAiQuickPanelContextCountOverride(),
  aiSuggestDisabledThreads: loadAiDisabledThreads(),
  aiSuggestDisabledAccounts: loadAiDisabledAccounts(),

  setAiSuggestionsEnabled: (enabled) => {
    try {
      localStorage.setItem('ai_suggestions_enabled', String(enabled));
    } catch {}
    set({ aiSuggestionsEnabled: enabled, aiSuggestions: [] });
  },
  setAiSuggestions: (suggestions) => set({ aiSuggestions: suggestions }),
  setAiSuggestionsLoading: (loading) => set({ aiSuggestionsLoading: loading }),
  setAiAutoInjectZaloContext: (enabled) => {
    try {
      localStorage.setItem('ai_auto_inject_zalo_context', String(enabled));
    } catch {}
    set({ aiAutoInjectZaloContext: enabled });
  },
  setAiQuickPanelContextCountOverride: (count) => {
    const normalized = count === null
      ? null
      : Math.min(100, Math.max(1, Math.round(Number(count) || 30)));
    try {
      if (normalized === null) {
        localStorage.removeItem('ai_quick_panel_context_count_override');
      } else {
        localStorage.setItem('ai_quick_panel_context_count_override', String(normalized));
      }
    } catch {}
    set({ aiQuickPanelContextCountOverride: normalized });
  },
  toggleAiDisableForThread: (zaloId, threadId) => set((s) => {
    const key = `${zaloId}_${threadId}`;
    const next = { ...s.aiSuggestDisabledThreads };
    if (next[key]) {
      delete next[key];
    } else {
      next[key] = true;
    }
    try {
      localStorage.setItem('ai_disabled_threads', JSON.stringify(next));
    } catch {}
    return { aiSuggestDisabledThreads: next };
  }),
  toggleAiDisableForAccount: (zaloId) => set((s) => {
    const next = { ...s.aiSuggestDisabledAccounts };
    if (next[zaloId]) {
      delete next[zaloId];
    } else {
      next[zaloId] = true;
    }
    try {
      localStorage.setItem('ai_disabled_accounts', JSON.stringify(next));
    } catch {}
    return { aiSuggestDisabledAccounts: next };
  }),
  isAiSuggestDisabled: (zaloId, threadId) => {
    const s = get();
    if (!s.aiSuggestionsEnabled) return true;
    if (s.aiSuggestDisabledAccounts[zaloId]) return true;
    if (s.aiSuggestDisabledThreads[`${zaloId}_${threadId}`]) return true;
    return false;
  },
}));
