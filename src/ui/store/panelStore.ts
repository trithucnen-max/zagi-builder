import { create } from 'zustand';

interface PanelStore {
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
}

export const usePanelStore = create<PanelStore>((set) => ({
  showConversationInfo: false,
  showGroupBoard: false,
  showIntegrationQuickPanel: false,
  showAIQuickPanel: false,
  openReminderPanel: false,
  searchOpen: false,
  searchHighlightQuery: '',
  commandPaletteOpen: false,

  toggleConversationInfo: () => set((s) => ({
    showConversationInfo: !s.showConversationInfo,
    showGroupBoard: !s.showConversationInfo ? false : s.showGroupBoard,
    showIntegrationQuickPanel: !s.showConversationInfo ? false : s.showIntegrationQuickPanel,
    showAIQuickPanel: !s.showConversationInfo ? false : s.showAIQuickPanel,
  })),
  setShowGroupBoard: (open) => set((s) => ({
    showGroupBoard: open,
    showConversationInfo: open ? false : s.showConversationInfo,
    showIntegrationQuickPanel: open ? false : s.showIntegrationQuickPanel,
    showAIQuickPanel: open ? false : s.showAIQuickPanel,
  })),
  toggleIntegrationQuickPanel: () => set((s) => ({
    showIntegrationQuickPanel: !s.showIntegrationQuickPanel,
    showConversationInfo: !s.showIntegrationQuickPanel ? false : s.showConversationInfo,
    showGroupBoard: !s.showIntegrationQuickPanel ? false : s.showGroupBoard,
    showAIQuickPanel: !s.showIntegrationQuickPanel ? false : s.showAIQuickPanel,
  })),
  toggleAIQuickPanel: () => set((s) => ({
    showAIQuickPanel: !s.showAIQuickPanel,
    showConversationInfo: !s.showAIQuickPanel ? false : s.showConversationInfo,
    showGroupBoard: !s.showAIQuickPanel ? false : s.showGroupBoard,
    showIntegrationQuickPanel: !s.showAIQuickPanel ? false : s.showIntegrationQuickPanel,
  })),
  setOpenReminderPanel: (open) => set({ openReminderPanel: open }),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  setSearchOpen: (open) => set((s) => ({ searchOpen: open, searchHighlightQuery: open ? s.searchHighlightQuery : '' })),
  setSearchHighlightQuery: (query) => set({ searchHighlightQuery: query }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
}));
