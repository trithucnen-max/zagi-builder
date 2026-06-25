import React, { useState, useRef, useEffect, useMemo } from 'react';
import { TEMPLATE_VAR_GROUP_LABELS, getTemplateVarsForNode, getNodeOutputVars, TemplateVarInfo } from './templateVars';
import { useAppStore } from '@/store/appStore';

interface SmartInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  nodeType?: string;
  allNodes?: { id: string; label: string; type: string }[];
  currentId?: string;
}

interface SmartTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  nodeType?: string;
  allNodes?: { id: string; label: string; type: string }[];
  currentId?: string;
  rows?: number;
}

// ── Helpers to parse/serialize raw text and visual HTML chips ─────────────────

const plainTextToHtml = (text: string, allAvailableVars: TemplateVarInfo[]): string => {
  if (!text) return '';
  
  const varMap = new Map<string, string>();
  allAvailableVars.forEach(v => {
    varMap.set(v.key, v.label);
  });

  // Escape HTML characters
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Replace {{ $expression }} with visual chip span
  escaped = escaped.replace(/\{\{\s*([\s\S]*?)\s*\}\}/g, (match, expr) => {
    const key = expr.trim();
    const label = varMap.get(key) || key;
    return `<span class="font-bold bg-gray-200/80 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100 px-1.5 py-0.5 rounded-md mx-0.5 inline-block text-xs align-middle border border-gray-300/50 dark:border-gray-600/30 select-all" contenteditable="false" data-var-key="${key}">${label}</span>`;
  });

  return escaped.replace(/\n/g, '<br>');
};

const domToPlainText = (element: HTMLElement): string => {
  let text = '';
  const children = element.childNodes;
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.nodeType === Node.TEXT_NODE) {
      // Replace non-breaking spaces with normal spaces
      text += (node.textContent || '').replace(/\u00A0/g, ' ');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.hasAttribute('data-var-key')) {
        text += `{{ ${el.getAttribute('data-var-key')} }}`;
      } else if (el.tagName === 'BR') {
        text += '\n';
      } else if (el.tagName === 'DIV' || el.tagName === 'P') {
        const childText = domToPlainText(el);
        if (text && !text.endsWith('\n')) {
          text += '\n';
        }
        text += childText;
      } else {
        text += domToPlainText(el);
      }
    }
  }
  return text;
};

// ── Dropdown component hiển thị danh sách gợi ý ──────────────────────────────
interface VarDropdownProps {
  search: string;
  nodeType?: string;
  allNodes?: { id: string; label: string; type: string }[];
  currentId?: string;
  selectedIndex: number;
  onSelect: (varKey: string) => void;
  isLight: boolean;
}

