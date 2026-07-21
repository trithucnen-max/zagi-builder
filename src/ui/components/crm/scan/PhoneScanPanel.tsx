import React, { useState, useEffect, useCallback, useRef } from 'react';
import ipc from '@/lib/ipc';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore } from '@/store/appStore';
import { useVisibleAccounts } from '@/hooks/useVisibleAccounts';
import { normalizePhone, isValidVietnamPhone } from '@/utils/phoneUtils';
import AppIcon from '../../common/AppIcon';

interface Batch {
    id: number;
    name: string;
    assigned_account_id: string | null;
    auto_tag_ids: string; // JSON array
    daily_limit: number;
    priority: number;
    status: 'active' | 'paused' | 'completed';
    total_count: number;
    scanned_count: number;
    found_count: number;
    not_found_count: number;
    error_count: number;
    duplicate_count: number;
    completed_at: number | null;
    created_at: number;
}

interface ScanItem {
    id: number;
    batch_id: number;
    phone: string;
    phone_normalized: string;
    status: 'pending' | 'scanning' | 'found' | 'not_found' | 'error' | 'duplicate';
    zalo_uid: string | null;
    zalo_name: string | null;
    zalo_avatar: string | null;
    error_msg: string | null;
    scanned_by_account_id: string | null;
    scanned_at: number | null;
    created_at: number;
}

