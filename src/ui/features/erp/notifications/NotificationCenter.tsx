import React, { useEffect, useState } from 'react';
import { useErpNotificationStore } from '@/store/erp/erpNotificationStore';
import { useCurrentEmployeeId, useErpPermissions } from '@/hooks/erp/useErpContext';
import { useUpdateStore, POSTPONE_MS, POSTPONE_OPTIONS } from '@/store/updateStore';

interface Props { onClose?: () => void; }

const getNotificationVisuals = (type: string, title: string) => {
  const t = title.toLowerCase();
  if (type === 'task_overdue' || t.includes('quá hạn')) {
    return {
      icon: '⚠️',
      bgColor: 'bg-red-500/10 dark:bg-red-500/20 text-red-500 dark:text-red-400',
    };
  }
  if (type === 'task_due' || t.includes('đến hạn') || t.includes('sắp')) {
    return {
      icon: '⏰',
      bgColor: 'bg-yellow-500/10 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
    };
  }
  if (type?.startsWith('task') || t.includes('task') || t.includes('công việc')) {
    return {
      icon: '📋',
      bgColor: 'bg-blue-500/10 dark:bg-blue-500/20 text-blue-500 dark:text-blue-400',
    };
  }
  return {
    icon: '🔔',
    bgColor: 'bg-gray-500/10 dark:bg-gray-500/20 text-gray-600 dark:text-gray-400',
  };
};

