import React, { useEffect, useState, useCallback, useMemo } from 'react';
import type { CRMCampaign } from '@/store/crmStore';
import type { LabelData } from '@/store/appStore';
import { showConfirm } from '@/components/common/ConfirmDialog';
import ipc from '@/lib/ipc';
import TargetSelector from './TargetSelector';
import CampaignCreateModal from './CampaignCreateModal';
import { RestartCampaignModal } from './RestartCampaignModal';
import AppIcon from '@/components/common/AppIcon';
import { parseZaloError } from '../../../../services/crm/ZaloErrorDictionary';

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
  onClone?: (id: number) => void;
  onCopyToAccounts?: (campaign: CRMCampaign) => void;
  /** Trạng thái queue thực tế (từ CRMQueueService), dùng để phân biệt "Đang chạy" vs "Đạt giới hạn - Chờ tiếp" */
  queueStatus?: { running: boolean; dailyPaused?: boolean; type?: string; tokens: number; maxTokens?: number; lastSentAt: number };
}

export default function CampaignDetail({
  campaign,
  zaloId,
  allLabels,
  localLabels,
  localLabelThreadMap,
  onStatusChange,
  onAddContacts,
  onUpdate,
  onClone,
  onCopyToAccounts,
  queueStatus,
}: CampaignDetailProps) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTargetSelector, setShowTargetSelector] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false);

  // Pagination states for contacts table
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState(0);

  // Multi-select state for pending contacts
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    const res = await ipc.crm?.getCampaignContacts({ campaignId: campaign.id });
    if (res?.success) setContacts(res.contacts);
    setLoading(false);
  }, [campaign.id]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  useEffect(() => {
    loadContacts();
  }, [campaign.total_contacts, campaign.sent_count, loadContacts]);

  useEffect(() => { setSelectedIds(new Set()); setPage(0); }, [campaign.id]);

  // Real-time updates from queue
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

  // Error Detail Modal & Status Filter states
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedErrorContact, setSelectedErrorContact] = useState<any | null>(null);
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);

  const parseContactError = useCallback((c: any) => {
    const err = String(c?.error || '').toLowerCase();
    const isMsgFailed = err.includes('lỗi gửi tin') || (c?.status === 'failed' && !err.includes('kết bạn') && !err.includes('nhóm'));
    const isFriendFailed = err.includes('lỗi kết bạn') || err.includes('kết bạn');
    const isInviteFailed = err.includes('lỗi mời nhóm') || err.includes('nhóm');
    const isBlocked = [
      'chặn', 'không nhận tin nhắn', 'không nhận lời mời', 'người lạ', 'privacy', 'stranger', 'blocked'
    ].some(k => err.includes(k));

    return { isMsgFailed, isFriendFailed, isInviteFailed, isBlocked, rawError: c?.error || '' };
  }, []);

  const stats = useMemo(() => {
    const total = contacts.length;
    const sentCount = contacts.filter(c => c.status === 'sent').length;
    const failedCount = contacts.filter(c => c.status === 'failed').length;
    const pendingCount = contacts.filter(c => c.status === 'pending' || c.status === 'sending').length;

    let msgFailedCount = 0;
    let friendFailedCount = 0;
    let inviteFailedCount = 0;
    let blockedCount = 0;

    contacts.forEach(c => {
      if (c.status === 'failed') {
        const info = parseContactError(c);
        if (info.isMsgFailed) msgFailedCount++;
        if (info.isFriendFailed) friendFailedCount++;
        if (info.isInviteFailed) inviteFailedCount++;
        if (info.isBlocked) blockedCount++;
      }
    });

    return { total, sentCount, failedCount, pendingCount, msgFailedCount, friendFailedCount, inviteFailedCount, blockedCount };
  }, [contacts, parseContactError]);

  const filteredContacts = useMemo(() => {
    if (filterStatus === 'sent') return contacts.filter(c => c.status === 'sent');
    if (filterStatus === 'failed') return contacts.filter(c => c.status === 'failed');
    if (filterStatus === 'pending') return contacts.filter(c => c.status === 'pending' || c.status === 'sending');
    if (filterStatus === 'msg_failed') return contacts.filter(c => c.status === 'failed' && parseContactError(c).isMsgFailed);
    if (filterStatus === 'friend_failed') return contacts.filter(c => c.status === 'failed' && parseContactError(c).isFriendFailed);
    if (filterStatus === 'invite_failed') return contacts.filter(c => c.status === 'failed' && parseContactError(c).isInviteFailed);
    if (filterStatus === 'blocked') return contacts.filter(c => c.status === 'failed' && parseContactError(c).isBlocked);
    return contacts;
  }, [contacts, filterStatus, parseContactError]);

  // Render template preview
  const templateInfo = useMemo(() => {
    const raw = campaign.template_message || '';
    if (!raw) return { modeText: 'Biến thể đơn', blocks: [{ text: 'Chưa có nội dung', images: [] }] };

    if (raw.trim().startsWith('{') && raw.trim().endsWith('}')) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.blocks)) {
          const modeText = parsed.mode === 'sequential' ? 'Tuần tự' : `Xoay vòng ngẫu nhiên (${parsed.blocks.length} biến thể)`;
          return { modeText, blocks: parsed.blocks };
        }
      } catch {}
    }
    return { modeText: '1 biến thể', blocks: [{ text: raw, images: [] }] };
  }, [campaign.template_message]);

  const pendingContacts = useMemo(() => contacts.filter(c => c.status === 'pending'), [contacts]);
  const allPendingSelected = pendingContacts.length > 0 && pendingContacts.every(c => selectedIds.has(c.contact_id));

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingContacts.map(c => c.contact_id)));
    }
  };

  const toggleSelect = (contactId: string, isPending: boolean) => {
    if (!isPending) return;
    setSelectedIds(prev => {
      const n = new Set(prev);
      n.has(contactId) ? n.delete(contactId) : n.add(contactId);
      return n;
    });
  };

  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / pageSize));
  const pagedContacts = filteredContacts.slice(page * pageSize, (page + 1) * pageSize);

  const handleEditAttempt = async () => {
    if (campaign.status === 'active') {
      const ok = await showConfirm({
        title: '⚠️ Không thể sửa chiến dịch đang chạy',
        message: 'Chiến dịch đang trong trạng thái Đang chạy. Vui lòng TẠM DỪNG chiến dịch hoặc SAO CHÉP (clone) thành chiến dịch mới để chỉnh sửa nội dung/liên hệ.',
        confirmText: 'Sao chép chiến dịch đang chọn',
        cancelText: 'Đóng',
        variant: 'warning',
      });
      if (ok && onClone) {
        onClone(campaign.id);
      }
      return;
    }

    if (campaign.status === 'done') {
      const ok = await showConfirm({
        title: '⚠️ Không thể sửa chiến dịch đã hoàn thành',
        message: 'Chiến dịch đã hoàn thành/kết thúc. Vui lòng SAO CHÉP (clone) thành chiến dịch mới để chỉnh sửa nội dung hoặc thêm liên hệ.',
        confirmText: 'Sao chép chiến dịch đang chọn',
        cancelText: 'Đóng',
        variant: 'info',
      });
      if (ok && onClone) {
        onClone(campaign.id);
      }
      return;
    }

    setShowEdit(true);
  };

  const fmtTime = (ts: number) => {
    if (!ts) return '--:--';
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const mon = String(d.getMonth() + 1).padStart(2, '0');
    const yr = d.getFullYear();
    return `${hh}:${mm}  ${day}/${mon}/${yr}`;
  };

  const handleRemoveSelected = async () => {
    if (selectedIds.size === 0) return;
    const ok = await showConfirm({
      title: '🗑️ Xóa liên hệ khỏi chiến dịch',
      message: `Bạn có chắc chắn muốn xóa ${selectedIds.size} liên hệ đã chọn khỏi chiến dịch này?`,
      confirmText: 'Xóa liên hệ',
      cancelText: 'Hủy',
      variant: 'danger',
    });
    if (!ok) return;

    setRemoving(true);
    try {
      await ipc.crm?.removeCampaignContacts({
        zaloId,
        campaignId: campaign.id,
        contactIds: Array.from(selectedIds),
      });
      setSelectedIds(new Set());
      await loadContacts();
    } catch (err) {
      console.error('Failed to remove campaign contacts', err);
    } finally {
      setRemoving(false);
    }
  };

  const handleAddContactsClick = async () => {
    if (campaign.status === 'done') {
      const ok = await showConfirm({
        title: '⚠️ Chiến dịch đã hoàn thành',
        message: 'Chiến dịch này đã hoàn thành/kết thúc nên không thể thêm liên hệ mới. Vui lòng SAO CHÉP (clone) thành chiến dịch mới để thêm liên hệ.',
        confirmText: 'Sao chép chiến dịch',
        cancelText: 'Đóng',
        variant: 'info',
      });
      if (ok && onClone) {
        onClone(campaign.id);
      }
      return;
    }
    setShowTargetSelector(true);
  };

  const createdDateStr = campaign.created_at
    ? new Date(campaign.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/50 dark:bg-gray-900 text-gray-900 dark:text-white">
      {/* ── Top Header Bar ── */}
      <div className="px-6 py-4 bg-white dark:bg-gray-850 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <h2 className="text-lg font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
              <span>{campaign.name}</span>
              {campaign.priority === 'high' && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
                  🔴 Ưu tiên Cao
                </span>
              )}
            </h2>
            {/* Status Badge — phân biệt 5 trạng thái thực thi */}
            {campaign.status === 'active' ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold flex items-center gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 animate-pulse">
                🟢 Đang chạy
              </span>
            ) : campaign.status === 'queued' ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold flex items-center gap-1 bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                📦 Đang chờ ({campaign.queue_position ? `#${campaign.queue_position} trong hàng đợi` : 'Hàng đợi'})
              </span>
            ) : campaign.pause_reason === 'code_127' ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold flex items-center gap-1 bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30"
                title="Zalo chặn tài khoản gửi tin nhắn cho người lạ (Mã 127). Vui lòng đổi nick hoặc dừng gửi người lạ 24h-72h">
                🛑 Tạm dừng (Zalo khóa gửi tin người lạ - Mã 127)
              </span>
            ) : campaign.pause_reason === 'code_108' ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold flex items-center gap-1 bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30"
                title="Zalo tạm khóa gửi tin nhắn do gửi quá nhanh / nghi vấn spam (Mã 108). Tạm nghỉ 6h-24h và tăng delay">
                🛑 Tạm dừng (Zalo nghi ngờ Spam - Mã 108)
              </span>
            ) : campaign.pause_reason === 'code_3001' ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold flex items-center gap-1 bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30"
                title="Nội dung tin nhắn chứa link cấm hoặc từ khóa vi phạm (Mã 3001). Vui lòng sửa lại mẫu tin">
                🛑 Tạm dừng (Nội dung chứa từ/link cấm - Mã 3001)
              </span>
            ) : campaign.pause_reason === 'session_expired' || campaign.pause_reason === 'code_-5000' || campaign.pause_reason === 'code_1001' ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold flex items-center gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                title="Phiên đăng nhập QR của Nick Zalo đã hết hạn hoặc bị đứt kết nối. Vui lòng quét lại mã QR">
                🔑 Tạm dừng (Hết phiên QR Zalo - Cần quét lại QR)
              </span>
            ) : campaign.status === 'paused_quota' || campaign.pause_reason === 'daily_quota' ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold flex items-center gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                title="Đã đạt định mức an toàn gửi tin nhắn/kết bạn trong ngày. Tự động tiếp tục vào 00:00 ngày mới">
                🛑 Tạm dừng (Hết quota ngày - Tự động resume 00:00)
              </span>
            ) : campaign.status === 'paused_quiet' || campaign.pause_reason === 'quiet_hours' ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold flex items-center gap-1 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                🌙 Tạm dừng (Giờ nghỉ đêm)
              </span>
            ) : campaign.status === 'paused' ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold flex items-center gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                ⏸️ Tạm dừng (Thủ công)
              </span>
            ) : campaign.status === 'done' ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold flex items-center gap-1 bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                ✅ Hoàn thành
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold flex items-center gap-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                📝 Nháp
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1 font-medium">
              ⏱ {fmtDelayRange(campaign.delay_min_seconds || Math.max(5, campaign.delay_seconds - 10), campaign.delay_max_seconds || campaign.delay_seconds + 10)}
            </span>
            <span>·</span>
            <span className="flex items-center gap-1 font-medium">
              👥 {contacts.length} liên hệ
            </span>
            {createdDateStr && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1 font-medium">
                  📅 Tạo lúc: {createdDateStr}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons: Sửa chiến dịch & Sao chép sang Zalo khác & Tiếp tục / Tạm dừng */}
        <div className="flex items-center gap-2">
          {onCopyToAccounts && (
            <button
              onClick={() => onCopyToAccounts(campaign)}
              className="px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1.5 transition-all shadow-2xs"
              title="Sao chép kịch bản chiến dịch sang các tài khoản Zalo khác"
            >
              <span>📋</span>
              <span>Sao chép sang Zalo khác</span>
            </button>
          )}

          {onUpdate && (
            <button
              onClick={handleEditAttempt}
              className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1.5 transition-all shadow-2xs"
            >
              <span>✏️</span>
              <span>Sửa chiến dịch</span>
            </button>
          )}

          {campaign.status === 'active' ? (
            <button
              onClick={() => onStatusChange(campaign.id, 'paused')}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
            >
              <span>⏸</span>
              <span>Tạm dừng</span>
            </button>
          ) : campaign.status === 'done' ? (
            <button
              onClick={() => setShowRestartModal(true)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
            >
              <span>🔄</span>
              <span>Chạy lại</span>
            </button>
          ) : campaign.status === 'draft' ? (
            <button
              onClick={() => onStatusChange(campaign.id, 'active')}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
            >
              <span>▶</span>
              <span>Bắt đầu</span>
            </button>
          ) : (
            <button
              onClick={() => onStatusChange(campaign.id, 'active')}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
            >
              <span>▶</span>
              <span>Tiếp tục</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-5 flex flex-col min-h-0">
        {/* Banner khi chiến dịch chưa có đối tượng gửi */}
        {stats.total === 0 && (
          <div className="mb-4 bg-gradient-to-r from-blue-500/10 via-blue-600/10 to-indigo-500/10 border border-blue-500/30 rounded-2xl p-3.5 flex items-center justify-between gap-4 shadow-xs flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center text-lg flex-shrink-0 shadow-md">
                🎯
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-900 dark:text-white">Chiến dịch chưa có danh sách đối tượng nhận tin</h4>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">Thêm bạn bè Zalo, danh sách nhóm hoặc file SĐT để khởi chạy chiến dịch này.</p>
              </div>
            </div>
            <button
              onClick={() => setShowTargetSelector(true)}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md flex-shrink-0 active:scale-95 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white flex-shrink-0">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Thêm đối tượng gửi</span>
            </button>
          </div>
        )}

        {/* ── UNIFIED SINGLE SECTION CONTAINER (Gộp 3 phần thành 1 Section duy nhất) ── */}
        <div className="bg-white dark:bg-gray-850 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">

          {/* 1. Integrated KPI Summary Row (Thống Kê Tổng Quan) */}
          <div className="px-5 py-3 bg-gray-50/60 dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-800 grid grid-cols-4 gap-4 flex-shrink-0">
            {/* Item 1: Tổng số */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-base flex-shrink-0">
                👤
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Tổng số</p>
                <p className="text-lg font-black text-gray-900 dark:text-white leading-none mt-0.5">{stats.total}</p>
              </div>
            </div>

            {/* Item 2: Thành công */}
            <div className="flex items-center gap-3 border-l border-gray-200 dark:border-gray-700/60 pl-4">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-base flex-shrink-0">
                ✅
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Thành công</p>
                <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none mt-0.5">{stats.sentCount}</p>
              </div>
            </div>

            {/* Item 3: Thất bại */}
            <div className="flex items-center gap-3 border-l border-gray-200 dark:border-gray-700/60 pl-4">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center text-base flex-shrink-0">
                ❌
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Thất bại</p>
                <p className="text-lg font-black text-rose-600 dark:text-rose-400 leading-none mt-0.5">{stats.failedCount}</p>
              </div>
            </div>

            {/* Item 4: Đang chờ */}
            <div className="flex items-center gap-3 border-l border-gray-200 dark:border-gray-700/60 pl-4">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-base flex-shrink-0">
                🟧
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Đang chờ</p>
                <p className="text-lg font-black text-amber-600 dark:text-amber-400 leading-none mt-0.5">{stats.pendingCount}</p>
              </div>
            </div>
          </div>

          {/* 2. Integrated Template Preview Row (Xem Trước Kịch Bản) */}
          <div
            onClick={handleEditAttempt}
            className="px-5 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-850 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 cursor-pointer transition-colors group flex-shrink-0 space-y-1.5"
            title="Bấm bất kỳ đâu trong phần preview này để chỉnh sửa chiến dịch"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  Template tin nhắn
                </span>
                <span className="text-[10px] bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40 px-2 py-0.5 rounded-md font-semibold inline-flex items-center gap-1">
                  <span>🔄</span>
                  <span>Chế độ: {templateInfo.modeText}</span>
                </span>
              </div>
              {onUpdate && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleEditAttempt(); }}
                  className="px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-[11px] font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 flex items-center gap-1 transition-all shadow-2xs group-hover:border-blue-400 group-hover:text-blue-600"
                >
                  <span>✏️</span>
                  <span>Sửa nội dung</span>
                </button>
              )}
            </div>

            <div className="space-y-1">
              {templateInfo.blocks.map((b: any, idx: number) => (
                <div key={idx} className="bg-gray-50/80 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/50 rounded-lg px-2.5 py-1 text-xs flex items-center justify-between gap-3 group-hover:border-blue-200 dark:group-hover:border-blue-900/40 transition-colors">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-bold text-blue-600 dark:text-blue-400 text-[11px] flex-shrink-0">Mẫu {idx + 1}:</span>
                    <span className="text-gray-800 dark:text-gray-200 truncate text-[11px]">{b.text || '(Chưa có nội dung văn bản)'}</span>
                  </div>
                  {b.images && b.images.length > 0 && (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded flex-shrink-0 flex items-center gap-1 border border-emerald-200 dark:border-emerald-800/40">
                      <span>🖼️</span>
                      <span>+{b.images.length} ảnh</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 3. Integrated Filter & Action Bar (Sửa triệt để lỗi cắt giao diện) */}
          <div className="px-4 py-2.5 bg-gray-50/40 dark:bg-gray-800/30 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3 text-[11px] flex-shrink-0">
            <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
              <span className="text-gray-400 font-bold uppercase text-[10px] mr-1 flex-shrink-0">Lọc:</span>
              <button
                onClick={() => { setFilterStatus('all'); setPage(0); }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${filterStatus === 'all' ? 'bg-blue-600 text-white shadow-2xs' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100'}`}
              >
                Tất cả ({contacts.length})
              </button>
              <button
                onClick={() => { setFilterStatus('sent'); setPage(0); }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${filterStatus === 'sent' ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-white dark:bg-gray-800 text-emerald-600 border border-gray-200 dark:border-gray-700 hover:bg-gray-100'}`}
              >
                ✓ Thành công ({stats.sentCount})
              </button>
              <button
                onClick={() => { setFilterStatus('failed'); setPage(0); }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${filterStatus === 'failed' ? 'bg-rose-600 text-white shadow-2xs' : 'bg-white dark:bg-gray-800 text-rose-600 border border-gray-200 dark:border-gray-700 hover:bg-gray-100'}`}
              >
                ✕ Thất bại ({stats.failedCount})
              </button>
              {campaign.campaign_type === 'mixed' && (
                <>
                  <button
                    onClick={() => { setFilterStatus('msg_failed'); setPage(0); }}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${filterStatus === 'msg_failed' ? 'bg-rose-700 text-white shadow-2xs' : 'bg-white dark:bg-gray-800 text-rose-700 border border-gray-200 dark:border-gray-700 hover:bg-gray-100'}`}
                  >
                    📩 Lỗi gửi tin ({stats.msgFailedCount})
                  </button>
                  <button
                    onClick={() => { setFilterStatus('friend_failed'); setPage(0); }}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${filterStatus === 'friend_failed' ? 'bg-amber-600 text-white shadow-2xs' : 'bg-white dark:bg-gray-800 text-amber-600 border border-gray-200 dark:border-gray-700 hover:bg-gray-100'}`}
                  >
                    🤝 Lỗi kết bạn ({stats.friendFailedCount})
                  </button>
                  {stats.inviteFailedCount > 0 && (
                    <button
                      onClick={() => { setFilterStatus('invite_failed'); setPage(0); }}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all ${filterStatus === 'invite_failed' ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-white dark:bg-gray-800 text-indigo-600 border border-gray-200 dark:border-gray-700 hover:bg-gray-100'}`}
                    >
                      👥 Lỗi mời nhóm ({stats.inviteFailedCount})
                    </button>
                  )}
                </>
              )}
              {stats.blockedCount > 0 && (
                <button
                  onClick={() => { setFilterStatus('blocked'); setPage(0); }}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${filterStatus === 'blocked' ? 'bg-red-700 text-white shadow-2xs' : 'bg-white dark:bg-gray-800 text-red-600 border border-gray-200 dark:border-gray-700 hover:bg-gray-100'}`}
                >
                  🚫 Chặn người lạ ({stats.blockedCount})
                </button>
              )}
              <button
                onClick={() => { setFilterStatus('pending'); setPage(0); }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${filterStatus === 'pending' ? 'bg-gray-700 text-white shadow-2xs' : 'bg-white dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700 hover:bg-gray-100'}`}
              >
                ⏳ Chờ gửi ({stats.pendingCount})
              </button>
            </div>

            {/* Action Buttons: Thêm liên hệ & Xóa liên hệ (Giao diện phẳng không bị cắt) */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleAddContactsClick}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer flex-shrink-0"
                title="Thêm thêm liên hệ / đối tượng mới vào chiến dịch này"
              >
                <svg className="w-3.5 h-3.5 text-white flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Thêm liên hệ</span>
              </button>

              <button
                onClick={handleRemoveSelected}
                disabled={selectedIds.size === 0 || removing}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all border shadow-xs flex-shrink-0 ${
                  selectedIds.size > 0
                    ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800 cursor-pointer active:scale-95'
                    : 'bg-gray-100 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-600 dark:border-gray-700 cursor-not-allowed opacity-60'
                }`}
                title={selectedIds.size > 0 ? `Xóa ${selectedIds.size} liên hệ đã chọn khỏi chiến dịch` : 'Chọn ít nhất 1 liên hệ trạng thái Chờ gửi để xóa'}
              >
                <span>🗑️</span>
                <span>{selectedIds.size > 0 ? `Xóa (${selectedIds.size})` : 'Xóa liên hệ'}</span>
              </button>
            </div>
          </div>

          {/* 4. Integrated Data Table (Scrollable Body) */}
          <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 bg-white dark:bg-gray-850">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allPendingSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="p-3 w-12 text-center">STT</th>
                  <th className="p-3">LIÊN HỆ</th>
                  <th className="p-3">SỐ ĐIỆN THOẠI</th>
                  <th className="p-3">TRẠNG THÁI</th>
                  <th className="p-3">THỜI GIAN</th>
                  <th className="p-3 w-10 text-center">···</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-850">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
                      Đang tải danh sách liên hệ...
                    </td>
                  </tr>
                ) : filteredContacts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
                      {filterStatus !== 'all' ? 'Không có liên hệ nào trùng khớp với bộ lọc' : 'Chưa có liên hệ nào trong chiến dịch này'}
                    </td>
                  </tr>
                ) : (
                  pagedContacts.map((c, idx) => {
                    const stt = page * pageSize + idx + 1;
                    const isPending = c.status === 'pending';
                    const isChecked = selectedIds.has(c.contact_id);
                    const errInfo = parseContactError(c);

                    return (
                      <tr key={c.id || c.contact_id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 bg-white dark:bg-gray-850 transition-colors">
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!isPending}
                            onChange={() => toggleSelect(c.contact_id, isPending)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-30"
                          />
                        </td>
                        <td className="p-3 text-center font-bold text-gray-400">
                          {stt}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            {c.avatar ? (
                              <img src={c.avatar} alt="" className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-700" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-xs">
                                {(c.display_name || 'U').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span className="font-normal text-gray-900 dark:text-white truncate">
                              {c.display_name || c.contact_id}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 font-semibold text-gray-600 dark:text-gray-300 tabular-nums">
                          {c.phone || '--'}
                        </td>
                        <td className="p-3">
                          {c.status === 'sent' ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 text-[11px] font-bold inline-flex items-center gap-1">
                              <span>✓</span> Sent
                            </span>
                          ) : c.status === 'failed' ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {campaign.campaign_type === 'mixed' ? (
                                <>
                                  {errInfo.isMsgFailed ? (
                                    <span
                                      onClick={() => { setSelectedErrorContact(c); setShowErrorModal(true); }}
                                      className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer hover:scale-105 transition-transform"
                                      title="Click để xem chi tiết lỗi gửi tin"
                                    >
                                      <span>✕</span> Lỗi gửi tin
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 text-[11px] font-bold inline-flex items-center gap-1">
                                      <span>✓</span> Tin nhắn OK
                                    </span>
                                  )}

                                  {errInfo.isFriendFailed ? (
                                    <span
                                      onClick={() => { setSelectedErrorContact(c); setShowErrorModal(true); }}
                                      className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer hover:scale-105 transition-transform"
                                      title="Click để xem chi tiết lỗi kết bạn"
                                    >
                                      <span>✕</span> Lỗi kết bạn
                                    </span>
                                  ) : errInfo.isBlocked ? (
                                    <span
                                      onClick={() => { setSelectedErrorContact(c); setShowErrorModal(true); }}
                                      className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer hover:scale-105 transition-transform"
                                      title="Người dùng cài đặt chặn người lạ"
                                    >
                                      <span>🚫</span> Chặn người lạ
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 text-[11px] font-bold inline-flex items-center gap-1">
                                      <span>✓</span> Kết bạn OK
                                    </span>
                                  )}

                                  {errInfo.isInviteFailed && (
                                    <span
                                      onClick={() => { setSelectedErrorContact(c); setShowErrorModal(true); }}
                                      className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer hover:scale-105 transition-transform"
                                      title="Click để xem chi tiết lỗi mời nhóm"
                                    >
                                      <span>✕</span> Lỗi mời nhóm
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span
                                  onClick={() => { setSelectedErrorContact(c); setShowErrorModal(true); }}
                                  className="px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer hover:scale-105 transition-transform"
                                  title="Click để xem chi tiết lỗi"
                                >
                                  <span>✕</span> Failed
                                  <span className="text-[10px] ml-0.5 opacity-80">ℹ️</span>
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700 text-[11px] font-semibold inline-flex items-center gap-1">
                              <span>⏳</span> Pending
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-gray-500 dark:text-gray-400 text-[11px] tabular-nums">
                          {fmtTime(c.sent_at)}
                        </td>
                        <td className="p-3 text-center">
                          <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">
                            ⋮
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Table Pagination Footer (Anchored to Bottom & Matching Left Footer Height) ── */}
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-4 flex-wrap text-xs text-gray-500 mt-auto bg-white dark:bg-gray-850 h-[52px] flex-shrink-0">
            <div className="flex items-center gap-1">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
                className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-800 dark:text-gray-200 focus:outline-none"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
              </select>
              <span>/ trang</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                ‹
              </button>

              <span className="w-7 h-7 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-2xs">
                {page + 1}
              </span>

              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                ›
              </button>

              {/* Quick Page Size Pill Buttons (Matching Mockup: [20] [50] [200] [500]) */}
              <div className="flex items-center gap-1 ml-2">
                {[20, 50, 200, 500].map(sz => (
                  <button
                    key={sz}
                    onClick={() => { setPageSize(sz); setPage(0); }}
                    className={`px-2.5 py-1 rounded-lg border font-bold text-[11px] transition-colors cursor-pointer ${
                      pageSize === sz
                        ? 'border-blue-600 bg-blue-600 text-white shadow-2xs'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Target Selector Modal */}
      {showTargetSelector && (
        <TargetSelector
          zaloId={zaloId}
          allLabels={allLabels}
          localLabels={localLabels}
          localLabelThreadMap={localLabelThreadMap}
          existingContactIds={new Set(contacts.flatMap((c: any) => [c.contact_id, c.phone ? `phone:${c.phone}` : '']))}
          existingIds={new Set(contacts.flatMap((c: any) => [c.contact_id, c.phone ? `phone:${c.phone}` : '']))}
          onConfirm={handleConfirmTargets}
          onClose={() => setShowTargetSelector(false)}
        />
      )}

      {/* Edit Modal */}
      {showEdit && (
        <CampaignCreateModal
          initialData={campaign as any}
          editMode
          zaloId={zaloId}
          onClose={() => setShowEdit(false)}
          onSave={async data => {
            if (onUpdate) await onUpdate(data as any);
            setShowEdit(false);
            loadContacts();
          }}
        />
      )}

      {/* Restart Campaign Modal */}
      <RestartCampaignModal
        isOpen={showRestartModal}
        onClose={() => setShowRestartModal(false)}
        campaign={campaign}
        zaloId={zaloId}
        onSuccess={() => {
          onStatusChange(campaign.id, 'active');
          loadContacts();
        }}
      />

      {/* Error Detail Modal */}
      <ErrorDetailModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        contact={selectedErrorContact}
        parseContactError={parseContactError}
      />
    </div>
  );
}

interface ErrorDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: any;
  parseContactError: (c: any) => { isMsgFailed: boolean; isFriendFailed: boolean; isInviteFailed: boolean; isBlocked: boolean; rawError: string };
}

const ErrorDetailModal: React.FC<ErrorDetailModalProps> = ({
  isOpen,
  onClose,
  contact,
  parseContactError,
}) => {
  if (!isOpen || !contact) return null;

  const errStr = contact.error || 'Lỗi không xác định khi gửi';
  const { isMsgFailed, isFriendFailed, isInviteFailed, isBlocked } = parseContactError(contact);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-rose-50/50 dark:bg-rose-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xl font-bold">
              ⚠️
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Chi tiết lỗi gửi liên hệ
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold truncate max-w-[240px]">
                {contact.display_name || contact.contact_id} ({contact.phone || 'SĐT --'})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {/* Action failure badges */}
          <div className="flex flex-wrap gap-2">
            {isMsgFailed && (
              <span className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold border border-rose-300 dark:border-rose-800">
                ✕ Lỗi gửi tin nhắn
              </span>
            )}
            {isFriendFailed && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-800">
                ✕ Lỗi kết bạn
              </span>
            )}
            {isInviteFailed && (
              <span className="px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-300 dark:border-indigo-800">
                ✕ Lỗi mời vào nhóm
              </span>
            )}
            {isBlocked && (
              <span className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 font-bold border border-red-500/20">
                🚫 Cài đặt Chặn người lạ
              </span>
            )}
          </div>

          {/* Full error details box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-gray-700 dark:text-gray-300">Thông điệp lỗi chi tiết từ Zalo:</label>
              {contact.error && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 font-bold">
                  {parseZaloError(contact.error).title}
                </span>
              )}
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 font-mono text-[11px] text-rose-600 dark:text-rose-400 break-words leading-relaxed select-text max-h-40 overflow-y-auto">
              {errStr}
            </div>
          </div>

          {/* Suggested Resolution via ZaloErrorDictionary */}
          {(() => {
            const detail = parseZaloError(contact.error);
            const isAccountLimit = detail.category === 'ACCOUNT_LIMIT';
            return (
              <div className={`p-3.5 rounded-2xl border space-y-1.5 ${
                isAccountLimit
                  ? 'bg-amber-500/10 border-amber-500/30 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                  : 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/40 text-gray-800 dark:text-gray-200'
              }`}>
                <div className={`font-bold flex items-center gap-1.5 text-xs ${
                  isAccountLimit ? 'text-amber-700 dark:text-amber-400' : 'text-blue-700 dark:text-blue-400'
                }`}>
                  <span>{isAccountLimit ? '🛑' : '💡'}</span>
                  <span>{isAccountLimit ? `Lỗi Hạn Ngạch Nick Bạn: ${detail.title}` : 'Gợi ý hướng xử lý:'}</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {detail.actionableAdvice || (isBlocked
                    ? 'Khách hàng cài đặt không nhận tin/lời mời từ người lạ. Nên liên hệ qua Cuộc gọi điện thoại hoặc SMS.'
                    : 'Lỗi tạm thời (do hạn mức Zalo ngày hoặc gián đoạn mạng). Bạn có thể bấm "Chạy lại chiến dịch" sau 00:00 hoặc chuyển sang tài khoản Zalo khác.')}
                </p>
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs active:scale-95"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
};
