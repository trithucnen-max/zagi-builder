import { create } from 'zustand';
import { useViewStore } from './viewStore';
import { useModalStore } from './modalStore';
import { usePanelStore } from './panelStore';
import { useAiStore } from './aiStore';
import { useLabelStore, LabelData } from './labelStore';
import { useThreadFlagStore, NotifSettings } from './threadFlagStore';
import { useGroupCacheStore, CachedGroupInfo, GroupMember } from './groupCacheStore';
import { useIntegrationShortcutStore, PinnedIntegrationShortcut } from './integrationShortcutStore';

export type { LabelData, NotifSettings, CachedGroupInfo, GroupMember, PinnedIntegrationShortcut };

type AppView = 'chat' | 'friends' | 'settings' | 'dashboard' | 'crm' | 'workflow' | 'integration' | 'analytics' | 'erp';
export type AppTheme = 'dark' | 'light';

export interface QuickChatTarget {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  threadType: number; // 0=user, 1=group
  phone?: string;
}

interface AppStore {
  // ─── ViewStore States & Actions ───
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

  // ─── ModalStore States & Actions ───
  notification: { message: string; type: 'success' | 'error' | 'info' | 'warning' } | null;
  erpPermissionDialog: { title: string; message: string; details?: string } | null;
  addAccountModalOpen: boolean;
  quickChatOpen: boolean;
  quickChatTarget: QuickChatTarget | null;
  quickChatZaloId: string | null;

  showNotification: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  hideNotification: () => void;
  showErpPermissionDialog: (payload?: { title?: string; message?: string; details?: string }) => void;
  hideErpPermissionDialog: () => void;
  setAddAccountModalOpen: (open: boolean) => void;
  openQuickChat: (opts?: { target?: QuickChatTarget; zaloId?: string }) => void;
  closeQuickChat: () => void;

  // ─── PanelStore States & Actions ───
  showConversationInfo: boolean;
  showGroupBoard: boolean;
  showIntegrationQuickPanel: boolean;
  showAIQuickPanel: boolean;
  openReminderPanel: boolean;
  searchOpen: boolean;
  searchHighlightQuery: string;
  commandPaletteOpen: boolean;