const VarDropdown = ({
  search,
  nodeType,
  allNodes,
  currentId,
  selectedIndex,
  onSelect,
  isLight,
}: VarDropdownProps) => {
  const systemVars = useMemo(() => getTemplateVarsForNode(nodeType), [nodeType]);
  const nodeVars = useMemo(() => (allNodes ? getNodeOutputVars(allNodes, currentId) : []), [allNodes, currentId]);
  const allAvailableVars = useMemo(() => [...systemVars, ...nodeVars], [systemVars, nodeVars]);

  const filteredVars = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return allAvailableVars;
    return allAvailableVars.filter(
      v =>
        v.key.toLowerCase().includes(query) ||
        v.label.toLowerCase().includes(query) ||
        (v.description && v.description.toLowerCase().includes(query))
    );
  }, [allAvailableVars, search]);

  if (filteredVars.length === 0) return null;

  return (
    <div
      className={`absolute z-[9999] left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-xl border shadow-2xl ${
        isLight
          ? 'bg-white border-gray-200 text-gray-800'
          : 'bg-gray-900 border-gray-700 text-gray-200'
      }`}
    >
      <div className={`px-3 py-1.5 border-b text-[10px] font-semibold uppercase tracking-wider ${
        isLight ? 'bg-gray-50 border-gray-200 text-gray-400' : 'bg-gray-800/40 border-gray-700 text-gray-500'
      }`}>
        💡 Gợi ý biến (Nhấn ↑↓ để duyệt, Enter để chọn)
      </div>
      <div className="py-1">
        {filteredVars.map((v, i) => {
          const isSelected = i === selectedIndex;
          const groupEmoji = v.group === 'trigger' ? '📩' : v.group === 'node' ? '🔗' : v.group === 'date' ? '📅' : '📦';
          return (
            <button
              key={v.key}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // Prevents input/textarea blur before selecting!
                onSelect(v.key);
              }}
              className={`w-full text-left px-3 py-2 flex flex-col gap-0.5 transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white'
                  : isLight
                    ? 'hover:bg-gray-100'
                    : 'hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2 w-full">
                <span className={`text-xs font-semibold ${isSelected ? 'text-white' : isLight ? 'text-gray-900' : 'text-white'}`}>
                  {groupEmoji} {v.label}
                </span>
                <span className={`text-[10px] font-mono ${isSelected ? 'text-blue-200' : isLight ? 'text-blue-600' : 'text-blue-400'}`}>
                  {v.key}
                </span>
              </div>
              {v.description && (
                <div className={`text-[10px] line-clamp-1 ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
                  {v.description}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── SmartRichEditor Shared Component ─────────────────────────────────────────

interface SmartRichEditorProps {
  value: string;
  onChange: (val: string) => void;
  isSingleLine: boolean;
  placeholder?: string;
  className?: string;
  nodeType?: string;
  allNodes?: { id: string; label: string; type: string }[];
  currentId?: string;
  rows?: number;
}

const SmartRichEditor = ({
  value,
  onChange,
  isSingleLine,
  placeholder,
  className,
  nodeType,
  allNodes,
  currentId,
  rows,
}: SmartRichEditorProps) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const theme = useAppStore(s => s.theme);
  const isLight = theme === 'light';

  const systemVars = useMemo(() => getTemplateVarsForNode(nodeType), [nodeType]);
  const nodeVars = useMemo(() => (allNodes ? getNodeOutputVars(allNodes, currentId) : []), [allNodes, currentId]);
  const allAvailableVars = useMemo(() => [...systemVars, ...nodeVars], [systemVars, nodeVars]);

  const filteredCount = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return allAvailableVars.length;
    return allAvailableVars.filter(
      v =>
        v.key.toLowerCase().includes(query) ||
        v.label.toLowerCase().includes(query) ||
        (v.description && v.description.toLowerCase().includes(query))
    ).length;
  }, [allAvailableVars, searchQuery]);

  // Synchronize parent value into DOM (only when out of sync)
  useEffect(() => {
    if (!editorRef.current) return;
    const currentText = domToPlainText(editorRef.current);
    if (currentText !== value) {
      editorRef.current.innerHTML = plainTextToHtml(value, allAvailableVars);
    }
  }, [value, allAvailableVars]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleInput = () => {
    if (!editorRef.current) return;
    const currentText = domToPlainText(editorRef.current);
    onChange(currentText);

    // Track caret and trigger dropdown if typing {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(editorRef.current);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      const textBefore = preCaretRange.toString();

      const lastOpenBrace = textBefore.lastIndexOf('{');
      if (lastOpenBrace !== -1 && !textBefore.substring(lastOpenBrace).includes(' ')) {
        setShowDropdown(true);
        setSearchQuery(textBefore.substring(lastOpenBrace + 1));
        setSelectedIndex(0);
      } else {
        setShowDropdown(false);
      }
    }
  };

  const handleSelect = (varKey: string) => {
    if (!editorRef.current) return;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const textNode = range.endContainer;

      const varInfo = allAvailableVars.find(v => v.key === varKey);
      const label = varInfo ? varInfo.label : varKey;

      if (textNode.nodeType === Node.TEXT_NODE) {
        const offset = range.endOffset;
        const textVal = textNode.nodeValue || '';
        const beforeText = textVal.substring(0, offset);
        const lastBraceIndex = beforeText.lastIndexOf('{');

        if (lastBraceIndex !== -1) {
          // Splice text node to remove `{query`
          textNode.nodeValue = textVal.substring(0, lastBraceIndex) + textVal.substring(offset);
          range.setStart(textNode, lastBraceIndex);
          range.setEnd(textNode, lastBraceIndex);

          // Create the Visual Chip span
          const span = document.createElement('span');
          span.className = 'font-bold bg-gray-200/80 dark:bg-gray-700/60 text-gray-900 dark:text-gray-100 px-1.5 py-0.5 rounded-md mx-0.5 inline-block text-xs align-middle border border-gray-300/50 dark:border-gray-600/30 select-all';
          span.setAttribute('contenteditable', 'false');
          span.setAttribute('data-var-key', varKey);
          span.textContent = label;

          range.insertNode(span);

          // Insert trailing space
          const spaceNode = document.createTextNode(' ');
          range.setStartAfter(span);
          range.setEndAfter(span);
          range.insertNode(spaceNode);

          // Move cursor after the space
          range.setStartAfter(spaceNode);
          range.setEndAfter(spaceNode);
          selection.removeAllRanges();
          selection.addRange(range);

          // Trigger updates
          const newVal = domToPlainText(editorRef.current);
          onChange(newVal);
          setShowDropdown(false);
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (showDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (filteredCount > 0 ? (prev + 1) % filteredCount : 0));
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (filteredCount > 0 ? (prev - 1 + filteredCount) % filteredCount : 0));
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const query = searchQuery.toLowerCase().trim();
        const matched = allAvailableVars.filter(
          v =>
            !query ||
            v.key.toLowerCase().includes(query) ||
            v.label.toLowerCase().includes(query) ||
            (v.description && v.description.toLowerCase().includes(query))
        );
        const selected = matched[selectedIndex];
        if (selected) {
          handleSelect(selected.key);
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowDropdown(false);
        return;
      }
    }

    if (e.key === 'Enter' && isSingleLine) {
      e.preventDefault();
    }
  };

  const isEmpty = !value || value === '';
  const minHeight = rows ? `${rows * 20 + 16}px` : undefined;

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        className={`${className} outline-none focus:ring-1 focus:ring-blue-500 overflow-y-auto cursor-text`}
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          minHeight: minHeight || '38px',
          maxHeight: isSingleLine ? '38px' : '200px',
        }}
      />
      {isEmpty && (
        <div className="absolute left-3 top-2 text-gray-500 text-sm pointer-events-none select-none">
          {placeholder}
        </div>
      )}
      {showDropdown && (
        <VarDropdown
          search={searchQuery}
          nodeType={nodeType}
          allNodes={allNodes}
          currentId={currentId}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          isLight={isLight}
        />
      )}
    </div>
  );
};

// ── SmartInput Component ─────────────────────────────────────────────────────
export const SmartInput = React.forwardRef<any, SmartInputProps>((
  { value, onChange, nodeType, allNodes, currentId, className, placeholder, ...props },
  forwardedRef
) => {
  return (
    <SmartRichEditor
      value={value}
      onChange={onChange}
      isSingleLine={true}
      placeholder={placeholder}
      className={className}
      nodeType={nodeType}
      allNodes={allNodes}
      currentId={currentId}
    />
  );
});
SmartInput.displayName = 'SmartInput';

// ── SmartTextarea Component ──────────────────────────────────────────────────
export const SmartTextarea = React.forwardRef<any, SmartTextareaProps>((
  { value, onChange, nodeType, allNodes, currentId, className, placeholder, rows, ...props },
  forwardedRef
) => {
  return (
    <SmartRichEditor
      value={value}
      onChange={onChange}
      isSingleLine={false}
      placeholder={placeholder}
      className={className}
      nodeType={nodeType}
      allNodes={allNodes}
      currentId={currentId}
      rows={rows}
    />
  );
});
SmartTextarea.displayName = 'SmartTextarea';
