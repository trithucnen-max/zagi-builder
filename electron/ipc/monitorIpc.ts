import { ipcMain } from 'electron';
import AppMonitorService from '../../src/services/monitor/AppMonitorService';
import Logger from '../../src/utils/Logger';

/**
 * Monitor IPC — exposes AppMonitorService to the renderer.
 * Allows the app to display real-time performance and crash stats.
 */
export function registerMonitorIpc(): void {
  const monitor = AppMonitorService.getInstance();

  // Performance summary (P50/P95/P99 latency, error rate, slowest channels)
  ipcMain.handle('monitor:getPerformance', () => {
    try {
      return monitor.getPerformanceSummary();
    } catch (e: any) {
      return { p50: 0, p95: 0, p99: 0, totalCalls: 0, slowest: [], errorRate: 0 };
    }
  });

  // Recent crash reports
  ipcMain.handle('monitor:getCrashes', (_e, days = 7) => {
    try {
      return monitor.getRecentCrashes(days);
    } catch (e: any) {
      return [];
    }
  });

  // Top used features / IPC channels
  ipcMain.handle('monitor:getTopUsage', (_e, n = 10) => {
    try {
      return monitor.getTopUsage(n);
    } catch (e: any) {
      return [];
    }
  });

  // System info snapshot
  ipcMain.handle('monitor:getSystemInfo', () => {
    try {
      return monitor.getSystemInfo();
    } catch (e: any) {
      return {};
    }
  });

  // Allow renderer to manually report an error
  ipcMain.handle('monitor:reportError', (_e, message: string, context?: string) => {
    try {
      monitor.reportCrash(new Error(message), context);
      return { success: true };
    } catch (e: any) {
      return { success: false };
    }
  });

  Logger.log('[monitorIpc] Monitor IPC handlers registered.');
}
