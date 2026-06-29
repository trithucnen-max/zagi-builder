/**
 * TunnelService - wraps cloudflared to expose local HTTP servers to the internet.
 *
 * Supports TWO modes:
 *  1. Quick Tunnel (default): trycloudflare.com — no Cloudflare account required.
 *     URL changes every restart.
 *  2. Named Tunnel (via Token): User's own Cloudflare Zero Trust account.
 *     Fixed custom domain (e.g. webhook.myzagi.com) — URL never changes.
 *
 * Supports MULTIPLE concurrent tunnels keyed by port number.
 *
 * Named Tunnel setup (once, by user):
 *  1. Go to Cloudflare Zero Trust → Access → Tunnels → Create Tunnel
 *  2. Add public hostname: <domain> → http://localhost:<port>
 *  3. Copy the Tunnel Token
 *  4. Paste Token into Zagi Settings → Tunnels → Cloudflare Token
 *
 * Usage:
 *   const url1 = await TunnelService.start(9888, 'Webhook Gateway');
 *   const url2 = await TunnelService.start(9900, 'Employee Relay');
 *   TunnelService.stop(9888);            // stop one
 *   TunnelService.stopAll();             // stop all
 */

import path from 'path';
import Logger from '../../utils/Logger';

let Tunnel: any = null;
let bin: string | null = null;
let install: ((to: string) => Promise<string>) | null = null;

try {
  const cf = require('cloudflared');
  Tunnel = cf.Tunnel;
  bin = cf.bin;
  install = cf.install;

  // Fix binary path when running inside Electron asar archive.
  // cf.bin uses __dirname which resolves inside app.asar. We must use cf.use()
  // to update the module-scope bin variable that Tunnel.quick() reads via
  // import_constants.bin - a local assignment wouldn't propagate.
  if (bin && bin.includes('app.asar') && typeof cf.use === 'function') {
    bin = bin.replace('app.asar', 'app.asar.unpacked');
    cf.use(bin);  // ← writes into constants.js module-scope
    Logger.log(`[TunnelService] Rewrote bin path for asar: ${bin}`);
  }
} catch {
  Logger.warn('[TunnelService] cloudflared package not found');
}

// ─── Multi-tunnel store ──────────────────────────────────────────────────────

interface TunnelEntry {
  tunnel: any;
  url: string | null;
  label: string;
  onChangeCbs: Set<(url: string | null) => void>;
}

const tunnels = new Map<number, TunnelEntry>();

// ─── Named Tunnel Token state ────────────────────────────────────────────────

// A Named Tunnel (Token-based) runs a single cloudflared process for ALL ports simultaneously.
// Cloudflare routes traffic to correct port based on hostname config in Zero Trust dashboard.
let namedTunnelProcess: any = null;
let namedTunnelToken: string | null = null;

/** Port → custom domain mapping, set by configureNamedTunnel() */
const customDomains = new Map<number, string>();

// ─── Service ─────────────────────────────────────────────────────────────────

