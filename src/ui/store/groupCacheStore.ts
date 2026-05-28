import { create } from 'zustand';

export interface GroupMember {
  userId: string;
  displayName: string;
  avatar: string;
  role: number; // 0=member, 1=owner, 2=deputy
}

export interface CachedGroupInfo {
  groupId: string;
  name: string;
  avatar: string;
  memberCount: number;
  members: GroupMember[];
  creatorId?: string;
  adminIds?: string[];
  settings?: Record<string, any>;
  fetchedAt: number;
}

export interface GroupCacheStore {
  groupInfoCache: Record<string, Record<string, CachedGroupInfo>>;
  setGroupInfo: (zaloId: string, groupId: string, info: CachedGroupInfo) => void;
  getGroupInfo: (zaloId: string, groupId: string) => CachedGroupInfo | undefined;
  clearGroupInfo: (zaloId: string, groupId: string) => void;
}

export const useGroupCacheStore = create<GroupCacheStore>((set, get) => ({
  groupInfoCache: {},

  setGroupInfo: (zaloId, groupId, info) => set((s) => ({
    groupInfoCache: {
      ...s.groupInfoCache,
      [zaloId]: { ...(s.groupInfoCache[zaloId] || {}), [groupId]: info },
    },
  })),

  getGroupInfo: (zaloId, groupId) => {
    return (get().groupInfoCache[zaloId] || {})[groupId];
  },

  clearGroupInfo: (zaloId, groupId) => set((s) => {
    const accountCache = { ...(s.groupInfoCache[zaloId] || {}) };
    delete accountCache[groupId];
    return { groupInfoCache: { ...s.groupInfoCache, [zaloId]: accountCache } };
  }),
}));