export default function NotificationCenter({ onClose }: Props) {
  const eid = useCurrentEmployeeId();
  const erpPerms = useErpPermissions();
  const { inbox, loadInbox, markRead, markAllRead, deleteNotifications, deleteAllNotifications } = useErpNotificationStore();
  const { status, updateInfo, progress, platform, dismissed, postpone } = useUpdateStore();
  const isMac = platform === 'darwin';
  const hasUpdate = !!updateInfo && !dismissed;
  const [postponeOpen, setPostponeOpen] = useState(false);

  useEffect(() => {
    if (erpPerms.can('erp.access')) loadInbox(eid);
  }, [eid]);

  const groups = groupByDay(inbox);
  const hasErpNotifs = erpPerms.can('erp.access') && inbox.length > 0;
  const isEmpty = !hasUpdate && !hasErpNotifs;

  const updateStatusLabel = () => {
    switch (status) {
      case 'downloaded': return { text: '✅ Đã tải xong – sẵn sàng cài đặt', color: 'text-green-600 dark:text-green-400' };
      case 'downloading': return { text: progress ? `⬇ Đang tải… ${progress.percent.toFixed(0)}%` : '⬇ Đang tải…', color: 'text-blue-600 dark:text-blue-400' };
      case 'error':
      case 'stalled':    return { text: '⚠️ Tải thất bại – nhấn để thử lại', color: 'text-red-600 dark:text-red-400' };
      default:           return { text: '🆕 Bản cập nhật sẵn sàng tải', color: 'text-yellow-600 dark:text-yellow-400' };
    }
  };

  const handleUpdateAction = () => {
    const api = (window as any).electronAPI;
    if (status === 'downloaded') {
      api?.update?.install();
    } else {
      useUpdateStore.getState().setDismissed(false);
      api?.update?.download?.();
    }
  };

  const handlePostpone = (ms: number = POSTPONE_MS) => {
    setPostponeOpen(false);
    postpone(ms);
  };

  return (
    <div className="w-80 max-h-[520px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Thông báo</span>
        <div className="flex items-center gap-2">
          {hasErpNotifs && (
            <div className="flex items-center gap-3 mr-1">
              <button
                onClick={() => markAllRead(eid)}
                className="text-xs text-blue-primary hover:text-blue-dark font-medium transition-colors"
                title="Đánh dấu tất cả đã đọc"
              >Đọc hết</button>
              <button
                onClick={() => deleteAllNotifications(eid)}
                className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
                title="Xoá tất cả thông báo"
              >Xoá hết</button>
            </div>
          )}
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all" title="Đóng">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── App update item ── */}
        {hasUpdate && updateInfo && (
          <div className="border-b border-gray-100 dark:border-gray-800 bg-blue-50/50 dark:bg-blue-950/20 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-8 h-8 flex-shrink-0 rounded-full bg-orange-500/10 dark:bg-orange-500/20 flex items-center justify-center text-base">🆕</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-gray-850 dark:text-white">Phiên bản {updateInfo.version}</span>
                  {/* Dropdown hoãn */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setPostponeOpen(v => !v)}
                      className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                      title="Hoãn"
                    >⏰ Hoãn</button>
                    {postponeOpen && (
                      <div className="absolute right-0 top-full mt-1 w-28 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl z-[10000] overflow-hidden">
                        {POSTPONE_OPTIONS.map(opt => (
                          <button
                            key={opt.ms}
                            onClick={() => handlePostpone(opt.ms)}
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-blue-600/30 transition-colors"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className={`text-[11px] mt-0.5 font-medium ${updateStatusLabel().color}`}>
                  {updateStatusLabel().text}
                </div>
                {/* Progress bar */}
                {status === 'downloading' && progress && (
                  <div className="mt-1.5 h-1 rounded-full bg-gray-150 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-1 rounded-full bg-blue-500 transition-all duration-500"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                )}
                <div className="mt-2.5 flex gap-1.5">
                  {status === 'downloaded' ? (
                    <button
                      onClick={handleUpdateAction}
                      className="flex-1 py-1 rounded-lg bg-green-600 hover:bg-green-500 text-white text-[11px] font-bold transition-colors"
                    >Khởi động lại để cập nhật</button>
                  ) : isMac ? (
                    <>
                      <a
                        href={`https://github.com/trithucnen-max/zagi-builder/releases/download/v${updateInfo.version}/Zagi%20v${updateInfo.version}%20MacOS%20M1%2B%20arm64.dmg`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-1 py-1 rounded-lg bg-blue-650 hover:bg-blue-600 text-white text-[11px] text-center font-bold transition-colors no-underline"
                      >🍎 Apple Silicon</a>
                      <a
                        href={`https://github.com/trithucnen-max/zagi-builder/releases/download/v${updateInfo.version}/Zagi%20v${updateInfo.version}%20MacOS%20Intel.dmg`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-1 py-1 rounded-lg bg-gray-150 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-250 text-[11px] text-center font-bold transition-colors no-underline border border-gray-200 dark:border-transparent"
                      >💻 Intel Mac</a>
                    </>
                  ) : (
                    <button
                      onClick={handleUpdateAction}
                      className="flex-1 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-bold transition-colors"
                    >
                      {status === 'error' || status === 'stalled' ? '🔄 Thử lại' : '⬇ Tải ngay'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ERP notifications ── */}
        {erpPerms.can('erp.access') && (
          <>
            {groups.length === 0 && !hasUpdate && (
              <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-xs">Chưa có thông báo</div>
            )}
            {groups.length === 0 && hasUpdate && (
              <div className="p-4 text-center text-gray-400 dark:text-gray-500 text-[11px]">Không có thông báo ERP</div>
            )}
            {groups.map(g => (
              <div key={g.label}>
                <div className="sticky top-0 px-4 py-1.5 text-[10px] font-bold tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50/95 dark:bg-gray-900/95 border-y border-gray-100/80 dark:border-gray-800/80 uppercase z-10">
                  {g.label}
                </div>
                {g.items.map(n => {
                  const visuals = getNotificationVisuals(n.type, n.title);
                  return (
                    <button
                      key={n.id}
                      onClick={() => !n.read && markRead([n.id])}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-white/5 flex items-start gap-3 group transition-all relative ${
                        !n.read 
                          ? 'bg-blue-50/30 dark:bg-blue-950/20' 
                          : 'opacity-70'
                      }`}
                    >
                      {/* Left Icon Container */}
                      <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-base relative ${visuals.bgColor}`}>
                        {visuals.icon}
                        {/* Blue dot indicator for unread */}
                        {!n.read && (
                          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-primary border-2 border-white dark:border-gray-900 rounded-full" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="text-xs font-semibold text-gray-850 dark:text-gray-200 truncate">{n.title}</div>
                        {n.body && <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{n.body}</div>}
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1">
                          <span>{formatTime(n.created_at)}</span>
                        </div>
                      </div>

                      {/* Hover action buttons (Mark read / Delete) */}
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all z-20">
                        {!n.read && (
                          <button
                            onClick={(e) => { e.stopPropagation(); markRead([n.id]); }}
                            className="w-6 h-6 rounded-full bg-white dark:bg-gray-800 border border-gray-250 dark:border-gray-700 flex items-center justify-center text-blue-primary hover:bg-blue-50 dark:hover:bg-blue-900/30 shadow-sm transition-all"
                            title="Đánh dấu đã đọc"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteNotifications([n.id]); }}
                          className="w-6 h-6 rounded-full bg-white dark:bg-gray-800 border border-gray-255 dark:border-gray-700 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 shadow-sm transition-all"
                          title="Xoá thông báo này"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </>
        )}

        {!erpPerms.can('erp.access') && isEmpty && (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-xs">Chưa có thông báo</div>
        )}
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} giờ trước`;
  const today = new Date(); today.setHours(0,0,0,0);
  const dDay = new Date(d); dDay.setHours(0,0,0,0);
  if (dDay.getTime() === today.getTime()) return `Hôm nay ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (dDay.getTime() === yest.getTime()) return `Hôm qua ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function groupByDay(items: any[]) {
  const out: { label: string; items: any[] }[] = [];
  const today = new Date(); today.setHours(0,0,0,0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  for (const n of items) {
    const d = new Date(n.created_at); d.setHours(0,0,0,0);
    let label: string;
    if (d.getTime() === today.getTime()) label = 'Hôm nay';
    else if (d.getTime() === yest.getTime()) label = 'Hôm qua';
    else label = d.toLocaleDateString('vi-VN');
    let grp = out.find(g => g.label === label);
    if (!grp) { grp = { label, items: [] }; out.push(grp); }
    grp.items.push(n);
  }
  return out;
}
