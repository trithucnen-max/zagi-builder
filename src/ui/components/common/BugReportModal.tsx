import React, { useState } from 'react';
import { useAppStore } from '@/store/appStore';

export function BugReportModal() {
  const { bugReportOpen, setBugReportOpen } = useAppStore();
  const [loading, setLoading] = useState(true);

  if (!bugReportOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl h-[85vh] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-800 bg-gray-900">
          <div className="flex items-center gap-2">
            <span className="text-lg">🐛</span>
            <h3 className="text-sm font-semibold text-white text-center">Báo cáo lỗi & Góp ý ý kiến</h3>
          </div>
          <button
            onClick={() => setBugReportOpen(false)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            title="Đóng"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content/Iframe */}
        <div className="flex-1 w-full bg-white relative">
          {loading && (
            <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs text-gray-400">Đang tải form báo lỗi...</span>
            </div>
          )}
          <iframe
            src="https://tlavietnam.sg.larksuite.com/share/base/form/shrlgxzOCTqFepNvhl8wms2vpWg"
            className="w-full h-full border-0"
            onLoad={() => setLoading(false)}
            title="Bug Report Form"
          />
        </div>
      </div>
    </div>
  );
}
