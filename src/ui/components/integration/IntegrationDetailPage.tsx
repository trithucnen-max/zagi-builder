import React, { useState, useEffect } from 'react';
import ipc from '@/lib/ipc';
import { useAppStore } from '@/store/appStore';
import BrandLogo from '../common/BrandLogo';
import { useEmployeeStore } from '@/store/employeeStore';

interface CatalogItem {
  type: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  priority: string;
  credentialFields: { key: string; label: string; secret?: boolean; placeholder?: string }[];
  settingFields?: { key: string; label: string; type?: string; options?: { value: string; label: string }[] }[];
}

interface SavedIntegration {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  connectedAt?: number;
  settings?: Record<string, any>;
}

interface Props {
  catalogItem: CatalogItem;
  saved?: SavedIntegration;
  webhookPort: number;
  tunnelUrl?: string | null;
  onBack: () => void;
}

// Inline custom SVG Icons to comply with the anti-emoji policy
const KeyIcon = () => (
  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m-2 4a5 5 0 11-7.07-7.07l1.27-1.27A6.978 6.978 0 0012 2.112v.013M12 12v.01M16 16v.01M20 20v.01M12 12l8 8-3 3-3-3-3 3-4-4 5-5z" />
  </svg>
);

const GlobeIcon = () => (
  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
  </svg>
);

