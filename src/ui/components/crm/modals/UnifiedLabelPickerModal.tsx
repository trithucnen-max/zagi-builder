import React, { useState, useMemo, useEffect } from 'react';
import ipc from '@/lib/ipc';

function AccountAvatar({ account, size = 'sm' }: { account: { avatar_url?: string; avatar?: string; full_name?: string; display_name?: string; name?: string; zalo_id?: string }; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-5 h-5 text-[10px]',
    md: 'w-7 h-7 text-xs',
    lg: 'w-9 h-9 text-sm',
  };
  const displayName = account.full_name || account.display_name || account.name;
  const avatarUrl = account.avatar_url || account.avatar;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={displayName || ''}
        className={`${sizeClasses[size]} rounded-full object-cover flex-shrink-0 border border-gray-700`}
        onError={(e) => {
          (e.target as HTMLElement).style.display = 'none';
        }}
      />
    );
  }

  const initial = displayName && displayName.trim() ? displayName.trim().charAt(0).toUpperCase() : '👤';

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {initial}
    </div>
  );
}

export interface LoadedLabelOption {
  value: string;
  label: string;
  source: 'local' | 'zalo';
  color: string;
  textColor?: string;
  emoji?: string;
  name: string;
  pageId?: string;
  pageIds?: string[];
}

export interface UnifiedLabelPickerModalProps {
  open: boolean;
  onClose: () => void;
  options: LoadedLabelOption[];
  selected: string[];
  onChange: (selectedValues: string[]) => void;
  onConfirm?: (selectedValues: string[]) => void;
  mode?: 'single' | 'multi';
  accounts: { zalo_id: string; full_name: string; display_name?: string; phone?: string; avatar_url?: string }[];
  selectedCount?: number;
  onNewLabelCreated?: (newLabel: LoadedLabelOption) => void;
  applying?: boolean;
}

function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
}

function formatPhoneDisplay(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
}

function formatAccountDisplayName(acc?: any): string {
  if (!acc) return '';
  const candidateNames = [acc.full_name, acc.display_name, acc.name, acc.name_zalo];
  for (const name of candidateNames) {
    if (name && typeof name === 'string' && name.trim()) {
      const trimmed = name.trim();
      if (!/^\d{8,}$/.test(trimmed)) {
        return trimmed;
      }
    }
  }
  if (acc.phone && String(acc.phone).trim()) return formatPhoneDisplay(String(acc.phone));
  const idStr = String(acc.zalo_id || acc.id || acc.pageId || '');
  if (idStr && idStr.length > 8) {
    return `Zalo (...${idStr.slice(-4)})`;
  }
  return idStr || 'Zalo Account';
}

