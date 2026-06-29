import React, { useState, useEffect, useCallback } from 'react';
import ipc from '@/lib/ipc';

type TunnelState = {
  active: boolean;
  url: string | null;
  loading: boolean;
  error?: string;
};

interface WebhookService {
  key: string;
  port: number;
  label: string;
  icon: string;
  description: string;
  uses: string[];
  guideTitle: string;
  guideSteps: string[];
  guideExtra?: React.ReactNode;
  showPortConfig: boolean;
  getStatus: () => Promise<any>;
  start: () => Promise<any>;
  stop: () => Promise<any>;
}

const PORT_KEYS = {
  INTEGRATION: 'webhook_port_integration',
  WORKFLOW: 'webhook_port_workflow',
};

// ─── Named Tunnel Config UI ───────────────────────────────────────────────────

type NamedConfig = {
  token: string;
  domainIntegration: string;
  domainWorkflow: string;
  domainRelay: string;
};

function NamedTunnelConfig() {
  const [config, setConfig] = useState<NamedConfig>({
    token: '',
    domainIntegration: '',
    domainWorkflow: '',
    domainRelay: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await (ipc.tunnel as any)?.getConfig?.();
        if (res?.success) {
          setConfig({
            token: res.token || '',
            domainIntegration: res.domainIntegration || '',
            domainWorkflow: res.domainWorkflow || '',
            domainRelay: res.domainRelay || '',
          });
          // Auto-expand if user already has a token saved
          if (res.token) setExpanded(true);
        }
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await (ipc.tunnel as any)?.saveConfig?.(config);
      if (res?.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(res?.error || 'Lưu thất bại');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const hasToken = !!config.token.trim();
  const hasAnyDomain = !!(config.domainIntegration || config.domainWorkflow || config.domainRelay);

  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-900/10 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-800/20 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg">☁️</span>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">
              Cloudflare Named Tunnel
              {hasToken && (
                <span className="ml-2 text-[10px] bg-green-600/30 text-green-300 border border-green-500/30 px-1.5 py-0.5 rounded-full">
                  ĐÃ CẤU HÌNH
                </span>
              )}
            </p>
            <p className="text-[11px] text-blue-300/70">URL cố định • Domain riêng • Cần tài khoản Cloudflare</p>
          </div>
        </div>
        <span className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-blue-500/20">
          {/* Intro */}
          <div className="bg-blue-900/20 rounded-lg px-3 py-2.5 space-y-1.5 mt-3">
            <p className="text-xs text-blue-200 font-medium">
              🔒 Tại sao dùng Named Tunnel?
            </p>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Quick Tunnel (mặc định) tạo URL <strong className="text-gray-300">ngẫu nhiên, thay đổi mỗi lần khởi động</strong>.
              Named Tunnel dùng Cloudflare Zero Trust của bạn để tạo URL <strong className="text-green-300">cố định, không bao giờ thay đổi</strong> —
              không cần cập nhật lại webhook với đối tác khi restart app.
            </p>
            <div className="bg-gray-900/60 rounded-lg px-3 py-2 mt-2 space-y-1">
              <p className="text-[11px] text-gray-400 font-medium">Hướng dẫn lấy Token:</p>
              <ol className="text-[10px] text-gray-500 space-y-0.5 pl-3 list-decimal">
                <li>Vào <strong className="text-blue-300">one.dash.cloudflare.com</strong> → Zero Trust → Networks → Tunnels</li>
                <li>Nhấn <strong className="text-blue-300">Create a tunnel</strong> → chọn <strong>Cloudflared</strong></li>
                <li>Đặt tên tunnel → Sao chép <strong className="text-yellow-300">Token</strong></li>
                <li>Vào tab <strong className="text-blue-300">Public Hostname</strong> → thêm từng domain với port tương ứng</li>
              </ol>
            </div>
          </div>

          {loading ? (
            <p className="text-xs text-gray-500 text-center py-2">Đang tải...</p>
          ) : (
            <div className="space-y-3">
              {/* Token */}
              <div>
                <label className="block text-[11px] text-gray-400 mb-1 font-medium">
                  Cloudflare Tunnel Token <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  placeholder="eyJhIjoiXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX..."
                  value={config.token}
                  onChange={e => setConfig(v => ({ ...v, token: e.target.value }))}
                  className="w-full bg-gray-900 text-white text-xs rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-400 focus:outline-none font-mono"
                />
              </div>

              {/* Divider */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-700" />
                <p className="text-[10px] text-gray-600">Domain cho từng cổng (tùy chọn)</p>
                <div className="flex-1 h-px bg-gray-700" />
              </div>

              {/* Domain fields */}
              {[
                { key: 'domainIntegration', label: '🔗 Tích hợp & Thanh toán (Port 9888)', placeholder: 'webhook.yourdomain.com' },
                { key: 'domainWorkflow',    label: '⚡ Workflow Webhook (Port 9889)',       placeholder: 'workflow.yourdomain.com' },
                { key: 'domainRelay',       label: '👥 Kết nối nhân viên (Port 9900)',      placeholder: 'relay.yourdomain.com'   },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-[11px] text-gray-400 mb-1">{label}</label>
                  <input
                    type="text"
                    placeholder={placeholder}
                    value={(config as any)[key]}
                    onChange={e => setConfig(v => ({ ...v, [key]: e.target.value }))}
                    className="w-full bg-gray-900 text-white text-xs rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-400 focus:outline-none font-mono"
                  />
                </div>
              ))}

              {/* Info note */}
              {hasToken && !hasAnyDomain && (
                <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-amber-300">
                    ⚠️ Bạn đã nhập Token nhưng chưa cấu hình domain nào. Tunnel sẽ chạy nhưng URL tự động sẽ là URL tạm thời.
                    Thêm domain để có URL cố định vĩnh viễn.
                  </p>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-400">⚠️ {error}</p>
              )}

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={saving || !config.token.trim()}
                className="w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40
                  bg-blue-600 hover:bg-blue-500 text-white"
              >
                {saving ? '⏳ Đang lưu...' : saved ? '✅ Đã lưu!' : '💾 Lưu cấu hình Tunnel'}
              </button>

              <p className="text-[10px] text-gray-600 text-center leading-relaxed">
                Lưu xong → Tắt và bật lại tunnel để áp dụng. Token được lưu mã hoá trong DB cục bộ.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TunnelSettings() {
  const [integration, setIntegration] = useState<TunnelState>({ active: false, url: null, loading: true });
  const [workflow, setWorkflow] = useState<TunnelState>({ active: false, url: null, loading: true });

  // Port config
  const [intPort, setIntPort] = useState(9888);
  const [wfPort, setWfPort] = useState(9889);
  const [portLoading, setPortLoading] = useState(true);
  const [portSaving, setPortSaving] = useState<string | null>(null);

  // Load port config from DB
  useEffect(() => {
    (async () => {
      try {
        const res = await ipc.workflow?.getPortConfig();
        if (res?.success) {
          if (res.integrationPort) setIntPort(res.integrationPort);
          if (res.workflowPort) setWfPort(res.workflowPort);
        }
      } catch {} finally {
        setPortLoading(false);
      }
    })();
  }, []);

  const savePort = async (key: string, port: number, label: string) => {
    setPortSaving(key);
    try {
      await ipc.workflow?.setPortConfig(key, port);
    } catch {} finally {
      setPortSaving(null);
    }
  };

  const loadAll = useCallback(async () => {
    // Integration tunnel
    setIntegration(prev => ({ ...prev, loading: true }));
    try {
      const res = await ipc.tunnel?.status();
      if (res) setIntegration({ active: res.active, url: res.url, loading: false });
    } catch { setIntegration(prev => ({ ...prev, loading: false, error: 'Lỗi' })); }

    // Workflow gateway tunnel
    setWorkflow(prev => ({ ...prev, loading: true }));
    try {
      const res = await ipc.workflow?.getTunnelStatus();
      if (res?.success) setWorkflow({ active: res.tunnelActive ?? false, url: res.tunnelUrl ?? null, loading: false });
      else setWorkflow(prev => ({ ...prev, loading: false }));
    } catch { setWorkflow(prev => ({ ...prev, loading: false, error: 'Lỗi' })); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const services: WebhookService[] = [
    {
      key: 'integration',
      port: intPort,
      label: 'Tích hợp & Thanh toán',
      icon: '🔗',
      description: 'Nhận webhook thanh toán (Casso, SePay) và dữ liệu từ các nền tảng POS, vận chuyển.',
      uses: [
        '💳 Nhận thông báo chuyển khoản VietQR từ Casso / SePay → trigger workflow thanh toán',
        '📦 Đồng bộ đơn hàng, khách hàng từ KiotViet, Sapo, Haravan, GHN, GHTK',
      ],
      guideTitle: '🔗 Hướng dẫn: Webhook Thanh toán (Casso / SePay)',
      guideSteps: [
        'Bật nút "🔗 Tích hợp & Thanh toán" bên trên để tạo tunnel Internet',
        'Vào module Tích hợp, thêm kết nối Casso hoặc SePay',
        'Sao chép URL webhook hiển thị ở trên, dán vào ứng dụng Casso/SePay',
        'Khi có người chuyển khoản, Zagi nhận webhook → trigger workflow "Khi nhận thanh toán"',
      ],
      showPortConfig: true,
      getStatus: () => ipc.tunnel?.status() ?? Promise.resolve({}),
      start: () => ipc.tunnel?.start() ?? Promise.resolve({}),
      stop: () => ipc.tunnel?.stop() ?? Promise.resolve({}),
    },
    {
      key: 'workflow',
      port: wfPort,
      label: 'Workflow Webhook',
      icon: '⚡',
      description: 'Cho phép bên thứ 3 gọi API để kích hoạt workflow của bạn.',
      uses: [
        '🔔 Website, app bắn dữ liệu sang → tự động xử lý qua workflow',
        '🤖 Tiếp nhận đơn hàng, feedback, lead, callback từ dịch vụ bên ngoài',
        '🔗 Tích hợp với bất kỳ hệ thống nào hỗ trợ webhook (Zapier, Make, ...)',
      ],
      guideTitle: '⚡ Hướng dẫn: Webhook trong Workflow',
      guideSteps: [
        'Bật nút "⚡ Workflow Webhook" bên trên để tạo tunnel Internet',
        'Vào module Workflow, tạo kịch bản mới, chọn trigger "Webhook bên ngoài"',
        'Lưu kịch bản → URL webhook tự động được tạo trong phần cấu hình node',
        'Copy URL đó gửi cho đối tác / hệ thống bên thứ 3',
        'Khi họ POST dữ liệu đến URL, workflow chạy tự động',
        'Dùng biến {{ $trigger.body }}, {{ $trigger.headers }} trong workflow',
      ],
      guideExtra: (
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg px-3 py-2 mt-2">
          <p className="text-[11px] text-blue-300 font-medium">📝 Ví dụ dữ liệu webhook từ website:</p>
          <pre className="text-[11px] text-gray-400 bg-gray-950 rounded px-2 py-1.5 mt-1 overflow-x-auto font-mono">
{`POST /api/workflow/webhook/a1b2c3
{
  "orderId": "ORD123",
  "customer": { "name": "Nguyen Van A", "phone": "090xxxx" },
  "total": 500000
}`}
          </pre>
          <p className="text-xs text-blue-400 mt-1 leading-relaxed">
            → Workflow dùng{' '}
            <code className="text-yellow-300">{'{{ $trigger.body.orderId }}'}</code>{' '}
            và{' '}
            <code className="text-yellow-300">{'{{ $trigger.body.customer.name }}'}</code>
          </p>
        </div>
      ),
      showPortConfig: true,
      getStatus: () => ipc.workflow?.getTunnelStatus() ?? Promise.resolve({}),
      start: () => ipc.workflow?.startTunnel() ?? Promise.resolve({}),
      stop: () => ipc.workflow?.stopTunnel() ?? Promise.resolve({}),
    },
  ];

  const handleToggle = async (svc: WebhookService, current: TunnelState, setter: (s: TunnelState) => void) => {
    setter({ ...current, loading: true, error: undefined });
    try {
      if (current.active) {
        const res = await svc.stop();
        if (res?.success !== false) setter({ active: false, url: null, loading: false });
        else setter({ ...current, loading: false, error: res?.error || 'Lỗi tắt tunnel' });
      } else {
        const res = await svc.start();
        if (res?.success !== false) setter({ active: true, url: res?.tunnelUrl || res?.url || null, loading: false });
        else setter({ ...current, loading: false, error: res?.error || 'Lỗi bật tunnel' });
      }
    } catch (err: any) {
      setter({ ...current, loading: false, error: err?.message || 'Lỗi' });
    }
  };

  const getState = (key: string): [TunnelState, (s: TunnelState) => void] => {
    if (key === 'integration') return [integration, setIntegration];
    return [workflow, setWorkflow];
  };

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-white">🔗 Webhooks</h2>

      {/* ─── Tunnel là gì? ─── */}
      <div className="rounded-xl p-4 space-y-3 border border-amber-600 dark:border-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">🌐</span>
          <p className="text-sm font-semibold ">Tunnel - công nghệ hoạt động phía sau Webhook</p>
        </div>
        <p className="text-xs dark:text-gray-400 leading-relaxed">
          Để nhận được webhook từ Internet, máy tính của bạn cần một <strong>địa chỉ công khai</strong>.
          Tunnel tạo một URL dạng <code className="text-green-600 dark:text-green-300">https://xxx.trycloudflare.com</code> (miễn phí) trỏ về máy bạn,
          cho phép bên thứ 3 (ngân hàng, website, POS...) gửi dữ liệu đến.
        </p>
        <p className="text-xs dark:text-gray-400 leading-relaxed">
          Zagi dùng <strong className="text-blue-600 dark:text-blue-300">Cloudflare Quick Tunnel</strong> (miễn phí, không cần tài khoản)
          theo mặc định. Nếu cần URL cố định, dùng <strong className="text-blue-400">Named Tunnel</strong> bên dưới.
        </p>
        <div className="dark:bg-amber-900/20 border rounded-lg px-3 py-2 space-y-1.5">
          <p className="text-xs font-medium ">
            💡 Nếu bạn chỉ dùng Zagi trong mạng LAN (cùng WiFi) thì <strong>không cần bật tunnel</strong>.
            Chỉ bật khi cần nhận dữ liệu từ Internet.
          </p>
          <p className="text-[11px] leading-relaxed">
            ⚠️ Quick Tunnel chỉ hoạt động khi app đang chạy. Khi khởi động lại, bạn sẽ nhận được
            <strong> địa chỉ URL mới</strong>. Dùng Named Tunnel để URL không thay đổi.
          </p>
        </div>
      </div>

      {/* ─── Named Tunnel Config ─── */}
      <NamedTunnelConfig />

      {/* ─── Service cards ─── */}
      {services.map(svc => {
        const [state, setState] = getState(svc.key);
        const cardColor = state.active ? 'bg-green-500/20 border-green-500/50' : 'bg-gray-800/60 border-gray-700/50';

        return (
          <div key={svc.key} className={`rounded-xl border ${cardColor} p-4 space-y-4`}>
            {/* Header: icon + toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{svc.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-white">{svc.label}</p>
                  <p className="text-xs text-gray-400">Port {svc.port}</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle(svc, state, setState)}
                disabled={state.loading}
                className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                  state.active ? 'bg-green-600' : 'bg-gray-600'
                }`}
              >
                {state.loading ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </span>
                ) : (
                  <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                    state.active ? 'translate-x-5.5 left-0.5' : 'translate-x-0.5 left-0'
                  }`} />
                )}
              </button>
            </div>

            {/* Description */}
            <p className="text-xs text-gray-400 leading-relaxed">{svc.description}</p>

            {/* URL */}
            {state.active && state.url && (
              <div className="bg-gray-900/60 rounded-lg px-3 py-2">
                <p className="text-[11px] text-gray-500 mb-0.5">🌐 URL webhook gốc:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-green-300 break-all select-all font-mono">{state.url}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(state.url!)}
                    className="text-blue-400 hover:text-blue-300 text-xs flex-shrink-0"
                    title="Copy URL"
                  >
                    📋
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {state.error && (
              <div className="bg-red-900/30 border border-red-500/40 rounded-lg px-3 py-2">
                <p className="text-xs text-red-300">⚠️ {state.error}</p>
              </div>
            )}

            {/* Uses */}
            <div className="bg-gray-900/40 rounded-lg px-3 py-2 space-y-1">
              <p className="text-[11px] text-gray-500 font-medium">Dùng để:</p>
              {svc.uses.map((item, i) => (
                <p key={i} className="text-xs text-gray-400 leading-relaxed">{item}</p>
              ))}
            </div>

            {/* Port config */}
            {svc.showPortConfig && (
              <div className="flex items-center gap-3 bg-gray-900/40 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">Cổng:</p>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={svc.port}
                  disabled={state.active}
                  onChange={e => {
                    const newPort = Number(e.target.value);
                    if (svc.key === 'integration') setIntPort(newPort);
                    else setWfPort(newPort);
                  }}
                  className="w-20 bg-gray-700 text-white text-xs rounded-lg px-2 py-1.5 border border-gray-600 disabled:opacity-30"
                />
                <button
                  disabled={state.active || portLoading || portSaving === svc.key}
                  onClick={async () => {
                    await savePort(
                      svc.key === 'integration' ? PORT_KEYS.INTEGRATION : PORT_KEYS.WORKFLOW,
                      svc.port,
                      svc.label
                    );
                  }}
                  className="px-2.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded-lg transition-colors"
                >
                  {portSaving === svc.key ? '⏳' : 'Lưu'}
                </button>
                {state.active && (
                  <p className="text-xs text-yellow-400">Tắt tunnel trước khi đổi port</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ─── Employee Relay note ─── */}
      <div className="bg-gray-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-lg flex-shrink-0 mt-0.5">👥</span>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-white">Kết nối nhân viên từ xa</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Để cho phép nhân viên kết nối từ xa qua Internet, bạn cần bật tunnel riêng cho Relay.
              Tính năng này được quản lý trong <strong>Cài đặt → Nhân viên</strong> sau khi bật Relay Server.
              Port kết nối nhân viên (9900) cố định để tránh gián đoạn cho nhân viên đang làm việc.
            </p>
            {/* Named Tunnel shortcut note */}
            <p className="text-[11px] text-blue-400">
              💡 Để URL Relay luôn cố định, cấu hình domain cho Port 9900 trong phần <strong>Cloudflare Named Tunnel</strong> phía trên.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Hướng dẫn chi tiết ─── */}
      {services.map(svc => (
        <div key={`guide-${svc.key}`} className="bg-gray-800 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-white">{svc.guideTitle}</p>
          <ol className="space-y-1.5 pl-4 list-decimal text-xs text-gray-400 leading-relaxed">
            {svc.guideSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          {svc.guideExtra}
        </div>
      ))}
    </div>
  );
}
