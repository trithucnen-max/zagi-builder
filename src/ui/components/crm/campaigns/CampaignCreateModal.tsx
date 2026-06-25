import React, { useState, useEffect, useRef } from 'react';
import ipc from '@/lib/ipc';
import { toLocalMediaUrl } from '@/lib/localMedia';

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

// Preview substitution — replaces variables with dummy values
function substitutePreview(text: string, campaignName: string = ''): string {
  const now = new Date();
  const todayDD = String(now.getDate()).padStart(2, '0');
  const todayMM = String(now.getMonth() + 1).padStart(2, '0');
  const todayYYYY = now.getFullYear();
  const todayTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (text || '')
    .replace(/\{name\}/g, 'Nguyễn Văn A')
    .replace(/\{userId\}/g, '0987654321')
    .replace(/\{gender_greeting\}/g, 'Anh/Chị')
    .replace(/\{alias\}/g, 'Biệt danh A')
    .replace(/\{campaign_name\}/g, campaignName || 'Chiến dịch tri ân')
    .replace(/\{date\}/g, `${todayDD}/${todayMM}/${todayYYYY}`)
    .replace(/\{time\}/g, todayTime)
    .replace(/\{birthday_day\}/g, todayDD)
    .replace(/\{birthday_month\}/g, todayMM);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const genId = () => Math.random().toString(36).slice(2, 9);

function parseContentConfig(raw?: string): ContentConfig {
  if (!raw) return { mode: 'random', blocks: [{ id: genId(), text: '', images: [] }] };
  try {
    const p = JSON.parse(raw);
    if (p?.blocks && Array.isArray(p.blocks)) return p as ContentConfig;
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

// ── Constants ─────────────────────────────────────────────────────────────────

const TEMPLATE_VARS = [
  { key: '{name}', label: '👤 Tên Zalo' },
  { key: '{userId}', label: '🆔 ID Zalo' },
  { key: '{gender_greeting}', label: '👫 Anh/Chị' },
  { key: '{alias}', label: '🏷️ Biệt danh' },
  { key: '{campaign_name}', label: '📢 Chiến dịch' },
  { key: '{date}', label: '📅 Ngày' },
  { key: '{time}', label: '⏰ Giờ' },
  { key: '{birthday_day}', label: '🎂 Ngày sinh' },
  { key: '{birthday_month}', label: '🎂 Tháng sinh' },
];

const DELAY_OPTIONS = [
  { label: '5s',    value: 5   }, { label: '15s',   value: 15  },
  { label: '30s',   value: 30  }, { label: '1 phút', value: 60  },
  { label: '2 phút',value: 120 }, { label: '3 phút', value: 180 },
  { label: '5 phút',value: 300 }, { label: '15 phút',value: 900 },
];

const TYPE_OPTIONS: { value: CampaignType; icon: string; label: string }[] = [
  { value: 'message',         icon: '💬', label: 'Tin nhắn'   },
  { value: 'friend_request',  icon: '🤝', label: 'Kết bạn'    },
  { value: 'invite_to_group', icon: '👥', label: 'Mời nhóm'   },
  { value: 'mixed',           icon: '🔀', label: 'Hỗn hợp'    },
];

const INVITE_ERROR_LABELS: Record<number, string> = {
  269: 'Chưa là bạn bè', 178: 'Đã là thành viên', 263: 'Đã gửi lời mời',
  262: 'Đã có lời mời',  177: 'Nhóm đầy',          166: 'Không có quyền',
  245: 'Người lạ',       122: 'Bị chặn',            247: 'Bị bỏ qua nhóm',
};

// ── Live Preview Component ─────────────────────────────────────────────────────

function LivePreview({
  blocks, activeIdx, mode, type, friendMsg, campaignName = '',
  onTabChange,
}: {
  blocks: ContentBlock[];
  activeIdx: number;
  mode: SendMode;
  type: CampaignType;
  friendMsg: string;
  campaignName?: string;
  onTabChange: (i: number) => void;
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
      <div className="flex-1 min-h-0 flex flex-col border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-gray-800">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">Z</div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 truncate">Nguyễn Văn A</p>
            <p className="text-[9px] text-gray-550 dark:text-gray-400">Zalo</p>
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
                    {block.images.map((p, i) => (
                      <div key={i} className="aspect-square overflow-hidden rounded">
                        <img src={toLocalMediaUrl(p)} alt="" className="w-full h-full object-cover"
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
  block, onUpdate,
}: {
  block: ContentBlock;
  onUpdate: (u: Partial<ContentBlock>) => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);

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
- {name}: để xưng tên người nhận
- {gender_greeting}: để xưng hô lịch sự (Anh/Chị/Bạn)
- {alias}: để gọi biệt danh
- {campaign_name}: tên chiến dịch
- {date}: ngày gửi
- {time}: giờ gửi
- {birthday_day}: ngày sinh nhật
- {birthday_month}: tháng sinh nhật

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

  const pickImages = async () => {
    const r = await ipc.file?.openDialog({
      filters: [{ name: 'Hình ảnh', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (r?.filePaths?.length) onUpdate({ images: [...block.images, ...r.filePaths] });
  };

  const hasLink = /https?:\/\/[^\s]+/i.test(block.text);

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Variable chips & AI button */}
      <div className="flex items-center justify-between flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-gray-500">Chèn biến:</span>
          {TEMPLATE_VARS.map(v => (
            <button key={v.key} type="button" onClick={() => insertVar(v.key)}
              className="text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30 text-blue-400 hover:bg-blue-500/15 font-sans transition-colors font-medium"
              title={`Chèn biến ${v.key}`}>
              {v.label}
            </button>
          ))}
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

      {/* Textarea — takes most space */}
      <textarea
        ref={taRef}
        value={block.text}
        onChange={e => onUpdate({ text: e.target.value })}
        placeholder={'Soạn nội dung tin nhắn...\nDùng {name} để chèn tên người nhận'}
        className="flex-1 min-h-0 w-full bg-white dark:bg-gray-850 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none transition-colors"
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
            {block.images.map((p, i) => (
              <div key={i} className="relative group/img w-14 h-14 rounded-lg overflow-hidden border border-gray-350 dark:border-gray-700 flex-shrink-0">
                <img src={toLocalMediaUrl(p)} alt="" className="w-full h-full object-cover"
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
        <button type="button" onClick={pickImages}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-500 hover:text-blue-600 border border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500/50 rounded-lg transition-colors bg-white dark:bg-gray-800">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          {block.images.length > 0 ? `${block.images.length} ảnh · thêm tiếp` : 'Đính kèm ảnh (tuỳ chọn)'}
        </button>
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function CampaignCreateModal({
  initialData, editMode = false, zaloId, onClose, onSave,
}: CampaignCreateModalProps) {
  const [name,          setName]         = useState(initialData?.name ?? '');
  const [type,          setType]         = useState<CampaignType>(initialData?.campaign_type ?? 'message');
  const [delay,         setDelay]        = useState(initialData?.delay_seconds ?? 120);
  const [saving,        setSaving]       = useState(false);
  const [friendReqMsg,  setFriendReqMsg] = useState(initialData?.friend_request_message ?? '');
  const [activeBlock,   setActiveBlock]  = useState(0);
  const [dailyLimit,    setDailyLimit]   = useState(initialData?.daily_send_limit ?? 0);
  const [dailyStartTime, setDailyStartTime] = useState(initialData?.daily_start_time ?? '08:00');
  const friendReqRef = useRef<HTMLTextAreaElement>(null);

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
    if (type === 'invite_to_group') return JSON.stringify({ group_ids: inviteGroupIds });
    if (type !== 'mixed') return '{}';
    const cfg: MixedConfig = { actions: mixedActions };
    if (mixedActions.includes('invite_to_groups') && inviteGroupIds.length > 0) cfg.group_ids = inviteGroupIds;
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
    return true;
  };

  const handleSave = async () => {
    if (!isValid()) return;
    setSaving(true);

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
      delay_seconds: delay,
      daily_send_limit: dailyLimit,
      daily_start_time: dailyStartTime,
      scheduled_start_at: scheduledStartAt,
    });
    setSaving(false);
    onClose();
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

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl w-full max-w-[1060px] shadow-2xl flex flex-col text-gray-900 dark:text-gray-100"
        style={{ height: 'min(92vh, 42.5rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Topbar ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-850">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-[15px]">
              {editMode ? '✏️ Chỉnh sửa chiến dịch' : '🚀 Tạo chiến dịch mới'}
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Cấu hình nội dung và phương thức gửi</p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-750 transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── 3-column body ── */}
        <div className="flex-1 min-h-0 flex overflow-hidden">

          {/* ── LEFT: Settings ── */}
          <div className="w-52 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-y-auto p-4 gap-5 bg-gray-50 dark:bg-gray-850">
            {/* Campaign name */}
            <div>
              <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Tên chiến dịch *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Nhập tên..."
                className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-750 rounded-lg px-2.5 py-2 text-xs text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors" />
            </div>

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
                    <span className={`text-base leading-none ${type === opt.value ? '' : 'grayscale opacity-60'}`}>{opt.icon}</span>
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
                    { action: 'message' as MixedAction,         icon: '💬', label: 'Tin nhắn' },
                    { action: 'friend_request' as MixedAction,  icon: '🤝', label: 'Kết bạn' },
                    { action: 'invite_to_groups' as MixedAction, icon: '👥', label: 'Mời nhóm' },
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
                        <span className="text-base leading-none">{icon}</span>
                        <span className="text-xs text-gray-700 dark:text-gray-300">{label}</span>
                      </label>
                    );
                  })}
                  {!mixedActions.length && <p className="text-[10px] text-red-400 px-1">Chọn ít nhất 1 hành động</p>}
                </div>
              </div>
            )}

            {/* Delay */}
            <div>
              <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5">⏱ Delay</label>
              <div className="grid grid-cols-2 gap-1">
                {DELAY_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setDelay(opt.value)}
                    className={`py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
                      delay === opt.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold'
                        : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-gray-300'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-600 mt-1">± 10s jitter ngẫu nhiên</p>
              {isStrangerTarget && delay < 180 && (
                <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium mt-1.5 leading-relaxed">
                  ⚠️ Khuyến nghị: Nên giãn cách 3 - 5 phút (180s - 300s) khi gửi tin cho người lạ/kết bạn để tránh bị Zalo quét.
                </p>
              )}
            </div>

            {/* Daily Send Limit */}
            <div>
              <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5">📊 Giới hạn/ngày</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={dailyLimit || ''}
                    onChange={e => setDailyLimit(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="Không giới hạn"
                    className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-750 rounded-lg px-2.5 py-2 text-xs text-gray-955 dark:text-gray-250 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <span className="text-[10px] text-gray-500 flex-shrink-0">liên hệ</span>
                </div>
                <div>
                  <label className="text-[10px] text-gray-600 dark:text-gray-400 block mb-1">Giờ bắt đầu chạy</label>
                  <input
                    type="time"
                    value={dailyStartTime}
                    onChange={e => setDailyStartTime(e.target.value || '08:00')}
                    className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-750 rounded-lg px-2.5 py-2 text-xs text-gray-955 dark:text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <p className="text-[10px] text-gray-600 mt-0.5">Nếu giờ này đã qua hôm nay, chiến dịch chạy ngay</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-600 mt-1">
                {dailyLimit > 0
                  ? `Gửi tối đa ${dailyLimit}/ngày từ ${dailyStartTime}`
                  : 'Gửi không giới hạn (theo token bucket)'}
              </p>
              {isStrangerTarget && (
                dailyLimit === 0 ? (
                  <p className="text-[10px] text-red-500 dark:text-red-400 font-semibold mt-1.5 leading-relaxed">
                    ⚠️ Cảnh báo: Không nên để không giới hạn khi gửi kết bạn/người lạ. Hạn mức an toàn khuyên dùng: 10 - 20 người/ngày.
                  </p>
                ) : dailyLimit > 20 ? (
                  <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium mt-1.5 leading-relaxed">
                    ⚠️ Khuyến nghị: Chỉ nên gửi kết bạn tối đa 10 - 20 người/ngày để tránh bị Zalo khóa tài khoản.
                  </p>
                ) : null
              )}
            </div>

            {/* Precise Scheduling */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <label className="flex items-center gap-2 cursor-pointer mb-2">
                <div onClick={() => setIsScheduled(!isScheduled)}
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                    isScheduled ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-500 hover:border-blue-400'
                  }`}>
                  {isScheduled && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider">🗓 Hẹn giờ chạy</span>
              </label>

              {isScheduled && (
                <div className="space-y-2 pl-6 animate-fadeIn">
                  <div>
                    <label className="text-[10px] text-gray-600 dark:text-gray-400 block mb-1">Ngày chạy</label>
                    <input
                      type="date"
                      value={schedDate}
                      onChange={e => setSchedDate(e.target.value)}
                      className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-750 rounded-lg px-2.5 py-1.5 text-xs text-gray-955 dark:text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-600 dark:text-gray-400 block mb-1">Giờ chạy</label>
                    <input
                      type="time"
                      value={schedTime}
                      onChange={e => setSchedTime(e.target.value)}
                      className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-750 rounded-lg px-2.5 py-1.5 text-xs text-gray-955 dark:text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  {getScheduleMessage() && (
                    <p className={`text-[10px] mt-1 leading-relaxed ${getScheduleMessage().startsWith('⚠️') ? 'text-amber-500 font-semibold' : 'text-cyan-500 dark:text-cyan-400'}`}>
                      {getScheduleMessage()}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Warning */}
            <div className="border border-yellow-500/20 rounded-lg p-2.5 mt-auto">
              <p className="text-[10px] text-yellow-400 font-semibold mb-1">⚠️ Cảnh báo</p>
              <p className="text-[9px] text-yellow-300/60 leading-relaxed">
                Hành động càng nhiều, nội dung càng dài, và delay càng ngắn sẽ làm tăng nguy cơ bị Zalo đánh spam. Hãy cân nhắc kỹ lưỡng khi cấu hình chiến dịch, và luôn tuân thủ nguyên tắc cộng đồng của Zalo.
              </p>
            </div>
          </div>

          {/* ── CENTER: Editor ── */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            {/* Center topbar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 min-h-[44px] bg-gray-50 dark:bg-gray-850">
              {hasMsg && !hasInvite ? (
                <>
                  {/* Block tabs */}
                  <div className="flex items-center gap-1 overflow-x-auto">
                    {contentConfig.blocks.map((b, i) => (
                      <button key={b.id} type="button"
                        onClick={() => setActiveBlock(i)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 border ${
                          i === activeBlock
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500'
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
                        { value: 'random' as SendMode, icon: '🎲', label: 'Random' },
                        { value: 'all' as SendMode,    icon: '📨', label: 'Tất cả' },
                      ]).map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => setContentConfig(prev => ({ ...prev, mode: opt.value }))}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors border ${
                            contentConfig.mode === opt.value
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                          }`}>
                          <span>{opt.icon}</span> {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : hasFR && !hasMsg ? (
                <>
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-300">🤝 Lời nhắn kết bạn</span>
                  <div className="flex gap-1 flex-wrap">
                    {TEMPLATE_VARS.map(v => (
                      <button key={v.key} type="button" onClick={() => insertFRVar(v.key)}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30 text-blue-400 hover:bg-blue-500/15 font-sans transition-colors font-medium"
                        title={`Chèn biến ${v.key}`}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : hasInvite && !hasMsg ? (
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-300">👥 Chọn nhóm để mời</span>
              ) : (
                <span className="text-xs text-gray-500">Editor</span>
              )}
            </div>

            {/* Center content area */}
            <div className="flex-1 min-h-0 p-4 overflow-y-auto flex flex-col gap-3">
              {/* Message block editor */}
              {hasMsg && currentBlock && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <BlockEditor
                    block={currentBlock}
                    onUpdate={u => updateBlock(currentBlock.id, u)}
                  />
                </div>
              )}

              {/* Friend request — inline in center when mixed */}
              {hasFR && hasMsg && (
                <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 pt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-gray-650 dark:text-gray-400">🤝 Lời nhắn kết bạn</span>
                    <div className="flex gap-1 flex-wrap">
                      {TEMPLATE_VARS.map(v => (
                        <button key={v.key} type="button" onClick={() => insertFRVar(v.key)}
                          className="text-[9px] px-1.5 py-0.5 rounded-full border border-blue-500/30 text-blue-400 hover:bg-blue-500/15 font-sans transition-colors font-medium"
                          title={`Chèn biến ${v.key}`}>
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea ref={friendReqRef} value={friendReqMsg} onChange={e => setFriendReqMsg(e.target.value)}
                    rows={2} placeholder="Xin chào {name}, tôi muốn kết nối với bạn!"
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none transition-colors" />
                  {hasFRMsgLink && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium mt-1 leading-relaxed">
                      ⚠️ Cảnh báo: Tránh gửi đường link (liên kết) kèm theo lời mời kết bạn.
                    </p>
                  )}
                </div>
              )}

              {/* Standalone friend request */}
              {hasFR && !hasMsg && (
                <div className="flex-1 min-h-0 flex flex-col gap-2">
                  <textarea ref={friendReqRef} value={friendReqMsg} onChange={e => setFriendReqMsg(e.target.value)}
                    placeholder="Xin chào {name}, tôi muốn kết nối với bạn!"
                    className="flex-1 min-h-0 w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none transition-colors" />
                  {hasFRMsgLink && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium px-1 leading-relaxed">
                      ⚠️ Cảnh báo: Tránh gửi đường link (liên kết) kèm theo lời mời kết bạn.
                    </p>
                  )}
                  <p className="text-[10px] text-gray-550 dark:text-gray-500 text-right flex-shrink-0">{friendReqMsg.length}/200 ký tự</p>
                </div>
              )}

              {/* Invite to groups */}
              {hasInvite && !hasMsg && (
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
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
          <div className="w-60 flex-shrink-0 p-4 overflow-hidden flex flex-col bg-gray-50 dark:bg-gray-855">
            <LivePreview
              blocks={contentConfig.blocks}
              activeIdx={activeBlock}
              mode={contentConfig.mode}
              type={type}
              friendMsg={friendReqMsg}
              campaignName={name}
              onTabChange={setActiveBlock}
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center gap-3 px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800">
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
      </div>
    </div>
  );
}
