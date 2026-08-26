import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

const CopyIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckSmallIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const SearchIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ShareIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const PrevIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const NextIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// ─── Types ──────────────────────────────────────────────────────────────────

interface SharedGroupsCategoryPopupProps {
  pageId: string;
  onClose: () => void;
  onShareGroup: () => void;
  onSelectGroupForScan?: (groupLinkOrId: string) => void;
}

const PAGE_SIZE = 50;

/** Bỏ dấu tiếng Việt để search */
function removeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function SharedGroupsCategoryPopup({
  pageId,
  onClose,
  onShareGroup,
  onSelectGroupForScan,
}: SharedGroupsCategoryPopupProps) {
  const [allGroups, setAllGroups] = useState<SharedGroupItem[]>([]);
  const [categories, setCategories] = useState<SharedGroupCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // ── Copy link handler ─────────────────────────────────────────────────────
  const handleCopyLink = useCallback(async (group: SharedGroupItem) => {
    const link = group.groupLink || `https://zalo.me/g/${group.groupId}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = link;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedId(group.shareId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // ── Load groups (server-side pagination + category filter) ──────────────────
  const loadGroups = useCallback(
    async (categoryId?: number | null, page?: number) => {
      setLoading(true);
      try {
        const catId = categoryId !== undefined ? categoryId : selectedCategoryId;
        const p = page !== undefined ? page : currentPage;
        const res = await getSharedGroups({
          pageId,
          categoryId: catId || undefined,
          page: p,
          limit: PAGE_SIZE,
        });
        if (res.success) {
          setAllGroups(res.items);
          setTotalCount(res.pagination.total);
          // Gộp categories từ server (có count) với DEFAULT_CATEGORIES nếu cần
          if (res.categories && res.categories.length > 0) {
            setCategories(res.categories);
          } else {
            setCategories(DEFAULT_CATEGORIES);
          }
        }
      } catch (err) {
        console.error('[SharedGroupsCategoryPopup] load error:', err);
      } finally {
        setLoading(false);
      }
    },
    [pageId, selectedCategoryId, currentPage]
  );

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // ── Filtered groups by search (client-side search trên trang hiện tại) ──────
  const filteredGroups = useMemo(() => {
    if (!searchText.trim()) return allGroups;
    const cleanSearch = removeDiacritics(searchText.toLowerCase());
    return allGroups.filter(g => {
      const name = removeDiacritics((g.groupName || '').toLowerCase());
      const submitter = removeDiacritics((g.submittedBy || '').toLowerCase());
      return name.includes(cleanSearch) || g.groupId.includes(searchText.trim()) || submitter.includes(cleanSearch);
    });
  }, [allGroups, searchText]);

  // ── Pagination calculations ───────────────────────────────────────────────
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
  const pagedGroups = filteredGroups;

  // ── Category selection ────────────────────────────────────────────────────
  const handleSelectCategory = (catId: number | null) => {
    setSelectedCategoryId(catId);
    setCurrentPage(1);
    loadGroups(catId, 1);
  };

  // ── Page change ───────────────────────────────────────────────────────────
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    loadGroups(selectedCategoryId, page);
  };

  // ── Category badge count helper ───────────────────────────────────────────
  const getCatCount = (catId: number) => {
    const cat = categories.find(c => c.id === catId);
    return cat?.count ?? 0;
  };

  const totalAllCount = categories.reduce((sum, c) => sum + (c.count || 0), 0) || totalCount;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-[850px] max-h-[90vh] shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Kho nhóm chung từ cộng đồng</h3>
              <p className="text-xs text-gray-400 mt-0.5">Các nhóm Zalo chất lượng được người dùng đóng góp và chọn lọc</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onShareGroup}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              {ShareIcon} Chia sẻ nhóm
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors p-1.5 cursor-pointer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content: Sidebar Category + Group List */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Category sidebar */}
          <div className="w-56 border-r border-gray-700 flex flex-col flex-shrink-0 bg-gray-900/40">
            <div className="p-3 border-b border-gray-700/50">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Danh mục ngành nghề</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {/* "Tất cả" option */}
              <button
                onClick={() => handleSelectCategory(null)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left
                  ${selectedCategoryId === null ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'}`}
              >
                <div className="flex items-center gap-2">
                  <span>🌐</span>
                  <span>Tất cả ngành nghề</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
                  {totalAllCount}
                </span>
              </button>

              {/* Category list */}
              {categories.map(cat => {
                const count = getCatCount(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleSelectCategory(cat.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left
                      ${selectedCategoryId === cat.id ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span>{cat.icon}</span>
                      <span className="truncate">{cat.name}</span>
                    </div>
                    {count > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700 flex-shrink-0">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main group list */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-gray-850">
            {/* Search bar */}
            <div className="p-3 border-b border-gray-700 flex items-center gap-2 bg-gray-900/20">
              <div className="relative flex-1">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">{SearchIcon}</div>
                <input
                  type="text"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  placeholder="Tìm theo tên nhóm, ID, người chia sẻ..."
                  className="w-full bg-gray-700/60 border border-gray-600 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-emerald-500"
                />
              </div>
              {loading && <div className="text-emerald-400">{SpinIcon}</div>}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {!loading && pagedGroups.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-xl text-gray-500">📁</div>
                  <p className="text-sm text-gray-400 font-medium">Chưa có nhóm nào trong danh mục này</p>
                  <p className="text-xs text-gray-500 max-w-xs">Hãy là người đầu tiên chia sẻ nhóm chất lượng cho cộng đồng Zagi</p>
                  <button
                    onClick={onShareGroup}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    {ShareIcon} Chia sẻ nhóm ngay
                  </button>
                </div>
              )}

              {pagedGroups.map(group => {
                const groupUrl = group.groupLink || `https://zalo.me/g/${group.groupId}`;
                return (
                  <div
                    key={group.shareId}
                    className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/70 border border-gray-750 hover:border-gray-600 hover:bg-gray-750/50 transition-all shadow-sm"
                  >
                    {/* Avatar */}
                    {group.groupAvatar ? (
                      <img src={group.groupAvatar} alt={group.groupName} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {(group.groupName || '?').charAt(0).toUpperCase()}
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white font-semibold truncate">{group.groupName}</p>
                        {group.category?.name && (
                          <span className="px-2 py-0.5 rounded-md bg-gray-700 text-[10px] text-gray-300 font-medium flex-shrink-0 border border-gray-600/50">
                            {group.category.icon} {group.category.name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                        <span className="text-emerald-400 font-medium">{group.memberCount.toLocaleString('vi-VN')} thành viên</span>
                        <span>·</span>
                        <span className="truncate text-gray-500">Đóng góp: {group.submittedBy || 'Cộng đồng'}</span>
                      </div>
                      {group.note && <p className="text-[11px] text-gray-400 italic mt-1 truncate">"{group.note}"</p>}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {onSelectGroupForScan && (
                        <button
                          onClick={() => {
                            onSelectGroupForScan(groupUrl);
                            onClose();
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center gap-1 cursor-pointer shadow"
                        >
                          ⚡ Quét nhóm
                        </button>
                      )}
                      <button
                        onClick={() => handleCopyLink(group)}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 cursor-pointer border
                          ${copiedId === group.shareId ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-200'}`}
                      >
                        {copiedId === group.shareId ? <>{CheckSmallIcon} Đã copy</> : <>{CopyIcon} Copy link</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination footer */}
            {totalPages > 1 && (
              <div className="px-4 py-2.5 border-t border-gray-700 flex items-center justify-between bg-gray-900/30 flex-shrink-0">
                <span className="text-xs text-gray-400">
                  Trang {currentPage}/{totalPages} ({totalCount} nhóm)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage <= 1}
                    className="w-7 h-7 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-gray-300 transition-colors cursor-pointer"
                  >
                    {PrevIcon}
                  </button>
                  <button
                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    className="w-7 h-7 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-gray-300 transition-colors cursor-pointer"
                  >
                    {NextIcon}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
