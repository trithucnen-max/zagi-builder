import React from 'react';
import { useModalStore } from '../../store/modalStore';
import { useViewStore } from '../../store/viewStore';

/**
 * Renders the global toast notification (top-right corner).
 * Now supports multiple stacked toast notifications.
 */
export function GlobalNotification() {
  const { notifications, hideNotification } = useModalStore();
  const { theme } = useViewStore();

  if (notifications.length === 0) return null;

  const colorMap = {
    success: { border: '#22c55e', bg: 'bg-green-500/15', text: 'text-green-500', label: 'Thành công', icon: '✓' },
    error:   { border: '#ef4444', bg: 'bg-red-500/15',   text: 'text-red-500',   label: 'Lỗi',        icon: '✕' },
    warning: { border: '#f59e0b', bg: 'bg-amber-500/15', text: 'text-amber-500', label: 'Cảnh báo',   icon: '!' },
    info:    { border: '#3b82f6', bg: 'bg-blue-500/15',  text: 'text-blue-500',  label: 'Thông báo',  icon: 'i' },
  };

  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-[calc(100vw-3rem)] pointer-events-none">
      {notifications.map((notif) => {
        const c = colorMap[notif.type] ?? colorMap.info;
        return (
          <div
            key={notif.id}
            onClick={() => hideNotification(notif.id)}
            className={`cursor-pointer pointer-events-auto
              flex items-start gap-3 pl-4 pr-3 py-3.5 rounded-2xl shadow-2xl transition-all duration-300
              ${theme === 'light'
                ? 'bg-white border border-gray-200 shadow-gray-300/50 text-gray-800'
                : 'bg-gray-900 border border-gray-700/70 shadow-black/60 text-gray-100'
              }`}
            style={{ borderLeftWidth: 4, borderLeftStyle: 'solid', borderLeftColor: c.border }}
          >
            {/* Icon */}
            <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mt-0.5 ${c.bg} ${c.text}`}>
              {c.icon}
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0 pt-0.5">
              <p className={`text-[10px] font-semibold uppercase tracking-widest mb-0.5 ${c.text}`}>
                {c.label}
              </p>
              <p className={`text-sm leading-snug font-medium break-words ${theme === 'light' ? 'text-gray-800' : 'text-gray-100'}`}>
                {notif.message}
              </p>
            </div>

            {/* Close */}
            <button
              onClick={(e) => { e.stopPropagation(); hideNotification(notif.id); }}
              className={`flex-shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center rounded-full transition-colors
                ${theme === 'light'
                  ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/60'}`}
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
                <path d="M6.06 5l2.47-2.47A.75.75 0 007.47 1.47L5 3.94 2.53 1.47A.75.75 0 001.47 2.53L3.94 5 1.47 7.47a.75.75 0 001.06 1.06L5 6.06l2.47 2.47a.75.75 0 001.06-1.06L6.06 5z"/>
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
