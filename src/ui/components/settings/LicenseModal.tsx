import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/store/appStore';

interface LicenseModalProps {
  onClose: () => void;
}

function maskKey(key: string) {
  if (!key) return '';
  if (key.length <= 10) return '••••••••';
  return `${key.slice(0, 6)} •••• •••• ${key.slice(-4)}`;
}

function getProgressPercentage(license: any) {
  if (license.isLifetime) return 100;
  const daysLeft = license.daysLeft ?? 0;
  if (daysLeft <= 0) return 0;
  let maxDays = 14;
  if (license.plan?.includes('6m')) maxDays = 183;
  else if (license.plan?.includes('12m')) maxDays = 365;
  return Math.min(100, Math.max(0, (daysLeft / maxDays) * 100));
}

function getProgressColor(license: any) {
  if (license.isLifetime) return 'bg-emerald-500';
  const daysLeft = license.daysLeft ?? 0;
  if (daysLeft <= 5) return 'bg-rose-500';
  if (daysLeft <= 15) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return dateStr;
  }
}

export default function LicenseModal({ onClose }: LicenseModalProps) {
  const { showNotification } = useAppStore();
  const [licenseInfo, setLicenseInfo] = useState<any>(null);
  const [loadingLicense, setLoadingLicense] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    if (window.licenseAPI) {
      window.licenseAPI.get().then((res: any) => {
        setLicenseInfo(res);
        setLoadingLicense(false);
      }).catch(() => {
        setLoadingLicense(false);
      });
    } else {
      setLoadingLicense(false);
    }
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9000] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-gray-850 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🔐</span>
              <h2 className="text-sm font-semibold text-white">Quản lý bản quyền</h2>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
            {loadingLicense ? (
              <div className="flex items-center gap-2 py-8 justify-center">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-400">Đang tải thông tin bản quyền...</p>
              </div>
            ) : !licenseInfo ? (
              <div className="space-y-4 py-3">
                <div className="bg-red-900/20 border border-red-500/40 rounded-xl p-4 flex gap-3 items-start">
                  <span className="text-xl mt-0.5">⚠️</span>
                  <div>
                    <p className="text-sm font-semibold text-red-300">Không tìm thấy thông tin bản quyền</p>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                      Thiết bị này chưa được kích hoạt bản quyền hoặc file bản quyền bị lỗi. Vui lòng khởi động lại ứng dụng để thực hiện đăng ký hoặc kích hoạt.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* License Info Card */}
                <div className="bg-gray-900/40 border border-gray-700/60 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Trạng thái kích hoạt</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Thông tin chi tiết về giấy phép sử dụng</p>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                      licenseInfo.status === 'active'
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-950/60 text-rose-400 border border-rose-500/20'
                    }`}>
                      {licenseInfo.status === 'active' ? 'Đang hoạt động' : 'Hết hạn'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Email đăng ký</p>
                      <p className="text-sm text-gray-200 font-medium mt-0.5">{licenseInfo.email}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Họ và tên</p>
                      <p className="text-sm text-gray-200 font-medium mt-0.5">{licenseInfo.fullName || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Số điện thoại</p>
                      <p className="text-sm text-gray-200 font-medium mt-0.5">{licenseInfo.phone || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Gói bản quyền</p>
                      <p className="text-sm text-blue-400 font-semibold mt-0.5">
                        {licenseInfo.isLifetime ? '✨ Vĩnh viễn' :
                         licenseInfo.plan === 'trial' ? 'Dùng thử 14 ngày' :
                         licenseInfo.plan === '6m' ? 'Gói 6 tháng' :
                         licenseInfo.plan === '12m' ? 'Gói 1 năm' : licenseInfo.plan}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-gray-800 pt-3">
                    <p className="text-xs text-gray-500">Khóa kích hoạt (License Key)</p>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 text-xs bg-gray-950 text-gray-300 font-mono px-3 py-2 rounded-lg border border-gray-800 tracking-wider select-all">
                        {showKey ? licenseInfo.licenseKey : maskKey(licenseInfo.licenseKey)}
                      </code>
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="p-2 text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors border border-gray-700/60"
                        title={showKey ? 'Ẩn khóa' : 'Hiện khóa'}
                      >
                        {showKey ? '👁️' : '🕶️'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress Bar & Warnings */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400 font-medium">Thời hạn sử dụng</span>
                    <span className={`font-mono font-semibold ${
                      licenseInfo.isLifetime ? 'text-emerald-400' :
                      (licenseInfo.daysLeft ?? 0) <= 5 ? 'text-rose-400 animate-pulse' :
                      (licenseInfo.daysLeft ?? 0) <= 15 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {licenseInfo.isLifetime ? 'Không giới hạn' :
                       (licenseInfo.daysLeft ?? 0) < 0 ? 'Đã hết hạn' :
                       (licenseInfo.daysLeft ?? 0) === 0 ? 'Hết hạn hôm nay' : `Còn ${licenseInfo.daysLeft} ngày`}
                    </span>
                  </div>

                  <div className="h-2.5 w-full bg-gray-950 rounded-full overflow-hidden border border-gray-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${getProgressColor(licenseInfo)}`}
                      style={{ width: `${getProgressPercentage(licenseInfo)}%` }}
                    />
                  </div>

                  {!licenseInfo.isLifetime && licenseInfo.expiryDate && (
                    <p className="text-[11px] text-gray-500">
                      Ngày hết hạn: <span className="text-gray-400 font-medium">{formatDate(licenseInfo.expiryDate)}</span>
                    </p>
                  )}
                </div>

                {/* Danger Zone */}
                <div className="border-t border-gray-800 pt-4 mt-2">
                  <p className="text-xs font-semibold text-red-400/90 mb-2">Vùng nguy hiểm</p>
                  <div className="flex items-center justify-between p-3.5 bg-red-950/10 border border-red-500/20 rounded-xl">
                    <div className="flex-1 pr-4">
                      <p className="text-xs font-medium text-gray-300">Đăng xuất bản quyền</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                        Xóa khóa kích hoạt hiện tại, toàn bộ dữ liệu cơ sở dữ liệu cục bộ và bộ nhớ cache. Sau khi đăng xuất, ứng dụng sẽ tự động đóng và mở lại cửa sổ kích hoạt bản quyền.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowLogoutModal(true)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                    >
                      Đăng xuất
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Logout confirm modal */}
      {showLogoutModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4"
          onClick={() => setShowLogoutModal(false)}
        >
          <div
            className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔐</span>
              <h3 className="text-base font-semibold text-white">Đăng xuất bản quyền</h3>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Bạn muốn xử lý dữ liệu hiện tại (tin nhắn, tài khoản chat và CRM) như thế nào sau khi đăng xuất bản quyền?
            </p>
            <div className="space-y-2.5 pt-2">
              <button
                onClick={async () => {
                  setShowLogoutModal(false);
                  try {
                    await window.licenseAPI.logout({ clearData: false });
                  } catch (err: any) {
                    showNotification('Không thể đăng xuất bản quyền: ' + err.message, 'error');
                  }
                }}
                className="w-full py-2.5 px-4 bg-gray-700 hover:bg-gray-600/80 text-gray-200 font-semibold rounded-xl border border-gray-650 transition-colors text-xs text-center"
              >
                💾 Chỉ đăng xuất (Giữ lại dữ liệu)
              </button>
              <button
                onClick={async () => {
                  setShowLogoutModal(false);
                  try {
                    await window.licenseAPI.logout({ clearData: true });
                  } catch (err: any) {
                    showNotification('Không thể đăng xuất bản quyền: ' + err.message, 'error');
                  }
                }}
                className="w-full py-2.5 px-4 bg-red-950/40 hover:bg-red-900/40 text-red-400 hover:text-red-300 font-semibold rounded-xl border border-red-500/30 transition-colors text-xs text-center"
              >
                🗑️ Đăng xuất &amp; Xóa sạch dữ liệu (Cảnh báo nguy hiểm)
              </button>
              <button
                onClick={() => setShowLogoutModal(false)}
                className="w-full py-2 px-4 bg-transparent hover:bg-gray-750 text-gray-400 hover:text-gray-300 transition-colors text-[10px] text-center"
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
