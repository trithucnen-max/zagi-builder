import React from 'react';
import { useAppStore } from '../../store/appStore';

/**
 * Modal dialog shown when an employee tries to access a module
 * they don't have permission for in the ERP system.
 * Extracted from App.tsx to keep the root component lean.
 */
export function ErpPermissionDialog() {
  const { erpPermissionDialog, hideErpPermissionDialog, theme } = useAppStore();

  if (!erpPermissionDialog) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={hideErpPermissionDialog}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden
          ${theme === 'light'
            ? 'bg-white border-red-200 shadow-gray-400/30'
            : 'bg-gray-900 border-gray-700 shadow-black/60'}`}
      >
        {/* Header */}
        <div className={`px-5 py-4 border-b ${theme === 'light' ? 'border-red-100 bg-red-50/80' : 'border-gray-800 bg-red-500/10'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 text-red-500 flex items-center justify-center text-xl font-bold flex-shrink-0">
                !
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                  {erpPermissionDialog.title}
                </p>
                <p className={`text-xs mt-1 ${theme === 'light' ? 'text-red-700' : 'text-red-300'}`}>
                  Hệ thống đã chặn thao tác vì tài khoản hiện tại không đủ quyền.
                </p>
              </div>
            </div>
            <button
              onClick={hideErpPermissionDialog}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors
                ${theme === 'light'
                  ? 'text-gray-400 hover:text-gray-700 hover:bg-white'
                  : 'text-gray-500 hover:text-white hover:bg-gray-800'}`}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <p className={`text-sm leading-relaxed ${theme === 'light' ? 'text-gray-700' : 'text-gray-200'}`}>
            {erpPermissionDialog.message}
          </p>
          {erpPermissionDialog.details && (
            <div className={`rounded-xl border px-3 py-2 ${theme === 'light' ? 'border-gray-200 bg-gray-50' : 'border-gray-700 bg-gray-800/80'}`}>
              <p className="text-[11px] uppercase tracking-wider mb-1 text-gray-500">Chi tiết</p>
              <p className={`text-xs break-words ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>
                {erpPermissionDialog.details}
              </p>
            </div>
          )}
          <div className="flex justify-end">
            <button
              onClick={hideErpPermissionDialog}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
