import React, { useEffect, useState } from 'react';
import { useViewStore } from '@/store/viewStore';

interface LicenseBannerState {
  show: boolean;
  type: 'grace' | 'expiring-soon' | null;
  daysLeft: number | null;
}

interface LicenseWarningBannerProps {
  /** Callback khi nhấn "Gia hạn ngay" để điều hướng sang tab License */
  onRenew?: () => void;
}

export default function LicenseWarningBanner({ onRenew }: LicenseWarningBannerProps) {
  const [state, setState] = useState<LicenseBannerState>({ show: false, type: null, daysLeft: null });
  const [dismissed, setDismissed] = useState(false);
  const { setView } = useViewStore();

  useEffect(() => {
    const checkLicenseStatus = async () => {
      try {
        const licenseAPI = (window as any).licenseAPI;
        if (!licenseAPI) return;

        const [license, inGrace, expiringSoon] = await Promise.all([
          licenseAPI.get(),
          licenseAPI.isInGracePeriod(),
          licenseAPI.isExpiringSoon(),
        ]);

        if (!license) return;

        if (inGrace) {
          setState({ show: true, type: 'grace', daysLeft: license.daysLeft ?? null });
        } else if (expiringSoon) {
          setState({ show: true, type: 'expiring-soon', daysLeft: license.daysLeft ?? null });
        } else {
          setState({ show: false, type: null, daysLeft: null });
        }
      } catch {
        // Không làm gián đoạn app nếu IPC lỗi
      }
    };

    checkLicenseStatus();
    // Kiểm tra lại mỗi 30 phút
    const interval = setInterval(checkLicenseStatus, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRenew = () => {
    setView('settings');
    // Dispatch event để Settings mở đúng tab License
    window.dispatchEvent(new CustomEvent('settings:openTab', { detail: { tab: 'license' } }));
    onRenew?.();
  };

  if (!state.show || dismissed) return null;

  const isGrace = state.type === 'grace';
  const graceRemaining = isGrace && state.daysLeft !== null
    ? Math.abs(state.daysLeft) <= 7 ? 7 - Math.abs(state.daysLeft) : 0
    : null;

  return (
    <div
      className={`
        relative flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium
        flex-shrink-0 z-50 transition-all duration-300
        ${isGrace
          ? 'bg-rose-900/90 border-b border-rose-700/60 text-rose-100'
          : 'bg-amber-900/90 border-b border-amber-700/60 text-amber-100'
        }
      `}
    >
      {/* Icon + Message */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base flex-shrink-0">
          {isGrace ? '🔴' : '⚠️'}
        </span>
        <span className="truncate">
          {isGrace ? (
            <>
              <span className="font-semibold">Bản quyền đã hết hạn</span>
              {' — Chế độ chỉ xem (Read-only).'}
              {graceRemaining !== null && graceRemaining > 0 && (
                <span className="ml-1 opacity-80">
                  Còn <span className="font-bold">{graceRemaining} ngày</span> ân hạn.
                </span>
              )}
              {graceRemaining === 0 && (
                <span className="ml-1 opacity-80 text-rose-300">Hôm nay là ngày cuối cùng!</span>
              )}
            </>
          ) : (
            <>
              <span className="font-semibold">Bản quyền sắp hết hạn</span>
              {state.daysLeft !== null && (
                <span className="ml-1 opacity-80">
                  — còn <span className="font-bold">{state.daysLeft} ngày</span>.
                </span>
              )}
            </>
          )}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleRenew}
          className={`
            px-3 py-1 rounded-md text-xs font-semibold transition-all duration-150
            ${isGrace
              ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-md'
              : 'bg-amber-500 hover:bg-amber-400 text-white shadow-md'
            }
          `}
        >
          Gia hạn ngay
        </button>
        <button
          onClick={() => setDismissed(true)}
          title="Đóng (sẽ hiện lại lần sau)"
          className="w-6 h-6 flex items-center justify-center rounded opacity-60 hover:opacity-100 transition-opacity"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="0" y1="0" x2="10" y2="10" />
            <line x1="10" y1="0" x2="0" y2="10" />
          </svg>
        </button>
      </div>
    </div>
  );
}
