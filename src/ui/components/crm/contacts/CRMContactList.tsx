import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useCRMStore } from '@/store/crmStore';
import type { CRMContact } from '@/store/crmStore';
import type { ContactTypeFilter, GenderFilter, BirthdayFilter, SalutationFilter } from '@/store/crmStore';
import type { LabelData } from '@/store/appStore';
import { useAppStore } from '@/store/appStore';
import type { LocalLabelItem } from '@/components/common/LocalLabelSelector';
import ZaloLabelBadge from '../tags/ZaloLabelBadge';
import { UserProfilePopup } from '@/components/common/UserProfilePopup';
import PhoneDisplay from '@/components/common/PhoneDisplay';
import GroupAvatar from '@/components/common/GroupAvatar';
import ipc from '@/lib/ipc';
import { useEmployeeStore } from '@/store/employeeStore';
import useIsMobile from '@/hooks/useIsMobile';


interface CRMContactListProps {
  contacts: CRMContact[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  selectedIds: Set<string>;
  activeContactId: string | null;
  allLabels: LabelData[];
  filterLabelIds: number[];
  filterLocalLabelIds: number[];
  filterContactTypes: ContactTypeFilter[];
  filterGender: GenderFilter;
  filterBirthday: BirthdayFilter;
  filterSalutation?: SalutationFilter;
  /** Toàn bộ danh sách contacts (dùng để tính động các giá trị xưng hô) */
  allContactsForFilter?: CRMContact[];
  searchText: string;
  sortBy: 'name' | 'last_message';
  sortDir: 'asc' | 'desc';
  activeAccountId: string;
  localLabels?: LocalLabelItem[];
  localLabelThreadMap?: Record<string, number[]>;
  onSelectContact: (id: string) => void;
  onActivateContact: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onSelectAllPages?: () => Promise<void>;
  onExportAll?: () => Promise<any[]>;
  onFilterChange: (f: any) => void;
  onPageChange: (page: number) => void;
  onMessage?: (contact: CRMContact) => void;
  onImportPhones?: () => void;
  onImportData?: () => void;
  onDeleteContact?: (contactId: string) => void;
  /** Batch patch nhiều field của một contact (inline edit) */
  onPatchContact?: (contactId: string, fields: {
    alias?: string;
    salutation?: string | null;
    phone?: string;
    gender?: number | null;
    birthday?: string | null;
    ai_assistant_id?: string | null;
    ai_auto_summary?: number;
    ai_auto_summary_threshold?: number;
    real_name?: string | null;
  }) => Promise<void>;
  /** Danh sách trợ lý AI (để render trong cột AI) */
  assistants?: { id: string; name: string }[];
}

/** Tính xưng hô mặc định từ gender khi salutation chưa được set */
function defaultSalutation(gender?: number | null): string {
  if (gender === 0) return 'Anh';
  if (gender === 1) return 'Chị';
  return 'Bạn';
}

function CollapsibleContactLabels({
  threadLIds,
  localLabels,
  contactLabels
}: {
  threadLIds: number[];
  localLabels?: LocalLabelItem[];
  contactLabels: LabelData[];
}) {
  const [expanded, setExpanded] = useState(false);

  const allLabels = useMemo(() => {
    const list: { id: string; name: string; emoji?: string; color: string; textColor?: string }[] = [];

    threadLIds.forEach(lid => {
      const ll = localLabels?.find(l => l.id === lid || Number(l.id) === Number(lid));
      if (ll) {
        list.push({
          id: `ll-${ll.id}`,
          name: ll.name,
          emoji: ll.emoji,
          color: ll.color || '#3b82f6',
          textColor: ll.text_color || '#ffffff',
        });
      }
    });

    contactLabels.forEach(zl => {
      list.push({
        id: `zl-${zl.id}`,
        name: zl.name,
        emoji: '☁️',
        color: zl.color || '#0068FF',
        textColor: '#ffffff',
      });
    });

    return list;
  }, [threadLIds, localLabels, contactLabels]);

  if (allLabels.length === 0) return null;

  const latestLabel = allLabels[allLabels.length - 1];
  const hiddenCount = allLabels.length - 1;

  if (allLabels.length === 1 || expanded) {
    return (
      <div className="flex gap-1 flex-wrap items-center mt-0.5" onClick={e => e.stopPropagation()}>
        {allLabels.map(l => (
          <span
            key={l.id}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium shadow-2xs max-w-[120px]"
            style={{ backgroundColor: l.color, color: l.textColor || '#ffffff' }}
          >
            {l.emoji && <span className="text-[8px]">{l.emoji}</span>}
            <span className="truncate">{l.name}</span>
          </span>
        ))}
        {allLabels.length > 1 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setExpanded(false); }}
            className="text-[9px] text-blue-400 hover:text-blue-300 font-bold bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-1 py-0.5 rounded cursor-pointer flex items-center gap-0.5"
            title="Thu gọn nhãn"
          >
            <span>▲ Thu gọn</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 mt-0.5" onClick={e => e.stopPropagation()}>
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium shadow-2xs max-w-[120px]"
        style={{ backgroundColor: latestLabel.color, color: latestLabel.textColor || '#ffffff' }}
      >
        {latestLabel.emoji && <span className="text-[8px]">{latestLabel.emoji}</span>}
        <span className="truncate">{latestLabel.name}</span>
      </span>

      <button
        type="button"
        onClick={e => { e.stopPropagation(); setExpanded(true); }}
        className="text-[9px] text-gray-300 hover:text-white font-bold bg-gray-700/80 hover:bg-gray-700 border border-gray-600/80 px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-0.5 transition-colors"
        title={`Xem thêm ${hiddenCount} nhãn khác`}
      >
        <span>+{hiddenCount}</span>
        <span className="text-[8px]">▼</span>
      </button>
    </div>
  );
}


/** Dropdown to pick labels for filtering — supports Local + Zalo tabs */
function LabelFilterDropdown({ allLabels, filterLabelIds, filterLocalLabelIds, onChange, localLabels }: {
  allLabels: LabelData[];
  filterLabelIds: number[];
  filterLocalLabelIds: number[];
  onChange: (update: { filterLabelIds?: number[]; filterLocalLabelIds?: number[] }) => void;
  localLabels?: LocalLabelItem[];
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'local' | 'zalo'>('local');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const toggleLocal = (id: number) => onChange({
    filterLocalLabelIds: filterLocalLabelIds.includes(id)
      ? filterLocalLabelIds.filter(x => x !== id)
      : [...filterLocalLabelIds, id],
  });
  const toggleZalo = (id: number) => onChange({
    filterLabelIds: filterLabelIds.includes(id)
      ? filterLabelIds.filter(x => x !== id)
      : [...filterLabelIds, id],
  });

  const activeCount = filterLabelIds.length + filterLocalLabelIds.length;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
          activeCount > 0 ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-gray-400 hover:border-gray-500'
        }`}>
        🏷️ {activeCount > 0 ? `${activeCount} nhãn` : 'Nhãn'}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-xl shadow-xl z-50 min-w-[220px] max-h-[min(78vh,540px)] overflow-hidden flex flex-col">
          {/* Local / Zalo tabs */}
          <div className="px-2 pt-1.5 pb-1 border-b border-gray-700/60 flex-shrink-0">
            <div className="flex bg-gray-700/60 rounded-md p-0.5 gap-0.5">
              <button onClick={() => setTab('local')}
                className={`flex-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  tab === 'local' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}>💾 Local</button>
              <button onClick={() => setTab('zalo')}
                className={`flex-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  tab === 'zalo' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}>☁️ Zalo</button>
            </div>
          </div>
          <div className="overflow-y-auto">
            {tab === 'local' ? (
              !localLabels?.length
                ? <p className="text-xs text-gray-500 px-3 py-2">Chưa có Nhãn Local</p>
                : localLabels.map(label => (
                    <button key={`local-${label.id}`} onClick={() => toggleLocal(label.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 text-left transition-colors">
                      <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-[11px] ${filterLocalLabelIds.includes(label.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-500'}`}>
                        {filterLocalLabelIds.includes(label.id) && '✓'}
                      </span>
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
                        style={{ backgroundColor: label.color || '#3b82f6', color: label.text_color || '#fff' }}>
                        {label.emoji && <span className="text-[9px]">{label.emoji}</span>}
                        <span className="truncate">{label.name}</span>
                      </span>
                    </button>
                  ))
            ) : (
              !allLabels.length
                ? <p className="text-xs text-gray-500 px-3 py-2">Chưa có nhãn Zalo</p>
                : allLabels.map(label => (
                    <button key={label.id} onClick={() => toggleZalo(label.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-700 text-left transition-colors">
                      <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-[11px] ${filterLabelIds.includes(label.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-500'}`}>
                        {filterLabelIds.includes(label.id) && '✓'}
                      </span>
                      <ZaloLabelBadge label={label} size="xs" />
                    </button>
                  ))
            )}
          </div>
          {activeCount > 0 && (
            <button onClick={() => onChange({ filterLabelIds: [], filterLocalLabelIds: [] })}
              className="w-full text-xs text-gray-400 hover:text-white px-3 py-2 border-t border-gray-700 text-left flex-shrink-0">
              Xóa bộ lọc
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Multi-select dropdown for contact type filter */

function ContactTypeFilterDropdown({ filterContactTypes, onChange }: {
  filterContactTypes: ContactTypeFilter[];
  onChange: (types: ContactTypeFilter[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const toggle = (type: ContactTypeFilter) => {
    onChange(filterContactTypes.includes(type)
      ? filterContactTypes.filter(t => t !== type)
      : [...filterContactTypes, type]);
  };

  const OPTIONS: { key: ContactTypeFilter; label: string; icon: string }[] = [
    { key: 'friend', label: 'Bạn bè', icon: '🤝' },
    { key: 'non_friend', label: 'Chưa là bạn bè', icon: '👻' },
    { key: 'is_blocked', label: 'Đã chặn mình', icon: '🚫' },
    { key: 'has_phone', label: 'Có SĐT', icon: '📞' },
    { key: 'has_notes', label: 'Có ghi chú', icon: '📝' },
    { key: 'has_real_name', label: 'Có tên thật', icon: '✏️' },
  ];

  const activeCount = filterContactTypes.length;
  const label = activeCount === 0
    ? 'Loại'
    : activeCount === 1
      ? OPTIONS.find(o => o.key === filterContactTypes[0])?.label ?? 'Loại'
      : `${activeCount} loại`;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
          activeCount > 0 ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-gray-400 hover:border-gray-500'
        }`}>
        🗂️ {label}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ml-0.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-xl shadow-xl z-50 min-w-[180px] overflow-hidden">
          {OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => toggle(opt.key)}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-700 text-left transition-colors">
              <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-[11px] ${filterContactTypes.includes(opt.key) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-500'}`}>
                {filterContactTypes.includes(opt.key) && '✓'}
              </span>
              <span className="text-xs">{opt.icon}</span>
              <span className="text-xs text-gray-200">{opt.label}</span>
            </button>
          ))}
          {activeCount > 0 && (
            <button onClick={() => onChange([])}
              className="w-full text-xs text-gray-400 hover:text-white px-3 py-2 border-t border-gray-700 text-left">
              Xóa bộ lọc
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Styled sort dropdown matching other filter dropdowns */
function GenderFilterDropdown({ value, onChange }: {
  value: GenderFilter;
  onChange: (v: GenderFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const OPTIONS: { key: GenderFilter; label: string; icon: string }[] = [
    { key: 'all', label: 'Tất cả', icon: '👤' },
    { key: 'male', label: 'Nam', icon: '♂️' },
    { key: 'female', label: 'Nữ', icon: '♀️' },
    { key: 'unknown', label: 'Không xác định', icon: '❓' },
  ];

  const current = OPTIONS.find(o => o.key === value);
  const isActive = value !== 'all';

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
          isActive ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-gray-400 hover:border-gray-500'
        }`}>
        {isActive ? `${current?.icon} ${current?.label}` : '⚧ Giới tính'}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ml-0.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-xl shadow-xl z-50 min-w-[140px] overflow-hidden">
          {OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => { onChange(opt.key); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-700 text-left transition-colors ${
                value === opt.key ? 'bg-gray-700/60' : ''
              }`}>
              <span className="text-xs">{opt.icon}</span>
              <span className="text-xs text-gray-200">{opt.label}</span>
              {value === opt.key && <span className="ml-auto text-blue-400 text-[11px]">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BirthdayFilterDropdown({ value, onChange }: {
  value: BirthdayFilter;
  onChange: (v: BirthdayFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const OPTIONS: { key: BirthdayFilter; label: string; icon: string }[] = [
    { key: 'all', label: 'Tất cả', icon: '📅' },
    { key: 'today', label: 'Hôm nay', icon: '🎁' },
    { key: 'this_week', label: 'Tuần này', icon: '📆' },
    { key: 'this_month', label: 'Tháng này', icon: '🎉' },
    { key: 'has_birthday', label: 'Có ngày sinh', icon: '🎂' },
    { key: 'no_birthday', label: 'Chưa có', icon: '❌' },
  ];

  const getLabel = () => {
    if (value.startsWith('yearrange_') || value.startsWith('years_')) {
      const parts = value.replace(/^(yearrange_|years_)/, '').split('_');
      if (parts.length >= 2) return `🎂 ${parts[0]} - ${parts[1]}`;
    }
    if (value.startsWith('month_')) {
      const m = value.replace('month_', '');
      return `🎂 Tháng ${m}`;
    }
    if (value.startsWith('year_')) {
      const y = value.replace('year_', '');
      return `🎂 Năm ${y}`;
    }
    const found = OPTIONS.find(o => o.key === value);
    return found ? `${found.icon} ${found.label}` : '🎂 Sinh nhật';
  };

  const handleApplyYearRange = () => {
    const fromY = parseInt(yearFrom, 10);
    const toY = parseInt(yearTo, 10);
    if (!isNaN(fromY) && !isNaN(toY)) {
      const minY = Math.min(fromY, toY);
      const maxY = Math.max(fromY, toY);
      onChange(`yearrange_${minY}_${maxY}` as BirthdayFilter);
      setOpen(false);
    } else if (!isNaN(fromY)) {
      onChange(`year_${fromY}` as BirthdayFilter);
      setOpen(false);
    } else if (!isNaN(toY)) {
      onChange(`year_${toY}` as BirthdayFilter);
      setOpen(false);
    }
  };

  const isActive = value !== 'all';
  const YEARS = Array.from({ length: 101 }, (_, i) => 1950 + i);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
          isActive ? 'bg-blue-600 border-blue-600 text-white font-medium' : 'border-gray-600 text-gray-400 hover:border-gray-500'
        }`}>
        {getLabel()}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ml-0.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-xl shadow-xl z-50 min-w-[270px] max-w-[310px] p-3 space-y-2.5 text-xs">
          {/* Lọc Nhanh */}
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-0.5">Lọc nhanh</div>
          <div className="grid grid-cols-2 gap-1">
            {OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => { onChange(opt.key); setOpen(false); }}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-colors ${
                  value === opt.key ? 'bg-blue-600/30 text-blue-300 font-semibold border border-blue-500/40' : 'hover:bg-gray-700/60 text-gray-300'
                }`}>
                <span>{opt.icon}</span>
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
          </div>

          <div className="border-t border-gray-700 my-1" />

          {/* Dải Năm Sinh & Phím Tắt Thế Hệ */}
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-0.5">Khoảng Năm Sinh (VD: 1985 - 2000)</div>
          
          {/* Presets */}
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => { onChange('yearrange_1997_2012' as BirthdayFilter); setOpen(false); }}
              className="px-2 py-1 bg-gray-700/70 hover:bg-gray-700 rounded-md text-[11px] text-gray-200 text-left truncate transition-colors"
            >
              🌱 Gen Z (1997 - 2012)
            </button>
            <button
              onClick={() => { onChange('yearrange_1990_1999' as BirthdayFilter); setOpen(false); }}
              className="px-2 py-1 bg-gray-700/70 hover:bg-gray-700 rounded-md text-[11px] text-gray-200 text-left truncate transition-colors"
            >
              🌿 9x (1990 - 1999)
            </button>
            <button
              onClick={() => { onChange('yearrange_1980_1989' as BirthdayFilter); setOpen(false); }}
              className="px-2 py-1 bg-gray-700/70 hover:bg-gray-700 rounded-md text-[11px] text-gray-200 text-left truncate transition-colors"
            >
              🌳 8x (1980 - 1989)
            </button>
            <button
              onClick={() => { onChange('yearrange_1950_1979' as BirthdayFilter); setOpen(false); }}
              className="px-2 py-1 bg-gray-700/70 hover:bg-gray-700 rounded-md text-[11px] text-gray-200 text-left truncate transition-colors"
            >
              👴 7x trở trước (&lt; 1979)
            </button>
          </div>

          {/* Custom Year Range Inputs */}
          <div className="flex items-center gap-1.5 pt-1">
            <input
              type="number"
              placeholder="Từ năm"
              min={1950}
              max={2050}
              value={yearFrom}
              onChange={e => setYearFrom(e.target.value)}
              className="w-1/2 bg-gray-900 text-gray-100 border border-gray-700 rounded-lg px-2 py-1 text-center focus:outline-none focus:border-blue-500"
            />
            <span className="text-gray-400 font-bold">-</span>
            <input
              type="number"
              placeholder="Đến năm"
              min={1950}
              max={2050}
              value={yearTo}
              onChange={e => setYearTo(e.target.value)}
              className="w-1/2 bg-gray-900 text-gray-100 border border-gray-700 rounded-lg px-2 py-1 text-center focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={handleApplyYearRange}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shrink-0 transition-colors"
            >
              Lọc
            </button>
          </div>

          <div className="border-t border-gray-700 my-1" />

          {/* Lọc Theo Tháng (1 - 12) */}
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-0.5">Theo Tháng sinh (1 - 12)</div>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
              const key = `month_${m}` as BirthdayFilter;
              const isSelected = value === key;
              return (
                <button key={m} onClick={() => { onChange(key); setOpen(false); }}
                  className={`py-1 text-center rounded-md font-semibold transition-colors ${
                    isSelected ? 'bg-amber-500 text-gray-900 font-bold' : 'bg-gray-700/60 hover:bg-gray-700 text-gray-200'
                  }`}>
                  Th{m}
                </button>
              );
            })}
          </div>

          <div className="border-t border-gray-700 my-1" />

          {/* Lọc Theo 1 Năm Sinh Đơn Lẻ */}
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-0.5">Hoặc chọn 1 năm đơn lẻ</div>
          <select
            value={value.startsWith('year_') ? value.replace('year_', '') : ''}
            onChange={(e) => {
              if (e.target.value) {
                onChange(`year_${e.target.value}` as BirthdayFilter);
                setOpen(false);
              }
            }}
            className="w-full bg-gray-900 text-gray-100 border border-gray-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="">-- Chọn 1 năm sinh --</option>
            {YEARS.map(y => (
              <option key={y} value={y}>Năm {y}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

/** Styled sort dropdown matching other filter dropdowns */
function SortDropdown({ sortBy, sortDir, onChange }: {
  sortBy: string; sortDir: string;
  onChange: (sortBy: string, sortDir: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const OPTIONS = [
    { key: 'name:asc', label: 'Tên A → Z', icon: '🔤' },
    { key: 'name:desc', label: 'Tên Z → A', icon: '🔤' },
    { key: 'last_message:desc', label: 'Tin nhắn gần nhất', icon: '🕐' },
  ];
  const current = `${sortBy}:${sortDir}`;
  const currentLabel = OPTIONS.find(o => o.key === current)?.label || 'Sắp xếp';

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-gray-600 text-gray-400 hover:border-gray-500 transition-colors">
        ↕️ {currentLabel}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ml-0.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-xl shadow-xl z-50 min-w-[180px] overflow-hidden">
          {OPTIONS.map(opt => {
            const isActive = current === opt.key;
            return (
              <button key={opt.key} onClick={() => { const [sb, sd] = opt.key.split(':'); onChange(sb, sd); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-700 text-left transition-colors">
                <span className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center text-[11px] ${isActive ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-500'}`}>
                  {isActive && '●'}
                </span>
                <span className="text-xs">{opt.icon}</span>
                <span className="text-xs text-gray-200">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Dropdown lọc theo Xưng hô — tự động thu thập các giá trị có trong danh sách */
function SalutationFilterDropdown({ contacts, value, onChange }: {
  contacts: CRMContact[];
  value: SalutationFilter;
  onChange: (v: SalutationFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Luôn giữ các xưng hô mặc định để không bị biến mất khi chọn lọc
  const defaultSals = ['Anh', 'Chị', 'Bạn'];
  const customSals = contacts
      .filter(c => c.contact_type !== 'group')
      .map(c => c.salutation)
      .filter((s): s is string => !!s && !defaultSals.includes(s));
  const salutationValues = Array.from(new Set([...defaultSals, ...customSals])).sort();

  if (salutationValues.length === 0) return null;

  const isActive = value && value !== 'all';

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
          isActive ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-gray-400 hover:border-gray-500'
        }`}>
        🗣 {isActive ? value : 'Xưng hô'}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ml-0.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-xl shadow-xl z-50 min-w-[130px] overflow-hidden">
          <button onClick={() => { onChange('all'); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-700 text-left transition-colors ${
              value === 'all' || !value ? 'bg-gray-700/60' : ''
            }`}>
            <span className="text-xs">👤</span>
            <span className="text-xs text-gray-200">Tất cả</span>
            {(value === 'all' || !value) && <span className="ml-auto text-blue-400 text-[11px]">✓</span>}
          </button>
          {salutationValues.map(sal => (
            <button key={sal} onClick={() => { onChange(sal); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-700 text-left transition-colors ${
                value === sal ? 'bg-gray-700/60' : ''
              }`}>
              <span className="text-xs">🗣</span>
              <span className="text-xs text-gray-200">{sal}</span>
              {value === sal && <span className="ml-auto text-blue-400 text-[11px]">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionsDropdown({ total, exportingCSV, onExportCSV }: {
  total: number;
  exportingCSV: boolean;
  onExportCSV: (selectedFields?: string[]) => void;
  onImportPhones?: () => void;
  onImportData?: () => void;
  onMergeDuplicates?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const ALL_FIELDS = [
    { key: 'display_name',      label: 'Tên hiển thị' },
    { key: 'alias',             label: 'Biệt danh CRM' },
    { key: 'phone',             label: 'Số điện thoại' },
    { key: 'contact_id',        label: 'ID Zalo (UID)' },
    { key: 'contact_type',      label: 'Loại liên hệ' },
    { key: 'is_friend',         label: 'Đã kết bạn' },
    { key: 'gender',            label: 'Giới tính' },
    { key: 'salutation',        label: 'Xưng hô' },
    { key: 'birthday',          label: 'Ngày sinh' },
    { key: 'last_message_time', label: 'Thời gian nhắn cuối' },
    { key: 'note_count',        label: 'Số ghi chú' },
  ];

  const [selectedFields, setSelectedFields] = useState<string[]>(ALL_FIELDS.map(f => f.key));

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative flex-shrink-0">
      <button
        onClick={() => setMenuOpen(v => !v)}
        disabled={total === 0 || exportingCSV}
        className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors border border-gray-300 dark:border-gray-700 font-bold shadow-2xs disabled:opacity-40 cursor-pointer"
        title="Bấm để chọn xuất toàn bộ hoặc chọn các trường xuất dữ liệu CSV"
      >
        {exportingCSV ? (
          <svg className="animate-spin flex-shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-blue-600 dark:text-blue-400">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        )}
        <span>{exportingCSV ? 'Đang xuất...' : `Xuất CSV (${total})`}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="ml-0.5 opacity-70">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Menu dropdown lựa chọn xuất */}
      {menuOpen && (
        <div className="absolute top-full right-0 mt-1.5 w-60 bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden py-1 text-xs animate-fadeIn">
          <button
            onClick={() => { setMenuOpen(false); onExportCSV(); }}
            className="w-full px-3.5 py-2.5 text-left font-bold text-gray-800 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-2.5 transition-colors cursor-pointer"
          >
            <span className="text-sm">🌐</span>
            <div>
              <p className="leading-tight">Xuất toàn bộ ({total})</p>
              <p className="text-[10px] font-normal text-gray-500 dark:text-gray-400">Xuất nhanh tất cả các trường dữ liệu</p>
            </div>
          </button>

          <button
            onClick={() => { setMenuOpen(false); setShowModal(true); }}
            className="w-full px-3.5 py-2.5 text-left font-bold text-gray-800 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-2.5 transition-colors border-t border-gray-100 dark:border-gray-800 cursor-pointer"
          >
            <span className="text-sm">⚙️</span>
            <div>
              <p className="leading-tight">Tùy chọn trường xuất...</p>
              <p className="text-[10px] font-normal text-gray-500 dark:text-gray-400">Tự chọn các cột dữ liệu cần xuất</p>
            </div>
          </button>
        </div>
      )}

      {/* Modal Tùy chọn trường xuất dữ liệu CSV */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden text-gray-900 dark:text-white" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <span>⚙️</span>
                <span>Tùy chọn trường xuất dữ liệu CSV</span>
              </h3>
              <button onClick={() => setShowModal(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Chọn các cột dữ liệu xuất ra CSV:</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedFields(ALL_FIELDS.map(f => f.key))} className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer">Chọn tất cả</button>
                  <span>·</span>
                  <button onClick={() => setSelectedFields([])} className="text-gray-400 hover:underline font-medium cursor-pointer">Bỏ tất cả</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto p-2.5 border border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/50 dark:bg-gray-800/40">
                {ALL_FIELDS.map(f => {
                  const checked = selectedFields.includes(f.key);
                  return (
                    <label key={f.key} className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-white dark:hover:bg-gray-800 transition-colors">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          if (e.target.checked) setSelectedFields(prev => [...prev, f.key]);
                          else setSelectedFields(prev => prev.filter(k => k !== f.key));
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{f.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-3.5 bg-gray-50 dark:bg-gray-850 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                Hủy
              </button>
              <button
                disabled={selectedFields.length === 0}
                onClick={() => {
                  setShowModal(false);
                  onExportCSV(selectedFields);
                }}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>📥</span>
                <span>Xuất CSV ({selectedFields.length} cột)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ColumnVisibility {
  zalo_name: boolean;
  real_name: boolean;
  gender: boolean;
  salutation: boolean;
  birthday: boolean;
  phone: boolean;
  ai_assistant: boolean;
  ai_auto_summary: boolean;
}

const DEFAULT_COLUMN_VISIBILITY: ColumnVisibility = {
  zalo_name: false,
  real_name: false,
  gender: true,
  salutation: true,
  birthday: true,
  phone: true,
  ai_assistant: false,
  ai_auto_summary: false,
};

const MOBILE_COLUMN_VISIBILITY: ColumnVisibility = {
  zalo_name: false,
  real_name: false,
  gender: false,
  salutation: false,
  birthday: false,
  phone: false,
  ai_assistant: false,
  ai_auto_summary: false,
};

function ColumnSelectorDropdown({
  visibility,
  onToggle,
  onReset
}: {
  visibility: ColumnVisibility;
  onToggle: (key: keyof ColumnVisibility) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const columnsList: { key: keyof ColumnVisibility; label: string; defaultHidden?: boolean }[] = [
    { key: 'zalo_name', label: 'Tên Zalo', defaultHidden: true },
    { key: 'real_name', label: 'Tên thật', defaultHidden: true },
    { key: 'gender', label: 'Giới tính' },
    { key: 'salutation', label: 'Xưng hô' },
    { key: 'birthday', label: 'Sinh nhật' },
    { key: 'phone', label: 'SĐT' },
    { key: 'ai_assistant', label: 'Trợ lý AI', defaultHidden: true },
    { key: 'ai_auto_summary', label: 'Tự động tổng hợp', defaultHidden: true },
  ];

  const hiddenCount = columnsList.filter(c => !visibility[c.key]).length;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors border ${
          open
            ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
            : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
        }`}
        title="Tùy chỉnh các cột ẩn/hiện trên bảng CRM"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 2 2h7m0-18v18"/>
        </svg>
        <span>Cột hiển thị</span>
        {hiddenCount > 0 && (
          <span className="ml-0.5 px-1.5 py-0.2 bg-gray-700 text-gray-400 rounded-full text-[10px]">
            -{hiddenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-60 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 p-2.5 space-y-2">
          <div className="flex items-center justify-between px-1 pb-1.5 border-b border-gray-700/80">
            <span className="text-xs font-semibold text-gray-200 flex items-center gap-1.5">
              ⚙️ Hiển thị cột CRM
            </span>
            <button
              onClick={onReset}
              className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline"
            >
              Mặc định
            </button>
          </div>

          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
            <label className="flex items-center justify-between px-2 py-1.5 rounded text-xs text-gray-400 bg-gray-700/30 cursor-not-allowed">
              <span className="font-medium">Biệt danh CRM</span>
              <span className="text-[10px] text-gray-500 font-mono">Bắt buộc</span>
            </label>

            {columnsList.map(col => (
              <label
                key={col.key}
                onClick={e => {
                  e.preventDefault();
                  onToggle(col.key);
                }}
                className="flex items-center justify-between px-2 py-1.5 rounded text-xs text-gray-300 hover:bg-gray-700/60 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={visibility[col.key]}
                    onChange={() => {}}
                    className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <span>{col.label}</span>
                </div>
                {col.defaultHidden && (
                  <span className="text-[9px] text-gray-500 bg-gray-700 px-1 rounded">Ẩn mặc định</span>
                )}
              </label>
            ))}

            <label className="flex items-center justify-between px-2 py-1.5 rounded text-xs text-gray-400 bg-gray-700/30 cursor-not-allowed">
              <span className="font-medium">Tin nhắn / Thao tác</span>
              <span className="text-[10px] text-gray-500 font-mono">Bắt buộc</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CRMContactList({
  contacts, total, page, pageSize, loading, selectedIds, activeContactId,
  allLabels, filterLabelIds, filterLocalLabelIds, filterContactTypes, filterGender, filterBirthday, filterSalutation, searchText, sortBy, sortDir,
  activeAccountId, localLabels, localLabelThreadMap, assistants, allContactsForFilter,
  onSelectContact, onActivateContact, onSelectAll, onClearAll, onSelectAllPages,
  onExportAll,
  onFilterChange, onPageChange, onMessage, onImportPhones, onImportData,
  onDeleteContact, onPatchContact,
}: CRMContactListProps) {
  const totalPages = Math.ceil(total / pageSize);
  const groupInfoCache = useAppStore(s => s.groupInfoCache);

  const [avatarPopup, setAvatarPopup] = useState<{ userId: string; x: number; y: number } | null>(null);
  const [selectingAllPages, setSelectingAllPages] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const handleMergeDuplicates = async () => {
    try {
      const res = await ipc.crm.mergeDuplicateContactsByPhone({ zaloId: 'all' });
      if (res?.success) {
        const count = res.mergedCount || 0;
        if (count > 0) {
          showNotification(`Đã gộp thành công ${count} cặp liên hệ trùng SĐT!`, 'success');
        } else {
          showNotification('Không có liên hệ nào bị trùng SĐT.', 'info');
        }
        onFilterChange({});
      } else {
        showNotification('Lỗi gộp liên hệ: ' + (res?.error || 'Không xác định'), 'error');
      }
    } catch (err: any) {
      showNotification('Lỗi: ' + err.message, 'error');
    }
  };

  // ─── Debounced Search State ──────────────────────────────────────────
  const [localSearch, setLocalSearch] = useState(searchText);

  useEffect(() => {
    setLocalSearch(searchText);
  }, [searchText]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchText) {
        onFilterChange({ searchText: localSearch, page: 0 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch]);

  // ─── Column Visibility State ─────────────────────────────────────────
  const isMobile = useIsMobile();
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>(() => {
    if (isMobile) return MOBILE_COLUMN_VISIBILITY;
    try {
      const saved = localStorage.getItem('crm_column_visibility');
      if (saved) {
        return { ...DEFAULT_COLUMN_VISIBILITY, ...JSON.parse(saved) };
      }
    } catch {}
    return DEFAULT_COLUMN_VISIBILITY;
  });

  const toggleColumn = (key: keyof ColumnVisibility) => {
    setColumnVisibility(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('crm_column_visibility', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const resetColumns = () => {
    setColumnVisibility(DEFAULT_COLUMN_VISIBILITY);
    try {
      localStorage.setItem('crm_column_visibility', JSON.stringify(DEFAULT_COLUMN_VISIBILITY));
    } catch {}
  };


  // ─── Inline Edit State ────────────────────────────────────────────────
  /** Map: contactId → { field → pendingValue } */
  const [pendingEdits, setPendingEdits] = useState<Record<string, Record<string, any>>>({});
  /** Ô đang được edit: { contactId, field } */
  const [editingCell, setEditingCell] = useState<{ contactId: string; field: string } | null>(null);
  /** Đang lưu */
  const [saving, setSaving] = useState(false);
  const pendingCount = Object.keys(pendingEdits).length;

  const fmt = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.getFullYear() === now.getFullYear())
      return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  function escapeCSV(val: any): string {
    const s = String(val ?? '');
    // Excel tự chuyển số dài (SĐT, UID) thành scientific notation → ép giữ dạng text
    if (/^\d+$/.test(s) && s.length >= 5)
      return '="' + s + '"';
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
      return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /** Batch save tất cả pending edits */
  const handleBatchSave = useCallback(async () => {
    if (!onPatchContact || pendingCount === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(pendingEdits).map(([contactId, fields]) =>
          onPatchContact(contactId, fields)
        )
      );
      setPendingEdits({});
    } catch (err) {
      console.error('[CRMContactList] batch save error:', err);
    } finally {
      setSaving(false);
    }
  }, [pendingEdits, pendingCount, onPatchContact]);

  /** Commit giá trị mớt cho một ô */
  const commitEdit = useCallback((contactId: string, field: string, rawValue: string) => {
    const trimmed = rawValue.trim();
    let value: any = trimmed || null;
    if (field === 'salutation' && !trimmed) {
      value = null;
    } else if (field === 'ai_auto_summary') {
      value = trimmed ? parseInt(trimmed, 10) : 0;
    } else if (field === 'ai_auto_summary_threshold') {
      value = trimmed ? parseInt(trimmed, 10) : 30;
    }
    setPendingEdits(prev => ({
      ...prev,
      [contactId]: { ...(prev[contactId] || {}), [field]: value },
    }));
    setEditingCell(null);
  }, []);

  const exportToCSV = useCallback(async (selectedFieldKeys?: string[]) => {
    if (total === 0) return;
    setExportingCSV(true);
    try {
      // Fetch ALL contacts matching current filter (not just current page)
      const allContacts = onExportAll ? await onExportAll() : contacts;
      if (!allContacts.length) return;

      const FIELD_DEFINITIONS: Record<string, { header: string; getValue: (c: any) => string }> = {
        display_name:      { header: 'Tên hiển thị', getValue: (c: any) => c.display_name || c.contact_id },
        alias:             { header: 'Biệt danh CRM', getValue: (c: any) => c.alias || '' },
        phone:             { header: 'Số điện thoại', getValue: (c: any) => c.phone || '' },
        contact_id:        { header: 'ID Zalo (UID)', getValue: (c: any) => c.contact_id },
        contact_type:      { header: 'Loại liên hệ', getValue: (c: any) => c.contact_type === 'group' ? 'Nhóm' : c.is_friend === 1 ? 'Bạn bè' : 'Chưa là bạn bè' },
        is_friend:         { header: 'Đã kết bạn', getValue: (c: any) => c.is_friend === 1 ? 'Có' : 'Không' },
        gender:            { header: 'Giới tính', getValue: (c: any) => c.gender === 0 ? 'Nam' : c.gender === 1 ? 'Nữ' : '' },
        salutation:        { header: 'Xưng hô', getValue: (c: any) => c.salutation || defaultSalutation(c.gender) },
        birthday:          { header: 'Ngày sinh', getValue: (c: any) => c.birthday || '' },
        last_message_time: { header: 'Thời gian nhắn cuối', getValue: (c: any) => c.last_message_time ? new Date(c.last_message_time).toLocaleString('vi-VN') : '' },
        note_count:        { header: 'Số ghi chú', getValue: (c: any) => String(c.note_count || 0) },
      };

      const keysToUse = selectedFieldKeys && selectedFieldKeys.length > 0
        ? selectedFieldKeys
        : Object.keys(FIELD_DEFINITIONS);

      const headers = keysToUse.map(k => FIELD_DEFINITIONS[k]?.header || k);
      const rows = allContacts.map((c: any) => {
        return keysToUse.map(k => {
          const def = FIELD_DEFINITIONS[k];
          return escapeCSV(def ? def.getValue(c) : '');
        }).join(',');
      });

      const csv = [headers.join(','), ...rows].join('\r\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lien_he_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExportingCSV(false);
    }
  }, [contacts, total, onExportAll]);

  const getContactLabels = (contact: CRMContact): LabelData[] => {
    const contactId = contact.contact_id;
    const isGroup = contact.contact_type === 'group';
    const prefixedId = isGroup ? `g${contactId}` : contactId;
    return allLabels.filter(l =>
      l.conversations?.includes(contactId) ||
      (isGroup && l.conversations?.includes(prefixedId))
    );
  };

  const allSelected = contacts.length > 0 && contacts.every(c => selectedIds.has(c.contact_id));

  const contactsForPopup = contacts.map(c => ({
    contact_id: c.contact_id,
    display_name: c.display_name,
    alias: c.alias,
    avatar_url: c.avatar,
    phone: c.phone,
    channel: (c as any).channel,
  }));

  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-700 flex-shrink-0 flex-wrap sm:flex-nowrap">
        {/* Select-all button — chọn TOÀN BỘ tất cả trang */}
        <button
          disabled={selectingAllPages}
          onClick={async () => {
            if (selectedIds.size >= total && total > 0) {
              onClearAll();
            } else if (onSelectAllPages) {
              setSelectingAllPages(true);
              try { await onSelectAllPages(); } finally { setSelectingAllPages(false); }
            } else {
              onSelectAll();
            }
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors border disabled:opacity-50
            ${selectedIds.size >= total && total > 0
              ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 hover:bg-blue-600/30'
              : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'}`}>
          {selectedIds.size >= total && total > 0 ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Bỏ chọn tất cả
            </>
          ) : selectingAllPages ? (
            <>
              <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Đang chọn...
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 11 12 14 22 4"/></svg>
              {isMobile ? `Tất cả (${total || 0})` : `Chọn tất cả ${total > 0 ? `(${total})` : ''}`}
            </>
          )}
        </button>

        {isMobile ? (
          <>
            {/* Mobile Filter Toggle Button */}
            <button
              onClick={() => setMobileFilterOpen(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                mobileFilterOpen || filterLabelIds.length > 0 || filterLocalLabelIds.length > 0 || filterGender !== 'all'
                  ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              <span>Bộ lọc {filterLabelIds.length + filterLocalLabelIds.length > 0 ? `(${filterLabelIds.length + filterLocalLabelIds.length})` : ''}</span>
            </button>

            {/* Mobile Search Input */}
            <div className="relative flex-1 min-w-[120px]">
              <svg width="12" height="12" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                   viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input value={localSearch} onChange={e => setLocalSearch(e.target.value)}
                     placeholder="Tìm tên, SĐT..."
                     className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
            </div>

            {/* Mobile Filter Sheet Modal */}
            {mobileFilterOpen && (
              <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center z-[80] p-0 sm:p-4" onClick={() => setMobileFilterOpen(false)}>
                <div
                  className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-t-3xl sm:rounded-3xl w-full max-w-[500px] shadow-2xl flex flex-col overflow-hidden text-gray-900 dark:text-white max-h-[85vh]"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Swipe indicator */}
                  <div className="w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mt-2.5 mb-1" />

                  {/* Header */}
                  <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <h3 className="font-bold text-base flex items-center gap-2">
                      <span>🔽</span>
                      <span>Bộ lọc liên hệ</span>
                    </h3>
                    <button onClick={() => setMobileFilterOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                      ✕
                    </button>
                  </div>

                  {/* Filter Fields Body */}
                  <div className="p-4 overflow-y-auto space-y-4 text-xs">
                    {/* Nhãn Filter */}
                    <div>
                      <label className="font-bold text-gray-500 uppercase tracking-wider block mb-2 text-[10px]">LỌC THEO NHÃN</label>
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 border border-gray-200 dark:border-gray-800 rounded-2xl bg-gray-50 dark:bg-gray-800/40">
                        {allLabels.map(l => {
                          const isActive = filterLabelIds.includes(l.id);
                          return (
                            <button
                              key={`zalo-lbl-${l.id}`}
                              onClick={() => {
                                const next = isActive ? filterLabelIds.filter(id => id !== l.id) : [...filterLabelIds, l.id];
                                onFilterChange({ filterLabelIds: next, page: 0 });
                              }}
                              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                isActive ? 'bg-blue-600 border-blue-600 text-white shadow-xs' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              🏷️ {l.text}
                            </button>
                          );
                        })}
                        {localLabels.map(l => {
                          const isActive = filterLocalLabelIds.includes(l.id);
                          return (
                            <button
                              key={`local-lbl-${l.id}`}
                              onClick={() => {
                                const next = isActive ? filterLocalLabelIds.filter(id => id !== l.id) : [...filterLocalLabelIds, l.id];
                                onFilterChange({ filterLocalLabelIds: next, page: 0 });
                              }}
                              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                isActive ? 'bg-blue-600 border-blue-600 text-white shadow-xs' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              📦 {l.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Giới tính */}
                    <div>
                      <label className="font-bold text-gray-500 uppercase tracking-wider block mb-2 text-[10px]">GIỚI TÍNH</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'all', label: 'Tất cả' },
                          { value: 'male', label: '👨 Nam' },
                          { value: 'female', label: '👩 Nữ' },
                        ].map(g => (
                          <button
                            key={g.value}
                            onClick={() => onFilterChange({ filterGender: g.value as any, page: 0 })}
                            className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                              filterGender === g.value
                                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            {g.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sắp xếp */}
                    <div>
                      <label className="font-bold text-gray-500 uppercase tracking-wider block mb-2 text-[10px]">SẮP XẾP DANH SÁCH</label>
                      <select
                        value={`${sortBy}:${sortDir}`}
                        onChange={e => {
                          const [sb, sd] = e.target.value.split(':');
                          onFilterChange({ sortBy: sb, sortDir: sd as any, page: 0 });
                        }}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 dark:text-white"
                      >
                        <option value="created_at:desc">Mới nhất xếp trước</option>
                        <option value="created_at:asc">Cũ nhất xếp trước</option>
                        <option value="display_name:asc">Tên (A ➔ Z)</option>
                        <option value="display_name:desc">Tên (Z ➔ A)</option>
                        <option value="message_count:desc">Nhiều tin nhắn nhất</option>
                      </select>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center gap-2">
                    <button
                      onClick={() => {
                        onFilterChange({
                          filterLabelIds: [],
                          filterLocalLabelIds: [],
                          filterGender: 'all',
                          filterContactTypes: [],
                          filterBirthday: 'all',
                          filterSalutation: 'all',
                          page: 0,
                        });
                      }}
                      className="px-4 py-2.5 rounded-xl bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold text-xs"
                    >
                      🧹 Xóa bộ lọc
                    </button>
                    <button
                      onClick={() => setMobileFilterOpen(false)}
                      className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md"
                    >
                      Áp dụng bộ lọc
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <LabelFilterDropdown
              allLabels={allLabels}
              filterLabelIds={filterLabelIds}
              filterLocalLabelIds={filterLocalLabelIds}
              onChange={update => onFilterChange({ ...update, page: 0 })}
              localLabels={localLabels}
            />
            <ContactTypeFilterDropdown
              filterContactTypes={filterContactTypes}
              onChange={types => onFilterChange({ filterContactTypes: types, page: 0 })}
            />
            <GenderFilterDropdown
              value={filterGender}
              onChange={v => onFilterChange({ filterGender: v, page: 0 })}
            />
            <BirthdayFilterDropdown
              value={filterBirthday}
              onChange={v => onFilterChange({ filterBirthday: v, page: 0 })}
            />
            <SalutationFilterDropdown
              contacts={allContactsForFilter || []}
              value={filterSalutation || 'all'}
              onChange={v => onFilterChange({ filterSalutation: v, page: 0 })}
            />
            <SortDropdown sortBy={sortBy} sortDir={sortDir} onChange={(sb, sd) => onFilterChange({ sortBy: sb, sortDir: sd, page: 0 })} />

            <div className="relative flex-1 max-w-xs">
              <svg width="13" height="13" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                   viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input value={localSearch} onChange={e => setLocalSearch(e.target.value)}
                     placeholder="Tên, SĐT, UID..."
                     className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors" />
            </div>

            <button
              onClick={() => {
                setIsEditMode(!isEditMode);
                setEditingCell(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors border flex-shrink-0
                ${isEditMode
                  ? 'bg-amber-600/20 border-amber-500/50 text-amber-300 hover:bg-amber-600/30'
                  : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'}`}
              title={isEditMode ? 'Tắt chế độ sửa nhanh' : 'Bật chế độ sửa nhanh để click là sửa và không mở bảng chi tiết'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
              </svg>
            </button>
          </>
        )}

        {/* Column Visibility Dropdown */}
        <ColumnSelectorDropdown
          visibility={columnVisibility}
          onToggle={toggleColumn}
          onReset={resetColumns}
        />

        {/* Actions dropdown (Export CSV + Import SĐT) */}
        <ActionsDropdown
          total={total}
          exportingCSV={exportingCSV}
          onExportCSV={exportToCSV}
          onImportPhones={onImportPhones}
          onImportData={onImportData}
          onMergeDuplicates={handleMergeDuplicates}
        />

        {/* Batch Save button — chỉ hiện khi có pending edits */}
        {pendingCount > 0 && (
          <button
            onClick={handleBatchSave}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-colors border border-green-600 font-medium flex-shrink-0"
          >
            {saving ? (
              <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
            Lưu {pendingCount} thay đổi
          </button>
        )}
      </div>

      {/* Table header */}
      <div className="flex items-center px-4 py-2 border-b border-gray-700 bg-gray-800/50 text-xs text-gray-500 flex-shrink-0">
        {/* Per-page select button */}
        <button onClick={allSelected ? onClearAll : onSelectAll}
          className={`flex items-center gap-1 mr-3 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-colors border
            ${allSelected
              ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 hover:bg-blue-600/30'
              : 'border-gray-600 text-gray-500 hover:border-gray-400 hover:text-gray-300'}`}>
          {allSelected ? (
            <>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              Bỏ chọn ({contacts.length})
            </>
          ) : (
            <>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
              Trang này ({contacts.length})
            </>
          )}
        </button>
        <span className="w-8 flex-shrink-0" />
        <span className="flex-1 ml-2">Biệt danh CRM</span>
        {columnVisibility.zalo_name && <span className="flex-1 ml-2 hidden md:block">Tên Zalo</span>}
        {columnVisibility.real_name && <span className="w-32 flex-shrink-0 hidden md:block">Tên thật</span>}
        {columnVisibility.gender && <span className="w-16 flex-shrink-0 text-center">Giới tính</span>}
        {columnVisibility.salutation && <span className="w-20 flex-shrink-0 text-center">Xưng hô</span>}
        {columnVisibility.birthday && <span className="w-24 flex-shrink-0 text-center">Sinh nhật</span>}
        {columnVisibility.phone && <span className="w-28 flex-shrink-0">SĐT</span>}
        {columnVisibility.ai_assistant && <span className="w-32 flex-shrink-0 text-center">Trợ lý AI</span>}
        {columnVisibility.ai_auto_summary && <span className="w-28 flex-shrink-0 text-center">Tự động tổng hợp</span>}
        <span className="w-20 flex-shrink-0 text-right">Tin nhắn</span>
      </div>


      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {[...Array(8)].map((_, i) => <div key={i} className="h-10 bg-gray-700/50 rounded-lg animate-pulse" />)}
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-40">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            </svg>
            <p className="text-sm">Không có liên hệ nào</p>
          </div>
        ) : (
          contacts.map(contact => {
            const name = contact.alias || contact.display_name || contact.contact_id;
            const isSelected = selectedIds.has(contact.contact_id);
            const isActive = activeContactId === contact.contact_id;
            const contactLabels = getContactLabels(contact);
            return (
              <div key={contact.contact_id}
                onClick={() => {
                  if (!isEditMode) {
                    onActivateContact(contact.contact_id);
                  }
                }}
                className={`flex items-center px-4 py-2.5 border-b border-gray-700/50 cursor-pointer transition-colors group ${isActive && !isEditMode ? 'bg-blue-600/15' : 'hover:bg-gray-700/40'}`}>
                {/* Styled checkbox */}
                <div
                  onClick={e => { e.stopPropagation(); onSelectContact(contact.contact_id); }}
                  className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors mr-3 cursor-pointer
                    ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-600 bg-gray-800 group-hover:border-gray-400'}`}>
                  {isSelected && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
                {/* Avatar — click opens UserProfilePopup */}
                <div className="relative flex-shrink-0">
                  <div className="w-8 h-8 rounded-full overflow-hidden relative group/av cursor-pointer"
                    onClick={e => {
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setAvatarPopup({ userId: contact.contact_id, x: rect.right + 8, y: rect.top });
                    }}>
                    {contact.contact_type === 'group' ? (
                      <GroupAvatar
                        avatarUrl={contact.avatar}
                        groupInfo={(groupInfoCache[activeAccountId] || {})[contact.contact_id]}
                        name={name}
                        size="xs"
                      />
                    ) : contact.avatar
                      ? <img src={contact.avatar} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                          {(name || 'U').charAt(0).toUpperCase()}
                        </div>}
                    {/* hover overlay */}
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover/av:opacity-100 transition-opacity">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                      </svg>
                    </div>
                  </div>
                </div>
                {/* Biệt danh CRM */}
                <div className="flex-1 ml-2 min-w-0">
                  <div className="flex items-center gap-1.5"
                    onClick={e => {
                      if (isEditMode) {
                        e.stopPropagation();
                        if (contact.contact_type === 'group') return;
                        setEditingCell({ contactId: contact.contact_id, field: 'alias' });
                      }
                    }}
                    onDoubleClick={e => {
                      e.stopPropagation();
                      if (contact.contact_type === 'group') return;
                      setEditingCell({ contactId: contact.contact_id, field: 'alias' });
                    }}
                    title={isEditMode ? "Nhấp để sửa Biệt danh" : "Nhấp đúp để sửa Biệt danh"}
                  >
                    {editingCell?.contactId === contact.contact_id && editingCell.field === 'alias' ? (
                      <input
                        autoFocus
                        defaultValue={
                          pendingEdits[contact.contact_id]?.alias
                            ?? contact.alias
                            ?? contact.display_name
                        }
                        onBlur={e => commitEdit(contact.contact_id, 'alias', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setEditingCell(null);
                        }}
                        onClick={e => e.stopPropagation()}
                        className="text-sm bg-gray-700 border border-blue-500 rounded px-1.5 py-0.5 outline-none text-white max-w-[180px]"
                      />
                    ) : (
                      <span className={`text-sm truncate font-medium ${isEditMode ? 'border-b border-dashed border-gray-500 pb-0.5 cursor-text' : ''} ${
                        pendingEdits[contact.contact_id]?.alias !== undefined
                          ? 'text-green-400 font-semibold'
                          : contact.alias
                            ? 'text-gray-200'
                            : 'text-gray-400 hover:text-gray-200 cursor-pointer'
                      }`}>
                        {pendingEdits[contact.contact_id]?.alias ?? (contact.alias || contact.display_name || contact.contact_id)}
                      </span>
                    )}
                    {contact.contact_type === 'group'
                      ? <span className="text-[9px] text-purple-400 flex-shrink-0 bg-purple-400/10 px-1 rounded">nhóm</span>
                      : contact.is_friend === 1 && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-blue-500 flex-shrink-0">
                            <title>Bạn bè</title>
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                    {contact.note_count > 0 && <span className="text-[12px] text-yellow-500 flex-shrink-0">📝</span>}
                  </div>
                  {contact.alias && contact.alias !== contact.display_name && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5 flex items-center gap-1 font-sans">
                      <span className="text-[10px] text-blue-500 dark:text-blue-400 font-bold bg-blue-500/10 px-1 rounded shrink-0">Zalo gốc</span>
                      <span className="truncate">{contact.display_name}</span>
                    </p>
                  )}
                  {/* Facebook Link display */}
                  {contact.extra_data && (() => {
                    try {
                      const extra = JSON.parse(contact.extra_data);
                      if (extra.fb_name || extra.fb_link) {
                        return (
                          <div className="flex items-center gap-1 text-[11px] text-blue-400 mt-0.5" onClick={e => e.stopPropagation()}>
                            <span className="text-[10px]">🌐</span>
                            {extra.fb_link ? (
                              <a href={extra.fb_link} target="_blank" rel="noopener noreferrer" className="hover:underline truncate max-w-[200px] font-medium">
                                {extra.fb_name || 'Link Facebook'}
                              </a>
                            ) : (
                              <span className="truncate max-w-[200px]">{extra.fb_name}</span>
                            )}
                          </div>
                        );
                      }
                    } catch { }
                    return null;
                  })()}
                  {/* Labels (Local + Zalo) under name */}
                  {(() => {
                    const threadLIds = Array.from(new Set([
                      ...(localLabelThreadMap?.[contact.contact_id] || []),
                      ...(contact.contact_id.startsWith('g') ? localLabelThreadMap?.[contact.contact_id.slice(1)] || [] : localLabelThreadMap?.[`g${contact.contact_id}`] || []),
                      ...(contact.phone ? localLabelThreadMap?.[contact.phone] || [] : []),
                      ...(contact.user_id ? localLabelThreadMap?.[contact.user_id] || [] : []),
                    ]));
                    return (
                      <CollapsibleContactLabels
                        threadLIds={threadLIds}
                        localLabels={localLabels}
                        contactLabels={contactLabels}
                      />
                    );
                  })()}
                </div>

                {/* Tên Zalo (Desktop only) */}
                {columnVisibility.zalo_name && (
                  <div className="flex-1 ml-2 min-w-0 hidden md:flex items-center text-xs text-gray-400 truncate">
                    {contact.display_name || contact.contact_id}
                  </div>
                )}
                {/* Tên thật — inline editable (click / double-click) */}
                {columnVisibility.real_name && (
                  <div
                    className={`w-32 flex-shrink-0 min-w-0 hidden md:flex items-center text-xs truncate cursor-default ${
                      isEditMode ? 'cursor-text' : ''
                    }`}
                    onClick={e => {
                      if (isEditMode) {
                        e.stopPropagation();
                        if (contact.contact_type === 'group') return;
                        setEditingCell({ contactId: contact.contact_id, field: 'real_name' });
                      }
                    }}
                    onDoubleClick={e => {
                      e.stopPropagation();
                      if (contact.contact_type === 'group') return;
                      setEditingCell({ contactId: contact.contact_id, field: 'real_name' });
                    }}
                    title={isEditMode ? 'Nhấp để sửa Tên thật' : 'Nhấp đôi để sửa Tên thật'}
                  >
                    {editingCell?.contactId === contact.contact_id && editingCell.field === 'real_name' ? (
                      <input
                        autoFocus
                        defaultValue={pendingEdits[contact.contact_id]?.real_name ?? (contact.real_name || '')}
                        onBlur={e => commitEdit(contact.contact_id, 'real_name', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setEditingCell(null);
                        }}
                        onClick={e => e.stopPropagation()}
                        placeholder="Nhập tên thật..."
                        className="text-xs bg-gray-700 border border-blue-500 rounded px-1.5 py-0.5 outline-none text-white w-full"
                      />
                    ) : (
                      <span className={`truncate ${
                        pendingEdits[contact.contact_id]?.real_name !== undefined
                          ? 'text-green-400 font-semibold'
                          : contact.real_name
                            ? 'text-emerald-400 font-medium'
                            : 'text-gray-600 italic text-[11px]'
                      }`}>
                        {pendingEdits[contact.contact_id]?.real_name !== undefined
                          ? (pendingEdits[contact.contact_id].real_name || '—')
                          : (contact.real_name || '—')
                        }
                      </span>
                    )}
                  </div>
                )}
                {/* Gender column */}
                {columnVisibility.gender && (
                  <span className="w-16 flex-shrink-0 hidden lg:block text-center">
                    {contact.gender === 0 && <span className="text-[11px] text-blue-400">♂ Nam</span>}
                    {contact.gender === 1 && <span className="text-[11px] text-pink-400">♀ Nữ</span>}
                  </span>
                )}
                {/* Salutation column — inline editable (nhấp đúp để sửa) */}
                {columnVisibility.salutation && (
                  <span
                    className="w-20 flex-shrink-0 hidden lg:flex items-center justify-center cursor-default group/sal"
                    onClick={e => {
                      if (isEditMode) {
                        e.stopPropagation();
                        if (contact.contact_type === 'group') return;
                        setEditingCell({ contactId: contact.contact_id, field: 'salutation' });
                      }
                    }}
                    onDoubleClick={e => {
                      e.stopPropagation();
                      if (contact.contact_type === 'group') return; // groups don't have salutation
                      setEditingCell({ contactId: contact.contact_id, field: 'salutation' });
                    }}
                    title={isEditMode ? "Nhấp để sửa xưng hô" : "Nhấp đúp để sửa xưng hô"}
                  >
                    {editingCell?.contactId === contact.contact_id && editingCell.field === 'salutation' ? (
                      <input
                        autoFocus
                        defaultValue={
                          pendingEdits[contact.contact_id]?.salutation
                            ?? contact.salutation
                            ?? defaultSalutation(contact.gender)
                        }
                        onBlur={e => commitEdit(contact.contact_id, 'salutation', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setEditingCell(null);
                        }}
                        onClick={e => e.stopPropagation()}
                        className="w-full text-center text-[11px] bg-gray-700 border border-blue-500 rounded px-1 py-0.5 outline-none text-white"
                      />
                    ) : (
                      <span className={`text-[11px] transition-colors ${isEditMode ? 'border-b border-dashed border-gray-500 pb-0.5 cursor-text' : ''} ${
                        pendingEdits[contact.contact_id]?.salutation !== undefined
                          ? 'text-green-400 font-medium'
                          : contact.salutation
                            ? 'text-amber-300/90'
                            : 'text-gray-500'
                      } group-hover/sal:text-amber-200 cursor-pointer`}>
                        {pendingEdits[contact.contact_id]?.salutation
                          ?? contact.salutation
                          ?? defaultSalutation(contact.gender)}
                      </span>
                    )}
                  </span>
                )}
                {/* Birthday column */}
                {columnVisibility.birthday && (
                  <span
                    className="w-24 flex-shrink-0 hidden lg:flex items-center justify-center text-center text-[11px] text-gray-500 cursor-default group/bday"
                    onClick={e => {
                      if (isEditMode) {
                        e.stopPropagation();
                        if (contact.contact_type === 'group') return;
                        setEditingCell({ contactId: contact.contact_id, field: 'birthday' });
                      }
                    }}
                    onDoubleClick={e => {
                      e.stopPropagation();
                      if (contact.contact_type === 'group') return;
                      setEditingCell({ contactId: contact.contact_id, field: 'birthday' });
                    }}
                    title={isEditMode ? "Nhấp để sửa Sinh nhật" : "Nhấp đúp để sửa Sinh nhật"}
                  >
                    {editingCell?.contactId === contact.contact_id && editingCell.field === 'birthday' ? (
                      <input
                        autoFocus
                        placeholder="DD/MM/YYYY"
                        defaultValue={
                          pendingEdits[contact.contact_id]?.birthday
                            ?? contact.birthday
                            ?? ''
                        }
                        onBlur={e => commitEdit(contact.contact_id, 'birthday', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setEditingCell(null);
                        }}
                        onClick={e => e.stopPropagation()}
                        className="w-full text-center text-[11px] bg-gray-700 border border-blue-500 rounded px-1 py-0.5 outline-none text-white"
                      />
                    ) : (
                      <span className={`${isEditMode ? 'border-b border-dashed border-gray-500 pb-0.5 cursor-text' : ''} ${pendingEdits[contact.contact_id]?.birthday !== undefined ? 'text-green-400 font-medium' : 'text-gray-500'}`}>
                        {pendingEdits[contact.contact_id]?.birthday ?? contact.birthday ?? '—'}
                      </span>
                    )}
                  </span>
                )}
                {/* Phone */}
                {columnVisibility.phone && (
                  <span
                    className="w-28 flex-shrink-0 hidden md:flex items-center justify-center cursor-default group/phone"
                    onClick={e => {
                      if (isEditMode) {
                        e.stopPropagation();
                        if (contact.contact_type === 'group') return;
                        setEditingCell({ contactId: contact.contact_id, field: 'phone' });
                      }
                    }}
                    onDoubleClick={e => {
                      e.stopPropagation();
                      if (contact.contact_type === 'group') return;
                      setEditingCell({ contactId: contact.contact_id, field: 'phone' });
                    }}
                    title={isEditMode ? "Nhấp để sửa SĐT" : "Nhấp đúp để sửa SĐT"}
                  >
                    {editingCell?.contactId === contact.contact_id && editingCell.field === 'phone' ? (
                      <input
                        autoFocus
                        defaultValue={
                          pendingEdits[contact.contact_id]?.phone
                            ?? contact.phone
                            ?? ''
                        }
                        onBlur={e => commitEdit(contact.contact_id, 'phone', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setEditingCell(null);
                        }}
                        onClick={e => e.stopPropagation()}
                        className="w-full text-center text-[11px] bg-gray-700 border border-blue-500 rounded px-1 py-0.5 outline-none text-white"
                      />
                    ) : (
                      <span className={`${isEditMode ? 'border-b border-dashed border-gray-500 pb-0.5 cursor-text' : ''} ${pendingEdits[contact.contact_id]?.phone !== undefined ? 'text-green-400 font-medium font-semibold' : 'text-gray-500'}`}>
                        {pendingEdits[contact.contact_id]?.phone ? (
                          <PhoneDisplay phone={pendingEdits[contact.contact_id]?.phone} className="text-xs" />
                        ) : contact.phone ? (
                          <PhoneDisplay phone={contact.phone} className="text-xs text-gray-500" />
                        ) : (
                          '—'
                        )}
                      </span>
                    )}
                  </span>
                )}
                {/* AI Assistant column */}
                {columnVisibility.ai_assistant && (
                  <span
                    className="w-32 flex-shrink-0 flex items-center justify-center cursor-default group/ai-assistant text-[11px] text-gray-500"
                    onClick={e => {
                      if (isEditMode) {
                        e.stopPropagation();
                        if (contact.contact_type === 'group') return;
                        setEditingCell({ contactId: contact.contact_id, field: 'ai_assistant_id' });
                      }
                    }}
                    onDoubleClick={e => {
                      e.stopPropagation();
                      if (contact.contact_type === 'group') return;
                      setEditingCell({ contactId: contact.contact_id, field: 'ai_assistant_id' });
                    }}
                    title={isEditMode ? "Nhấp để chọn Trợ lý AI" : "Nhấp đúp để chọn Trợ lý AI"}
                  >
                    {editingCell?.contactId === contact.contact_id && editingCell.field === 'ai_assistant_id' ? (
                      <select
                        autoFocus
                        defaultValue={
                          pendingEdits[contact.contact_id]?.ai_assistant_id
                            ?? contact.ai_assistant_id
                            ?? ''
                        }
                        onChange={e => commitEdit(contact.contact_id, 'ai_assistant_id', e.target.value)}
                        onBlur={() => setEditingCell(null)}
                        onClick={e => e.stopPropagation()}
                        className="w-full text-center text-[11px] bg-gray-700 border border-blue-500 rounded px-1 py-0.5 outline-none text-white font-medium"
                      >
                        <option value="">— Mặc định —</option>
                        {assistants?.map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`${isEditMode ? 'border-b border-dashed border-gray-500 pb-0.5 cursor-text' : ''} ${pendingEdits[contact.contact_id]?.ai_assistant_id !== undefined ? 'text-green-400 font-medium' : 'text-gray-500'}`}>
                        {(() => {
                          const val = pendingEdits[contact.contact_id]?.ai_assistant_id !== undefined
                            ? pendingEdits[contact.contact_id]?.ai_assistant_id
                            : contact.ai_assistant_id;
                          if (!val) return 'Mặc định';
                          return assistants?.find(a => a.id === val)?.name || val;
                        })()}
                      </span>
                    )}
                  </span>
                )}

                {/* Auto Summary column */}
                {columnVisibility.ai_auto_summary && (
                  <span
                    className="w-28 flex-shrink-0 flex items-center justify-center cursor-default group/ai-auto text-[11px] text-gray-500"
                    onClick={e => {
                      if (isEditMode) {
                        e.stopPropagation();
                        if (contact.contact_type === 'group') return;
                        setEditingCell({ contactId: contact.contact_id, field: 'ai_auto_summary' });
                      }
                    }}
                    onDoubleClick={e => {
                      e.stopPropagation();
                      if (contact.contact_type === 'group') return;
                      setEditingCell({ contactId: contact.contact_id, field: 'ai_auto_summary' });
                    }}
                    title={isEditMode ? "Nhấp để sửa Tự động tổng hợp" : "Nhấp đúp để sửa Tự động tổng hợp"}
                  >
                    {editingCell?.contactId === contact.contact_id && editingCell.field === 'ai_auto_summary' ? (
                      <div className="flex items-center gap-1 w-full px-1" onClick={e => e.stopPropagation()}>
                        <select
                          autoFocus
                          defaultValue={
                            pendingEdits[contact.contact_id]?.ai_auto_summary !== undefined
                              ? String(pendingEdits[contact.contact_id]?.ai_auto_summary)
                              : String(contact.ai_auto_summary ?? 0)
                          }
                          onChange={e => {
                            const val = parseInt(e.target.value, 10);
                            setPendingEdits(prev => ({
                              ...prev,
                              [contact.contact_id]: {
                                ...(prev[contact.contact_id] || {}),
                                ai_auto_summary: val,
                              }
                            }));
                            if (val === 0) {
                              setEditingCell(null);
                            }
                          }}
                          onBlur={() => {
                            setTimeout(() => {
                              if (document.activeElement?.id !== `list-threshold-input-${contact.contact_id}`) {
                                setEditingCell(null);
                              }
                            }, 150);
                          }}
                          className="text-[11px] bg-gray-700 border border-blue-500 rounded px-1 py-0.5 outline-none text-white flex-1 min-w-0 font-medium"
                        >
                          <option value="1">Bật</option>
                          <option value="0">Tắt</option>
                        </select>
                        {((pendingEdits[contact.contact_id]?.ai_auto_summary !== undefined
                          ? pendingEdits[contact.contact_id]?.ai_auto_summary
                          : contact.ai_auto_summary) === 1) && (
                          <input
                            id={`list-threshold-input-${contact.contact_id}`}
                            type="number"
                            min={1}
                            max={500}
                            defaultValue={
                              pendingEdits[contact.contact_id]?.ai_auto_summary_threshold
                                ?? contact.ai_auto_summary_threshold
                                ?? 30
                            }
                            onBlur={e => {
                              const thresholdVal = parseInt(e.target.value, 10);
                              if (!isNaN(thresholdVal) && thresholdVal > 0) {
                                setPendingEdits(prev => ({
                                  ...prev,
                                  [contact.contact_id]: {
                                    ...(prev[contact.contact_id] || {}),
                                    ai_auto_summary_threshold: thresholdVal,
                                  }
                                }));
                              }
                              setEditingCell(null);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-10 text-center text-[11px] bg-gray-700 border border-blue-500 rounded px-0.5 py-0.5 outline-none text-white shrink-0 font-medium"
                          />
                        )}
                      </div>
                    ) : (
                      <span className={`${isEditMode ? 'border-b border-dashed border-gray-500 pb-0.5 cursor-text' : ''} ${
                        pendingEdits[contact.contact_id]?.ai_auto_summary !== undefined ||
                        pendingEdits[contact.contact_id]?.ai_auto_summary_threshold !== undefined
                          ? 'text-green-400 font-medium'
                          : 'text-gray-500'
                      }`}>
                        {(() => {
                          const enabled = pendingEdits[contact.contact_id]?.ai_auto_summary !== undefined
                            ? pendingEdits[contact.contact_id]?.ai_auto_summary === 1
                            : contact.ai_auto_summary === 1;
                          const thres = pendingEdits[contact.contact_id]?.ai_auto_summary_threshold
                            ?? contact.ai_auto_summary_threshold
                            ?? 30;
                          return enabled ? `🟢 Bật (${thres})` : '⚪ Tắt';
                        })()}
                      </span>
                    )}
                  </span>
                )}
                {/* Message button + last message time */}
                <div className="w-20 flex-shrink-0 flex items-center justify-end gap-1">
                  {onMessage && (
                    <button
                      onClick={e => { e.stopPropagation(); onMessage(contact); }}
                      title="Nhắn tin"
                      className="p-1 rounded-md text-gray-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors opacity-0 group-hover:opacity-100">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                    </button>
                  )}
                  {onDeleteContact && (
                    <button
                      onClick={e => { e.stopPropagation(); onDeleteContact(contact.contact_id); }}
                      title="Xóa liên hệ"
                      className="p-1 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  )}
                  <span className="text-[11px] text-gray-500">{fmt(contact.last_message_time)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 px-4 py-2.5 border-t border-gray-700 flex-shrink-0">
          <button disabled={page === 0} onClick={() => onPageChange(page - 1)}
            className="px-2.5 py-1 rounded-lg bg-gray-700 text-xs text-gray-300 hover:bg-gray-600 disabled:opacity-40">‹</button>
          <span className="text-xs text-gray-400">{page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}
            className="px-2.5 py-1 rounded-lg bg-gray-700 text-xs text-gray-300 hover:bg-gray-600 disabled:opacity-40">›</button>
        </div>
      )}

      {/* UserProfilePopup */}
      {avatarPopup && (
        <UserProfilePopup
          userId={avatarPopup.userId}
          anchorX={avatarPopup.x}
          anchorY={avatarPopup.y}
          contacts={contactsForPopup}
          activeAccountId={activeAccountId}
          activeThreadId={null}
          onClose={() => setAvatarPopup(null)}
        />
      )}
    </div>
  );
}