export default function UnifiedLabelPickerModal({
  open,
  onClose,
  options,
  selected,
  onChange,
  onConfirm,
  mode = 'multi',
  accounts,
  selectedCount,
  onNewLabelCreated,
  applying = false,
}: UnifiedLabelPickerModalProps) {
  const [activeTab, setActiveTab] = useState<'local' | 'zalo'>('local');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [newLocalLabelName, setNewLocalLabelName] = useState('');
  const [newLocalLabelColor, setNewLocalLabelColor] = useState('#3B82F6');
  const [newLocalLabelEmoji, setNewLocalLabelEmoji] = useState('🏷️');
  const [targetScopeAccountId, setTargetScopeAccountId] = useState<string>('all');
  const [creating, setCreating] = useState(false);

  const localOpts = useMemo(() => {
    return options.filter(o => o.source === 'local');
  }, [options]);

  const zaloOpts = useMemo(() => {
    return options.filter(o => o.source === 'zalo').filter(o => {
      if (!o.pageId) return true;
      return accounts.some(acc => acc.zalo_id === o.pageId);
    });
  }, [options, accounts]);

  // Build account lookup map
  const accountMap = useMemo(() => {
    const map = new Map<string, typeof accounts[0]>();
    accounts.forEach(a => map.set(a.zalo_id, a));
    return map;
  }, [accounts]);

  // Get accounts that have labels
  const accountsWithLabels = useMemo(() => {
    const currentOpts = activeTab === 'local' ? localOpts : zaloOpts;

    if (activeTab === 'zalo') {
      const pageIds = new Set<string>();
      currentOpts.forEach(o => {
        if (o.pageId) pageIds.add(o.pageId);
      });

      if (pageIds.size === 0 && currentOpts.length > 0) {
        return accounts.map(acc => ({
          ...acc,
          avatar_url: acc.avatar_url || '',
          labelCount: currentOpts.length,
        }));
      }

      return accounts.filter(a => pageIds.has(a.zalo_id)).map(acc => ({
        ...acc,
        avatar_url: acc.avatar_url || '',
        labelCount: currentOpts.filter(o => o.pageId === acc.zalo_id).length,
      }));
    }

    return accounts.map(acc => {
      const count = currentOpts.filter(o => !o.pageIds || o.pageIds.length === 0 || o.pageIds.includes(acc.zalo_id)).length;
      return {
        ...acc,
        avatar_url: acc.avatar_url || '',
        labelCount: count,
      };
    }).filter(acc => acc.labelCount > 0);
  }, [activeTab, localOpts, zaloOpts, accounts]);

  // Filter labels by selected account
  const filteredLabels = useMemo(() => {
    const currentOpts = activeTab === 'local' ? localOpts : zaloOpts;
    if (selectedAccountId === 'all') return currentOpts;
    if (activeTab === 'zalo') {
      return currentOpts.filter(o => !o.pageId || o.pageId === selectedAccountId);
    }
    return currentOpts.filter(o => !o.pageIds || o.pageIds.length === 0 || o.pageIds.includes(selectedAccountId));
  }, [activeTab, localOpts, zaloOpts, selectedAccountId]);

  // Reset account filter & sync scope when switching tabs or selecting accounts
  useEffect(() => {
    setSelectedAccountId('all');
    setTargetScopeAccountId('all');
  }, [activeTab]);

  useEffect(() => {
    setTargetScopeAccountId(selectedAccountId);
  }, [selectedAccountId]);

  // Auto-select tab based on available options
  useEffect(() => {
    if (localOpts.length === 0 && zaloOpts.length > 0) setActiveTab('zalo');
    else if (localOpts.length > 0) setActiveTab('local');
  }, [localOpts.length, zaloOpts.length]);

  const handleCreateLocalLabel = async () => {
    const name = newLocalLabelName.trim();
    if (!name) return;
    const existing = options.find(o => o.source === 'local' && o.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (mode === 'single') {
        onChange([existing.value]);
      } else {
        if (!selected.includes(existing.value)) {
          onChange([...selected, existing.value]);
        }
      }
      setNewLocalLabelName('');
      return;
    }
    setCreating(true);
    try {
      const pageIds = targetScopeAccountId !== 'all' ? targetScopeAccountId : '';

      const createRes = await ipc.db?.upsertLocalLabel({
        label: {
          id: 0,
          name,
          color: newLocalLabelColor,
          textColor: '#ffffff',
          emoji: newLocalLabelEmoji,
          pageIds,
        }
      });

      if (createRes?.success && createRes.id) {
        const newLabel: LoadedLabelOption = {
          value: `local:${createRes.id}`,
          label: `${newLocalLabelEmoji} ${name} (Local)`,
          source: 'local',
          color: newLocalLabelColor,
          textColor: '#ffffff',
          emoji: newLocalLabelEmoji,
          name,
          pageIds: pageIds.split(','),
        };
        onNewLabelCreated?.(newLabel);
        if (mode === 'single') {
          onChange([newLabel.value]);
        } else {
          onChange([...selected, newLabel.value]);
        }
        setNewLocalLabelName('');
      }
    } catch (err) {
      console.error('Failed to create local label:', err);
    } finally {
      setCreating(false);
    }
  };

  const toggle = (v: string) => {
    if (mode === 'single') {
      onChange(selected.includes(v) ? [] : [v]);
    } else {
      if (selected.includes(v)) onChange(selected.filter(x => x !== v));
      else onChange([...selected, v]);
    }
  };

  const handleConfirmAction = () => {
    if (onConfirm) {
      onConfirm(selected);
    } else {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-[680px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 bg-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center">
              <span className="text-xl">🏷️</span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Chọn nhãn</h2>
              <p className="text-xs text-gray-400">
                {mode === 'single' ? 'Chọn 1 nhãn' : 'Có thể chọn nhiều nhãn'}
                {selectedCount !== undefined && selectedCount > 0 && (
                  <span> • Áp dụng cho <span className="text-blue-400 font-semibold">{selectedCount}</span> liên hệ</span>
                )}
                {selected.length > 0 && ` • Đã chọn: ${selected.length}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-700/50 hover:bg-gray-600 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* ─── Left: Account Sidebar ─── */}
          <div className="w-60 border-r border-gray-700 bg-gray-800/30 flex flex-col">
            <div className="px-3 py-2.5 border-b border-gray-700/50">
              <span className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">
                Tài khoản
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {/* All accounts option */}
              <button
                type="button"
                onClick={() => setSelectedAccountId('all')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
                  selectedAccountId === 'all'
                    ? 'bg-blue-500/20 border border-blue-500/40 text-blue-300'
                    : 'hover:bg-gray-700/50 text-gray-400 hover:text-gray-300 border border-transparent'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-sm">
                  📋
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">Tất cả</div>
                  <div className="text-[10px] text-gray-500">
                    {(activeTab === 'local' ? localOpts : zaloOpts).length} nhãn
                  </div>
                </div>
              </button>

              {/* Individual accounts */}
              {accountsWithLabels.map(acc => {
                const isActive = selectedAccountId === acc.zalo_id;
                return (
                  <button
                    key={acc.zalo_id}
                    type="button"
                    onClick={() => setSelectedAccountId(acc.zalo_id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
                      isActive
                        ? 'bg-teal-500/20 border border-teal-500/40 text-teal-300'
                        : 'hover:bg-gray-700/50 text-gray-400 hover:text-gray-300 border border-transparent'
                    }`}
                  >
                    <AccountAvatar account={acc as any} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {formatAccountDisplayName(acc)}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                        {acc.phone && <span>{formatPhoneDisplay(acc.phone)}</span>}
                        <span>•</span>
                        <span>{acc.labelCount} nhãn</span>
                      </div>
                    </div>
                    {isActive && (
                      <div className="w-2 h-2 rounded-full bg-teal-400" />
                    )}
                  </button>
                );
              })}

              {accountsWithLabels.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-gray-500">
                  Không có tài khoản nào có nhãn {activeTab === 'local' ? 'Local' : 'Zalo'}
                </div>
              )}
            </div>
          </div>

          {/* ─── Right: Labels Panel ─── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Tabs */}
            <div className="flex bg-gray-800/60 border-b border-gray-700/50">
              <button
                type="button"
                onClick={() => setActiveTab('local')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                  activeTab === 'local'
                    ? 'border-teal-500 text-teal-400 bg-teal-500/5'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-700/30'
                }`}
              >
                <span>💾</span>
                <span>Nhãn Local</span>
                {localOpts.length > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    activeTab === 'local' ? 'bg-teal-500/20 text-teal-400' : 'bg-gray-700 text-gray-500'
                  }`}>
                    {localOpts.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('zalo')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                  activeTab === 'zalo'
                    ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-700/30'
                }`}
              >
                <span>☁️</span>
                <span>Nhãn Zalo</span>
                {zaloOpts.length > 0 && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    activeTab === 'zalo' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-500'
                  }`}>
                    {zaloOpts.length}
                  </span>
                )}
              </button>
            </div>

            {/* Quick create local label (only visible when activeTab === 'local') */}
            {activeTab === 'local' && (
              <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/30 flex gap-2 items-center flex-shrink-0">
                <input
                  type="text"
                  placeholder="Tên nhãn local mới..."
                  value={newLocalLabelName}
                  onChange={e => setNewLocalLabelName(e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-teal-500"
                />
                <select
                  value={targetScopeAccountId}
                  onChange={e => setTargetScopeAccountId(e.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-200 focus:outline-none focus:border-teal-500 cursor-pointer flex-shrink-0"
                  title="Chọn phạm vi tài khoản sử dụng nhãn này"
                >
                  <option value="all">🌐 Tất cả tài khoản</option>
                  {accounts.map(acc => (
                    <option key={acc.zalo_id} value={acc.zalo_id}>
                      👤 {formatAccountDisplayName(acc)}
                    </option>
                  ))}
                </select>
                <select
                  value={newLocalLabelEmoji}
                  onChange={e => setNewLocalLabelEmoji(e.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500 cursor-pointer"
                >
                  {['🏷️', '🎯', '🔥', '⭐', '📢', '💡', '✅', '❌', '⚠️'].map(em => (
                    <option key={em} value={em}>{em}</option>
                  ))}
                </select>
                <input
                  type="color"
                  value={newLocalLabelColor}
                  onChange={e => setNewLocalLabelColor(e.target.value)}
                  className="w-8 h-8 rounded border border-gray-700 bg-transparent p-0.5 cursor-pointer flex-shrink-0"
                  title="Chọn màu nhãn"
                />
                <button
                  type="button"
                  onClick={handleCreateLocalLabel}
                  disabled={creating || !newLocalLabelName.trim()}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-all flex-shrink-0"
                >
                  {creating ? 'Đang tạo...' : 'Tạo mới'}
                </button>
              </div>
            )}

            {/* Labels List */}
            <div className="flex-1 overflow-y-auto p-3">
              {filteredLabels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <span className="text-4xl mb-3">🏷️</span>
                  <p className="text-sm">Không có nhãn nào</p>
                  <p className="text-xs mt-1">
                    {selectedAccountId !== 'all'
                      ? 'Tài khoản này chưa có nhãn'
                      : activeTab === 'local' ? 'Chưa có nhãn Local' : 'Chưa có nhãn Zalo'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredLabels.map(opt => {
                    const isSelected = selected.includes(opt.value);
                    const bgColor = opt.color || '#6b7280';
                    const textColor = opt.textColor || getContrastColor(bgColor);
                    const isGlobalLocal = opt.source === 'local' && (!opt.pageIds || opt.pageIds.length === 0);
                    const accId = opt.pageId || opt.accountZaloId || (opt.pageIds && opt.pageIds[0]);
                    const acc = accId ? accountMap.get(accId) : undefined;
                    const formattedAccName = formatAccountDisplayName(acc);
                    const displayAccName = formattedAccName || (opt.accountName && !/^\d{8,}$/.test(opt.accountName) ? opt.accountName : (accId && accId.length > 8 ? `Zalo (...${accId.slice(-4)})` : accId));
                    const avatarUrl = acc?.avatar_url || (acc as any)?.avatar;
                    const effectiveAcc = { avatar_url: avatarUrl, full_name: displayAccName, display_name: displayAccName, zalo_id: accId || '' };

                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggle(opt.value)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'ring-2 ring-offset-1 ring-offset-gray-900'
                            : 'bg-gray-800/40 border-gray-700/40 hover:border-gray-600 hover:bg-gray-800/60'
                        }`}
                        style={isSelected ? {
                          backgroundColor: `${bgColor}15`,
                          borderColor: `${bgColor}60`,
                          '--tw-ring-color': bgColor,
                        } as React.CSSProperties : undefined}
                      >
                        {/* Checkbox */}
                        <span
                          className={`w-5 h-5 ${mode === 'single' ? 'rounded-full' : 'rounded-md'} border-2 flex items-center justify-center flex-shrink-0 transition-all`}
                          style={isSelected ? {
                            backgroundColor: bgColor,
                            borderColor: bgColor,
                            color: textColor,
                          } : { borderColor: '#4b5563' }}
                        >
                          {isSelected && (
                            mode === 'single' ? (
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: textColor }} />
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            )
                          )}
                        </span>

                        {/* Label badge */}
                        <span
                          className="text-xs px-2.5 py-1 rounded-md font-medium shadow-sm"
                          style={{ backgroundColor: bgColor, color: textColor }}
                        >
                          {opt.emoji || '🏷️'} {opt.name}
                        </span>

                        {/* Account info or Global Badge on the right-hand side */}
                        {selectedAccountId === 'all' && (
                          isGlobalLocal ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium ml-auto flex-shrink-0">
                              🌐 Tất cả Zalo
                            </span>
                          ) : (accId || displayAccName) ? (
                            <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                              <AccountAvatar account={effectiveAcc} size="sm" />
                              <span className="text-xs font-medium text-gray-300">
                                {displayAccName}
                              </span>
                            </div>
                          ) : null
                        )}

                        {/* Selected indicator */}
                        {isSelected && !acc && (
                          <svg className="w-5 h-5 flex-shrink-0 ml-auto" style={{ color: bgColor }} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-700 bg-gray-800/50">
          <div className="text-xs">
            {selected.length > 0 ? (
              <span className="text-gray-300">
                Đã chọn <span className="text-teal-400 font-semibold">{selected.length}</span> nhãn để áp dụng
              </span>
            ) : (
              <span className="text-orange-400 font-medium">
                ⚠️ Để trống sẽ <strong>xóa toàn bộ nhãn</strong> (Local & Zalo) của các liên hệ đã chọn
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="px-3 py-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                Xóa tất cả
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={applying}
              onClick={handleConfirmAction}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors shadow-lg flex items-center gap-1.5"
            >
              {applying && (
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="10"/>
                </svg>
              )}
              {applying ? 'Đang áp dụng...' : 'Xác nhận'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
