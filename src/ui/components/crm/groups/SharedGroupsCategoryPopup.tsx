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
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckSmallIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const SearchIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ShareIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const LightningIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const GroupHeaderIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

// ─── Colors for avatar circles ──────────────────────────────────────────────
const AVATAR_BG_COLORS = [
  'bg-blue-500',
  'bg-indigo-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-emerald-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-rose-500',
  'bg-violet-500',
];

function getAvatarBgColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_BG_COLORS.length;
  return AVATAR_BG_COLORS[index];
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface SharedGroupsCategoryPopupProps {
  pageId: string;
  onClose: () => void;
  onShareGroup: () => void;
  onSelectGroupForScan?: (groupLinkOrId: string) => void;
}

const PAGE_SIZE = 10;

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
    if (page < 1 || page > totalPages || page === currentPage) return;
    setCurrentPage(page);
    loadGroups(selectedCategoryId, page);
  };

  // ── Category badge count helper ───────────────────────────────────────────
  const getCatCount = (catId: number) => {
    const cat = categories.find(c => c.id === catId);
    return cat?.count ?? 0;
  };

  const totalAllCount = categories.reduce((sum, c) => sum + (c.count || 0), 0) || totalCount;

  // ── Helper to format pagination pages ─────────────────────────────────────
  const pageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  }, [currentPage, totalPages]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white border border-gray-200 rounded-3xl w-full max-w-[1020px] h-[88vh] shadow-2xl flex overflow-hidden text-gray-900"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Left Column: Category Sidebar ── */}
        <div className="w-60 border-r border-gray-100 flex flex-col flex-shrink-0 bg-[#fbfbfd]">
          {/* Logo & Category Header */}
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl font-black tracking-tight text-blue-600">zagi</span>
            </div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Danh mục ngành nghề
            </p>
          </div>

          {/* Category List without Emojis for Clean Minimal Look */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
            {/* "Tất cả ngành nghề" */}
            <button
              onClick={() => handleSelectCategory(null)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left ${
                selectedCategoryId === null
                  ? 'bg-blue-50 text-blue-600 font-bold'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span className="truncate">Tất cả ngành nghề</span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-bold transition-colors ${
                  selectedCategoryId === null ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {totalAllCount}
              </span>
            </button>

            {/* Other Categories */}
            {categories.map(cat => {
              const count = getCatCount(cat.id);
              const isSelected = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleSelectCategory(cat.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'bg-blue-50 text-blue-600 font-bold'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium'
                  }`}
                >
                  <span className="truncate">{cat.name}</span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ml-1.5 flex-shrink-0 ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Right Column: Header, Search, Cards, Pagination ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                {GroupHeaderIcon}
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Kho nhóm chung từ cộng đồng</h3>
                <p className="text-xs text-gray-500 mt-0.5">Các nhóm Zalo chất lượng được người dùng đóng góp và chọn lọc</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onShareGroup}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white !text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span className="text-white !text-white">{ShareIcon}</span>
                <span className="text-white !text-white">Chia sẻ nhóm</span>
              </button>
              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="px-6 pt-4 pb-2 flex-shrink-0">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                {SearchIcon}
              </span>
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Tìm theo tên nhóm, ID, người chia sẻ..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50/70 hover:bg-gray-50 focus:bg-white border border-gray-200 focus:border-blue-500 rounded-xl text-xs text-gray-900 placeholder-gray-400 focus:outline-none transition-all"
              />
              {searchText && (
                <button
                  onClick={() => setSearchText('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Group list */}
          <div className="flex-1 overflow-y-auto px-6 py-2 space-y-3">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                {SpinIcon}
                <p className="text-xs">Đang tải danh sách nhóm...</p>
              </div>
            ) : pagedGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
                <p className="text-sm font-semibold text-gray-700">Chưa có nhóm nào trong danh mục này</p>
                <p className="text-xs mt-1 text-gray-400">Hãy là người đầu tiên chia sẻ nhóm cho cộng đồng!</p>
                <button
                  onClick={onShareGroup}
                  className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  + Chia sẻ nhóm ngay
                </button>
              </div>
            ) : (
              pagedGroups.map(group => {
                const groupTitle = group.groupName || group.groupId;
                const initial = (groupTitle.replace(/[^a-zA-Z0-9]/g, '') || groupTitle).charAt(0).toUpperCase() || 'G';
                const avatarBg = getAvatarBgColor(group.groupId || groupTitle);
                const isCopied = copiedId === group.shareId;

                return (
                  <div
                    key={group.shareId || group.groupId}
                    className="bg-white border border-gray-200/90 hover:border-blue-300 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all shadow-2xs hover:shadow-xs"
                  >
                    {/* Left: Avatar + Info */}
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {/* Avatar */}
                      {group.groupAvatar ? (
                        <img
                          src={group.groupAvatar}
                          alt={groupTitle}
                          className="w-11 h-11 rounded-full object-cover flex-shrink-0 border border-gray-100 shadow-2xs"
                          onError={e => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div
                          className={`w-11 h-11 rounded-full ${avatarBg} text-white font-black text-base flex items-center justify-center flex-shrink-0 shadow-2xs`}
                        >
                          {initial}
                        </div>
                      )}

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        {/* Row 1: Name + Category Pill */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-gray-900 truncate max-w-[320px]">
                            {groupTitle}
                          </span>
                          {group.category?.name && (
                            <span className="text-[11px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md font-medium flex-shrink-0">
                              {group.category.name}
                            </span>
                          )}
                        </div>

                        {/* Row 2: Member count + Contributor */}
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
                          <span className="text-blue-600 font-semibold">
                            {group.memberCount} thành viên
                          </span>
                          <span>·</span>
                          <span className="truncate">
                            Đóng góp: {group.submittedBy || group.submittedByUid || 'Thành viên'}
                          </span>
                        </div>

                        {/* Row 3: Note (if any) */}
                        {group.note && (
                          <p className="text-xs text-gray-400 italic mt-1 truncate max-w-[480px]">
                            “{group.note}”
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {onSelectGroupForScan && (
                        <button
                          onClick={() => {
                            const linkOrId = group.groupLink || group.groupId;
                            onSelectGroupForScan(linkOrId);
                            onClose();
                          }}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white !text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <span className="text-white !text-white">{LightningIcon}</span>
                          <span className="text-white !text-white">Quét nhóm</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleCopyLink(group)}
                        className={`px-3.5 py-2 border rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                          isCopied
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                            : 'bg-white hover:bg-gray-50 border-gray-300 text-gray-700'
                        }`}
                      >
                        {isCopied ? CheckSmallIcon : CopyIcon}
                        <span>{isCopied ? 'Đã chép' : 'Copy link'}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-3.5 border-t border-gray-100 flex items-center justify-between flex-shrink-0 text-xs text-gray-500 bg-white">
              <div>
                Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} trong{' '}
                <span className="font-bold text-gray-800">{totalCount}</span> nhóm
              </div>

              <div className="flex items-center gap-1">
                {/* Prev button */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                >
                  ‹
                </button>

                {/* Page numbers */}
                {pageNumbers.map((p, idx) => {
                  if (p === '...') {
                    return (
                      <span key={`dots-${idx}`} className="w-8 h-8 flex items-center justify-center text-gray-400">
                        ...
                      </span>
                    );
                  }
                  const pageNum = Number(p);
                  const isActive = pageNum === currentPage;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`w-8 h-8 rounded-full text-xs font-bold transition-colors cursor-pointer flex items-center justify-center ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                {/* Next button */}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
