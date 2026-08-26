import React, { useState, useEffect, useCallback } from 'react';
import {
  getSharedGroups,
  DEFAULT_CATEGORIES,
  type SharedGroupItem,
  type SharedGroupCategory,
} from '@/lib/backendService';

// ─── Icons ──────────────────────────────────────────────────────────────────

const SpinIcon = (
  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const SearchIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// ─── Types ──────────────────────────────────────────────────────────────────

interface SharedGroupsSectionProps {
  activeAccountId: string;
  onJoinGroup: (groupId: string) => void;
  onScanGroup?: (linkOrId: string) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SharedGroupsSection({
  activeAccountId,
  onJoinGroup,
  onScanGroup,
}: SharedGroupsSectionProps) {
  const [groups, setGroups] = useState<SharedGroupItem[]>([]);
  const [categories, setCategories] = useState<SharedGroupCategory[]>(DEFAULT_CATEGORIES);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  // ── Load shared groups ────────────────────────────────────────────────────
  const loadGroups = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);
    try {
      const res = await getSharedGroups({
        pageId: activeAccountId,
        categoryId: selectedCategoryId || undefined,
      });
      if (res.success) {
        setGroups(res.items);
        if (res.categories && res.categories.length > 0) {
          setCategories(res.categories);
        }
      }
    } catch (err) {
      console.error('[SharedGroupsSection] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, selectedCategoryId]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // ── Filtered by search ────────────────────────────────────────────────────
  const filteredGroups = groups.filter(
    g =>
      !searchText.trim() ||
      g.groupName.toLowerCase().includes(searchText.toLowerCase()) ||
      g.groupId.includes(searchText.trim()) ||
      (g.submittedBy && g.submittedBy.toLowerCase().includes(searchText.toLowerCase()))
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-900/30">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-700 flex-shrink-0 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Kho nhóm chung</h3>
          <p className="text-[11px] text-gray-400">Danh sách nhóm đã được đóng góp và duyệt bởi admin</p>
        </div>
        {loading && <div className="text-emerald-400">{SpinIcon}</div>}
      </div>

      {/* Category filter tabs */}
      <div className="px-4 py-2 border-b border-gray-700/50 flex-shrink-0 overflow-x-auto">
        <div className="flex gap-1.5 min-w-max">
          <button
            onClick={() => setSelectedCategoryId(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer
              ${selectedCategoryId === null ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
          >
            Tất cả
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer
                ${selectedCategoryId === cat.id ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
            >
              <span>{cat.icon}</span>
              <span>{cat.name}</span>
              {typeof cat.count === 'number' && (
                <span className="text-[10px] opacity-75">({cat.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-gray-700/30 flex-shrink-0">
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">{SearchIcon}</div>
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Tìm theo tên nhóm, ID..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {!loading && filteredGroups.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400 font-medium">Chưa có nhóm nào</p>
            <p className="text-xs text-gray-500 mt-1">Các nhóm được chia sẻ sẽ hiển thị ở đây</p>
          </div>
        )}

        {filteredGroups.map(group => {
          const url = group.groupLink || `https://zalo.me/g/${group.groupId}`;
          return (
            <div
              key={group.shareId}
              className="flex items-center gap-3 p-3 bg-gray-800/80 border border-gray-700/60 rounded-xl hover:border-gray-600 transition-colors"
            >
              {group.groupAvatar ? (
                <img src={group.groupAvatar} alt={group.groupName} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {(group.groupName || '?').charAt(0).toUpperCase()}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{group.groupName}</p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                  <span className="text-emerald-400 font-medium">{group.memberCount} thành viên</span>
                  <span>·</span>
                  <span className="text-gray-500">Chia sẻ bởi {group.submittedBy || 'Cộng đồng'}</span>
                </div>
                {group.note && <p className="text-xs text-gray-400 italic mt-0.5 truncate">"{group.note}"</p>}
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {onScanGroup && (
                  <button
                    onClick={() => onScanGroup(url)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Quét
                  </button>
                )}
                <button
                  onClick={() => onJoinGroup(group.groupId)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Tham gia
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