  toggleConversationInfo: () => void;
  setShowGroupBoard: (open: boolean) => void;
  toggleIntegrationQuickPanel: () => void;
  toggleAIQuickPanel: () => void;
  setOpenReminderPanel: (open: boolean) => void;
  toggleSearch: () => void;
  setSearchOpen: (open: boolean) => void;
  setSearchHighlightQuery: (query: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;

  // ─── AIStore States & Actions ───
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

  // ─── LabelStore States & Actions ───
  labels: Record<string, LabelData[]>;
  labelsVersionMap: Record<string, number>;
  labelsFetchedAt: Record<string, number>;
  setLabelsVersion: (zaloId: string, version: number) => void;
  fetchLabelsWithCache: (zaloId: string, auth: any, force?: boolean) => Promise<{ labels: LabelData[]; version: number }>;
  setLabels: (zaloId: string, labels: LabelData[]) => void;

  // ─── ThreadFlagStore States & Actions ───
  mutedThreads: Record<string, Record<string, number>>;
  notifSettings: NotifSettings;
  othersConversations: Record<string, Set<string>>;

  loadFlags: (zaloId: string) => Promise<void>;
  setMuted: (zaloId: string, contactId: string, until: number) => void;
  clearMuted: (zaloId: string, contactId: string) => void;
  isMuted: (zaloId: string, contactId: string) => boolean;
  getMuteUntil: (zaloId: string, contactId: string) => number | undefined;
  setNotifSettings: (settings: Partial<NotifSettings>) => void;
  addToOthers: (zaloId: string, contactId: string) => void;
  removeFromOthers: (zaloId: string, contactId: string) => void;
  isInOthers: (zaloId: string, contactId: string) => boolean;

  // ─── GroupCacheStore States & Actions ───
  groupInfoCache: Record<string, Record<string, CachedGroupInfo>>;
  setGroupInfo: (zaloId: string, groupId: string, info: CachedGroupInfo) => void;
  getGroupInfo: (zaloId: string, groupId: string) => CachedGroupInfo | undefined;
  clearGroupInfo: (zaloId: string, groupId: string) => void;

  // ─── IntegrationShortcutStore States & Actions ───
  pinnedIntegrationShortcuts: PinnedIntegrationShortcut[];
  integrationPanelTarget: { integrationId: string; action: string } | null;
  pinIntegrationShortcut: (shortcut: Omit<PinnedIntegrationShortcut, 'id'>) => void;
  unpinIntegrationShortcut: (id: string) => void;
  editPinnedShortcutIcon: (id: string, icon: string) => void;
  setIntegrationPanelTarget: (target: { integrationId: string; action: string } | null) => void;
  openIntegrationPanelTo: (integrationId: string, action: string) => void;
}

export const useAppStore = create<AppStore>((set, get) => {
  // Sync state from viewStore
  useViewStore.subscribe((state) => {
    set({
      view: state.view,
      isLoading: state.isLoading,
      theme: state.theme,
      mergedInboxMode: state.mergedInboxMode,
      mergedInboxAccounts: state.mergedInboxAccounts,
      mergedInboxFilterAccount: state.mergedInboxFilterAccount,
      mobileShowChat: state.mobileShowChat,
      analyticsInitialTab: state.analyticsInitialTab,
      crmRequestUnseenByAccount: state.crmRequestUnseenByAccount,
    });
  });

  // Sync state from modalStore
  useModalStore.subscribe((state) => {
    set({
      notification: state.notification,
      erpPermissionDialog: state.erpPermissionDialog,
      addAccountModalOpen: state.addAccountModalOpen,
      quickChatOpen: state.quickChatOpen,
      quickChatTarget: state.quickChatTarget,
      quickChatZaloId: state.quickChatZaloId,
    });
  });

  // Sync state from panelStore
  usePanelStore.subscribe((state) => {
    set({
      showConversationInfo: state.showConversationInfo,
      showGroupBoard: state.showGroupBoard,
      showIntegrationQuickPanel: state.showIntegrationQuickPanel,
      showAIQuickPanel: state.showAIQuickPanel,
      openReminderPanel: state.openReminderPanel,
      searchOpen: state.searchOpen,
      searchHighlightQuery: state.searchHighlightQuery,
      commandPaletteOpen: state.commandPaletteOpen,
    });
  });

  // Sync state from aiStore
  useAiStore.subscribe((state) => {
    set({
      aiSuggestionsEnabled: state.aiSuggestionsEnabled,
      aiSuggestions: state.aiSuggestions,
      aiSuggestionsLoading: state.aiSuggestionsLoading,
      aiAutoInjectZaloContext: state.aiAutoInjectZaloContext,
      aiQuickPanelContextCountOverride: state.aiQuickPanelContextCountOverride,
      aiSuggestDisabledThreads: state.aiSuggestDisabledThreads,
      aiSuggestDisabledAccounts: state.aiSuggestDisabledAccounts,
    });
  });

  // Sync state from labelStore
  useLabelStore.subscribe((state) => {
    set({
      labels: state.labels,
      labelsVersionMap: state.labelsVersionMap,
      labelsFetchedAt: state.labelsFetchedAt,
    });
  });

  // Sync state from threadFlagStore
  useThreadFlagStore.subscribe((state) => {
    set({
      mutedThreads: state.mutedThreads,
      notifSettings: state.notifSettings,
      othersConversations: state.othersConversations,
    });
  });

  // Sync state from groupCacheStore
  useGroupCacheStore.subscribe((state) => {
    set({
      groupInfoCache: state.groupInfoCache,
    });
  });

  // Sync state from integrationShortcutStore
  useIntegrationShortcutStore.subscribe((state) => {
    set({
      pinnedIntegrationShortcuts: state.pinnedIntegrationShortcuts,
      integrationPanelTarget: state.integrationPanelTarget,
    });
  });

  return {
    // Initial values
    view: useViewStore.getState().view,
    isLoading: useViewStore.getState().isLoading,
    theme: useViewStore.getState().theme,
    mergedInboxMode: useViewStore.getState().mergedInboxMode,
    mergedInboxAccounts: useViewStore.getState().mergedInboxAccounts,
    mergedInboxFilterAccount: useViewStore.getState().mergedInboxFilterAccount,
    mobileShowChat: useViewStore.getState().mobileShowChat,
    analyticsInitialTab: useViewStore.getState().analyticsInitialTab,
    crmRequestUnseenByAccount: useViewStore.getState().crmRequestUnseenByAccount,

    notification: useModalStore.getState().notification,
    erpPermissionDialog: useModalStore.getState().erpPermissionDialog,
    addAccountModalOpen: useModalStore.getState().addAccountModalOpen,
    quickChatOpen: useModalStore.getState().quickChatOpen,
    quickChatTarget: useModalStore.getState().quickChatTarget,
    quickChatZaloId: useModalStore.getState().quickChatZaloId,

    showConversationInfo: usePanelStore.getState().showConversationInfo,
    showGroupBoard: usePanelStore.getState().showGroupBoard,
    showIntegrationQuickPanel: usePanelStore.getState().showIntegrationQuickPanel,
    showAIQuickPanel: usePanelStore.getState().showAIQuickPanel,
    openReminderPanel: usePanelStore.getState().openReminderPanel,
    searchOpen: usePanelStore.getState().searchOpen,
    searchHighlightQuery: usePanelStore.getState().searchHighlightQuery,
    commandPaletteOpen: usePanelStore.getState().commandPaletteOpen,

    aiSuggestionsEnabled: useAiStore.getState().aiSuggestionsEnabled,
    aiSuggestions: useAiStore.getState().aiSuggestions,
    aiSuggestionsLoading: useAiStore.getState().aiSuggestionsLoading,
    aiAutoInjectZaloContext: useAiStore.getState().aiAutoInjectZaloContext,
    aiQuickPanelContextCountOverride: useAiStore.getState().aiQuickPanelContextCountOverride,
    aiSuggestDisabledThreads: useAiStore.getState().aiSuggestDisabledThreads,
    aiSuggestDisabledAccounts: useAiStore.getState().aiSuggestDisabledAccounts,

    labels: useLabelStore.getState().labels,
    labelsVersionMap: useLabelStore.getState().labelsVersionMap,
    labelsFetchedAt: useLabelStore.getState().labelsFetchedAt,

    mutedThreads: useThreadFlagStore.getState().mutedThreads,
    notifSettings: useThreadFlagStore.getState().notifSettings,
    othersConversations: useThreadFlagStore.getState().othersConversations,

    groupInfoCache: useGroupCacheStore.getState().groupInfoCache,

    pinnedIntegrationShortcuts: useIntegrationShortcutStore.getState().pinnedIntegrationShortcuts,
    integrationPanelTarget: useIntegrationShortcutStore.getState().integrationPanelTarget,

    // Proxy actions
    setView: (view) => useViewStore.getState().setView(view),
    setLoading: (loading) => useViewStore.getState().setLoading(loading),
    setTheme: (theme) => useViewStore.getState().setTheme(theme),
    enterMergedInbox: (accountIds) => useViewStore.getState().enterMergedInbox(accountIds),
    exitMergedInbox: () => useViewStore.getState().exitMergedInbox(),
    setMergedInboxFilter: (zaloId) => useViewStore.getState().setMergedInboxFilter(zaloId),
    setMobileShowChat: (show) => useViewStore.getState().setMobileShowChat(show),
    setAnalyticsInitialTab: (tab) => useViewStore.getState().setAnalyticsInitialTab(tab),
    navigateToAnalytics: (tab) => useViewStore.getState().navigateToAnalytics(tab),
    markCRMRequestUnseen: (zaloId) => useViewStore.getState().markCRMRequestUnseen(zaloId),
    clearCRMRequestUnseen: (zaloId) => useViewStore.getState().clearCRMRequestUnseen(zaloId),
    hasCRMRequestUnseen: (zaloId) => useViewStore.getState().hasCRMRequestUnseen(zaloId),
    hasAnyCRMRequestUnseen: () => useViewStore.getState().hasAnyCRMRequestUnseen(),

    showNotification: (message, type) => useModalStore.getState().showNotification(message, type),
    hideNotification: () => useModalStore.getState().hideNotification(),
    showErpPermissionDialog: (payload) => useModalStore.getState().showErpPermissionDialog(payload),
    hideErpPermissionDialog: () => useModalStore.getState().hideErpPermissionDialog(),
    setAddAccountModalOpen: (open) => useModalStore.getState().setAddAccountModalOpen(open),
    openQuickChat: (opts) => useModalStore.getState().openQuickChat(opts),
    closeQuickChat: () => useModalStore.getState().closeQuickChat(),

    toggleConversationInfo: () => usePanelStore.getState().toggleConversationInfo(),
    setShowGroupBoard: (open) => usePanelStore.getState().setShowGroupBoard(open),
    toggleIntegrationQuickPanel: () => usePanelStore.getState().toggleIntegrationQuickPanel(),
    toggleAIQuickPanel: () => usePanelStore.getState().toggleAIQuickPanel(),
    setOpenReminderPanel: (open) => usePanelStore.getState().setOpenReminderPanel(open),
    toggleSearch: () => usePanelStore.getState().toggleSearch(),
    setSearchOpen: (open) => usePanelStore.getState().setSearchOpen(open),
    setSearchHighlightQuery: (query) => usePanelStore.getState().setSearchHighlightQuery(query),
    setCommandPaletteOpen: (open) => usePanelStore.getState().setCommandPaletteOpen(open),
    toggleCommandPalette: () => usePanelStore.getState().toggleCommandPalette(),

    setAiSuggestionsEnabled: (enabled) => useAiStore.getState().setAiSuggestionsEnabled(enabled),
    setAiSuggestions: (suggestions) => useAiStore.getState().setAiSuggestions(suggestions),
    setAiSuggestionsLoading: (loading) => useAiStore.getState().setAiSuggestionsLoading(loading),
    setAiAutoInjectZaloContext: (enabled) => useAiStore.getState().setAiAutoInjectZaloContext(enabled),
    setAiQuickPanelContextCountOverride: (count) => useAiStore.getState().setAiQuickPanelContextCountOverride(count),
    toggleAiDisableForThread: (zaloId, threadId) => useAiStore.getState().toggleAiDisableForThread(zaloId, threadId),
    toggleAiDisableForAccount: (zaloId) => useAiStore.getState().toggleAiDisableForAccount(zaloId),
    isAiSuggestDisabled: (zaloId, threadId) => useAiStore.getState().isAiSuggestDisabled(zaloId, threadId),

    setLabels: (zaloId, labels) => useLabelStore.getState().setLabels(zaloId, labels),
    setLabelsVersion: (zaloId, version) => useLabelStore.getState().setLabelsVersion(zaloId, version),
    fetchLabelsWithCache: (zaloId, auth, force) => useLabelStore.getState().fetchLabelsWithCache(zaloId, auth, force),

    loadFlags: (zaloId) => useThreadFlagStore.getState().loadFlags(zaloId),
    setMuted: (zaloId, contactId, until) => useThreadFlagStore.getState().setMuted(zaloId, contactId, until),
    clearMuted: (zaloId, contactId) => useThreadFlagStore.getState().clearMuted(zaloId, contactId),
    isMuted: (zaloId, contactId) => useThreadFlagStore.getState().isMuted(zaloId, contactId),
    getMuteUntil: (zaloId, contactId) => useThreadFlagStore.getState().getMuteUntil(zaloId, contactId),
    setNotifSettings: (settings) => useThreadFlagStore.getState().setNotifSettings(settings),
    addToOthers: (zaloId, contactId) => useThreadFlagStore.getState().addToOthers(zaloId, contactId),
    removeFromOthers: (zaloId, contactId) => useThreadFlagStore.getState().removeFromOthers(zaloId, contactId),
    isInOthers: (zaloId, contactId) => useThreadFlagStore.getState().isInOthers(zaloId, contactId),

    setGroupInfo: (zaloId, groupId, info) => useGroupCacheStore.getState().setGroupInfo(zaloId, groupId, info),
    getGroupInfo: (zaloId, groupId) => useGroupCacheStore.getState().getGroupInfo(zaloId, groupId),
    clearGroupInfo: (zaloId, groupId) => useGroupCacheStore.getState().clearGroupInfo(zaloId, groupId),

    pinIntegrationShortcut: (shortcut) => useIntegrationShortcutStore.getState().pinIntegrationShortcut(shortcut),
    unpinIntegrationShortcut: (id) => useIntegrationShortcutStore.getState().unpinIntegrationShortcut(id),
    editPinnedShortcutIcon: (id, icon) => useIntegrationShortcutStore.getState().editPinnedShortcutIcon(id, icon),
    setIntegrationPanelTarget: (target) => useIntegrationShortcutStore.getState().setIntegrationPanelTarget(target),
    openIntegrationPanelTo: (integrationId, action) => {
      usePanelStore.getState().setSearchOpen(false);
      usePanelStore.getState().setShowGroupBoard(false);
      usePanelStore.getState().toggleIntegrationQuickPanel();
      useIntegrationShortcutStore.getState().setIntegrationPanelTarget({ integrationId, action });
    },
  };
});
