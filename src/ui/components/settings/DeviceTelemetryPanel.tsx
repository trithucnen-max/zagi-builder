import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import ipc from '@/lib/ipc';

interface DeviceTelemetryInfo {
  machine_id: string;
  os_platform: string;
  os_name: string;
  os_arch: string;
  os_release: string;
  hostname: string;
  app_version: string;
  account_ids: string[];
  account_names: string[];
  last_seen_at: string;
}

interface TelemetryConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey?: string;
  autoPingEnabled: boolean;
}

const DEFAULT_SUPABASE_URL = 'https://paxejunvgfhjdyulzutb.supabase.co';
const DEFAULT_ANON_KEY = 'sb_publishable_lBfBOFuvMYCFxWl2X-yA3g_deMkL9Yo';
const DEFAULT_SERVICE_KEY = '';

export function DeviceTelemetryPanel() {
  const theme = useAppStore(s => s.resolvedTheme || (s.theme === 'light' ? 'light' : 'dark'));
  const isLight = theme === 'light';

  const [config, setConfig] = useState<TelemetryConfig>({
    supabaseUrl: DEFAULT_SUPABASE_URL,
    supabaseAnonKey: DEFAULT_ANON_KEY,
    supabaseServiceKey: DEFAULT_SERVICE_KEY,
    autoPingEnabled: true,
  });
  const [localDevice, setLocalDevice] = useState<DeviceTelemetryInfo | null>(null);
  const [allDevices, setAllDevices] = useState<DeviceTelemetryInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [fetchingDevices, setFetchingDevices] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

  const supabaseSqlSnippet = `-- Lệnh tạo hoặc nâng cấp bảng device_telemetry trên Supabase SQL Editor
CREATE TABLE IF NOT EXISTS device_telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  user_id TEXT,
  license_key TEXT,
  mode TEXT DEFAULT 'boss',               -- 'boss' | 'employee'
  app_version TEXT,                       -- vd: '3.1.1'
  platform TEXT,                          -- 'darwin' | 'win32' | 'linux'
  connected_zalo_accounts INT DEFAULT 0,
  system_metrics JSONB DEFAULT '{}'::jsonb, -- { cpu_usage, free_mem, total_mem }
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  
  -- Các cột tương thích phiên bản cũ
  machine_id TEXT,
  os_platform TEXT,
  os_name TEXT,
  os_arch TEXT,
  os_release TEXT,
  hostname TEXT,
  account_ids JSONB DEFAULT '[]'::jsonb,
  account_names JSONB DEFAULT '[]'::jsonb,
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mở rộng cột nếu bảng đã tồn tại trước đó
ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS license_key TEXT;
ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'boss';
ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS connected_zalo_accounts INT DEFAULT 0;
ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS system_metrics JSONB DEFAULT '{}'::jsonb;
ALTER TABLE device_telemetry ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();

-- Mở quyền RLS cho phép client gửi ping không giới hạn
ALTER TABLE device_telemetry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow client ping write only" ON device_telemetry;
CREATE POLICY "Allow client ping write only" ON device_telemetry FOR ALL TO anon USING (true) WITH CHECK (true);`;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const cfg = await (ipc as any).telemetry?.getConfig();
      if (cfg) {
        setConfig({
          supabaseUrl: cfg.supabaseUrl || DEFAULT_SUPABASE_URL,
          supabaseAnonKey: cfg.supabaseAnonKey || DEFAULT_ANON_KEY,
          supabaseServiceKey: cfg.supabaseServiceKey || DEFAULT_SERVICE_KEY,
          autoPingEnabled: cfg.autoPingEnabled !== undefined ? cfg.autoPingEnabled : true,
        });
      }

      const devInfo = await (ipc as any).telemetry?.getDeviceInfo();
      if (devInfo) setLocalDevice(devInfo);

      fetchRemoteDevices();
    } catch (err: any) {
      console.error('Failed to load telemetry data:', err);
    }
  };

  const fetchRemoteDevices = async () => {
    setFetchingDevices(true);
    try {
      const devices = await (ipc as any).telemetry?.fetchAllDevices();
      if (Array.isArray(devices)) {
        setAllDevices(devices);
      }
    } catch (err: any) {
      console.error('Failed to fetch devices:', err);
    } finally {
      setFetchingDevices(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      await (ipc as any).telemetry?.saveConfig(config);
      setStatusMsg({ type: 'success', text: 'Đã lưu cấu hình Supabase Telemetry thành công!' });
      handleSendPing();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Lỗi lưu cấu hình: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleSendPing = async () => {
    setPinging(true);
    setStatusMsg(null);
    try {
      const res = await (ipc as any).telemetry?.sendPing();
      if (res?.success) {
        setStatusMsg({ type: 'success', text: '⚡ Đã gửi telemetry ping thành công lên Supabase!' });
        fetchRemoteDevices();
      } else {
        setStatusMsg({ type: 'error', text: res?.message || 'Không thể gửi telemetry ping' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Lỗi gửi ping: ${err.message}` });
    } finally {
      setPinging(false);
    }
  };

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(supabaseSqlSnippet);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  // Thống kê OS
  const macCount = allDevices.filter(d => d.os_platform === 'darwin').length;
  const winCount = allDevices.filter(d => d.os_platform === 'win32').length;
  const linuxCount = allDevices.filter(d => d.os_platform === 'linux').length;

  return (
    <div className="space-y-6 max-w-5xl pb-10">
      {/* Header */}
      <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white border-gray-200' : 'bg-gray-900 border-gray-800'}`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl shadow-lg shadow-blue-500/20">
              💻
            </div>
            <div>
              <h3 className="text-base font-bold">Thống Kê Thiết Bị & Máy Cài Đặt (Admin Telemetry)</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Báo cáo số lượng máy tính đang cài đặt Zagi, hệ điều hành và các tài khoản Zalo active theo từng máy.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchRemoteDevices}
              disabled={fetchingDevices}
              className="px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-xl transition-all border border-gray-300 dark:border-gray-700 flex items-center gap-1.5"
            >
              {fetchingDevices ? '⏳ Đang tải...' : '🔄 Tải lại dữ liệu'}
            </button>
            <button
              onClick={handleSendPing}
              disabled={pinging}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center gap-1.5"
            >
              {pinging ? 'Đang gửi...' : '⚡ Gửi Ping Báo Danh'}
            </button>
          </div>
        </div>

        {/* Thông tin máy hiện tại */}
        {localDevice && (
          <div className={`mt-4 p-3.5 rounded-xl border text-xs grid grid-cols-1 md:grid-cols-3 gap-3 ${
            isLight ? 'bg-gray-50 border-gray-200 text-gray-700' : 'bg-gray-800/60 border-gray-700 text-gray-300'
          }`}>
            <div>
              <span className="font-semibold text-gray-500 block text-[11px]">MACHINE ID (MÁY NÀY):</span>
              <code className="font-mono text-blue-600 dark:text-blue-400 font-bold">{localDevice.machine_id}</code>
            </div>
            <div>
              <span className="font-semibold text-gray-500 block text-[11px]">HỆ ĐIỀU HÀNH & CPU:</span>
              <span className="font-medium">{localDevice.os_name}</span>
            </div>
            <div>
              <span className="font-semibold text-gray-500 block text-[11px]">PHIÊN BẢN & ZALO ACTIVE:</span>
              <span className="font-medium">v{localDevice.app_version} ({localDevice.account_ids?.length || 0} tài khoản active)</span>
            </div>
          </div>
        )}
      </div>

      {/* Thông báo status */}
      {statusMsg && (
        <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
          statusMsg.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
            : statusMsg.type === 'error'
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
            : 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
        }`}>
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Bảng Điều Khiển & Thống Kê Các Thiết Bị (Admin Main View) */}
      <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white border-gray-200' : 'bg-gray-900 border-gray-800'}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-bold flex items-center gap-2">
              <span>📊 Danh Sách Thiết Bị Đang Cài Đặt & Hoạt Động</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                {allDevices.length} máy
              </span>
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Dữ liệu được cập nhật tự động từ Supabase Server cho riêng Admin.
            </p>
          </div>
        </div>

        {/* Các thẻ Thống Kê Tổng Quan */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className={`p-3.5 rounded-xl border text-center ${isLight ? 'bg-blue-50/50 border-blue-100' : 'bg-blue-950/20 border-blue-900/40'}`}>
            <span className="text-[11px] font-semibold text-gray-500 uppercase block mb-0.5">Tổng Số Máy Active</span>
            <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{allDevices.length}</span>
          </div>

          <div className={`p-3.5 rounded-xl border text-center ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-gray-800/40 border-gray-800'}`}>
            <span className="text-[11px] font-semibold text-gray-500 uppercase block mb-0.5">🍎 Máy macOS</span>
            <span className="text-2xl font-black text-gray-800 dark:text-gray-200">{macCount}</span>
          </div>

          <div className={`p-3.5 rounded-xl border text-center ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-gray-800/40 border-gray-800'}`}>
            <span className="text-[11px] font-semibold text-gray-500 uppercase block mb-0.5">🪟 Máy Windows</span>
            <span className="text-2xl font-black text-gray-800 dark:text-gray-200">{winCount}</span>
          </div>

          <div className={`p-3.5 rounded-xl border text-center ${isLight ? 'bg-gray-50 border-gray-200' : 'bg-gray-800/40 border-gray-800'}`}>
            <span className="text-[11px] font-semibold text-gray-500 uppercase block mb-0.5">🐧 Máy Linux</span>
            <span className="text-2xl font-black text-gray-800 dark:text-gray-200">{linuxCount}</span>
          </div>
        </div>

        {/* Bảng Danh Sách Máy */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-xs">
            <thead className={`uppercase font-semibold tracking-wider ${
              isLight ? 'bg-gray-100 text-gray-600' : 'bg-gray-800/80 text-gray-400'
            }`}>
              <tr>
                <th className="p-3">Mã Máy (Machine ID)</th>
                <th className="p-3">Hệ Điều Hành & CPU</th>
                <th className="p-3">Phiên Bản App</th>
                <th className="p-3">Tài Khoản Zalo Chạy Trên Máy</th>
                <th className="p-3 text-right">Hoạt Động Gần Nhất</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {allDevices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-400 italic">
                    {fetchingDevices ? 'Đang tải danh sách thiết bị từ Supabase...' : 'Chưa có dữ liệu máy nào. Hãy bấm "⚡ Gửi Ping Báo Danh".'}
                  </td>
                </tr>
              ) : (
                allDevices.map((dev) => (
                  <tr key={dev.machine_id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                    dev.machine_id === localDevice?.machine_id ? 'bg-blue-50/30 dark:bg-blue-950/20' : ''
                  }`}>
                    <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {dev.machine_id}
                      {dev.machine_id === localDevice?.machine_id && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 font-sans">
                          Máy này
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-gray-800 dark:text-gray-200">
                        {dev.os_platform === 'darwin' ? '🍎 ' : dev.os_platform === 'win32' ? '🪟 ' : '🐧 '}
                        {dev.hostname}
                      </div>
                      <div className="text-[11px] text-gray-500">{dev.os_name}</div>
                    </td>
                    <td className="p-3 font-medium">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 font-mono text-[11px]">
                        v{dev.app_version}
                      </span>
                    </td>
                    <td className="p-3">
                      {dev.account_names && dev.account_names.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {dev.account_names.map((name, i) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 text-[11px]">
                              👤 {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Chưa kết nối tài khoản</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono text-[11px] text-gray-500">
                      {new Date(dev.last_seen_at).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collapsible: Cấu hình nâng cao Supabase & Lệnh SQL (Dành cho Admin) */}
      <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-gray-200' : 'bg-gray-900 border-gray-800'}`}>
        <button
          onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
          className="flex items-center justify-between w-full text-left font-bold text-sm text-gray-700 dark:text-gray-300"
        >
          <span className="flex items-center gap-2">
            <span>⚙️ Cấu Hình Nâng Cao Supabase Server (Project URL & Keys)</span>
          </span>
          <span className="text-xs text-blue-500 font-semibold">
            {showAdvancedConfig ? '▲ Thu gọn' : '▼ Mở rộng cấu hình'}
          </span>
        </button>

        {showAdvancedConfig && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            {/* Form Cấu hình Supabase */}
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">
                  Supabase Project URL
                </label>
                <input
                  type="text"
                  placeholder="https://xxxxxx.supabase.co"
                  value={config.supabaseUrl}
                  onChange={e => setConfig({ ...config, supabaseUrl: e.target.value })}
                  className={`w-full text-xs px-3 py-2 rounded-xl border font-mono outline-none transition-colors ${
                    isLight ? 'bg-gray-50 border-gray-300 focus:border-blue-500' : 'bg-gray-800 border-gray-700 focus:border-blue-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">
                  Supabase Publishable API Key (Anon Key)
                </label>
                <textarea
                  rows={2}
                  placeholder="sb_publishable_..."
                  value={config.supabaseAnonKey}
                  onChange={e => setConfig({ ...config, supabaseAnonKey: e.target.value })}
                  className={`w-full text-xs px-3 py-2 rounded-xl border font-mono outline-none transition-colors ${
                    isLight ? 'bg-gray-50 border-gray-300 focus:border-blue-500' : 'bg-gray-800 border-gray-700 focus:border-blue-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">
                  Supabase Secret Key (Service Role Key - Dành riêng Admin)
                </label>
                <textarea
                  rows={2}
                  placeholder="sb_secret_..."
                  value={config.supabaseServiceKey || ''}
                  onChange={e => setConfig({ ...config, supabaseServiceKey: e.target.value })}
                  className={`w-full text-xs px-3 py-2 rounded-xl border font-mono outline-none transition-colors ${
                    isLight ? 'bg-gray-50 border-gray-300 focus:border-blue-500' : 'bg-gray-800 border-gray-700 focus:border-blue-500'
                  }`}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="autoPing"
                  checked={config.autoPingEnabled}
                  onChange={e => setConfig({ ...config, autoPingEnabled: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="autoPing" className="text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                  Tự động gửi Telemetry Ping định kỳ 6h/lần
                </label>
              </div>

              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="w-full py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-blue-500/20"
              >
                {saving ? 'Đang lưu...' : '💾 Lưu Cấu Hình Supabase'}
              </button>
            </div>

            {/* Box Mẫu SQL 1-Click Copy */}
            <div className="flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <span>📄 Lệnh Tạo Bảng CSDL Supabase</span>
                  </h4>
                  <button
                    onClick={copySqlToClipboard}
                    className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 font-medium transition-colors"
                  >
                    {copiedSql ? '✓ Đã Copy SQL' : '📋 Copy SQL'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Lệnh SQL khởi tạo bảng `device_telemetry` trên Supabase (Đã tạo xong trên server).
                </p>

                <pre className={`p-3 rounded-xl border text-[11px] font-mono leading-relaxed overflow-x-auto max-h-48 scrollbar-thin ${
                  isLight ? 'bg-gray-900 text-gray-100 border-gray-800' : 'bg-black/60 text-emerald-400 border-gray-800'
                }`}>
                  {supabaseSqlSnippet}
                </pre>
              </div>

              <p className="text-[11px] text-gray-400 mt-3 italic">
                * Bảng CSDL `device_telemetry` lưu trữ mã máy, OS, và số tài khoản Zalo active cho riêng Admin quản lý.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
