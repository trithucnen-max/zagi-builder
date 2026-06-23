import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useUpdateStore, UpdateInfo, ProgressInfo, UpdateError, POSTPONE_MS, POSTPONE_OPTIONS } from '@/store/updateStore';

const AUTO_RESTART_SECS = 120;   // đếm ngược 2 phút trước khi tự restart
const DOWNLOAD_STALL_TIMEOUT_MS = 45_000; // 45s không progress → coi như treo (macOS)

export function UpdateNotification() {
  const {
    status, updateInfo, progress, error, dismissed, postponedUntil, platform,
    setStatus, setUpdateInfo, setProgress, setError, setDismissed, setPostponedUntil, postpone,
  } = useUpdateStore();

  const [countdown, setCountdown] = useState(AUTO_RESTART_SECS);
  const [postponeOpen, setPostponeOpen] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const postponeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLight = useAppStore(s => s.theme) === 'light';
  const isMac = platform === 'darwin';

  // Bắt đầu đếm ngược khi đã tải xong
  const startCountdown = useCallback(() => {
    setCountdown(AUTO_RESTART_SECS);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          (window as any).electronAPI?.update?.install();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Hoãn với duration tuỳ chọn
  const handlePostpone = useCallback((ms: number = POSTPONE_MS) => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setPostponeOpen(false);
    postpone(ms);
  }, [postpone]);

  // Watch postponedUntil — khi nó được set, đặt timer để re-show sau đúng thời điểm
  useEffect(() => {
    if (!postponedUntil) return;
    if (postponeTimerRef.current) clearTimeout(postponeTimerRef.current);
    const remaining = postponedUntil - Date.now();
    if (remaining <= 0) {
      setDismissed(false);
      setPostponedUntil(null);
      return;
    }
    postponeTimerRef.current = setTimeout(() => {
      setDismissed(false);
      setPostponedUntil(null);
      if (useUpdateStore.getState().status === 'downloaded') startCountdown();
    }, remaining);
    return () => { if (postponeTimerRef.current) clearTimeout(postponeTimerRef.current); };
  }, [postponedUntil, setDismissed, setPostponedUntil, startCountdown]);

  // Retry download thủ công
  const handleRetryDownload = useCallback(() => {
    setError(null);
    setStatus('downloading');
    setProgress(null);
    (window as any).electronAPI?.update?.download();
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    stallTimerRef.current = setTimeout(() => {
      setStatus('stalled');
    }, DOWNLOAD_STALL_TIMEOUT_MS);
  }, [setError, setStatus, setProgress]);

  // Stall timer helper
  const resetStallTimer = useCallback(() => {
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    stallTimerRef.current = setTimeout(() => {
      setStatus('stalled');
    }, DOWNLOAD_STALL_TIMEOUT_MS);
  }, [setStatus]);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.on) return;

    const offAvailable = api.on('update:available', (info: UpdateInfo) => {
      setUpdateInfo(info);
      setDismissed(false);
      setError(null);
      setStatus('available');
      resetStallTimer();
    });

    const offProgress = api.on('update:progress', (p: ProgressInfo) => {
      setStatus('downloading');
      setProgress(p);
      resetStallTimer();
    });

    const offDownloaded = api.on('update:downloaded', (info: UpdateInfo) => {
      setStatus('downloaded');
      setUpdateInfo(info);
      setError(null);
      setProgress(null);
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      startCountdown();
    });

    const offError = api.on('update:error', (err: UpdateError) => {
      setError(err);
      setStatus('error');
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    });

    return () => {
      offAvailable?.();
      offProgress?.();
      offDownloaded?.();
      offError?.();
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    };
  }, [startCountdown, resetStallTimer, setStatus, setUpdateInfo, setProgress, setError, setDismissed]);

  return null;
}

/** macOS: hiện 2 link tải DMG (ARM64 / Intel) */
export function MacDownloadLinks({ version, isLight }: { version: string; isLight: boolean }) {
  const baseUrl = 'https://zagiapp.com/file';
  return (
    <div className="flex-1 flex flex-col gap-1">
      <a
        href={`${baseUrl}/Zagi-${version}-arm64.dmg`}
        target="_blank"
        rel="noopener noreferrer"
        className={`text-xs font-semibold py-1 rounded-lg text-center transition-colors ${
          isLight
            ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            : 'bg-white/10 hover:bg-white/20 text-white'
        }`}
      >
        🍎 Apple Silicon
      </a>
      <a
        href={`${baseUrl}/Zagi-${version}.dmg`}
        target="_blank"
        rel="noopener noreferrer"
        className={`text-xs font-semibold py-1 rounded-lg text-center transition-colors ${
          isLight
            ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            : 'bg-white/10 hover:bg-white/20 text-white'
        }`}
      >
        💻 Intel Mac
      </a>
    </div>
  );
}
