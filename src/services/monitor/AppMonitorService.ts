import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Logger from '../../utils/Logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IPCMetric {
  channel: string;
  durationMs: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

export interface CrashReport {
  timestamp: number;
  error: string;
  stack?: string;
  context?: string;
  appVersion: string;
  platform: string;
  arch: string;
  nodeVersion: string;
}

export interface PerformanceSummary {
  /** P50 IPC latency (ms) */
  p50: number;
  /** P95 IPC latency (ms) */
  p95: number;
  /** P99 IPC latency (ms) */
  p99: number;
  /** Total IPC calls tracked */
  totalCalls: number;
  /** Slowest channels (top 5) */
  slowest: { channel: string; avgMs: number }[];
  /** Error rate 0–1 */
  errorRate: number;
}

// ─── AppMonitorService ────────────────────────────────────────────────────────

/**
 * AppMonitorService — Lightweight in-process performance monitoring.
 *
 * Tracks:
 * - IPC call latency (P50/P95/P99)
 * - Error rate per IPC channel
 * - Crash reports (written to userData/crash-reports/)
 * - Feature usage counters
 *
 * No external network calls — everything stays local.
 * Logs are rotated daily, kept for 7 days.
 */
export class AppMonitorService {
  private static instance: AppMonitorService | null = null;

  // Ring buffer — keep last 2000 IPC metrics (≈ few MB max)
  private readonly MAX_METRICS = 2000;
  private metrics: IPCMetric[] = [];

  // Feature usage counters (channel → count)
  private usage = new Map<string, number>();

  // Crash report dir
  private crashDir = '';

  static getInstance(): AppMonitorService {
    if (!AppMonitorService.instance) AppMonitorService.instance = new AppMonitorService();
    return AppMonitorService.instance;
  }

  // ── Initialization ────────────────────────────────────────────────────────

  initialize(): void {
    try {
      this.crashDir = path.join(app.getPath('userData'), 'crash-reports');
      if (!fs.existsSync(this.crashDir)) fs.mkdirSync(this.crashDir, { recursive: true });
      this._rotateCrashLogs();
      Logger.log('[AppMonitor] Initialized. Crash reports dir: ' + this.crashDir);
    } catch (e: any) {
      Logger.warn(`[AppMonitor] Init warning: ${e.message}`);
    }
  }

  // ── IPC Latency Tracking ──────────────────────────────────────────────────

  /**
   * Start timing an IPC call. Returns a function to call when the IPC finishes.
   * Usage:
   *   const done = monitor.startIPC('db:getMessages');
   *   const result = await handler();
   *   done(true);
   */
  startIPC(channel: string): (success: boolean, error?: string) => void {
    const start = Date.now();
    return (success: boolean, error?: string) => {
      const durationMs = Date.now() - start;
      this._record({ channel, durationMs, timestamp: start, success, error });
      this._incrementUsage(channel);
      if (durationMs > 500) {
        Logger.warn(`[AppMonitor] Slow IPC: ${channel} took ${durationMs}ms`);
      }
    };
  }

  // ── Error / Crash Reporting ───────────────────────────────────────────────

  /** Record an unhandled error to the crash report log */
  reportCrash(error: Error | string, context?: string): void {
    const report: CrashReport = {
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    };

    try {
      const filename = `crash-${new Date().toISOString().slice(0, 10)}.jsonl`;
      const filePath = path.join(this.crashDir, filename);
      fs.appendFileSync(filePath, JSON.stringify(report) + '\n', 'utf-8');
      Logger.error(`[AppMonitor] Crash recorded: ${report.error}`);
    } catch (e: any) {
      Logger.error(`[AppMonitor] Failed to write crash report: ${e.message}`);
    }
  }

  // ── Usage Analytics ───────────────────────────────────────────────────────

  /** Increment usage counter for a named feature */
  trackFeature(name: string): void {
    this._incrementUsage(name);
  }

  /** Get top N most-used features/channels */
  getTopUsage(n = 10): { name: string; count: number }[] {
    return [...this.usage.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name, count]) => ({ name, count }));
  }

  // ── Performance Summary ───────────────────────────────────────────────────

  getPerformanceSummary(): PerformanceSummary {
    if (this.metrics.length === 0) {
      return { p50: 0, p95: 0, p99: 0, totalCalls: 0, slowest: [], errorRate: 0 };
    }

    const durations = [...this.metrics].map(m => m.durationMs).sort((a, b) => a - b);
    const len = durations.length;
    const p50 = durations[Math.floor(len * 0.5)] ?? 0;
    const p95 = durations[Math.floor(len * 0.95)] ?? 0;
    const p99 = durations[Math.floor(len * 0.99)] ?? 0;

    const errorCount = this.metrics.filter(m => !m.success).length;
    const errorRate = errorCount / len;

    // Per-channel average
    const channelMap = new Map<string, number[]>();
    for (const m of this.metrics) {
      if (!channelMap.has(m.channel)) channelMap.set(m.channel, []);
      channelMap.get(m.channel)!.push(m.durationMs);
    }
    const slowest = [...channelMap.entries()]
      .map(([channel, times]) => ({
        channel,
        avgMs: times.reduce((a, b) => a + b, 0) / times.length,
      }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 5);

    return { p50, p95, p99, totalCalls: len, slowest, errorRate };
  }

  /** Returns recent crash reports (last N days) */
  getRecentCrashes(days = 7): CrashReport[] {
    const crashes: CrashReport[] = [];
    if (!this.crashDir || !fs.existsSync(this.crashDir)) return crashes;

    const since = Date.now() - days * 86_400_000;
    try {
      for (const file of fs.readdirSync(this.crashDir)) {
        if (!file.endsWith('.jsonl')) continue;
        const lines = fs.readFileSync(path.join(this.crashDir, file), 'utf-8').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const r = JSON.parse(line) as CrashReport;
            if (r.timestamp >= since) crashes.push(r);
          } catch {}
        }
      }
    } catch (e: any) {
      Logger.warn(`[AppMonitor] Failed to read crash logs: ${e.message}`);
    }
    return crashes.sort((a, b) => b.timestamp - a.timestamp);
  }

  // ── System info snapshot ──────────────────────────────────────────────────

  getSystemInfo(): Record<string, any> {
    return {
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
      freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
      cpuCores: os.cpus().length,
      uptime: Math.round(process.uptime()),
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _record(metric: IPCMetric): void {
    if (this.metrics.length >= this.MAX_METRICS) {
      this.metrics.shift(); // ring buffer: drop oldest
    }
    this.metrics.push(metric);
  }

  private _incrementUsage(name: string): void {
    this.usage.set(name, (this.usage.get(name) ?? 0) + 1);
  }

  private _rotateCrashLogs(): void {
    // Delete crash logs older than 7 days
    try {
      const cutoff = Date.now() - 7 * 86_400_000;
      for (const file of fs.readdirSync(this.crashDir)) {
        const filePath = path.join(this.crashDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          Logger.log(`[AppMonitor] Rotated old crash log: ${file}`);
        }
      }
    } catch {}
  }
}

export default AppMonitorService;
