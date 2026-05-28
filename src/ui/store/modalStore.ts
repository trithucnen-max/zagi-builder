import { create } from 'zustand';

export interface QuickChatTarget {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  threadType: number; // 0=user, 1=group
  phone?: string;
}

export interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface ModalStore {
  notifications: ToastNotification[];
  // For backwards compatibility:
  notification: { message: string; type: 'success' | 'error' | 'info' | 'warning' } | null;
  erpPermissionDialog: { title: string; message: string; details?: string } | null;
  addAccountModalOpen: boolean;
  quickChatOpen: boolean;
  quickChatTarget: QuickChatTarget | null;
  quickChatZaloId: string | null;

  showNotification: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  hideNotification: (id?: string) => void;
  showErpPermissionDialog: (payload?: { title?: string; message?: string; details?: string }) => void;
  hideErpPermissionDialog: () => void;
  setAddAccountModalOpen: (open: boolean) => void;
  openQuickChat: (opts?: { target?: QuickChatTarget; zaloId?: string }) => void;
  closeQuickChat: () => void;
}

export const useModalStore = create<ModalStore>((set, get) => ({
  notifications: [],
  notification: null,
  erpPermissionDialog: null,
  addAccountModalOpen: false,
  quickChatOpen: false,
  quickChatTarget: null,
  quickChatZaloId: null,

  showNotification: (message, type = 'info') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    set((s) => {
      const nextNotifs = [...s.notifications, { id, message, type }];
      return {
        notifications: nextNotifs,
        notification: { message, type },
      };
    });
    setTimeout(() => {
      get().hideNotification(id);
    }, 4000);
  },
  hideNotification: (id) => {
    set((s) => {
      if (!id) {
        return { notifications: [], notification: null };
      }
      const nextNotifs = s.notifications.filter(n => n.id !== id);
      const lastNotif = nextNotifs.length > 0 ? nextNotifs[nextNotifs.length - 1] : null;
      return {
        notifications: nextNotifs,
        notification: lastNotif ? { message: lastNotif.message, type: lastNotif.type } : null,
      };
    });
  },
  showErpPermissionDialog: (payload) => set({
    erpPermissionDialog: {
      title: payload?.title || 'Không có quyền thực hiện',
      message: payload?.message || 'Tài khoản hiện tại không có quyền thực hiện thao tác ERP này. Vui lòng liên hệ quản trị viên để được cấp quyền phù hợp.',
      details: payload?.details,
    },
  }),
  hideErpPermissionDialog: () => set({ erpPermissionDialog: null }),
  setAddAccountModalOpen: (addAccountModalOpen) => set({ addAccountModalOpen }),
  openQuickChat: (opts) => set({
    quickChatOpen: true,
    quickChatTarget: opts?.target ?? null,
    quickChatZaloId: opts?.zaloId ?? null,
  }),
  closeQuickChat: () => set({ quickChatOpen: false, quickChatTarget: null, quickChatZaloId: null }),
}));
