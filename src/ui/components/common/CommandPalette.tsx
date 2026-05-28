import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import { useChatStore } from '../../store/chatStore';
import { useAccountStore } from '../../store/accountStore';

interface CommandItem {
  id: string;
  category: 'navigation' | 'action' | 'theme' | 'contact';
  label: string;
  icon: string;
  shortcut?: string;
  action: () => void;
  avatarUrl?: string; // For contacts
  channel?: 'zalo' | 'facebook';
}

export default function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setView,
    setTheme,
    setAddAccountModalOpen,
    openQuickChat,
    theme,
  } = useAppStore();

  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const contactsMap = useChatStore((s) => s.contacts);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when palette opens
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  // Handle outside click
  useEffect(() => {
    if (!commandPaletteOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setCommandPaletteOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  // Close on Escape or search actions
  const close = () => setCommandPaletteOpen(false);

  // Define static commands
  const staticCommands = useMemo<CommandItem[]>(() => {
    const navCmds: CommandItem[] = [
      { id: 'nav-dashboard', category: 'navigation', label: 'Đi tới Bảng điều khiển', icon: '📊', shortcut: 'Alt+1', action: () => { setView('dashboard'); close(); } },
      { id: 'nav-chat', category: 'navigation', label: 'Đi tới Hội thoại / Nhắn tin', icon: '💬', shortcut: 'Alt+2', action: () => { setView('chat'); close(); } },
      { id: 'nav-crm', category: 'navigation', label: 'Đi tới Quản lý Khách hàng CRM', icon: '👥', shortcut: 'Alt+3', action: () => { setView('crm'); close(); } },
      { id: 'nav-workflow', category: 'navigation', label: 'Đi tới Thiết lập Quy trình Workflow', icon: '⚡', shortcut: 'Alt+4', action: () => { setView('workflow'); close(); } },
      { id: 'nav-integration', category: 'navigation', label: 'Đi tới Tích hợp hệ thống', icon: '🔌', shortcut: 'Alt+5', action: () => { setView('integration'); close(); } },
      { id: 'nav-analytics', category: 'navigation', label: 'Đi tới Báo cáo Thống kê', icon: '📈', shortcut: 'Alt+6', action: () => { setView('analytics'); close(); } },
      { id: 'nav-erp', category: 'navigation', label: 'Đi tới Hệ thống ERP Doanh nghiệp', icon: '🏢', shortcut: 'Alt+7', action: () => { setView('erp'); close(); } },
      { id: 'nav-settings', category: 'navigation', label: 'Đi tới Cấu hình cài đặt', icon: '⚙️', shortcut: 'Alt+8', action: () => { setView('settings'); close(); } },
    ];

    const actionCmds: CommandItem[] = [
      { id: 'act-add-account', category: 'action', label: 'Thêm tài khoản Zalo/Facebook mới', icon: '👤', action: () => { setAddAccountModalOpen(true); close(); } },
      { id: 'act-quick-chat', category: 'action', label: 'Mở cửa sổ Chat nhanh', icon: '⚡', shortcut: 'Ctrl+Shift+N', action: () => { openQuickChat(); close(); } },
    ];

    const themeCmds: CommandItem[] = [
      { id: 'theme-light', category: 'theme', label: 'Đổi sang Giao diện Sáng (Light Theme)', icon: '☀️', action: () => { setTheme('light'); close(); } },
      { id: 'theme-dark', category: 'theme', label: 'Đổi sang Giao diện Tối (Dark Theme)', icon: '🌙', action: () => { setTheme('dark'); close(); } },
    ];

    return [...navCmds, ...actionCmds, ...themeCmds];
  }, [setView, setTheme, setAddAccountModalOpen, openQuickChat]);

  // Map contacts to command items if query is not empty
  const contactCommands = useMemo<CommandItem[]>(() => {
    if (!query.trim()) return [];
    const activeContacts = activeAccountId ? (contactsMap[activeAccountId] || []) : [];
    const searchVal = query.toLowerCase();
    
    return activeContacts
      .filter((c) => {
        const name = (c.alias || c.display_name || '').toLowerCase();
        const id = (c.contact_id || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        return name.includes(searchVal) || id.includes(searchVal) || phone.includes(searchVal);
      })
      .slice(0, 10) // limit results to keep it fast
      .map((c) => ({
        id: `contact-${c.contact_id}`,
        category: 'contact' as const,
        label: c.alias || c.display_name || c.contact_id,
        icon: '👤',
        avatarUrl: c.avatar_url,
        channel: c.channel as 'zalo' | 'facebook',
        action: () => {
          const threadType = c.contact_type === 'group' ? 1 : 0;
          useChatStore.getState().setActiveThread(c.contact_id, threadType);
          setView('chat');
          close();
        },
      }));
  }, [query, activeAccountId, contactsMap, setView]);

  // Combine and filter commands
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return staticCommands;
    const searchVal = query.toLowerCase();
    const filteredStatics = staticCommands.filter((cmd) => cmd.label.toLowerCase().includes(searchVal));
    return [...filteredStatics, ...contactCommands];
  }, [query, staticCommands, contactCommands]);

  // Reset index on search
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!commandPaletteOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, filteredCommands, selectedIndex]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!commandPaletteOpen) return null;

  // Group commands by category for display headers
  const categories: Record<string, string> = {
    navigation: 'Điều hướng nhanh',
    action: 'Hành động nhanh',
    theme: 'Giao diện hệ thống',
    contact: 'Hội thoại liên hệ',
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-sm transition-opacity">
      <div
        ref={containerRef}
        className="w-full max-w-xl bg-gray-850/95 border border-gray-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[60vh] glassmorphism"
      >
        {/* Search header */}
        <div className="flex items-center px-4 py-3.5 border-b border-gray-700/80 gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gray-400">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Nhập tên trang, hành động hoặc tìm kiếm hội thoại..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-0 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-0 w-full"
          />
          <button
            onClick={close}
            className="text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white px-2 py-1 rounded border border-gray-600 transition-colors"
          >
            ESC
          </button>
        </div>

        {/* Command list */}
        <div className="flex-1 overflow-y-auto py-2" ref={listRef}>
          {filteredCommands.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-500 italic">
              Không tìm thấy lệnh hoặc hội thoại nào trùng khớp
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const active = idx === selectedIndex;
              const showCategoryHeader = idx === 0 || filteredCommands[idx - 1].category !== cmd.category;

              return (
                <div key={cmd.id}>
                  {showCategoryHeader && (
                    <div className="px-4 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-900/40 border-y border-gray-800/40 first:border-t-0">
                      {categories[cmd.category]}
                    </div>
                  )}
                  <button
                    onClick={cmd.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors border-l-2 ${
                      active
                        ? 'bg-blue-600/10 text-white border-blue-500'
                        : 'text-gray-300 border-transparent hover:bg-gray-800/30'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {cmd.avatarUrl ? (
                        <div className="relative flex-shrink-0">
                          <img src={cmd.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                          {cmd.channel === 'facebook' && (
                            <span className="absolute -bottom-0.5 -right-0.5 text-[8px]">💙</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-base flex-shrink-0 w-6 text-center">{cmd.icon}</span>
                      )}
                      <span className="truncate">{cmd.label}</span>
                    </div>

                    {cmd.shortcut && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                        active ? 'bg-blue-500/20 border-blue-400 text-blue-200' : 'bg-gray-800 border-gray-700 text-gray-500'
                      }`}>
                        {cmd.shortcut}
                      </span>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2 border-t border-gray-700/80 bg-gray-900/60 flex items-center justify-between text-[11px] text-gray-500">
          <div className="flex items-center gap-2">
            <span>Di chuyển: <kbd className="font-mono bg-gray-800 px-1 rounded border border-gray-700">↑↓</kbd></span>
            <span>Chọn: <kbd className="font-mono bg-gray-800 px-1 rounded border border-gray-700">Enter</kbd></span>
          </div>
          <div>
            <span>Giao diện: <span className="text-gray-300 font-medium capitalize">{theme}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
