import React, { useEffect, useState, useCallback, useMemo } from 'react';
import type { CRMCampaign } from '@/store/crmStore';
import type { LabelData } from '@/store/appStore';
import { showConfirm } from '@/components/common/ConfirmDialog';
import ipc from '@/lib/ipc';
import TargetSelector from './TargetSelector';
import CampaignCreateModal from './CampaignCreateModal';
import { RestartCampaignModal } from './RestartCampaignModal';
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

  const stats = useMemo(() => {
    const total = contacts.length;
    const sentCount = contacts.filter(c => c.status === 'sent').length;
    const failedCount = contacts.filter(c => c.status === 'failed').length;
    const pendingCount = contacts.filter(c => c.status === 'pending' || c.status === 'sending').length;

    return { total, sentCount, failedCount, pendingCount };
  }, [contacts]);

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

  const totalPages = Math.max(1, Math.ceil(contacts.length / pageSize));
  const pagedContacts = contacts.slice(page * pageSize, (page + 1) * pageSize);

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

      <div className="flex-1 overflow-y-auto p-6 space-y-5 flex flex-col justify-between min-h-0">
        {/* Banner khi chiến dịch chưa có đối tượng gửi */}
        {stats.total === 0 && (
          <div className="bg-gradient-to-r from-blue-500/10 via-blue-600/10 to-indigo-500/10 border border-blue-500/30 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xl flex-shrink-0 shadow-md">
                🎯
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">Chiến dịch chưa có danh sách đối tượng nhận tin</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Thêm bạn bè Zalo, danh sách nhóm hoặc file SĐT để khởi chạy chiến dịch này.</p>
              </div>
            </div>
            <button
              onClick={() => setShowTargetSelector(true)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold flex items-center gap-1.5 transition-all shadow-md flex-shrink-0 active:scale-95 cursor-pointer"
            >
              <span>➕</span>
              <span>Thêm đối tượng gửi</span>
            </button>
          </div>
        )}

        {/* ── Grid 4 Summary KPI Cards (Matching Mockup Image) ── */}
        <div className="grid grid-cols-4 gap-4">
          {/* Card 1: Tổng số */}
          <div className="bg-white dark:bg-gray-850 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 flex items-center gap-3.5 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl flex-shrink-0">
              👤
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Tổng số</p>
              <p className="text-2xl font-black text-gray-900 dark:text-white leading-tight">{stats.total}</p>
            </div>
          </div>

          {/* Card 2: Thành công */}
          <div className="bg-white dark:bg-gray-850 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 flex items-center gap-3.5 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl flex-shrink-0">
              ✅
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Thành công</p>
              <p className="text-2xl font-black text-gray-900 dark:text-white leading-tight">{stats.sentCount}</p>
            </div>
          </div>

          {/* Card 3: Thất bại */}
          <div className="bg-white dark:bg-gray-850 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 flex items-center gap-3.5 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xl flex-shrink-0">
              ❌
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Thất bại</p>
              <p className="text-2xl font-black text-gray-900 dark:text-white leading-tight">{stats.failedCount}</p>
            </div>
          </div>

          {/* Card 4: Đang chờ */}
          <div className="bg-white dark:bg-gray-850 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 flex items-center gap-3.5 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl flex-shrink-0">
              🟧
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Đang chờ</p>
              <p className="text-2xl font-black text-gray-900 dark:text-white leading-tight">{stats.pendingCount}</p>
            </div>
          </div>
        </div>

        {/* ── Template Tin Nhắn Section Card (Clickable to Edit) ── */}
        <div
          onClick={handleEditAttempt}
          className="bg-white dark:bg-gray-850 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-xs space-y-3 cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 transition-all hover:shadow-sm group relative"
          title="Bấm bất kỳ đâu trong phần preview này để chỉnh sửa chiến dịch"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Template tin nhắn
              </h3>
            </div>
            {onUpdate && (
              <button
                onClick={(e) => { e.stopPropagation(); handleEditAttempt(); }}
                className="px-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 flex items-center gap-1.5 transition-all shadow-2xs group-hover:border-blue-400 group-hover:text-blue-600"
              >
                <span>✏️</span>
                <span>Sửa nội dung</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5">
              <span>🔄</span>
              <span>Chế độ: {templateInfo.modeText}</span>
            </span>
          </div>

          <div className="space-y-2">
            {templateInfo.blocks.map((b: any, idx: number) => (
              <div key={idx} className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 rounded-xl p-3 text-xs flex items-center justify-between gap-3 group-hover:border-blue-200 dark:group-hover:border-blue-900/40 transition-colors">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">Mẫu {idx + 1}:</span>
                  <span className="text-gray-800 dark:text-gray-200 truncate">{b.text || '(Chưa có nội dung văn bản)'}</span>
                </div>
                {b.images && b.images.length > 0 && (
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md flex-shrink-0 flex items-center gap-1 border border-emerald-200 dark:border-emerald-800/40">
                    <span>🖼️</span>
                    <span>+{b.images.length} ảnh</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Bảng Dữ Liệu Liên Hệ Trong Chiến Dịch ── */}
        <div className="bg-white dark:bg-gray-850 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-col flex-1 min-h-[340px] justify-between overflow-hidden">
          {/* Header Bar */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-white">
              {contacts.length} liên hệ
            </h3>

            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button
                  onClick={handleRemoveSelected}
                  disabled={removing}
                  className="px-3.5 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/80 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                >
                  <span>🗑️</span>
                  <span>Xóa {selectedIds.size} liên hệ đã chọn</span>
                </button>
              )}
              <button
                onClick={handleAddContactsClick}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
              >
                <span className="text-sm font-bold">+</span>
                <span>Thêm liên hệ</span>
              </button>
            </div>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto">
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
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
                      Đang tải danh sách liên hệ...
                    </td>
                  </tr>
                ) : contacts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
                      Chưa có liên hệ nào trong chiến dịch này
                    </td>
                  </tr>
                ) : (
                  pagedContacts.map((c, idx) => {
                    const stt = page * pageSize + idx + 1;
                    const isPending = c.status === 'pending';
                    const isChecked = selectedIds.has(c.contact_id);

                    return (
                      <tr key={c.id || c.contact_id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
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
                            <span className="px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40 text-[11px] font-bold inline-flex items-center gap-1" title={c.error}>
                              <span>✕</span> Failed
                            </span>
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
                    className={`px-2.5 py-1 rounded-lg border font-bold text-[11px] transition-colors ${
                      pageSize === sz
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
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
    </div>
  );
}
