/**
 * MarkdownText.tsx
 * Mini markdown renderer cho AI messages — không cần thư viện ngoài.
 * Hỗ trợ: **bold**, *italic*, `code`, ```codeblock```, # header, - bullet, 1. numbered, ---
 */
import React from 'react';

interface Props {
  content: string;
  className?: string;
}

/** Parse inline markdown: **bold**, *italic*, `code` */
function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Pattern: **bold** | *italic* | `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    if (match[2] !== undefined) {
      // **bold**
      parts.push(<strong key={match.index} className="font-semibold">{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      // *italic*
      parts.push(<em key={match.index} className="italic">{match[3]}</em>);
    } else if (match[4] !== undefined) {
      // `code`
      parts.push(
        <code key={match.index} className="bg-gray-700/60 text-green-300 rounded px-1 py-0.5 text-[11px] font-mono">
          {match[4]}
        </code>
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts.length > 0 ? parts : [text];
}

/** Render một block markdown thành JSX */
function renderBlocks(content: string): React.ReactNode[] {
  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Code block ─────────────────────────────────────────────────
    if (line.trimStart().startsWith('```')) {
      const lang = line.replace(/^```/, '').trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre key={key++} className="bg-gray-900/70 border border-gray-700/50 rounded-lg p-2.5 my-1.5 overflow-x-auto">
          {lang && <div className="text-[10px] text-gray-500 mb-1 font-mono">{lang}</div>}
          <code className="text-green-300 text-[11px] font-mono leading-relaxed whitespace-pre">
            {codeLines.join('\n')}
          </code>
        </pre>
      );
      i++; // skip closing ```
      continue;
    }

    // ── Horizontal rule ────────────────────────────────────────────
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={key++} className="border-gray-600/50 my-2" />);
      i++;
      continue;
    }

    // ── Headers ────────────────────────────────────────────────────
    const h3 = line.match(/^###\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h1 = line.match(/^#\s+(.*)/);
    if (h1) {
      nodes.push(<p key={key++} className="font-bold text-white text-sm mt-2 mb-0.5">{parseInline(h1[1])}</p>);
      i++; continue;
    }
    if (h2) {
      nodes.push(<p key={key++} className="font-semibold text-gray-100 text-[13px] mt-1.5 mb-0.5">{parseInline(h2[1])}</p>);
      i++; continue;
    }
    if (h3) {
      nodes.push(<p key={key++} className="font-semibold text-gray-200 text-xs mt-1 mb-0.5">{parseInline(h3[1])}</p>);
      i++; continue;
    }

    // ── Bullet list (-, *, +) ──────────────────────────────────────
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s/, ''));
        i++;
      }
      nodes.push(
        <ul key={key++} className="space-y-0.5 my-1 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-1.5 items-start text-xs text-gray-200 leading-relaxed">
              <span className="text-blue-400 mt-0.5 flex-shrink-0">•</span>
              <span>{parseInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ── Numbered list ──────────────────────────────────────────────
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      let num = 1;
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      nodes.push(
        <ol key={key++} className="space-y-0.5 my-1 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-1.5 items-start text-xs text-gray-200 leading-relaxed">
              <span className="text-blue-400 flex-shrink-0 font-mono text-[10px] mt-0.5">{idx + 1}.</span>
              <span>{parseInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      num;
      continue;
    }

    // ── Blank line ─────────────────────────────────────────────────
    if (line.trim() === '') {
      // Chỉ thêm gap nếu đây không phải blank liên tiếp
      if (nodes.length > 0) {
        nodes.push(<div key={key++} className="h-1" />);
      }
      i++;
      continue;
    }

    // ── Regular paragraph ──────────────────────────────────────────
    nodes.push(
      <p key={key++} className="text-xs text-gray-200 leading-relaxed">
        {parseInline(line)}
      </p>
    );
    i++;
  }

  return nodes;
}

export default function MarkdownText({ content, className = '' }: Props) {
  return (
    <div className={`space-y-0.5 ${className}`}>
      {renderBlocks(content)}
    </div>
  );
}
