import React, { useState, useRef } from 'react';
import ipc from '@/lib/ipc';

export type LeaveMode = 'normal' | 'silent' | 'farewell';

export interface BulkLeaveGroupOptions {
  mode: LeaveMode;
  blockAfterLeave: boolean;
  farewellMessage: string;
}

interface BulkLeaveGroupModalProps {
  groupCount: number;
  onConfirm: (options: BulkLeaveGroupOptions) => void;
  onClose: () => void;
  isLoading?: boolean;
}

// ── AI Farewell Assistant ─────────────────────────────────────────────────────
function AIFarewellHelper({ onInsert }: { onInsert: (text: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [show, setShow] = useState(false);

  const generate = async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    try {
      const listRes = await ipc.ai?.listAssistants();
      const assistantId = listRes?.assistants?.[0]?.id || 'default';

      const systemMsg = `Bạn là trợ lý AI chuyên soạn tin nhắn tạm biệt khi rời nhóm Zalo.
Viết một lời tạm biệt ngắn gọn (2-4 câu), lịch sự, chân thành và tự nhiên.
Không dùng cụm từ sáo rỗng. Không chèn tên riêng hay biến số.
Chỉ trả về nội dung tin nhắn, không có bất kỳ lời dẫn nhập nào.`;

      const res = await ipc.ai?.chat(assistantId, [
        { role: 'system', content: systemMsg },
        { role: 'user', content: prompt },
      ]);

      if (res?.success && res?.result) {
        onInsert(res.result.trim());
        setShow(false);
        setPrompt('');
      } else {
        alert(res?.error || 'Không thể tạo nội dung. Kiểm tra cấu hình AI trong Cài đặt.');
      }
    } catch (e: any) {
      alert(`Lỗi AI: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-semibold border transition-colors ${
          show
            ? 'bg-emerald-600 border-emerald-500 text-white'
            : 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10'
        }`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
        </svg>
        AI soạn lời chào
      </button>

      {show && (
        <div className="mt-2 p-3 bg-emerald-950/30 border border-emerald-500/20 rounded-xl space-y-2">
          <p className="text-[10px] text-emerald-400/70">Mô tả ngắn gọn để AI soạn lời tạm biệt phù hợp</p>
          <div className="flex gap-2">
            <input
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="VD: cảm ơn nhóm, rời vì không còn hoạt động trong lĩnh vực này..."
              className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors"
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); generate(); }
              }}
            />
            <button
              type="button"
              disabled={generating || !prompt.trim()}
              onClick={generate}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors flex-shrink-0"
            >
              {generating && (
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              )}
              {generating ? 'Đang soạn...' : 'Soạn'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Leave Mode Option Card ────────────────────────────────────────────────────
interface ModeCardProps {
  value: LeaveMode;
  current: LeaveMode;
  icon: string;
  label: string;
  description: string;
  color: 'gray' | 'blue' | 'emerald';
  onChange: (v: LeaveMode) => void;
}

function ModeCard({ value, current, icon, label, description, color, onChange }: ModeCardProps) {
  const isSelected = current === value;
  const colorMap = {
    gray:    { border: 'border-gray-500/60', bg: 'bg-gray-700/40', dot: 'bg-gray-400', ring: 'ring-gray-500/50', text: 'text-gray-300' },
    blue:    { border: 'border-blue-500/50',  bg: 'bg-blue-500/8',  dot: 'bg-blue-400',  ring: 'ring-blue-500/40',  text: 'text-blue-300'  },
    emerald: { border: 'border-emerald-500/50', bg: 'bg-emerald-500/8', dot: 'bg-emerald-400', ring: 'ring-emerald-500/40', text: 'text-emerald-300' },
  };
  const c = colorMap[color];

  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-left ${
        isSelected
          ? `${c.border} ${c.bg} ring-1 ${c.ring}`
          : 'border-gray-700/50 hover:border-gray-600'
      }`}
    >
      {/* Radio dot */}
      <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
        isSelected ? `${c.border} ${c.bg}` : 'border-gray-600'
      }`}>
        {isSelected && <div className={`w-2 h-2 rounded-full ${c.dot}`} />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-base leading-none">{icon}</span>
          <span className={`text-xs font-semibold ${isSelected ? c.text : 'text-gray-300'}`}>{label}</span>
        </div>
        <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </button>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
export default function BulkLeaveGroupModal({
  groupCount, onConfirm, onClose, isLoading = false,
}: BulkLeaveGroupModalProps) {
  const [mode, setMode] = useState<LeaveMode>('normal');
  const [blockAfterLeave, setBlockAfterLeave] = useState(false);
  const [farewellMessage, setFarewellMessage] = useState('');

  const isFarewell = mode === 'farewell';
  const canConfirm = !isLoading && (!isFarewell || farewellMessage.trim().length > 0);

  const handleConfirm = () => {
    onConfirm({
      mode,
      blockAfterLeave,
      farewellMessage: isFarewell ? farewellMessage.trim() : '',
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
      onClick={() => { if (!isLoading) onClose(); }}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-[420px] shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
          <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-white text-sm">Rời nhóm hàng loạt</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {groupCount} nhóm được chọn · Hành động không thể hoàn tác
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors disabled:opacity-40"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Leave Mode Selection ── */}
        <div className="px-5 pt-4 pb-3 space-y-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-3">
            Chọn cách rời nhóm
          </p>

          {/* Normal */}
          <ModeCard
            value="normal"
            current={mode}
            icon="📢"
            label="Rời bình thường"
            description="Thông báo cho nhóm biết bạn đã rời, không gửi thêm tin nhắn"
            color="gray"
            onChange={setMode}
          />

          {/* Silent */}
          <ModeCard
            value="silent"
            current={mode}
            icon="🤫"
            label="Rời trong im lặng"
            description="Rời không thông báo, các thành viên sẽ không thấy bạn đã rời"
            color="blue"
            onChange={setMode}
          />

          {/* Farewell */}
          <ModeCard
            value="farewell"
            current={mode}
            icon="👋"
            label="Gửi lời chào trước khi rời"
            description="Gửi một tin nhắn tạm biệt đến nhóm, sau đó rời bình thường"
            color="emerald"
            onChange={setMode}
          />

          {/* Farewell message editor — chỉ hiện khi chọn farewell */}
          {isFarewell && (
            <div className="pt-1 space-y-2">
              <textarea
                value={farewellMessage}
                onChange={e => setFarewellMessage(e.target.value)}
                placeholder="Nhập lời chào tạm biệt... (sẽ được gửi đến từng nhóm trước khi rời)"
                rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500 resize-none transition-colors leading-relaxed"
              />
              <div className="flex items-center justify-between">
                <AIFarewellHelper onInsert={text => setFarewellMessage(text)} />
                {farewellMessage && (
                  <span className="text-[10px] text-gray-600">{farewellMessage.length} ký tự</span>
                )}
              </div>
              {!farewellMessage.trim() && (
                <p className="text-[10px] text-amber-500/80 flex items-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  Cần nhập nội dung tin nhắn tạm biệt
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Block After Leave (độc lập với chế độ rời) ── */}
        <div className="px-5 pb-4">
          <button
            type="button"
            onClick={() => setBlockAfterLeave(v => !v)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
              blockAfterLeave
                ? 'border-amber-500/40 bg-amber-500/8'
                : 'border-gray-700/50 hover:border-gray-600'
            }`}
          >
            <div className={`relative w-10 h-5 rounded-full border-2 flex-shrink-0 transition-all ${
              blockAfterLeave ? 'border-amber-500 bg-amber-500' : 'border-gray-600 bg-gray-800'
            }`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full shadow transition-all ${
                blockAfterLeave ? 'left-[1.375rem] bg-white' : 'left-0.5 bg-gray-500'
              }`} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span>🚫</span>
                <span className={`text-xs font-semibold ${blockAfterLeave ? 'text-amber-300' : 'text-gray-300'}`}>
                  Chặn thêm vào nhóm
                </span>
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Block admin/owner nhóm đó để ngăn họ thêm lại bạn
              </p>
            </div>
          </button>
        </div>

        {/* ── Summary ── */}
        <div className="mx-5 mb-4 p-3 bg-gray-800/60 border border-gray-700/60 rounded-xl">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Sắp thực hiện:
            <span className="text-red-300 font-semibold"> rời {groupCount} nhóm</span>
            {mode === 'silent' && <span className="text-blue-300"> · im lặng</span>}
            {mode === 'farewell' && farewellMessage.trim() && <span className="text-emerald-300"> · có lời chào</span>}
            {blockAfterLeave && <span className="text-amber-300"> · chặn thêm lại</span>}
            .
          </p>
        </div>

        {/* ── Actions ── */}
        <div className="flex gap-2.5 px-5 pb-5">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-gray-300 text-sm hover:bg-gray-700 hover:text-white disabled:opacity-40 transition-colors font-medium"
          >
            Hủy
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Đang rời...
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Xác nhận rời nhóm
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
