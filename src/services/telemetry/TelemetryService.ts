import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Logger from '../../utils/Logger';
import pkg from '../../../package.json';

export interface DeviceTelemetryInfo {
  machine_id: string;
  os_platform: string; // 'darwin' | 'win32' | 'linux'
  os_name: string;     // e.g. 'macOS Sonoma (arm64)' | 'Windows 11 (x64)'
  os_arch: string;     // 'arm64' | 'x64'
  os_release: string;
  hostname: string;
  app_version: string;
  account_ids: string[];
  account_names: string[];
  last_seen_at: string;
}

export interface TelemetryConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  autoPingEnabled: boolean;
}

const DEFAULT_CONFIG_FILE = 'telemetry_config.json';
const MACHINE_ID_FILE = 'machine_id.txt';

export class TelemetryService {
  private static instance: TelemetryService | null = null;
  private config: TelemetryConfig = {
    supabaseUrl: '',
    supabaseAnonKey: '',
    autoPingEnabled: true,
  };
  private machineId: string = '';
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private userDataPath: string = '';

  private constructor() {}

  public static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  public init(userDataDir?: string): void {
    if (userDataDir) {
      this.userDataPath = userDataDir;
    }
    this.machineId = this.getOrCreateMachineId();
    this.loadConfig();

    // Start auto ping every 6 hours (24,000,000 ms)
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      this.sendPing();
    }, 6 * 60 * 60 * 1000);

    // Initial ping on startup (deferred 10s to not block app startup)
    setTimeout(() => {
      this.sendPing();
    }, 10_000);
  }

  /** Lấy hoặc tự tạo Machine ID duy nhất cố định cho thiết bị */
  private getOrCreateMachineId(): string {
    try {
      if (this.userDataPath) {
        const filePath = path.join(this.userDataPath, MACHINE_ID_FILE);
        if (fs.existsSync(filePath)) {
          const id = fs.readFileSync(filePath, 'utf8').trim();
          if (id) return id;
        }
      }

      // Tạo ID duy nhất từ MAC Address + Hostname + CPU
      const cpus = os.cpus();
      const cpuModel = cpus.length > 0 ? cpus[0].model : '';
      const interfaces = os.networkInterfaces();
      let macStr = '';
      for (const key of Object.keys(interfaces)) {
        const netList = interfaces[key];
        if (netList) {
          for (const net of netList) {
            if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
              macStr += net.mac;
            }
          }
        }
      }

      const rawSeed = `${os.hostname()}_${os.platform()}_${cpuModel}_${macStr}`;
      const hash = crypto.createHash('sha256').update(rawSeed).digest('hex').substring(0, 32);
      const generatedId = `zagi_pc_${hash}`;

      if (this.userDataPath) {
        const filePath = path.join(this.userDataPath, MACHINE_ID_FILE);
        fs.writeFileSync(filePath, generatedId, 'utf8');
      }
      return generatedId;
    } catch {
      return `zagi_pc_${Date.now()}`;
    }
  }

  /** Đọc cấu hình Telemetry Supabase từ đĩa */
  private loadConfig(): void {
    if (!this.userDataPath) return;
    try {
      const cfgPath = path.join(this.userDataPath, DEFAULT_CONFIG_FILE);
      if (fs.existsSync(cfgPath)) {
        const data = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        this.config = { ...this.config, ...data };
      }
    } catch (err: any) {
      Logger.error(`[TelemetryService] loadConfig error: ${err.message}`);
    }
  }

  /** Lưu cấu hình Telemetry Supabase */
  public saveConfig(newConfig: Partial<TelemetryConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (!this.userDataPath) return;
    try {
      const cfgPath = path.join(this.userDataPath, DEFAULT_CONFIG_FILE);
      fs.writeFileSync(cfgPath, JSON.stringify(this.config, null, 2), 'utf8');
      Logger.log(`[TelemetryService] Saved new config`);
    } catch (err: any) {
      Logger.error(`[TelemetryService] saveConfig error: ${err.message}`);
    }
  }

  public getConfig(): TelemetryConfig {
    return { ...this.config };
  }

  /** Lấy thông tin OS thân thiện */
  public getFriendlyOSName(): string {
    const platform = os.platform();
    const arch = os.arch();
    const release = os.release();

    if (platform === 'darwin') {
      const isArm = arch === 'arm64';
      return `macOS (${isArm ? 'Apple Silicon M-Series' : 'Intel x64'}) - Darwin ${release}`;
    }
    if (platform === 'win32') {
      return `Windows (${arch}) - Kernel ${release}`;
    }
    return `Linux (${arch}) - ${release}`;
  }

  /** Lấy dữ liệu telemetry hiện tại của máy này */
  public getDeviceInfo(accounts: Array<{ zaloId: string; displayName?: string }> = []): DeviceTelemetryInfo {
    return {
      machine_id: this.machineId,
      os_platform: os.platform(),
      os_name: this.getFriendlyOSName(),
      os_arch: os.arch(),
      os_release: os.release(),
      hostname: os.hostname(),
      app_version: pkg.version || '3.0.6',
      account_ids: accounts.map(a => a.zaloId).filter(Boolean),
      account_names: accounts.map(a => a.displayName || a.zaloId).filter(Boolean),
      last_seen_at: new Date().toISOString(),
    };
  }

  /**
   * Gửi PING dữ liệu máy hiện tại về Supabase REST API
   * Bảng: device_telemetry (Upsert dựa trên machine_id)
   */
  public async sendPing(accounts: Array<{ zaloId: string; displayName?: string }> = []): Promise<{ success: boolean; message: string }> {
    if (!this.config.autoPingEnabled) {
      return { success: false, message: 'Auto ping is disabled' };
    }

    if (!this.config.supabaseUrl || !this.config.supabaseAnonKey) {
      return { success: false, message: 'Supabase URL hoặc Anon Key chưa được cấu hình' };
    }

    try {
      const payload = this.getDeviceInfo(accounts);
      const url = `${this.config.supabaseUrl.replace(/\/$/, '')}/rest/v1/device_telemetry`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.config.supabaseAnonKey,
          'Authorization': `Bearer ${this.config.supabaseAnonKey}`,
          'Prefer': 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        Logger.log(`[TelemetryService] Ping sent successfully for machine: ${this.machineId}`);
        return { success: true, message: 'Gửi telemetry ping thành công' };
      } else {
        const text = await res.text();
        Logger.warn(`[TelemetryService] Ping failed with status ${res.status}: ${text}`);
        return { success: false, message: `Lỗi Supabase ${res.status}: ${text}` };
      }
    } catch (err: any) {
      Logger.error(`[TelemetryService] Ping network error: ${err.message}`);
      return { success: false, message: `Lỗi kết nối: ${err.message}` };
    }
  }

  /**
   * Lấy danh sách toàn bộ các máy đang hoạt động từ Supabase REST API (dành cho Admin)
   */
  public async fetchAllDeviceTelemetry(): Promise<DeviceTelemetryInfo[]> {
    if (!this.config.supabaseUrl || !this.config.supabaseAnonKey) return [];
    try {
      const url = `${this.config.supabaseUrl.replace(/\/$/, '')}/rest/v1/device_telemetry?select=*&order=last_seen_at.desc`;
      const res = await fetch(url, {
        headers: {
          'apikey': this.config.supabaseAnonKey,
          'Authorization': `Bearer ${this.config.supabaseAnonKey}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      }
      return [];
    } catch (err: any) {
      Logger.error(`[TelemetryService] fetchAllDeviceTelemetry error: ${err.message}`);
      return [];
    }
  }
}

export default TelemetryService.getInstance();
