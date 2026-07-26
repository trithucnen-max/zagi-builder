import React, { useState, useMemo, useEffect } from 'react';
import type { CRMCampaign } from '@/store/crmStore';
import { showConfirm } from '@/components/common/ConfirmDialog';
import AppIcon from '@/components/common/AppIcon';
import ipc from '@/lib/ipc';

interface CampaignListProps {
  campaigns: CRMCampaign[];
  loading: boolean;
  activeId: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  onClone: (id: number) => void;
  onUpdateStatus: (id: number, status: string) => void;
  zaloId?: string;
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-600/30 text-gray-400',
  active: 'bg-green-500/20 text-green-400',
  paused: 'bg-yellow-500/20 text-yellow-400',
  done: 'bg-blue-500/20 text-blue-400',
};

const PAGE_SIZE = 10;

function fmtDate(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function CampaignList({
  campaigns,
  loading,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onClone,
  onUpdateStatus,
  zaloId,
}: CampaignListProps) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [page, setPage] = useState(0);

  const [safetyStats, setSafetyStats] = useState<{
    sentStrangerMessages: number;
    sentStrangerInvites: number;
  } | null>(null);

  useEffect(() => {
    if (!zaloId) {
      setSafetyStats(null);
      return;
    }
    const fetchStats = async () => {
      try {
        const res = await ipc.crm.getCampaignSafetyStats({ zaloId });
        if (res.success && res.data) {
          setSafetyStats(res.data);
        }
      } catch (err) {
        console.error('Error fetching safety stats in CampaignList:', err);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [zaloId, campaigns]);

  const filtered = useMemo(() => {
    let list = campaigns;
    if (filterStatus !== 'all') list = list.filter(c => c.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [campaigns, search, filterStatus]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const resetPage = () => setPage(0);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
      {/* Header (Matching iOS Mockup Image 1) */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{campaigns.length} chiến dịch</h2>
        <button
          onClick={onCreate}
          className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full font-bold shadow-md hover:shadow-lg transition-all active:scale-95"
        >
          <span className="text-sm font-bold">+</span>
          <span>Tạo mới</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Safety Stats Info Panel (Matching Card "Gửi hôm nay (Người lạ)") */}
        {zaloId && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs mb-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>Gửi hôm nay (Người lạ)</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-white dark:bg-gray-800/90 rounded-xl p-3 border border-gray-100 dark:border-gray-700/60 shadow-xs">
                <span className="text-[11px] text-gray-500 dark:text-gray-400 block leading-tight mb-1 font-medium">Tin nhắn</span>
                <span className="text-sm font-extrabold text-gray-900 dark:text-white">
                  {safetyStats?.sentStrangerMessages || 0} <span className="text-gray-400 font-normal text-xs">/ 50</span>
                </span>
              </div>
              <div className="bg-white dark:bg-gray-800/90 rounded-xl p-3 border border-gray-100 dark:border-gray-700/60 shadow-xs">
                <span className="text-[11px] text-gray-500 dark:text-gray-400 block leading-tight mb-1 font-medium">Kết bạn</span>
                <span className="text-sm font-extrabold text-gray-900 dark:text-white">
                  {safetyStats?.sentStrangerInvites || 0} <span className="text-gray-400 font-normal text-xs">/ 50</span>
                </span>
              </div>
            </div>
            {safetyStats && (safetyStats.sentStrangerMessages >= 50 || safetyStats.sentStrangerInvites >= 50) && (
              <p className="text-[10px] text-amber-500 mt-2 font-medium">
                ⚠️ Đã đạt hạn mức an toàn trong ngày. Hãy chuyển đổi tài khoản Zalo khác.
              </p>
            )}
          </div>
        )}

        {/* Search Bar (Pill Input) */}
        <div className="relative">
          <svg width="14" height="14" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); resetPage(); }}
            placeholder="Tìm tên chiến dịch..."
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full pl-9 pr-4 py-2.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
          />
        </div>

        {/* Status Filter Horizontal Pills (Matching Mockup Image 1) */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {(['all', 'draft', 'active', 'paused', 'done'] as const).map(s => {
            const isActive = filterStatus === s;
            return (
              <button
                key={s}
                onClick={() => { setFilterStatus(s); resetPage(); }}
                className={`text-xs px-3.5 py-1.5 rounded-full font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 shadow-xs ${
                  isActive
                    ? 'bg-blue-600 text-white border border-blue-600'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {s === 'active' && <span className="text-[10px]">▶</span>}
                {s === 'paused' && <span className="text-[10px]">⏸</span>}
                {s === 'done' && <span className="text-[10px]">✓</span>}
                <span>
                  {s === 'all' ? 'Tất cả' : s === 'draft' ? 'Nháp' : s === 'active' ? 'Đang chạy' : s === 'paused' ? 'Tạm dừng' : 'Hoàn thành'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Campaign Cards or Empty State */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          /* Empty State Illustration (Matching Mockup Image 1) */
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <div className="relative w-28 h-28 mb-4 flex items-center justify-center">
              {/* Illustration Clipboard Icon */}
              <div className="w-24 h-28 bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-400/30 rounded-2xl flex flex-col items-center justify-center p-3 shadow-inner">
                <div className="w-6 h-2.5 bg-blue-500 rounded-full mb-3" />
                <div className="w-12 h-1.5 bg-blue-300/60 rounded-full mb-2" />
                <div className="w-10 h-1.5 bg-blue-300/40 rounded-full mb-2" />
                <div className="w-8 h-1.5 bg-blue-300/30 rounded-full" />
              </div>
              <div className="absolute bottom-1 right-1 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-md">
                +
              </div>
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Chưa có chiến dịch nào</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mb-5 leading-relaxed">
              {search || filterStatus !== 'all'
                ? 'Không tìm thấy chiến dịch nào phù hợp với bộ lọc hiện tại.'
                : 'Bạn chưa tạo chiến dịch nào. Hãy tạo chiến dịch đầu tiên để bắt đầu.'}
            </p>
            <button
              onClick={onCreate}
              className="px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-transform active:scale-95 flex items-center gap-2"
            >
              <span>Tạo chiến dịch đầu tiên</span>
              <span>→</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {paged.map(c => {
              const isScheduled = c.status === 'active' && c.scheduled_start_at && c.scheduled_start_at > Date.now();
              const isSelected = activeId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`rounded-2xl border p-4 cursor-pointer transition-all shadow-xs ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 ring-2 ring-blue-500/20'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">{c.name}</h4>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {c.campaign_type === 'friend_request' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold border border-blue-500/20">
                            👤 Kết bạn
                          </span>
                        )}
                        {c.campaign_type === 'invite_to_group' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20">
                            👥 Mời nhóm
                          </span>
                        )}
                        {c.campaign_type === 'mixed' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold border border-purple-500/20">
                            🔀 Hỗn hợp
                          </span>
                        )}
                        {c.campaign_type === 'message' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20">
                            💬 Tin nhắn
                          </span>
                        )}
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          ⏱ {c.delay_seconds}s delay
                          {c.created_at ? <span>· 📅 {fmtDate(c.created_at)}</span> : null}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2.5 py-1 rounded-full font-bold flex-shrink-0 ${
                        isScheduled
                          ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20'
                          : c.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : c.status === 'paused'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          : c.status === 'done'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {isScheduled
                        ? 'Đã lên lịch'
                        : c.status === 'active'
                        ? '▶ Đang chạy'
                        : c.status === 'paused'
                        ? '⏸ Tạm dừng'
                        : c.status === 'done'
                        ? '✓ Hoàn thành'
                        : 'Nháp'}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-750 flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Tiến độ:</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      {c.sent_count} / {c.total_contacts} liên hệ
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Banner Card (Matching Mockup Image 1) */}
        <div className="mt-4 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/60 rounded-2xl p-4 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900 dark:text-white">Chọn chiến dịch</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">để xem chi tiết</p>
            </div>
          </div>
          <button
            onClick={onCreate}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <span>Tạo chiến dịch mới</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
