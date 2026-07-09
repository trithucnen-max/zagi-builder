import React, { useState, useRef, useEffect } from 'react';

interface ExpandedEditorModalProps {
  initialText: string;
  onClose: () => void;
  onSave: (text: string) => void;
  onSend?: (text: string) => void;
}

export default function ExpandedEditorModal({
  initialText,
  onClose,
  onSave,
  onSend,
}: ExpandedEditorModalProps) {
  const [val, setVal] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto focus on load
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(val.length, val.length);
    }
  }, []);

  const insertFormat = (prefix: string, suffix: string = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const currentVal = ta.value;
    const selectedText = currentVal.substring(start, end);
    const replacement = prefix + selectedText + suffix;
    const newVal = currentVal.substring(0, start) + replacement + currentVal.substring(end);
    setVal(newVal);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 0);
  };

  const handleApply = () => {
    onSave(val);
    onClose();
  };

  const handleSendAction = () => {
    if (!val.trim()) return;
    if (onSend) {
      onSend(val);
    } else {
      onSave(val);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-750 w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">📝</span>
            <h3 className="text-base font-semibold text-gray-100">Soạn thảo văn bản mở rộng</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 py-2 bg-gray-950 border-b border-gray-800/80 flex-wrap">
          <button
            type="button"
            onClick={() => insertFormat('**', '**')}
            title="Đậm (Ctrl+B)"
            className="w-8 h-8 rounded hover:bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-300 hover:text-white"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => insertFormat('*', '*')}
            title="Nghiêng (Ctrl+I)"
            className="w-8 h-8 rounded hover:bg-gray-800 flex items-center justify-center text-sm italic text-gray-300 hover:text-white"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => insertFormat('__', '__')}
            title="Gạch chân (Ctrl+U)"
            className="w-8 h-8 rounded hover:bg-gray-800 flex items-center justify-center text-sm underline text-gray-300 hover:text-white"
          >
            U
          </button>
          <button
            type="button"
            onClick={() => insertFormat('~~', '~~')}
            title="Gạch ngang"
            className="w-8 h-8 rounded hover:bg-gray-800 flex items-center justify-center text-sm line-through text-gray-300 hover:text-white"
          >
            S
          </button>
          
          <div className="w-px h-5 bg-gray-800 mx-1.5 self-center" />

          <button
            type="button"
            onClick={() => insertFormat('1. ')}
            title="Danh sách số"
            className="w-8 h-8 rounded hover:bg-gray-800 flex items-center justify-center text-gray-300 hover:text-white"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>
              <path d="M4 6h1v4M4 10h2M4 16h2v2H4v-2z"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={() => insertFormat('- ')}
            title="Danh sách ký tự"
            className="w-8 h-8 rounded hover:bg-gray-800 flex items-center justify-center text-gray-300 hover:text-white"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
              <circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={() => insertFormat('> ')}
            title="Trích dẫn"
            className="w-8 h-8 rounded hover:bg-gray-800 flex items-center justify-center text-sm font-serif text-gray-300 hover:text-white"
          >
            “
          </button>
          <button
            type="button"
            onClick={() => insertFormat('[', '](url)')}
            title="Chèn đường dẫn"
            className="w-8 h-8 rounded hover:bg-gray-800 flex items-center justify-center text-gray-300 hover:text-white"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={() => insertFormat('```\n', '\n```')}
            title="Khối mã code"
            className="w-8 h-8 rounded hover:bg-gray-800 flex items-center justify-center text-sm font-mono text-gray-300 hover:text-white"
          >
            {"{}"}
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 bg-gray-900 p-5 flex flex-col min-h-0">
          <textarea
            ref={textareaRef}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="Soạn nội dung tin nhắn của bạn tại đây..."
            className="w-full flex-1 bg-transparent text-gray-150 text-sm focus:outline-none resize-none overflow-y-auto leading-relaxed"
            onKeyDown={(e) => {
              // Handle formatting keyboard shortcuts
              if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
                if (e.key === 'b') { e.preventDefault(); insertFormat('**', '**'); }
                if (e.key === 'i') { e.preventDefault(); insertFormat('*', '*'); }
                if (e.key === 'u') { e.preventDefault(); insertFormat('__', '__'); }
              }
              // Send message on Ctrl + Enter or Cmd + Enter
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSendAction();
              }
            }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 bg-gray-950 border-t border-gray-800/80">
          <span className="text-xs text-gray-500 font-mono">
            Ký tự: {val.length} | Dòng: {val.split('\n').length}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-750 text-gray-400 hover:text-gray-200 hover:bg-gray-850 text-xs font-semibold transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition-colors border border-gray-700"
            >
              Áp dụng
            </button>
            <button
              disabled={!val.trim()}
              onClick={handleSendAction}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-blue-500/10"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              Gửi ngay
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