export const TunnelService = {
  /**
   * Configure a Cloudflare Named Tunnel (Token-based) with fixed custom domains.
   * Call this BEFORE calling start() when user has a Cloudflare account.
   *
   * @param token - Cloudflare Tunnel Token from Zero Trust dashboard
   * @param domains - map of port → custom hostname (e.g. { 9888: 'webhook.myzagi.com', 9900: 'relay.myzagi.com' })
   */
  configureNamedTunnel(token: string | null, domains: Record<number, string>): void {
    namedTunnelToken = token || null;
    customDomains.clear();
    for (const [port, domain] of Object.entries(domains)) {
      if (domain && domain.trim()) {
        customDomains.set(Number(port), domain.trim());
      }
    }
    Logger.log(`[TunnelService] Named Tunnel configured. Token: ${token ? 'SET' : 'NONE'}, Domains: ${JSON.stringify(domains)}`);
  },

  /**
   * Start a tunnel pointing to a local port.
   * - If a Cloudflare Tunnel Token is configured, starts a Named Tunnel with a fixed URL.
   * - Otherwise falls back to Quick Tunnel (trycloudflare.com).
   * Multiple tunnels can run concurrently (keyed by port).
   * Returns the public URL.
   */
  async start(port: number, label?: string): Promise<string> {
    // If a tunnel already exists for this port, stop it first before restarting
    if (tunnels.has(port)) {
      await this.stop(port);
    }

    if (!Tunnel || !bin || !install) {
      throw new Error('Chưa cài gói cloudflared. Chạy: npm install cloudflared');
    }

    // Auto-install the cloudflared binary on first run
    const fs = require('fs');
    if (!fs.existsSync(bin)) {
      Logger.log('[TunnelService] Installing cloudflared binary (first time)...');
      await install(bin);
      Logger.log('[TunnelService] cloudflared binary installed');
    }

    // ── Named Tunnel (Token-based) mode ──────────────────────────────────────
    if (namedTunnelToken) {
      const customDomain = customDomains.get(port);
      const url = customDomain
        ? (customDomain.startsWith('https://') ? customDomain : `https://${customDomain}`)
        : null;

      Logger.log(`[TunnelService] Named Tunnel mode for port ${port}${label ? ` (${label})` : ''}. Domain: ${url || 'not configured'}`);

      // Start shared cloudflared process if not already running
      if (!namedTunnelProcess) {
        Logger.log('[TunnelService] Starting shared Named Tunnel process with Token...');
        namedTunnelProcess = Tunnel.withToken(namedTunnelToken);

        namedTunnelProcess.on('connected', (conn: any) => {
          Logger.log(`[TunnelService] Named Tunnel connected: ${JSON.stringify(conn)}`);
        });

        namedTunnelProcess.on('error', (err: Error) => {
          Logger.error(`[TunnelService] Named Tunnel process error: ${err.message}`);
          namedTunnelProcess = null;
          // Notify all active named-tunnel entries of URL loss
          for (const [p, entry] of tunnels) {
            if (entry.url && customDomains.has(p)) {
              tunnels.delete(p);
              TunnelService._notifyChange(p, null);
            }
          }
        });

        namedTunnelProcess.on('exit', (code: number | null) => {
          Logger.log(`[TunnelService] Named Tunnel process exited (code ${code})`);
          namedTunnelProcess = null;
        });
      }

      // Register this port in the tunnels map with its fixed URL
      const finalUrl = url || `https://${port}.unknown-domain.invalid`;
      const entry: TunnelEntry = {
        tunnel: namedTunnelProcess,
        url: finalUrl,
        label: label || `Port ${port}`,
        onChangeCbs: new Set(),
      };
      tunnels.set(port, entry);
      Logger.log(`[TunnelService] ✅ Named Tunnel registered [${port}]: ${finalUrl}${label ? ` (${label})` : ''}`);
      TunnelService._notifyChange(port, finalUrl);
      return finalUrl;
    }

    // ── Quick Tunnel mode (no account) ───────────────────────────────────────
    Logger.log(`[TunnelService] Starting Cloudflare Quick Tunnel on port ${port}${label ? ` (${label})` : ''}...`);

    return new Promise((resolve, reject) => {
      const tunnel = Tunnel.quick(`http://localhost:${port}`);
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { tunnel.stop(); } catch {}
          reject(new Error(`Cloudflare tunnel timeout (port ${port}) - kiểm tra kết nối mạng`));
        }
      }, 30_000);

      tunnel.on('url', (url: string) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);

          const entry: TunnelEntry = {
            tunnel,
            url,
            label: label || `Port ${port}`,
            onChangeCbs: new Set(),
          };
          tunnels.set(port, entry);

          Logger.log(`[TunnelService] ✅ Quick Tunnel active [${port}]: ${url}${label ? ` (${label})` : ''}`);
          TunnelService._notifyChange(port, url);
          resolve(url);
        }
      });

      tunnel.on('error', (err: Error) => {
        Logger.error(`[TunnelService] Tunnel error [${port}]: ${err.message}`);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(err);
        } else {
          const entry = tunnels.get(port);
          if (entry && entry.tunnel === tunnel) {
            tunnels.delete(port);
            TunnelService._notifyChange(port, null);
          }
        }
      });

      tunnel.on('exit', (code: number | null) => {
        const entry = tunnels.get(port);
        if (entry && entry.tunnel === tunnel) {
          Logger.log(`[TunnelService] Tunnel exited (code ${code}) [${port}]`);
          tunnels.delete(port);
          TunnelService._notifyChange(port, null);
        }
      });
    });
  },

  /**
   * Stop a specific tunnel by port.
   * For Named Tunnels, removes the port registration but does NOT stop the shared process
   * (other ports may still be using it). Call stopAll() to terminate everything.
   */
  async stop(port: number): Promise<void> {
    const entry = tunnels.get(port);
    if (entry) {
      // Only actually kill the process for Quick Tunnels (each has its own process)
      // Named Tunnel processes are shared — only kill when all ports stop
      const isNamedTunnel = namedTunnelToken && customDomains.has(port);
      if (!isNamedTunnel) {
        try { entry.tunnel.stop(); } catch { /* ignore */ }
      }
      tunnels.delete(port);
      TunnelService._notifyChange(port, null);
      Logger.log(`[TunnelService] Stopped tunnel [${port}]${entry.label ? ` (${entry.label})` : ''}`);

      // Kill the shared Named Tunnel process if no ports are using it anymore
      if (namedTunnelToken && namedTunnelProcess) {
        const remainingNamedPorts = [...tunnels.keys()].filter(p => customDomains.has(p));
        if (remainingNamedPorts.length === 0) {
          Logger.log('[TunnelService] No more Named Tunnel ports active — stopping shared process');
          try { namedTunnelProcess.stop(); } catch {}
          namedTunnelProcess = null;
        }
      }
    }
  },

  /**
   * Stop all active tunnels and terminate cloudflared processes.
   */
  async stopAll(): Promise<void> {
    const ports = Array.from(tunnels.keys());
    for (const port of ports) {
      await this.stop(port);
    }
    // Ensure shared Named Tunnel process is killed
    if (namedTunnelProcess) {
      try { namedTunnelProcess.stop(); } catch {}
      namedTunnelProcess = null;
    }
    Logger.log(`[TunnelService] All tunnels stopped (${ports.length} total)`);
  },

  /**
   * Get the public URL for a specific tunnel (null if not active).
   */
  getUrl(port: number): string | null {
    return tunnels.get(port)?.url ?? null;
  },

  /**
   * Check if a specific tunnel is currently active.
   */
  isActive(port: number): boolean {
    return tunnels.has(port) && !!tunnels.get(port)?.url;
  },

  /**
   * Get all active tunnels with their URLs and labels.
   * Returns a record keyed by port number.
   */
  getAllTunnels(): Record<number, { url: string; label: string }> {
    const result: Record<number, { url: string; label: string }> = {};
    for (const [port, entry] of tunnels) {
      if (entry.url) {
        result[port] = { url: entry.url, label: entry.label };
      }
    }
    return result;
  },

  /**
   * Register a callback for URL changes of a specific tunnel.
   * Called with the new URL (or null if tunnel went down).
   */
  onChange(port: number, cb: (url: string | null) => void): void {
    let entry = tunnels.get(port);
    if (!entry) {
      // Create a placeholder entry so we don't lose the callback
      // when the tunnel hasn't started yet. It will be replaced on start().
      entry = { tunnel: null as any, url: null, label: `Port ${port}`, onChangeCbs: new Set() };
      tunnels.set(port, entry);
    }
    entry.onChangeCbs.add(cb);
  },

  _notifyChange(port: number, url: string | null): void {
    const entry = tunnels.get(port);
    if (!entry) return;
    for (const cb of entry.onChangeCbs) {
      try { cb(url); } catch { /* ignore */ }
    }
  },
};

export default TunnelService;
