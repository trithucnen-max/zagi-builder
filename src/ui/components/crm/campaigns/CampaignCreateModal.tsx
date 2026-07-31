import React, { useState, useEffect, useRef, useMemo } from 'react';
import ipc from '@/lib/ipc';
import { toLocalMediaUrl } from '@/lib/localMedia';
import AppIcon from '@/components/common/AppIcon';
import { useAppStore } from '@/store/appStore';
import { useAccountStore } from '@/store/accountStore';
import UnifiedLabelPickerModal, { LoadedLabelOption } from '../modals/UnifiedLabelPickerModal';
import DataAccessor from '@/lib/data/DataAccessor';
import LibraryPickerModal from '@/components/chat/library/LibraryPickerModal';
import CampaignVarPopup from './CampaignVarPopup';
import { substitutePreviewCampaign } from './campaignVars';

// ── Types ─────────────────────────────────────────────────────────────────────

type CampaignType = 'message' | 'friend_request' | 'mixed' | 'invite_to_group';
type MixedAction  = 'message' | 'friend_request' | 'invite_to_groups';
type SendMode     = 'random' | 'all';

export type ZaloAliasRule = 'none' | 'campaign_name_phone' | 'name_phone';
export type SendOrder = 'image_first' | 'text_first';
export interface MixedConfig   { actions: MixedAction[]; group_ids?: string[]; zalo_alias_rule?: ZaloAliasRule; send_order?: SendOrder; }
export interface ContentBlock  { id: string; text: string; images: string[]; }
export interface ContentConfig { mode: SendMode; blocks: ContentBlock[]; }

interface CampaignFormData {
  name: string;
  template_message: string;
  friend_request_message: string;
  campaign_type: CampaignType;
  mixed_config: string;
  delay_seconds: number;
  delay_min_seconds?: number;
  delay_max_seconds?: number;
  per_contact_delay_min_seconds?: number;
  per_contact_delay_max_seconds?: number;
  daily_send_limit: number;
  daily_start_time: string;
  scheduled_start_at?: number;
}

interface CampaignCreateModalProps {
  initialData?: Partial<CampaignFormData>;
  editMode?: boolean;
  zaloId?: string;
  onClose: () => void;
  onSave: (data: CampaignFormData) => Promise<void>;
}

// Preview substitution — dùng hàm từ campaignVars.ts
const substitutePreview = substitutePreviewCampaign;

// ── Helpers ───────────────────────────────────────────────────────────────────

const genId = () => Math.random().toString(36).slice(2, 9);

function parseContentConfig(raw?: string): ContentConfig {
  if (!raw) return { mode: 'random', blocks: [{ id: genId(), text: '', images: [] }] };
  try {
    const p = JSON.parse(raw);
    if (p?.blocks && Array.isArray(p.blocks)) {
      // Sanitize: ensure every block.images is string[]
      const sanitized = (p.blocks as any[]).map((b: any) => ({
        id: String(b.id ?? genId()),
        text: String(b.text ?? ''),
        images: Array.isArray(b.images)
          ? (b.images as any[]).filter((img): img is string => typeof img === 'string')
          : [],
      }));
      return { mode: p.mode === 'all' ? 'all' : 'random', blocks: sanitized };
    }
  } catch {}
  return { mode: 'random', blocks: [{ id: genId(), text: raw, images: [] }] };
}

function parseMixedConfig(raw?: string): MixedConfig {
  if (!raw) return { actions: ['message', 'friend_request'], zalo_alias_rule: 'none', send_order: 'image_first' };
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object') {
      return {
        actions: Array.isArray(p.actions) ? p.actions : ['message', 'friend_request'],
        group_ids: Array.isArray(p.group_ids) ? p.group_ids : [],
        zalo_alias_rule: (p.zalo_alias_rule === 'campaign_name_phone' || p.zalo_alias_rule === 'name_phone') ? p.zalo_alias_rule : 'none',
        send_order: p.send_order === 'text_first' ? 'text_first' : 'image_first',
      };
    }
  } catch {}
  return { actions: ['message', 'friend_request'], zalo_alias_rule: 'none', send_order: 'image_first' };
}


function fmtDelayRange(min: number, max: number): string {
  if (min === max) {
    if (min < 60) return `${min}s`;
    if (min < 3600) return `${Math.round(min / 60)}m`;
    return `${Math.round(min / 3600)}h`;
  }
  const fmt = (s: number) => {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    return `${Math.round(s / 3600)}h`;
  };
  return `${fmt(min)}-${fmt(max)}`;
}

const DELAY_PRESETS = [
  { label: '5-15s',   min: 5,   max: 15 },
  { label: '30-60s',  min: 30,  max: 60 },
  { label: '2-3ph',   min: 120, max: 180 },
  { label: '5-10ph',  min: 300, max: 600 },
];

const PC_DELAY_PRESETS = [
  { label: 'Không',   min: 0,   max: 0   },
  { label: '5-15s',   min: 5,   max: 15  },
  { label: '15-30s',  min: 15,  max: 30  },
  { label: '30-60s',  min: 30,  max: 60  },
];

const TYPE_OPTIONS: { value: CampaignType; icon: string; label: string }[] = [
  { value: 'message',         icon: 'chat', label: 'Tin nhắn'   },
  { value: 'friend_request',  icon: 'user_plus', label: 'Kết bạn'    },
  { value: 'invite_to_group', icon: 'user_check', label: 'Mời nhóm'   },
  { value: 'mixed',           icon: 'shuffle', label: 'Hỗn hợp'    },
];

const INVITE_ERROR_LABELS: Record<number, string> = {
  269: 'Chưa là bạn bè', 178: 'Đã là thành viên', 263: 'Đã gửi lời mời',
  262: 'Đã có lời mời',  177: 'Nhóm đầy',          166: 'Không có quyền',
  245: 'Người lạ',       122: 'Bị chặn',            247: 'Bị bỏ qua nhóm',
};

// ── Live Preview Component ─────────────────────────────────────────────────────

