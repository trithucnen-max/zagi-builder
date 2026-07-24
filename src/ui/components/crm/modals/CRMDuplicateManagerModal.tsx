import React, { useState, useEffect } from 'react';
import { ipc } from '../../../lib/ipc';
import { useAppStore } from '../../../store/appStore';
import AppIcon from '../../common/AppIcon';
import { AccountInfo } from '../../../store/accountStore';

interface DuplicateAccountDetail {
    owner_zalo_id: string;
    contact_id: string;
    display_name: string;
    avatar_url: string;
    phone: string;
    alias: string | null;
    is_friend: number;
    contact_type: string;
    tags?: Array<{ id: number; name: string; color?: string; emoji?: string }>;
}

interface DuplicateGroup {
    phone: string;
    contact_id: string;
    name: string;
    account_count: number;
    accounts: DuplicateAccountDetail[];
}

interface Props {
    open: boolean;
    onClose: () => void;
    accounts: AccountInfo[];
    onRefreshCRM?: () => void;
}

export default function CRMDuplicateManagerModal({ open, onClose, accounts, onRefreshCRM }: Props) {
    const { showNotification } = useAppStore();
    const [loading, setLoading] = useState(true);
    const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
    const [isCleaning, setIsCleaning] = useState(false);
    const [processingItem, setProcessingItem] = useState<string | null>(null);

    const fetchDuplicates = async () => {
        setLoading(true);
        try {
            const res = await ipc.crm?.getDuplicateContacts();
            if (res?.success) {
                setDuplicates(res.duplicates || []);
            } else {
                showNotification('Không thể lấy danh sách liên hệ trùng: ' + (res?.error || 'Lỗi không rõ'), 'error');
            }
        } catch (err: any) {
            showNotification('Lỗi: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            fetchDuplicates();
        }
    }, [open]);

    const handleCleanupAliases = async () => {
        setIsCleaning(true);
        try {
            const res = await ipc.crm?.cleanupCorruptedAliases();
            if (res?.success) {
                showNotification(`Đã dọn dẹp ${res.cleanedCount || 0} biệt danh dính chéo thành công!`, 'success');
                fetchDuplicates();
                if (onRefreshCRM) onRefreshCRM();
            } else {
                showNotification('Dọn dẹp thất bại: ' + (res?.error || 'Lỗi không rõ'), 'error');
            }
        } catch (err: any) {
            showNotification('Lỗi: ' + err.message, 'error');
        } finally {
            setIsCleaning(false);
        }
    };

    const handleTransfer = async (contactId: string, phone: string, fromZaloId: string, toZaloId: string) => {
        if (!toZaloId || fromZaloId === toZaloId) return;
        setProcessingItem(`${contactId}-${fromZaloId}`);
        try {
            const res = await ipc.crm?.transferContact({ contactId, phone, fromZaloId, toZaloId });
            if (res?.success) {
                showNotification('Chuyển liên hệ sang tài khoản mới thành công!', 'success');
                fetchDuplicates();
                if (onRefreshCRM) onRefreshCRM();
            } else {
                showNotification('Chuyển liên hệ thất bại: ' + (res?.error || 'Lỗi không rõ'), 'error');
            }
        } catch (err: any) {
            showNotification('Lỗi: ' + err.message, 'error');
        } finally {
            setProcessingItem(null);
        }
    };

    const handleMerge = async (contactId: string, phone: string, targetZaloId: string) => {
        if (!targetZaloId) return;
        setProcessingItem(`merge-${contactId}`);
        try {
            const res = await ipc.crm?.mergeContacts({ targetZaloId, phone, contactId });
            if (res?.success) {
                showNotification('Đã gán và gộp dữ liệu về tài khoản chỉ định thành công!', 'success');
                fetchDuplicates();
                if (onRefreshCRM) onRefreshCRM();
            } else {
                showNotification('Gộp liên hệ thất bại: ' + (res?.error || 'Lỗi không rõ'), 'error');
            }
        } catch (err: any) {
            showNotification('Lỗi: ' + err.message, 'error');
        } finally {
            setProcessingItem(null);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700/80 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col text-gray-900 dark:text-gray-100" style={{ height: '88vh' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-850 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                            <AppIcon name="users" size={18} />
                        </div>
                        <div>
                            <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                                🔍 Rà soát & Quản lý Lọc trùng Liên hệ Đa Tài khoản
                                {duplicates.length > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">
                                        {duplicates.length} trường hợp trùng
                                    </span>
                                )}
                            </h3>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                Khắc phục biệt danh dính chéo, chuyển tài khoản sở hữu hoặc gộp dữ liệu khách hàng trùng lặp
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleCleanupAliases}
                            disabled={isCleaning}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800/60 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                        >
                            ⚡ {isCleaning ? 'Đang dọn dẹp...' : 'Dọn dẹp biệt danh dính chéo'}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200/60 dark:hover:bg-gray-800 transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Content Body */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                            <span className="text-xs font-medium">Đang rà soát danh bạ các tài khoản...</span>
                        </div>
                    ) : duplicates.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400 dark:text-gray-500">
                            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                                ✓
                            </div>
                            <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200">Không tìm thấy liên hệ trùng lặp!</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                                Danh bạ giữa các tài khoản Zalo đã được phân lập hoàn toàn sạch sẽ.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {duplicates.map((group, idx) => (
                                <div key={idx} className="bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/80 rounded-2xl p-4 shadow-2xs space-y-3">
                                    <div className="flex items-center justify-between border-b border-gray-150 dark:border-gray-700/60 pb-2.5">
                                        <div className="flex items-center gap-2.5">
                                            <span className="w-7 h-7 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                                                #{idx + 1}
                                            </span>
                                            <div>
                                                <div className="font-bold text-xs text-gray-900 dark:text-white flex items-center gap-2">
                                                    <span>{group.name || group.phone || group.contact_id}</span>
                                                    {group.phone && (
                                                        <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-750 px-2 py-0.5 rounded-md">
                                                            {group.phone}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                                                    Xuất hiện ở <strong className="text-blue-600 dark:text-blue-400">{group.account_count} tài khoản Zalo</strong>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-1">
                                                <span className="text-[10px] font-semibold text-gray-400">Gộp tất cả về:</span>
                                                <select
                                                    defaultValue=""
                                                    onChange={(e) => {
                                                        if (e.target.value) {
                                                            handleMerge(group.contact_id, group.phone, e.target.value);
                                                            e.target.value = "";
                                                        }
                                                    }}
                                                    disabled={processingItem === `merge-${group.contact_id}`}
                                                    className="bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-xl px-2.5 py-1 focus:outline-none cursor-pointer"
                                                >
                                                    <option value="">-- Chọn TK giữ chính --</option>
                                                    {accounts.map(acc => (
                                                        <option key={acc.zalo_id} value={acc.zalo_id}>
                                                            {acc.full_name || acc.zalo_id}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Accounts Table */}
                                    <div className="grid grid-cols-1 gap-2">
                                        {group.accounts.map((accDetail) => {
                                            const accInfo = accounts.find(a => a.zalo_id === accDetail.owner_zalo_id);
                                            return (
                                                <div key={accDetail.owner_zalo_id} className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-gray-850 border border-gray-200/80 dark:border-gray-750 text-xs">
                                                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                                        {accInfo?.avatar_url ? (
                                                            <img src={accInfo.avatar_url} className="w-6 h-6 rounded-full object-cover" alt="" />
                                                        ) : (
                                                            <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px]">
                                                                {(accInfo?.full_name || accDetail.owner_zalo_id).charAt(0)}
                                                            </div>
                                                        )}
                                                        <div className="truncate">
                                                            <span className="font-bold text-gray-850 dark:text-gray-200 block truncate">
                                                                {accInfo?.full_name || accDetail.owner_zalo_id}
                                                            </span>
                                                            <span className="text-[10px] text-gray-400">
                                                                {accDetail.is_friend ? '🤝 Bạn bè Zalo' : '👤 SĐT Quét / Khách lạ'}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex-1 px-3 truncate">
                                                        <span className="text-[10px] text-gray-400 block font-semibold">Biệt danh CRM:</span>
                                                        <span className="font-medium text-gray-800 dark:text-gray-200 truncate block">
                                                            {accDetail.alias || <span className="text-gray-400 italic text-[11px]">Không có</span>}
                                                        </span>
                                                    </div>

                                                    <div className="flex-1 px-3">
                                                        <span className="text-[10px] text-gray-400 block font-semibold">Nhãn gán:</span>
                                                        {accDetail.tags && accDetail.tags.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1 mt-0.5">
                                                                {accDetail.tags.map(t => (
                                                                    <span
                                                                        key={t.id}
                                                                        className="px-1.5 py-0.5 text-[9px] font-bold rounded"
                                                                        style={{ backgroundColor: `${t.color || '#3B82F6'}20`, color: t.color || '#3B82F6' }}
                                                                    >
                                                                        {t.emoji || '🏷️'} {t.name}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-400 italic text-[10px]">Chưa gán</span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-1">
                                                        <select
                                                            defaultValue=""
                                                            onChange={(e) => {
                                                                if (e.target.value) {
                                                                    handleTransfer(accDetail.contact_id, accDetail.phone, accDetail.owner_zalo_id, e.target.value);
                                                                    e.target.value = "";
                                                                }
                                                            }}
                                                            disabled={processingItem === `${accDetail.contact_id}-${accDetail.owner_zalo_id}`}
                                                            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-[11px] font-medium rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
                                                        >
                                                            <option value="">🔄 Chuyển sang...</option>
                                                            {accounts.filter(a => a.zalo_id !== accDetail.owner_zalo_id).map(a => (
                                                                <option key={a.zalo_id} value={a.zalo_id}>
                                                                    {a.full_name || a.zalo_id}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-850 flex justify-between items-center flex-shrink-0">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        Bấm <strong>Dọn dẹp biệt danh dính chéo</strong> để tự động gỡ các biệt danh nhầm giữa các tài khoản.
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2 rounded-xl text-xs font-bold bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-750 text-gray-800 dark:text-gray-200 transition-colors"
                    >
                        Đóng
                    </button>
                </div>
            </div>
        </div>
    );
}
