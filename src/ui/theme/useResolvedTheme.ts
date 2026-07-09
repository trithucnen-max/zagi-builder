import { useAppStore } from '@/store/appStore';

export function useResolvedTheme() {
  return useAppStore((state) => state.resolvedTheme) || 'light';
}