function LivePreview({
  blocks, activeIdx, mode, type, friendMsg, campaignName = '',
  onTabChange, zaloId,
}: {
  blocks: ContentBlock[];
  activeIdx: number;
  mode: SendMode;
  type: CampaignType;
  friendMsg: string;
  campaignName?: string;
  onTabChange: (i: number) => void;
  zaloId?: string;
}) {
  const block = blocks[activeIdx] ?? blocks[0];

  const previewText = type === 'friend_request'
    ? substitutePreview(friendMsg, campaignName)
    : substitutePreview(block?.text ?? '', campaignName);

  const hasImages = (block?.images?.length ?? 0) > 0;
  const isFR      = type === 'friend_request';

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Xem trước</span>
        {!isFR && blocks.length > 1 && (
          <span className="text-[10px] text-gray-555">
            {mode === 'random' ? '🎲 Random' : '📨 Tất cả'}
          </span>
        )}
      </div>

      {/* Block tabs (when multiple blocks) */}
      {!isFR && blocks.length > 1 && (
        <div className="flex gap-1 mb-2 flex-wrap flex-shrink-0">
          {blocks.map((b, i) => (
            <button key={b.id} onClick={() => onTabChange(i)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors border ${
                i === activeIdx
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500'
              }`}>
              Nội dung {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Phone-style preview */}
      <div className="flex-1 min-h-0 flex flex-col border border-gray-700 rounded-xl overflow-hidden shadow-sm bg-gray-900">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">Z</div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-gray-200 truncate">Nguyễn Văn A</p>
            <p className="text-[9px] text-gray-400">Zalo</p>
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50 dark:bg-gray-900">
          {/* Timestamp */}
          <div className="flex justify-center">
            <span className="text-[9px] text-gray-600 dark:text-gray-500 bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded-full">Hôm nay 12:00</span>
          </div>

          {(previewText || hasImages) ? (
            <div className="flex justify-end">
              <div className="flex flex-col items-end gap-1.5 max-w-[85%]">
                {/* Text bubble */}
                {previewText && (
                  <div className="bg-blue-600 text-white rounded-2xl rounded-br-sm px-3 py-2 text-xs leading-relaxed break-words whitespace-pre-wrap">
                    {previewText}
                  </div>
                )}
                {/* Image thumbnails */}
                {hasImages && !isFR && (
                  <div className={`grid gap-1 rounded-xl overflow-hidden ${
                    block.images.length === 1 ? 'grid-cols-1'
                    : block.images.length <= 4 ? 'grid-cols-2'
                    : 'grid-cols-3'
                  }`} style={{ maxWidth: '11.25rem' }}>
                    {block.images.filter(p => typeof p === 'string').map((p, i) => (
                      <div key={i} className="aspect-square overflow-hidden rounded">
                        <img src={toLocalMediaUrl(p, zaloId)} alt="" className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    ))}
                  </div>
                )}
                {/* Status tick */}
                <span className="text-[9px] text-gray-600 dark:text-gray-500">✓✓ Đã gửi</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-4">
              <p className="text-[11px] text-gray-600 italic">
                {isFR ? 'Soạn lời nhắn kết bạn...' : 'Soạn nội dung tin nhắn...'}
              </p>
            </div>
          )}

          {/* Friend request chip */}
          {isFR && previewText && (
            <div className="flex justify-center">
              <div className="border border-blue-500/40 rounded-xl px-3 py-2 text-[11px] text-blue-400 text-center max-w-[90%]">
                🤝 Lời mời kết bạn gửi kèm nội dung trên
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mode explanation */}
      {!isFR && blocks.length > 1 && (
        <div className="mt-2 px-2 text-[10px] text-gray-555 flex-shrink-0">
          {mode === 'random'
            ? `🎲 Mỗi người nhận ngẫu nhiên 1 trong ${blocks.length} nội dung`
            : `📨 Mỗi người nhận cả ${blocks.length} nội dung lần lượt`}
        </div>
      )}
    </div>
  );
}

// ── Group Picker ──────────────────────────────────────────────────────────────

function GroupPicker({
  zaloId, inviteGroupIds, onToggle,
}: {
  zaloId?: string;
  inviteGroupIds: string[];
  onToggle: (id: string) => void;
}) {
  const [groups, setGroups] = useState<{ contact_id: string; display_name: string; avatar_url?: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (loaded || !zaloId) return;
    ipc.db?.getContacts(zaloId).then(res => {
      const contacts: any[] = res?.contacts ?? res ?? [];
      setGroups(contacts.filter((c: any) => c.contact_type === 'group').map((c: any) => ({
        contact_id: c.contact_id,
        display_name: c.display_name || c.contact_id,
        avatar_url: c.avatar_url || '',
      })));
      setLoaded(true);
    });
  }, [zaloId, loaded]);

  const visible = groups.filter(g => !search.trim() || g.display_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full min-h-0">
      <p className="text-[11px] text-yellow-600 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2.5 py-1.5 mb-2 flex-shrink-0">
        ⚠️ Chỉ mời được bạn bè — Không mời được người lạ
      </p>
      {!zaloId ? (
        <p className="text-xs text-gray-500 py-4 text-center">Mở modal từ tab Chiến dịch để xem danh sách nhóm</p>
      ) : !loaded ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
          <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 1 1-6.219-8.56" stroke="currentColor" strokeWidth="2.5"/></svg>
          Đang tải nhóm...
        </div>
      ) : (
        <>
          {/* Search + select all */}
          <div className="flex items-center gap-2 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 mb-2 flex-shrink-0 bg-white dark:bg-gray-900">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500 flex-shrink-0">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm nhóm..." className="flex-1 text-xs text-gray-950 dark:text-gray-200 bg-transparent focus:outline-none placeholder-gray-400 dark:placeholder-gray-500" />
            {(() => {
              const allSel = visible.length > 0 && visible.every(g => inviteGroupIds.includes(g.contact_id));
              return visible.length > 1 ? (
                <button onClick={() => visible.forEach(g => {
                  if (allSel ? inviteGroupIds.includes(g.contact_id) : !inviteGroupIds.includes(g.contact_id))
                    onToggle(g.contact_id);
                })} className="text-[10px] text-blue-450 hover:text-blue-500 flex-shrink-0">
                  {allSel ? 'Bỏ tất cả' : 'Chọn tất cả'}
                </button>
              ) : null;
            })()}
          </div>

          {inviteGroupIds.length > 0 && (
            <p className="text-[11px] text-blue-500 mb-1.5 flex-shrink-0">✓ {inviteGroupIds.length} nhóm đã chọn</p>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg divide-y divide-gray-200 dark:divide-gray-700/50 bg-white dark:bg-gray-800">
            {visible.map(g => {
              const checked = inviteGroupIds.includes(g.contact_id);
              return (
                <label key={g.contact_id}
                  className={`flex items-center gap-2 px-2.5 py-2 cursor-pointer transition-colors ${checked ? 'bg-blue-50/50 dark:bg-blue-500/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}>
                  <div onClick={() => onToggle(g.contact_id)}
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                      checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-500 hover:border-blue-400'
                    }`}>
                    {checked && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  {g.avatar_url
                    ? <img src={g.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">{(g.display_name||'?').charAt(0).toUpperCase()}</div>
                  }
                  <span className={`flex-1 text-xs truncate ${checked ? 'text-blue-700 dark:text-white font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>{g.display_name}</span>
                </label>
              );
            })}
            {visible.length === 0 && (
              <p className="text-xs text-gray-500 text-center py-4">{groups.length === 0 ? 'Chưa có nhóm nào. Đồng bộ nhóm trước.' : 'Không tìm thấy'}</p>
            )}
          </div>

          <details className="mt-2 flex-shrink-0">
            <summary className="text-[10px] text-gray-600 cursor-pointer hover:text-gray-500 select-none">📋 Mã lỗi thường gặp</summary>
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.entries(INVITE_ERROR_LABELS).map(([c, l]) => (
                <span key={c} className="text-[9px] text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600">{c}: {l}</span>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

// ── Block Editor ──────────────────────────────────────────────────────────────

function BlockEditor({
  block, onUpdate, zaloId,
}: {
  block: ContentBlock;
  onUpdate: (u: Partial<ContentBlock>) => void;
  zaloId?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);
  const [showVarPopup, setShowVarPopup] = useState(false);
  const [varPopupTrigger, setVarPopupTrigger] = useState(false); // triggered by { key

  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [uploading, setUploading] = useState(false);

  const QUICK_VARS = [
    { key: '{name}',             label: 'Tên' },
    { key: '{zalo_name}',        label: 'Tên Zalo' },
    { key: '{real_name}',        label: 'Tên thật' },
    { key: '{gender_greeting}',  label: 'Anh/Chị' },
    { key: '{salutation}',       label: 'Xưng hô' },
    { key: '{tu_xung}',          label: 'Tự xưng' },
    { key: '{phone}',            label: 'SĐT' },
    { key: '{birthday_day}',     label: 'Ngày sinh' },
  ];

  const insertVar = (v: string) => {
    const ta = taRef.current;
    if (!ta) { onUpdate({ text: block.text + v }); return; }
    const s = ta.selectionStart ?? block.text.length;
    const e = ta.selectionEnd ?? block.text.length;
    onUpdate({ text: block.text.slice(0, s) + v + block.text.slice(e) });
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + v.length, s + v.length); }, 0);
  };

  const getAiGeneratedText = async (userPrompt: string) => {
    try {
      setAiGenerating(true);
      // Get assistants list
      const listRes = await ipc.ai?.listAssistants();
      const assistantId = listRes?.assistants?.[0]?.id || 'default';
      
      const systemMessage = `Bạn là chuyên gia thiết lập chiến dịch Zalo Marketing & CRM chống khóa tài khoản chuyên nghiệp. 
Nhiệm vụ: Viết mẫu tin nhắn gửi hàng loạt tự nhiên, ấm áp, cá nhân hóa sâu và TỰ ĐỘNG CHÈN NGUYÊN TẮC CHỐNG SPAM ZALO:

1. QUY TẮC CÁ NHÂN HÓA BIẾN CRM:
- {salutation}: danh xưng xưng hô với khách (Anh / Chị / Cô / Chú / Bạn / Sếp / Thầy...)
- {tu_xung}: từ tự xưng của người gửi phù hợp với ngữ cảnh khách (em / cháu / con / mình...)
- {name}: tên liên hệ (alias hoặc tên hiển thị)
- {zalo_name}: tên Zalo gốc của khách
- {alias}: biệt danh CRM riêng
- {gender_greeting}: xưng hô mặc định (Anh/Chị/Bạn)
- {phone}: số điện thoại khách
- {birthday}: ngày sinh đầy đủ (dd/MM/yyyy)
- {birthday_day}: ngày sinh
- {birthday_month}: tháng sinh
- {campaign_name}: tên chiến dịch
- {date}: ngày gửi
- {time}: giờ gửi

2. QUY TẮC CHỐNG SPAM ZALO (SPINTAX):
Bắt buộc chèn Spintax biến đổi từ ngữ ngẫu nhiên dạng {Từ 1|Từ 2|Từ 3} ở đầu câu chào và câu chúc để Zalo không phát hiện tin nhắn trùng lặp 100%.
Ví dụ: "{Dạ|Hi|Xin chào} {salutation} {name}, {tu_xung} gửi {salutation} thông tin..." hoặc "{Chúc|Kính chúc} {salutation} {date} nhiều niềm vui!"

Hãy xuất ra duy nhất nội dung tin nhắn mẫu (chứa các biến và spintax), không kèm bất kỳ câu dẫn nhập hay lời giải thích nào.`;

      const response = await ipc.ai?.chat(assistantId, [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt }
      ]);
      
      if (response?.success && response?.result) {
        onUpdate({ text: response.result });
        setShowAiInput(false);
        setPrompt('');
      } else {
        alert(response?.error || 'Không thể tạo tin nhắn. Vui lòng kiểm tra lại cấu hình AI Assistant trong phần Cài đặt.');
      }
    } catch (e: any) {
      alert(`Lỗi AI: ${e.message}`);
    } finally {
      setAiGenerating(false);
    }
  };

  const pickFromComputer = async () => {
    if (!window.electronAPI) {
      // Mobile / Web Browser native HTML input file picker
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = async (e: any) => {
        const files = Array.from(e.target.files || []) as File[];
        if (!files.length) return;
        setUploading(true);
        try {
          const cleanExisting = block.images.filter((p): p is string => typeof p === 'string' && p.length > 0);
          const uploadedPaths: string[] = [];
          for (const file of files) {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const res = reader.result as string;
                resolve((res.split(',')[1] || '').trim());
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            if (!base64) continue;
            const uploadRes = await DataAccessor.uploadToLibrary({
              zaloId: zaloId || '',
              fileName: file.name,
              mimeType: file.type || 'image/jpeg',
              base64,
            });
            if (uploadRes.success && uploadRes.data) {
              const item = uploadRes.data;
              const pathValue = item._localPath || item.fileUrl || item.uuid;
              uploadedPaths.push(pathValue);
            }
          }
          if (uploadedPaths.length > 0) {
            onUpdate({ images: [...cleanExisting, ...uploadedPaths] });
            useAppStore.getState().showNotification(`Đã tải ${uploadedPaths.length} ảnh lên thư viện thành công`, 'success');
          }
        } catch (err) {
          console.error('[CampaignCreateModal] Web file pick failed:', err);
          useAppStore.getState().showNotification('Lỗi khi tải ảnh từ thiết bị', 'error');
        } finally {
          setUploading(false);
        }
      };
      input.click();
      return;
    }

    const r = await ipc.file?.openDialog({
      filters: [{ name: 'Hình ảnh', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
      multiSelect: true,
    });
    if (r?.filePaths?.length) {
      setUploading(true);
      try {
        const cleanExisting = block.images.filter((p): p is string => typeof p === 'string' && p.length > 0);
        const uploadedPaths: string[] = [];
        
        for (const filePath of r.filePaths) {
          try {
            const readRes = await ipc.file?.readImageAsBase64?.({ localPath: filePath });
            if (!readRes?.success || !readRes.base64) continue;
            
            const baseName = filePath.split(/[/\\]/).pop() || 'image.jpg';
            const uploadRes = await DataAccessor.uploadToLibrary({
              zaloId: zaloId || '',
              fileName: baseName,
              mimeType: readRes.mimeType || 'image/jpeg',
              base64: readRes.base64,
            });
            
            if (uploadRes.success && uploadRes.data) {
              const item = uploadRes.data;
              const pathValue = item._localPath || item.fileUrl || item.uuid;
              uploadedPaths.push(pathValue);
            }
          } catch (uploadErr) {
            console.error('[CampaignCreateModal] Upload error for file:', filePath, uploadErr);
          }
        }
        
        if (uploadedPaths.length > 0) {
          onUpdate({ images: [...cleanExisting, ...uploadedPaths] });
          useAppStore.getState().showNotification(`Đã tải ${uploadedPaths.length} ảnh lên thư viện máy chủ thành công`, 'success');
        } else {
          useAppStore.getState().showNotification('Không thể tải ảnh lên máy chủ. Vui lòng kiểm tra lại kết nối.', 'error');
        }
      } catch (err) {
        console.error('[CampaignCreateModal] pickFromComputer failed:', err);
        useAppStore.getState().showNotification('Lỗi khi tải ảnh từ máy tính', 'error');
      } finally {
        setUploading(false);
      }
    }
  };

  const hasLink = /https?:\/\/[^\s]+/i.test(block.text);

  return (
    <div className="flex flex-col gap-2">
      {/* Variable toolbar: quick chips + more button */}
      <div className="flex items-center justify-between flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium mr-0.5">Chèn:</span>
          {QUICK_VARS.map(v => (
            <button
              key={v.key}
              type="button"
              onClick={() => insertVar(v.key)}
              className="text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30 text-blue-400 hover:bg-blue-500/15 font-medium transition-colors"
              title={v.key}
            >
              {v.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowVarPopup(true)}
            className="text-[10px] px-2 py-0.5 rounded-full border border-gray-500/30 text-gray-400 hover:bg-gray-500/15 font-medium transition-colors"
            title="Xem tất cả biến..."
          >
            ⊕ Thêm biến
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowAiInput(v => !v)}
          className={`flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-semibold transition-colors border ${
            showAiInput
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'border-blue-500/30 text-blue-400 hover:bg-blue-500/15'
          }`}
        >
          🪄 Trợ lý AI
        </button>
      </div>

      {/* Campaign var popup */}
      <CampaignVarPopup
        open={showVarPopup || varPopupTrigger}
        onClose={() => { setShowVarPopup(false); setVarPopupTrigger(false); }}
        onSelect={insertVar}
      />

      {/* Inline AI assist box */}
      {showAiInput && (
        <div className="flex flex-col gap-1.5 p-2 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-500/20 rounded-xl flex-shrink-0">
          <div className="flex gap-2">
            <input
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Yêu cầu AI viết tin nhắn mẫu..."
              className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  if (prompt.trim() && !aiGenerating) getAiGeneratedText(prompt.trim());
                }
              }}
            />
            <button
              type="button"
              disabled={aiGenerating || !prompt.trim()}
              onClick={() => getAiGeneratedText(prompt.trim())}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-semibold flex items-center gap-1 transition-colors"
            >
              {aiGenerating && (
                <svg className="animate-spin w-3 h-3 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {aiGenerating ? 'Đang viết...' : 'Viết mẫu'}
            </button>
          </div>
          <p className="text-[9px] text-blue-400/70">
            💡 AI sẽ tự động chèn các biến xưng hô như `{'{gender_greeting}'}` và `{'{name}'}` vào nội dung.
          </p>
        </div>
      )}

      {/* Textarea — trigger { to open var popup */}
      <textarea
        ref={taRef}
        value={block.text}
        onChange={e => onUpdate({ text: e.target.value })}
        onKeyDown={e => {
          if (e.key === '{' && !e.ctrlKey && !e.metaKey) {
            // Let the { char be typed normally, then open popup
            setTimeout(() => setVarPopupTrigger(true), 0);
          }
        }}
        placeholder={'Soạn nội dung tin nhắn...\nGõ { để chèn biến nhanh, hoặc dùng nút Chèn bên trên'}
        className="min-h-[200px] h-[200px] w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none transition-colors"
      />

      {/* Warning on link */}
      {hasLink && (
        <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium px-1 leading-relaxed">
          ⚠️ Cảnh báo: Tránh gửi đường link (liên kết) trong tin nhắn đầu cho người chưa kết bạn để hạn chế bị quét spam/khóa tài khoản.
        </p>
      )}

      {/* Images */}
      <div className="flex-shrink-0">
        {block.images.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {block.images.filter(p => typeof p === 'string').map((p, i) => (
              <div key={i} className="relative group/img w-14 h-14 rounded-lg overflow-hidden border border-gray-350 dark:border-gray-700 flex-shrink-0">
                <img src={toLocalMediaUrl(p, zaloId)} alt="" className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3'; }} />
                <button type="button"
                  onClick={() => onUpdate({ images: block.images.filter((_, j) => j !== i) })}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-red-400 transition-opacity">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        
        {uploading ? (
          <div className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-blue-500 border border-dashed border-blue-500/30 rounded-lg bg-blue-50/10">
            <svg className="animate-spin w-3 h-3 text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Đang tải ảnh lên máy chủ...
          </div>
        ) : (
          <div className="flex gap-2 w-full">
            <button type="button" onClick={pickFromComputer}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-500 hover:text-blue-600 border border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500/50 rounded-lg transition-colors bg-white dark:bg-gray-800">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              Chọn từ Máy tính
            </button>
            <button type="button" onClick={() => setShowLibraryPicker(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-500 hover:text-blue-600 border border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500/50 rounded-lg transition-colors bg-white dark:bg-gray-800">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              Chọn từ Thư viện
            </button>
          </div>
        )}
      </div>

      {showLibraryPicker && (
        <LibraryPickerModal
          zaloId={zaloId || ''}
          initialType="image"
          onClose={() => setShowLibraryPicker(false)}
          onSelect={(selectedItems) => {
            const cleanExisting = block.images.filter((p): p is string => typeof p === 'string' && p.length > 0);
            const selectedPaths = selectedItems.map(item => item._localPath || item.fileUrl || item.uuid);
            onUpdate({ images: [...cleanExisting, ...selectedPaths] });
          }}
        />
      )}
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function CampaignCreateModal({
  initialData, editMode = false, zaloId, onClose, onSave,
}: CampaignCreateModalProps) {
  const [name,          setName]         = useState(initialData?.name ?? '');
  const [type,          setType]         = useState<CampaignType>(initialData?.campaign_type ?? 'message');

  // ── Delay range between contacts ──
  const getInitMinMax = (): [number, number] => {
    const d = initialData;
    if (!d) return [5, 15];
    const dm = (d as any).delay_min_seconds;
    const dx = (d as any).delay_max_seconds;
    if (dm != null && dx != null) return [dm, dx];
    const fallback = d.delay_seconds || 10;
    return [Math.max(5, fallback - 5), fallback + 5];
  };
  const initRange = getInitMinMax();
  const [delayMin, setDelayMin] = useState(initRange[0]);
  const [delayMax, setDelayMax] = useState(initRange[1]);
  const [customDelayMode, setCustomDelayMode] = useState(false);

  // ── Per-contact delay range ──
  const getInitPc = (): [number, number] => {
    const d = initialData;
    if (!d) return [0, 0];
    return [
      (d as any).per_contact_delay_min_seconds ?? 0,
      (d as any).per_contact_delay_max_seconds ?? 0,
    ];
  };
  const initPcRange = getInitPc();
  const [pcDelayMin, setPcDelayMin] = useState(initPcRange[0]);
  const [pcDelayMax, setPcDelayMax] = useState(initPcRange[1]);
  const [customPcDelayMode, setCustomPcDelayMode] = useState(false);
  const [saving,        setSaving]       = useState(false);
  const [friendReqMsg,  setFriendReqMsg] = useState(initialData?.friend_request_message ?? '');
  const [activeBlock,   setActiveBlock]  = useState(0);
  const [dailyLimit,    setDailyLimit]   = useState(initialData?.daily_send_limit ?? 0);
  const [dailyStartTime, setDailyStartTime] = useState(initialData?.daily_start_time ?? '08:00');
  const [quietHoursEnabled, setQuietHoursEnabled] = useState<boolean>(
    initialData?.quiet_hours_enabled !== undefined ? Boolean(initialData.quiet_hours_enabled) : true
  );
  const [quietHoursStart, setQuietHoursStart] = useState<string>(initialData?.quiet_hours_start || '23:30');
  const [quietHoursEnd, setQuietHoursEnd] = useState<string>(initialData?.quiet_hours_end || '07:00');
  const friendReqRef = useRef<HTMLTextAreaElement>(null);
  const isSavingRef = useRef(false);

  // ── Auto-label states ──
  const getInitialAutoLabel = () => {
    try {
      const cfg = JSON.parse(initialData?.mixed_config || '{}');
      if (cfg.auto_label) return cfg.auto_label;
    } catch {}
    return { enabled: false, type: 'local', id: '', name: '', color: '#f97316', emoji: '🎯' };
  };
  const initAutoLabel = getInitialAutoLabel();
  const [autoLabelEnabled, setAutoLabelEnabled] = useState(initAutoLabel.enabled);
  const [autoLabelType, setAutoLabelType] = useState<'local' | 'zalo'>('local');
  const [selectedLabelId, setSelectedLabelId] = useState<string | number>(initAutoLabel.id ?? '');
  const [newLabelName, setNewLabelName] = useState(initAutoLabel.name ?? '');
  const [newLabelColor, setNewLabelColor] = useState(initAutoLabel.color || '#f97316');
  const [newLabelEmoji, setNewLabelEmoji] = useState(initAutoLabel.emoji || '🎯');
  const [isCreatingNewLabel, setIsCreatingNewLabel] = useState(!initAutoLabel.id && !!initAutoLabel.name);
  const [showLabelSelectorPopup, setShowLabelSelectorPopup] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [localLabelsList, setLocalLabelsList] = useState<any[]>([]);

  const accounts = useAccountStore(s => s.accounts);
  const currentAccount = useMemo(() => accounts.find(a => a.zalo_id === zaloId), [accounts, zaloId]);
  const currentAccountDisplayName = useMemo(() => {
    if (!currentAccount) return zaloId && zaloId.length > 8 ? `Zalo (...${zaloId.slice(-4)})` : (zaloId || 'Tài khoản');
    const rawName = currentAccount.full_name || currentAccount.display_name;
    if (rawName && typeof rawName === 'string' && rawName.trim() && !/^\d{8,}$/.test(rawName.trim())) {
      return rawName.trim();
    }
    if (currentAccount.phone && currentAccount.phone.trim()) {
      const cleaned = currentAccount.phone.replace(/\D/g, '');
      if (cleaned.length === 10) return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
      return currentAccount.phone;
    }
    if (zaloId && zaloId.length > 8) {
      return `Zalo (...${zaloId.slice(-4)})`;
    }
    return zaloId || 'Tài khoản';
  }, [currentAccount, zaloId]);

  const unifiedLabelOptions: LoadedLabelOption[] = useMemo(() => {
    const rawAccName = currentAccount?.full_name || currentAccount?.display_name;
    const formattedName = (rawAccName && !/^\d{8,}$/.test(rawAccName)) ? rawAccName : (currentAccount?.phone ? currentAccount.phone : '');
    const resolvedAccName = formattedName || (zaloId && zaloId.length > 8 ? `Zalo (...${zaloId.slice(-4)})` : (zaloId || 'Tài khoản'));

    return (localLabelsList || []).map((l: any) => ({
      value: `local:${l.id}`,
      name: l.name,
      label: `${l.emoji || '🏷️'} ${l.name} (Local)`,
      source: 'local',
      id: l.id,
      color: l.color,
      textColor: l.text_color || '#ffffff',
      emoji: l.emoji,
      accountZaloId: zaloId,
      accountName: resolvedAccName,
    }));
  }, [localLabelsList, currentAccount, zaloId]);

  useEffect(() => {
    if (!zaloId) return;
    ipc.db?.getLocalLabels({ zaloId }).then((res: any) => {
      const activeLabels = (res?.labels || []).filter((l: any) => (l.is_active ?? 1) !== 0);
      setLocalLabelsList(activeLabels);
    }).catch(() => {});
  }, [zaloId]);

  const handleCreateNewLabelInPopup = async () => {
    if (!newLabelName.trim() || !zaloId) return;
    try {
      const res = await (ipc.db?.upsertLocalLabel as any)?.({
        label: {
          name: newLabelName.trim(),
          color: newLabelColor,
          emoji: newLabelEmoji,
          pageIds: zaloId,
          isActive: 1,
          sortOrder: 0
        }
      });
      if (res?.success) {
        const labelsRes = await ipc.db?.getLocalLabels({ zaloId });
        const activeLabels = (labelsRes?.labels || []).filter((l: any) => (l.is_active ?? 1) !== 0);
        setLocalLabelsList(activeLabels);
        
        // Auto select the new label
        const newId = res.id;
        if (newId) {
          setSelectedLabelId(newId);
          setIsCreatingNewLabel(false);
        }
        setNewLabelName('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // AI for friend request
  const [aiGeneratingFR, setAiGeneratingFR] = useState(false);
  const [showAiInputFR, setShowAiInputFR] = useState(false);
  const [showFRVarPopup, setShowFRVarPopup] = useState(false);
  const [frVarPopupTrigger, setFrVarPopupTrigger] = useState(false);

  const [promptFR, setPromptFR] = useState('');

  const getAiGeneratedFRText = async (userPrompt: string) => {
    try {
      setAiGeneratingFR(true);
      const listRes = await ipc.ai?.listAssistants();
      const assistantId = listRes?.assistants?.[0]?.id || 'default';
      const systemMessage = `Bạn là chuyên gia viết lời mời kết bạn Zalo tự nhiên, lịch sự, tỷ lệ đồng ý cao.
Yêu cầu quan trọng:
- BẮT BUỘC dưới 150 ký tự.
- Kết hợp linh hoạt Spintax chống trùng lặp: {Chào|Dạ chào|Xin chào}
- Sử dụng các biến CRM: {salutation} (danh xưng khách), {tu_xung} (từ tự xưng), {name} (tên khách), {gender_greeting} (Anh/Chị)
- Ví dụ: "{Dạ chào|Xin chào} {salutation} {name}, {tu_xung} kết bạn để tiện trao đổi công việc nhé!"
- Viết trực tiếp nội dung tin nhắn, không dẫn nhập, không đưa đường link.`;
      const response = await ipc.ai?.chat(assistantId, [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt }
      ]);
      if (response?.success && response?.result) {
        const result = response.result.slice(0, 150);
        setFriendReqMsg(result);
        setShowAiInputFR(false);
        setPromptFR('');
      } else {
        alert(response?.error || 'Không thể tạo nội dung. Kiểm tra cấu hình AI Assistant.');
      }
    } catch (e: any) {
      alert(`Lỗi AI: ${e.message}`);
    } finally {
      setAiGeneratingFR(false);
    }
  };

  const [isScheduled, setIsScheduled] = useState(!!initialData?.scheduled_start_at && initialData.scheduled_start_at > 0);

  const getInitialDateStr = () => {
    if (initialData?.scheduled_start_at && initialData.scheduled_start_at > 0) {
      const d = new Date(initialData.scheduled_start_at);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getInitialTimeStr = () => {
    if (initialData?.scheduled_start_at && initialData.scheduled_start_at > 0) {
      const d = new Date(initialData.scheduled_start_at);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
    const d = new Date(Date.now() + 5 * 60 * 1000);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const [schedDate, setSchedDate] = useState(getInitialDateStr());
  const [schedTime, setSchedTime] = useState(getInitialTimeStr());
  const [isMaximized, setIsMaximized] = useState(false);

  const [contentConfig, setContentConfig] = useState<ContentConfig>(() =>
    parseContentConfig(initialData?.template_message)
  );

  const initMixed = parseMixedConfig(initialData?.mixed_config);
  const [mixedActions,   setMixedActions]   = useState<MixedAction[]>(initMixed.actions);
  const [inviteGroupIds, setInviteGroupIds] = useState<string[]>(initMixed.group_ids ?? []);
  const [zaloAliasRule,  setZaloAliasRule]  = useState<ZaloAliasRule>(() => initMixed.zalo_alias_rule || 'none');
  const [sendOrder,      setSendOrder]      = useState<SendOrder>(() => initMixed.send_order || 'image_first');

  const hasMsg    = type === 'message' || (type === 'mixed' && mixedActions.includes('message'));
  const hasFR     = type === 'friend_request' || (type === 'mixed' && mixedActions.includes('friend_request'));
  const hasInvite = type === 'invite_to_group' || (type === 'mixed' && mixedActions.includes('invite_to_groups'));

  const isStrangerTarget = type === 'friend_request' || (type === 'mixed' && mixedActions.includes('friend_request'));
  const hasFRMsgLink = /https?:\/\/[^\s]+/i.test(friendReqMsg);

  // Clamp activeBlock when blocks change
  useEffect(() => {
    setActiveBlock(i => Math.min(i, contentConfig.blocks.length - 1));
  }, [contentConfig.blocks.length]);

  const addBlock = () => {
    setContentConfig(prev => {
      const next = { ...prev, blocks: [...prev.blocks, { id: genId(), text: '', images: [] }] };
      setActiveBlock(next.blocks.length - 1);
      return next;
    });
  };

  const removeBlock = (id: string) => {
    setContentConfig(prev => {
      const next = { ...prev, blocks: prev.blocks.filter(b => b.id !== id) };
      setActiveBlock(i => Math.min(i, Math.max(0, next.blocks.length - 1)));
      return next;
    });
  };

  const updateBlock = (id: string, u: Partial<ContentBlock>) =>
    setContentConfig(prev => ({ ...prev, blocks: prev.blocks.map(b => b.id === id ? { ...b, ...u } : b) }));

  const toggleMixedAction = (a: MixedAction) =>
    setMixedActions(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);

  const toggleGroupId = (id: string) =>
    setInviteGroupIds(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);

  const buildMixedConfig = (): string => {
    let cfg: any = { zalo_alias_rule: zaloAliasRule, send_order: sendOrder };
    if (type === 'invite_to_group') {
      cfg.group_ids = inviteGroupIds;
    } else if (type === 'mixed') {
      cfg.actions = mixedActions;
      if (mixedActions.includes('invite_to_groups') && inviteGroupIds.length > 0) {
        cfg.group_ids = inviteGroupIds;
      }
    }
    if (autoLabelEnabled) {
      cfg.auto_label = {
        enabled: true,
        type: 'local',
        id: isCreatingNewLabel ? undefined : selectedLabelId ? Number(selectedLabelId) : undefined,
        name: isCreatingNewLabel ? newLabelName.trim() : undefined,
        color: isCreatingNewLabel ? newLabelColor : undefined,
        emoji: isCreatingNewLabel ? newLabelEmoji : undefined,
        textColor: '#FFFFFF',
      };
    }
    return JSON.stringify(cfg);
  };

  const isValid = (): boolean => {
    if (!name.trim()) return false;
    if (type === 'invite_to_group') return inviteGroupIds.length > 0;
    if (type === 'mixed') {
      if (!mixedActions.length) return false;
      if (mixedActions.includes('message') && !contentConfig.blocks.some(b => b.text.trim() || b.images.length)) return false;
      if (mixedActions.includes('friend_request') && !friendReqMsg.trim()) return false;
      if (mixedActions.includes('invite_to_groups') && !inviteGroupIds.length) return false;
    } else {
      if (hasMsg && !contentConfig.blocks.some(b => b.text.trim() || b.images.length)) return false;
      if (hasFR && !friendReqMsg.trim()) return false;
    }
    if (autoLabelEnabled) {
      if (isCreatingNewLabel && !newLabelName.trim()) return false;
      if (!isCreatingNewLabel && !selectedLabelId) return false;
    }
    return true;
  };

  const getValidationReason = (): string | null => {
    const missing: string[] = [];
    if (!name.trim()) {
      missing.push('Tên chiến dịch');
    }
    if (type === 'invite_to_group') {
      if (inviteGroupIds.length === 0) missing.push('Nhóm Zalo để mời');
    } else if (type === 'mixed') {
      if (mixedActions.length === 0) {
        missing.push('Chọn ít nhất 1 hành động (Tin nhắn, Kết bạn, Mời nhóm)');
      } else {
        if (mixedActions.includes('message') && !contentConfig.blocks.some(b => b.text.trim() || b.images.length)) {
          missing.push('Nội dung tin nhắn');
        }
        if (mixedActions.includes('friend_request') && !friendReqMsg.trim()) {
          missing.push('Lời nhắn kết bạn');
        }
        if (mixedActions.includes('invite_to_groups') && inviteGroupIds.length === 0) {
          missing.push('Nhóm Zalo để mời');
        }
      }
    } else {
      if (hasMsg && !contentConfig.blocks.some(b => b.text.trim() || b.images.length)) {
        missing.push('Nội dung tin nhắn');
      }
      if (hasFR && !friendReqMsg.trim()) {
        missing.push('Lời nhắn kết bạn');
      }
    }
    if (autoLabelEnabled) {
      if (isCreatingNewLabel && !newLabelName.trim()) missing.push('Tên nhãn mới');
      if (!isCreatingNewLabel && !selectedLabelId) missing.push('Nhãn tự động áp dụng');
    }

    if (missing.length === 0) return null;
    return `Cần nhập bổ sung: ${missing.join(', ')}`;
  };

  const handleSave = async () => {
    const valError = getValidationReason();
    if (valError) {
      useAppStore.getState().showNotification(valError, 'warning');
      return;
    }
    if (saving || isSavingRef.current) return;
    isSavingRef.current = true;
    setSaving(true);

    try {
      let scheduledStartAt = 0;
      if (isScheduled && schedDate && schedTime) {
        const [year, month, day] = schedDate.split('-').map(Number);
        const [hour, minute] = schedTime.split(':').map(Number);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day) && !isNaN(hour) && !isNaN(minute)) {
          const d = new Date(year, month - 1, day, hour, minute, 0);
          scheduledStartAt = d.getTime();
        }
      }

      await onSave({
        name: name.trim(),
        template_message: hasMsg ? JSON.stringify(contentConfig) : '',
        friend_request_message: friendReqMsg.trim(),
        campaign_type: type,
        mixed_config: buildMixedConfig(),
        delay_seconds: Math.round((delayMin + delayMax) / 2),
        delay_min_seconds: delayMin,
        delay_max_seconds: delayMax,
        per_contact_delay_min_seconds: pcDelayMin,
        per_contact_delay_max_seconds: pcDelayMax,
        daily_send_limit: dailyLimit,
        daily_start_time: dailyStartTime,
        scheduled_start_at: scheduledStartAt,
        quiet_hours_enabled: quietHoursEnabled ? 1 : 0,
        quiet_hours_start: quietHoursStart,
        quiet_hours_end: quietHoursEnd,
      });
    } catch (err: any) {
      console.error(err);
      useAppStore.getState().showNotification(err?.message || 'Lỗi khi lưu chiến dịch', 'error');
    } finally {
      isSavingRef.current = false;
      setSaving(false);
    }
  };

  const insertFRVar = (v: string) => {
    const ta = friendReqRef.current;
    if (!ta) { setFriendReqMsg(t => t + v); return; }
    const s = ta.selectionStart ?? friendReqMsg.length;
    const e = ta.selectionEnd ?? friendReqMsg.length;
    setFriendReqMsg(friendReqMsg.slice(0, s) + v + friendReqMsg.slice(e));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + v.length, s + v.length); }, 0);
  };

  const getScheduleMessage = () => {
    if (!schedDate || !schedTime) return '';
    const [year, month, day] = schedDate.split('-').map(Number);
    const [hour, minute] = schedTime.split(':').map(Number);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day) && !isNaN(hour) && !isNaN(minute)) {
      const d = new Date(year, month - 1, day, hour, minute, 0);
      const isPast = d.getTime() < Date.now();
      if (isPast) {
        return `⚠️ Giờ hẹn đã qua, chiến dịch sẽ tự động chạy bù ngay khi kích hoạt.`;
      } else {
        return `🗓 Chiến dịch sẽ tự động bắt đầu chạy vào ngày ${day}/${month}/${year} lúc ${schedTime}.`;
      }
    }
    return '';
  };

  // Current block reference
  const currentBlock = contentConfig.blocks[activeBlock] ?? contentConfig.blocks[0];

  // Whether the campaign can send multiple items per contact (show per-contact delay section)
  const hasMultiSend = (hasMsg && contentConfig.mode === 'all' && contentConfig.blocks.length > 1)
    || (type === 'mixed' && mixedActions.length > 1)
    || (hasMsg && hasFR);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`fixed inset-0 bg-black/60 flex items-center justify-center z-50 ${isMaximized ? 'p-0' : 'p-4'}`} onClick={onClose}>
      <div
        className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700/60 shadow-2xl flex flex-col text-gray-900 dark:text-gray-100 overflow-hidden transition-all duration-200 ${
          isMaximized
            ? 'w-full h-full max-w-none max-h-none rounded-none'
            : 'rounded-3xl w-full max-w-[1360px] max-h-[94vh] lg:h-[min(95vh,52rem)]'
        }`}
        style={isMaximized ? { height: '100vh', width: '100vw' } : {}}
        onClick={e => e.stopPropagation()}
      >
        {/* Top Swipe Indicator for Mobile */}
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mt-2.5 sm:hidden" />

        {/* ── Header Topbar ── */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700/60 flex-shrink-0 bg-white dark:bg-gray-900 rounded-t-2xl gap-4 flex-wrap">
          {/* Title & Subtitle */}
          <div className="flex-shrink-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {editMode ? 'Chỉnh sửa chiến dịch' : (type === 'message' ? 'Tạo chiến dịch tin nhắn' : type === 'friend_request' ? 'Tạo chiến dịch kết bạn' : type === 'invite_to_group' ? 'Tạo chiến dịch mời nhóm' : 'Tạo chiến dịch hỗn hợp')}
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Gửi tin nhắn hàng loạt đến khách hàng
            </p>
          </div>

          {/* Campaign Name Input */}
          <div className="flex items-center gap-2.5 flex-1 min-w-[200px] max-w-[560px]">
            <span className="text-xs font-extrabold uppercase tracking-wider text-gray-800 dark:text-gray-200 flex-shrink-0">
              TÊN CHIẾN DỊCH
            </span>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nhập tên chiến dịch (vd: VIN, NOVA, CSKH)..."
              className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-1.5 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors font-medium shadow-2xs"
            />
          </div>

          {/* Action buttons (Maximize & Close) */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? "Thu nhỏ lại" : "Mở rộng full màn hình"}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {isMaximized ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                </svg>
              )}
            </button>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Responsive Body (Single-column Mobile / 3-column PC) ── */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">

          {/* ── LEFT: Settings ── */}
          <div className="w-full lg:w-[320px] flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-y-auto p-4 gap-5 bg-gray-50/50 dark:bg-gray-900">

            {/* Type */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">LOẠI CHIẾN DỊCH</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-2">
                {TYPE_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setType(opt.value)}
                    className={`flex flex-col lg:flex-row items-center justify-center lg:justify-start gap-1.5 lg:gap-2.5 p-2.5 lg:px-3 lg:py-2 rounded-xl border text-center lg:text-left transition-all ${
                      type === opt.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                        : 'border-gray-200 dark:border-gray-700/80 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}>
                    <AppIcon name={opt.icon as any} className={type === opt.value ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'} size={16} />
                    <span className="text-xs">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tên Zalo sau khi gửi */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
                TÊN ZALO SAU KHI GỬI
              </label>
              <div className="space-y-1">
                {[
                  { value: 'none' as const,                label: 'Không đổi' },
                  { value: 'campaign_name_phone' as const, label: '[Tên chiến dịch] - [Tên Zalo] - [SĐT]' },
                  { value: 'name_phone' as const,          label: '[Tên Zalo] - [SĐT]' },
                ].map(opt => (
                  <button key={opt.value} type="button" onClick={() => setZaloAliasRule(opt.value)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left text-xs transition-colors ${
                      zaloAliasRule === opt.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold shadow-2xs'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}>
                    <span className="leading-snug break-words flex-1 text-[11px] font-medium">{opt.label}</span>
                    {zaloAliasRule === opt.value && <span className="text-blue-600 dark:text-blue-400 font-bold ml-1.5 flex-shrink-0">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Thứ tự gửi tin nhắn (Ảnh & Text) */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
                THỨ TỰ GỬI TIN NHẮN (ẢNH & TEXT)
              </label>
              <div className="space-y-1">
                {[
                  { value: 'image_first' as const, label: '🖼️ Hình ảnh gửi trước ➔ Chữ sau' },
                  { value: 'text_first' as const,  label: '💬 Nội dung chữ trước ➔ Ảnh sau' },
                ].map(opt => (
                  <button key={opt.value} type="button" onClick={() => setSendOrder(opt.value)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left text-xs transition-colors ${
                      sendOrder === opt.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold shadow-2xs'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}>
                    <span className="leading-snug break-words flex-1 text-[11px] font-medium">{opt.label}</span>
                    {sendOrder === opt.value && <span className="text-blue-600 dark:text-blue-400 font-bold ml-1.5 flex-shrink-0">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Mixed actions */}
            {type === 'mixed' && (
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">Hành động</label>
                <div className="space-y-1">
                  {([
                    { action: 'message' as MixedAction,         icon: 'chat' as const, label: 'Tin nhắn' },
                    { action: 'friend_request' as MixedAction,  icon: 'user_plus' as const, label: 'Kết bạn' },
                    { action: 'invite_to_groups' as MixedAction, icon: 'user_check' as const, label: 'Mời nhóm' },
                  ]).map(({ action, icon, label }) => {
                    const checked = mixedActions.includes(action);
                    return (
                      <label key={action}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-blue-50/30 dark:bg-blue-500/10' : 'hover:bg-gray-100 dark:hover:bg-gray-700/40'}`}>
                        <div onClick={() => toggleMixedAction(action)}
                          className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                            checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-500 hover:border-blue-400'
                          }`}>
                          {checked && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <AppIcon name={icon} className={checked ? 'text-blue-500' : 'text-gray-500'} size={12} />
                        <span className="text-xs text-gray-700 dark:text-gray-300">{label}</span>
                      </label>
                    );
                  })}
                  {!mixedActions.length && <p className="text-[10px] text-red-400 px-1">Chọn ít nhất 1 hành động</p>}
                </div>
              </div>
            )}

            {/* ⏱ Delay giữa các liên hệ */}
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
                DELAY GIỮA CÁC LIÊN HỆ
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {DELAY_PRESETS.map(p => {
                  const active = !customDelayMode && delayMin === p.min && delayMax === p.max;
                  return (
                    <button key={p.label} type="button" onClick={() => { setDelayMin(p.min); setDelayMax(p.max); setCustomDelayMode(false); }}
                      className={`py-2 rounded-xl border text-xs font-semibold transition-colors ${
                        active ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 shadow-2xs font-bold'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}>
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={() => setCustomDelayMode(!customDelayMode)}
                className={`flex items-center justify-between mt-2 text-xs px-3 py-2 rounded-xl border transition-colors w-full font-semibold ${
                  customDelayMode ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    : 'border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100/50'
                }`}>
                <span>▾ Tùy chỉnh khoảng</span>
              </button>
              {customDelayMode && (
                <div className="flex items-center gap-1.5 mt-2 bg-white dark:bg-gray-800 p-2 rounded-xl border border-gray-200 dark:border-gray-700">
                  <input type="number" min={5} value={delayMin || ''}
                    onChange={e => setDelayMin(Math.max(5, parseInt(e.target.value) || 0))}
                    className="w-16 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-center text-gray-900 dark:text-gray-100 font-bold focus:outline-none focus:border-blue-500"
                    placeholder="5" />
                  <span className="text-gray-400 text-xs">➔</span>
                  <input type="number" min={delayMin} value={delayMax || ''}
                    onChange={e => setDelayMax(Math.max(delayMin || 5, parseInt(e.target.value) || 0))}
                    className="w-16 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-center text-gray-900 dark:text-gray-100 font-bold focus:outline-none focus:border-blue-500"
                    placeholder="15" />
                  <span className="text-gray-500 text-xs font-medium ml-0.5">giây</span>
                </div>
              )}
              <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-2 leading-relaxed flex items-start gap-1">
                <span className="flex-shrink-0">⏱</span>
                <span>Ngẫu nhiên <strong className="font-bold text-gray-900 dark:text-gray-100">{fmtDelayRange(delayMin, delayMax)}</strong> giữa các liên hệ để tăng tỉ lệ thành công.</span>
              </p>
            </div>

            {/* ⏱ Delay giữa các tin nhắn (chỉ khi gửi nhiều tin/liên hệ) */}
            {hasMultiSend && (
              <div>
                <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                  <AppIcon name="clock" className="text-gray-500" size={10} />
                  Delay giữa các tin nhắn
                </label>
                <div className="grid grid-cols-2 gap-1">
                  {PC_DELAY_PRESETS.map(p => {
                    const active = !customPcDelayMode && pcDelayMin === p.min && pcDelayMax === p.max;
                    return (
                      <button key={p.label} type="button" onClick={() => { setPcDelayMin(p.min); setPcDelayMax(p.max); setCustomPcDelayMode(false); }}
                        className={`py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
                          active ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold'
                            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
                        }`}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={() => setCustomPcDelayMode(!customPcDelayMode)}
                  className={`flex items-center gap-1 mt-1.5 text-[11px] px-2 py-1 rounded-lg border transition-colors w-full ${
                    customPcDelayMode ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                      : 'border-gray-350 dark:border-gray-600 text-gray-500 hover:text-gray-300 hover:border-gray-500'
                  }`}>
                  <span>{customPcDelayMode ? '▾' : '▸'}</span> Tùy chỉnh
                </button>
                {customPcDelayMode && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <input type="number" min={0} value={pcDelayMin ?? ''}
                      onChange={e => setPcDelayMin(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-750 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="Min (s)" />
                    <span className="text-gray-500 text-xs">→</span>
                    <input type="number" min={pcDelayMin} value={pcDelayMax ?? ''}
                      onChange={e => setPcDelayMax(Math.max(pcDelayMin || 0, parseInt(e.target.value) || 0))}
                      className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-750 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="Max (s)" />
                    <span className="text-gray-500 text-[10px] flex-shrink-0">giây</span>
                  </div>
                )}
                <p className="text-[10px] text-gray-550 mt-1">
                  {pcDelayMin > 0 || pcDelayMax > 0
                    ? `⏱ Ngẫu nhiên ${fmtDelayRange(pcDelayMin, pcDelayMax)} giữa các tin nhắn`
                    : '⏱ Gửi liên tiếp (mặc định ~1s)'}
                </p>
              </div>
            )}

          </div>

          {/* ── CENTER: Editor ── */}
          <div className="w-full lg:flex-1 lg:min-w-0 flex flex-col border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 min-h-fit lg:min-h-0">
            {/* Center topbar */}
            <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 dark:border-gray-700/60 flex-shrink-0 min-h-[44px] bg-gray-50/30 dark:bg-gray-900">
              {hasMsg ? (
                <>
                  {/* Block tabs */}
                  <div className="flex items-center gap-1 overflow-x-auto">
                    {contentConfig.blocks.map((b, i) => (
                      <button key={b.id} type="button"
                        onClick={() => setActiveBlock(i)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 border ${
                          i === activeBlock
                            ? 'bg-blue-600 border-blue-500 text-white font-bold'
                            : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}>
                        <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[9px] font-bold leading-none">
                          {i + 1}
                        </span>
                        Nội dung {i + 1}
                        {contentConfig.blocks.length > 1 && (
                          <span
                            onClick={e => { e.stopPropagation(); removeBlock(b.id); }}
                            className="ml-0.5 opacity-50 hover:opacity-100 cursor-pointer">×</span>
                        )}
                      </button>
                    ))}
                    <button type="button" onClick={addBlock}
                      title="Thêm biến thể nội dung"
                      className="flex-shrink-0 w-7 h-7 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:border-blue-500/50 flex items-center justify-center transition-colors text-lg leading-none bg-white dark:bg-gray-800">
                      +
                    </button>
                  </div>
                  {/* Mode toggle (only when multiple blocks) */}
                  {contentConfig.blocks.length > 1 && (
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      {([
                        { value: 'random' as SendMode, icon: 'shuffle' as const, label: 'Random' },
                        { value: 'all' as SendMode,    icon: 'send' as const, label: 'Tất cả' },
                      ]).map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => setContentConfig(prev => ({ ...prev, mode: opt.value }))}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors border ${
                            contentConfig.mode === opt.value
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                          }`}>
                          <AppIcon name={opt.icon} className="text-current" size={10} />
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : hasFR && !hasMsg ? (
                <>
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-300 flex items-center gap-1.5">
                    <AppIcon name="user_plus" className="text-blue-500" size={12} />
                    <span>Lời nhắn kết bạn</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAiInputFR(v => !v)}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20 transition-colors font-medium"
                  >
                    🪄 AI
                  </button>
                </>
              ) : hasInvite && !hasMsg ? (
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-300 flex items-center gap-1.5">
                  <AppIcon name="user_check" className="text-blue-500" size={12} />
                  <span>Chọn nhóm để mời</span>
                </span>
              ) : (
                <span className="text-xs text-gray-500">Editor</span>
              )}
            </div>

            {/* Center content area */}
            <div className="p-4 flex flex-col gap-3.5 flex-1 lg:min-h-0 lg:overflow-y-auto">
              
              {/* ── Config Panel: Giới hạn/Ngày & Hẹn giờ chạy ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50/50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700/60 rounded-2xl flex-shrink-0">
                {/* Giới hạn ngày */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                    <AppIcon name="chart" className="text-gray-400" size={12} />
                    Giới hạn gửi trong ngày
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={dailyLimit || ''}
                      onChange={e => setDailyLimit(Math.max(0, parseInt(e.target.value) || 0))}
                      placeholder="Không giới hạn"
                      className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-1.5 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors font-medium"
                    />
                    <span className="text-xs text-gray-500 font-medium flex-shrink-0">liên hệ</span>
                  </div>
                  {isStrangerTarget && (
                    dailyLimit === 0 ? (
                      <p className="text-[10px] text-red-500 font-semibold mt-1 leading-relaxed">
                        ⚠️ Không nên để không giới hạn khi gửi người lạ/kết bạn. Zalo giới hạn 50 người/ngày.
                      </p>
                    ) : dailyLimit > 50 ? (
                      <p className="text-[10px] text-red-500 font-semibold mt-1 leading-relaxed">
                        ⚠️ Nguy hiểm: Vượt quá giới hạn 50 người/ngày của Zalo. Tài khoản dễ bị khóa!
                      </p>
                    ) : dailyLimit > 20 ? (
                      <p className="text-[10px] text-amber-600 font-medium mt-1 leading-relaxed">
                        ⚠️ Khuyến nghị: Nên đặt hạn mức từ 10 - 20 người/ngày để an toàn tối đa.
                      </p>
                    ) : null
                  )}
                </div>

                {/* Hẹn giờ chạy */}
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div onClick={() => setIsScheduled(!isScheduled)}
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                        isScheduled ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                      }`}>
                      {isScheduled && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">🗓 Hẹn giờ chạy</span>
                  </label>

                  {isScheduled ? (
                    <div className="grid grid-cols-2 gap-2 mt-1 animate-fadeIn">
                      <div>
                        <input
                          type="date"
                          value={schedDate}
                          onChange={e => setSchedDate(e.target.value)}
                          className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 transition-colors font-medium"
                        />
                      </div>
                      <div>
                        <input
                          type="time"
                          value={schedTime}
                          onChange={e => setSchedTime(e.target.value)}
                          className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 transition-colors font-medium"
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1.5 font-medium">
                      Chạy ngay khi kích hoạt chiến dịch
                    </p>
                  )}
                  {isScheduled && getScheduleMessage() && (
                    <p className={`text-[10px] mt-1 leading-relaxed ${getScheduleMessage().startsWith('⚠️') ? 'text-amber-600 font-semibold' : 'text-blue-600 dark:text-cyan-400'}`}>
                      {getScheduleMessage()}
                    </p>
                  )}
                </div>

                {/* 🌙 Khung giờ nghỉ (Không gửi tin nhắn) */}
                <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={quietHoursEnabled}
                        onChange={e => setQuietHoursEnabled(e.target.checked)}
                        className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                      />
                      <span className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1">
                        🌙 Khung giờ nghỉ (Không gửi tin)
                      </span>
                    </label>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Mặc định 23:30 ➔ 07:00</span>
                  </div>

                  {quietHoursEnabled && (
                    <div className="flex items-center gap-2 mt-1 animate-fadeIn">
                      <span className="text-[11px] text-gray-600 dark:text-gray-400 font-medium">Từ:</span>
                      <input
                        type="time"
                        value={quietHoursStart}
                        onChange={e => setQuietHoursStart(e.target.value)}
                        className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-900 dark:text-gray-100 font-bold focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-[11px] text-gray-600 dark:text-gray-400 font-medium">đến:</span>
                      <input
                        type="time"
                        value={quietHoursEnd}
                        onChange={e => setQuietHoursEnd(e.target.value)}
                        className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-900 dark:text-gray-100 font-bold focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Message block editor */}
              {hasMsg && currentBlock && (
                <div className={`flex-shrink-0 flex flex-col`}>
                  <BlockEditor
                    block={currentBlock}
                    onUpdate={u => updateBlock(currentBlock.id, u)}
                    zaloId={zaloId}
                  />
                </div>
              )}

              {/* Friend request — inline in center when mixed */}
              {hasFR && hasMsg && (
                <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 pt-3">
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                    <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-400">🤝 Lời nhắn kết bạn</span>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[9px] text-gray-500">Chèn:</span>
                      {[{k:'{name}',l:'Tên'},{k:'{zalo_name}',l:'Tên Zalo'},{k:'{real_name}',l:'Tên thật'},{k:'{gender_greeting}',l:'Anh/Chị'},{k:'{salutation}',l:'Xưng hô'},{k:'{tu_xung}',l:'Tự xưng'}].map(v => (
                        <button key={v.k} type="button" onClick={() => insertFRVar(v.k)}
                          className="text-[9px] px-1.5 py-0.5 rounded-full border border-blue-500/30 text-blue-400 hover:bg-blue-500/15 transition-colors font-medium"
                          title={v.k}>{v.l}</button>
                      ))}
                      <button type="button" onClick={() => setShowFRVarPopup(true)}
                        className="text-[9px] px-1.5 py-0.5 rounded-full border border-gray-500/30 text-gray-400 hover:bg-gray-500/15 transition-colors font-medium"
                      >⊕ Thêm
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAiInputFR(v => !v)}
                        className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20 transition-colors font-medium"
                      >
                        🪄 AI
                      </button>
                    </div>
                  </div>
                  <CampaignVarPopup
                    open={showFRVarPopup || frVarPopupTrigger}
                    onClose={() => { setShowFRVarPopup(false); setFrVarPopupTrigger(false); }}
                    onSelect={insertFRVar}
                  />
                  {showAiInputFR && (
                    <div className="flex gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-2.5 py-1.5 mb-1.5">
                      <input
                        value={promptFR}
                        onChange={e => setPromptFR(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && promptFR.trim() && !aiGeneratingFR) { e.preventDefault(); getAiGeneratedFRText(promptFR.trim()); } }}
                        placeholder="Mô tả lời mời kết bạn..."
                        className="flex-1 bg-transparent text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => { if (promptFR.trim() && !aiGeneratingFR) getAiGeneratedFRText(promptFR.trim()); }}
                        disabled={aiGeneratingFR || !promptFR.trim()}
                        className="text-[10px] px-2 py-0.5 bg-emerald-500 text-white rounded-md disabled:opacity-50 font-medium"
                      >
                        {aiGeneratingFR ? '...' : 'Viết'}
                      </button>
                    </div>
                  )}
                  <textarea ref={friendReqRef} value={friendReqMsg}
                    onChange={e => setFriendReqMsg(e.target.value.slice(0, 150))}
                    onKeyDown={e => { if (e.key === '{') setTimeout(() => setFrVarPopupTrigger(true), 0); }}
                    rows={2} placeholder="Xin chào {name}, tôi muốn kết nối!"
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none transition-colors" />
                  {hasFRMsgLink && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium mt-1 leading-relaxed">
                      ⚠️ Cảnh báo: Tránh gửi đường link kèm theo lời mời kết bạn.
                    </p>
                  )}
                  <p className={`text-[10px] text-right mt-0.5 ${ friendReqMsg.length >= 140 ? 'text-orange-500 font-semibold' : 'text-gray-400 dark:text-gray-500' }`}>
                    {friendReqMsg.length}/150
                  </p>
                </div>
              )}

              {/* Standalone friend request */}
              {hasFR && !hasMsg && (
                <div className="flex-shrink-0 flex flex-col gap-2">
                  {/* Header row: quick chips + popup + AI */}
                  <div className="flex items-center justify-between flex-wrap gap-1.5 flex-shrink-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] text-gray-500">Chèn:</span>
                      {[{k:'{name}',l:'Tên'},{k:'{zalo_name}',l:'Tên Zalo'},{k:'{real_name}',l:'Tên thật'},{k:'{gender_greeting}',l:'Anh/Chị'},{k:'{salutation}',l:'Xưng hô'},{k:'{tu_xung}',l:'Tự xưng'},{k:'{phone}',l:'SĐT'}].map(v => (
                        <button key={v.k} type="button" onClick={() => insertFRVar(v.k)}
                          className="text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30 text-blue-400 hover:bg-blue-500/15 transition-colors font-medium"
                          title={v.k}>{v.l}</button>
                      ))}
                      <button type="button" onClick={() => setShowFRVarPopup(true)}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-gray-500/30 text-gray-400 hover:bg-gray-500/15 transition-colors font-medium"
                      >⊕ Thêm biến
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAiInputFR(v => !v)}
                      className={`flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-semibold transition-colors border ${
                        showAiInputFR
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'border-blue-500/30 text-blue-400 hover:bg-blue-500/15'
                      }`}
                    >
                      🪄 Trợ lý AI
                    </button>
                  </div>

                  <CampaignVarPopup
                    open={showFRVarPopup || frVarPopupTrigger}
                    onClose={() => { setShowFRVarPopup(false); setFrVarPopupTrigger(false); }}
                    onSelect={insertFRVar}
                  />

                  {/* AI input */}
                  {showAiInputFR && (
                    <div className="flex flex-col gap-1.5 p-2 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-500/20 rounded-xl flex-shrink-0">
                      <div className="flex gap-2">
                        <input
                          value={promptFR}
                          onChange={e => setPromptFR(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              if (e.nativeEvent.isComposing) return;
                              e.preventDefault();
                              if (promptFR.trim() && !aiGeneratingFR) getAiGeneratedFRText(promptFR.trim());
                            }
                          }}
                          placeholder="Yêu cầu AI viết lời nhắn kết bạn..."
                          className="flex-1 bg-white dark:bg-gray-900 border border-gray-350 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                        <button
                          type="button"
                          disabled={aiGeneratingFR || !promptFR.trim()}
                          onClick={() => getAiGeneratedFRText(promptFR.trim())}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-semibold flex items-center gap-1 transition-colors"
                        >
                          {aiGeneratingFR && (
                            <svg className="animate-spin w-3 h-3 text-white" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          )}
                          {aiGeneratingFR ? '...' : 'Viết'}
                        </button>
                      </div>
                    </div>
                  )}

                  <textarea ref={friendReqRef} value={friendReqMsg}
                    onChange={e => setFriendReqMsg(e.target.value.slice(0, 150))}
                    onKeyDown={e => { if (e.key === '{') setTimeout(() => setFrVarPopupTrigger(true), 0); }}
                    placeholder="Xin chào {name}, tôi muốn kết nối với bạn!"
                    className="h-28 min-h-[90px] w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none transition-colors" />
                  {hasFRMsgLink && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium px-1 leading-relaxed">
                      ⚠️ Cảnh báo: Tránh gửi đường link kèm theo lời mời kết bạn.
                    </p>
                  )}
                  <p className={`text-[10px] text-right flex-shrink-0 ${ friendReqMsg.length >= 140 ? 'text-orange-500 font-semibold' : 'text-gray-400 dark:text-gray-500' }`}>
                    {friendReqMsg.length}/150 ký tự
                  </p>
                </div>
              )}

              {/* Invite to groups */}
              {hasInvite && !hasMsg && (
                <div className="flex-shrink-0 overflow-hidden flex flex-col">
                  <GroupPicker zaloId={zaloId} inviteGroupIds={inviteGroupIds} onToggle={toggleGroupId} />
                </div>
              )}

              {/* Mixed: invite groups at bottom */}
              {hasInvite && hasMsg && (
                <div className="flex-shrink-0 border-t border-gray-700 pt-3">
                  <p className="text-[11px] font-medium text-gray-400 mb-2">👥 Nhóm mời</p>
                  <GroupPicker zaloId={zaloId} inviteGroupIds={inviteGroupIds} onToggle={toggleGroupId} />
                </div>
              )}

            </div>
          </div>

          {/* ── RIGHT: Preview ── */}
          <div className="w-64 flex-shrink-0 p-4 overflow-hidden flex flex-col bg-gray-50/50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
            {/* Auto label on success */}
            <div className="mb-4 pb-3 border-b border-gray-200 dark:border-gray-700/60 flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  🏷️ GẮN NHÃN TỰ ĐỘNG
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const val = !autoLabelEnabled;
                    setAutoLabelEnabled(val);
                    if (val) setShowLabelSelectorPopup(true);
                  }}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    autoLabelEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform transform absolute top-0.5 ${
                    autoLabelEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
              {autoLabelEnabled && (
                <div className="mt-2.5">
                  {selectedLabelId || newLabelName ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white shadow-xs"
                      style={isCreatingNewLabel
                        ? { backgroundColor: newLabelColor, color: '#ffffff' }
                        : (() => {
                            const label = localLabelsList.find(l => l.id === Number(selectedLabelId));
                            const color = label?.color || '#3b82f6';
                            return { backgroundColor: color, color: label?.text_color || '#ffffff' };
                          })()
                      }
                    >
                      {isCreatingNewLabel ? (
                        <>
                          <span>{newLabelEmoji}</span>
                          <span className="truncate max-w-[100px]">{newLabelName} (Mới)</span>
                        </>
                      ) : (() => {
                          const label = localLabelsList.find(l => l.id === Number(selectedLabelId));
                          return (
                            <>
                              {label?.emoji && <span>{label.emoji}</span>}
                              <span className="truncate max-w-[100px]">{label?.name || 'Nhãn đã chọn'}</span>
                            </>
                          );
                      })()}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowLabelSelectorPopup(true);
                        }}
                        className="text-[10px] underline ml-1 hover:text-opacity-80 font-medium"
                      >
                        Sửa
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowLabelSelectorPopup(true)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                    >
                      + Chọn nhãn áp dụng
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Live Preview */}
            <div className="flex-1 min-h-0 flex flex-col">
              <LivePreview
                blocks={contentConfig.blocks}
                activeIdx={activeBlock}
                mode={contentConfig.mode}
                type={type}
                friendMsg={friendReqMsg}
                campaignName={name}
                onTabChange={setActiveBlock}
                zaloId={zaloId}
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center mt-3 font-medium">
                Lưu ý: Nội dung hiển thị chỉ mang tính chất minh họa.
              </p>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-200 dark:border-gray-700/60 flex-shrink-0 bg-white dark:bg-gray-900 rounded-b-2xl">
          <div className="text-xs text-gray-500 font-medium">
            {hasMsg && contentConfig.blocks.length > 1 && (
              <span>{contentConfig.blocks.length} biến thể · {contentConfig.mode === 'random' ? '🎲 random' : '📨 gửi tất cả'}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-semibold transition-colors">
              Hủy
            </button>
            <div className="relative group">
              <button onClick={handleSave} disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                {saving && <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                <span>{saving ? (editMode ? 'Đang lưu...' : 'Đang tạo...') : (editMode ? 'Lưu thay đổi' : 'Tạo chiến dịch →')}</span>
              </button>

              {/* Hover Tooltip when invalid */}
              {!isValid() && !saving && (
                <div className="absolute bottom-full right-0 mb-2.5 hidden group-hover:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/90 text-red-600 dark:text-red-400 text-xs font-bold whitespace-nowrap shadow-2xl border border-red-200 dark:border-red-800 z-50 animate-fadeIn pointer-events-none">
                  <span className="text-red-600 dark:text-red-400 font-bold">⚠️</span>
                  <span className="font-bold text-red-600 dark:text-red-400">{getValidationReason()}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Unified Label Picker Modal ── */}
        {showLabelSelectorPopup && (
          <UnifiedLabelPickerModal
            open={showLabelSelectorPopup}
            onClose={() => setShowLabelSelectorPopup(false)}
            options={unifiedLabelOptions}
            selected={selectedLabelId ? [`local:${selectedLabelId}`] : []}
            mode="single"
            accounts={accounts as any}
            onChange={(selectedValues) => {
              if (selectedValues.length === 0) {
                setSelectedLabelId('');
                setIsCreatingNewLabel(false);
              } else {
                const val = selectedValues[selectedValues.length - 1];
                if (val.startsWith('local:')) {
                  const id = Number(val.replace('local:', ''));
                  setSelectedLabelId(id);
                  setIsCreatingNewLabel(false);
                }
              }
            }}
            onConfirm={() => {
              if (selectedLabelId) {
                setAutoLabelEnabled(true);
              }
              setShowLabelSelectorPopup(false);
            }}
            onNewLabelCreated={() => {
              if (zaloId) {
                ipc.db?.getLocalLabels({ zaloId }).then((res: any) => {
                  const activeLabels = (res?.labels || []).filter((l: any) => (l.is_active ?? 1) !== 0);
                  setLocalLabelsList(activeLabels);
                });
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
