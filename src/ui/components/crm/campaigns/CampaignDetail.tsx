import React, { useEffect, useState, useCallback, useMemo } from 'react';
import type { CRMCampaign } from '@/store/crmStore';
import type { LabelData } from '@/store/appStore';
import { showConfirm } from '@/components/common/ConfirmDialog';
import ipc from '@/lib/ipc';
import TargetSelector from './TargetSelector';
import CampaignCreateModal from './CampaignCreateModal';
import AppIcon from '@/components/common/AppIcon';

function fmtDelayRange(min: number, max: number): string {
  const fmt = (s: number) => {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}ph`;
    return `${Math.round(s / 3600)}h`;
  };
  return min === max ? fmt(min) : `${fmt(min)}-${fmt(max)}`;
}

interface LocalLabelItem {
  id: number;
  name: string;
  color: string;
  text_color?: string;
  emoji?: string;
}

interface CampaignDetailProps {
  campaign: CRMCampaign;
  zaloId: string;
  allLabels: LabelData[];
  localLabels?: LocalLabelItem[];
  localLabelThreadMap?: Record<string, number[]>;
  onStatusChange: (id: number, status: string) => void;
  onAddContacts: (campaignId: number, contacts: any[]) => Promise<void>;
  onUpdate?: (data: {
    name: string;
    template_message: string;
    friend_request_message: string;
    campaign_type: string;
    delay_seconds: number;
    delay_min_seconds?: number;
    delay_max_seconds?: number;
    per_contact_delay_min_seconds?: number;
    per_contact_delay_max_seconds?: number;
    daily_send_limit?: number;
    daily_start_time?: string;
    scheduled_start_at?: number;
  }) => Promise<void>;
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-gray-400', sending: 'text-blue-400 animate-pulse',
  sent: 'text-green-400', failed: 'text-red-400',
};

function renderFormattedTemplate(msg?: string) {
  if (!msg) return <span className="text-gray-500 italic">Chưa có nội dung tin nhắn</span>;

  let parsed: any = null;
  if (msg.trim().startsWith('{') && msg.trim().endsWith('}')) {
    try {
      parsed = JSON.parse(msg);
    } catch {}
  }

  if (parsed && Array.isArray(parsed.blocks)) {
    const blocks: Array<{ id?: string; text: string; images?: string[] }> = parsed.blocks;
    const mode = parsed.mode === 'sequential' ? 'Tuần tự' : 'Xoay vòng ngẫu nhiên';

    return (
      <div className="space-y-1.5 mt-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-md font-semibold border border-blue-500/30">
            🔀 Chế độ: {mode} ({blocks.length} biến thể)
          </span>
        </div>
        <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
          {blocks.map((b, i) => (
            <div key={b.id || i} className="bg-gray-800/80 border border-gray-700/60 rounded-lg p-2 text-xs">
              <span className="font-bold text-blue-400 mr-1.5">Mẫu {i + 1}:</span>
              <span className="text-gray-200 whitespace-pre-wrap">{b.text || <em className="text-gray-500">(Nội dung kèm ảnh)</em>}</span>
              {b.images && b.images.length > 0 && (
                <span className="ml-2 text-[10px] text-emerald-400 font-medium">📷 +{b.images.length} ảnh</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <p className="text-xs text-gray-200 line-clamp-3 leading-relaxed font-normal pr-16">{msg}</p>;
}

export default function CampaignDetail({ campaign, zaloId, allLabels, localLabels, localLabelThreadMap, onStatusChange, onAddContacts, onUpdate }: CampaignDetailProps) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTargetSelector, setShowTargetSelector] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  // ── Multi-select state for pending contacts ──────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    const res = await ipc.crm?.getCampaignContacts({ campaignId: campaign.id });
    if (res?.success) setContacts(res.contacts);
    setLoading(false);
  }, [campaign.id]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Reload when total contacts or sent count changes (e.g. from bulk actions or background queue)
  useEffect(() => {
    loadContacts();
  }, [campaign.total_contacts, campaign.sent_count, loadContacts]);

  // Reset selection when campaign changes
  useEffect(() => { setSelectedIds(new Set()); }, [campaign.id]);

  // ── Real-time updates từ queue ────────────────────────────────────────────
  useEffect(() => {
    const unsubUpdate = ipc.on?.('crm:queueUpdate', (data: any) => {
      if (data.campaignId !== campaign.id) return;
      setContacts(prev => prev.map(c =>
        c.contact_id === data.contactId
          ? { ...c, status: data.status, sent_at: data.status === 'sent' ? Date.now() : c.sent_at, error: data.error || '' }
          : c
      ));
    });
    const unsubDone = ipc.on?.('crm:campaignDone', (data: any) => {
      if (data.campaignId === campaign.id) loadContacts();
    });
    return () => { unsubUpdate?.(); unsubDone?.(); };
  }, [campaign.id, loadContacts]);

  const handleConfirmTargets = async (selected: any[]) => {
    const toAdd = selected.map(c => ({ contactId: c.contact_id, displayName: c.alias || c.display_name, avatar: c.avatar || c.avatar_url || '', phone: c.phone || '' }));
    await onAddContacts(campaign.id, toAdd);
    await loadContacts();
  };

  // Thống kê chiến dịch gửi
  const stats = useMemo(() => {
    const total = contacts.length;
    const sentCount = contacts.filter(c => c.status === 'sent').length;
    const failedCount = contacts.filter(c => c.status === 'failed').length;
    const pendingCount = contacts.filter(c => c.status === 'pending').length;
    const sendingCount = contacts.filter(c => c.status === 'sending').length;

    // Phân tích lý do lỗi phổ biến
    const errorMap: Record<string, number> = {};
    contacts.forEach(c => {
      if (c.status === 'failed' && c.error) {
        const err = c.error.trim();
        errorMap[err] = (errorMap[err] || 0) + 1;
      }
    });
    const failedReasons = Object.entries(errorMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    return { total, sentCount, failedCount, pendingCount, sendingCount, failedReasons };
  }, [contacts]);

  const handleRetryFailures = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await ipc.crm?.retryFailedContacts({ zaloId, campaignId: campaign.id });
      if (res?.success) {
        await loadContacts();
      } else {
        console.error('[CampaignDetail] Retry failed contacts error:', res?.error);
      }
    } catch (err) {
      console.error('[CampaignDetail] Retry failed contacts exception:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestartCampaign = async () => {
    if (loading) return;
    const ok = await showConfirm({
      title: 'Chạy lại chiến dịch?',
      message: `Bạn có chắc chắn muốn chạy lại toàn bộ chiến dịch này từ đầu? Tất cả trạng thái gửi và lịch sử gửi cũ của chiến dịch này sẽ được đặt lại.`,
      variant: 'warning',
      confirmText: 'Chạy lại',
    });
    if (!ok) return;

    setLoading(true);
    try {
      const res = await ipc.crm?.restartCampaign({ zaloId, campaignId: campaign.id });
      if (res?.success) {
        await loadContacts();
      } else {
        console.error('[CampaignDetail] Restart campaign error:', res?.error);
      }
    } catch (err) {
      console.error('[CampaignDetail] Restart campaign exception:', err);
    } finally {
      setLoading(false);
    }
  };

  // Only pending contacts can be selected & removed
  const pendingContacts = useMemo(() => contacts.filter(c => c.status === 'pending'), [contacts]);
  const allPendingSelected = pendingContacts.length > 0 && pendingContacts.every(c => selectedIds.has(c.contact_id));

  const toggleSelect = (contactId: string, isPending: boolean) => {
    if (!isPending) return;
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(contactId) ? n.delete(contactId) : n.add(contactId);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingContacts.map(c => c.contact_id)));
    }
  };

  const handleRemoveSelected = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (selectedIds.size === 0) return;

    // Guard: API chưa được load (cần restart app)
    if (typeof ipc.crm?.removeCampaignContacts !== 'function') {
      alert('⚠️ Tính năng này cần khởi động lại ứng dụng để kích hoạt.\n\nVui lòng tắt và mở lại app.');
      return;
    }

    setRemoving(true);
    try {
      const res = await ipc.crm.removeCampaignContacts({
        zaloId,
        campaignId: campaign.id,
        contactIds: [...selectedIds],
      });
      if (res?.success === false) {
        console.error('[CampaignDetail] removeCampaignContacts failed:', res);
      }
      setSelectedIds(new Set());
      await loadContacts();
    } catch (err) {
      console.error('[CampaignDetail] removeCampaignContacts error:', err);
    } finally {
      setRemoving(false);
    }
  };

  // Build dedup set: include both contact_id and phone: prefix for phone imports
  const existingIds = new Set(contacts.flatMap((c: any) => {
    const ids: string[] = [c.contact_id];
    if (c.phone) ids.push(`phone:${c.phone}`);
    return ids;
  }));

  const fmt = (ts: number) => ts ? new Date(ts).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
  const progress = campaign.total_contacts > 0 ? (campaign.sent_count / campaign.total_contacts) * 100 : 0;

  const canEdit = campaign.status === 'draft' || campaign.status === 'paused';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Campaign header */}
      <div className="px-5 py-4 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm truncate">{campaign.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span className="flex items-center gap-0.5">
                <AppIcon name="clock" className="text-gray-500" size={10} />
                ⏱ {fmtDelayRange(campaign.delay_min_seconds || Math.max(5, campaign.delay_seconds - 10), campaign.delay_max_seconds || campaign.delay_seconds + 10)}
              </span>
              <span>·</span>
              <span className="flex items-center gap-0.5">
                <AppIcon name="users" className="text-gray-500" size={10} />
                {campaign.total_contacts} liên hệ
              </span>
              {campaign.daily_send_limit > 0 && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-0.5">
                    <AppIcon name="chart" className="text-gray-500" size={10} />
                    {campaign.daily_send_limit}/ngày
                  </span>
                </>
              )}
              {campaign.scheduled_start_at > 0 && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-0.5">
                    <AppIcon name="clock" className="text-gray-500" size={10} />
                    Hẹn giờ: {new Date(campaign.scheduled_start_at).toLocaleString('vi-VN', { hour12: false })}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            {/* Nút Sửa: bấm để mở modal chỉnh sửa */}
            {onUpdate && (
              <button onClick={() => setShowEdit(true)}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 transition-colors flex items-center gap-1 font-semibold">
                <AppIcon name="edit" className="text-blue-400" size={11} />
                Sửa chiến dịch
              </button>
            )}
            {campaign.status === 'draft' && (
              <button onClick={() => onStatusChange(campaign.id, 'active')}
                className="text-xs px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white flex items-center gap-1 font-medium">
                <AppIcon name="play" className="text-white fill-white" size={10} />
                Bắt đầu
              </button>
            )}
            {campaign.status === 'active' && (
              <button onClick={() => onStatusChange(campaign.id, 'paused')}
                className="text-xs px-3 py-1.5 rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white flex items-center gap-1 font-medium">
                <AppIcon name="pause" className="text-white fill-white" size={10} />
                Tạm dừng
              </button>
            )}
            {campaign.status === 'paused' && (
              <button onClick={() => onStatusChange(campaign.id, 'active')}
                className="text-xs px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white flex items-center gap-1 font-medium">
                <AppIcon name="play" className="text-white fill-white" size={10} />
                Tiếp tục
              </button>
            )}
          </div>
        </div>

        {/* Progress */}
        {campaign.total_contacts > 0 && (
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span className="text-green-400">{campaign.sent_count} đã gửi</span>
              <span className="text-gray-500">{campaign.pending_count} chờ</span>
              {campaign.failed_count > 0 && <span className="text-red-400">{campaign.failed_count} lỗi</span>}
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Daily progress */}
        {campaign.daily_send_limit > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-gray-500">Hôm nay:</span>
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden max-w-[120px]">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (campaign.sent_today_count ?? 0) / campaign.daily_send_limit * 100)}%` }}
              />
            </div>
            <span className="text-[11px] text-emerald-400 font-medium tabular-nums">
              {campaign.sent_today_count ?? 0}/{campaign.daily_send_limit}
            </span>
          </div>
        )}

        {/* ── BÁO CÁO CHIẾN DỊCH (Modern Premium Dashboard Style matching user mockup) ── */}
        <div className="mt-4 p-4 bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-2xl shadow-sm space-y-3.5">
          {/* Header: Title + Status Pill + Action Buttons */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 20V10M12 20V4M6 20v-6" />
                </svg>
              </div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-800 dark:text-gray-200">
                BÁO CÁO CHIẾN DỊCH
              </h3>
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wider ${
                campaign.status === 'done'
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : campaign.status === 'active'
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 animate-pulse'
                  : campaign.status === 'paused'
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>
                {campaign.status === 'done' ? 'HOÀN THÀNH' : campaign.status === 'active' ? 'ĐANG CHẠY' : campaign.status === 'paused' ? 'TẠM DỪNG' : 'NHÁP'}
              </span>
            </div>

            {/* Reset/Retry Action buttons */}
            <div className="flex items-center gap-2">
              {stats.failedCount > 0 && (campaign.status === 'done' || campaign.status === 'paused') && (
                <button
                  onClick={handleRetryFailures}
                  className="px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs"
                  title="Gửi lại cho các liên hệ bị lỗi"
                >
                  <AppIcon name="sync" size={12} />
                  <span>Gửi bù lỗi ({stats.failedCount})</span>
                </button>
              )}
              {(campaign.status === 'done' || campaign.status === 'paused') && (
                <button
                  onClick={handleRestartCampaign}
                  className="px-3.5 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs active:scale-95"
                  title="Gửi lại toàn bộ liên hệ từ đầu"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                  </svg>
                  <span>Chạy lại</span>
                </button>
              )}
            </div>
          </div>

          {/* ── 4 Vibrant Stat Cards Grid (Matching User Mockup) ── */}
          <div className="grid grid-cols-4 gap-3">
            {/* Thẻ 1: TỔNG SỐ (Blue Gradient) */}
            <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-md flex items-center justify-between select-none">
              {/* Background Watermark SVG */}
              <svg className="absolute -right-2 -bottom-2 w-20 h-20 text-white/10 pointer-events-none" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
              </svg>

              <div className="relative z-10 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/25 backdrop-blur-md border border-white/40 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-black text-white uppercase tracking-wider">Tổng số</p>
                  <p className="text-2xl font-black text-white leading-none mt-1">{stats.total || campaign.total_contacts || 0}</p>
                </div>
              </div>
            </div>

            {/* Thẻ 2: THÀNH CÔNG (Green Gradient) */}
            <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md flex items-center justify-between select-none">
              {/* Background Watermark SVG */}
              <svg className="absolute -right-2 -bottom-2 w-20 h-20 text-white/10 pointer-events-none" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>
              </svg>

              <div className="relative z-10 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/25 backdrop-blur-md border border-white/40 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-black text-white uppercase tracking-wider">Thành công</p>
                  <p className="text-2xl font-black text-white leading-none mt-1">{stats.sentCount || campaign.sent_count || 0}</p>
                </div>
              </div>
            </div>

            {/* Thẻ 3: THẤT BẠI (Red Gradient) */}
            <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-md flex items-center justify-between select-none">
              {/* Background Watermark SVG */}
              <svg className="absolute -right-2 -bottom-2 w-20 h-20 text-white/10 pointer-events-none" viewBox="0 0 24 24" fill="currentColor">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
              </svg>

              <div className="relative z-10 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/25 backdrop-blur-md border border-white/40 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-black text-white uppercase tracking-wider">Thất bại</p>
                  <p className="text-2xl font-black text-white leading-none mt-1">{stats.failedCount || campaign.failed_count || 0}</p>
                </div>
              </div>
            </div>

            {/* Thẻ 4: ĐANG CHỜ (Orange Gradient) */}
            <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md flex items-center justify-between select-none">
              {/* Background Watermark SVG */}
              <svg className="absolute -right-2 -bottom-2 w-20 h-20 text-white/10 pointer-events-none" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 2v6h.01L6 8.01 10 12l-4 4 .01.01H6V22h12v-5.99h-.01L18 16l-4-4 4-3.99-.01-.01H18V2H6zm10 14.5V20H8v-3.5l4-4 4 4zM10 6L8 8V4h8v4l-2-2h-4z"/>
              </svg>

              <div className="relative z-10 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/25 backdrop-blur-md border border-white/40 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-black text-white uppercase tracking-wider">Đang chờ</p>
                  <p className="text-2xl font-black text-white leading-none mt-1">{stats.pendingCount + stats.sendingCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Failures reasons summary */}
          {stats.failedReasons.length > 0 && (
            <div className="bg-rose-50 dark:bg-rose-955/20 border border-rose-200 dark:border-rose-900/40 p-3 rounded-2xl text-xs">
              <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <AppIcon name="x" className="text-rose-500" size={12} />
                Chi tiết nguyên nhân thất bại:
              </p>
              <div className="space-y-1 max-h-[80px] overflow-y-auto pr-1">
                {stats.failedReasons.map(({ reason, count }) => (
                  <div key={reason} className="flex justify-between items-start text-[11px] text-rose-800 dark:text-rose-300 leading-normal gap-2">
                    <span className="truncate flex-1">• {reason}</span>
                    <span className="font-mono text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded font-bold flex-shrink-0">
                      {count} lượt
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Template preview - Clickable to Edit Campaign */}
        <div
          onClick={() => setShowEdit(true)}
          title="Bấm vào để chỉnh sửa kịch bản & cài đặt chiến dịch"
          className="mt-3 p-3 bg-gray-700/50 hover:bg-gray-700/80 border border-transparent hover:border-blue-500/50 rounded-xl cursor-pointer transition-all group relative shadow-xs"
        >
          <div className="absolute top-2.5 right-2.5 opacity-60 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[11px] font-bold text-blue-400 bg-blue-600/10 px-2 py-0.5 rounded-md border border-blue-500/20">
            <AppIcon name="edit" size={11} />
            <span>Sửa nội dung</span>
          </div>

          {campaign.campaign_type === 'invite_to_group' ? (() => {
            let groupIds: string[] = [];
            try { groupIds = JSON.parse(campaign.mixed_config || '{}').group_ids || []; } catch {}
            return (
              <>
                <p className="text-[11px] text-gray-400 font-medium mb-1 flex items-center gap-1">
                  <AppIcon name="users" className="text-gray-400" size={12} />
                  Nhóm đích:
                </p>
                {groupIds.length > 0
                  ? <p className="text-xs text-orange-300 font-semibold">{groupIds.length} nhóm đã chọn</p>
                  : <p className="text-xs text-gray-500 italic">Chưa cấu hình nhóm</p>}
              </>
            );
          })() : (
            <>
              <p className="text-[11px] text-gray-400 font-medium mb-1 flex items-center gap-1">
                <AppIcon name="message" className="text-blue-400" size={12} />
                {campaign.campaign_type === 'friend_request' ? 'Tin nhắn kết bạn:' : 'Template tin nhắn:'}
              </p>
              {campaign.campaign_type === 'friend_request'
                ? <p className="text-xs text-gray-200 line-clamp-3 leading-relaxed font-normal pr-16">{campaign.friend_request_message}</p>
                : renderFormattedTemplate(campaign.template_message)}
              {campaign.campaign_type === 'mixed' && campaign.friend_request_message && (
                <>
                  <p className="text-[11px] text-gray-400 mt-2 mb-1 font-medium">Fallback kết bạn:</p>
                  <p className="text-xs text-gray-300 line-clamp-1">{campaign.friend_request_message}</p>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Contact list header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          {/* Select-all checkbox for pending contacts */}
          {pendingContacts.length > 0 && canEdit && (
            <label className="flex items-center gap-1.5 cursor-pointer group" title="Chọn tất cả đang chờ">
              <input
                type="checkbox"
                checked={allPendingSelected}
                onChange={toggleSelectAll}
                className="accent-blue-500 w-3.5 h-3.5"
              />
              <span className="text-[11px] text-gray-500 group-hover:text-gray-300 transition-colors select-none">
                {selectedIds.size > 0 ? `${selectedIds.size} đã chọn` : `${contacts.length} liên hệ`}
              </span>
            </label>
          )}
          {pendingContacts.length === 0 && (
            <span className="text-xs text-gray-400">{contacts.length} liên hệ</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Remove selected button */}
          {selectedIds.size > 0 && (
            <button
              onClick={(e) => handleRemoveSelected(e)}
              disabled={removing}
              className="text-xs px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {removing ? (
                <span className="inline-block w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <AppIcon name="trash" className="text-red-400" size={11} />
              )}
              Xóa {selectedIds.size}
            </button>
          )}
          {canEdit && (
            <button onClick={() => setShowTargetSelector(true)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors">+ Thêm liên hệ</button>
          )}
        </div>
      </div>

      {/* Contact rows */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-9 bg-gray-700/50 rounded animate-pulse" />)}</div>
        ) : contacts.map(c => {
          const isPending = c.status === 'pending';
          const isSelected = selectedIds.has(c.contact_id);
          return (
            <div
              key={c.id}
              onClick={() => toggleSelect(c.contact_id, isPending)}
              className={`flex items-center gap-2.5 px-4 py-2.5 border-b border-gray-700/50 transition-colors ${isPending && canEdit ? 'cursor-pointer hover:bg-gray-700/30' : ''} ${isSelected ? 'bg-blue-500/10' : ''}`}
            >
              {/* Checkbox for pending contacts */}
              {isPending && canEdit ? (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(c.contact_id, isPending)}
                  onClick={e => e.stopPropagation()}
                  className="accent-blue-500 flex-shrink-0 w-3.5 h-3.5"
                />
              ) : (
                <div className="w-3.5 h-3.5 flex-shrink-0" />
              )}

              {c.avatar
                ? <img src={c.avatar} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                : <div className="w-7 h-7 rounded-full bg-gray-600 flex items-center justify-center text-xs text-white flex-shrink-0">
                    {(c.display_name || c.contact_id || '?').charAt(0).toUpperCase()}
                  </div>}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-200 truncate">{c.display_name || c.contact_id}</p>
                {c.phone && <p className="text-[11px] text-gray-500 font-mono truncate">{c.phone}</p>}
                {!c.phone && c.contact_id && c.contact_id !== c.display_name && (
                  <p className="text-[11px] text-gray-600 font-mono truncate">{c.contact_id}</p>
                )}
              </div>
              <span className={`text-[11px] flex-shrink-0 flex items-center gap-1 font-medium ${STATUS_STYLE[c.status]}`}>
                {c.status === 'pending' && <AppIcon name="clock" className="text-gray-400" size={10} />}
                {c.status === 'sending' && <AppIcon name="send" className="text-blue-400 animate-pulse" size={10} />}
                {c.status === 'sent' && <AppIcon name="check" className="text-green-400" size={11} />}
                {c.status === 'failed' && <AppIcon name="x" className="text-red-400" size={10} />}
                <span className="capitalize">{c.status}</span>
              </span>
              {c.sent_at > 0 && <span className="text-[11px] text-gray-600 flex-shrink-0">{fmt(c.sent_at)}</span>}
            </div>
          );
        })}
      </div>

      {/* TargetSelector modal */}
      {showTargetSelector && (
        <TargetSelector
          zaloId={zaloId}
          allLabels={allLabels}
          localLabels={localLabels}
          localLabelThreadMap={localLabelThreadMap}
          existingContactIds={existingIds}
          onConfirm={handleConfirmTargets}
          onClose={() => setShowTargetSelector(false)}
        />
      )}

      {/* Edit modal */}
      {showEdit && (
        <CampaignCreateModal
          editMode
          zaloId={zaloId}
          initialData={{
            name: campaign.name,
            template_message: campaign.template_message,
            friend_request_message: campaign.friend_request_message,
            campaign_type: campaign.campaign_type,
            mixed_config: campaign.mixed_config || '{}',
            delay_seconds: campaign.delay_seconds,
            delay_min_seconds: campaign.delay_min_seconds,
            delay_max_seconds: campaign.delay_max_seconds,
            per_contact_delay_min_seconds: campaign.per_contact_delay_min_seconds,
            per_contact_delay_max_seconds: campaign.per_contact_delay_max_seconds,
            daily_send_limit: campaign.daily_send_limit,
            daily_start_time: campaign.daily_start_time,
          }}
          onClose={() => setShowEdit(false)}
          onSave={async (data) => {
            await onUpdate?.(data);
            setShowEdit(false);
          }}
        />
      )}
    </div>
  );
}
