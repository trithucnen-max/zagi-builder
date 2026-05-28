import { create } from 'zustand';

type AppView = 'chat' | 'friends' | 'settings' | 'dashboard' | 'crm' | 'workflow' | 'integration' | 'analytics' | 'erp';
export type AppTheme = 'dark' | 'light';

interface ViewStore {
  view: AppView;
  isLoading: boolean;
  theme: AppTheme;
  mergedInboxMode: boolean;
  mergedInboxAccounts: string[];
  mergedInboxFilterAccount: string | null;
  mobileShowChat: boolean;
  analyticsInitialTab: string | null;
  crmRequestUnseenByAccount: Record<string, boolean>;

  setView: (view: AppView) => void;
  setLoading: (loading: boolean) => void;
  setTheme: (theme: AppTheme) => void;
  enterMergedInbox: (accountIds: string[]) => void;
  exitMergedInbox: () => void;
  setMergedInboxFilter: (zaloId: string | null) => void;
  setMobileShowChat: (show: boolean) => void;
  setAnalyticsInitialTab: (tab: string | null) => void;
  navigateToAnalytics: (tab?: string) => void;
  markCRMRequestUnseen: (zaloId: string) => void;
  clearCRMRequestUnseen: (zaloId: string) => void;
  hasCRMRequestUnseen: (zaloId: string) => boolean;
  hasAnyCRMRequestUnseen: () => boolean;
}

const loadTheme = (): AppTheme => {
  try {
    const stored = localStorage.getItem('app_theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return 'light';
};

function loadCRMRequestUnseen(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem('crm_request_unseen_accounts');
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCRMRequestUnseen(map: Record<string, boolean>) {
  try { localStorage.setItem('crm_request_unseen_accounts', JSON.stringify(map)); } catch {}
}

export const useViewStore = create<ViewStore>((set, get) => ({
  view: 'dashboard',
  isLoading: false,
  theme: loadTheme(),
  mergedInboxMode: false,
  mergedInboxAccounts: [],
  mergedInboxFilterAccount: null,
  mobileShowChat: false,
  analyticsInitialTab: null,
  crmRequestUnseenByAccount: loadCRMRequestUnseen(),

  setView: (view) => set({ view }),
  setLoading: (isLoading) => set({ isLoading }),
  setTheme: (theme) => {
    try { localStorage.setItem('app_theme', theme); } catch {}
    set({ theme });
  },
  enterMergedInbox: (accountIds) => set({ mergedInboxMode: true, mergedInboxAccounts: accountIds, mergedInboxFilterAccount: null, view: 'chat' }),
  exitMergedInbox: () => set({ mergedInboxMode: false, mergedInboxAccounts: [], mergedInboxFilterAccount: null }),
  setMergedInboxFilter: (zaloId) => set({ mergedInboxFilterAccount: zaloId }),
  setMobileShowChat: (show) => set({ mobileShowChat: show }),
  setAnalyticsInitialTab: (tab) => set({ analyticsInitialTab: tab }),
  navigateToAnalytics: (tab) => set({ view: 'analytics', analyticsInitialTab: tab || null }),

  markCRMRequestUnseen: (zaloId) => set((s) => {
    if (!zaloId || s.crmRequestUnseenByAccount[zaloId]) return {};
    const next = { ...s.crmRequestUnseenByAccount, [zaloId]: true };
    saveCRMRequestUnseen(next);
    return { crmRequestUnseenByAccount: next };
  }),
  clearCRMRequestUnseen: (zaloId) => set((s) => {
    if (!zaloId || !s.crmRequestUnseenByAccount[zaloId]) return {};
    const next = { ...s.crmRequestUnseenByAccount };
    delete next[zaloId];
    saveCRMRequestUnseen(next);
    return { crmRequestUnseenByAccount: next };
  }),
  hasCRMRequestUnseen: (zaloId) => !!get().crmRequestUnseenByAccount[zaloId],
  hasAnyCRMRequestUnseen: () => Object.values(get().crmRequestUnseenByAccount).some(Boolean),
}));
