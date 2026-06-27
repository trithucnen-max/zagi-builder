import React, { useState, useEffect } from 'react';
import { useEmployeeStore } from '@/store/employeeStore';
import LicenseModal from '@/components/settings/LicenseModal';

/**
 * LicenseExpiryBanner — hiện cho TẤT CẢ user khi license sắp hết hoặc đã hết hạn.
 * - Boss/standalone: thấy banner + nút "Xem chi tiết" để mở LicenseModal
 * - Employee: thấy banner cảnh báo nhưng không có nút action
 * - Lifetime license hoặc còn > 7 ngày → không render gì cả
 */
export default function LicenseExpiryBanner() {
  const empMode = useEmployeeStore(s => s.mode);
  const [licenseInfo, setLicenseInfo] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadLicense = () => {
    if (window.licenseAPI) {
      window.licenseAPI.get().then((res: any) => {
        setLicenseInfo(res);
      }).catch(() => {});
    }
  };

  useEffect(() => {
    loadLicense();
    // Refresh every hour
    const interval = setInterval(loadLicense, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!licenseInfo) return null;
  if (licenseInfo.isLifetime) return null;

  const daysLeft = licenseInfo.daysLeft ?? 0;
  const isExpired = licenseInfo.status !== 'active' || daysLeft < 0;
  const isWarning = !isExpired && daysLeft <= 7;

  if (!isExpired && !isWarning) return null;

  const isBoss = empMode !== 'employee';

  return (
    <>
      <div className={`flex items-center justify-between gap-3 px-4 py-2 text-xs font-medium flex-shrink-0 ${
        isExpired
          ? 'bg-rose-950/60 border-b border-rose-500/30 text-rose-300'
          : 'bg-amber-950/50 border-b border-amber-500/20 text-amber-300'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0">{isExpired ? '🔴' : '⚠️'}</span>
          <span className="truncate">
            {isExpired
              ? 'Bản quyền đã hết hạn — Ứng dụng có thể bị giới hạn chức năng'
              : `Bản quyền còn ${daysLeft} ngày — Vui lòng gia hạn để tránh gián đoạn`}
          </span>
        </div>
        {isBoss && (
          <button
            onClick={() => setModalOpen(true)}
            className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
              isExpired
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            Xem chi tiết
          </button>
        )}
      </div>

      {modalOpen && <LicenseModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
