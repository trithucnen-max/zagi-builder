import React, { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';

interface ExpandedEditorModalProps {
  initialText: string;
  initialFmtRanges?: Array<{ start: number; len: number; st: string }>;
  onClose: () => void;
  onSave: (text: string, fmtRanges?: Array<{ start: number; len: number; st: string }>) => void;
  onSend?: (text: string, fmtRanges?: Array<{ start: number; len: number; st: string }>) => void;
}

interface FmtBtnProps {
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  children: React.ReactNode;
}

function FmtBtn({ active, onClick, title, children }: FmtBtnProps) {
  return (
    <button
      type="button"
      onMouseDown={onClick}
      title={title}
      className={`w-9.5 h-9.5 rounded flex items-center justify-center transition-colors ${
        active
          ? 'bg-blue-600/25 text-blue-400 border border-blue-500/35'
          : 'hover:bg-gray-800 text-gray-300 hover:text-white border border-transparent'
      }`}
    >
      {children}
    </button>
  );
}

// Custom Extension to support inline font size
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return {
      types: ['textStyle'],
    };
  },
  addAttributes() {
    return {
      fontSize: {
        default: null,
        parseHTML: element => element.style.fontSize,
        renderHTML: attributes => {
          if (!attributes.fontSize) {
            return {};
          }
          return {
            style: `font-size: ${attributes.fontSize}`,
          };
        },
      },
    };
  },
});