export default function PhoneScanPanel() {
    const { showNotification } = useAppStore();
    const visibleAccounts = useVisibleAccounts();
    const activeAccountId = useAccountStore(s => s.activeAccountId);
    
    // State
    const [batches, setBatches] = useState<Batch[]>([]);
    const [loadingBatches, setLoadingBatches] = useState(true);
    const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
    const [items, setItems] = useState<ScanItem[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [itemsTotal, setItemsTotal] = useState(0);
    const [itemsPage, setItemsPage] = useState(0);
    const [itemsStatusFilter, setItemsStatusFilter] = useState<string>('all');
    const [batchFilterTab, setBatchFilterTab] = useState<'all' | 'active' | 'paused' | 'completed'>('all');
    
    // Creation Form
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [formName, setFormName] = useState('');
    const [formAssignedAccount, setFormAssignedAccount] = useState<string>('');
    const [formDailyLimit, setFormDailyLimit] = useState<number>(100);
    const [formHourlyLimit, setFormHourlyLimit] = useState<number>(30);
    const [formPriority, setFormPriority] = useState<number>(0);
    const [formStatus, setFormStatus] = useState<'paused' | 'active'>('paused');
    const [formScheduledTime, setFormScheduledTime] = useState<string>('');
    const [formSkipCrmExisting, setFormSkipCrmExisting] = useState<boolean>(true);
    const [formAutoWorkflowId, setFormAutoWorkflowId] = useState<string>('');
    const [formPhonesText, setFormPhonesText] = useState('');
    const [formAutoTagIds, setFormAutoTagIds] = useState<number[]>([]);
    const [csvPhones, setCsvPhones] = useState<string[]>([]);
    const [csvFilename, setCsvFilename] = useState('');
    const [availableWorkflows, setAvailableWorkflows] = useState<any[]>([]);
    
    // Inline label creation form state
    const [isCreatingLabel, setIsCreatingLabel] = useState(false);
    const [newLabelName, setNewLabelName] = useState('');
    const [newLabelColor, setNewLabelColor] = useState('#3B82F6');
    const [newLabelEmoji, setNewLabelEmoji] = useState('🏷️');
    
    // Local Labels (Tags)
    const [localLabels, setLocalLabels] = useState<any[]>([]);
    const [limitStatusList, setLimitStatusList] = useState<any[]>([]);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    // Fetch Workflows for dropdown
    const fetchAvailableWorkflows = useCallback(async () => {
        try {
            const res = await ipc.db?.getWorkflows();
            if (res) {
                const list = Array.isArray(res) ? res : (res.workflows || []);
                setAvailableWorkflows(list.filter((w: any) => w.enabled));
            }
        } catch {}
    }, []);

    useEffect(() => {
        fetchAvailableWorkflows();
    }, [fetchAvailableWorkflows]);

    // Fetch batches
    const fetchBatches = useCallback(async () => {
        try {
            const res = await ipc.crm?.getPhoneScanBatches();
            if (res?.success && res.batches) {
                setBatches(res.batches);
            }
        } catch (err: any) {
            console.error('Failed to fetch batches:', err);
        } finally {
            setLoadingBatches(false);
        }
    }, []);

    // Fetch limit status
    const fetchLimitStatus = useCallback(async () => {
        try {
            const res = await ipc.crm?.getPhoneScanLimitStatus();
            if (res?.success && res.accountsStatus) {
                setLimitStatusList(res.accountsStatus);
            }
        } catch (err) {
            console.error('Failed to fetch limit status:', err);
        }
    }, []);

    // Fetch Local Labels
    const fetchLocalLabels = useCallback(async () => {
        try {
            const res = await ipc.db?.getLocalLabels({ zaloId: activeAccountId || undefined });
            if (res) {
                setLocalLabels(res.labels || res || []);
            }
        } catch {}
    }, [activeAccountId]);

    // Fetch items details for selected batch
    const fetchItems = useCallback(async (batchId: number, page: number, status: string) => {
        setLoadingItems(true);
        try {
            const limit = 20;
            const offset = page * limit;
            const res = await ipc.crm?.getPhoneScanItems({ batchId, limit, offset, status });
            if (res?.success && res.items) {
                setItems(res.items);
                setItemsTotal(res.total || 0);
            }
        } catch (err) {
            console.error('Failed to fetch items:', err);
        } finally {
            setLoadingItems(false);
        }
    }, []);

    // Set up polling for progress updates
    useEffect(() => {
        fetchBatches();
        fetchLocalLabels();
        fetchLimitStatus();
        
        pollingTimer.current = setInterval(() => {
            fetchBatches();
            fetchLimitStatus();
        }, 3000); // Poll progress every 3 seconds

        return () => {
            if (pollingTimer.current) clearInterval(pollingTimer.current);
        };
    }, [fetchBatches, fetchLocalLabels, fetchLimitStatus]);

    // Handle batch selection changes (to view details)
    useEffect(() => {
        if (selectedBatch) {
            fetchItems(selectedBatch.id, itemsPage, itemsStatusFilter);
            
            // Refresh detailed items when batch is polled and updated
            const updatedBatch = batches.find(b => b.id === selectedBatch.id);
            if (updatedBatch) {
                setSelectedBatch(updatedBatch);
            }
        }
    }, [selectedBatch, itemsPage, itemsStatusFilter, batches, fetchItems]);

    // Listen to real-time scanning updates
    useEffect(() => {
        const unsub = ipc.on?.('crm:phoneScanUpdate', (data: any) => {
            fetchBatches();
            if (selectedBatch && data.batchId === selectedBatch.id) {
                fetchItems(selectedBatch.id, itemsPage, itemsStatusFilter);
            }
        });
        return () => {
            if (unsub) unsub();
        };
    }, [selectedBatch, itemsPage, itemsStatusFilter, fetchBatches, fetchItems]);

    // Normalize phone numbers using central utility
    const normalizePhoneNumber = (raw: string): string => {
        return normalizePhone(raw);
    };

    // Parse phones from text + csv combined
    const getParsedPhones = (): string[] => {
        const textPhones = formPhonesText
            .split(/[\r\n,;]+/)
            .map(p => p.trim())
            .filter(p => p.length > 0);
        
        const combined = [...textPhones, ...csvPhones];
        const unique = new Set<string>();
        combined.forEach(p => {
            const normalized = normalizePhone(p);
            if (normalized && isValidVietnamPhone(normalized)) {
                unique.add(normalized);
            }
        });
        return Array.from(unique);
    };

    // CSV File Reader
    const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setCsvFilename(file.name);
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
            
            // Try to detect phone numbers
            const parsedPhones: string[] = [];
            lines.forEach(line => {
                // Split by comma/tab/semicolon
                const cols = line.split(/[,\t;]+/).map(c => c.trim().replace(/^"|"$/g, ''));
                // Find column that looks like a valid phone
                for (const col of cols) {
                    if (isValidVietnamPhone(col)) {
                        parsedPhones.push(col);
                        break;
                    }
                }
            });

            if (parsedPhones.length > 0) {
                setCsvPhones(parsedPhones);
                showNotification(`Đọc thành công ${parsedPhones.length} số điện thoại từ file CSV`, 'success');
            } else {
                showNotification('Không tìm thấy cột số điện thoại hợp lệ trong file CSV', 'error');
            }
        };
        reader.readAsText(file);
    };

    // Submit batch creation
    const handleCreateBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const phones = getParsedPhones();
        if (!formName.trim()) {
            showNotification('Vui lòng nhập tên lô quét', 'error');
            return;
        }
        if (phones.length === 0) {
            showNotification('Vui lòng nhập ít nhất 1 số điện thoại hợp lệ', 'error');
            return;
        }

        try {
            const res = await ipc.crm?.createPhoneScanBatch({
                name: formName.trim(),
                assignedAccountId: formAssignedAccount || null,
                autoTagIds: formAutoTagIds,
                dailyLimit: formDailyLimit,
                hourlyLimit: formHourlyLimit,
                priority: formPriority,
                status: formStatus,
                scheduledTime: formScheduledTime,
                skipCrmExisting: formSkipCrmExisting,
                autoWorkflowId: formAutoWorkflowId ? Number(formAutoWorkflowId) : null,
                phones
            });

            if (res?.success) {
                showNotification(formStatus === 'paused' ? 'Đã tạo lô nháp (Tạm dừng) thành công! Bấm nút Bật để bắt đầu quét.' : 'Đã khởi tạo lô quét thành công!', 'success');
                // Reset form
                setFormName('');
                setFormAssignedAccount('');
                setFormDailyLimit(100);
                setFormHourlyLimit(30);
                setFormPriority(0);
                setFormStatus('paused');
                setFormScheduledTime('');
                setFormSkipCrmExisting(true);
                setFormAutoWorkflowId('');
                setFormPhonesText('');
                setFormAutoTagIds([]);
                setCsvPhones([]);
                setCsvFilename('');
                setShowCreateForm(false);
                fetchBatches();
            } else {
                showNotification('Khởi tạo thất bại: ' + (res?.error || 'Lỗi không rõ'), 'error');
            }
        } catch (err: any) {
            showNotification('Lỗi: ' + err.message, 'error');
        }
    };

    // Submit inline label creation
    const handleCreateLabel = async () => {
        if (!newLabelName.trim()) {
            showNotification('Vui lòng nhập tên nhãn', 'error');
            return;
        }

        const targetZaloId = formAssignedAccount || activeAccountId || '';
        if (!targetZaloId) {
            showNotification('Vui lòng chọn tài khoản Zalo để lưu nhãn', 'error');
            return;
        }

        try {
            const res = await ipc.db?.upsertLocalLabel({
                label: {
                    name: newLabelName.trim(),
                    color: newLabelColor,
                    emoji: newLabelEmoji,
                    pageIds: targetZaloId,
                    isActive: 1,
                    sortOrder: 0
                }
            });

            if (res?.success) {
                showNotification('Đã tạo nhãn CRM mới thành công!', 'success');
                await fetchLocalLabels();
                if (res.id) {
                    // Auto-check newly created label
                    setFormAutoTagIds(prev => [...prev, res.id]);
                }
                setNewLabelName('');
                setIsCreatingLabel(false);
            } else {
                showNotification('Tạo nhãn thất bại: ' + (res?.error || 'Lỗi không xác định'), 'error');
            }
        } catch (err: any) {
            showNotification('Lỗi: ' + err.message, 'error');
        }
    };

    // Pause/Resume batch
    const handleToggleStatus = async (batch: Batch) => {
        const nextStatus = batch.status === 'active' ? 'paused' : 'active';
        if (nextStatus === 'active') {
            const confirmed = window.confirm(
                "Bạn muốn tiếp tục chạy lô quét này?\n\n" +
                "⚠️ Lưu ý: Giới hạn số quét ngày và giờ được tính gộp chung cho từng tài khoản Zalo. " +
                "Việc chuyển đổi trạng thái hoặc thay đổi ưu tiên giữa các lô sẽ tiếp tục tính luỹ kế các số Zalo đã tìm thấy trước đó trên tài khoản đó (không reset lại từ đầu)."
            );
            if (!confirmed) return;
        }
        try {
            const res = await ipc.crm?.updatePhoneScanBatchStatus({ batchId: batch.id, status: nextStatus });
            if (res?.success) {
                showNotification(nextStatus === 'active' ? 'Đã kích hoạt quét lại lô' : 'Đã tạm dừng lô quét', 'success');
                fetchBatches();
            }
        } catch (err: any) {
            showNotification('Thao tác thất bại: ' + err.message, 'error');
        }
    };

    // Toggle priority of existing batch
    const handleTogglePriority = async (batch: Batch) => {
        const nextPriority = batch.priority === 1 ? 0 : 1;
        const confirmMsg = nextPriority === 1 
            ? "Bạn muốn ưu tiên quét lô này trước?\n\n" +
              "⚠️ Lưu ý: Giới hạn số quét ngày và giờ được tính gộp chung cho từng tài khoản Zalo. " +
              "Việc chuyển đổi trạng thái hoặc thay đổi ưu tiên giữa các lô sẽ tiếp tục tính luỹ kế các số Zalo đã tìm thấy trước đó trên tài khoản đó (không reset lại từ đầu)."
            : "Bạn muốn tắt chế độ ưu tiên cho lô này?";
        
        const confirmed = window.confirm(confirmMsg);
        if (!confirmed) return;

        try {
            const res = await ipc.crm?.updatePhoneScanBatchPriority({ batchId: batch.id, priority: nextPriority });
            if (res?.success) {
                showNotification(nextPriority === 1 ? 'Đã thiết lập ưu tiên quét lô này' : 'Đã hủy chế độ ưu tiên', 'success');
                fetchBatches();
            }
        } catch (err: any) {
            showNotification('Thay đổi ưu tiên thất bại: ' + err.message, 'error');
        }
    };

    // Delete batch
    const handleDeleteBatch = async (batchId: number) => {
        if (!window.confirm('Bạn có chắc chắn muốn xóa lô quét này và toàn bộ nhật ký số của nó?')) return;
        try {
            const res = await ipc.crm?.deletePhoneScanBatch({ batchId });
            if (res?.success) {
                showNotification('Đã xóa lô quét thành công', 'success');
                if (selectedBatch?.id === batchId) setSelectedBatch(null);
                fetchBatches();
            }
        } catch (err: any) {
            showNotification('Xóa thất bại: ' + err.message, 'error');
        }
    };

    // Trigger scan immediately
    const handleScanNow = async () => {
        try {
            const res = await ipc.crm?.startPhoneScanImmediate();
            if (res?.success) {
                showNotification('Đã chạy kích hoạt quét ngay lập tức!', 'success');
                fetchBatches();
            }
        } catch (err: any) {
            showNotification('Kích hoạt thất bại: ' + err.message, 'error');
        }
    };

    // Export Scan results to CSV file
    const handleExportCSV = async (batch: Batch) => {
        try {
            // Get all items without paging limit
            const res = await ipc.crm?.getPhoneScanItems({ batchId: batch.id, limit: 100000, offset: 0, status: 'all' });
            if (res?.success && res.items) {
                const itemsList: ScanItem[] = res.items;
                let csvContent = '\uFEFF'; // BOM for Excel UTF-8 display
                csvContent += 'Số điện thoại,SĐT chuẩn hóa,Trạng thái,UID Zalo,Tên Zalo,Thời gian quét,Lỗi nếu có\n';
                
                itemsList.forEach(item => {
                    const timeStr = item.scanned_at ? new Date(item.scanned_at).toLocaleString('vi-VN') : '';
                    const statusStr = item.status === 'found' ? 'Tìm thấy Zalo'
                                    : item.status === 'not_found' ? 'Không có Zalo'
                                    : item.status === 'scanning' ? 'Đang quét'
                                    : item.status === 'error' ? 'Lỗi'
                                    : item.status === 'duplicate' ? 'Trùng'
                                    : 'Chờ quét';
                                    
                    const row = [
                        item.phone,
                        item.phone_normalized,
                        statusStr,
                        item.zalo_uid || '',
                        `"${(item.zalo_name || '').replace(/"/g, '""')}"`,
                        timeStr,
                        `"${(item.error_msg || '').replace(/"/g, '""')}"`
                    ];
                    csvContent += row.join(',') + '\n';
                });

                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', `ket_qua_quet_${batch.name.replace(/[\s/\\?%*:|"<>]/g, '_')}_${batch.id}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showNotification('Đã xuất báo cáo CSV thành công!', 'success');
            }
        } catch (err: any) {
            showNotification('Xuất CSV thất bại: ' + err.message, 'error');
        }
    };

    // Multi-tag selecting helper
    const handleToggleTag = (tagId: number) => {
        if (formAutoTagIds.includes(tagId)) {
            setFormAutoTagIds(formAutoTagIds.filter(id => id !== tagId));
        } else {
            setFormAutoTagIds([...formAutoTagIds, tagId]);
        }
    };

    // Helpers to render status badges
    const getStatusBadge = (status: string) => {
        const configs: Record<string, { label: string; cls: string }> = {
            pending: { label: 'Chờ quét', cls: 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400' },
            scanning: { label: 'Đang quét', cls: 'bg-blue-50 dark:bg-blue-900/35 border-blue-200 dark:border-blue-800/50 text-blue-600 dark:text-blue-400 animate-pulse' },
            found: { label: 'Tìm thấy', cls: 'bg-emerald-50 dark:bg-emerald-955/40 border-emerald-200 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400' },
            not_found: { label: 'Không Zalo', cls: 'bg-amber-50 dark:bg-amber-955/40 border-amber-200 dark:border-amber-800/40 text-amber-600 dark:text-amber-400' },
            error: { label: 'Lỗi', cls: 'bg-rose-50 dark:bg-rose-955/40 border-rose-200 dark:border-rose-800/40 text-rose-600 dark:text-rose-400' },
            duplicate: { label: 'Trùng lặp', cls: 'bg-purple-50 dark:bg-purple-955/40 border-purple-200 dark:border-purple-800/40 text-purple-600 dark:text-purple-400' },
        };
        const conf = configs[status] || configs.pending;
        return (
            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${conf.cls}`}>
                {conf.label}
            </span>
        );
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
            {/* Header / Top Dashboard Stats */}
            <div className="bg-white dark:bg-gray-850 border-b border-gray-200 dark:border-gray-800 p-5 flex-shrink-0">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <AppIcon name="phone" className="text-blue-500" size={16} />
                            Quét số điện thoại Zalo hàng loạt
                        </h2>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                            Quét danh sách số điện thoại số lượng lớn, tự động nhận diện và gán nhãn CRM định kỳ hàng ngày.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleScanNow}
                            title="Buộc quét ngay các số đang chờ, không đợi đến lượt Scheduler kế tiếp"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-gray-800 border border-gray-350 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                        >
                            <AppIcon name="sync" size={13} />
                            Quét ngay lập tức
                        </button>
                        <button
                            onClick={() => setShowCreateForm(true)}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-colors"
                        >
                            <AppIcon name="plus" size={14} />
                            Tạo lô quét mới
                        </button>
                    </div>
                </div>

                {/* Overall Stats Cards */}
                <div className="grid grid-cols-5 gap-4">
                    {(() => {
                        const totals = batches.reduce(
                            (acc, b) => {
                                acc.total += b.total_count;
                                acc.scanned += b.scanned_count;
                                acc.found += b.found_count;
                                acc.notFound += b.not_found_count;
                                acc.error += b.error_count;
                                return acc;
                            },
                            { total: 0, scanned: 0, found: 0, notFound: 0, error: 0 }
                        );
                        const progress = totals.total > 0 ? Math.round((totals.scanned / totals.total) * 100) : 0;
                        return (
                            <>
                                <div className="bg-gray-100/50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl p-4 flex flex-col justify-between">
                                    <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tổng SĐT tải lên</span>
                                    <span className="text-xl font-bold text-gray-900 dark:text-white mt-1">{totals.total.toLocaleString()}</span>
                                </div>
                                <div className="bg-gray-100/50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl p-4 flex flex-col justify-between">
                                    <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Đã quét</span>
                                    <div className="flex items-baseline justify-between mt-1">
                                        <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{totals.scanned.toLocaleString()}</span>
                                        <span className="text-[10px] text-gray-500 dark:text-gray-400">({progress}%)</span>
                                    </div>
                                </div>
                                <div className="bg-gray-100/50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl p-4 flex flex-col justify-between">
                                    <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Có Zalo (found)</span>
                                    <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{totals.found.toLocaleString()}</span>
                                </div>
                                <div className="bg-gray-100/50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl p-4 flex flex-col justify-between">
                                    <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Không có Zalo</span>
                                    <span className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{totals.notFound.toLocaleString()}</span>
                                </div>
                                <div className="bg-gray-100/50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-xl p-4 flex flex-col justify-between">
                                    <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Số lượng còn lại</span>
                                    <span className="text-xl font-bold text-gray-700 dark:text-gray-300 mt-1">{(totals.total - totals.scanned).toLocaleString()}</span>
                                </div>
                            </>
                        );
                    })()}
                </div>
            </div>

            {/* Limit warning banners if any active account is waiting/rate-limited */}
            {limitStatusList.some(acc => acc.hourlyCount >= 30 || acc.todayCount >= 100) && (
                <div className="mx-5 mt-4 p-3 bg-amber-50 dark:bg-amber-955/30 border border-amber-200 dark:border-amber-900/40 rounded-xl flex flex-col gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                    {limitStatusList.map(acc => {
                        const isHourlyLimited = acc.hourlyCount >= 30;
                        const isDailyLimited = acc.todayCount >= 100;
                        if (isHourlyLimited || isDailyLimited) {
                            return (
                                <div key={acc.zaloId} className="flex items-start gap-2">
                                    <svg className="animate-pulse w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                    </svg>
                                    <div>
                                        <span className="font-bold">Tài khoản Zalo [{acc.fullName}] đang tạm dừng chờ:</span>{' '}
                                        {isHourlyLimited && `Đã quét đủ 30 số trong 1 tiếng qua. `}
                                        {isDailyLimited && `Đã quét đủ 100 số trong ngày hôm nay. `}
                                        Tiến trình quét tự động tạm dừng và sẽ tự động tiếp tục khi hết thời gian giới hạn.
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })}
                </div>
            )}

            {/* Main Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left panel: List of batches */}
                <div className={`flex-shrink-0 border-r border-gray-200 dark:border-gray-800 overflow-y-auto p-5 transition-all duration-300 ${selectedBatch ? 'w-2/5' : 'w-full'}`}>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                            <AppIcon name="layers" size={14} className="text-gray-400" />
                            Danh sách các lô quét
                        </h3>
                        {/* Status Filter Tabs */}
                        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700">
                            {[
                                { key: 'all', label: 'Tất cả' },
                                { key: 'active', label: '▶️ Đang chạy' },
                                { key: 'paused', label: '⏸️ Tạm dừng' },
                                { key: 'completed', label: '✓ Hoàn thành' }
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setBatchFilterTab(tab.key as any)}
                                    className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-colors ${
                                        batchFilterTab === tab.key
                                            ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {loadingBatches && batches.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                            <span>Đang tải thông tin...</span>
                        </div>
                    ) : batches.filter(b => batchFilterTab === 'all' ? true : b.status === batchFilterTab).length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900/30">
                            <span className="text-gray-400 dark:text-gray-500 text-xs">Không có lô quét nào phù hợp bộ lọc.</span>
                            <button
                                onClick={() => setShowCreateForm(true)}
                                className="mt-4 px-4 py-1.5 bg-blue-50 dark:bg-blue-600/25 border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-600/40 text-xs font-semibold rounded-lg transition-colors"
                            >
                                Tạo lô quét mới
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {batches.filter(b => batchFilterTab === 'all' ? true : b.status === batchFilterTab).map(batch => {
                                const progress = batch.total_count > 0 ? Math.round((batch.scanned_count / batch.total_count) * 100) : 0;
                                const conversionRate = batch.scanned_count > 0 ? Math.round((batch.found_count / batch.scanned_count) * 100) : 0;
                                const isSelected = selectedBatch?.id === batch.id;
                                
                                return (
                                    <div
                                        key={batch.id}
                                        onClick={() => setSelectedBatch(batch)}
                                        className={`p-4 rounded-xl border transition-all cursor-pointer ${
                                            isSelected
                                                ? 'bg-white dark:bg-gray-800 border-blue-500 shadow-md'
                                                : batch.status === 'active'
                                                    ? 'bg-blue-50/20 dark:bg-blue-955/10 border-blue-200 dark:border-blue-900/40 hover:border-blue-400'
                                                    : 'bg-white dark:bg-gray-855/60 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700/80 hover:bg-gray-50 dark:hover:bg-gray-855'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-900 dark:text-white text-xs">{batch.name}</span>
                                                    {batch.status === 'active' ? (
                                                        <span className="px-2 py-0.5 text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 rounded-full animate-pulse">
                                                            ▶️ Đang chạy (#1)
                                                        </span>
                                                    ) : batch.status === 'completed' ? (
                                                        <span className="px-2 py-0.5 text-[9px] font-bold bg-blue-100 dark:bg-blue-950/80 border border-blue-300 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 rounded-full">
                                                            ✓ Hoàn thành
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 text-[9px] font-bold bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 rounded-full">
                                                            ⏸️ Tạm dừng (Nháp)
                                                        </span>
                                                    )}
                                                    {batch.priority === 1 && (
                                                        <span className="px-1.5 py-0.5 text-[8px] font-bold bg-rose-50 dark:bg-rose-955/80 border border-rose-200 dark:border-rose-800/40 text-rose-600 dark:text-rose-400 rounded">
                                                            Ưu tiên
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-2.5 mt-1.5">
                                                    <span>Tổng: <strong className="text-gray-800 dark:text-gray-200">{batch.total_count}</strong></span>
                                                    <span>•</span>
                                                    <span>Có Zalo: <strong className="text-emerald-600 dark:text-emerald-400">{batch.found_count}</strong></span>
                                                    <span>•</span>
                                                    <span className="text-blue-600 dark:text-blue-400 font-semibold">Tỷ lệ Zalo: {conversionRate}%</span>
                                                </div>
                                            </div>

                                            {/* Action icons */}
                                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleTogglePriority(batch)}
                                                    className={`p-1.5 rounded-lg border transition-colors ${
                                                        batch.priority === 1
                                                            ? 'bg-amber-50 dark:bg-amber-955/20 border-amber-200 dark:border-amber-900/40 text-amber-500 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-955/45'
                                                            : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-500 hover:bg-gray-105 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                                    }`}
                                                    title={batch.priority === 1 ? 'Tắt ưu tiên' : 'Ưu tiên quét trước'}
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill={batch.priority === 1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => handleToggleStatus(batch)}
                                                    disabled={batch.status === 'completed'}
                                                    className={`px-2 py-1 rounded-lg border font-semibold text-xs transition-colors flex items-center gap-1 ${
                                                        batch.status === 'active'
                                                            ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
                                                            : batch.status === 'completed'
                                                                ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                                                : 'bg-blue-600 text-white border-blue-500 hover:bg-blue-500'
                                                    }`}
                                                    title={batch.status === 'active' ? 'Tạm dừng lô (Pause)' : 'Bật lô quét (Nổi lên đầu & Quét ngay)'}
                                                >
                                                    <AppIcon name={batch.status === 'active' ? 'pause' : 'play'} size={12} />
                                                    <span>{batch.status === 'active' ? 'Tắt' : 'Bật'}</span>
                                                </button>
                                                <button
                                                    onClick={() => handleExportCSV(batch)}
                                                    className="p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
                                                    title="Xuất báo cáo kết quả (CSV)"
                                                >
                                                    <AppIcon name="download" size={12} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteBatch(batch.id)}
                                                    className="p-1.5 rounded-lg bg-rose-50 dark:bg-red-955/20 border border-rose-200 dark:border-red-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-red-955/45 transition-colors"
                                                    title="Xóa lô quét"
                                                >
                                                    <AppIcon name="trash" size={12} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Progress Bar & Zalo conversion indicator */}
                                        <div className="mt-3">
                                            <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                                                <span>Tiến độ: {batch.scanned_count}/{batch.total_count} số</span>
                                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Tỷ lệ Zalo Active: {conversionRate}%</span>
                                            </div>
                                            <div className="w-full bg-gray-100 dark:bg-gray-850 rounded-full h-1.5 overflow-hidden flex">
                                                <div
                                                    className="h-full bg-emerald-500 transition-all duration-500"
                                                    style={{ width: `${batch.total_count > 0 ? (batch.found_count / batch.total_count) * 100 : 0}%` }}
                                                    title={`Có Zalo: ${batch.found_count}`}
                                                />
                                                <div
                                                    className="h-full bg-amber-500 transition-all duration-500"
                                                    style={{ width: `${batch.total_count > 0 ? (batch.not_found_count / batch.total_count) * 100 : 0}%` }}
                                                    title={`Không Zalo: ${batch.not_found_count}`}
                                                />
                                                <div
                                                    className="h-full bg-rose-500 transition-all duration-500"
                                                    style={{ width: `${batch.total_count > 0 ? (batch.error_count / batch.total_count) * 100 : 0}%` }}
                                                    title={`Lỗi: ${batch.error_count}`}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right panel: Details of selected batch */}
                {selectedBatch && (
                    <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 overflow-hidden">
                        <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-855/40 flex-shrink-0">
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-white text-xs">
                                    Chi tiết Lô quét: {selectedBatch.name}
                                </h3>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                    Mã số: #{selectedBatch.id} | Giới hạn quét ngày: {selectedBatch.daily_limit} số
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedBatch(null)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                                <AppIcon name="x" size={14} />
                            </button>
                        </div>

                        {/* Status Tabs inside detail */}
                        <div className="px-5 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex gap-2 flex-shrink-0">
                            {[
                                { key: 'all', label: 'Tất cả' },
                                { key: 'pending', label: 'Chờ quét' },
                                { key: 'scanning', label: 'Đang quét' },
                                { key: 'found', label: 'Tìm thấy' },
                                { key: 'not_found', label: 'Không Zalo' },
                                { key: 'error', label: 'Lỗi' }
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => {
                                        setItemsStatusFilter(tab.key);
                                        setItemsPage(0);
                                    }}
                                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                                        itemsStatusFilter === tab.key
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-850 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Items Table list */}
                        <div className="flex-1 overflow-y-auto p-5">
                            {loadingItems && items.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                                    <span>Đang tải thông tin...</span>
                                </div>
                            ) : items.length === 0 ? (
                                <div className="text-center py-20 text-gray-400 dark:text-gray-500 text-xs">
                                    Không tìm thấy số điện thoại nào phù hợp bộ lọc.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="border-b border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-500">
                                                <th className="py-2.5 px-3 font-semibold">Số điện thoại</th>
                                                <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
                                                <th className="py-2.5 px-3 font-semibold">Zalo profile</th>
                                                <th className="py-2.5 px-3 font-semibold">Thời gian</th>
                                                <th className="py-2.5 px-3 font-semibold">Ghi chú lỗi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map(item => (
                                                <tr key={item.id} className="border-b border-gray-150 dark:border-gray-850 hover:bg-gray-100/40 dark:hover:bg-gray-850/30 transition-colors">
                                                    <td className="py-3 px-3 font-mono font-medium text-gray-700 dark:text-gray-300">{item.phone}</td>
                                                    <td className="py-3 px-3">{getStatusBadge(item.status)}</td>
                                                    <td className="py-3 px-3">
                                                        {item.status === 'found' && item.zalo_uid ? (
                                                            <div className="flex items-center gap-2">
                                                                {item.zalo_avatar ? (
                                                                    <img src={item.zalo_avatar} alt="Avatar" className="w-5 h-5 rounded-full object-cover" />
                                                                ) : (
                                                                    <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
                                                                        {item.zalo_name?.charAt(0).toUpperCase()}
                                                                    </div>
                                                                )}
                                                                <span className="text-gray-900 dark:text-white font-medium max-w-[150px] truncate" title={item.zalo_name || ''}>
                                                                    {item.zalo_name}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-400 dark:text-gray-600">-</span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-3 text-gray-500 dark:text-gray-400 text-[10px]">
                                                        {item.scanned_at ? new Date(item.scanned_at).toLocaleString('vi-VN') : '-'}
                                                    </td>
                                                    <td className="py-3 px-3 text-rose-500 dark:text-rose-400 max-w-[150px] truncate" title={item.error_msg || ''}>
                                                        {item.error_msg || '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Paging Footer inside detail */}
                        {itemsTotal > 20 && (
                            <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-850/40 flex items-center justify-between flex-shrink-0">
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    Hiển thị {itemsPage * 20 + 1} - {Math.min((itemsPage + 1) * 20, itemsTotal)} trong số {itemsTotal}
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        disabled={itemsPage === 0}
                                        onClick={() => setItemsPage(itemsPage - 1)}
                                        className="p-1 px-2 text-xs font-semibold rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        Trước
                                    </button>
                                    <button
                                        disabled={(itemsPage + 1) * 20 >= itemsTotal}
                                        onClick={() => setItemsPage(itemsPage + 1)}
                                        className="p-1 px-2 text-xs font-semibold rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        Tiếp theo
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* MODAL: Create New Batch Form (Redesigned matching Image 3 style) */}
            {showCreateForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div
                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl w-full max-w-[960px] shadow-2xl flex flex-col text-gray-900 dark:text-gray-100"
                        style={{ height: 'min(92vh, 41rem)' }}
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-850">
                            <div className="flex items-center gap-4 flex-1">
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                                    Khởi tạo lô quét SĐT Zalo mới
                                </span>
                                <span className="text-[11px] text-amber-600 dark:text-amber-500 font-medium truncate hidden md:inline-block">
                                    ⚠️ Tránh quét dồn dập nhiều số điện thoại cùng lúc để hạn chế bị khóa tài khoản.
                                </span>
                            </div>
                            <button
                                onClick={() => setShowCreateForm(false)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-750 transition-colors"
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>

                        {/* Modal Body: 2-column layout just like Image 3 */}
                        <form onSubmit={handleCreateBatch} className="flex-1 min-h-0 flex flex-col justify-between">
                            <div className="flex-1 min-h-0 flex overflow-hidden">
                                {/* LEFT COLUMN: Configuration */}
                                <div className="w-1/2 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-y-auto p-5 gap-4 bg-gray-50 dark:bg-gray-850">
                                    {/* Batch Name */}
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Tên lô quét *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formName}
                                            onChange={e => setFormName(e.target.value)}
                                            placeholder="VD: Lô khách hàng VIP Tháng 7..."
                                            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors font-medium"
                                        />
                                    </div>

                                    {/* Assigned Account & Limits */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Tài khoản Zalo quét</label>
                                            <select
                                                value={formAssignedAccount}
                                                onChange={e => setFormAssignedAccount(e.target.value)}
                                                className="w-full bg-white dark:bg-gray-905 border border-gray-305 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 transition-colors font-medium"
                                            >
                                                <option value="">-- Tự động chia --</option>
                                                {visibleAccounts.filter(acc => !acc.channel || acc.channel === 'zalo').map(acc => (
                                                    <option key={acc.zalo_id} value={acc.zalo_id}>
                                                        {acc.full_name || acc.zalo_id}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Quét / ngày</label>
                                            <input
                                                type="number"
                                                required
                                                min={10}
                                                max={1000}
                                                value={formDailyLimit}
                                                onChange={e => setFormDailyLimit(Number(e.target.value))}
                                                className="w-full bg-white dark:bg-gray-905 border border-gray-305 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 transition-colors font-medium"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Quét / giờ</label>
                                            <input
                                                type="number"
                                                required
                                                min={5}
                                                max={200}
                                                value={formHourlyLimit}
                                                onChange={e => setFormHourlyLimit(Number(e.target.value))}
                                                className="w-full bg-white dark:bg-gray-905 border border-gray-305 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 transition-colors font-medium"
                                            />
                                        </div>
                                    </div>

                                    {/* Initial Status & Scheduled Start Time */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Trạng thái khởi tạo</label>
                                            <div className="flex gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setFormStatus('paused')}
                                                    className={`flex-1 py-1.5 px-2 border rounded-lg text-xs font-semibold transition-all ${
                                                        formStatus === 'paused'
                                                            ? 'bg-amber-50 dark:bg-amber-955/40 border-amber-500 text-amber-700 dark:text-amber-300 shadow-sm'
                                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                                                    }`}
                                                >
                                                    ⏸️ Tạm dừng
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormStatus('active')}
                                                    className={`flex-1 py-1.5 px-2 border rounded-lg text-xs font-semibold transition-all ${
                                                        formStatus === 'active'
                                                            ? 'bg-blue-50 dark:bg-blue-955/40 border-blue-500 text-blue-600 dark:text-blue-400 shadow-sm'
                                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                                                    }`}
                                                >
                                                    ▶️ Chạy ngay
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Hẹn giờ khởi động (Tùy chọn)</label>
                                            <input
                                                type="time"
                                                value={formScheduledTime}
                                                onChange={e => setFormScheduledTime(e.target.value)}
                                                className="w-full bg-white dark:bg-gray-905 border border-gray-305 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 transition-colors font-medium"
                                            />
                                        </div>
                                    </div>

                                    {/* Skip CRM Existing Option */}
                                    <div className="flex items-center gap-2 p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
                                        <input
                                            type="checkbox"
                                            id="skipCrmExisting"
                                            checked={formSkipCrmExisting}
                                            onChange={e => setFormSkipCrmExisting(e.target.checked)}
                                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                        />
                                        <label htmlFor="skipCrmExisting" className="text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                                            Bỏ qua các SĐT đã tồn tại trong danh bạ CRM (Tiết kiệm hạn ngạch quét)
                                        </label>
                                    </div>

                                    {/* Auto Trigger Workflow Selection */}
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Kích hoạt Workflow tự động (khi tìm thấy Zalo)</label>
                                        <select
                                            value={formAutoWorkflowId}
                                            onChange={e => setFormAutoWorkflowId(e.target.value)}
                                            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 transition-colors font-medium"
                                        >
                                            <option value="">-- Không tự động chạy kịch bản --</option>
                                            {availableWorkflows.map((wf: any) => (
                                                <option key={wf.id} value={wf.id}>
                                                    ⚡ {wf.name} ({wf.channel === 'zalo' ? 'Zalo' : 'Facebook'})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Priority Selection: styled matching image 3 pill choice */}
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Mức độ ưu tiên của lô</label>
                                        <div className="flex gap-2">
                                            {[
                                                { key: 0, label: 'Bình thường' },
                                                { key: 1, label: 'Ưu tiên quét trước' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.key}
                                                    type="button"
                                                    onClick={() => setFormPriority(opt.key)}
                                                    className={`px-4 py-2 border rounded-xl text-xs font-semibold transition-all ${
                                                        formPriority === opt.key
                                                            ? 'bg-blue-50 dark:bg-blue-900/35 border-blue-500 text-blue-600 dark:text-blue-400 shadow-sm'
                                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Tag Selection */}
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block">Nhãn tự động gán (khi tìm thấy Zalo)</label>
                                            <button
                                                type="button"
                                                onClick={() => setIsCreatingLabel(!isCreatingLabel)}
                                                className="text-[10px] font-semibold text-blue-600 hover:text-blue-500 flex items-center gap-1"
                                            >
                                                <AppIcon name="plus" size={10} />
                                                Tạo nhãn mới
                                            </button>
                                        </div>

                                        {/* Inline label creation form */}
                                        {isCreatingLabel && (
                                            <div className="mb-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2.5">
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={newLabelName}
                                                        onChange={e => setNewLabelName(e.target.value)}
                                                        placeholder="Nhập tên nhãn..."
                                                        className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 font-medium"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={newLabelEmoji}
                                                        onChange={e => setNewLabelEmoji(e.target.value)}
                                                        placeholder="Icon (🏷️)"
                                                        className="w-16 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-center text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 font-medium"
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex gap-1.5">
                                                        {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6'].map(c => (
                                                            <button
                                                                key={c}
                                                                type="button"
                                                                onClick={() => setNewLabelColor(c)}
                                                                className={`w-4 h-4 rounded-full border transition-all ${
                                                                    newLabelColor === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'border-transparent'
                                                                }`}
                                                                style={{ backgroundColor: c }}
                                                            />
                                                        ))}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsCreatingLabel(false)}
                                                            className="px-2.5 py-1 text-[10px] font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-650 dark:text-gray-400 rounded-md transition-colors"
                                                        >
                                                            Hủy
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={handleCreateLabel}
                                                            className="px-3 py-1 text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
                                                        >
                                                            Lưu nhãn
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {localLabels.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic">Chưa có nhãn CRM nào được tạo. Nhấn nút tạo nhãn phía trên để tạo nhãn mới.</p>
                                        ) : (
                                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg">
                                                {localLabels.map(label => {
                                                    const isChecked = formAutoTagIds.includes(label.id);
                                                    return (
                                                        <button
                                                            key={label.id}
                                                            type="button"
                                                            onClick={() => handleToggleTag(label.id)}
                                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border transition-all ${
                                                                isChecked
                                                                    ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                                                                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300'
                                                            }`}
                                                            style={{ borderLeftColor: label.color, borderLeftWidth: '3px' }}
                                                        >
                                                            <span>{label.emoji}</span>
                                                            <span>{label.name}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* RIGHT COLUMN: CSV Upload + Paste text area */}
                                <div className="w-1/2 flex-shrink-0 p-5 overflow-hidden flex flex-col gap-4 bg-white dark:bg-gray-800">
                                    {/* File CSV select */}
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Tải lên tệp CSV số điện thoại</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                accept=".csv"
                                                onChange={handleCsvUpload}
                                                className="hidden"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 transition-colors"
                                            >
                                                <AppIcon name="download" size={13} className="transform rotate-180" />
                                                Chọn file CSV...
                                            </button>
                                            {csvFilename && (
                                                <span className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-755 truncate max-w-[200px]">
                                                    {csvFilename} ({csvPhones.length} số)
                                                    <button
                                                        type="button"
                                                        onClick={() => { setCsvPhones([]); setCsvFilename(''); }}
                                                        className="text-red-500 hover:text-red-400 ml-1"
                                                    >
                                                        ✕
                                                    </button>
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Textarea input */}
                                    <div className="flex-1 flex flex-col min-h-0">
                                        <label className="text-[10px] font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Nhập số điện thoại thủ công</label>
                                        <textarea
                                            value={formPhonesText}
                                            onChange={e => setFormPhonesText(e.target.value)}
                                            placeholder="Nhập danh sách số điện thoại, phân tách bằng dấu xuống dòng, dấu phẩy hoặc chấm phẩy...&#10;VD:&#10;0912345678&#10;0987654321"
                                            className="w-full flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 focus:outline-none focus:border-blue-500 rounded-lg px-2.5 py-2 text-xs font-mono text-gray-900 dark:text-gray-200 placeholder-gray-450 dark:placeholder-gray-500 transition-colors resize-none overflow-y-auto"
                                        />
                                    </div>

                                    {/* Preview and validation box */}
                                    {getParsedPhones().length > 0 && (
                                        <div className="p-2.5 bg-emerald-50 dark:bg-emerald-955/20 border border-emerald-200 dark:border-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs flex justify-between items-center font-medium">
                                            <span>Tổng số điện thoại hợp lệ sẵn sàng thêm:</span>
                                            <strong className="text-xs font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">{getParsedPhones().length} số</strong>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Warning Box + Modal Footer actions */}
                            <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-855 p-4">
                                <div className="border border-yellow-500/20 bg-yellow-500/5 rounded-xl px-3 py-2.5 mb-4">
                                    <p className="text-[10px] text-yellow-600 dark:text-yellow-400 font-semibold mb-0.5">⚠️ Cảnh báo</p>
                                    <p className="text-[9px] text-yellow-600/70 dark:text-yellow-400/60 leading-relaxed">
                                        Việc quét dồn dập quá nhiều số điện thoại trong ngày có thể làm tăng nguy cơ bị Zalo khóa tài khoản. Hãy luôn tuân thủ cấu hình daily limit an toàn và phân phối chia đều tải quét cho các tài khoản Zalo online phụ trách.
                                    </p>
                                </div>

                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateForm(false)}
                                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 transition-colors"
                                    >
                                        Hủy bỏ
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-colors"
                                    >
                                        Khởi tạo lô quét
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
