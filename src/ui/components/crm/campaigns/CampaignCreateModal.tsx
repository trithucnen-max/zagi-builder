import React, { useState, useEffect, useRef } from 'react';
import ipc from '@/lib/ipc';
import { toLocalMediaUrl } from '@/lib/localMedia';
import AppIcon from '@/components/common/AppIcon';
import { useAppStore } from '@/store/appStore';
import DataAccessor from '@/lib/data/DataAccessor';
import LibraryPickerModal from '@/components/chat/library/LibraryPickerModal';
import CampaignVarPopup from './CampaignVarPopup';
import { substitutePreviewCampaign } from './campaignVars';

// ── Types ─────────────────────────────────────────────────────────────────────

type CampaignType = 'message' | 'friend_request' | 'mixed' | 'invite_to_group';
type MixedAction  = 'message' | 'friend_request' | 'invite_to_groups';
type SendMode     = 'random' | 'all';

export interface MixedConfig   { actions: MixedAction[]; group_ids?: string[]; }
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
  if (!raw) return { actions: ['message', 'friend_request'] };
  try {
    const p = JSON.parse(raw);
    if (p && Array.isArray(p.actions)) return p as MixedConfig;
    if (p && Array.isArray(p.group_ids)) return { actions: [], group_ids: p.group_ids };
  } catch {}
  return { actions: ['message', 'friend_request'] };
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
  { label: '1-2m',    min: 60,  max: 120 },
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
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-850 border-b border-gray-700 flex-shrink-0">
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
                  <span className={`flex-1 text-xs truncate ${checked ? 'text-blue-700 dark:text-white font-semibold' : 'text-gray-750 dark:text-gray-300'}`}>{g.display_name}</span>
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
                <span key={c} className="text-[9px] text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-650">{c}: {l}</span>
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
    { key: '{gender_greeting}',  label: 'Anh/Chị' },
    { key: '{salutation}',       label: 'Xưng hô' },
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
      
      const systemMessage = `Bạn là một trợ lý AI chuyên nghiệp giúp viết nội dung tin nhắn cho chiến dịch Zalo CRM. 
Nhiệm vụ của bạn là viết một mẫu tin nhắn tự nhiên, lôi cuốn, và cá nhân hóa dựa trên yêu cầu của người dùng.
HÃY CHỦ ĐỘNG SỬ DỤNG các thẻ biến sau trong văn bản để cá nhân hóa nội dung:
- {name}: tên hiển thị của người nhận
- {gender_greeting}: xưng hô lịch sự (Anh/Chị/Bạn)
- {salutation}: danh xưng tùy chỉnh của khách
- {alias}: biệt danh trong CRM
- {phone}: số điện thoại khách hàng
- {birthday}: ngày sinh đầy đủ (dd/MM/yyyy)
- {birthday_day}: ngày sinh nhật
- {birthday_month}: tháng sinh nhật
- {campaign_name}: tên chiến dịch
- {date}: ngày gửi
- {time}: giờ gửi

Hãy viết nội dung tin nhắn trực tiếp, không chứa bất kỳ lời dẫn nhập hay kết luận nào ngoài nội dung tin nhắn sẽ gửi đi.`;

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
              className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-750 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
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
        className="min-h-[200px] h-[200px] w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none transition-colors"
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
    if (!d) return [120, 180];
    const dm = (d as any).delay_min_seconds;
    const dx = (d as any).delay_max_seconds;
    if (dm != null && dx != null) return [dm, dx];
    const fallback = d.delay_seconds || 120;
    return [Math.max(5, fallback - 10), fallback + 10];
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
      const systemMessage = `Bạn là trợ lý viết lời mời kết bạn Zalo ngắn gọn, tự nhiên, thân thiện. 
Yiêu cầu quan trọng: 
- Tối đa 150 ký tự (bắt buộc)
- Có thể dùng biến: {name}, {gender_greeting}, {alias}
- Viết trực tiếp, không giải thích, không dẫn nhập
- Không đưa link vào nội dung`;
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

  const [contentConfig, setContentConfig] = useState<ContentConfig>(() =>
    parseContentConfig(initialData?.template_message)
  );

  const initMixed = parseMixedConfig(initialData?.mixed_config);
  const [mixedActions,   setMixedActions]   = useState<MixedAction[]>(initMixed.actions);
  const [inviteGroupIds, setInviteGroupIds] = useState<string[]>(initMixed.group_ids ?? []);

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
    let cfg: any = {};
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

  const handleSave = async () => {
    if (!isValid() || saving || isSavingRef.current) return;
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
      });
      onClose();
    } catch (err) {
      console.error(err);
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-850 border border-gray-700/60 rounded-2xl w-full max-w-[1060px] shadow-2xl flex flex-col text-gray-100"
        style={{ height: 'min(92vh, 42.5rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Topbar ── */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-700 flex-shrink-0 bg-gray-900">
          <div className="flex items-center gap-4 flex-1">
            {/* Campaign Name Input */}
            <div className="flex items-center gap-2 flex-1 max-w-[360px]">
              <span className="text-xs font-bold text-gray-300 flex-shrink-0">
                {editMode ? 'Chỉnh sửa tên:' : 'Tên chiến dịch:'}
              </span>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nhập tên chiến dịch..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors font-medium"
              />
            </div>
            {/* Small Warning Text */}
            <span className="text-[11px] text-amber-500 font-medium truncate hidden md:inline-block">
              ⚠️ Tránh gửi link/spam cho người lạ để hạn chế bị khóa tài khoản.
            </span>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-100 hover:bg-gray-750 transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── 3-column body ── */}
        <div className="flex-1 min-h-0 flex overflow-hidden">

          {/* ── LEFT: Settings ── */}
          <div className="w-52 flex-shrink-0 border-r border-gray-700 flex flex-col overflow-y-auto p-4 gap-5 bg-gray-900">

            {/* Type */}
            <div>
              <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Loại *</label>
              <div className="space-y-1">
                {TYPE_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setType(opt.value)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-colors ${
                      type === opt.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-gray-100 font-semibold'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
                    }`}>
                    <AppIcon name={opt.icon as any} className={type === opt.value ? 'text-blue-500' : 'text-gray-500'} size={14} />
                    <span className="text-xs font-medium">{opt.label}</span>
                    {type === opt.value && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Mixed actions */}
            {type === 'mixed' && (
              <div>
                <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Hành động</label>
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
              <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                <AppIcon name="clock" className="text-gray-500" size={10} />
                Delay giữa các liên hệ
              </label>
              <div className="grid grid-cols-2 gap-1">
                {DELAY_PRESETS.map(p => {
                  const active = !customDelayMode && delayMin === p.min && delayMax === p.max;
                  return (
                    <button key={p.label} type="button" onClick={() => { setDelayMin(p.min); setDelayMax(p.max); setCustomDelayMode(false); }}
                      className={`py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
                        active ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
                      }`}>
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={() => setCustomDelayMode(!customDelayMode)}
                className={`flex items-center gap-1 mt-1.5 text-[11px] px-2 py-1 rounded-lg border transition-colors w-full ${
                  customDelayMode ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                    : 'border-gray-350 dark:border-gray-600 text-gray-500 hover:text-gray-300 hover:border-gray-500'
                }`}>
                <span>{customDelayMode ? '▾' : '▸'}</span> Tùy chỉnh khoảng
              </button>
              {customDelayMode && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <input type="number" min={5} value={delayMin || ''}
                    onChange={e => setDelayMin(Math.max(5, parseInt(e.target.value) || 0))}
                    className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-750 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Tối thiểu (s)" />
                  <span className="text-gray-500 text-xs">→</span>
                  <input type="number" min={delayMin} value={delayMax || ''}
                    onChange={e => setDelayMax(Math.max(delayMin || 5, parseInt(e.target.value) || 0))}
                    className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-750 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Tối đa (s)" />
                  <span className="text-gray-500 text-[10px] flex-shrink-0">giây</span>
                </div>
              )}
              <p className="text-[10px] text-gray-550 mt-1">
                ⏱ Ngẫu nhiên <span className="text-gray-750 dark:text-gray-400 font-semibold">{fmtDelayRange(delayMin, delayMax)}</span> giữa các liên hệ
              </p>
              {isStrangerTarget && delayMin < 180 && (
                <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium mt-1.5 leading-relaxed">
                  ⚠️ Khuyến nghị: Nên giãn cách 3 - 5 phút (180s - 300s) khi gửi tin cho người lạ/kết bạn để tránh bị Zalo quét.
                </p>
              )}
            </div>

            {/* ⏱ Delay giữa các tin nhắn (chỉ khi gửi nhiều tin/liên hệ) */}
            {hasMultiSend && (
              <div>
                <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
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
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-r border-gray-700 bg-gray-850">
            {/* Center topbar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700 flex-shrink-0 min-h-[44px] bg-gray-900">
              {hasMsg ? (
                <>
                  {/* Block tabs */}
                  <div className="flex items-center gap-1 overflow-x-auto">
                    {contentConfig.blocks.map((b, i) => (
                      <button key={b.id} type="button"
                        onClick={() => setActiveBlock(i)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 border ${
                          i === activeBlock
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600'
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
            <div className="flex-1 min-h-0 p-4 overflow-y-auto flex flex-col gap-3.5">
              
              {/* ── Config Panel: Giới hạn/Ngày & Hẹn giờ chạy ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-gray-900 border border-gray-700/60 rounded-xl flex-shrink-0">
                {/* Giới hạn ngày */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                    <AppIcon name="chart" className="text-gray-500" size={10} />
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
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    <span className="text-[10px] text-gray-500 flex-shrink-0">liên hệ</span>
                  </div>
                  {isStrangerTarget && (
                    dailyLimit === 0 ? (
                      <p className="text-[9px] text-red-400 font-semibold mt-1 leading-relaxed">
                        ⚠️ Không nên để không giới hạn khi gửi người lạ/kết bạn. Zalo giới hạn 50 người/ngày.
                      </p>
                    ) : dailyLimit > 50 ? (
                      <p className="text-[9px] text-red-500 font-semibold mt-1 leading-relaxed">
                        ⚠️ Nguy hiểm: Vượt quá giới hạn 50 người/ngày của Zalo. Tài khoản dễ bị khóa!
                      </p>
                    ) : dailyLimit > 20 ? (
                      <p className="text-[9px] text-amber-500 font-medium mt-1 leading-relaxed">
                        ⚠️ Khuyến nghị: Nên đặt hạn mức từ 10 - 20 người/ngày để an toàn tối đa.
                      </p>
                    ) : null
                  )}
                </div>

                {/* Hẹn giờ chạy */}
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div onClick={() => setIsScheduled(!isScheduled)}
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                        isScheduled ? 'bg-blue-600 border-blue-600' : 'border-gray-500 hover:border-blue-400'
                      }`}>
                      {isScheduled && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">🗓 Hẹn giờ chạy</span>
                  </label>

                  {isScheduled ? (
                    <div className="grid grid-cols-2 gap-2 mt-1 animate-fadeIn">
                      <div>
                        <input
                          type="date"
                          value={schedDate}
                          onChange={e => setSchedDate(e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                      </div>
                      <div>
                        <input
                          type="time"
                          value={schedTime}
                          onChange={e => setSchedTime(e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-500 mt-1.5">
                      Chạy ngay khi kích hoạt chiến dịch
                    </p>
                  )}
                  {isScheduled && getScheduleMessage() && (
                    <p className={`text-[9px] mt-1 leading-relaxed ${getScheduleMessage().startsWith('⚠️') ? 'text-amber-500 font-semibold' : 'text-cyan-500 dark:text-cyan-400'}`}>
                      {getScheduleMessage()}
                    </p>
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
                    <span className="text-[11px] font-semibold text-gray-650 dark:text-gray-400">🤝 Lời nhắn kết bạn</span>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[9px] text-gray-500">Chèn:</span>
                      {[{k:'{name}',l:'Tên'},{k:'{zalo_name}',l:'Tên Zalo'},{k:'{gender_greeting}',l:'Anh/Chị'},{k:'{salutation}',l:'Xưng hô'}].map(v => (
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
                      {[{k:'{name}',l:'Tên'},{k:'{zalo_name}',l:'Tên Zalo'},{k:'{gender_greeting}',l:'Anh/Chị'},{k:'{salutation}',l:'Xưng hô'},{k:'{phone}',l:'SĐT'}].map(v => (
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

            {/* Warning Box — outside scroll area so it never overlaps BlockEditor buttons */}
            <div className="flex-shrink-0 mx-4 mb-3 border border-yellow-500/20 bg-yellow-500/5 rounded-xl px-3 py-2">
              <p className="text-[10px] text-yellow-500 dark:text-yellow-400 font-semibold mb-0.5">⚠️ Cảnh báo</p>
              <p className="text-[9px] text-yellow-600/70 dark:text-yellow-400/60 leading-relaxed">
                Hành động càng nhiều, nội dung càng dài, và delay càng ngắn sẽ làm tăng nguy cơ bị Zalo đánh spam. Hãy cân nhắc kỹ lưỡng khi cấu hình chiến dịch, và luôn tuân thủ nguyên tắc cộng đồng của Zalo.
              </p>
            </div>
          </div>

          {/* ── RIGHT: Preview ── */}
          <div className="w-60 flex-shrink-0 p-4 overflow-hidden flex flex-col bg-gray-900">
            {/* Auto label on success */}
            <div className="mb-4 pb-3 border-b border-gray-700 flex-shrink-0">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoLabelEnabled}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setAutoLabelEnabled(val);
                    if (val) {
                      setShowLabelSelectorPopup(true);
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border border-gray-600 text-blue-650 focus:ring-0 focus:ring-offset-0 bg-transparent cursor-pointer"
                />
                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">🏷️ Gắn nhãn tự động</span>
              </label>
              {autoLabelEnabled && (
                <div className="mt-2 pl-5">
                  {selectedLabelId || newLabelName ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold text-white shadow-sm"
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
                          <span className="truncate max-w-[90px]">{newLabelName} (Mới)</span>
                        </>
                      ) : (() => {
                          const label = localLabelsList.find(l => l.id === Number(selectedLabelId));
                          return (
                            <>
                              {label?.emoji && <span>{label.emoji}</span>}
                              <span className="truncate max-w-[90px]">{label?.name || 'Nhãn đã chọn'}</span>
                            </>
                          );
                      })()}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowLabelSelectorPopup(true);
                        }}
                        className="text-[9px] underline ml-1 hover:text-opacity-80 font-medium"
                      >
                        Sửa
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowLabelSelectorPopup(true)}
                      className="text-[10px] text-blue-500 hover:text-blue-400 font-semibold underline"
                    >
                      Chọn nhãn áp dụng
                    </button>
                  )}
                </div>
              )}

              {/* Auto-Nurture Pipeline Chaining (Tạm thời disable theo yêu cầu) */}

            </div>

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
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center gap-3 px-5 py-3 border-t border-gray-700 flex-shrink-0 bg-gray-900">
          <div className="flex-1 text-[11px] text-gray-550">
            {hasMsg && contentConfig.blocks.length > 1 && (
              <span>{contentConfig.blocks.length} biến thể · {contentConfig.mode === 'random' ? '🎲 random' : '📨 gửi tất cả'}</span>
            )}
          </div>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-transparent transition-colors font-medium">
            Hủy
          </button>
          <button onClick={handleSave} disabled={saving || !isValid()}
            className="px-6 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold flex items-center gap-2">
            {saving && <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
            {saving ? (editMode ? 'Đang lưu...' : 'Đang tạo...') : (editMode ? 'Lưu thay đổi' : 'Tạo chiến dịch')}
          </button>
        </div>

        {/* ── Chọn nhãn Popup Modal (Hình 2) ── */}
        {showLabelSelectorPopup && (() => {
          const { accounts } = useAppStore.getState ? { accounts: [] } : { accounts: [] }; // Fallback lookup if not needed
          // Let's resolve active account details
          const accountDisplayName = zaloId || 'Tài khoản';
          const accountAvatar = '';
          return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowLabelSelectorPopup(false)}>
              <div
                className="bg-[#f4f5f7] dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-[680px] shadow-2xl flex flex-col overflow-hidden text-gray-900 dark:text-gray-100"
                style={{ height: '420px' }}
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 bg-white dark:bg-gray-850">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white text-base shadow-sm">
                      🏷️
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white text-[14px]">Chọn nhãn</h4>
                      <p className="text-[10px] text-gray-500">Có thể chọn nhiều nhãn</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLabelSelectorPopup(false)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    ✕
                  </button>
                </div>

                {/* Body split */}
                <div className="flex-1 min-h-0 flex overflow-hidden">
                  {/* Left Sidebar */}
                  <div className="w-44 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-white dark:bg-gray-850 p-3 gap-1">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider px-2 mb-1.5 block">TÀI KHOẢN</span>
                    
                    {/* All item */}
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left text-xs bg-blue-500/10 text-blue-500 font-semibold border border-blue-500/10"
                    >
                      <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center text-[10px]">
                        📋
                      </div>
                      <div>
                        <p className="font-semibold">Tất cả</p>
                        <p className="text-[9px] text-blue-500/70">{localLabelsList.length} nhãn</p>
                      </div>
                    </button>

                    {/* Account profile item */}
                    <div className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left text-xs text-gray-600 dark:text-gray-400">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">
                        {accountDisplayName.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="truncate flex-1">
                        <p className="font-semibold truncate">{accountDisplayName}</p>
                        <p className="text-[9px] text-gray-505 truncate">{localLabelsList.length} nhãn</p>
                      </div>
                    </div>
                  </div>

                  {/* Right content panel */}
                  <div className="flex-1 min-h-0 flex flex-col bg-gray-50 dark:bg-gray-900">
                    {/* Tabs header */}
                    <div className="flex border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-850 px-4 flex-shrink-0">
                      <button
                        type="button"
                        className="px-4 py-2.5 text-xs font-semibold text-teal-600 dark:text-teal-400 border-b-2 border-teal-500 flex items-center gap-1.5"
                      >
                        💾 Nhãn Local <span className="bg-teal-500/15 text-teal-500 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{localLabelsList.length}</span>
                      </button>
                      <button
                        type="button"
                        disabled
                        className="px-4 py-2.5 text-xs font-semibold text-gray-450 flex items-center gap-1.5 cursor-not-allowed opacity-40"
                      >
                        ☁️ Nhãn Zalo
                      </button>
                    </div>

                    {/* Selector body */}
                    <div className="flex-1 min-h-0 p-4 overflow-y-auto flex flex-col gap-3">
                      
                      {/* Create Form */}
                      <div className="bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-xl p-3 flex flex-col gap-3 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newLabelName}
                            onChange={e => setNewLabelName(e.target.value)}
                            placeholder="Tên nhãn local mới..."
                            className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-200 placeholder-gray-450 focus:outline-none focus:border-teal-500 transition-colors"
                          />
                          
                          {/* Emoji Trigger */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowColorPicker(false); }}
                              className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-700 dark:text-gray-350 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1 min-w-[44px]"
                            >
                              <span>{newLabelEmoji}</span>
                              <span className="text-[9px] text-gray-500">▼</span>
                            </button>
                            {showEmojiPicker && (
                              <div className="absolute top-8 right-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2 shadow-2xl z-50 grid grid-cols-5 gap-1 w-44">
                                {['🎯', '🏷️', '📞', '🔄', '🔥', '⭐', '✅', '❌', '💎', '👤'].map(em => (
                                  <button
                                    key={em}
                                    type="button"
                                    onClick={() => { setNewLabelEmoji(em); setShowEmojiPicker(false); }}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sm transition-colors"
                                  >
                                    {em}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          
                          {/* Color Selector Square */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => { setShowColorPicker(!showColorPicker); setShowEmojiPicker(false); }}
                              className="w-7 h-7 rounded-lg border border-gray-300 dark:border-gray-700 transition-transform hover:scale-105 flex-shrink-0"
                              style={{ backgroundColor: newLabelColor }}
                            />
                            {showColorPicker && (
                              <div className="absolute top-8 right-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-2 shadow-2xl z-50 grid grid-cols-3 gap-1.5 w-32">
                                {['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'].map(bg => (
                                  <button
                                    key={bg}
                                    type="button"
                                    onClick={() => { setNewLabelColor(bg); setShowColorPicker(false); }}
                                    className={`w-7 h-7 rounded-lg border transition-transform hover:scale-110 ${newLabelColor === bg ? 'border-white ring-2 ring-blue-500/50' : 'border-transparent'}`}
                                    style={{ backgroundColor: bg }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              handleCreateNewLabelInPopup();
                            }}
                            disabled={!newLabelName.trim()}
                            className="px-3 py-1.5 bg-[#4f9e8a] hover:bg-[#3f8472] disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors flex-shrink-0"
                          >
                            Tạo mới
                          </button>
                        </div>
                      </div>

                      {/* Labels List */}
                      <div className="flex flex-col gap-2">
                        {localLabelsList.map(label => {
                          const isActive = Number(selectedLabelId) === label.id;
                          return (
                            <div
                              key={label.id}
                              onClick={() => {
                                setSelectedLabelId(label.id);
                                setIsCreatingNewLabel(false);
                              }}
                              className={`border rounded-xl p-2.5 flex items-center justify-between cursor-pointer transition-colors bg-white dark:bg-gray-850 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                                isActive ? 'border-blue-600/50 bg-blue-500/5 dark:bg-blue-500/5' : 'border-gray-200 dark:border-gray-800/80'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {/* Checkbox radio look */}
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                                  isActive ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-650'
                                }`}>
                                  {isActive && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                </div>
                                {/* Label badge */}
                                <span
                                  className="text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 text-white shadow-sm"
                                  style={{ backgroundColor: label.color || '#3b82f6', color: label.text_color || '#ffffff' }}
                                >
                                  {label.emoji && <span>{label.emoji}</span>}
                                  <span>{label.name}</span>
                                </span>
                              </div>
                              {/* Profile Owner */}
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <div className="w-4.5 h-4.5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold">
                                  {accountDisplayName.slice(0, 1).toUpperCase()}
                                </div>
                                <span>{accountDisplayName}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3.5 border-t border-gray-200 dark:border-gray-850 flex items-center justify-between flex-shrink-0 bg-[#f4f5f7] dark:bg-gray-850">
                  <span className="text-[11px] text-gray-550">Chọn nhãn để áp dụng</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowLabelSelectorPopup(false)}
                      className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-transparent transition-colors font-semibold"
                    >
                      Đóng
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedLabelId) {
                          setAutoLabelEnabled(true);
                        }
                        setShowLabelSelectorPopup(false);
                      }}
                      className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                    >
                      Xác nhận
                    </button>
                  </div>
                </div>

              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
