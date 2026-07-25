/**
 * LibraryPickerModal - Chọn file từ thư viện Media dùng chung.
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────┐
 * │  Header: 📁 Thư viện Media                    ✕     │
 * ├──────────┬──────────────────────────────────────────┤
 * │          │  [🔍 Tìm kiếm...]                         │
 * │  Thư    │  Grid items (filtered by initialType)     │
 * │  mục    │                                           │
 * │  30%    │                                           │
 * ├──────────┴──────────────────────────────────────────┤
 * │  [📤 Upload] [💻 Máy tính]       [Gửi X file]      │
 * └─────────────────────────────────────────────────────┘
 *
 * - initialType quyết định hiển thị (image/video/file/all)
 * - Không có tabs chuyển loại (tránh mixed selection khó xử lý)
 * - Folder sidebar bên trái, file name editing khi hover
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ipc from '../../../lib/ipc';
import * as channelIpc from '../../../lib/channelIpc';
import DataAccessor, { refreshLibraryCache } from '../../../lib/data/DataAccessor';
import { useEmployeeStore } from '../../../store/employeeStore';
import { useAppStore } from '../../../store/appStore';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { useResolvedTheme } from '@/theme/useResolvedTheme';
import { BookIcon, ChartIcon, CloseIcon, EditIcon, FileTextIcon, FolderIcon, ImageIcon, MonitorIcon, RefreshIcon, SearchIcon, SendIcon, StarIcon, TrashIcon } from '@/components/common/icons';

interface LibraryItem {
  uuid: string;
  owner_zalo_id: string;
  type: 'image' | 'video' | 'audio' | 'file';
  name: string;
  mime_type: string;
  size: number;
  fileUrl: string;
  thumbUrl: string | null;
  is_favorite: number;
  folder_id: number | null;
  created_at: number;
  /** Local file path trên Boss (được inject bởi library IPC/handler, undefined ở employee mode) */
  _localPath?: string;
  /** Local thumbnail path trên Boss (được inject bởi library IPC/handler, undefined ở employee mode) */
  _thumbLocalPath?: string;
  tags?: string;
}

interface LibraryFolder {
  id: number;
  name: string;
  parent_id: number | null;
  color: string;
  item_count?: number;
}

type MediaType = 'image' | 'video' | 'audio' | 'file' | 'all';

interface Props {
  zaloId: string;
  threadId?: string;
  threadType?: number;
  initialType?: MediaType;
  onClose: () => void;
  onSelect?: (items: LibraryItem[]) => void;
}

const TYPE_LABELS: Record<MediaType, string> = {
  all: 'Tất cả',
  image: 'Ảnh',
  video: 'Video',
  audio: 'Âm thanh',
  file: 'Tài liệu/File',
};

/** Băm tên nhãn thành mã màu ngẫu nhiên nền sẫm hài hòa */
function getRandomTagColor(name: string): string {
  const hash = Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colors = [
    '#0068ff', // Blue
    '#0d9488', // Teal
    '#16a34a', // Green
    '#ca8a04', // Yellow/Gold
    '#ea580c', // Orange
    '#dc2626', // Red
    '#2563eb', // Indigo
    '#7c3aed', // Purple
    '#db2777', // Pink
  ];
  return colors[hash % colors.length];
}

/** Tính độ tương phản và trả về màu chữ phù hợp (#ffffff hoặc #181a2e) */
function getContrastTextColor(hexColor: string): string {
  if (!hexColor) return '#ffffff';
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#181a2e' : '#ffffff';
}

