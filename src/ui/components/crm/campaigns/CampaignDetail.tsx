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
    const toAdd = selected.map(c => ({ contactId: c.contact_id, displayName: c.alias || c.display_name, avatar: c.avatar, phone: c.phone || '' }));
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
              {campaign.daily_send_limit > 0 ? (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-0.5">
                    <AppIcon name="chart" className="text-gray-500" size={10} />
                    {campaign.daily_send_limit}/ngày từ {campaign.daily_start_time}
                  </span>
                </>
              ) : (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-0.5">
                    <AppIcon name="clock" className="text-gray-500" size={10} />
                    Chạy từ {campaign.daily_start_time}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            {/* Nút Sửa: chỉ hiện khi nháp hoặc tạm dừng */}
            {canEdit && onUpdate && (
              <button onClick={() => setShowEdit(true)}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors flex items-center gap-1 font-medium">
                <AppIcon name="edit" className="text-gray-300" size={11} />
                Sửa
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

        {/* Campaign summary report (Only show for active, paused, done) */}
        {campaign.status !== 'draft' && stats.total > 0 && (
          <div className="mt-3 p-3 bg-gray-900/50 border border-gray-700/60 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                <AppIcon name="chart" className="text-blue-400" size={12} />
                Báo cáo chiến dịch
                {campaign.status === 'done' && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">Hoàn thành</span>
                )}
                {campaign.status === 'active' && (
                  <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30 animate-pulse">Đang chạy</span>
                )}
                {campaign.status === 'paused' && (
                  <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/30">Tạm dừng</span>
                )}
              </span>
              
              {/* Reset/Retry actions inside the report */}
              <div className="flex gap-2">
                {stats.failedCount > 0 && (campaign.status === 'done' || campaign.status === 'paused') && (
                  <button
                    onClick={handleRetryFailures}
                    className="text-[10px] px-2 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg transition-colors flex items-center gap-1 font-medium"
                    title="Gửi lại cho các liên hệ bị lỗi">
                    <AppIcon name="sync" className="text-blue-400" size={10} />
                    Gửi bù lỗi ({stats.failedCount})
                  </button>
                )}
                {campaign.status === 'done' && (
                  <button
                    onClick={handleRestartCampaign}
                    className="text-[10px] px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 rounded-lg transition-colors flex items-center gap-1 font-medium"
                    title="Gửi lại toàn bộ liên hệ từ đầu">
                    <AppIcon name="sync" className="text-gray-300" size={10} />
                    Chạy lại
                  </button>
                )}
              </div>
            </div>

            {/* Stat counts grid */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-1.5 bg-gray-800/40 rounded-lg border border-gray-700/40">
                <p className="text-[9px] text-gray-500 font-medium">Tổng số</p>
                <p className="text-xs font-semibold text-gray-200 mt-0.5">{stats.total}</p>
              </div>
              <div className="p-1.5 bg-emerald-950/20 rounded-lg border border-emerald-900/20">
                <p className="text-[9px] text-emerald-500 font-medium">Thành công</p>
                <p className="text-xs font-semibold text-emerald-400 mt-0.5">{stats.sentCount}</p>
              </div>
              <div className="p-1.5 bg-rose-950/20 rounded-lg border border-rose-900/20">
                <p className="text-[9px] text-rose-500 font-medium">Thất bại</p>
                <p className="text-xs font-semibold text-rose-400 mt-0.5">{stats.failedCount}</p>
              </div>
              <div className="p-1.5 bg-gray-800/40 rounded-lg border border-gray-700/40">
                <p className="text-[9px] text-gray-500 font-medium">Đang chờ</p>
                <p className="text-xs font-semibold text-gray-400 mt-0.5">{stats.pendingCount + stats.sendingCount}</p>
              </div>
            </div>

            {/* Failures reasons summary */}
            {stats.failedReasons.length > 0 && (
              <div className="bg-gray-800/20 p-2 rounded-lg border border-gray-700/20">
                <p className="text-[9px] text-rose-400 font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
                  <AppIcon name="x" className="text-rose-500" size={10} />
                  Chi tiết lỗi gửi:
                </p>
                <div className="space-y-1 max-h-[80px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  {stats.failedReasons.map(({ reason, count }) => (
                    <div key={reason} className="flex justify-between items-start text-[11px] text-gray-400 leading-normal gap-2">
                      <span className="truncate flex-1">• {reason}</span>
                      <span className="font-mono text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1 rounded flex-shrink-0 font-medium">{count} lượt</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Template preview */}
        <div className="mt-3 p-2.5 bg-gray-700/50 rounded-lg">
          {campaign.campaign_type === 'invite_to_group' ? (() => {
            let groupIds: string[] = [];
            try { groupIds = JSON.parse(campaign.mixed_config || '{}').group_ids || []; } catch {}
            return (
              <>
                <p className="text-[11px] text-gray-500 mb-1 flex items-center gap-1">
                  <AppIcon name="users" className="text-gray-500" size={12} />
                  Nhóm đích:
                </p>
                {groupIds.length > 0
                  ? <p className="text-xs text-orange-300">{groupIds.length} nhóm đã chọn</p>
                  : <p className="text-xs text-gray-500 italic">Chưa cấu hình nhóm</p>}
              </>
            );
          })() : (
            <>
              <p className="text-[11px] text-gray-500 mb-1">
                {campaign.campaign_type === 'friend_request' ? 'Tin nhắn kết bạn:' : 'Template tin nhắn:'}
              </p>
              <p className="text-xs text-gray-300 line-clamp-2">
                {campaign.campaign_type === 'friend_request'
                  ? campaign.friend_request_message
                  : campaign.template_message}
              </p>
              {campaign.campaign_type === 'mixed' && campaign.friend_request_message && (
                <>
                  <p className="text-[11px] text-gray-500 mt-1.5 mb-1">Fallback kết bạn:</p>
                  <p className="text-xs text-gray-400 line-clamp-1">{campaign.friend_request_message}</p>
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
