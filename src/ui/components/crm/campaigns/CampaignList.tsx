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
  onEdit?: (campaign: CRMCampaign) => void;
  onCopyToAccounts?: (campaign: CRMCampaign) => void;
  zaloId?: string;
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
  onEdit,
  onCopyToAccounts,
  zaloId,
}: CampaignListProps) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [pageSize, setPageSize] = useState<number>(10);
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

  // Counts by status
  const counts = useMemo(() => {
    const res = { all: campaigns.length, active: 0, paused: 0, draft: 0, done: 0 };
    campaigns.forEach(c => {
      if (c.status === 'active') res.active++;
      else if (c.status === 'paused') res.paused++;
      else if (c.status === 'draft') res.draft++;
      else if (c.status === 'done') res.done++;
    });
    return res;
  }, [campaigns]);

  const filtered = useMemo(() => {
    let list = campaigns;
    if (filterStatus !== 'all') list = list.filter(c => c.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [campaigns, search, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const resetPage = () => setPage(0);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-800">
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* ── Top Card: Gửi Hôm Nay (Định Mức 50) ── */}
        <div className="bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-2xl p-3.5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 font-bold text-xs text-gray-800 dark:text-gray-200">
              <span className="text-amber-500 text-sm">🛡️</span>
              <span>Gửi hôm nay <span className="text-gray-400 font-medium text-[11px]">(Định mức 50)</span></span>
            </div>
            <button title="Chính sách gửi tin an toàn Zalo" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs">
              ⓘ
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Box 1: Đã gửi tin */}
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-2.5 border border-gray-100 dark:border-gray-700/50">
              <div className="flex items-center justify-center gap-1.5 mb-1.5">
                <span className="w-5 h-5 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center text-[10px]">👥</span>
                <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Đã gửi tin</span>
              </div>
              <div className="text-sm font-black text-gray-900 dark:text-white mb-1.5 text-center">
                <span className="text-amber-500 font-extrabold">{safetyStats?.sentStrangerMessages || 0}</span>
                <span className="text-gray-400 font-normal text-xs"> / 50</span>
              </div>
              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, ((safetyStats?.sentStrangerMessages || 0) / 50) * 100)}%` }}
                />
              </div>
            </div>

            {/* Box 2: Đã kết bạn */}
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-2.5 border border-gray-100 dark:border-gray-700/50">
              <div className="flex items-center justify-center gap-1.5 mb-1.5">
                <span className="w-5 h-5 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-[10px]">👤</span>
                <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Đã kết bạn</span>
              </div>
              <div className="text-sm font-black text-gray-900 dark:text-white mb-1.5 text-center">
                <span className="text-emerald-500 font-extrabold">{safetyStats?.sentStrangerInvites || 0}</span>
                <span className="text-gray-400 font-normal text-xs"> / 50</span>
              </div>
              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, ((safetyStats?.sentStrangerInvites || 0) / 50) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Section Title & + Tạo Mới Button ── */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-gray-900 dark:text-white">Chiến dịch</h2>
          <button
            onClick={onCreate}
            className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl font-bold shadow-xs hover:shadow-md transition-all active:scale-95"
          >
            <span className="text-sm font-bold">+</span>
            <span>Tạo mới</span>
          </button>
        </div>

        {/* ── Search Input (Full width, filter icon removed) ── */}
        <div className="relative">
          <svg width="14" height="14" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); resetPage(); }}
            placeholder="Tìm kiếm chiến dịch..."
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* ── Status Filter Pills (Horizontal Scroll) ── */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { key: 'all', label: 'Tất cả', count: counts.all },
            { key: 'active', label: 'Đang chạy', count: counts.active },
            { key: 'paused', label: 'Tạm dừng', count: counts.paused },
            { key: 'draft', label: 'Nháp', count: counts.draft },
            { key: 'done', label: 'Hoàn thành', count: counts.done },
          ].map(tab => {
            const isActive = filterStatus === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setFilterStatus(tab.key); resetPage(); }}
                className={`text-[11px] px-2.5 py-1 rounded-full font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Campaign Items List ── */}
        {loading ? (
          <div className="space-y-2.5">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 px-3">
            <p className="text-xs text-gray-400">Không tìm thấy chiến dịch nào</p>
          </div>
        ) : (
          <div className="space-y-2">
            {paged.map((c) => {
              const isSelected = activeId === c.id;
              const progressPercent = c.total_contacts > 0 ? Math.min(100, Math.round((c.sent_count / c.total_contacts) * 100)) : 0;

              return (
                <div
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`group relative rounded-xl border p-2.5 cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 shadow-2xs ring-1 ring-blue-500/30'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-850 hover:border-blue-300 dark:hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    {/* Left: Status Indicator Icon (Far left) + Campaign Name (No STT) */}
                    <div className="flex items-center gap-2 flex-1 min-w-0 pr-1">
                      {/* Status Indicator Icon (Visual status display on the far left) */}
                      <div
                        title={`Trạng thái: ${c.status === 'active' ? 'Đang chạy' : c.status === 'paused' ? 'Tạm dừng' : c.status === 'done' ? 'Hoàn thành' : 'Nháp'}`}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          c.status === 'active'
                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                            : c.status === 'paused'
                            ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                            : c.status === 'done'
                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                            : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                        }`}
                      >
                        {c.status === 'active' ? (
                          <AppIcon name="play" size={11} className="fill-current" />
                        ) : c.status === 'paused' ? (
                          <AppIcon name="pause" size={11} className="fill-current" />
                        ) : c.status === 'done' ? (
                          <span className="text-[11px] font-black leading-none">✓</span>
                        ) : (
                          <AppIcon name="file" size={11} />
                        )}
                      </div>

                      <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate flex-1" title={c.name}>
                        {c.name}
                      </h4>
                    </div>

                    {/* Right: Clickable Buttons (Copy in account, Copy to other accounts, Delete) */}
                    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      {/* Clickable Action 1: Copy / Clone in current account */}
                      <button
                        onClick={() => onClone(c.id)}
                        title="Sao chép trong tài khoản này"
                        className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-750 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/40 flex items-center justify-center transition-colors"
                      >
                        <AppIcon name="copy" size={11} />
                      </button>

                      {/* Clickable Action 2: Copy to other Zalo accounts */}
                      {onCopyToAccounts && (
                        <button
                          onClick={() => onCopyToAccounts(c)}
                          title="Sao chép kịch bản sang Zalo khác"
                          className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-750 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/40 flex items-center justify-center transition-colors text-[11px]"
                        >
                          📋
                        </button>
                      )}

                      {/* Clickable Action 3: Delete */}
                      <button
                        onClick={async () => {
                          const ok = await showConfirm(`Bạn có chắc chắn muốn xóa chiến dịch "${c.name}"?`);
                          if (ok) onDelete(c.id);
                        }}
                        title="Xóa chiến dịch"
                        className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-750 text-gray-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/40 flex items-center justify-center transition-colors"
                      >
                        <AppIcon name="trash" size={11} />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar & Fraction */}
                  <div className="flex items-center gap-2 pl-6">
                    <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          c.status === 'done' ? 'bg-blue-600' : c.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 tabular-nums">
                      {c.sent_count} / {c.total_contacts}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Left Sidebar Footer Pagination ── */}
      <div className="px-4 py-3 bg-white dark:bg-gray-850 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 h-[52px] flex-shrink-0">
        <div className="flex items-center gap-1">
          <span>Hiển thị</span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
            className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-1.5 py-0.5 text-xs text-gray-800 dark:text-gray-200 focus:outline-none"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          <span>/ trang</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            className="w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            ‹
          </button>
          <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white font-bold text-xs">
            {page + 1}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            className="w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
