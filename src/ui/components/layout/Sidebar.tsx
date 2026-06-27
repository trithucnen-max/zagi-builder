import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore } from '@/store/appStore';
import { useChatStore } from '@/store/chatStore';
import { useEmployeeStore } from '@/store/employeeStore';
import ChannelBadge from '../common/ChannelBadge';
import { useVisibleAccounts } from '@/hooks/useVisibleAccounts';
import { hasUnseenSettingsTabs } from '@/utils/settingsSeenTabs';
import { useErpPermissions } from '@/hooks/erp/useErpContext';
import LicenseModal from '@/components/settings/LicenseModal';
import AppIcon from '@/components/common/AppIcon';

interface SidebarProps {
  onAddAccount: () => void;
}

export default function Sidebar({ onAddAccount }: SidebarProps) {
  const { activeAccountId, setActiveAccount, reorderAccounts } = useAccountStore();
  const visibleAccounts = useVisibleAccounts();
  const previewEmployeeId = useEmployeeStore(s => s.previewEmployeeId);
  const empMode = useEmployeeStore(s => s.mode);
  // Subscribe so Sidebar re-renders when permissions / employees list changes
  const empPermissions = useEmployeeStore(s => s.permissions);
  const employees = useEmployeeStore(s => s.employees);
  const isSimulating = empMode !== 'employee' && !!previewEmployeeId;
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);

  const hasPerm = useCallback((module: string) => {
    if (module === 'dashboard') return true;

    // Boss preview mode: use previewed employee's permissions
    if (empMode !== 'employee' && previewEmployeeId) {
      const emp = employees.find((e: any) => e.employee_id === previewEmployeeId);
      const perm = emp?.permissions?.find((p: any) => p.module === module);
      return perm ? !!perm.can_access : false;
    }

    // Boss/standalone has full access
    if (empMode !== 'employee') return true;

    // Real employee mode
    return !!empPermissions[module];
  }, [empMode, previewEmployeeId, employees, empPermissions]);
  // ERP-specific permission check (role-based, independent from Zalo ACL).
  const { can: canErp } = useErpPermissions();
  const canErpAccess = canErp('erp.access');
  // Use visible (filtered) accounts for rendering
  const accounts = visibleAccounts;
  const { view, setView, mergedInboxMode, mergedInboxAccounts, mergedInboxFilterAccount, setMergedInboxFilter, exitMergedInbox, sidebarExpanded, toggleSidebarExpanded } = useAppStore();
  const crmRequestUnseenByAccount = useAppStore(s => s.crmRequestUnseenByAccount);
  const { contacts, activeThreadId, activeThreadType, saveAccountThread } = useChatStore();
  const { othersConversations: allOthers } = useAppStore();

  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const hasNewCRMRequests = Object.values(crmRequestUnseenByAccount || {}).some(Boolean);

  // Chấm đỏ trên nút Settings — tắt khi người dùng đã xem hết các tab quan trọng
  const [hasNewSettings, setHasNewSettings] = useState(() => hasUnseenSettingsTabs());
  useEffect(() => {
    const handler = () => setHasNewSettings(hasUnseenSettingsTabs());
    window.addEventListener('settings:tabSeen', handler);
    return () => window.removeEventListener('settings:tabSeen', handler);
  }, []);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };
  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from !== null && from !== toIndex) reorderAccounts(from, toIndex);
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };
  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };
  const showExpanded = sidebarExpanded && view === 'chat';

  return (
    <>
    <div className="flex flex-col w-16 bg-sidebar border-r border-white/10 h-full">
      {/* ─── Toggle expand/collapse - chỉ hiện ở màn hình Chat ─── */}
      {view === 'chat' && (
        <div className="pt-2 pb-1 flex justify-center flex-shrink-0">
          <button
            onClick={toggleSidebarExpanded}
            title={showExpanded ? 'Ẩn danh sách tài khoản đầy đủ' : 'Hiện danh sách tài khoản đầy đủ'}
            className={`font-semibold w-8 h-8 rounded-lg flex items-center justify-center transition-colors border-0 cursor-pointer ${
              showExpanded
                ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 hover:text-white'
            }`}
          >
            {showExpanded ? (
              /* X - đóng */
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              /* Hamburger - mở rộng */
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            )}
          </button>
        </div>
      )}
      {showExpanded ? (
        <div className="" />
      ) : mergedInboxMode ? (
        <div className="flex-1 overflow-y-auto py-2 flex flex-col items-center gap-2">
          {/* Exit button — ở trên cùng */}
          <button
            onClick={exitMergedInbox}
            title="Thoát chế độ Gộp tài khoản"
            className="w-8 h-8 rounded-lg bg-red-900/30 border border-red-700/40 flex items-center justify-center text-red-400 hover:bg-red-900/60 hover:text-red-300 transition-colors flex-shrink-0"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          {/* "Tất cả" — bỏ lọc */}
          <button
            onClick={() => setMergedInboxFilter(null)}
            title="Tất cả tài khoản"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 ring-2 ${
              mergedInboxFilterAccount === null
                ? 'bg-blue-600 text-white ring-blue-400'
                : 'bg-white/10 text-white hover:bg-white/20 ring-transparent'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </button>

          {/* Account filter avatars */}
          {mergedInboxAccounts.map(zaloId => {
            const account = accounts.find(a => a.zalo_id === zaloId);
            if (!account) return null;
            const accountContacts = contacts[zaloId] || [];
            const acctOthers = allOthers[zaloId] || new Set();
            const unreadConvCount = accountContacts.reduce((s, c) => {
              if (acctOthers.has(c.contact_id)) return s;
              return s + (c.unread_count > 0 ? 1 : 0);
            }, 0);
            const isSelected = mergedInboxFilterAccount === zaloId;
            const isAllMode = mergedInboxFilterAccount === null;
            return (
              <div key={zaloId} className="relative flex-shrink-0">
                <button
                  onClick={() => setMergedInboxFilter(isSelected ? null : zaloId)}
                  title={`${account.full_name || zaloId}${isSelected ? ' — đang lọc' : ' — nhấn để lọc'}`}
                  className={`w-10 h-10 rounded-full overflow-hidden ring-2 transition-all flex-shrink-0 ${
                    isSelected
                      ? 'ring-blue-500 scale-110'
                      : isAllMode
                        ? 'ring-transparent opacity-90 hover:ring-gray-500'
                        : 'ring-transparent opacity-40 hover:opacity-80 hover:ring-gray-500'
                  }`}
                >
                  {account.avatar_url ? (
                    <img src={account.avatar_url} alt={account.full_name} className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = ''; }} />
                  ) : (
                    <div className="w-full h-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                      {(account.full_name || account.zalo_id).charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>
                {unreadConvCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 leading-none z-10 shadow-md pointer-events-none">
                    {unreadConvCount > 99 ? '99+' : unreadConvCount}
                  </span>
                )}
                {/* Channel badge */}
                <div className="absolute -bottom-0.5 -left-0.5 z-10 pointer-events-none">
                  <ChannelBadge channel={(account.channel as any) || 'zalo'} size="xs" />
                </div>
                {/* Disconnected indicator (merged inbox) */}
                {!account.isConnected && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-gray-800 rounded-full border-2 border-gray-900 flex items-center justify-center z-10 pointer-events-none" title="Chưa kết nối">
                    <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-red-400">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </span>
                )}
              </div>
            );
          })}

        </div>
      ) : (
      <div className="flex-1 overflow-y-auto py-2 flex flex-col items-center gap-2">
        {accounts.map((account, index) => {
          const accountContacts = contacts[account.zalo_id] || [];
          const acctOthers = allOthers[account.zalo_id] || new Set();
          const unreadConvCount = accountContacts.reduce((s, c) => {
            if (acctOthers.has(c.contact_id)) return s;
            return s + (c.unread_count > 0 ? 1 : 0);
          }, 0);
          const listenerDead = account.isConnected && account.listenerActive === false;
          const isDragOver = dragOverIndex === index;

          const tooltipLines = [
            account.full_name || account.zalo_id,
            account.is_business ? '💼 Tài khoản Zalo Business' : null,
            listenerDead ? '⚠ Listener chết' : null,
          ].filter(Boolean).join('\n');

          return (
            <div
              key={account.zalo_id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`relative flex-shrink-0 transition-all ${isDragOver ? 'scale-110 opacity-70' : ''}`}
              style={{ cursor: 'grab' }}
            >
              <button
                onClick={() => {
                  if (activeAccountId && activeThreadId) {
                    saveAccountThread(activeAccountId, activeThreadId, activeThreadType);
                  }
                  setActiveAccount(account.zalo_id);
                  setView('chat');
                }}
                title={tooltipLines}
                className={`relative w-10 h-10 rounded-full overflow-visible ring-2 transition-all flex-shrink-0 ${
                  activeAccountId === account.zalo_id
                    ? 'ring-blue-500'
                    : listenerDead
                      ? 'ring-red-600'
                        : 'ring-transparent hover:ring-gray-500'
                }`}
                style={{ cursor: 'pointer' }}
              >
                <div className="w-10 h-10 rounded-full overflow-hidden">
                  {account.avatar_url ? (
                    <img
                      src={account.avatar_url}
                      alt={account.full_name}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = ''; }}
                    />
                  ) : (
                    <div className="w-full h-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                      {(account.full_name || account.zalo_id).charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* ── Top-right: listener dead / unread badge ── */}
                {listenerDead ? (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-gray-900 flex items-center justify-center z-10">
                    <span className="text-white text-[8px] font-bold leading-none">!</span>
                  </span>
                ) : unreadConvCount > 0 ? (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 leading-none z-10 shadow-md">
                    {unreadConvCount > 99 ? '99+' : unreadConvCount}
                  </span>
                ) : null}

                {/* ── Bottom-left: Zalo Business badge ── */}
                {account.is_business ? (
                  <span
                    className="absolute -bottom-1 -left-1 bg-amber-500 text-white text-[7px] font-bold rounded-full border border-gray-900 z-10 leading-none flex items-center justify-center"
                    style={{ minWidth: '0.875rem', height: '0.875rem', padding: '0 0.125rem' }}
                    title="Zalo Business"
                  >
                    💼
                  </span>
                ) : null}

                {/* ── Channel badge (Zalo/Facebook) ── */}
                <div className="absolute -bottom-0.5 -left-0.5 z-10">
                  <ChannelBadge channel={(account.channel as any) || 'zalo'} size="xs" />
                </div>

                {/* ── Disconnected indicator (bottom-right) ── */}
                {!account.isConnected && !listenerDead ? (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-gray-800 rounded-full border-2 border-gray-900 flex items-center justify-center z-10" title="Chưa kết nối">
                    <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-red-400">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}

        {/* Add Account Button — hidden in employee mode and during employee simulation */}
        {empMode !== 'employee' && !isSimulating && (
        <button
          onClick={onAddAccount}
          title="Thêm tài khoản"
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors border-2 border-dashed border-white/20 hover:border-white/40"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" />
          </svg>
        </button>
        )}
      </div>
      )} {/* end: !mergedInboxMode account list */}

      {/* Nav bottom */}
      <div className="border-t border-white/10 py-2 flex flex-col items-center gap-1">
        <NavBtn icon="dashboard"  label="Dashboard"   active={view === 'dashboard'}  onClick={() => setView('dashboard')} />
        {hasPerm('chat') && (
        <NavBtn icon="chat"       label="Chat"         active={view === 'chat'}       onClick={() => setView('chat')} />
        )}
        {hasPerm('crm') && (
        <NavBtn icon="crm"        label="CRM"          active={view === 'crm'}        onClick={() => setView('crm')} dot={hasNewCRMRequests} />
        )}
        {(hasPerm('workflow') || hasPerm('integration')) && (
        <NavFlyout
          icon="tools"
          label="Công cụ"
          active={view === 'workflow' || view === 'integration'}
          items={[
            ...(hasPerm('workflow') ? [{ icon: 'workflow', label: 'Workflow (n8n)', active: view === 'workflow', onClick: () => setView('workflow') }] : []),
            ...(hasPerm('integration') ? [{ icon: 'integration', label: 'Tích hợp', active: view === 'integration', onClick: () => setView('integration') }] : []),
          ]}
        />
        )}
        {hasPerm('analytics') && (
        <NavBtn icon="analytics"  label="Báo cáo"      active={view === 'analytics'}  onClick={() => setView('analytics')} />
        )}
        {/* ERP — gated by module permission AND ERP RBAC (`erp.access`).
            Inside ERP, fine-grained writes enforced via `useErpPermissions().can(...)` +
            IPC middleware `withErpAuth`. */}
        {hasPerm('erp') && canErpAccess && (
        <NavBtn icon="erp"        label="Quản lý công việc"   active={view === 'erp'}        onClick={() => setView('erp')} />
        )}
        {empMode !== 'employee' && (
          <button
            onClick={() => setLicenseModalOpen(true)}
            title="Bản quyền"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white hover:bg-white/10 transition-all duration-150"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M12 7V11"/>
              <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
            </svg>
          </button>
        )}
        <NavBtn icon="settings"   label="Cài đặt"      active={view === 'settings'}   onClick={() => setView('settings')} dot={hasNewSettings} />
      </div>
    </div>

    {licenseModalOpen && <LicenseModal onClose={() => setLicenseModalOpen(false)} />}
    </>
  );
}

function NavBtn({ icon, label, active, onClick, dot }: { icon: string; label: string; active: boolean; onClick: () => void; dot?: boolean }) {
  return (
    <button onClick={onClick} title={label}
      className={`relative w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 ${active ? 'bg-zalo-blue-dark text-white shadow-md' : 'text-white hover:bg-white/10'}`}>
      <AppIcon name={icon as any} className="text-current" size={icon === 'settings' ? 18 : 16} />
      {dot && (
        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-gray-900 pointer-events-none" />
      )}
    </button>
  );
}

// ─── Flyout menu (hover to expand submenu to the right) ───────────────────────

interface FlyoutItem {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

function NavFlyout({ icon, label, active, items }: { icon: string; label: string; active: boolean; items: FlyoutItem[] }) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  }, []);

  const handleLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setOpen(false), 200);
  }, []);

  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        ref={btnRef}
        title={label}
        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 ${
          active ? 'bg-zalo-blue-dark text-white shadow-md' : 'text-white hover:bg-white/10'
        }`}
      >
        <AppIcon name={icon as any} className="text-current" size={16} />
      </button>

      {/* Flyout submenu — appears to the right */}
      {open && (
        <div
          className="absolute left-full -bottom-12 ml-1.5 z-[9999] min-w-[160px] bg-gray-800 border border-gray-600 rounded-xl shadow-2xl py-1.5 animate-in fade-in slide-in-from-left-2 duration-150"
        >
          {/* Header */}
          <div className="px-3 py-1.5 border-b border-gray-700/60 mb-1">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
          </div>
          {items.map((item) => (
            <button
              key={item.icon}
              onClick={() => { item.onClick(); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                item.active
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                <AppIcon name={item.icon as any} className="text-current" size={16} />
              </span>
              <span className="text-xs font-medium whitespace-nowrap">{item.label}</span>
              {item.active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