export default function LibraryPickerModal({
  zaloId, threadId, threadType, initialType = 'all', onClose, onSelect,
}: Props) {
  const resolvedTheme = useResolvedTheme();
  const isLightTheme = resolvedTheme === 'light';
  const activeWs = useWorkspaceStore(s => s.activeWorkspace());
  const isRemote = activeWs?.type === 'remote';
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [quickTagName, setQuickTagName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  // Upload tagging modal state
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [uploadTagIds, setUploadTagIds] = useState<Set<number>>(new Set());
  const [showUploadTagModal, setShowUploadTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');

  // Folders
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(undefined as any);
  const [showFolderMenu, setShowFolderMenu] = useState<number | null>(null);

  // Editing file name
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  // Folder creation / rename inline
  const [folderInput, setFolderInput] = useState<{ mode: 'create' | 'rename'; id?: number; value: string } | null>(null);

  // Context menu (⋯) cho item actions — dùng fixed position để tránh overflow clipping
  const [menuTarget, setMenuTarget] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  // Folder picker dropdown (sub-view của menu)
  const [moveFolderTarget, setMoveFolderTarget] = useState<string | null>(null);
  const [folderPos, setFolderPos] = useState<{ top: number; left: number } | null>(null);

  // Tags
  const [tags, setTags] = useState<any[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [showTagMenu, setShowTagMenu] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState<{ mode: 'create' | 'rename'; id?: number; value: string; color?: string } | null>(null);

  // Edit tags for single item (popover)
  const [editTagsTarget, setEditTagsTarget] = useState<string | null>(null); // item uuid
  const [editTagsPos, setEditTagsPos] = useState<{ top: number; left: number } | null>(null);

  const closeMenus = useCallback(() => {
    setMenuTarget(null); setMenuPos(null);
    setMoveFolderTarget(null); setFolderPos(null);
    setEditTagsTarget(null); setEditTagsPos(null);
    setShowTagMenu(null);
  }, []);

  const handleMenuClick = useCallback((e: React.MouseEvent, uuid: string) => {
    e.stopPropagation();
    if (menuTarget === uuid) { closeMenus(); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.right - 192 }); // 192 = w-48
    setMenuTarget(uuid);
    setMoveFolderTarget(null);
  }, [menuTarget, closeMenus]);

  // Drag-to-select: click and drag across items to auto-select
  const dragSelectRef = useRef<{
    startUuid: string | null;
    startIdx: number;
    hasActivated: boolean;
  }>({ startUuid: null, startIdx: -1, hasActivated: false });
  const clickSuppressUntilRef = useRef(0);
  const itemsRef = useRef<LibraryItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragSelectRef.current;
      if (!drag.startUuid) return;

      // Find library item element under cursor
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      let currentUuid: string | null = null;
      for (const el of elements) {
        const itemEl = (el as HTMLElement).closest?.('[id^="lib-item-"]') as HTMLElement;
        if (itemEl) {
          currentUuid = itemEl.id.replace('lib-item-', '');
          break;
        }
      }
      if (!currentUuid) return;

      const currentItems = itemsRef.current;
      const startIdx = currentItems.findIndex(i => i.uuid === drag.startUuid);
      const endIdx = currentItems.findIndex(i => i.uuid === currentUuid);
      if (startIdx === -1 || endIdx === -1) return;

      // Activate selection mode on move
      if (!drag.hasActivated) {
        if (currentUuid === drag.startUuid) return; // Haven't left the original item
        drag.hasActivated = true;
        document.getSelection()?.removeAllRanges();
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
      }

      // Select items in range
      const minIdx = Math.min(startIdx, endIdx);
      const maxIdx = Math.max(startIdx, endIdx);
      const rangeUuids = currentItems.slice(minIdx, maxIdx + 1).map(i => i.uuid);

      setSelected(prev => {
        const next = new Set(prev);
        for (const uuid of rangeUuids) {
          next.add(uuid);
        }
        return next;
      });
    };

    const handlePointerUp = () => {
      const drag = dragSelectRef.current;
      if (!drag.startUuid) return;

      if (drag.hasActivated) {
        clickSuppressUntilRef.current = Date.now() + 150;
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
      }

      drag.startUuid = null;
      drag.startIdx = -1;
      drag.hasActivated = false;
    };

    document.addEventListener('pointermove', handlePointerMove, { capture: true });
    document.addEventListener('pointerup', handlePointerUp, { capture: true });

    return () => {
      document.removeEventListener('pointermove', handlePointerMove, { capture: true });
      document.removeEventListener('pointerup', handlePointerUp, { capture: true });
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
    };
  }, []);

  // Drag & drop upload
  const [isDragOver, setIsDragOver] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // ── Load folders (lọc theo type) ───────────────────────────

  const loadFolders = useCallback(async () => {
    try {
      const result = await DataAccessor.getLibraryFolders({ zaloId, type: initialType === 'all' ? undefined : initialType });
      if (result.success) {
        setFolders(result.items || []);
      }
    } catch {}
  }, [zaloId, initialType]);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  // ── Load tags ───────────────────────────────────────────────

  const loadTags = useCallback(async () => {
    try {
      const result = await DataAccessor.getLibraryTags({ zaloId });
      if (result.success) {
        setTags(result.items || []);
      }
    } catch {}
  }, [zaloId]);

  useEffect(() => { loadTags(); }, [loadTags]);

  const handleCreateTag = (name?: string) => {
    setTagInput({ mode: 'create', value: name || '', color: '#3b82f6' });
  };

  const handleRenameTag = (id: number) => {
    const t = tags.find(x => x.id === id);
    if (t) {
      setTagInput({ mode: 'rename', id, value: t.name, color: t.color });
    }
  };

  const handleDeleteTag = async (id: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa thẻ này?')) return;
    try {
      const res = await DataAccessor.deleteLibraryTag(id);
      if (res.success) {
        loadTags();
        if (selectedTagIds.has(id)) {
          const next = new Set(selectedTagIds);
          next.delete(id);
          setSelectedTagIds(next);
        }
        loadItems(1);
      }
    } catch {}
    setShowTagMenu(null);
  };

  const submitTagInput = async () => {
    if (!tagInput || !tagInput.value.trim()) { setTagInput(null); return; }
    const name = tagInput.value.trim();
    const color = tagInput.color || '#3b82f6';
    try {
      if (tagInput.mode === 'create') {
        await DataAccessor.createLibraryTag({ name, zaloId, color });
      } else if (tagInput.mode === 'rename' && tagInput.id) {
        await DataAccessor.updateLibraryTag(tagInput.id, { name, color });
      }
      loadTags();
    } catch {}
    setTagInput(null);
    setShowTagMenu(null);
  };

  // ── Load items ──────────────────────────────────────────────

  const loadItems = useCallback(async (pageNum = 1, append = false) => {
    setLoading(true);
    try {
      const result = await DataAccessor.getLibraryItems({
        zaloId,
        type: initialType === 'all' ? '' : initialType,
        page: pageNum,
        limit: 50,
        search: search || undefined,
        folderId: activeFolderId === -1 ? undefined : activeFolderId,
        tagIds: selectedTagIds.size > 0 ? Array.from(selectedTagIds) : undefined,
      });
      if (result.success) {
        const newItems = result.items || [];
        if (newItems.length > 0) {
          console.log('[Library] loadItems sample:', {
            firstItem: { ...newItems[0], file_path: undefined, thumb_path: undefined },
            thumbUrl: newItems[0]?.thumbUrl?.slice(0, 80),
            hasLocalPath: !!(newItems[0] as any)._localPath,
          });
        }
        // Nếu activeFolderId === -1 (Yêu thích), filter
        const filtered = activeFolderId === -1
          ? newItems.filter((i: LibraryItem) => i.is_favorite)
          : newItems;
        setItems(prev => append ? [...prev, ...filtered] : filtered);
        setHasMore(newItems.length >= 50);
        setTotal(result.total || 0);
      }
    } catch {}
    setLoading(false);
  }, [zaloId, initialType, search, activeFolderId, selectedTagIds]);

  useEffect(() => {
    setPage(1);
    loadItems(1);
  }, [search, activeFolderId, selectedTagIds]);

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    loadItems(next, true);
  };

  // ── Scroll infinite ─────────────────────────────────────────

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300 && hasMore && !loading) {
      handleLoadMore();
    }
  }, [hasMore, loading]);

  // ── Select ──────────────────────────────────────────────────

  const toggleSelect = (uuid: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  // ── Rename file ─────────────────────────────────────────────

  const startRename = (uuid: string, currentName: string) => {
    setEditingName(uuid);
    setEditingValue(currentName);
    setTimeout(() => editInputRef.current?.select(), 50);
  };

  const submitRename = async (uuid: string) => {
    const name = editingValue.trim();
    if (!name || name === items.find(i => i.uuid === uuid)?.name) {
      setEditingName(null);
      return;
    }
    console.log('[Library] submitRename:', uuid, name);
    const res = await DataAccessor.updateLibraryItem(uuid, { name });
    console.log('[Library] submitRename result:', res);
    if (res.success) {
      setItems(prev => prev.map(i => i.uuid === uuid ? { ...i, name } : i));
    }
    setEditingName(null);
  };

  // ── Folder CRUD ─────────────────────────────────────────────

  const handleCreateFolder = (parentId?: number) => {
    setFolderInput({ mode: 'create', value: '', id: parentId });
  };

  const handleAddChildFolder = (parentId: number) => {
    setFolderInput({ mode: 'create', value: '', id: parentId });
    setShowFolderMenu(null);
  };

  const handleRenameFolder = (id: number) => {
    const folder = folders.find(f => f.id === id);
    setFolderInput({ mode: 'rename', id, value: folder?.name || '' });
    setShowFolderMenu(null);
  };

  const submitFolderInput = async () => {
    if (!folderInput || !folderInput.value.trim()) { setFolderInput(null); return; }
    const name = folderInput.value.trim();
    try {
      let res;
      if (folderInput.mode === 'create') {
        const parentId = folderInput.id ?? activeFolderId ?? null;
        const folderType = initialType === 'all' ? undefined : initialType;
        res = await DataAccessor.createLibraryFolder({ zaloId, name, parentId, color: '#6366f1', type: folderType });
      } else if (folderInput.mode === 'rename' && folderInput.id) {
        res = await DataAccessor.renameLibraryFolder(folderInput.id, name);
      }
      if (res?.success !== false) loadFolders();
      else console.warn('[Library] submitFolderInput failed:', res);
    } catch (err) {
      console.warn('[Library] submitFolderInput error:', err);
    }
    setFolderInput(null);
  };

  const handleDeleteFolder = async (id: number) => {
    // Dùng confirm dialog của Electron (window.confirm có sẵn)
    const ok = window.confirm?.('Xoá thư mục này? Toàn bộ ảnh/file trong thư mục này cũng sẽ bị xoá.') ?? true;
    if (!ok) return;
    try {
      await DataAccessor.deleteLibraryFolder(id);
      if (activeFolderId === id) setActiveFolderId(undefined as any);
      loadFolders();
    } catch {}
    setShowFolderMenu(null);
  };

  // ── Toggle favorite ─────────────────────────────────────────

  const handleToggleFavorite = async (uuid: string, current: number) => {
    console.log('[Library] toggleFavorite:', uuid, 'current:', current, 'new:', current ? 0 : 1);
    const res = await DataAccessor.updateLibraryItem(uuid, { isFavorite: current ? 0 : 1 });
    console.log('[Library] toggleFavorite result:', res);
    if (res.success) {
      setItems(prev => prev.map(i => i.uuid === uuid ? { ...i, is_favorite: current ? 0 : 1 } : i));
    }
  };

  // ── Move item to folder ─────────────────────────────────────

  const handleMoveToFolder = async (itemUuid: string, newFolderId: number | null) => {
    const res = await DataAccessor.updateLibraryItem(itemUuid, { folderId: newFolderId });
    if (res.success) {
      setItems(prev => {
        // Nếu đang xem folder cụ thể và move ra ngoài → remove khỏi list ngay
        if (activeFolderId !== undefined && activeFolderId !== null && activeFolderId > 0 && newFolderId !== activeFolderId) {
          return prev.filter(i => i.uuid !== itemUuid);
        }
        return prev.map(i => i.uuid === itemUuid ? { ...i, folder_id: newFolderId } : i);
      });
      loadFolders();
    }
    closeMenus();
  };

  // ── Drag & drop upload ──────────────────────────────────────

  /** Xoá item vĩnh viễn */
  const handleDeleteItem = async (uuid: string) => {
    const ok = window.confirm?.('Xoá file này khỏi thư viện? Hành động này không thể hoàn tác.') ?? true;
    if (!ok) return;
    const res = await DataAccessor.deleteLibraryItem(uuid);
    if (res.success) {
      setItems(prev => prev.filter(i => i.uuid !== uuid));
      setSelected(prev => { const next = new Set(prev); next.delete(uuid); return next; });
      loadFolders();
    }
    closeMenus();
  };

  /** Xóa nhiều item đã chọn */
  const handleBatchDeleteSelected = async () => {
    if (selected.size === 0) return;
    const ok = window.confirm?.(`Xác nhận xóa ${selected.size} tệp đã chọn khỏi thư viện?`) ?? true;
    if (!ok) return;
    setLoading(true);
    try {
      const uuids = Array.from(selected);
      for (const uuid of uuids) {
        await DataAccessor.deleteLibraryItem(uuid);
      }
      setItems(prev => prev.filter(i => !selected.has(i.uuid)));
      setSelected(new Set());
      loadFolders();
    } catch (err) {
      console.error('Batch delete error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    startUploadFlow(Array.from(files));
  }, [zaloId]);

  // ── Send ────────────────────────────────────────────────────

  /** Lấy auth object từ account hiện tại */
  const getAuthForZaloId = async (): Promise<any> => {
    try {
      const res = await ipc.login?.getAccounts();
      if (res?.success && res.accounts) {
        const acc = res.accounts.find((a: any) => a.zalo_id === zaloId);
        if (acc?.cookies) return { cookies: acc.cookies, imei: acc.imei || '', userAgent: acc.user_agent || '' };
      }
    } catch {}
    try {
      const mode = useEmployeeStore.getState().mode;
      if (mode === 'employee') return {}; // employee mode: proxy action tự inject auth
    } catch {}
    return null;
  };

  const sendItem = async (item: any) => {
    console.log('[Library] sendItem:', { uuid: item.uuid, type: item.type, hasLocalPath: !!item._localPath, localPath: item._localPath || item.file_path, fileUrl: item.fileUrl, zaloId, threadId });
    const auth = await getAuthForZaloId();
    const localPath = item._localPath || item.file_path;

    try {
      if (item.type === "video") {
        // Video: cần 3-step upload (uploadVideoThumb → uploadVideoFile → sendVideo)
        if (localPath) {
          // Boss mode: dùng channelIpc.sendVideo với local file path
          const metaRes: any = await ipc.file?.getVideoMeta?.({ filePath: localPath }).catch(() => ({})) || {};
          await channelIpc.sendVideo('zalo', {
            auth,
            accountId: zaloId,
            threadId,
            threadType,
            filePath: localPath,
            thumbPath: metaRes.thumbPath || '',
            duration: metaRes.duration || 0,
            width: metaRes.width || 0,
            height: metaRes.height || 0,
          });
        } else {
          // Employee mode: boss proxy sẽ xử lý upload chain qua _libraryUuid
          const res = await ipc.zalo.sendVideo({
            auth: auth || {},
            zaloId,
            threadId,
            threadType,
            fileUrl: item.fileUrl,
            _libraryUuid: item.uuid,
          });
          console.log('[Library] sendVideo result:', res);
        }
      } else {
        // Image hoặc File
        const opts: any = { auth: auth || {}, zaloId, threadId, threadType, type: threadType };
        if (localPath) {
          console.log('[Library] sendItem: local file path resolved', localPath);
          opts.filePath = localPath;
        } else if (item.uuid) {
          console.log('[Library] sendItem: remote library uuid resolved', item.uuid);
          opts.fileUrl = item.fileUrl;
          opts._libraryUuid = item.uuid;
        }
        console.log('[Library] sendItem opts:', opts);
        if (item.type === "image") {
          const res = await ipc.zalo.sendImage(opts);
          console.log('[Library] sendImage result:', res);
        } else {
          const res = await ipc.zalo.sendFile(opts);
          console.log('[Library] sendFile result:', res);
        }
      }
    } catch (err: any) {
      console.error('[Library] sendItem error:', err);
    }
  };

  const startUploadFlow = (files: File[]) => {
    setPendingFiles(files);
    setUploadTagIds(new Set());
    setShowUploadTagModal(true);
  };

  const handleCreateUploadTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const res = await DataAccessor.createLibraryTag({
        name: newTagName.trim(),
        zaloId,
        color: newTagColor,
      });
      if (res.success) {
        await loadTags();
        const result = await DataAccessor.getLibraryTags({ zaloId });
        if (result.success && result.items) {
          const newTag = (result.items || []).find((t: any) => t.name === newTagName.trim());
          if (newTag) {
            setUploadTagIds(prev => new Set(prev).add(newTag.id));
          }
        }
        setNewTagName('');
      }
    } catch (err) {
      console.error('Failed to create tag in upload flow:', err);
    }
  };

  const executeUpload = async () => {
    if (!pendingFiles || pendingFiles.length === 0) return;
    setShowUploadTagModal(false);
    setUploading(true);
    try {
      const tagIdsArr = Array.from(uploadTagIds);
      const newSelected = new Set(selected);
      
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        const base64 = await fileToBase64(file);
        const folderId = activeFolderId || null;
        
        const result = await DataAccessor.uploadToLibrary({
          zaloId,
          fileName: file.name,
          mimeType: file.type,
          base64,
          folderId,
        });
        
        if (result.success && result.data) {
          const itemUuid = result.data.uuid;
          newSelected.add(itemUuid);
          
          if (tagIdsArr.length > 0) {
            await DataAccessor.assignTagsToLibraryItem(itemUuid, tagIdsArr, zaloId);
          }
        }
      }
      
      setSelected(newSelected);
      setPage(1);
      await loadItems(1);
      await loadFolders();
    } catch (err) {
      console.error('Upload flow execution failed:', err);
    } finally {
      setUploading(false);
      setPendingFiles(null);
    }
  };

  const handleSendSelected = async () => {
    if (sending) return;
    const selectedItems = items.filter(i => selected.has(i.uuid));
    if (selectedItems.length === 0) { onClose(); return; }

    if (onSelect) {
      onSelect(selectedItems);
      onClose();
      return;
    }

    setSending(true);
    try {
      for (const item of selectedItems) {
        await sendItem(item);
      }
    } catch (err) {
      console.error('[Library] handleSendSelected error:', err);
    } finally {
      setSending(false);
      onClose();
    }
  };

  // ── Upload / Direct ─────────────────────────────────────────

  const handleUploadAndSend = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    startUploadFlow(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDirectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const auth = await getAuthForZaloId();
      const imagePaths: string[] = [];
      const videoPromises: Promise<void>[] = [];
      const filePromises: Promise<void>[] = [];

      // Phase 1: save all files as temp blobs and classify by type
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64 = await fileToBase64(file);
        const ext = file.name.split('.').pop() || file.type.split('/')[1] || 'bin';
        const saveRes = await ipc.file?.saveTempBlob?.({ base64, ext, filename: file.name });
        if (!saveRes?.success || !saveRes?.filePath) {
          console.error('[Library] saveTempBlob failed for', file.name);
          continue;
        }
        const filePath = saveRes.filePath;

        if (file.type.startsWith('image/')) {
          imagePaths.push(filePath);
        } else if (file.type.startsWith('video/')) {
          videoPromises.push((async () => {
            const metaRes: any = await ipc.file?.getVideoMeta?.({ filePath }) || {};
            await channelIpc.sendVideo('zalo', {
              auth: auth || {},
              accountId: zaloId, threadId, threadType, filePath,
              thumbPath: metaRes.thumbPath || '',
              duration: metaRes.duration || 0,
              width: metaRes.width || 0,
              height: metaRes.height || 0,
            });
          })());
        } else {
          filePromises.push(ipc.zalo.sendFile({ auth: auth || {}, zaloId, threadId, threadType, filePath }));
        }
      }

      // Phase 2: send images in batch
      if (imagePaths.length > 0) {
        if (imagePaths.length === 1) {
          await ipc.zalo.sendImage({ auth: auth || {}, zaloId, threadId, threadType, filePath: imagePaths[0] });
        } else {
          await ipc.zalo.sendImages({ auth: auth || {}, zaloId, threadId, type: threadType, filePaths: imagePaths });
        }
      }

      // Phase 3: send videos and files concurrently (each is independent)
      await Promise.all([...videoPromises, ...filePromises]);
    } catch {}
    setUploading(false);
    if (directInputRef.current) directInputRef.current.value = '';
    onClose();
  };

  const selectedItems = items.filter(i => selected.has(i.uuid));
  const typeLabel = TYPE_LABELS[initialType] || '📁 Media';

  // ── Build folder tree ───────────────────────────────────────

  // Hiển thị tất cả folder, item_count cho biết số lượng item theo type hiện tại
  // Folder trống (0 item) hiển thị ở mọi type, khi có item thì tự lọc theo type
  const rootFolders = folders.filter(f => !f.parent_id);
  const childFolders = (parentId: number) => folders.filter(f => f.parent_id === parentId);

  const renderFolderItem = (folder: LibraryFolder, depth = 0) => {
    const isRenaming = folderInput?.mode === 'rename' && folderInput.id === folder.id;
    return (
    <div key={folder.id}>
      {isRenaming ? (
        <div className="px-2 py-1" style={{ paddingLeft: `${12 + depth * 16}px` }}>
          <input autoFocus
            value={folderInput.value}
            onChange={e => setFolderInput({ ...folderInput, value: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') submitFolderInput(); if (e.key === 'Escape') setFolderInput(null); }}
            onBlur={() => setTimeout(() => submitFolderInput(), 200)}
            className="w-full px-2 py-1 text-xs bg-gray-700 border border-blue-500 rounded-lg text-gray-200 outline-none"
          />
        </div>
      ) : (
      <div
        onContextMenu={(e) => { e.preventDefault(); setShowFolderMenu(showFolderMenu === folder.id ? null : folder.id); }}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-all group relative ${
          activeFolderId === folder.id
            ? 'bg-blue-600/30 text-blue-300'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        <span onClick={() => setActiveFolderId(activeFolderId === folder.id ? undefined as any : folder.id)} className="flex items-center gap-2 flex-1 min-w-0">
          <span><FolderIcon className="w-4 h-4" /></span>
          <span className="truncate">{folder.name}</span>
          <span className="text-[10px] mb-2">{folder.item_count || 0}</span>
        </span>

        {/* ⋯ menu button */}
        <div className="relative">
          <button onClick={(e) => { e.stopPropagation(); setShowFolderMenu(showFolderMenu === folder.id ? null : folder.id); }}
            className="p-1 rounded-md text-gray-400 hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-all text-sm">⋯</button>

          {showFolderMenu === folder.id && (
            <div className="absolute right-0 top-full mt-1 bg-gray-700 border border-gray-600 rounded-xl shadow-2xl z-50 py-1 w-40"
              onClick={e => e.stopPropagation()}>
              <button onClick={() => handleAddChildFolder(folder.id)}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-600 flex items-center gap-2"><FolderIcon className="w-4 h-4 inline" /> Thêm thư mục con</button>
              <button onClick={() => { handleRenameFolder(folder.id); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-600 flex items-center gap-2"><EditIcon className="w-3.5 h-3.5" /> Đổi tên</button>
              <button onClick={() => handleDeleteFolder(folder.id)}
                className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-gray-600 flex items-center gap-2"><TrashIcon className="w-4 h-4 inline" /> Xoá</button>
            </div>
          )}
        </div>
      </div>
      )}
      {childFolders(folder.id).map(child => renderFolderItem(child, depth + 1))}
    </div>
    );
  };

  /** Render item in folder picker dropdown (flat tree) */
  const renderFolderPickerItem = (folder: LibraryFolder, itemUuid: string, depth = 0): React.ReactNode => {
    const children = childFolders(folder.id);
    return (
      <React.Fragment key={folder.id}>
        <button onClick={() => handleMoveToFolder(itemUuid, folder.id)}
          className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 flex items-center gap-2 truncate"
          style={{ paddingLeft: `${12 + depth * 16}px` }}>
          <span><FolderIcon className="w-4 h-4" /></span>
          <span className="truncate">{folder.name}</span>
          {folder.item_count ? <span className="ml-auto text-[10px] text-gray-400">{folder.item_count}</span> : null}
        </button>
        {children.map(child => renderFolderPickerItem(child, itemUuid, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-5xl h-[85vh] bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/50">
          <h2 className="text-lg font-semibold text-white">{typeLabel}</h2>
          <span className="text-xs text-gray-400">{total} file</span>
          <button onClick={() => { refreshLibraryCache(); loadItems(1); loadFolders(); loadTags(); }} className="p-1.5 text-gray-400 hover:text-white transition-colors" title="Làm mới"><RefreshIcon className="w-4 h-4" /></button>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white transition-colors ml-auto">✕</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* ─── Left sidebar: folders (30%) ─── */}
          <div className="w-1/4 border-r border-gray-700/50 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/50">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Thư mục</span>
              <button onClick={() => handleCreateFolder()}
                className="w-7 h-7 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-lg font-bold flex items-center justify-center transition-colors shadow-md"
                title="Tạo thư mục mới"
              >＋</button>
            </div>
            <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
              <div onClick={() => setActiveFolderId(undefined as any)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-all ${
                  activeFolderId === undefined ? 'bg-blue-600/30 text-blue-300' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                }`}>
                <span>📂</span>
                <span className="flex-1">Tất cả</span>
              </div>
              <div onClick={() => setActiveFolderId(-1)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-all ${
                  activeFolderId === -1 ? 'bg-blue-600/30 text-blue-300' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                }`}>
                <StarIcon className="w-4 h-4 text-yellow-400" />
                <span className="flex-1">Yêu thích</span>
              </div>
              <div className="h-px bg-gray-700/50 my-2" />
              {folderInput?.mode === 'create' && (
                <div className="px-2 py-1">
                  <input autoFocus
                    value={folderInput.value}
                    onChange={e => setFolderInput({ ...folderInput, value: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') submitFolderInput(); if (e.key === 'Escape') setFolderInput(null); }}
                    onBlur={() => setTimeout(() => submitFolderInput(), 200)}
                    placeholder="Tên thư mục..."
                    className="w-full px-2 py-1 text-xs bg-gray-700 border border-gray-500 rounded-lg text-gray-200 placeholder-gray-500 outline-none"
                  />
                </div>
              )}
              {rootFolders.map(f => renderFolderItem(f))}
               {rootFolders.length === 0 && !folderInput && (
                <p className="text-xs text-gray-400 text-center py-4">Chưa có thư mục</p>
              )}

              {/* Tags Section */}
              <div className="h-px bg-gray-700/50 my-3" />
              <div className="flex items-center justify-between px-3 py-1">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Nhãn dán</span>
                <button onClick={() => handleCreateTag()}
                  className="w-6 h-6 rounded-md flex items-center justify-center !text-white text-sm font-bold transition-all hover:scale-110"
                  style={{ background: '#0068ff', color: '#fff' }}
                  title="Tạo nhãn mới">＋</button>
              </div>

              {tagInput && tagInput.mode === 'create' && (
                <div className="px-2 py-1 flex items-center gap-1.5 bg-gray-800 rounded-lg border border-gray-600/30 my-1">
                  <input autoFocus
                    value={tagInput.value}
                    onChange={e => setTagInput({ ...tagInput, value: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') submitTagInput(); if (e.key === 'Escape') setTagInput(null); }}
                    onBlur={() => setTimeout(() => submitTagInput(), 250)}
                    placeholder="Tên nhãn..."
                    className="flex-1 px-1.5 py-0.5 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 outline-none animate-fade-in"
                  />
                </div>
              )}

              <div className="space-y-0.5 mt-1">
                {tags.map(tag => {
                  const isSelected = selectedTagIds.has(tag.id);
                  
                  // Chế độ sửa tên inline khi nháy đúp
                  if (tagInput && tagInput.mode === 'rename' && tagInput.id === tag.id) {
                    return (
                      <div key={tag.id} className="px-3 py-1">
                        <input
                          autoFocus
                          value={tagInput.value}
                          onChange={e => setTagInput({ ...tagInput, value: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === 'Enter') submitTagInput();
                            if (e.key === 'Escape') setTagInput(null);
                          }}
                          onBlur={() => setTimeout(() => submitTagInput(), 200)}
                          className="w-full px-2 py-1 text-xs bg-gray-800 border border-[#0068ff]/70 rounded text-gray-200 outline-none"
                        />
                      </div>
                    );
                  }

                  return (
                    <div key={tag.id}
                      onDoubleClick={() => handleRenameTag(tag.id)}
                      onClick={() => {
                        const next = new Set(selectedTagIds);
                        if (isSelected) {
                          next.delete(tag.id);
                        } else {
                          next.add(tag.id);
                        }
                        setSelectedTagIds(next);
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-all group relative ${
                        isSelected
                          ? 'bg-blue-600/30 text-blue-300'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                      }`}
                      title="Nhấp đúp chuột để đổi tên"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0 select-none">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#3b82f6' }} />
                        <span className="truncate">{tag.name}</span>
                      </div>

                      {/* Nút xóa nhãn dán xuất hiện khi hover */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.id); }}
                        className="p-1 rounded text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs font-bold leading-none ml-auto"
                        title="Xóa nhãn dán"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                {tags.length === 0 && !tagInput && (
                  <p className="text-xs text-gray-500 text-center py-2">Chưa có nhãn dán</p>
                )}
              </div>
            </div>
          </div>

          {/* ─── Right content (70%) ─── */}
          <div className="w-3/4 flex flex-col">
            <div className="px-4 py-2 border-b border-gray-700/50 flex items-center justify-between gap-3 flex-shrink-0">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Tìm trong thư viện..."
                className="flex-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 placeholder-gray-500 outline-none"
              />
              <div className="flex items-center gap-1 bg-gray-800 p-0.5 rounded-lg border border-gray-700/60 shrink-0 select-none">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  Lưới
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  Danh sách
                </button>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div ref={gridRef} onScroll={handleScroll}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex-1 overflow-y-auto p-4 transition-all flex flex-col ${isDragOver ? 'bg-blue-900/20 border-2 border-dashed border-blue-500/50 rounded-lg' : ''}`}>
                {items.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                    <span className="text-4xl mb-2">📂</span>
                    <p className="text-sm">Thư viện trống</p>
                    <p className="text-xs mt-1">Nhấn "Upload vào thư viện" để thêm file</p>
                  </div>
                )}
 
                {items.length > 0 && viewMode === 'list' ? (
                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-750 text-gray-400 font-semibold uppercase tracking-wider">
                          <th className="py-2.5 px-3 w-10">Chọn</th>
                          <th className="py-2.5 px-3">Tên file</th>
                          <th className="py-2.5 px-3 w-16">Loại</th>
                          <th className="py-2.5 px-3 w-28">Ngày tạo</th>
                          <th className="py-2.5 px-3 w-20">Kích thước</th>
                          <th className="py-2.5 px-3">Nhãn dán</th>
                          <th className="py-2.5 px-3 w-20 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/40">
                        {items.map(item => {
                          const isSel = selected.has(item.uuid);
                          const dateStr = new Date(item.created_at || Date.now()).toLocaleDateString('vi-VN', {
                            day: '2-digit', month: '2-digit', year: 'numeric'
                          });
                          const sizeStr = item.size ? (item.size / 1024).toFixed(1) + ' KB' : '-';
                          return (
                            <tr key={item.uuid}
                              onClick={() => toggleSelect(item.uuid)}
                              className={`hover:bg-gray-800/45 cursor-pointer transition-colors ${isSel ? 'bg-blue-600/10' : ''}`}
                            >
                              <td className="py-2.5 px-3 w-10">
                                <input type="checkbox" checked={isSel} readOnly className="rounded border-gray-600 text-blue-600 focus:ring-0 focus:ring-offset-0 bg-transparent" />
                              </td>
                              <td className="py-2.5 px-3 font-medium text-gray-250" title={item.name}>
                                <div className="flex items-center gap-2 max-w-[280px]">
                                  <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-gray-800 border border-gray-700 flex items-center justify-center">
                                    <ImagePreview item={item} />
                                  </div>
                                  <span className="truncate text-xs">{item.name}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 capitalize text-gray-400">{item.type}</td>
                              <td className="py-2.5 px-3 text-gray-400">{dateStr}</td>
                              <td className="py-2.5 px-3 text-gray-400">{sizeStr}</td>
                              <td className="py-2.5 px-3">
                                {item.tags && (
                                  <div className="flex flex-wrap gap-1">
                                    {item.tags.split(',').map((name: string) => {
                                      const trimmed = name.trim();
                                      if (!trimmed) return null;
                                      const tagObj = tags.find(t => t.name === trimmed);
                                      if (!tagObj) return null;
                                      const bgColor = tagObj.color || '#4b5563';
                                      const textColor = getContrastTextColor(bgColor);
                                      return (
                                        <span key={trimmed} className="px-1.5 py-0.5 rounded text-[8px] font-medium"
                                          style={{ backgroundColor: bgColor, color: textColor }}>
                                          {trimmed}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 w-20 text-right" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  <button onClick={() => handleToggleFavorite(item.uuid, item.is_favorite)} className="p-1 hover:bg-gray-700 rounded" title={item.is_favorite ? 'Bỏ yêu thích' : 'Yêu thích'}>
                                    {item.is_favorite ? <StarIcon className="w-3.5 h-3.5 text-yellow-400" /> : <StarIcon className="w-3.5 h-3.5 text-gray-500" />}
                                  </button>
                                  <button onClick={(e) => {
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    setEditTagsPos({ top: rect.bottom + 4, left: rect.left - 160 });
                                    setEditTagsTarget(item.uuid);
                                  }} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="Gán nhãn">
                                    🏷️
                                  </button>
                                  <button onClick={(e) => handleMenuClick(e, item.uuid)} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white font-bold leading-none">
                                    ⋮
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <>

              {/* Images */}
              {(initialType === 'image' || initialType === 'all') && (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 mb-4">
                  {items.filter(i => i.type === 'image').map(item => (
                    <div key={item.uuid} id={`lib-item-${item.uuid}`} className="relative group"
                      onPointerDown={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('a, button, [role="button"], input, textarea, select')) return;
                        if (e.button !== 0) return;
                        const idx = items.findIndex(i => i.uuid === item.uuid);
                        dragSelectRef.current = {
                          startUuid: item.uuid,
                          startIdx: idx,
                          hasActivated: false,
                        };
                      }}
                    >
                      {/*** Thumbnail (overflow-hidden removed — dropdowns render here without being clipped) ***/}
                      <div onClick={(e) => {
                          if (Date.now() < clickSuppressUntilRef.current) return;
                          toggleSelect(item.uuid);
                        }}
                        className={`relative aspect-square rounded-xl cursor-pointer border-2 transition-all ${
                          selected.has(item.uuid) ? 'border-blue-primary ring-2 ring-blue-primary/40' : 'border-transparent hover:border-gray-500'
                        }`}>
                        {/*** Chỉ clip riêng ảnh, không clip dropdown ***/}
                        <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                          <ImagePreview item={item} />
                        </div>

                        {/*** Star favorite (top-left) ***/}
                        <div className={`absolute top-1 left-1 z-10 ${!item.is_favorite ? 'opacity-0 group-hover:opacity-100' : ''} transition-opacity`}>
                          <div className="bg-black/50 backdrop-blur-sm rounded-lg p-1 shadow-lg">
                            <button onClick={(e) => { e.stopPropagation(); handleToggleFavorite(item.uuid, item.is_favorite); }}
                              className="text-[11px] leading-none block" title={item.is_favorite ? 'Bỏ yêu thích' : 'Yêu thích'}>
                              {item.is_favorite ? <StarIcon className="w-4 h-4 text-yellow-400" /> : <StarIcon className="w-4 h-4 text-gray-400" />}
                            </button>
                          </div>
                        </div>

                        {/*** Tag assign (below Star) ***/}
                        <div className="absolute top-[30px] left-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="bg-black/50 backdrop-blur-sm rounded-lg p-1 shadow-lg">
                            <button onClick={(e) => {
                              e.stopPropagation();
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setEditTagsPos({ top: rect.bottom + 4, left: rect.left - 160 });
                              setEditTagsTarget(item.uuid);
                            }}
                              className="text-[11px] leading-none block text-gray-300 hover:text-white font-bold" title="Gán nhãn dán">
                              🏷️
                            </button>
                          </div>
                        </div>

                        {/*** ⋮ button (top-right, hover) — menu ở modal level fixed ***/}
                        <div className="absolute top-1 right-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => handleMenuClick(e, item.uuid)}
                            className="bg-black/50 backdrop-blur-sm rounded-lg p-2 shadow-lg text-gray-200 hover:text-white text-sm leading-none">⋮</button>
                        </div>

                        {selected.has(item.uuid) && (
                          <>
                            <div className="absolute bottom-1 right-1 w-6 h-6 bg-blue-primary rounded-full flex items-center justify-center text-white text-xs shadow-lg">✓</div>
                            <div className="absolute inset-0 rounded-xl" style={{ backgroundColor: 'rgba(0, 104, 255, 0.15)' }} />
                          </>
                        )}
                      </div>
                      {/*** File name (rename inline khi editing) ***/}
                      <div className="mt-0.5 px-0.5">
                        {editingName === item.uuid ? (
                          <div className="flex items-center gap-1">
                            <input ref={editInputRef} value={editingValue}
                              onChange={e => setEditingValue(e.target.value)}
                              onBlur={() => submitRename(item.uuid)}
                              onKeyDown={e => { if (e.key === 'Enter') submitRename(item.uuid); if (e.key === 'Escape') setEditingName(null); }}
                              className="flex-1 text-[10px] bg-gray-700 border border-gray-500 rounded px-1 py-0.5 text-gray-200 outline-none"
                            />
                            <button onClick={() => submitRename(item.uuid)}
                              className="text-green-400 hover:text-green-300 text-xs">✓</button>
                          </div>
                        ) : (
                          <>
                            <span className="block text-[10px] text-gray-400 truncate">{item.name}</span>
                            {item.tags && (
                              <div className="flex flex-wrap gap-0.5 mt-0.5 max-h-[28px] overflow-hidden">
                                {item.tags.split(',').map((name: string) => {
                                  const trimmed = name.trim();
                                  if (!trimmed) return null;
                                  const tagObj = tags.find(t => t.name === trimmed);
                                  if (!tagObj) return null; // Ẩn nhãn đã xóa
                                  const bgColor = tagObj.color || '#4b5563';
                                  const textColor = getContrastTextColor(bgColor);
                                  return (
                                    <span key={trimmed} className="px-1 rounded text-[7px] font-medium"
                                      style={{ backgroundColor: bgColor, color: textColor }}>
                                      {trimmed}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                    </div>
                  ))}
                </div>
              )}

              {/* Videos */}
              {(initialType === 'video' || initialType === 'all') && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                  {items.filter(i => i.type === 'video').map(item => (
                    <div key={item.uuid} id={`lib-item-${item.uuid}`} className="relative group"
                      onPointerDown={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('a, button, [role="button"], input, textarea, select')) return;
                        if (e.button !== 0) return;
                        const idx = items.findIndex(i => i.uuid === item.uuid);
                        dragSelectRef.current = {
                          startUuid: item.uuid,
                          startIdx: idx,
                          hasActivated: false,
                        };
                      }}
                    >
                      {/*** Thumbnail (overflow-hidden removed for dropdown) ***/}
                      <div onClick={(e) => {
                          if (Date.now() < clickSuppressUntilRef.current) return;
                          toggleSelect(item.uuid);
                        }}
                        className={`relative aspect-video rounded-xl cursor-pointer border-2 transition-all ${
                          selected.has(item.uuid) ? 'border-blue-primary' : 'border-transparent hover:border-gray-500'
                        }`}>
                        {/*** Clip riêng video icon ***/}
                        <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                          <div className="w-full h-full bg-gray-700 flex items-center justify-center text-3xl">🎬</div>
                        </div>

                        {/*** Star favorite (top-left) ***/}
                        <div className={`absolute top-1 left-1 z-10 ${!item.is_favorite ? 'opacity-0 group-hover:opacity-100' : ''} transition-opacity`}>
                          <div className="bg-black/50 backdrop-blur-sm rounded-lg p-1 shadow-lg">
                            <button onClick={(e) => { e.stopPropagation(); handleToggleFavorite(item.uuid, item.is_favorite); }}
                              className="text-[11px] leading-none block" title={item.is_favorite ? 'Bỏ yêu thích' : 'Yêu thích'}>
                              {item.is_favorite ? <StarIcon className="w-4 h-4 text-yellow-400" /> : <StarIcon className="w-4 h-4 text-gray-400" />}
                            </button>
                          </div>
                        </div>

                        {/*** Tag assign (below Star) ***/}
                        <div className="absolute top-[30px] left-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="bg-black/50 backdrop-blur-sm rounded-lg p-1 shadow-lg">
                            <button onClick={(e) => {
                              e.stopPropagation();
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setEditTagsPos({ top: rect.bottom + 4, left: rect.left - 160 });
                              setEditTagsTarget(item.uuid);
                            }}
                              className="text-[11px] leading-none block text-gray-300 hover:text-white font-bold" title="Gán nhãn dán">
                              🏷️
                            </button>
                          </div>
                        </div>

                        {/*** ⋮ button ***/}
                        <div className="absolute top-1 right-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => handleMenuClick(e, item.uuid)}
                            className="bg-black/50 backdrop-blur-sm rounded-lg p-1 shadow-lg text-gray-200 hover:text-white text-sm leading-none">⋮</button>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 p-1.5 pointer-events-none">
                          {editingName === item.uuid ? (
                            <div className="flex items-center gap-1 w-full pointer-events-auto">
                              <input ref={editInputRef} value={editingValue}
                                onChange={e => setEditingValue(e.target.value)}
                                onBlur={() => submitRename(item.uuid)}
                                onKeyDown={e => { if (e.key === 'Enter') submitRename(item.uuid); if (e.key === 'Escape') setEditingName(null); }}
                                className="flex-1 text-xs bg-gray-900/80 border border-gray-500 rounded px-1 py-0.5 text-gray-200 outline-none"
                              />
                              <button onClick={() => submitRename(item.uuid)}
                                className="text-green-400 hover:text-green-300 text-xs">✓</button>
                            </div>
                          ) : (
                            <div>
                              <span className="block text-xs text-white truncate">{item.name}</span>
                              {item.tags && (
                                <div className="flex flex-wrap gap-0.5 mt-0.5 max-h-[28px] overflow-hidden">
                                  {item.tags.split(',').map((name: string) => {
                                    const trimmed = name.trim();
                                    if (!trimmed) return null;
                                    const tagObj = tags.find(t => t.name === trimmed);
                                    if (!tagObj) return null; // Ẩn nhãn đã xóa
                                    const bgColor = tagObj.color || '#4b5563';
                                    const textColor = getContrastTextColor(bgColor);
                                    return (
                                      <span key={trimmed} className="px-1 rounded text-[7px] font-medium"
                                        style={{ backgroundColor: bgColor, color: textColor }}>
                                        {trimmed}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {selected.has(item.uuid) && (
                          <>
                            <div className="absolute bottom-1 right-1 w-5 h-5 bg-blue-primary rounded-full flex items-center justify-center text-white text-xs shadow-lg">✓</div>
                            <div className="absolute inset-0 rounded-xl" style={{ backgroundColor: 'rgba(0, 104, 255, 0.15)' }} />
                          </>
                        )}
                      </div>

                    </div>
                  ))}
                </div>
              )}

              {/* Audios */}
              {(initialType === 'audio' || initialType === 'all') && (
                <div className="space-y-2 mb-4">
                  {items.filter(i => i.type === 'audio').map(item => (
                    <div key={item.uuid} id={`lib-item-${item.uuid}`} onClick={(e) => {
                        if (Date.now() < clickSuppressUntilRef.current) return;
                        toggleSelect(item.uuid);
                      }}
                      onPointerDown={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('a, button, [role="button"], input, textarea, select')) return;
                        if (e.button !== 0) return;
                        const idx = items.findIndex(i => i.uuid === item.uuid);
                        dragSelectRef.current = {
                          startUuid: item.uuid,
                          startIdx: idx,
                          hasActivated: false,
                        };
                      }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer border transition-all group ${
                        selected.has(item.uuid) ? 'border-blue-primary bg-blue-primary/10' : 'border-gray-700/50 hover:border-gray-500 bg-gray-800/50'
                      }`}>
                      <span className="text-2xl">🎵</span>
                      <div className="flex-1 min-w-0">
                        {editingName === item.uuid ? (
                          <div className="flex items-center gap-1">
                            <input ref={editInputRef} value={editingValue}
                              onChange={e => setEditingValue(e.target.value)}
                              onBlur={() => submitRename(item.uuid)}
                              onKeyDown={e => { if (e.key === 'Enter') submitRename(item.uuid); if (e.key === 'Escape') setEditingName(null); }}
                              className="flex-1 text-sm bg-gray-700 border border-gray-500 rounded px-2 py-1 text-gray-200 outline-none"
                              onClick={e => e.stopPropagation()}
                            />
                            <button onClick={(e) => { e.stopPropagation(); submitRename(item.uuid); }}
                              className="text-green-400 hover:text-green-300 text-sm px-1">✓</button>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm text-gray-200 truncate">{item.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-gray-400">{(item.size / 1024).toFixed(1)} KB</span>
                              {item.tags && (
                                <div className="flex flex-wrap gap-1">
                                  {item.tags.split(',').map((name: string) => {
                                    const trimmed = name.trim();
                                    if (!trimmed) return null;
                                    const tagObj = tags.find(t => t.name === trimmed);
                                    if (!tagObj) return null; // Ẩn nhãn đã xóa
                                    const bgColor = tagObj.color || '#4b5563';
                                    const textColor = getContrastTextColor(bgColor);
                                    return (
                                      <span key={trimmed} className="px-1.5 py-0.5 rounded text-[8px] font-medium"
                                        style={{ backgroundColor: bgColor, color: textColor }}>
                                        {trimmed}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      {/*** Tag & ⋮ Menu buttons ***/}
                      <div className="relative opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                        <button onClick={(e) => {
                          e.stopPropagation();
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setEditTagsPos({ top: rect.bottom + 4, left: rect.left - 160 });
                          setEditTagsTarget(item.uuid);
                        }}
                          className="text-[11px] leading-none text-gray-300 hover:text-white font-bold" title="Gán nhãn">🏷️</button>
                        <button onClick={(e) => handleMenuClick(e, item.uuid)}
                          className="text-gray-300 hover:text-white font-bold text-sm leading-none">⋮</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Files */}
              {(initialType === 'file' || initialType === 'all') && (
                <div className="space-y-2">
                  {items.filter(i => i.type === 'file').map(item => (
                    <div key={item.uuid} id={`lib-item-${item.uuid}`} onClick={(e) => {
                        if (Date.now() < clickSuppressUntilRef.current) return;
                        toggleSelect(item.uuid);
                      }}
                      onPointerDown={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('a, button, [role="button"], input, textarea, select')) return;
                        if (e.button !== 0) return;
                        const idx = items.findIndex(i => i.uuid === item.uuid);
                        dragSelectRef.current = {
                          startUuid: item.uuid,
                          startIdx: idx,
                          hasActivated: false,
                        };
                      }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer border transition-all group ${
                        selected.has(item.uuid) ? 'border-blue-primary bg-blue-primary/10' : 'border-gray-700/50 hover:border-gray-500 bg-gray-800/50'
                      }`}>
                      <span className="text-2xl">{getFileIcon(item.name)}</span>
                      <div className="flex-1 min-w-0">
                        {editingName === item.uuid ? (
                          <div className="flex items-center gap-1">
                            <input ref={editInputRef} value={editingValue}
                              onChange={e => setEditingValue(e.target.value)}
                              onBlur={() => submitRename(item.uuid)}
                              onKeyDown={e => { if (e.key === 'Enter') submitRename(item.uuid); if (e.key === 'Escape') setEditingName(null); }}
                              className="flex-1 text-sm bg-gray-700 border border-gray-500 rounded px-2 py-1 text-gray-200 outline-none"
                              onClick={e => e.stopPropagation()}
                            />
                            <button onClick={(e) => { e.stopPropagation(); submitRename(item.uuid); }}
                              className="text-green-400 hover:text-green-300 text-sm px-1">✓</button>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm text-gray-200 truncate">{item.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-gray-400">{(item.size / 1024).toFixed(1)} KB</span>
                              {item.tags && (
                                <div className="flex flex-wrap gap-1">
                                  {item.tags.split(',').map((name: string) => {
                                    const trimmed = name.trim();
                                    if (!trimmed) return null;
                                    const tagObj = tags.find(t => t.name === trimmed);
                                    if (!tagObj) return null; // Ẩn nhãn đã xóa
                                    const bgColor = tagObj.color || '#4b5563';
                                    const textColor = getContrastTextColor(bgColor);
                                    return (
                                      <span key={trimmed} className="px-1.5 py-0.5 rounded text-[8px] font-medium"
                                        style={{ backgroundColor: bgColor, color: textColor }}>
                                        {trimmed}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      {/*** Tag & ⋮ Menu buttons ***/}
                      <div className="relative opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                        <button onClick={(e) => {
                          e.stopPropagation();
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setEditTagsPos({ top: rect.bottom + 4, left: rect.left - 160 });
                          setEditTagsTarget(item.uuid);
                        }}
                          className="bg-black/40 hover:bg-black/60 rounded-lg px-2 py-1 text-xs text-gray-300 hover:text-white"
                          title="Gán nhãn dán"
                        >🏷️</button>
                        <button onClick={(e) => handleMenuClick(e, item.uuid)}
                          className="bg-black/40 hover:bg-black/60 rounded-lg px-1.5 py-1 text-sm text-gray-300 hover:text-white">⋮</button>
                      </div>
                      {selected.has(item.uuid) && <span className="text-blue-primary ml-1">✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </>)}

              {loading && <div className="flex justify-center py-4 flex-shrink-0"><span className="text-gray-400 animate-pulse">⏳ Đang tải...</span></div>}
              {hasMore && !loading && (
                <button onClick={handleLoadMore} className="w-full py-3 text-sm text-gray-400 hover:text-white transition-colors flex-shrink-0">Tải thêm...</button>
              )}
            </div>
 
            {/* Preview Pane */}
            {(() => {
              const selectedItemUuid = selected.size > 0 ? Array.from(selected)[selected.size - 1] : null;
              const selectedItem = selectedItemUuid ? items.find(i => i.uuid === selectedItemUuid) : null;
              if (!selectedItem) return null;
              
              const fileUrl = selectedItem.fileUrl || (selectedItem._localPath ? 'local-media:///' + selectedItem._localPath.replace(/\\/g, '/').replace(/^\/?[A-Z]:\//, (m: string) => '/' + m[0].toLowerCase() + '/') : '');
              
              return (
                <div className="w-72 border-l border-gray-700/60 bg-gray-900/40 flex flex-col overflow-y-auto p-4 space-y-4 flex-shrink-0 select-none animate-in slide-in-from-right duration-150">
                  <div className="flex items-center justify-between border-b border-gray-700/40 pb-2 flex-shrink-0">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Xem trước</h4>
                    <button onClick={() => setSelected(new Set())} className="text-[10px] text-gray-400 hover:text-gray-250 transition-colors">Bỏ chọn</button>
                  </div>
 
                  <div className="aspect-video w-full bg-gray-950/70 rounded-xl border border-gray-750 flex items-center justify-center relative overflow-hidden shadow-inner flex-shrink-0">
                    {selectedItem.type === 'image' && (
                      <img
                        src={fileUrl}
                        alt={selectedItem.name}
                        className="max-w-full max-h-full object-contain"
                      />
                    )}
                    {selectedItem.type === 'video' && (
                      <video
                        src={fileUrl}
                        controls
                        className="w-full h-full object-contain"
                        preload="metadata"
                      />
                    )}
                    {selectedItem.type !== 'image' && selectedItem.type !== 'video' && (
                      <div className="flex flex-col items-center justify-center p-4">
                        <span className="text-3xl mb-1">{getFileIcon(selectedItem.name)}</span>
                        <span className="text-[9px] text-gray-500 font-bold uppercase">{selectedItem.name.split('.').pop()}</span>
                      </div>
                    )}
                  </div>
 
                  <div className="space-y-2.5 text-xs flex-1">
                    <div>
                      <span className="text-gray-500 block mb-0.5 text-[10px]">Tên tệp</span>
                      <span className="text-gray-200 font-medium break-all select-text leading-relaxed">{selectedItem.name}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-800/50 pt-2">
                      <span className="text-gray-500">Định dạng</span>
                      <span className="text-gray-300 font-semibold uppercase">{selectedItem.name.split('.').pop() || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-800/50 pt-2">
                      <span className="text-gray-500">Dung lượng</span>
                      <span className="text-gray-300 font-semibold">{selectedItem.size ? (selectedItem.size / 1024).toFixed(1) + ' KB' : '-'}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-800/50 pt-2">
                      <span className="text-gray-500">Ngày tạo</span>
                      <span className="text-gray-300 font-medium">
                        {new Date(selectedItem.created_at || Date.now()).toLocaleDateString('vi-VN', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
 
                  <div className="border-t border-gray-800/70 pt-3 flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleToggleFavorite(selectedItem.uuid, selectedItem.is_favorite)}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                        selectedItem.is_favorite
                          ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-450 hover:bg-yellow-500/20'
                          : 'border-gray-700 text-gray-300 hover:bg-gray-750'
                      }`}
                    >
                      <StarIcon className="w-3.5 h-3.5" />
                      {selectedItem.is_favorite ? 'Yêu thích' : 'Yêu thích'}
                    </button>
                    <button
                      onClick={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setEditTagsPos({ top: rect.bottom + 4, left: rect.left - 120 });
                        setEditTagsTarget(selectedItem.uuid);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-750 text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                      title="Gán nhãn"
                    >
                      🏷️ Nhãn
                    </button>
                  </div>
 
                  {selectedItem.tags && (
                    <div className="border-t border-gray-800/70 pt-3 space-y-1 flex-shrink-0">
                      <span className="text-[10px] text-gray-500 font-semibold block uppercase tracking-wider">Nhãn dán</span>
                      <div className="flex flex-wrap gap-1 max-h-[70px] overflow-y-auto">
                        {selectedItem.tags.split(',').map((name: string) => {
                          const trimmed = name.trim();
                          if (!trimmed) return null;
                          const tagObj = tags.find(t => t.name === trimmed);
                          if (!tagObj) return null;
                          const bgColor = tagObj.color || '#4b5563';
                          const textColor = getContrastTextColor(bgColor);
                          return (
                            <span key={trimmed} className="px-2 py-0.5 rounded text-[8px] font-semibold"
                              style={{ backgroundColor: bgColor, color: textColor }}>
                              {trimmed}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

        {/* Bottom bar */}
        <div className="flex items-center gap-3 px-5 py-3 border-t border-gray-700/50">
          <input ref={fileInputRef} type="file" multiple accept={getAcceptType(initialType)} onChange={handleUploadAndSend} className="hidden" />
          <input ref={directInputRef} type="file" multiple accept={getAcceptType(initialType)} onChange={handleDirectFile} className="hidden" />
          
          {/* Button 1: Upload vào Thư viện (Mở dialog chọn file và gán nhãn/thư mục) */}
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-700/80 hover:bg-indigo-600 text-white-important text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
            <SendIcon className="w-4 h-4 inline" /> {uploading ? 'Đang tải...' : 'Upload vào Thư viện'}
          </button>

          {/* Button 2: Từ máy tính (Gửi trực tiếp không lưu thư viện) */}
          {!onSelect && (
            <button onClick={() => directInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-medium rounded-lg transition-colors">
              <MonitorIcon className="w-4 h-4 inline" /> Từ máy tính
            </button>
          )}

          <div className="flex-1" />
          <span className="text-xs text-gray-400">{selectedItems.length} file</span>
          <button onClick={handleSendSelected} disabled={sending || selectedItems.length === 0}
            className={`px-5 py-1.5 text-sm rounded-lg transition-colors ${
              selectedItems.length > 0 && !sending
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed opacity-50'
            }`}>
            {sending ? 'Đang gửi...' : (onSelect ? 'Chọn' : 'Gửi')} {selectedItems.length ? `${selectedItems.length} file` : ''}
          </button>
        </div>

        {/* Floating Action Bar for batch operations */}
        {selected.size > 0 && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-gray-900/95 backdrop-blur border border-gray-700/80 px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-3.5 z-[90] animate-in fade-in slide-in-from-bottom-3 duration-250">
            <span className="text-xs text-gray-300 font-medium select-none">Đang chọn <span className="text-blue-400 font-semibold">{selected.size}</span> file</span>
            <div className="w-[1px] h-4 bg-gray-800" />
            <button onClick={handleSendSelected} disabled={sending}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-full transition-colors flex items-center gap-1 disabled:opacity-50">
              <SendIcon className="w-3 h-3" />
              {sending ? 'Đang gửi...' : (onSelect ? 'Chọn' : 'Gửi')}
            </button>
            <button onClick={handleBatchDeleteSelected}
              className="px-3 py-1 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white text-xs font-semibold rounded-full transition-colors flex items-center gap-1">
              <TrashIcon className="w-3 h-3" />
              Xóa
            </button>
            <button onClick={() => setSelected(new Set())}
              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-300 text-xs font-semibold rounded-full transition-colors">
              Hủy
            </button>
          </div>
        )}
      </div>

      {/*** Dropdown menu — fixed positioning để không bị overflow clipping ***/}
      {(() => {
        const item = menuTarget ? items.find(i => i.uuid === menuTarget) : null;
        if (!item || !menuPos) return null;
        return (
          <>
            <div className="fixed inset-0 z-[99]" onClick={closeMenus} />
            <div className="fixed z-[100] border border-gray-600 rounded-xl shadow-2xl py-1 w-48 animate-scale-up"
              style={{
                backgroundColor: isLightTheme ? '#ffffff' : '#1f2937',
                top: menuPos.top,
                left: menuPos.left
              }} onClick={e => e.stopPropagation()}>
              <button onClick={() => { handleToggleFavorite(item.uuid, item.is_favorite); closeMenus(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 flex items-center gap-2">
                {item.is_favorite ? <><StarIcon className="w-3.5 h-3.5 inline" /> Bỏ yêu thích</> : '☆ Yêu thích'}
              </button>
              <button onClick={() => { setMoveFolderTarget(item.uuid); setFolderPos(menuPos); setMenuTarget(null); setMenuPos(null); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 flex items-center gap-2"><FolderIcon className="w-4 h-4 inline" /> Chuyển đến thư mục →
              </button>
              <button onClick={() => { startRename(item.uuid, item.name); closeMenus(); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 flex items-center gap-2">
                <EditIcon className="w-3.5 h-3.5 inline" /> Đổi tên
              </button>
              <button onClick={() => { setEditTagsTarget(item.uuid); setEditTagsPos(menuPos); setMenuTarget(null); setMenuPos(null); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-700 flex items-center gap-2">
                🏷️ Gán nhãn/thẻ
              </button>
              {item.folder_id !== null && (
                <>
                  <div className="h-px bg-gray-600 mx-2" />
                  <button onClick={() => handleMoveToFolder(item.uuid, null)}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700 flex items-center gap-2"><TrashIcon className="w-4 h-4 inline" /> Bỏ khỏi thư mục
                  </button>
                </>
              )}
              <div className="h-px bg-gray-600 mx-2" />
              <button onClick={() => handleDeleteItem(item.uuid)}
                className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-gray-700 flex items-center gap-2">
                <CloseIcon className="w-4 h-4" /> Xoá
              </button>
            </div>
          </>
        );
      })()}

      {/*** Folder picker dropdown — fixed positioning ***/}
      {(() => {
        const item = moveFolderTarget ? items.find(i => i.uuid === moveFolderTarget) : null;
        if (!item || !folderPos) return null;
        return (
          <>
            <div className="fixed inset-0 z-[99]" onClick={closeMenus} />
            <div className="fixed z-[100] border border-gray-600 rounded-xl shadow-2xl py-1 min-w-[180px] max-h-[260px] overflow-y-auto animate-scale-up"
              style={{
                backgroundColor: isLightTheme ? '#ffffff' : '#1f2937',
                top: folderPos.top,
                left: folderPos.left
              }} onClick={e => e.stopPropagation()}>
              <div className="px-3 py-1.5 text-[10px] text-gray-400 uppercase tracking-wider">Chuyển đến</div>
              {rootFolders.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">Chưa có thư mục</p>
              )}
              {rootFolders.map(f => renderFolderPickerItem(f, item.uuid))}
              {item.folder_id !== null && (
                <><div className="h-px bg-gray-600 mx-2" />
                <button onClick={() => handleMoveToFolder(item.uuid, null)}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700 flex items-center gap-2">✕ Bỏ khỏi thư mục</button></>
              )}
            </div>
          </>
        );
      })()}

      {/*** Tag picker dropdown — fixed positioning ***/(() => {
        const item = editTagsTarget ? items.find(i => i.uuid === editTagsTarget) : null;
        if (!item || !editTagsPos) return null;

        const activeTagNames = new Set((item.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean));

        const handleToggleTag = async (tagId: number, tagName: string) => {
          const currentTagNames = (item.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean);
          const tagNameToIdMap = new Map(tags.map(t => [t.name, t.id]));
          const currentTagIds = currentTagNames.map(name => tagNameToIdMap.get(name)).filter(Boolean) as number[];
          const hasTag = currentTagNames.includes(tagName);
          const newTagIds = hasTag ? currentTagIds.filter(id => id !== tagId) : [...currentTagIds, tagId];
          try {
            const res = await DataAccessor.assignTagsToLibraryItem(item.uuid, newTagIds, zaloId);
            if (res.success) {
              loadItems(page);
            }
          } catch {}
        };

        const handleQuickCreateTag = async () => {
          if (!quickTagName.trim()) return;
          const name = quickTagName.trim();
          const color = getRandomTagColor(name);
          try {
            const res = await DataAccessor.createLibraryTag({ name, zaloId, color });
            if (res.success) {
              await loadTags();
              const result = await DataAccessor.getLibraryTags({ zaloId });
              if (result.success && result.items) {
                const newTag = (result.items || []).find((t: any) => t.name === name);
                if (newTag) {
                  const currentTagNames = (item.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean);
                  const tagNameToIdMap = new Map((result.items || []).map((t: any) => [t.name, t.id]));
                  const currentTagIds = currentTagNames.map(n => tagNameToIdMap.get(n)).filter(Boolean) as number[];
                  const newTagIds = [...currentTagIds, newTag.id];
                  await DataAccessor.assignTagsToLibraryItem(item.uuid, newTagIds, zaloId);
                  loadItems(page);
                }
              }
              setQuickTagName('');
            }
          } catch (err) {
            console.error('Failed to quick create tag:', err);
          }
        };

        return (
          <>
            <div className="fixed inset-0 z-[99]" onClick={closeMenus} />
            <div
              className="fixed z-[100] border border-gray-600 rounded-xl shadow-2xl py-1.5 min-w-[220px] max-h-[320px] overflow-y-auto flex flex-col animate-scale-up"
              style={{
                backgroundColor: isLightTheme ? '#ffffff' : '#1f2937',
                top: editTagsPos.top,
                left: editTagsPos.left
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-3.5 py-1.5 text-[10px] text-gray-400 uppercase tracking-wider flex justify-between items-center">
                <span>Gán nhãn</span>
                <span className="text-[9px] text-gray-500 font-normal">Tự gán khi tạo</span>
              </div>
              <div className="h-px bg-gray-700/50 mb-1" />
              <div className="flex-1 overflow-y-auto max-h-[180px]">
                {tags.length === 0 && <p className="px-3.5 py-2 text-xs text-gray-500 font-normal">Chưa có nhãn</p>}
                {tags.map(tag => {
                  const isActive = activeTagNames.has(tag.name);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(tag.id, tag.name)}
                      className="w-full text-left px-3.5 py-2 text-xs text-gray-300 hover:text-gray-100 hover:bg-gray-700/50 flex items-center gap-2.5 transition-colors"
                    >
                      <span
                        className="w-4 h-4 rounded flex items-center justify-center border text-[10px] font-bold shrink-0 transition-all"
                        style={{
                          backgroundColor: isActive ? tag.color : 'transparent',
                          borderColor: tag.color,
                          color: getContrastTextColor(tag.color)
                        }}
                      >
                        {isActive && '✓'}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-medium"
                        style={{
                          backgroundColor: tag.color || '#0068ff',
                          color: getContrastTextColor(tag.color || '#0068ff')
                        }}
                      >
                        {tag.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="h-px bg-gray-700/50 my-1" />
              <div className="px-2 py-1.5 flex items-center gap-1.5">
                <input
                  value={quickTagName}
                  onChange={e => setQuickTagName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleQuickCreateTag();
                    if (e.key === 'Escape') setQuickTagName('');
                  }}
                  placeholder="Tạo nhanh nhãn..."
                  className="flex-1 px-2.5 py-1 text-[11px] rounded-lg text-gray-100 bg-gray-800 border border-gray-700 placeholder-gray-500 outline-none"
                />
                <button
                  type="button"
                  onClick={handleQuickCreateTag}
                  disabled={!quickTagName.trim()}
                  className="px-2 py-1 text-[10px] font-medium text-white rounded-lg shrink-0 transition-all"
                  style={{ background: '#0068ff', color: '#fff' }}
                >Tạo</button>
              </div>
            </div>
          </>
        );
      })()}

      {/* Upload tagging modal */}
      {showUploadTagModal && pendingFiles && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowUploadTagModal(false)}>
          <div className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-2">🏷️ Gán nhãn dán cho các file tải lên</h3>
            <p className="text-xs text-gray-400 mb-4">Đang chuẩn bị tải lên {pendingFiles.length} file. Chọn hoặc tạo nhãn dán để gán tự động cho các file này:</p>
            
            {/* Tag list checkboxes */}
            <div className="max-h-40 overflow-y-auto border border-gray-700/50 rounded-xl p-2.5 bg-gray-900/40 mb-4 space-y-1.5">
              {tags.map(tag => {
                const isChecked = uploadTagIds.has(tag.id);
                return (
                  <button key={tag.id} type="button"
                    onClick={() => {
                      const next = new Set(uploadTagIds);
                      if (isChecked) next.delete(tag.id);
                      else next.add(tag.id);
                      setUploadTagIds(next);
                    }}
                    className="w-full flex items-center gap-2.5 px-2 py-1 text-xs text-gray-200 hover:bg-gray-750/30 rounded transition-colors text-left"
                  >
                    <span className="w-4 h-4 rounded border border-gray-500 flex items-center justify-center shrink-0"
                      style={{ backgroundColor: isChecked ? tag.color : 'transparent', borderColor: tag.color }}>
                      {isChecked && '✓'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] text-white" style={{ backgroundColor: tag.color }}>
                      {tag.name}
                    </span>
                  </button>
                );
              })}
              {tags.length === 0 && (
                <p className="text-center py-4 text-xs text-gray-500">Chưa có nhãn dán nào</p>
              )}
            </div>

            {/* Create new tag inline */}
            <div className="flex items-center gap-2 mb-5">
              <input value={newTagName} onChange={e => setNewTagName(e.target.value)}
                placeholder="Tên nhãn mới..."
                className="flex-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-xs text-gray-200 placeholder-gray-500 outline-none"
              />
              <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)}
                className="w-7 h-7 border-0 bg-transparent cursor-pointer rounded shrink-0 p-0 outline-none"
              />
              <button type="button" onClick={handleCreateUploadTag} disabled={!newTagName.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors shrink-0">
                Tạo
              </button>
            </div>

            {/* Confirm buttons */}
            <div className="flex justify-end gap-2.5">
              <button type="button" onClick={() => setShowUploadTagModal(false)}
                className="px-4 py-1.5 border border-gray-600 text-gray-300 hover:text-white text-xs rounded-lg transition-colors">
                Hủy
              </button>
              <button type="button" onClick={executeUpload}
                className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors">
                Xác nhận & Tải lên
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────
 
export const checkSuspiciousFiles = (files: FileList | File[]): boolean => {
  const suspicious = Array.from(files).filter(f => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    return ext && ['exe', 'dmg', 'sh', 'bat', 'msi', 'pkg', 'app', 'apk', 'cmd', 'vbs', 'scr', 'com', 'pif', 'gadget', 'wsf'].includes(ext);
  });
  if (suspicious.length > 0) {
    const names = suspicious.map(f => f.name).join(', ');
    return window.confirm(`Cảnh báo: Danh sách tệp tải lên có chứa định dạng tệp lạ/thực thi (${names}). Bạn vẫn muốn tiếp tục?`);
  }
  return true;
};
 
/** Hiển thị ảnh với fallback: thumbUrl → fileUrl (employee) → _localPath (boss) → fileUrl → placeholder */
function ImagePreview({ item }: { item: any }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);

  useEffect(() => {
    let url: string | null = null;

    // Priority 1: thumbUrl (HTTP)
    if (item.thumbUrl) {
      url = item.thumbUrl;
    // Priority 2: _thumbLocalPath (boss local path)
    } else if (item._thumbLocalPath) {
      url = 'local-media:///' + item._thumbLocalPath.replace(/\\/g, '/').replace(/^\/?[A-Z]:\//, (m: string) => '/' + m[0].toLowerCase() + '/');
    // Priority 3: employee HTTP fileUrl  
    } else if (item.fileUrl && item.fileUrl.startsWith('http')) {
      url = item.fileUrl;
    // Priority 4: _localPath (boss local original file)
    } else if (item._localPath) {
      url = 'local-media:///' + item._localPath.replace(/\\/g, '/').replace(/^\/?[A-Z]:\//, (m: string) => '/' + m[0].toLowerCase() + '/');
    // Priority 5: relative fileUrl (last resort)
    } else if (item.fileUrl) {
      url = item.fileUrl;
    }
    setSrc(url);
    setErr(false);
    setTriedFallback(false);
  }, [item.thumbUrl, item._thumbLocalPath, item._localPath, item.fileUrl]);
 
  const ext = (item.name || '').split('.').pop()?.toLowerCase() || '';
  const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);

  const handleError = () => {
    if (!triedFallback) {
      setTriedFallback(true);
      if (item.fileUrl && src !== item.fileUrl) {
        setSrc(item.fileUrl);
        return;
      }
      if (item._localPath) {
        const localUrl = 'local-media:///' + item._localPath.replace(/\\/g, '/').replace(/^\/?[A-Z]:\//, (m: string) => '/' + m[0].toLowerCase() + '/');
        if (src !== localUrl) {
          setSrc(localUrl);
          return;
        }
      }
    }
    setErr(true);
  };

  if (!isImg || !src || err) {
    const isVid = item.type === 'video';
    let icon = getFileIcon(item.name || '');
    if (isVid) icon = '🎬';
    return (
      <div className="w-full h-full bg-gray-150 dark:bg-gray-850/50 flex flex-col items-center justify-center p-1 text-center select-none">
        <span className="text-lg">{icon}</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-150 dark:bg-gray-850/50 flex items-center justify-center">
      <img
        src={src}
        alt={item.name}
        className="max-w-full max-h-full object-contain"
        loading="lazy"
        onError={handleError}
      />
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────

function getAcceptType(type: MediaType): string {
  if (type === "image") return "image/*";
  if (type === "video") return "video/*";
  if (type === "audio") return "audio/*";
  return "*/*";
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return '📄';
  if (['doc', 'docx'].includes(ext)) return '📝';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
  if (['ppt', 'pptx'].includes(ext)) return '📑';
  if (['txt'].includes(ext)) return 'TXT';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'amr'].includes(ext)) return '🎵';
  return '📂';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
