import React, { useState, useMemo, useEffect } from 'react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useAppStore } from '@/store/appStore';
import ipc from '@/lib/ipc';
import LibraryPickerModal from '../chat/library/LibraryPickerModal';

export interface UnifiedMediaPickerProps {
  config: Record<string, any>;
  onChange: (updates: Record<string, any>) => void;
  mediaType?: 'image' | 'video' | 'file' | 'all';
  label?: string;
}

const getSafeFileUrl = (pathStr: string): string => {
  if (!pathStr) return '';
  if (pathStr.startsWith('http://') || pathStr.startsWith('https://') || pathStr.startsWith('data:')) return pathStr;
  if (pathStr.startsWith('file://') || pathStr.startsWith('local-media://')) return pathStr;
  const cleanPath = pathStr.replace(/\\/g, '/').replace(/^\/+/, '');
  return `local-media:///${cleanPath}`;
};

export default function UnifiedMediaPicker({
  config,
  onChange,
  mediaType = 'all',
  label = 'Danh sách phương tiện đính kèm (Ảnh / Video / File)'
}: UnifiedMediaPickerProps) {
  const theme = useAppStore(s => s.theme);
  const isLight = theme === 'light' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  // Detect active workspace mode: Boss (local) vs Employee (remote)
  const activeWs = useWorkspaceStore(s => s.activeWorkspace());
  const isRemote = activeWs?.type === 'remote';

  const [showLibPicker, setShowLibPicker] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Extract paths from config.filePaths, config.attachments, or config.filePath / videoUrl
  const filePathsStr = config.filePaths || config.attachments || '';
  const singlePathStr = config.filePath || config.videoUrl || '';

  const currentPaths = useMemo(() => {
    const list = String(filePathsStr).split('\n').map(p => p.trim()).filter(Boolean);
    if (list.length === 0 && singlePathStr) {
      list.push(String(singlePathStr).trim());
    }
    return Array.from(new Set(list));
  }, [filePathsStr, singlePathStr]);

  const sendMode = config.sendMode || (currentPaths.length > 1 ? 'all' : 'single');

  const updatePathsList = (newList: string[], overrideMode?: string) => {
    const uniqueList = Array.from(new Set(newList));
    const pathsStr = uniqueList.join('\n');
    const firstPath = uniqueList[0] || '';

    let mode = overrideMode || sendMode;
    if (!overrideMode) {
      if (mode === 'random') {
        // Keep random
      } else if (uniqueList.length > 1) {
        mode = 'all';
      } else {
        mode = 'single';
      }
    }

    onChange({
      sendMode: mode,
      filePath: firstPath,
      videoUrl: firstPath,
      filePaths: pathsStr,
      attachments: pathsStr,
    });
  };

  const handleSelectLocalFiles = async () => {
    try {
      let filters: any[] = [{ name: 'All Media', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'pdf', 'docx', 'xlsx'] }];
      if (mediaType === 'image') {
        filters = [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }];
      } else if (mediaType === 'video') {
        filters = [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] }];
      }

      const result = await ipc.file?.openDialog({ filters, multiSelect: true });
      if (result?.success && !result.canceled && result.filePaths?.length) {
        let pickedPaths = result.filePaths;
        // If employee mode (remote workspace), upload local files to Boss server storage
        if (isRemote && ipc.workflow?.uploadMedia) {
          const uploaded = await ipc.workflow.uploadMedia({ filePaths: pickedPaths });
          if (uploaded && uploaded.length > 0) {
            pickedPaths = uploaded.filter(Boolean);
          }
        }
        updatePathsList([...currentPaths, ...pickedPaths]);
      }
    } catch (err) {
      console.warn('[UnifiedMediaPicker] Error selecting files:', err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;

    let paths: string[] = droppedFiles
      .map((f: any) => f.path || f.name)
      .filter(Boolean);

    if (isRemote && ipc.workflow?.uploadMedia && paths.length > 0) {
      try {
        const uploaded = await ipc.workflow.uploadMedia({ filePaths: paths });
        if (uploaded && uploaded.length > 0) {
          paths = uploaded.filter(Boolean);
        }
      } catch (err) {
        console.warn('[UnifiedMediaPicker] Upload error on drag-drop:', err);
      }
    }

    if (paths.length > 0) {
      updatePathsList([...currentPaths, ...paths]);
    }
  };

  const handleRemoveItem = (index: number) => {
    const next = [...currentPaths];
    next.splice(index, 1);
    updatePathsList(next);
  };

  const handleAddUrl = () => {
    const val = urlInput.trim();
    if (val && !currentPaths.includes(val)) {
      updatePathsList([...currentPaths, val]);
      setUrlInput('');
      setShowUrlInput(false);
    }
  };

  const getFileExtension = (pathStr: string) => {
    const clean = pathStr.split('?')[0];
    const ext = clean.split('.').pop()?.toLowerCase() || '';
    return ext;
  };

  const isVideoFile = (pathStr: string) => {
    const ext = getFileExtension(pathStr);
    return ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext);
  };

  const isImageFile = (pathStr: string) => {
    const ext = getFileExtension(pathStr);
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext) || pathStr.startsWith('http');
  };

  return (
    <div className="space-y-3 text-xs">
      {/* Header Label */}
      <div className="flex items-center justify-between">
        <label className={`font-semibold ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
          {label}
        </label>
        {currentPaths.length > 0 && (
          <span className="text-[11px] font-medium text-cyan-500 bg-cyan-500/10 px-2 py-0.5 rounded-full">
            {currentPaths.length} phương tiện
          </span>
        )}
      </div>

      {/* Action Buttons: Boss vs Employee Mode */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Button 1: Từ máy tính (Available for both Boss & Employee) */}
        <button
          type="button"
          onClick={handleSelectLocalFiles}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-medium border transition-all ${
            isLight
              ? 'bg-white hover:bg-gray-50 border-gray-300 text-gray-700 shadow-sm'
              : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-200'
          }`}
        >
          <span>🖥️</span>
          <span>Từ máy tính</span>
        </button>

        {/* Button 2: Từ Thư viện (ONLY FOR EMPLOYEE / REMOTE MODE) */}
        {isRemote ? (
          <button
            type="button"
            onClick={() => setShowLibPicker(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-medium border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 transition-all"
          >
            <span>📂</span>
            <span>Từ Thư viện</span>
          </button>
        ) : (
          /* Option for Boss: Add Direct URL */
          <button
            type="button"
            onClick={() => setShowUrlInput(!showUrlInput)}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-medium border transition-all ${
              isLight
                ? 'bg-gray-100 hover:bg-gray-200 border-gray-300 text-gray-700'
                : 'bg-gray-800/80 hover:bg-gray-700/80 border-gray-700 text-gray-300'
            }`}
          >
            <span>🔗</span>
            <span>{showUrlInput ? 'Ẩn ô nhập URL' : 'Dán đường dẫn URL'}</span>
          </button>
        )}
      </div>

      {/* Direct URL Input Row */}
      {showUrlInput && (
        <div className="flex gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Dán URL hình ảnh/video https://..."
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
              isLight
                ? 'bg-white border-gray-300 text-gray-800'
                : 'bg-gray-900 border-gray-700 text-gray-200'
            }`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddUrl();
              }
            }}
          />
          <button
            type="button"
            onClick={handleAddUrl}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg text-xs transition-colors"
          >
            Thêm
          </button>
        </div>
      )}

      {/* Drag and Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`p-3 rounded-lg border-2 border-dashed text-center transition-all ${
          isDragging
            ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
            : isLight
            ? 'border-gray-300 bg-gray-50/50 text-gray-500 hover:border-gray-400'
            : 'border-gray-700/70 bg-gray-900/40 text-gray-400 hover:border-gray-600'
        }`}
      >
        <p className="text-[11px]">
          📥 <strong>Kéo & thả</strong> tệp ảnh/video trực tiếp từ File Explorer/Finder vào đây (giữ <code>Ctrl</code>/<code>Cmd</code> để chọn nhiều file).
        </p>
      </div>

      {/* Send Mode Switcher (If >= 1 item) */}
      {currentPaths.length > 0 && (
        <div className={`p-2.5 rounded-lg border space-y-2 ${
          isLight ? 'bg-gray-50 border-gray-200' : 'bg-gray-800/50 border-gray-700/70'
        }`}>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[11px] text-gray-400">⚙️ Chế độ đính kèm Media:</span>
            <span className="text-[10px] text-cyan-400 font-medium">
              {sendMode === 'random' ? '🎲 Ngẫu nhiên' : sendMode === 'all' || sendMode === 'multiple' ? '📚 Tất cả' : '📌 1 file'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => updatePathsList(currentPaths, 'single')}
              className={`px-2 py-1.5 rounded text-[11px] font-medium transition-all ${
                sendMode === 'single'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : isLight ? 'bg-white text-gray-600 hover:bg-gray-100' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              📌 1 file
            </button>
            <button
              type="button"
              onClick={() => updatePathsList(currentPaths, 'random')}
              className={`px-2 py-1.5 rounded text-[11px] font-medium transition-all ${
                sendMode === 'random'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : isLight ? 'bg-white text-gray-600 hover:bg-gray-100' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              title="Mỗi lần gửi sẽ lấy ngẫu nhiên 1 file trong danh sách"
            >
              🎲 Ngẫu nhiên
            </button>
            <button
              type="button"
              onClick={() => updatePathsList(currentPaths, 'all')}
              className={`px-2 py-1.5 rounded text-[11px] font-medium transition-all ${
                sendMode === 'all' || sendMode === 'multiple'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isLight ? 'bg-white text-gray-600 hover:bg-gray-100' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              title="Gửi toàn bộ ảnh/video thành 1 Album kèm Caption"
            >
              📚 Tất cả
            </button>
          </div>
        </div>
      )}

      {/* Live Thumbnail Preview Grid */}
      {currentPaths.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-gray-400 font-medium">
            <span>Danh sách media đã chọn ({currentPaths.length}):</span>
            <button
              type="button"
              onClick={() => updatePathsList([])}
              className="text-red-400 hover:text-red-300 transition-colors"
            >
              Xóa tất cả
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1 custom-scrollbar">
            {currentPaths.map((pathItem, idx) => {
              const filename = pathItem.split(/[\/\\]/).pop() || pathItem;
              const isVid = isVideoFile(pathItem);
              const isImg = isImageFile(pathItem);
              const safeUrl = getSafeFileUrl(pathItem);

              return (
                <div
                  key={`${pathItem}-${idx}`}
                  className={`group relative aspect-square rounded-lg border overflow-hidden transition-all ${
                    isLight ? 'bg-gray-100 border-gray-300' : 'bg-gray-900 border-gray-700'
                  }`}
                >
                  {isImg ? (
                    <img
                      src={safeUrl}
                      alt={filename}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback image display
                        (e.target as any).style.opacity = '0.5';
                      }}
                    />
                  ) : isVid ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-cyan-400 p-1">
                      <span className="text-xl">🎥</span>
                      <span className="text-[9px] truncate max-w-full text-gray-300">{filename}</span>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 text-gray-300 p-1">
                      <span className="text-xl">📁</span>
                      <span className="text-[9px] truncate max-w-full">{filename}</span>
                    </div>
                  )}

                  {/* Remove Button Hover Overlay */}
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    className="absolute top-1 right-1 w-5 h-5 bg-red-600/90 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] opacity-80 hover:opacity-100 shadow transition-opacity"
                    title="Xóa phương tiện này"
                  >
                    ✕
                  </button>

                  {/* Filename Footer Badge */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-xs px-1 py-0.5 text-[9px] text-gray-200 truncate">
                    {filename}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Real Shared Media Library Picker Modal (For Employee / Remote Workspace) */}
      {showLibPicker && (
        <LibraryPickerModal
          zaloId=""
          initialType={mediaType === 'image' ? 'image' : mediaType === 'video' ? 'video' : mediaType === 'file' ? 'file' : 'all'}
          onClose={() => setShowLibPicker(false)}
          onSelect={(selectedItems) => {
            const pickedPaths = selectedItems.map(item => item._localPath || item.fileUrl).filter(Boolean);
            if (pickedPaths.length > 0) {
              updatePathsList([...currentPaths, ...pickedPaths]);
            }
            setShowLibPicker(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Media Library Picker Modal Component ──────────────────────────────────
function MediaLibraryPickerModal({
  onClose,
  onSelect
}: {
  onClose: () => void;
  onSelect: (paths: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'product' | 'banner' | 'price'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [libraryFiles, setLibraryFiles] = useState<Array<{ id: string; name: string; url: string; category: string; type: string }>>([]);

  useEffect(() => {
    // Fetch media library items from Boss via IPC or database
    setLoading(true);
    if (ipc.workflow?.getMediaLibrary) {
      ipc.workflow.getMediaLibrary({ search, category: activeTab })
        .then((res: any) => {
          if (res?.files) setLibraryFiles(res.files);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      // Fallback library items
      setLibraryFiles([
        { id: '1', name: 'Banner Khuyến Mãi 2026', url: 'https://zagi.app/assets/banner_promo.png', category: 'banner', type: 'image' },
        { id: '2', name: 'Bảng Giá Mẫu Sản Phẩm VIP', url: 'https://zagi.app/assets/price_list.png', category: 'price', type: 'image' },
        { id: '3', name: 'Video Giới Thiệu Tính Năng Zagi', url: 'https://zagi.app/assets/intro_video.mp4', category: 'product', type: 'video' },
      ]);
      setLoading(false);
    }
  }, [search, activeTab]);

  const toggleSelect = (url: string) => {
    if (selected.includes(url)) {
      setSelected(selected.filter(u => u !== url));
    } else {
      setSelected([...selected, url]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-gray-900 border border-gray-700 text-gray-100 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/80">
          <div className="flex items-center gap-2">
            <span className="text-xl">📂</span>
            <div>
              <h3 className="font-semibold text-sm text-gray-100">Thư Viện Media Boss (Dùng Chung)</h3>
              <p className="text-[11px] text-gray-400">Chọn ảnh/video mẫu đã được Boss đăng tải lên hệ thống</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Search & Tabs */}
        <div className="p-3 border-b border-gray-800 space-y-2 bg-gray-900/50">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Tìm kiếm media theo tên, thẻ tag..."
            className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
          />
          <div className="flex items-center gap-1.5 text-xs">
            {(['all', 'product', 'banner', 'price'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-2.5 py-1 rounded-md capitalize font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {tab === 'all' ? 'Tất cả' : tab === 'product' ? 'Sản phẩm' : tab === 'banner' ? 'Banner' : 'Bảng giá'}
              </button>
            ))}
          </div>
        </div>

        {/* Media Grid */}
        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400 text-xs">
              ⌛ Đang tải dữ liệu media...
            </div>
          ) : libraryFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 text-xs gap-1">
              <span className="text-2xl">🖼️</span>
              <p>Chưa có phương tiện nào trong thư viện</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {libraryFiles.map((item) => {
                const isSelected = selected.includes(item.url);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSelect(item.url)}
                    className={`group relative aspect-video rounded-lg border overflow-hidden cursor-pointer transition-all ${
                      isSelected
                        ? 'border-cyan-500 ring-2 ring-cyan-500/50 bg-cyan-950/20'
                        : 'border-gray-800 hover:border-gray-600 bg-gray-950/40'
                    }`}
                  >
                    {item.type === 'video' ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-cyan-400">
                        <span className="text-2xl">🎥</span>
                        <span className="text-[10px] text-gray-300 truncate max-w-full px-2">{item.name}</span>
                      </div>
                    ) : (
                      <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                    )}

                    {/* Checkbox badge */}
                    <div className={`absolute top-2 right-2 w-5 h-5 rounded-full border flex items-center justify-center text-xs transition-all ${
                      isSelected ? 'bg-cyan-500 border-cyan-400 text-white font-bold' : 'bg-black/50 border-white/60 text-transparent'
                    }`}>
                      ✓
                    </div>

                    <div className="absolute bottom-0 inset-x-0 bg-black/70 backdrop-blur-xs p-1.5 text-[10px] text-gray-200 truncate">
                      {item.name}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 bg-gray-900/90">
          <span className="text-xs text-gray-400 font-medium">
            Đã chọn: <strong className="text-cyan-400">{selected.length}</strong> phương tiện
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={() => onSelect(selected)}
              disabled={selected.length === 0}
              className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:hover:bg-cyan-600 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Xác nhận chọn ({selected.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
