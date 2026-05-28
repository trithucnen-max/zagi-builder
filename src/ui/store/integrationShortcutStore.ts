import { create } from 'zustand';

export interface PinnedIntegrationShortcut {
  id: string;
  integrationId: string;
  integrationType: string;
  integrationName: string;
  action: string;
  actionLabel: string;
  icon: string; // emoji
}

function loadPinnedShortcuts(): PinnedIntegrationShortcut[] {
  try {
    const s = localStorage.getItem('integration_pinned_shortcuts');
    if (s) return JSON.parse(s);
  } catch {}
  return [];
}

function savePinnedShortcuts(shortcuts: PinnedIntegrationShortcut[]) {
  try {
    localStorage.setItem('integration_pinned_shortcuts', JSON.stringify(shortcuts));
  } catch {}
}

export interface IntegrationShortcutStore {
  pinnedIntegrationShortcuts: PinnedIntegrationShortcut[];
  integrationPanelTarget: { integrationId: string; action: string } | null;

  pinIntegrationShortcut: (shortcut: Omit<PinnedIntegrationShortcut, 'id'>) => void;
  unpinIntegrationShortcut: (id: string) => void;
  editPinnedShortcutIcon: (id: string, icon: string) => void;
  setIntegrationPanelTarget: (target: { integrationId: string; action: string } | null) => void;
}

export const useIntegrationShortcutStore = create<IntegrationShortcutStore>((set, get) => ({
  pinnedIntegrationShortcuts: loadPinnedShortcuts(),
  integrationPanelTarget: null,

  pinIntegrationShortcut: (shortcut) => set((s) => {
    const existing = s.pinnedIntegrationShortcuts.find(
      p => p.integrationId === shortcut.integrationId && p.action === shortcut.action
    );
    if (existing) return {};
    const newShortcut: PinnedIntegrationShortcut = {
      ...shortcut,
      id: `pin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };
    const updated = [...s.pinnedIntegrationShortcuts, newShortcut];
    savePinnedShortcuts(updated);
    return { pinnedIntegrationShortcuts: updated };
  }),

  unpinIntegrationShortcut: (id) => set((s) => {
    const updated = s.pinnedIntegrationShortcuts.filter(p => p.id !== id);
    savePinnedShortcuts(updated);
    return { pinnedIntegrationShortcuts: updated };
  }),

  editPinnedShortcutIcon: (id, icon) => set((s) => {
    const updated = s.pinnedIntegrationShortcuts.map(p => p.id === id ? { ...p, icon } : p);
    savePinnedShortcuts(updated);
    return { pinnedIntegrationShortcuts: updated };
  }),

  setIntegrationPanelTarget: (target) => set({ integrationPanelTarget: target }),
}));