const InfoIcon = ({ className = "w-4 h-4 text-amber-500" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const AlertCircleIcon = () => (
  <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const GearIcon = () => (
  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const MessageIcon = () => (
  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const PlugIcon = () => (
  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const EyeIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const EyeOffIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
  </svg>
);

const CopyIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" strokeLinecap="round" strokeLinejoin="round" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = ({ className = "w-4 h-4 text-emerald-500" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg className="w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

export default function IntegrationDetailPage({ catalogItem, saved, webhookPort, tunnelUrl, onBack }: Props) {
  const { showNotification } = useAppStore();
  const empMode = useEmployeeStore(s => s.mode);
  const isEmployee = empMode === 'employee';

  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [enabled, setEnabled] = useState(saved?.enabled ?? true);
  const [saved_id, setSavedId] = useState<string | undefined>(saved?.id);
  const [deleting, setDeleting] = useState(false);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Load saved settings (non-credential)
    if (saved?.settings) setSettings(saved.settings);
    // Pre-populate defaults for setting fields
    if (catalogItem.settingFields) {
      const defaults: Record<string, any> = {};
      for (const sf of catalogItem.settingFields) {
        if (sf.options?.[0]) defaults[sf.key] = sf.options[0].value;
      }
      setSettings(prev => ({ ...defaults, ...prev }));
    }
  }, [saved, catalogItem]);

  const handleSave = async () => {
    // Validate required credential fields
    for (const field of catalogItem.credentialFields) {
      const value = credentials[field.key]?.trim();
      if (!saved_id && !value) {
        showNotification(`Vui lòng nhập ${field.label}`, 'warning');
        return;
      }
    }
    setSaving(true);
    setTestResult(null);
    try {
      const payload: any = {
        id: saved_id,
        type: catalogItem.type,
        name: catalogItem.name,
        enabled,
        credentials,
        settings,
      };
      const res = await ipc.integration?.save(payload);
      if (res?.success && res.id) {
        setSavedId(res.id);
        showNotification('Đã lưu cấu hình!', 'success');
      } else {
        showNotification('Lưu thất bại: ' + (res?.error || 'Lỗi không xác định'), 'error');
      }
    } catch (e: any) {
      showNotification('Lỗi: ' + e.message, 'error');
    }
    setSaving(false);
  };

  const handleTest = async () => {
    if (!saved_id) {
      showNotification('Vui lòng lưu cấu hình trước khi test kết nối.', 'warning');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await ipc.integration?.test(saved_id);
      const success = !!res?.success;
      const message = res?.message || (success ? 'Kết nối thành công' : 'Kết nối thất bại');
      setTestResult({ success, message });
      showNotification(success ? message : `Test thất bại: ${message}`, success ? 'success' : 'error');
    } catch (e: any) {
      const message = e.message || 'Lỗi không xác định';
      setTestResult({ success: false, message });
      showNotification('Test thất bại: ' + message, 'error');
    }
    setTesting(false);
  };

  const handleDelete = async () => {
    if (!saved_id) { onBack(); return; }
    if (!confirm(`Xóa tích hợp ${catalogItem.name}? Dữ liệu sẽ mất hoàn toàn.`)) return;
    setDeleting(true);
    try {
      await ipc.integration?.delete(saved_id);
      showNotification(`Đã xoá tích hợp ${catalogItem.name}`, 'success');
      onBack();
    } catch (e: any) {
      showNotification('Lỗi xóa: ' + e.message, 'error');
    }
    setDeleting(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    showNotification('Đã copy đường dẫn webhook!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const localWebhookUrl  = `http://127.0.0.1:${webhookPort}/webhook/${saved_id || catalogItem.type}`;
  const publicWebhookUrl = tunnelUrl ? `${tunnelUrl}/webhook/${saved_id || catalogItem.type}` : null;
  const isPayment = catalogItem.type === 'casso' || catalogItem.type === 'sepay';

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-950 select-none">
      {/* Header */}
      <div className="px-6 py-4 bg-gray-900/40 backdrop-blur-md border-b border-gray-900/80 flex-shrink-0 flex items-center gap-4">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white hover:bg-gray-800/60 p-1.5 rounded-lg active:scale-95 transition-all duration-150"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <div className={`w-10 h-10 rounded-xl ${catalogItem.color} flex items-center justify-center shadow-lg shadow-black/10`}>
          <BrandLogo type={catalogItem.type} className="w-5.5 h-5.5 text-white-important" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-gray-100 tracking-tight">{catalogItem.name}</h1>
          <p className="text-xs text-gray-500 mt-0.5 font-medium leading-relaxed">{catalogItem.desc}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Enable toggle */}
          <label className={`flex items-center gap-2.5 ${isEmployee ? 'cursor-not-allowed' : 'cursor-pointer'} select-none`}>
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Kích hoạt</span>
            <div
              className={`relative w-9 h-5 rounded-full transition-all duration-200 ${enabled ? 'bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.4)]' : 'bg-gray-800 border border-gray-700'} ${isEmployee ? 'opacity-50' : ''}`}
              onClick={() => !isEmployee && setEnabled(!enabled)}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-200 ${enabled ? 'translate-x-4' : 'translate-x-0 bg-gray-400'}`}/>
            </div>
          </label>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
        {isEmployee ? (
          <div className="bg-gray-900/30 border border-gray-800/80 rounded-xl p-5">
            {saved_id ? (
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <div>
                  <h3 className="text-sm font-semibold text-gray-200">Đang hoạt động</h3>
                  <p className="text-xs text-gray-500 mt-1 font-mono">
                    Gian hàng: {saved?.settings?.retailerName || saved?.settings?.retailerDomain || saved?.settings?.storeDomain || saved?.settings?.businessId || saved?.name || ''}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-600" />
                <div>
                  <h3 className="text-sm font-semibold text-gray-500">Chưa được cấu hình</h3>
                  <p className="text-xs text-gray-600 mt-1">
                    Vui lòng liên hệ quản trị viên để thiết lập kết nối này.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Credentials */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <KeyIcon />
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Thông tin xác thực</h2>
              </div>
              <div className="space-y-4 bg-gray-900/30 border border-gray-900 rounded-2xl p-4.5">
                {catalogItem.credentialFields.map(field => (
                  <div key={field.key} className="space-y-1.5">
                    <label className="block text-xs font-semibold text-gray-400">{field.label}</label>
                    <div className="relative">
                      <input
                        type={field.secret && !showSecret[field.key] ? 'password' : 'text'}
                        value={credentials[field.key] || ''}
                        onChange={e => setCredentials(prev => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder || (saved_id ? '••••••••' : '')}
                        className="w-full bg-gray-950 border border-gray-800 hover:border-gray-700/60 focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 rounded-xl px-3.5 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none transition-all duration-200 pr-10 font-mono"
                      />
                      {field.secret && (
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                          onClick={() => setShowSecret(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                        >
                          {showSecret[field.key] ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {saved_id && (
                <p className="text-[10px] text-gray-600 px-1 font-medium">Để trống các trường bí mật nếu không muốn thay đổi.</p>
              )}
            </div>

            {/* Settings */}
            {catalogItem.settingFields && catalogItem.settingFields.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <GearIcon />
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cài đặt cấu hình</h2>
                </div>
                <div className="space-y-4 bg-gray-900/30 border border-gray-900 rounded-2xl p-4.5">
                  {catalogItem.settingFields.map(field => (
                    <div key={field.key} className="space-y-1.5">
                      <label className="block text-xs font-semibold text-gray-400">{field.label}</label>
                      {field.type === 'select' ? (
                        <select
                          value={settings[field.key] || ''}
                          onChange={e => setSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className="w-full bg-gray-950 border border-gray-800 hover:border-gray-700/60 focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 rounded-xl px-3.5 py-2.5 text-sm text-gray-200 focus:outline-none transition-all duration-200"
                        >
                          {field.options?.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={settings[field.key] || ''}
                          onChange={e => setSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className="w-full bg-gray-950 border border-gray-800 hover:border-gray-700/60 focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 rounded-xl px-3.5 py-2.5 text-sm text-gray-200 focus:outline-none transition-all duration-200 font-mono"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Webhook & Tunnel — bắt buộc cho thanh toán */}
            {isPayment && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <GlobeIcon />
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Webhook Tunnel — Kết nối Internet</h2>
                </div>
                <div className="bg-gray-900/30 border border-gray-900 rounded-2xl p-4.5 space-y-4">
                  {/* WHY — giải thích tại sao cần tunnel */}
                  <div className="bg-amber-950/10 border-l-2 border-amber-500 border border-amber-500/10 rounded-xl px-4 py-3">
                    <div className="flex gap-2">
                      <InfoIcon className="w-4 h-4 text-amber-500/90 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-amber-400">Dùng {catalogItem.name} để nhận thanh toán tự động?</p>
                        <p className="text-[11px] text-amber-300/80 mt-1 leading-relaxed">
                          {catalogItem.name} gửi webhook (thông báo giao dịch) từ Internet.
                          Nhưng phần mềm đang chạy cục bộ trên máy tính của bạn (localhost).
                          Bạn cần <strong className="text-amber-200">kích hoạt Tunnel</strong> ở màn hình cấu hình tích hợp để tạo cầu nối thông suốt.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Luồng hoạt động trực quan */}
                  <div className="bg-gray-950/40 rounded-xl p-3 border border-gray-900">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2.5">Luồng hoạt động trực quan:</p>
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-400 flex-wrap">
                      <span className="px-2 py-1 bg-gray-900 border border-gray-800 rounded-lg text-gray-300 font-semibold">{catalogItem.name}</span>
                      <ArrowRightIcon />
                      <span className="px-2 py-1 bg-blue-950/30 border border-blue-900/30 rounded-lg text-blue-400 font-medium">Tunnel URL</span>
                      <ArrowRightIcon />
                      <span className="px-2 py-1 bg-gray-900 border border-gray-800 rounded-lg text-gray-400 font-medium">Zagi Desktop</span>
                      <ArrowRightIcon />
                      <span className="px-2 py-1 bg-emerald-950/30 border border-emerald-900/30 rounded-lg text-emerald-400 font-medium">Tự động XN đơn</span>
                    </div>
                  </div>

                  {/* Public URL (when tunnel is active) */}
                  {publicWebhookUrl ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                        <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                        URL công khai để cấu hình trong {catalogItem.name}:
                      </p>
                      <div className="flex items-center gap-2 bg-emerald-950/10 border border-emerald-900/20 rounded-xl px-3.5 py-2.5">
                        <code className="text-xs text-emerald-400 font-mono flex-1 break-all select-all">{publicWebhookUrl}</code>
                        <button
                          className={`p-1.5 rounded-lg transition-all duration-150 ${copied ? 'bg-emerald-900/40 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/60'} active:scale-90 flex-shrink-0`}
                          onClick={() => copyToClipboard(publicWebhookUrl)}
                          title="Copy URL"
                        >
                          {copied ? <CheckIcon className="w-4 h-4 text-emerald-400" /> : <CopyIcon />}
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-500 font-medium italic mt-1">Copy URL trên dán vào phần cấu hình Webhook trên trang quản trị {catalogItem.name}.</p>
                    </div>
                  ) : (
                    /* No tunnel — Big warning + CTA */
                    <div className="bg-red-950/10 border-l-2 border-red-500 border border-red-500/10 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircleIcon />
                        <div>
                          <p className="text-xs font-bold text-red-400">Chưa bật Webhook Tunnel</p>
                          <p className="text-[11px] text-red-300/80 leading-relaxed mt-1">
                            Hệ thống chưa thể nhận thông báo thanh toán tự động do đường truyền Tunnel đang tắt.
                            {tunnelUrl
                              ? ' Tunnel đang chạy nhưng chưa có URL. Vui lòng tắt và bật lại kết nối.'
                              : ' Vui lòng kích hoạt tính năng Tunnel ngoài màn hình danh sách Tích hợp.'}
                          </p>
                          <ol className="mt-2.5 space-y-1 text-[11px] text-red-400/90 list-decimal pl-4 font-medium">
                            <li>Quay lại màn hình danh sách <strong className="text-red-300">Tích hợp → Bật Tunnel</strong> (nút gạt phía trên).</li>
                            <li>Copy đường dẫn URL công khai vừa hiển thị.</li>
                            <li>Dán cấu hình này vào cài đặt Webhook của {catalogItem.name}.</li>
                          </ol>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Local URL info (informational) */}
                  <div className="bg-gray-950/40 rounded-xl p-3 border border-gray-900">
                    <p className="text-[10px] text-gray-500 font-semibold">URL Local (nội bộ, không dùng cấu hình Webhook):</p>
                    <code className="text-[11px] text-gray-600 font-mono block mt-1 select-all">{localWebhookUrl}</code>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Usage in conversation (QuickPanel) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <MessageIcon />
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Sử dụng trong hội thoại</h2>
          </div>
          <div className="bg-gray-900/30 border border-gray-900 rounded-2xl p-4.5 space-y-4">
            <p className="text-xs text-gray-400 leading-relaxed">
              Ngay trong khung chat với khách hàng, bạn có thể thực hiện tra cứu thông tin nhanh chóng từ bảng điều khiển bên phải:
            </p>

            <div className="bg-gray-950/40 rounded-xl p-3.5 border border-gray-900">
              <div className="flex items-center gap-2 mb-2.5">
                <PlugIcon />
                <span className="text-xs font-bold text-gray-200">Tích hợp nhanh trong Chat</span>
              </div>
              <ol className="space-y-2 text-[11px] text-gray-400 pl-1">
                <li className="flex gap-2">
                  <span className="text-blue-500 font-bold font-mono">1.</span>
                  <span>Nhấn biểu tượng <span className="text-blue-400 font-semibold font-mono">⚡ Tích hợp</span> trên thanh công cụ chat.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500 font-bold font-mono">2.</span>
                  <span>Chọn mục <span className="text-gray-200 font-semibold">{catalogItem.name}</span> trong danh sách hiện ra.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500 font-bold font-mono">3.</span>
                  <span>Lựa chọn các chức năng có sẵn bên dưới:</span>
                </li>
              </ol>
            </div>

            {/* Available quick actions for this integration type */}
            {(catalogItem.type === 'kiotviet' || catalogItem.type === 'haravan' || catalogItem.type === 'sapo' || catalogItem.type === 'nhanh' || catalogItem.type === 'pancake') && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Tra cứu KH', desc: 'Theo Số điện thoại' },
                  { label: 'Tra cứu đơn', desc: 'Theo mã hoặc SĐT' },
                  { label: 'Tìm sản phẩm', desc: 'Theo tên, mã SKU' },
                  { label: 'Tạo đơn hàng', desc: 'Tạo trực tiếp đơn mới' },
                ].map((act, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-950/20 rounded-xl p-3 border border-gray-900 hover:border-gray-800/80 transition-all duration-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500/80" />
                    <div>
                      <p className="text-[11px] font-bold text-gray-200">{act.label}</p>
                      <p className="text-[9px] text-gray-500 mt-0.5 font-medium">{act.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {catalogItem.type === 'ghn' && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'DS Tỉnh/Thành' },
                  { label: 'DS Quận/Huyện' },
                  { label: 'DS Phường/Xã' },
                  { label: 'Dịch vụ GHN' },
                  { label: 'Tra vận đơn' },
                  { label: 'Tính phí ship' },
                ].map((act, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-950/20 rounded-xl p-2.5 border border-gray-900 hover:border-gray-800/80 transition-all duration-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500/80" />
                    <p className="text-[11px] font-bold text-gray-200">{act.label}</p>
                  </div>
                ))}
              </div>
            )}
            {catalogItem.type === 'ghtk' && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Tra vận đơn' },
                  { label: 'Tính phí ship' },
                ].map((act, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-950/20 rounded-xl p-2.5 border border-gray-900 hover:border-gray-800/80 transition-all duration-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
                    <p className="text-[11px] font-bold text-gray-200">{act.label}</p>
                  </div>
                ))}
              </div>
            )}
            {(catalogItem.type === 'casso' || catalogItem.type === 'sepay') && (
              <div className="grid grid-cols-1 gap-2">
                {[
                  { label: 'Lịch sử giao dịch nhận tiền' },
                ].map((act, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-950/20 rounded-xl p-3 border border-gray-900 hover:border-gray-800/80 transition-all duration-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
                    <p className="text-[11px] font-bold text-gray-200">{act.label}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-gray-950/30 rounded-xl p-3 flex gap-2 border border-gray-900">
              <InfoIcon className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-gray-500 leading-relaxed font-medium">
                Kết quả tra cứu sẽ hiển thị chi tiết dạng thẻ. Bạn có thể <strong className="text-gray-400">ghim các thao tác thường dùng</strong> lên thanh toolbar của hội thoại để tiện click nhanh.
              </p>
            </div>
          </div>
        </div>

        {/* Workflow hint */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <SparklesIcon />
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Workflow Nodes hỗ trợ</h2>
          </div>
          <div className="bg-blue-950/5 border border-blue-900/10 rounded-2xl p-4.5">
            <ul className="text-[11px] text-blue-300/80 space-y-2 font-mono">
              {catalogItem.type === 'kiotviet' && <>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-blue-200">kiotviet.lookupCustomer</strong> — Tra cứu khách hàng</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-blue-200">kiotviet.lookupOrder</strong> — Tìm kiếm đơn hàng</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-blue-200">kiotviet.createOrder</strong> — Khởi tạo đơn hàng mới</span>
                </li>
              </>}
              {catalogItem.type === 'haravan' && <>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-blue-200">haravan.lookupCustomer</strong> — Tra cứu thông tin khách hàng</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-blue-200">haravan.lookupOrder</strong> — Kiểm tra đơn hàng</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-blue-200">haravan.createOrder</strong> — Đẩy đơn hàng mới sang Haravan</span>
                </li>
              </>}
              {catalogItem.type === 'sapo' && <>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-blue-200">sapo.lookupCustomer</strong> — Tìm kiếm thông tin khách hàng</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-blue-200">sapo.lookupOrder</strong> — Kiểm tra thông tin đơn hàng</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-blue-200">sapo.createOrder</strong> — Đẩy đơn hàng sang Sapo</span>
                </li>
              </>}
              {catalogItem.type === 'nhanh' && <>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-blue-200">nhanh.lookupCustomer</strong> — Tra cứu khách hàng theo SĐT</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-blue-200">nhanh.lookupOrder</strong> — Kiểm tra thông tin đơn hàng</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-blue-200">nhanh.createOrder</strong> — Tạo đơn hàng mới</span>
                </li>
              </>}
              {catalogItem.type === 'pancake' && <>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-blue-200">pancake.lookupCustomer</strong> — Tra cứu khách hàng</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-blue-200">pancake.lookupOrder</strong> — Tìm kiếm đơn hàng</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-500">•</span>
                  <span><strong className="text-blue-200">pancake.createOrder</strong> — Khởi tạo đơn mới</span>
                </li>
              </>}
              {(catalogItem.type === 'casso' || catalogItem.type === 'sepay') && <>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500">•</span>
                  <span><strong className="text-emerald-300">trigger.payment</strong> — Kích hoạt khi có giao dịch chuyển khoản</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500">•</span>
                  <span><strong className="text-emerald-300">payment.getTransactions</strong> — Lấy lịch sử biến động số dư</span>
                </li>
              </>}
              {catalogItem.type === 'ghn' && <>
                <li className="flex items-start gap-1.5">
                  <span className="text-red-500">•</span>
                  <span><strong className="text-red-300">ghn.createOrder</strong> — Khởi tạo vận đơn giao hàng</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-red-500">•</span>
                  <span><strong className="text-red-300">ghn.getTracking</strong> — Tra cứu trạng thái vận đơn</span>
                </li>
              </>}
              {catalogItem.type === 'ghtk' && <>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500">•</span>
                  <span><strong className="text-emerald-300">ghtk.createOrder</strong> — Khởi tạo vận đơn GHTK</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-500">•</span>
                  <span><strong className="text-emerald-300">ghtk.getTracking</strong> — Tra cứu hành trình đơn</span>
                </li>
              </>}
            </ul>
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`p-4.5 rounded-2xl text-xs font-semibold flex items-center gap-2 border ${testResult.success ? 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400' : 'bg-red-950/20 border-red-900/30 text-red-400'}`}>
            <span className="flex-shrink-0">{testResult.success ? <CheckIcon className="w-4 h-4 text-emerald-400" /> : <AlertCircleIcon />}</span>
            <span>{testResult.message}</span>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-6 py-4 bg-gray-900/20 border-t border-gray-900 flex-shrink-0 flex items-center gap-3">
        {saved_id && !isEmployee && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-xs font-semibold rounded-xl text-red-400 hover:bg-red-950/30 hover:text-red-300 border border-red-950/80 active:scale-95 transition-all duration-150"
          >
            {deleting ? 'Đang xóa...' : 'Xóa'}
          </button>
        )}
        <div className="flex-1"/>
        {saved_id && (
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-4.5 py-2.5 text-xs font-semibold rounded-xl bg-gray-900 hover:bg-gray-800 text-gray-200 border border-gray-850 hover:border-gray-800 active:scale-95 transition-all duration-150"
          >
            {testing ? 'Đang test...' : 'Test kết nối'}
          </button>
        )}
        {!isEmployee && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/10 hover:shadow-blue-500/20 active:scale-95 transition-all duration-150"
          >
            {saving ? 'Đang lưu...' : saved_id ? 'Cập nhật' : 'Kết nối'}
          </button>
        )}
      </div>
    </div>
  );
}
