import { create } from 'zustand';

export interface NotifSettings {
  soundEnabled: boolean;
  desktopEnabled: boolean;
  volume: number; // 0–1
}

const loadNotifSettings = (): NotifSettings => {
  try {
    const stored = JSON.parse(localStorage.getItem('app_notifSettings') || '{}');
    return { soundEnabled: true, desktopEnabled: true, volume: 0.6, ...stored };
  } catch {
    return { soundEnabled: true, desktopEnabled: true, volume: 0.6 };
  }
};

function persistFlag(zaloId: string, contactId: string, flags: { is_muted?: number; mute_until?: number; is_in_others?: number }) {
  try {
    const ipc = (window as any).electronAPI?.db;
    if (ipc?.setContactFlags) {
      ipc.setContactFlags({ zaloId, contactId, flags }).catch(() => {});
    }
  } catch {}
}

export interface ThreadFlagStore {
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
}

export const useThreadFlagStore = create<ThreadFlagStore>((set, get) => ({
  mutedThreads: {},
  notifSettings: loadNotifSettings(),
  othersConversations: {},

  loadFlags: async (zaloId) => {
    try {
      const ipcDb = (window as any).electronAPI?.db;
      if (!ipcDb?.getContactsWithFlags) return;
      const res = await ipcDb.getContactsWithFlags({ zaloId });
      if (!res?.success) return;

      const newMuted: Record<string, number> = {};
      const othersSet = new Set<string>();

      for (const row of (res.rows || [])) {
        if (row.is_muted === 1) {
          newMuted[row.contact_id] = 0;
        } else if (row.mute_until > 0 && row.mute_until > Date.now()) {
          newMuted[row.contact_id] = row.mute_until;
        }
        if (row.is_in_others === 1) {
          othersSet.add(row.contact_id);
        }
      }

      set((s) => ({
        mutedThreads: { ...s.mutedThreads, [zaloId]: newMuted },
        othersConversations: { ...s.othersConversations, [zaloId]: othersSet },
      }));
    } catch {}
  },

  setMuted: (zaloId, contactId, until) => {
    set((s) => ({
      mutedThreads: { ...s.mutedThreads, [zaloId]: { ...(s.mutedThreads[zaloId] || {}), [contactId]: until } },
    }));
    if (until === 0) {
      persistFlag(zaloId, contactId, { is_muted: 1, mute_until: 0 });
    } else {
      persistFlag(zaloId, contactId, { is_muted: 0, mute_until: until });
    }
  },

  clearMuted: (zaloId, contactId) => {
    set((s) => {
      const prev = { ...(s.mutedThreads[zaloId] || {}) };
      delete prev[contactId];
      return { mutedThreads: { ...s.mutedThreads, [zaloId]: prev } };
    });
    persistFlag(zaloId, contactId, { is_muted: 0, mute_until: 0 });
  },

  isMuted: (zaloId, contactId) => {
    const until = (get().mutedThreads[zaloId] || {})[contactId];
    if (until === undefined) return false;
    if (until === 0) return true;
    return Date.now() < until;
  },

  getMuteUntil: (zaloId, contactId) => (get().mutedThreads[zaloId] || {})[contactId],

  setNotifSettings: (settings) => set((s) => {
    const updated = { ...s.notifSettings, ...settings };
    try {
      localStorage.setItem('app_notifSettings', JSON.stringify(updated));
    } catch {}
    return { notifSettings: updated };
  }),

  addToOthers: (zaloId, contactId) => {
    set((s) => {
      const prev = new Set(s.othersConversations[zaloId] || []);
      prev.add(contactId);
      return { othersConversations: { ...s.othersConversations, [zaloId]: prev } };
    });
    persistFlag(zaloId, contactId, { is_in_others: 1 });
  },

  removeFromOthers: (zaloId, contactId) => {
    set((s) => {
      const prev = new Set(s.othersConversations[zaloId] || []);
      prev.delete(contactId);
      return { othersConversations: { ...s.othersConversations, [zaloId]: prev } };
    });
    persistFlag(zaloId, contactId, { is_in_others: 0 });
  },

  isInOthers: (zaloId, contactId) => {
    return (get().othersConversations[zaloId] || new Set()).has(contactId);
  },
}));
