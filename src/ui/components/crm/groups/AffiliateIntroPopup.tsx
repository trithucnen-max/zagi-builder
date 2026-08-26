import React from 'react';

interface Props {
  onClose: () => void;
}

export default function AffiliateIntroPopup({ onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-[520px] max-h-[85vh] shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Hero Banner ─────────────────────────────────────────────── */}
        <div className="relative bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 px-6 py-8 text-center overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/10 rounded-full" />

          <div className="relative z-10">
            <h2 className="text-xl font-bold text-white mb-1">Đồng hành cùng Zagi</h2>
            <p className="text-white/80 text-sm">Chia sẻ trải nghiệm - Xây dựng cộng đồng giá trị</p>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Intro text */}
          <div className="text-center">
            <p className="text-gray-300 text-sm leading-relaxed">
              Bạn đang sử dụng Zagi và thấy hữu ích? <span className="text-white font-semibold">Giới thiệu cho bạn bè & đồng nghiệp</span> để cùng khai thác tiềm năng bán hàng và chăm sóc khách hàng tự động trên Zalo.
            </p>
          </div>

          {/* ── Use cases ─────────────────────────────────────────────── */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Zagi giúp gì cho doanh nghiệp & người bán hàng?</h3>

            {[
              {
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ),
                title: 'Quét thành viên nhóm nâng cao',
                desc: 'Khai thác hàng nghìn khách hàng tiềm năng từ các nhóm Zalo — bao gồm cả nhóm ẩn thành viên, nhóm công khai hay nhóm chờ duyệt.',
              },
              {
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ),
                title: 'Kết nối mạng lưới khách hàng',
                desc: 'Tiếp cận tệp khách khổng lồ qua mạng lưới nhóm Zalo — tự động thêm vào chiến dịch nhắn tin, kết bạn và mời vào nhóm chăm sóc.',
              },
              {
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal-400">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                ),
                title: 'Kho nhóm chung theo 18 ngành nghề',
                desc: 'Kho nhóm Zalo sẵn có phân theo từng lĩnh vực: Bất động sản, Kinh doanh, Giáo dục, F&B, Mẹ & Bé... Tham gia và quét ngay tức thì.',
              },
              {
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                ),
                title: 'Workflow + Trợ lý AI vận hành tự động',
                desc: 'Hệ thống kịch bản Workflow tự động phản hồi tin nhắn, phân loại hội thoại, nhắc lịch hẹn và chăm sóc khách hàng 24/7.',
              },
            ].map((item, i) => (
              <div key={i} className="flex gap-3 bg-gray-700/40 rounded-xl p-3.5 border border-gray-700/50">
                <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                  {item.icon}
                </div>
                <div>
                  <p className="text-sm text-white font-semibold">{item.title}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
