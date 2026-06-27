import React, { useState, useEffect, useCallback, useRef } from 'react';
import ipc from '@/lib/ipc';

const BUG_REPORT_URL = 'https://tlavietnam.sg.larksuite.com/share/base/form/shrlgxzOCTqFepNvhl8wms2vpWg';
import { useAppStore, FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_STEP } from '@/store/appStore';
import { useAccountStore } from '@/store/accountStore';
import { useUpdateStore } from '@/store/updateStore';
import { useEmployeeStore } from '@/store/employeeStore';
import { useChatStore } from '@/store/chatStore';
import WorkspaceSwitcher from '@/components/common/WorkspaceSwitcher';
import { useErpNotificationStore } from '@/store/erp/erpNotificationStore';
import { useErpEmployeeStore } from '@/store/erp/erpEmployeeStore';
import { useCurrentEmployeeId, useErpPermissions } from '@/hooks/erp/useErpContext';
import NotificationCenter from '@/features/erp/notifications/NotificationCenter';
import AppIcon from '@/components/common/AppIcon';


const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?';

/** Map scale factor to px value for display */
const scaleToPx = (s: number) => Math.round(16 * s);

export default function TopBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const { theme, setTheme, showNotification, fontSizeScale, setFontSizeScale, setView } = useAppStore();
  const { activeAccountId } = useAccountStore();
  const [loadingOldMsgs, setLoadingOldMsgs] = useState(false);
  const [lockScreenEnabled, setLockScreenEnabled] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const activeAccount = useAccountStore((s) => s.accounts.find(a => a.zalo_id === s.activeAccountId));
  const isBusiness = activeAccount?.is_business === 1;

  // Font size slider: local temp value, only applies on release
  const [fontTemp, setFontTemp] = useState(fontSizeScale);

  // Sync fontTemp when fontSizeScale changes externally
  useEffect(() => {
    setFontTemp(fontSizeScale);
  }, [fontSizeScale]);

  // Update state
  const { status: updateStatus, updateInfo, platform, setDismissed } = useUpdateStore();
  const isMac = platform === 'darwin';
  const [macDropdownOpen, setMacDropdownOpen] = useState(false);
  const macDropdownRef = useRef<HTMLDivElement>(null);

  // Employee store
  const { mode: empMode, currentEmployee, bossConnected, previewEmployeeId, employees } = useEmployeeStore();
  const previewEmployee = previewEmployeeId ? employees.find((e: any) => e.employee_id === previewEmployeeId) : null;

  // ERP notifications + attendance
  const erpPerms = useErpPermissions();
  const erpEid = useCurrentEmployeeId();
  const { unreadCount, loadUnreadCount } = useErpNotificationStore();
  const { loadTodayAttendance } = useErpEmployeeStore();
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!erpPerms.can('erp.access')) return;
    loadUnreadCount(erpEid);
    loadTodayAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [erpEid]);

  useEffect(() => {
    if (!ipc.on) return;
    const unsub = ipc.on('erp:event:notification', () => loadUnreadCount(erpEid));
    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [erpEid]);

  useEffect(() => {
    if (!bellOpen) return;
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [bellOpen]);



  // Hiện nút update khi: có bản mới + (chưa tải xong HOẶC lỗi/treo)
  const showUpdateBtn = !!updateInfo && ['available', 'error', 'stalled', 'downloading'].includes(updateStatus);

  useEffect(() => {
    ipc.window?.isMaximized().then(setIsMaximized);
  }, []);

  // Check lock screen status
  useEffect(() => {
    ipc.lockScreen?.status().then(res => {
      if (res?.success && res.enabled) setLockScreenEnabled(true);
    });
  }, []);

  // Đóng macOS dropdown khi click ra ngoài
  useEffect(() => {
    if (!macDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (macDropdownRef.current && !macDropdownRef.current.contains(e.target as Node)) {
        setMacDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [macDropdownOpen]);

  // ── Tải tin nhắn cũ / đồng bộ lại hội thoại ────────────────────────────────
  const handleRequestOldMessages = useCallback(async () => {
    if (!activeAccountId || loadingOldMsgs) return;

    // Detect channel of active account
    const activeAccount = useAccountStore.getState().accounts.find(a => a.zalo_id === activeAccountId);
    const channel = activeAccount?.channel || 'zalo';

    setLoadingOldMsgs(true);
    try {
      if (channel === 'facebook') {
        // Facebook: force-refresh threads + reload contacts into store
        showNotification('Đang đồng bộ hội thoại Facebook...', 'success');
        const res = await ipc.fb?.getThreads({ accountId: activeAccountId, forceRefresh: true });
        if (res?.success) {
          const count = res.threads?.length ?? 0;
          // Reload contacts from DB into chat store
          try {
            const contactsRes = await ipc.db?.getContacts(activeAccountId);
            const contacts = contactsRes?.contacts ?? contactsRes ?? [];
            if (contacts.length > 0) {
              useChatStore.getState().setContacts(activeAccountId, contacts);
            }
          } catch {}
          // Refresh avatar cho active thread nếu là 1-1 Facebook
          const chatState = useChatStore.getState();
          const activeThreadId = chatState.activeThreadId;
          const activeThreadType = chatState.activeThreadType;
          if (activeThreadId && activeThreadType !== 1 && /^\d+$/.test(activeThreadId)) {
            ipc.fb.refreshContactAvatar({ accountId: activeAccountId, userId: activeThreadId })
              .then(refreshRes => {
                if (refreshRes.success && refreshRes.avatarUrl) {
                  useChatStore.getState().updateContact(activeAccountId, {
                    contact_id: activeThreadId,
                    avatar_url: refreshRes.avatarUrl,
                  });
                }
              }).catch(() => {});
          }
          showNotification(`Đã đồng bộ ${count} hội thoại Facebook`, 'success');
        } else {
          showNotification(res?.error || 'Không thể đồng bộ hội thoại Facebook', 'error');
        }
      } else {
        // Zalo: request old messages as before
        const res = await ipc.login?.requestOldMessages(activeAccountId);
        if (res?.success) {
          showNotification('Đang tải tin nhắn cũ… Tin nhắn sẽ xuất hiện dần.', 'success');
        } else {
          showNotification(res?.error || 'Không thể tải tin nhắn cũ', 'error');
        }
      }
    } catch (e: any) {
      showNotification('Lỗi: ' + (e.message || 'Không thể tải'), 'error');
    } finally {
      setLoadingOldMsgs(false);
    }
  }, [activeAccountId, loadingOldMsgs, showNotification]);

  // Xử lý click nút update
  const handleUpdateClick = useCallback(() => {
    if (!updateInfo) return;
    if (isMac) {
      const arch = (window as any).electronAPI?.arch || 'x64';
      const url = arch === 'arm64'
        ? `https://github.com/trithucnen-max/zagi-builder/releases/download/v${updateInfo.version}/Zagi-${updateInfo.version}-arm64.dmg`
        : `https://github.com/trithucnen-max/zagi-builder/releases/download/v${updateInfo.version}/Zagi-${updateInfo.version}.dmg`;
      (window as any).electronAPI?.shell?.openExternal(url);
    } else if (platform === 'linux') {
      const url = `https://github.com/trithucnen-max/zagi-builder/releases/download/v${updateInfo.version}/zagi_${updateInfo.version}_amd64.deb`;
      (window as any).electronAPI?.shell?.openExternal(url);
    } else {
      // Windows: trigger auto-update download
      setDismissed(false);
      if (updateStatus === 'error' || updateStatus === 'stalled' || updateStatus === 'available') {
        (window as any).electronAPI?.update?.download();
      }
    }
  }, [isMac, platform, updateInfo, updateStatus, setDismissed]);

  return (
    <div
      className="flex items-center justify-between h-9 bg-gray-900 border-b border-gray-700 flex-shrink-0 relative"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      {/* Center title */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none">
        <span className="text-blue-400 font-bold text-sm">Zagi</span>
        <span className="text-gray-500 text-[11px]">v{APP_VERSION}</span>
      </div>
      <div className="flex items-center gap-2 px-3 ml-16" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Workspace switcher — only shows when multiple workspaces exist */}
        <WorkspaceSwitcher />

        {/* Employee mode indicator */}
        {empMode === 'employee' && currentEmployee && (
          <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-gray-800 border border-gray-600">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${bossConnected ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
            <span className="text-[11px] text-gray-300">{bossConnected ? 'Connected' : 'Disconnected'}</span>
            <span className="text-[11px] text-gray-300">- {currentEmployee.display_name}</span>
          </div>
        )}

        {/* Boss preview mode indicator */}
        {empMode !== 'employee' && previewEmployee && (
          <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-amber-900/40 border border-amber-600/40">
            <span className="text-[11px] text-amber-300">👁 Đang xem: {previewEmployee.display_name}</span>
          </div>
        )}
      </div>

      {/* Window controls */}
      <div
        className="flex items-center"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >


        {/* Tải tin nhắn cũ (toàn phiên đăng nhập) — ẩn với nhân viên */}
        {activeAccountId && empMode !== 'employee' && (
          <button
            onClick={handleRequestOldMessages}
            disabled={loadingOldMsgs}
            className={`w-9 h-9 flex items-center justify-center transition-colors ${loadingOldMsgs ? 'text-blue-400 bg-gray-700' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
            title={(() => {
              const acc = useAccountStore.getState().accounts.find(a => a.zalo_id === activeAccountId);
              return (acc?.channel || 'zalo') === 'facebook'
                ? 'Đồng bộ lại hội thoại Facebook'
                : 'Tải tin nhắn cũ Zalo (theo phiên đăng nhập)';
            })()}
          >
            {loadingOldMsgs ? (
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
              </svg>
            )}
          </button>
        )}

        {/* ── Nút cập nhật ── */}
        {showUpdateBtn && (
          <div className="relative" ref={macDropdownRef}>
            <button
              onClick={handleUpdateClick}
              className="w-9 h-9 flex items-center justify-center text-orange-400 hover:bg-orange-500/20 hover:text-orange-300 transition-colors relative"
              title={`Cập nhật v${updateInfo!.version} — Nhấn để tải và cập nhật`}
            >
              {/* Arrow-down-circle icon */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v13M5 12l7 7 7-7"/>
                <line x1="3" y1="22" x2="21" y2="22"/>
              </svg>
              {/* Chấm đỏ nhỏ */}
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            </button>
          </div>
        )}

        {/*/!* ── ERP Attendance quick check-in ── *!/*/}
        {/*{erpPerms.can('attendance.checkin') && (*/}
        {/*  <button*/}
        {/*    onClick={async () => {*/}
        {/*      if (!todayAttendance?.check_in_at) await checkIn();*/}
        {/*      else if (!todayAttendance?.check_out_at) await checkOut();*/}
        {/*      else showNotification('Đã chấm công đầy đủ hôm nay', 'success');*/}
        {/*    }}*/}
        {/*    className={`w-9 h-9 flex items-center justify-center transition-colors ${*/}
        {/*      todayAttendance?.check_out_at ? 'text-green-500' :*/}
        {/*      todayAttendance?.check_in_at ? 'text-blue-400 hover:bg-gray-700' :*/}
        {/*      'text-gray-400 hover:bg-gray-700 hover:text-white'*/}
        {/*    }`}*/}
        {/*    title={*/}
        {/*      todayAttendance?.check_out_at ? 'Đã check-out hôm nay' :*/}
        {/*      todayAttendance?.check_in_at ? 'Check-out' : 'Check-in'*/}
        {/*    }*/}
        {/*  >*/}
        {/*    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">*/}
        {/*      <circle cx="12" cy="12" r="9" />*/}
        {/*      <polyline points="12 7 12 12 15 14" />*/}
        {/*    </svg>*/}
        {/*  </button>*/}
        {/*)}*/}

        {/* ── ERP Notifications bell ── */}
        {erpPerms.can('erp.access') && (
          <div className="relative" ref={bellRef}>
            <button
              onClick={() => setBellOpen(v => !v)}
              className="w-9 h-9 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-white transition-colors relative"
              title="Thông báo ERP"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[14px] h-3.5 px-1 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {bellOpen && (
              <div className="absolute right-0 top-full mt-1 z-[9999]">
                <NotificationCenter onClose={() => setBellOpen(false)} />
              </div>
            )}
          </div>
        )}

        {/* Báo lỗi button */}
        <button
          onClick={() => ipc.shell?.openExternal(BUG_REPORT_URL)}
          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-red-400 transition-colors"
          title="🐛 Báo lỗi — Gửi phản hồi & báo cáo lỗi"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/>
            <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z"/>
            <path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M6 17H2M18 13h4M17.47 9c1.93-.2 3.53-1.9 3.53-4M18 17h4"/>
          </svg>
        </button>



        {/* Lock screen button — always visible */}
        <button
          onClick={async () => {
            const status = await ipc.lockScreen?.status();
            if (status?.success && status.enabled) {
              window.dispatchEvent(new CustomEvent('lockScreen:lock'));
            } else {
              showNotification('Vui lòng thiết lập mật khẩu khóa màn hình trong Cài đặt trước.', 'info');
              setView('settings');
            }
          }}
          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-amber-400 transition-colors"
          title="Khoá ứng dụng (Ctrl+Shift+L)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </button>

        {/* Shortcuts guide button */}
        <button
          onClick={() => setShortcutsOpen(true)}
          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-blue-400 transition-colors font-semibold"
          title="Hướng dẫn phím tắt (?)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </button>

        {/* Theme toggle */}
        <button
          onClick={() => {
            const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
            setTheme(nextTheme);
          }}
          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          title={
            theme === 'dark'
              ? 'Chuyển sang giao diện sáng'
              : theme === 'light'
              ? 'Chuyển sang giao diện hệ thống'
              : 'Chuyển sang giao diện tối'
          }
        >
          {theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : theme === 'light' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

        {/* Font size controller */}
        <div className="flex items-center gap-1.5 px-2 py-1 h-7 bg-gray-800/50 border border-gray-700/50 rounded-lg mr-1 select-none">
          <span className="text-[10px] text-gray-500 font-bold">A-</span>
          <input
            type="range"
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={FONT_SCALE_STEP}
            value={fontTemp}
            onChange={(e) => setFontTemp(Number(e.target.value))}
            onMouseUp={() => setFontSizeScale(fontTemp)}
            onTouchEnd={() => setFontSizeScale(fontTemp)}
            className="w-16 h-1 rounded-full appearance-none cursor-pointer bg-gray-700 accent-blue-500 hover:bg-gray-600 transition-colors
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500
              [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-gray-800
              [&::-webkit-slider-thumb]:shadow-sm"
            title={`Cỡ chữ: ${scaleToPx(fontTemp)}px`}
          />
          <span className="text-xs text-gray-400 font-bold">A+</span>
          <span className="text-[10px] text-gray-400 font-medium min-w-[24px] text-right">
            {scaleToPx(fontTemp)}px
          </span>
        </div>

        {/* Hướng dẫn sử dụng */}
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('nav:view', { detail: { view: 'settings' } }));
            setTimeout(() => window.dispatchEvent(new CustomEvent('nav:settings', { detail: { tab: 'introduction', subtab: 'overview' } })), 80);
          }}
          className="w-9 h-9 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-blue-400 transition-colors mr-1"
          title="Hướng dẫn sử dụng"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </button>

        {!isMac && (
          <>
            <button
              onClick={() => ipc.window?.minimize()}
              className="w-9 h-9 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
              title="Thu nhỏ"
            >
              <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
                <rect width="10" height="1" />
              </svg>
            </button>
            <button
              onClick={() => {
                ipc.window?.maximize();
                setIsMaximized(!isMaximized);
              }}
              className="w-9 h-9 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
              title={isMaximized ? 'Phục hồi' : 'Phóng to'}
            >
              {isMaximized ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="2" y="0" width="8" height="8" />
                  <rect x="0" y="2" width="8" height="8" fill="none" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="0" y="0" width="10" height="10" />
                </svg>
              )}
            </button>
            <button
              onClick={() => ipc.window?.close()}
              className="w-9 h-9 flex items-center justify-center text-gray-400 hover:bg-red-600 hover:text-white transition-colors"
              title="Đóng"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                <line x1="0" y1="0" x2="10" y2="10" />
                <line x1="10" y1="0" x2="0" y2="10" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Shortcuts Guide Modal */}
      {shortcutsOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]" onClick={() => setShortcutsOpen(false)}>
          <div className="bg-gray-800 border border-gray-600 rounded-2xl w-[420px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <h3 className="font-semibold text-white">Phím tắt ứng dụng</h3>
              <button onClick={() => setShortcutsOpen(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-5 space-y-4 text-sm text-gray-300">
              <div className="flex items-center justify-between">
                <span>Khóa màn hình</span>
                <kbd className="px-2 py-1 bg-gray-750 border border-gray-600 rounded text-xs text-white font-mono">Ctrl + Shift + L</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Mở nhanh Chat</span>
                <kbd className="px-2 py-1 bg-gray-750 border border-gray-600 rounded text-xs text-white font-mono">Ctrl + Shift + N</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Chuyển đổi tài khoản Zalo</span>
                <kbd className="px-2 py-1 bg-gray-750 border border-gray-600 rounded text-xs text-white font-mono">Ctrl + Tab</kbd>
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-gray-700 flex justify-end">
              <button onClick={() => setShortcutsOpen(false)} className="px-4 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs font-semibold text-white transition-colors">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

