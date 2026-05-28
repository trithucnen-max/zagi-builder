import { create } from 'zustand';

export interface LabelData {
  id: number;
  text: string;
  color: string;
  emoji: string;
  conversations: string[];
  version?: number;
}

export interface LabelStore {
  labels: Record<string, LabelData[]>;
  labelsVersionMap: Record<string, number>;
  labelsFetchedAt: Record<string, number>;
  setLabelsVersion: (zaloId: string, version: number) => void;
  fetchLabelsWithCache: (zaloId: string, auth: any, force?: boolean) => Promise<{ labels: LabelData[]; version: number }>;
  setLabels: (zaloId: string, labels: LabelData[]) => void;
}

export const useLabelStore = create<LabelStore>((set, get) => ({
  labels: {},
  labelsVersionMap: {},
  labelsFetchedAt: {},

  setLabels: (zaloId, ls) => set((s) => ({ labels: { ...s.labels, [zaloId]: ls } })),
  setLabelsVersion: (zaloId, version) => set((s) => ({ labelsVersionMap: { ...s.labelsVersionMap, [zaloId]: version } })),

  fetchLabelsWithCache: async (zaloId, auth, force) => {
    const CACHE_TTL = 12 * 60 * 60 * 1000;
    const ERROR_CACHE_TTL = 5 * 60 * 1000;
    
    const state = get();
    const lastFetched = state.labelsFetchedAt[zaloId] || 0;
    const cached = state.labels[zaloId];
    const cachedVersion = state.labelsVersionMap[zaloId] || 0;

    if (!force && cached && (Date.now() - lastFetched) < CACHE_TTL) {
      return { labels: cached, version: cachedVersion };
    }

    if (!force && (Date.now() - lastFetched) < ERROR_CACHE_TTL) {
      return { labels: cached || [], version: cachedVersion };
    }

    try {
      const ipc = (window as any).electronAPI;
      const res = await ipc?.zalo?.getLabels({ auth });

      if (res?.success === false) {
        set((s) => ({
          labelsFetchedAt: { ...s.labelsFetchedAt, [zaloId]: Date.now() },
        }));
        return { labels: cached || [], version: cachedVersion };
      }
      
      if (res?.response?.labelData) {
        const labels = res.response.labelData;
        const version = res.response.version || 0;
        set((s) => ({
          labels: { ...s.labels, [zaloId]: labels },
          labelsVersionMap: { ...s.labelsVersionMap, [zaloId]: version },
          labelsFetchedAt: { ...s.labelsFetchedAt, [zaloId]: Date.now() },
        }));
        return { labels, version };
      }
      
      set((s) => ({
        labels: { ...s.labels, [zaloId]: [] },
        labelsFetchedAt: { ...s.labelsFetchedAt, [zaloId]: Date.now() },
      }));
      return { labels: [], version: cachedVersion };
      
    } catch (err) {
      set((s) => ({
        labelsFetchedAt: { ...s.labelsFetchedAt, [zaloId]: Date.now() },
      }));
      return { labels: cached || [], version: cachedVersion };
    }
  },
}));