export default function ExpandedEditorModal({
  initialText,
  initialFmtRanges = [],
  onClose,
  onSave,
  onSend,
}: ExpandedEditorModalProps) {
  // ── Rich-text helpers ────────────────────────────────────────────────────────

  const buildRichHtml = useCallback((plainText: string, ranges: Array<{ start: number; len: number; st: string }>): string => {
    if (!plainText) return '';
    const n = plainText.length;
    const charStyles: Set<string>[] = Array.from({ length: n }, () => new Set<string>());
    for (const r of ranges) {
      const end = Math.min(r.start + r.len, n);
      for (let i = r.start; i < end; i++) {
        charStyles[i].add(r.st);
      }
    }

    const segments: Array<{ text: string; styles: Set<string> }> = [];
    let i = 0;
    while (i < n) {
      const cur = charStyles[i];
      let j = i + 1;
      while (j < n && setsEqual(charStyles[j], cur)) j++;
      segments.push({ text: plainText.slice(i, j), styles: cur });
      i = j;
    }

    function setsEqual(a: Set<string>, b: Set<string>): boolean {
      if (a.size !== b.size) return false;
      for (const x of a) if (!b.has(x)) return false;
      return true;
    }

    return segments.map(seg => {
      const escaped = seg.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      if (seg.styles.size === 0) return escaped;
      const styleMap: Record<string, string> = {
        b: 'font-weight:bold',
        i: 'font-style:italic',
        u: 'text-decoration:underline',
        s: 'text-decoration:line-through',
        c_db342e: 'color:#db342e',
        c_f27806: 'color:#f27806',
        c_f7b503: 'color:#f7b503',
        c_15a85f: 'color:#15a85f',
        c_3b82f6: 'color:#3b82f6',
        c_7c3aed: 'color:#7c3aed',
        c_db2777: 'color:#db2777',
        c_9ca3af: 'color:#9ca3af',
        f_12: 'font-size:12px',
        f_13: 'font-size:13px',
        f_14: 'font-size:14px',
        f_16: 'font-size:16px',
        f_18: 'font-size:18px',
        f_20: 'font-size:20px',
      };
      const decorations: string[] = [];
      const cssStyles: string[] = [];
      for (const st of seg.styles) {
        if (st === 'u') decorations.push('underline');
        else if (st === 's') decorations.push('line-through');
        else if (styleMap[st]) cssStyles.push(styleMap[st]);
      }
      if (decorations.length) cssStyles.push(`text-decoration:${decorations.join(' ')}`);
      return `<span style="${cssStyles.join(';')}">${escaped}</span>`;
    }).join('');
  }, []);

  // ── Exporter to Zalo RTF ───────────────────────────────────────────────────

  const exportFromTiptap = useCallback((docJSON: any): { text: string; fmtRanges: Array<{ start: number; len: number; st: string }> } => {
    let text = '';
    const fmtRanges: Array<{ start: number; len: number; st: string }> = [];

    const traverse = (node: any, inList = false) => {
      if (!node) return;

      if (node.type === 'text') {
        let content = node.text || '';
        let isLink = false;
        let href = '';
        let isCode = false;

        if (node.marks) {
          for (const mark of node.marks) {
            if (mark.type === 'link') {
              isLink = true;
              href = mark.attrs?.href || '';
            } else if (mark.type === 'code') {
              isCode = true;
            }
          }
        }

        if (isLink && href) {
          content = `[${content}](${href})`;
        } else if (isCode) {
          content = `\`${content}\``;
        }

        const start = text.length;
        text += content;
        const len = content.length;

        if (node.marks && len > 0) {
          for (const mark of node.marks) {
            if (mark.type === 'bold') {
              fmtRanges.push({ start, len, st: 'b' });
            } else if (mark.type === 'italic') {
              fmtRanges.push({ start, len, st: 'i' });
            } else if (mark.type === 'underline') {
              fmtRanges.push({ start, len, st: 'u' });
            } else if (mark.type === 'strike') {
              fmtRanges.push({ start, len, st: 's' });
            } else if (mark.type === 'textStyle') {
              const attrs = mark.attrs || {};
              if (attrs.color) {
                const hex = attrs.color.replace('#', '').toLowerCase();
                fmtRanges.push({ start, len, st: `c_${hex}` });
              }
              if (attrs.fontSize) {
                const size = attrs.fontSize.replace('px', '');
                fmtRanges.push({ start, len, st: `f_${size}` });
              }
            }
          }
        }
      } else if (node.type === 'bulletList') {
        if (node.content) {
          node.content.forEach((listItem: any) => {
            text += '• ';
            if (listItem.content) {
              listItem.content.forEach((child: any) => {
                traverse(child, true);
              });
            }
            text += '\n';
          });
        }
      } else if (node.type === 'orderedList') {
        if (node.content) {
          node.content.forEach((listItem: any, idx: number) => {
            text += `${idx + 1}. `;
            if (listItem.content) {
              listItem.content.forEach((child: any) => {
                traverse(child, true);
              });
            }
            text += '\n';
          });
        }
      } else if (node.type === 'hardBreak') {
        text += '\n';
      } else {
        const isBlock = ['paragraph', 'heading', 'blockquote', 'codeBlock'].includes(node.type);
        const startLen = text.length;

        if (node.content) {
          node.content.forEach((child: any) => {
            traverse(child, inList);
          });
        }

        if (isBlock && text.length > startLen && !inList) {
          text += '\n';
        }
      }
    };

    if (docJSON && docJSON.content) {
      docJSON.content.forEach((child: any) => {
        traverse(child, false);
      });
    }

    if (text.endsWith('\n')) {
      text = text.slice(0, -1);
    }

    return { text, fmtRanges };
  }, []);

  // ── Initialize Tiptap ──────────────────────────────────────────────────────

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontSize,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-400 underline cursor-pointer',
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[300px] outline-none w-full h-full text-gray-100 max-w-none select-text',
      },
    },
    content: '',
  });

  // Set initial content once editor is ready
  useEffect(() => {
    if (editor && initialText) {
      const html = buildRichHtml(initialText, initialFmtRanges);
      editor.commands.setContent(html);
    }
  }, [editor, initialText, initialFmtRanges, buildRichHtml]);

  if (!editor) {
    return null;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  const toggleLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Nhập URL liên kết:', previousUrl || 'https://');
    if (url === null) {
      return;
    }
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const handleApply = () => {
    const { text, fmtRanges } = exportFromTiptap(editor.getJSON());
    onSave(text.trimEnd(), fmtRanges);
    onClose();
  };

  const handleSendAction = () => {
    const { text, fmtRanges } = exportFromTiptap(editor.getJSON());
    if (!text.trim()) return;
    if (onSend) {
      onSend(text.trimEnd(), fmtRanges);
    } else {
      onSave(text.trimEnd(), fmtRanges);
    }
    onClose();
  };

  // Get current character count from exported text
  const exported = exportFromTiptap(editor.getJSON());
  const charCount = exported.text.length;
  const lineCount = exported.text ? exported.text.split('\n').length : 0;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      {/* Scope Editor Styling */}
      <style dangerouslySetInnerHTML={{ __html: `
        .ProseMirror {
          outline: none;
          min-height: 300px;
          color: #e5e7eb;
          font-size: 14px;
          line-height: 1.625;
          font-family: inherit;
        }
        .ProseMirror p {
          margin: 0 0 8px 0;
        }
        .ProseMirror ul {
          list-style-type: disc;
          padding-left: 20px;
          margin: 8px 0;
        }
        .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 20px;
          margin: 8px 0;
        }
        .ProseMirror code {
          background-color: #1f2937;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
          font-size: 0.9em;
          color: #f87171;
        }
        .ProseMirror a {
          color: #60a5fa;
          text-decoration: underline;
        }
      ` }} />

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

        {/* Rich Formatting Toolbar */}
        <div className="flex items-center gap-1.5 px-4 py-2 bg-gray-950 border-b border-gray-800/80 flex-wrap">
          {/* Bold */}
          <FmtBtn active={editor.isActive('bold')} onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }} title="Đậm (Ctrl+B)">
            <span className="font-bold text-sm leading-none">B</span>
          </FmtBtn>
          {/* Italic */}
          <FmtBtn active={editor.isActive('italic')} onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }} title="Nghiêng (Ctrl+I)">
            <span className="italic text-sm leading-none">/</span>
          </FmtBtn>
          {/* Underline */}
          <FmtBtn active={editor.isActive('underline')} onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }} title="Gạch dưới (Ctrl+U)">
            <span className="underline text-sm font-semibold leading-none">U</span>
          </FmtBtn>
          {/* Strikethrough */}
          <FmtBtn active={editor.isActive('strike')} onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleStrike().run(); }} title="Gạch ngang">
            <span className="line-through text-sm leading-none">S</span>
          </FmtBtn>

          <div className="w-px h-5 bg-gray-800 mx-1 self-center" />

          {/* Font Sizes */}
          <FmtBtn active={editor.isActive('textStyle', { fontSize: '13px' })} onClick={(e) => { e.preventDefault(); if (editor.isActive('textStyle', { fontSize: '13px' })) editor.chain().focus().setMark('textStyle', { fontSize: null }).run(); else editor.chain().focus().setMark('textStyle', { fontSize: '13px' }).run(); }} title="Chữ nhỏ">
            <span className="text-[11px] font-semibold leading-none">A</span>
          </FmtBtn>
          <FmtBtn active={editor.isActive('textStyle', { fontSize: '18px' })} onClick={(e) => { e.preventDefault(); if (editor.isActive('textStyle', { fontSize: '18px' })) editor.chain().focus().setMark('textStyle', { fontSize: null }).run(); else editor.chain().focus().setMark('textStyle', { fontSize: '18px' }).run(); }} title="Chữ lớn">
            <span className="text-[15px] font-bold leading-none">A</span>
          </FmtBtn>

          <div className="w-px h-5 bg-gray-800 mx-1 self-center" />

          {/* Colors */}
          {([
            { st: 'c_db342e', color: '#db342e', label: 'Đỏ' },
            { st: 'c_f27806', color: '#f27806', label: 'Cam' },
            { st: 'c_f7b503', color: '#f7b503', label: 'Vàng' },
            { st: 'c_15a85f', color: '#15a85f', label: 'Xanh lá' },
          ] as const).map(({ st, color, label }) => (
            <button
              key={st}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                if (editor.isActive('textStyle', { color })) {
                  editor.chain().focus().unsetColor().run();
                } else {
                  editor.chain().focus().setColor(color).run();
                }
              }}
              title={label}
              className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 shrink-0 ${
                editor.isActive('textStyle', { color }) ? 'border-white scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}

          <div className="w-px h-5 bg-gray-800 mx-1 self-center" />

          {/* New Tools from Image 2 (Numbered List, Bullet List, Link, Code) */}
          <FmtBtn active={editor.isActive('orderedList')} onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }} title="Danh sách số (1.)">
            <svg className="w-4 h-4 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="10" y1="6" x2="21" y2="6" />
              <line x1="10" y1="12" x2="21" y2="12" />
              <line x1="10" y1="18" x2="21" y2="18" />
              <path d="M4 6h1v4M4 10h2M4 16h2v-2a1 1 0 0 0-1-1H4v3z" />
            </svg>
          </FmtBtn>
          <FmtBtn active={editor.isActive('bulletList')} onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }} title="Danh sách ký hiệu (•)">
            <svg className="w-4 h-4 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="3" />
              <line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="3" />
              <line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="3" />
            </svg>
          </FmtBtn>
          <FmtBtn active={editor.isActive('link')} onClick={(e) => { e.preventDefault(); toggleLink(); }} title="Thêm liên kết">
            <svg className="w-4 h-4 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </FmtBtn>
          <FmtBtn active={editor.isActive('code')} onClick={(e) => { e.preventDefault(); editor.chain().focus().toggleCode().run(); }} title="Chèn mã ({})">
            <svg className="w-4 h-4 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
              <path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
            </svg>
          </FmtBtn>

          <div className="w-px h-5 bg-gray-800 mx-1 self-center" />

          {/* Clear Formats */}
          {exported.fmtRanges.length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus().clearNodes().unsetAllMarks().run();
              }}
              title="Xóa tất cả định dạng"
              className="text-xs text-gray-400 hover:text-red-400 px-2 py-1 rounded hover:bg-gray-800 transition-colors"
            >
              ✕ Xóa định dạng
            </button>
          )}

          {exported.fmtRanges.length === 0 && (
            <span className="text-xs text-gray-500 ml-auto hidden lg:inline">Chọn văn bản rồi bấm định dạng</span>
          )}
          {exported.fmtRanges.length > 0 && (
            <span className="text-xs text-blue-400 ml-auto hidden lg:inline">
              {exported.fmtRanges.length} định dạng đang áp dụng
            </span>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-gray-900 p-5 flex flex-col min-h-0 overflow-y-auto">
          <EditorContent editor={editor} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 bg-gray-950 border-t border-gray-800/80">
          <span className="text-xs text-gray-500 font-mono">
            Ký tự: {charCount} | Dòng: {lineCount}
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
              disabled={!exported.text.trim()}
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
