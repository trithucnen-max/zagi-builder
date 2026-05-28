import { useCallback, useEffect, useRef } from 'react';
import { useAccountStore } from '../store/accountStore';
import { useAppStore } from '../store/appStore';
import ipc from '../lib/ipc';
import Logger from '../../utils/Logger';

const HEALTH_CHECK_INTERVAL_MS = 60 * 1000;
const NETWORK_RECONNECT_COOLDOWN_MS = 15 * 1000;

/**
 * Manages WebSocket health-checks and auto-reconnect for Zalo accounts.
 * Extracted from App.tsx to keep the root component lean.
 */
export function useConnectionHealth() {
  const { updateListenerActive } = useAccountStore();
  const healthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectInFlightRef = useRef<Set<string>>(new Set());
  const reconnectCooldownRef = useRef<Map<string, number>>(new Map());

  const reconnectAccountNow = useCallback(async (
    acc: { zalo_id: string; cookies: string; imei: string; user_agent: string },
    reason: 'healthcheck' | 'network-online'
  ): Promise<boolean> => {
    const now = Date.now();
    const lastAttemptAt = reconnectCooldownRef.current.get(acc.zalo_id) ?? 0;

    if (reconnectInFlightRef.current.has(acc.zalo_id)) return false;
    if (now - lastAttemptAt < NETWORK_RECONNECT_COOLDOWN_MS) return false;

    reconnectInFlightRef.current.add(acc.zalo_id);
    reconnectCooldownRef.current.set(acc.zalo_id, now);

    try {
      const auth = { cookies: acc.cookies, imei: acc.imei, userAgent: acc.user_agent };
      const res = await ipc.login?.connectAccount(auth);
      if (!res?.success) {
        updateListenerActive(acc.zalo_id, false);
        Logger.warn(`[Reconnect:${reason}] ${acc.zalo_id} failed:`, res?.error ?? 'unknown_error');
        return false;
      }
      return true;
    } catch (err) {
      updateListenerActive(acc.zalo_id, false);
      Logger.warn(`[Reconnect:${reason}] ${acc.zalo_id} error:`, err);
      return false;
    } finally {
      reconnectInFlightRef.current.delete(acc.zalo_id);
    }
  }, [updateListenerActive]);

  const checkListenerHealth = useCallback(async (zaloIds: string[]) => {
    if (!zaloIds.length) return [] as Array<{ zaloId: string; healthy: boolean; readyState: number | null; reason?: string }>;
    try {
      const res = await ipc.login?.checkHealth(zaloIds);
      if (!res?.success || !Array.isArray(res.results)) return [];
      return res.results;
    } catch (err) {
      Logger.warn('[HealthCheck] error:', err);
      return [];
    }
  }, []);

  const reconnectAfterNetworkRestore = useCallback(async () => {
    const currentAccounts = useAccountStore.getState().accounts.filter(a => (a.channel || 'zalo') === 'zalo');
    if (!currentAccounts.length) return;

    const connectedIds = currentAccounts.filter(a => a.isConnected).map(a => a.zalo_id);
    const healthResults = await checkListenerHealth(connectedIds);
    const unhealthyIds = new Set<string>();

    for (const result of healthResults) {
      if (!result.healthy) {
        unhealthyIds.add(result.zaloId);
        updateListenerActive(result.zaloId, false);
      } else {
        updateListenerActive(result.zaloId, true);
      }
    }

    const candidates = currentAccounts.filter(acc =>
      unhealthyIds.has(acc.zalo_id) || acc.listenerActive === false || !acc.isConnected
    );

    if (!candidates.length) return;

    useAppStore.getState().showNotification(
      `🌐 Mạng đã khôi phục — đang kết nối lại ${candidates.length} tài khoản`,
      'info',
    );

    await Promise.allSettled(candidates.map(acc => reconnectAccountNow(acc, 'network-online')));
  }, [checkListenerHealth, reconnectAccountNow, updateListenerActive]);

  // Periodic health-check: runs 10s after mount, then every 1 minute
  useEffect(() => {
    const runHealthCheck = async () => {
      const currentAccounts = useAccountStore.getState().accounts;
      if (!currentAccounts.length) return;

      const connectedIds = currentAccounts
        .filter(a => a.isConnected && (a.channel || 'zalo') === 'zalo')
        .map(a => a.zalo_id);

      if (!connectedIds.length) return;

      const results = await checkListenerHealth(connectedIds);
      for (const r of results) {
        if (!r.healthy) {
          Logger.warn(`[HealthCheck] ${r.zaloId} unhealthy: readyState=${r.readyState} reason=${r.reason}`);
          updateListenerActive(r.zaloId, false);
          const acc = currentAccounts.find(a => a.zalo_id === r.zaloId);
          if (acc) void reconnectAccountNow(acc, 'healthcheck');
        } else {
          updateListenerActive(r.zaloId, true);
        }
      }
    };

    const initialTimer = setTimeout(() => {
      runHealthCheck();
      healthTimerRef.current = setInterval(runHealthCheck, HEALTH_CHECK_INTERVAL_MS);
    }, 10_000);

    return () => {
      clearTimeout(initialTimer);
      if (healthTimerRef.current) clearInterval(healthTimerRef.current);
    };
  }, [checkListenerHealth, reconnectAccountNow, updateListenerActive]);

  // Network online/offline listeners
  useEffect(() => {
    const handleOffline = () => {
      useAppStore.getState().showNotification(
        '🌐 Mất kết nối internet — ứng dụng sẽ thử kết nối lại khi mạng trở lại',
        'warning',
      );
    };
    const handleOnline = () => {
      reconnectAfterNetworkRestore().catch(err => {
        Logger.warn('[NetworkReconnect] error:', err);
      });
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [reconnectAfterNetworkRestore]);
}
