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
  autoPingEnabled: boolean;
}

export function DeviceTelemetryPanel() {
  const theme = useAppStore(s => s.resolvedTheme || (s.theme === 'light' ? 'light' : 'dark'));
  const isLight = theme === 'light';

  const [config, setConfig] = useState<TelemetryConfig>({
    supabaseUrl: '',
    supabaseAnonKey: '',
    autoPingEnabled: true,
  });
  const [localDevice, setLocalDevice] = useState<DeviceTelemetryInfo | null>(null);
  const [allDevices, setAllDevices] = useState<DeviceTelemetryInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [fetchingDevices, setFetchingDevices] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const supabaseSqlSnippet = `-- Lệnh tạo bảng device_telemetry trên Supabase SQL Editor
CREATE TABLE IF NOT EXISTS device_telemetry (
  machine_id TEXT PRIMARY KEY,
  os_platform TEXT,
  os_name TEXT,
  os_arch TEXT,
  os_release TEXT,
  hostname TEXT,
  app_version TEXT,
  account_ids JSONB DEFAULT '[]'::jsonb,
  account_names JSONB DEFAULT '[]'::jsonb,
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mở quyền RLS cho phép app Zagi gửi ping và đọc danh sách máy
ALTER TABLE device_telemetry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select and upsert" ON device_telemetry FOR ALL USING (true) WITH CHECK (true);`;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const cfg = await (ipc as any).telemetry?.getConfig();
      if (cfg) setConfig(cfg);

      const devInfo = await (ipc as any).telemetry?.getDeviceInfo();
      if (devInfo) setLocalDevice(devInfo);

      if (cfg?.supabaseUrl && cfg?.supabaseAnonKey) {
        fetchRemoteDevices();
      }
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
      // Thử ping ngay
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl shadow-lg">
              💻
            </div>
            <div>
              <h3 className="text-base font-bold">Thống Kê Thiết Bị & Máy Cài Đặt (Telemetry)</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Thu thập và báo cáo ẩn danh danh sách máy tính đang cài đặt Zagi, hệ điều hành và số tài khoản Zalo theo máy.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSendPing}
              disabled={pinging}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center gap-1.5"
            >
              {pinging ? 'Đang gửi...' : '⚡ Gửi Ping Ngay'}
            </button>
          </div>
        </div>

        {/* Thông tin máy cục bộ hiện tại */}
        {localDevice && (
          <div className={`mt-4 p-3.5 rounded-xl border text-xs grid grid-cols-1 md:grid-cols-3 gap-3 ${
            isLight ? 'bg-gray-50 border-gray-200 text-gray-700' : 'bg-gray-800/60 border-gray-700 text-gray-300'
          }`}>
            <div>
              <span className="font-semibold text-gray-500 block text-[11px]">MACHINE ID (MÃ MÁY):</span>
              <code className="font-mono text-blue-600 dark:text-blue-400 font-bold">{localDevice.machine_id}</code>
            </div>
            <div>
              <span className="font-semibold text-gray-500 block text-[11px]">HỆ ĐIỀU HÀNH VÀ CPU:</span>
              <span className="font-medium">{localDevice.os_name}</span>
            </div>
            <div>
              <span className="font-semibold text-gray-500 block text-[11px]">PHIÊN BẢN & TÀI KHOẢN ZALO:</span>
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

      {/* Cấu hình Supabase Telemetry & Mẫu Lệnh SQL */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Form Cấu hình Supabase */}
        <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white border-gray-200' : 'bg-gray-900 border-gray-800'}`}>
          <h4 className="text-sm font-bold mb-1 flex items-center gap-2">
            <span>⚙️ Cấu Hình Máy Chủ Telemetry Supabase</span>
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Nhập Supabase Project URL và Anon Key của bạn để đồng bộ báo cáo danh sách máy.
          </p>

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
                Supabase Anon Key (API Key)
              </label>
              <textarea
                rows={3}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={config.supabaseAnonKey}
                onChange={e => setConfig({ ...config, supabaseAnonKey: e.target.value })}
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
        </div>

        {/* Box Mẫu SQL 1-Click Copy */}
        <div className={`p-5 rounded-2xl border flex flex-col justify-between ${isLight ? 'bg-white border-gray-200' : 'bg-gray-900 border-gray-800'}`}>
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
              Copy câu lệnh SQL này và dán vào phần **SQL Editor** trên trang Supabase để khởi tạo bảng lưu trữ `device_telemetry`.
            </p>

            <pre className={`p-3 rounded-xl border text-[11px] font-mono leading-relaxed overflow-x-auto max-h-48 scrollbar-thin ${
              isLight ? 'bg-gray-900 text-gray-100 border-gray-800' : 'bg-black/60 text-emerald-400 border-gray-800'
            }`}>
              {supabaseSqlSnippet}
            </pre>
          </div>

          <p className="text-[11px] text-gray-400 mt-3 italic">
            * Bảng CSDL `device_telemetry` lưu trữ ẩn danh mã máy, OS, số tài khoản Zalo chạy trên từng máy.
          </p>
        </div>
      </div>

      {/* Bảng Điều Khiển & Thống Kê Các Thiết Bị (Admin View) */}
      <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white border-gray-200' : 'bg-gray-900 border-gray-800'}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-bold">📊 Thống Kê Danh Sách Máy Đang Hoạt Động</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Danh sách các thiết bị đang cài đặt và hoạt động thực tế từ Supabase Server.
            </p>
          </div>

          <button
            onClick={fetchRemoteDevices}
            disabled={fetchingDevices}
            className="px-3.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors flex items-center gap-1.5"
          >
            <span>{fetchingDevices ? 'Đang tải...' : '🔄 Tải lại dữ liệu'}</span>
          </button>
        </div>

        {/* Dashboard Thống kê tóm tắt */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-blue-50/50 border-blue-100 text-blue-900' : 'bg-blue-950/20 border-blue-900/50 text-blue-200'}`}>
            <div className="text-[11px] font-semibold text-blue-500 dark:text-blue-400 uppercase">TỔNG SỐ MÁY ACTIVE</div>
            <div className="text-2xl font-black mt-1">{allDevices.length}</div>
          </div>
          <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-gray-50 border-gray-200 text-gray-800' : 'bg-gray-800/40 border-gray-800 text-gray-200'}`}>
            <div className="text-[11px] font-semibold text-gray-500 uppercase">🍎 MÁY MACOS</div>
            <div className="text-2xl font-black mt-1">{macCount}</div>
          </div>
          <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-gray-50 border-gray-200 text-gray-800' : 'bg-gray-800/40 border-gray-800 text-gray-200'}`}>
            <div className="text-[11px] font-semibold text-gray-500 uppercase">🪟 MÁY WINDOWS</div>
            <div className="text-2xl font-black mt-1">{winCount}</div>
          </div>
          <div className={`p-3.5 rounded-xl border ${isLight ? 'bg-gray-50 border-gray-200 text-gray-800' : 'bg-gray-800/40 border-gray-800 text-gray-200'}`}>
            <div className="text-[11px] font-semibold text-gray-500 uppercase">🐧 MÁY LINUX</div>
            <div className="text-2xl font-black mt-1">{linuxCount}</div>
          </div>
        </div>

        {/* Bảng chi tiết danh sách thiết bị */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-left text-xs">
            <thead className={`text-[11px] uppercase tracking-wider font-semibold border-b ${
              isLight ? 'bg-gray-50 text-gray-500 border-gray-200' : 'bg-gray-800/50 text-gray-400 border-gray-800'
            }`}>
              <tr>
                <th className="p-3">Mã Máy (Machine ID)</th>
                <th className="p-3">Hệ Điều Hành & CPU</th>
                <th className="p-3">Phiên Bản App</th>
                <th className="p-3">Tài Khoản Zalo Đang Chạy</th>
                <th className="p-3">Hoạt Động Gần Nhất</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
              {allDevices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-400 italic">
                    Chưa có dữ liệu máy nào. Hãy cấu hình Supabase URL & Anon Key và bấm "⚡ Gửi Ping Ngay".
                  </td>
                </tr>
              ) : (
                allDevices.map(d => (
                  <tr key={d.machine_id} className={`hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors ${
                    d.machine_id === localDevice?.machine_id ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                  }`}>
                    <td className="p-3 font-mono font-medium text-blue-600 dark:text-blue-400">
                      <div className="flex items-center gap-1.5">
                        <span>{d.hostname || d.machine_id.slice(0, 16)}</span>
                        {d.machine_id === localDevice?.machine_id && (
                          <span className="text-[10px] bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-sans font-bold">
                            Máy này
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-gray-800 dark:text-gray-200">
                        {d.os_platform === 'darwin' ? '🍎 macOS' : d.os_platform === 'win32' ? '🪟 Windows' : '🐧 Linux'}
                      </div>
                      <div className="text-[11px] text-gray-400">{d.os_name}</div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-[11px] font-bold">
                        v{d.app_version}
                      </span>
                    </td>
                    <td className="p-3">
                      {d.account_names?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {d.account_names.map((name, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-[10px] font-medium">
                              👤 {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Chưa kết nối tài khoản</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-500 dark:text-gray-400 text-[11px]">
                      {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('vi-VN') : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
