import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { CRMCampaign } from '@/store/crmStore';
import { showConfirm } from '@/components/common/ConfirmDialog';
import AppIcon from '@/components/common/AppIcon';
import ipc from '@/lib/ipc';
import AccountQuotaModal from './AccountQuotaModal';

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
  queueStatus?: { running: boolean; dailyPaused?: boolean; type?: string; tokens: number; maxTokens?: number; lastSentAt: number };
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
  queueStatus,
}: CampaignListProps) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState(0);

  const [safetyStats, setSafetyStats] = useState<{
    sentStrangerMessages: number;
    sentStrangerInvites: number;
    msgLimit: number;
    inviteLimit: number;
  } | null>(null);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [showPolicyGuide, setShowPolicyGuide] = useState(false);

  useEffect(() => {
    if (!zaloId) {
      setSafetyStats(null);
      return;
    }
    const fetchStats = async () => {
      try {
        const res = await ipc.crm.getCampaignSafetyStats({ zaloId });
        if (res.success && res.data) {
          setSafetyStats({
            sentStrangerMessages: res.data.sentStrangerMessages,
            sentStrangerInvites: res.data.sentStrangerInvites,
            msgLimit: res.data.msgLimit ?? 50,
            inviteLimit: res.data.inviteLimit ?? 50,
          });
        }
      } catch (err) {
        console.error('Error fetching safety stats in CampaignList:', err);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [zaloId, campaigns]);

  const handleQuotaSaved = useCallback(() => {
    // Re-fetch stats sau khi lưu định mức mới
    if (!zaloId) return;
    ipc.crm.getCampaignSafetyStats({ zaloId }).then(res => {
      if (res.success && res.data) {
        setSafetyStats({
          sentStrangerMessages: res.data.sentStrangerMessages,
          sentStrangerInvites: res.data.sentStrangerInvites,
          msgLimit: res.data.msgLimit ?? 50,
          inviteLimit: res.data.inviteLimit ?? 50,
        });
      }
    }).catch(() => {});
  }, [zaloId]);

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
    <>
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-800">
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* ── Top Card: Gửi Hôm Nay (Định Mức 50) ── */}
        <div className="bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-2xl p-3.5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 font-bold text-xs text-gray-800 dark:text-gray-200">
              <span className="text-amber-500 text-sm">🛡️</span>
              <span>Gửi hôm nay <span className="text-gray-400 font-medium text-[11px]">(Định mức an toàn)</span></span>
            </div>
            <div className="flex items-center gap-1.5">
              {zaloId && (
                <button
                  title="Cài đặt định mức an toàn riêng cho nick Zalo này"
                  onClick={() => setShowQuotaModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-amber-500/15 to-orange-500/15 hover:from-amber-500/25 hover:to-orange-500/25 border border-amber-500/30 dark:border-amber-500/40 rounded-xl text-[11px] font-bold text-amber-800 dark:text-amber-300 transition-all hover:scale-105 active:scale-95 shadow-xs"
                >
                  <span className="text-xs">⚙️</span>
                  <span>Cài định mức</span>
                </button>
              )}
              <button
                title="Hướng dẫn & Chính sách an toàn Zalo"
                onClick={() => setShowPolicyGuide(true)}
                className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 text-xs font-bold transition-colors"
              >
                ⓘ
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Box 1: Đã gửi tin */}
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-2.5 border border-gray-100 dark:border-gray-700/50">
              <div className="flex items-center justify-center gap-1.5 mb-1.5">
                <span className="w-5 h-5 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center text-[10px]">👥</span>
                <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Đã gửi tin</span>
              </div>
              <div className="text-sm font-black text-gray-900 dark:text-white mb-1.5 text-center">
                {(() => {
                  const sent = safetyStats?.sentStrangerMessages || 0;
                  const limit = safetyStats?.msgLimit ?? 50;
                  const pct = sent / limit;
                  const color = pct >= 1 ? 'text-red-500' : pct >= 0.8 ? 'text-orange-500' : 'text-amber-500';
                  return (<>
                    <span className={`font-extrabold ${color}`}>{sent}</span>
                    <span className="text-gray-400 font-normal text-xs"> / {limit}</span>
                  </>);
                })()}
              </div>
              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    (() => { const p = (safetyStats?.sentStrangerMessages || 0) / (safetyStats?.msgLimit ?? 50); return p >= 1 ? 'bg-red-500' : p >= 0.8 ? 'bg-orange-500' : 'bg-amber-500'; })()
                  }`}
                  style={{ width: `${Math.min(100, ((safetyStats?.sentStrangerMessages || 0) / (safetyStats?.msgLimit ?? 50)) * 100)}%` }}
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
                {(() => {
                  const sent = safetyStats?.sentStrangerInvites || 0;
                  const limit = safetyStats?.inviteLimit ?? 50;
                  const pct = sent / limit;
                  const color = pct >= 1 ? 'text-red-500' : pct >= 0.8 ? 'text-orange-500' : 'text-emerald-500';
                  return (<>
                    <span className={`font-extrabold ${color}`}>{sent}</span>
                    <span className="text-gray-400 font-normal text-xs"> / {limit}</span>
                  </>);
                })()}
              </div>
              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    (() => { const p = (safetyStats?.sentStrangerInvites || 0) / (safetyStats?.inviteLimit ?? 50); return p >= 1 ? 'bg-red-500' : p >= 0.8 ? 'bg-orange-500' : 'bg-emerald-500'; })()
                  }`}
                  style={{ width: `${Math.min(100, ((safetyStats?.sentStrangerInvites || 0) / (safetyStats?.inviteLimit ?? 50)) * 100)}%` }}
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
                      {(() => {
                        const isQuotaPaused = c.status === 'paused_quota' || c.pause_reason === 'daily_quota';
                        const isQuietPaused = c.status === 'paused_quiet' || c.pause_reason === 'quiet_hours';
                        const isQueued = c.status === 'queued';
                        const isManualPaused = c.status === 'paused' && (c.pause_reason === 'user_manual' || !c.pause_reason);
                        const statusTitle = isQuotaPaused
                          ? '🛑 Tạm dừng (Hết quota ngày Zalo - Tự động 00:00)'
                          : isQuietPaused
                          ? '🌙 Tạm dừng (Giờ nghỉ đêm)'
                          : isQueued
                          ? `📦 Đang chờ (${c.queue_position ? `#${c.queue_position}` : 'Hàng đợi'})`
                          : c.status === 'active'
                          ? '🟢 Đang chạy'
                          : isManualPaused
                          ? '⏸️ Tạm dừng (Thủ công)'
                          : c.status === 'done'
                          ? '✅ Hoàn thành'
                          : '📝 Nháp';

                        return (
                          <div
                            title={`Trạng thái: ${statusTitle}`}
                            className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isQuotaPaused
                                ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                                : isQuietPaused
                                ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400'
                                : isQueued
                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                                : c.status === 'active'
                                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : isManualPaused
                                ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                                : c.status === 'done'
                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                                : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                            }`}
                          >
                            {isQuotaPaused ? (
                              <span className="text-[11px] font-black leading-none">🛑</span>
                            ) : isQuietPaused ? (
                              <span className="text-[11px] font-black leading-none">🌙</span>
                            ) : isQueued ? (
                              <span className="text-[11px] font-black leading-none">📦</span>
                            ) : c.status === 'active' ? (
                              <AppIcon name="play" size={11} className="fill-current" />
                            ) : isManualPaused ? (
                              <AppIcon name="pause" size={11} className="fill-current" />
                            ) : c.status === 'done' ? (
                              <span className="text-[11px] font-black leading-none">✓</span>
                            ) : (
                              <AppIcon name="file" size={11} />
                            )}
                          </div>
                        );
                      })()}

                      <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate flex-1 flex items-center gap-1.5" title={c.name}>
                        <span className="truncate">{c.name}</span>
                        {c.priority === 'high' && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 flex-shrink-0">
                            Cao
                          </span>
                        )}
                        {c.status === 'queued' && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 flex-shrink-0">
                            {c.queue_position ? `#${c.queue_position}` : 'Chờ'}
                          </span>
                        )}
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
                          const ok = await showConfirm({
                            title: '🗑️ Xóa chiến dịch',
                            message: `Bạn có chắc chắn muốn xóa chiến dịch "${c.name}"? Hành động này sẽ chuyển chiến dịch vào thùng rác.`,
                            variant: 'danger',
                            confirmText: 'Xác nhận xóa',
                            cancelText: 'Hủy',
                          });
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

    {/* AccountQuotaModal */}
    {showQuotaModal && zaloId && (
      <AccountQuotaModal
        zaloId={zaloId}
        onClose={() => setShowQuotaModal(false)}
        onSaved={handleQuotaSaved}
      />
    )}

    {/* Policy & Guide Modal */}
    {showPolicyGuide && (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in"
        onClick={e => { if (e.target === e.currentTarget) setShowPolicyGuide(false); }}
      >
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 bg-amber-50/50 dark:bg-amber-950/20">
            <div className="flex items-center gap-2">
              <span className="text-xl">🛡️</span>
              <div>
                <h3 className="font-extrabold text-sm text-gray-900 dark:text-white">Hướng dẫn Định mức An toàn Zalo</h3>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">Bảo vệ nick Zalo không bị khóa khi chạy chiến dịch</p>
              </div>
            </div>
            <button
              onClick={() => setShowPolicyGuide(false)}
              className="w-7 h-7 rounded-lg bg-gray-200/60 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="p-5 space-y-4 text-xs text-gray-700 dark:text-gray-300 max-h-[70vh] overflow-y-auto">
            {/* Mục 1 */}
            <div className="flex gap-3 items-start bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700/50">
              <span className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center text-sm font-bold shrink-0">1</span>
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white mb-0.5">Tại sao cần định mức?</h4>
                <p className="leading-relaxed text-gray-600 dark:text-gray-400">
                  Zalo tự động quét Spam nếu tài khoản gửi tin nhắn hoặc gửi lời mời kết bạn cho <strong>người lạ</strong> với tần suất lớn trong ngày (~50 lượt). Đặt định mức riêng sẽ tự phanh chiến dịch trước khi bị Zalo cảnh báo.
                </p>
              </div>
            </div>

            {/* Mục 2 */}
            <div className="flex gap-3 items-start bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700/50">
              <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center text-sm font-bold shrink-0">2</span>
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white mb-0.5">2 định mức tách biệt</h4>
                <p className="leading-relaxed text-gray-600 dark:text-gray-400">
                  • <strong>Tin nhắn người lạ</strong>: Hạn mức tin nhắn gửi cho khách hàng chưa kết bạn.<br />
                  • <strong>Lời mời kết bạn</strong>: Hạn mức yêu cầu kết bạn mới trong ngày.<br />
                  • <i>Lưu ý: Khách hàng đã là Bạn bè sẽ không tính vào định mức!</i>
                </p>
              </div>
            </div>

            {/* Mục 3 */}
            <div className="flex gap-3 items-start bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700/50">
              <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-sm font-bold shrink-0">3</span>
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white mb-0.5">Tự động khôi phục ngày mới</h4>
                <p className="leading-relaxed text-gray-600 dark:text-gray-400">
                  Khi chạm hạn mức, chiến dịch tự tạm dừng an toàn và sẽ <strong>tự động chạy tiếp vào 07:00 AM ngày hôm sau</strong> (hoặc theo khung giờ hẹn cố định bạn đã chọn).
                </p>
              </div>
            </div>

            {/* Gợi ý cài đặt */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-900 dark:text-amber-300">
              <div className="font-bold mb-1 flex items-center gap-1.5">
                <span>💡 Hướng dẫn cài đặt theo độ tuổi Nick:</span>
              </div>
              <ul className="space-y-1 pl-4 list-disc text-[11px] text-amber-800 dark:text-amber-400">
                <li><strong>Nick lâu năm (uy tín &gt;1 năm)</strong>: Đặt 40 – 50 tin nhắn / ngày</li>
                <li><strong>Nick trung bình (3 – 12 tháng)</strong>: Đặt 20 – 30 tin nhắn / ngày</li>
                <li><strong>Nick mới tạo (&lt;3 tháng)</strong>: Đặt 10 – 15 tin nhắn / ngày để nuôi nick an toàn</li>
              </ul>
            </div>
          </div>

          <div className="px-5 py-3.5 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-850 flex justify-between items-center">
            {zaloId && (
              <button
                onClick={() => { setShowPolicyGuide(false); setShowQuotaModal(true); }}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
              >
                <span>⚙️ Cài định mức nick này ngay</span>
              </button>
            )}
            <button
              onClick={() => setShowPolicyGuide(false)}
              className="px-4 py-1.5 text-xs font-bold bg-gray-900 hover:bg-gray-800 text-white dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 rounded-xl transition-all shadow-xs"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
