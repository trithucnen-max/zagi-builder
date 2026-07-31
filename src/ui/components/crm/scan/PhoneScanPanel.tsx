import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import ipc from '@/lib/ipc';
import { useAccountStore } from '@/store/accountStore';
import { useAppStore } from '@/store/appStore';
import { useVisibleAccounts } from '@/hooks/useVisibleAccounts';
import { normalizePhone, isValidVietnamPhone } from '@/utils/phoneUtils';
import AppIcon from '../../common/AppIcon';
import UnifiedLabelPickerModal, { LoadedLabelOption } from '../modals/UnifiedLabelPickerModal';
import ImportWizardModal, { BatchConfig } from '../import/ImportWizardModal';

function getContrastColor(hexColor: string): string {
  if (!hexColor) return '#ffffff';
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
}

interface Batch {
    id: number;
    name: string;
    assigned_account_id: string | null;
    contact_assignment_mode?: 'single' | 'distributed' | 'all_accounts';
    auto_tag_ids: string; // JSON array
    daily_limit: number;
    hourly_limit?: number;
    skip_crm_existing?: number | boolean;
    auto_workflow_id?: number | string | null;
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
    const hasMultipleZaloAccounts = visibleAccounts.filter(acc => !acc.channel || acc.channel === 'zalo').length >= 2;
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
    const [batchFilterTab, setBatchFilterTab] = useState<'all' | 'active' | 'paused' | 'completed'>('active');
    
    // Creation Form
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [showImportWizard, setShowImportWizard] = useState(false);
    const [wizardInitialFile, setWizardInitialFile] = useState<File | null>(null);
    const [isCreateFormMaximized, setIsCreateFormMaximized] = useState(false);
    const [formName, setFormName] = useState('');
    const [formAssignedAccount, setFormAssignedAccount] = useState<string>('');
    const [formTargetAccountId, setFormTargetAccountId] = useState<string>('');
    const [formContactAssignmentMode, setFormContactAssignmentMode] = useState<'single' | 'distributed' | 'all_accounts'>('distributed');
    const [showReassignModal, setShowReassignModal] = useState(false);
    const [reassignMode, setReassignMode] = useState<'single' | 'distributed' | 'all_accounts'>('distributed');
    const [reassignAccountId, setReassignAccountId] = useState<string>('');
    const [isReassigning, setIsReassigning] = useState(false);
    const [formDailyLimit, setFormDailyLimit] = useState<number>(100);
    const [formHourlyLimit, setFormHourlyLimit] = useState<number>(30);
    const [formPriority, setFormPriority] = useState<number>(0);
    const [formStatus, setFormStatus] = useState<'paused' | 'active'>('paused');
    const [formScheduledTime, setFormScheduledTime] = useState<string>('');
    const [formSkipCrmExisting, setFormSkipCrmExisting] = useState<boolean>(true);
    const [formUpdateZaloAlias, setFormUpdateZaloAlias] = useState<boolean>(true);
    const [formAutoWorkflowId, setFormAutoWorkflowId] = useState<string>('');
    const [formPhonesText, setFormPhonesText] = useState('');
    const [formAutoTagIds, setFormAutoTagIds] = useState<number[]>([]);
    const [csvPhones, setCsvPhones] = useState<string[]>([]);
    const [csvFilename, setCsvFilename] = useState('');
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const [availableWorkflows, setAvailableWorkflows] = useState<any[]>([]);
    const [existingCrmPhonesSet, setExistingCrmPhonesSet] = useState<Set<string>>(new Set());

    // Real-time phone duplicate check against CRM DB
    useEffect(() => {
        const textPhones = formPhonesText.split(/[\r\n,;]+/).map(p => p.trim()).filter(Boolean);
        const combined = [...textPhones, ...csvPhones];
        const unique = new Set<string>();
        combined.forEach(p => {
            const norm = normalizePhone(p);
            if (norm && isValidVietnamPhone(norm)) unique.add(norm);
        });
        const parsed = Array.from(unique);

        if (parsed.length === 0) {
            setExistingCrmPhonesSet(new Set());
            return;
        }

        const timer = setTimeout(() => {
            ipc.db?.checkPhonesDuplicate({ zaloId: 'all', phones: parsed }).then((res: any) => {
                if (res?.duplicates && Array.isArray(res.duplicates)) {
                    const normDups = new Set<string>();
                    res.duplicates.forEach((p: string) => {
                        const norm = normalizePhone(p);
                        if (norm) normDups.add(norm);
                    });
                    setExistingCrmPhonesSet(normDups);
                }
            }).catch(() => {});
        }, 300);

        return () => clearTimeout(timer);
    }, [formPhonesText, csvPhones]);
    
    // Inline label creation form state
    const [isCreatingLabel, setIsCreatingLabel] = useState(false);
    const [newLabelName, setNewLabelName] = useState('');
    const [newLabelColor, setNewLabelColor] = useState('#3B82F6');
    const [newLabelEmoji, setNewLabelEmoji] = useState('🏷️');
    
    // Local Labels (Tags)
    const [localLabels, setLocalLabels] = useState<any[]>([]);
    const [limitStatusList, setLimitStatusList] = useState<any[]>([]);
    const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
    const [scanTimeFilter, setScanTimeFilter] = useState<'all' | 'today' | 'this_week' | 'this_month' | 'custom'>('today');
    const [customStartDate, setCustomStartDate] = useState<string>(todayStr);
    const [customEndDate, setCustomEndDate] = useState<string>(todayStr);
    const [filteredStats, setFilteredStats] = useState<{ total: number; scanned: number; found: number; notFound: number; error: number; pending: number; startTimestamp?: number; endTimestamp?: number } | null>(null);
    const accounts = useAccountStore(s => s.accounts);
    const [showLabelPickerModal, setShowLabelPickerModal] = useState(false);

    // Auto-select 1st Zalo account when single assignment mode is selected if empty
    useEffect(() => {
        if (formContactAssignmentMode === 'single' && !formTargetAccountId && accounts.length > 0) {
            const firstZalo = accounts.find(a => a.is_active !== 0 && (!a.channel || a.channel === 'zalo')) || accounts[0];
            if (firstZalo?.zalo_id) {
                setFormTargetAccountId(firstZalo.zalo_id);
            }
        }
    }, [formContactAssignmentMode, formTargetAccountId, accounts]);

    const unifiedLabelOptions: LoadedLabelOption[] = useMemo(() => {
        return localLabels.map((l: any) => ({
            value: `local:${l.id}`,
            label: `${l.emoji || '🏷️'} ${l.name} (Local)`,
            source: 'local' as const,
            color: l.color || '#14b8a6',
            textColor: l.text_color || l.textColor || '#ffffff',
            emoji: l.emoji || '🏷️',
            name: l.name,
            pageIds: l.pageIds || (l.page_ids ? (typeof l.page_ids === 'string' ? l.page_ids.split(',') : l.page_ids) : []),
        }));
    }, [localLabels]);

    const currentBatchConfig: BatchConfig = useMemo(() => ({
        name: formName.trim(),
        assignedAccountId: formAssignedAccount || null,
        targetAccountId: formContactAssignmentMode === 'single' ? (formTargetAccountId || null) : null,
        contactAssignmentMode: formContactAssignmentMode,
        autoTagIds: formAutoTagIds,
        dailyLimit: formDailyLimit,
        hourlyLimit: formHourlyLimit,
        priority: formPriority,
        status: formStatus,
        scheduledTime: formScheduledTime,
        skipCrmExisting: formSkipCrmExisting,
        autoWorkflowId: formAutoWorkflowId ? Number(formAutoWorkflowId) : null,
        updateZaloAlias: formUpdateZaloAlias,
    }), [
        formName,
        formAssignedAccount,
        formTargetAccountId,
        formContactAssignmentMode,
        formAutoTagIds,
        formDailyLimit,
        formHourlyLimit,
        formPriority,
        formStatus,
        formScheduledTime,
        formSkipCrmExisting,
        formAutoWorkflowId,
        formUpdateZaloAlias
    ]);

    const timeFilteredBatches = useMemo(() => {
        if (scanTimeFilter === 'all' || !filteredStats?.startTimestamp || !filteredStats?.endTimestamp) {
            return batches;
        }
        const start = filteredStats.startTimestamp;
        const end = filteredStats.endTimestamp;
        return batches.filter(b => b.created_at >= start && b.created_at <= end);
    }, [batches, scanTimeFilter, filteredStats]);
    
    // Drag & Drop reorder state
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    // Drag & Drop handlers
    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverIndex !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === targetIndex) {
            setDraggedIndex(null);
            setDragOverIndex(null);
            return;
        }

        const updated = [...batches];
        const [movedBatch] = updated.splice(draggedIndex, 1);
        updated.splice(targetIndex, 0, movedBatch);

        setBatches(updated);
        setDraggedIndex(null);
        setDragOverIndex(null);

        try {
            const batchIds = updated.map(b => b.id);
            await ipc.crm?.reorderPhoneScanBatches({ batchIds });
            showNotification(`Đã cập nhật thứ tự ưu tiên mới! Lô "${movedBatch.name}" đã đẩy lên vị trí #${targetIndex + 1}.`, 'success');
        } catch (err: any) {
            showNotification('Cập nhật thứ tự thất bại: ' + err.message, 'error');
            fetchBatches();
        }
    };

    // Fetch Workflows for dropdown
    const fetchAvailableWorkflows = useCallback(async () => {
        try {
            const res = await (ipc.db as any)?.getWorkflows();
            if (res) {
                const list = Array.isArray(res) ? res : (res.workflows || []);
                setAvailableWorkflows(list.filter((w: any) => w.enabled));
            }
        } catch {}
    }, []);

    useEffect(() => {
        fetchAvailableWorkflows();
    }, [fetchAvailableWorkflows]);

    const [selectedScanAccount, setSelectedScanAccount] = useState<string>('all');
    const permittedAccountIds = useMemo(() => visibleAccounts.map(a => a.zalo_id), [visibleAccounts]);
    const activeFilterAccountIds = useMemo(() => {
        if (selectedScanAccount !== 'all') return [selectedScanAccount];
        return permittedAccountIds;
    }, [selectedScanAccount, permittedAccountIds]);

    // Fetch batches
    const fetchBatches = useCallback(async () => {
        try {
            const res = await ipc.crm?.getPhoneScanBatches({ accountIds: activeFilterAccountIds });
            if (res?.success && res.batches) {
                setBatches(res.batches);
            }
        } catch (err: any) {
            console.error('Failed to fetch batches:', err);
        } finally {
            setLoadingBatches(false);
        }
    }, [activeFilterAccountIds]);

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

    // Fetch Overall Stats by Time Filter
    const fetchOverallStats = useCallback(async (timeRange: 'all' | 'today' | 'this_week' | 'this_month' | 'custom') => {
        try {
            const res = await ipc.crm?.getPhoneScanOverallStats({
                timeRange,
                startDate: customStartDate,
                endDate: customEndDate,
                accountIds: activeFilterAccountIds
            });
            if (res?.success && res.stats) {
                setFilteredStats(res.stats);
            }
        } catch (err) {
            console.error('Failed to fetch overall stats:', err);
        }
    }, [customStartDate, customEndDate, activeFilterAccountIds]);

    useEffect(() => {
        fetchOverallStats(scanTimeFilter);
    }, [scanTimeFilter, customStartDate, customEndDate, fetchOverallStats]);

    // Fetch Local Labels
    const fetchLocalLabels = useCallback(async () => {
        try {
            const res = await ipc.db?.getLocalLabels({ zaloId: activeAccountId || undefined });
            if (res) {
                setLocalLabels(Array.isArray(res) ? res : (res.labels || []));
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
        fetchOverallStats(scanTimeFilter);
        
        pollingTimer.current = setInterval(() => {
            fetchBatches();
            fetchLimitStatus();
            fetchOverallStats(scanTimeFilter);
        }, 3000); // Poll progress every 3 seconds

        return () => {
            if (pollingTimer.current) clearInterval(pollingTimer.current);
        };
    }, [fetchBatches, fetchLocalLabels, fetchLimitStatus, fetchOverallStats, scanTimeFilter]);

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

    // Auto-select single Zalo account if only 1 account connected
    useEffect(() => {
        if (visibleAccounts.length === 1 && !formAssignedAccount) {
            setFormAssignedAccount(visibleAccounts[0].zalo_id);
        }
    }, [visibleAccounts, formAssignedAccount]);

    // Parse auto-assigned tag IDs for selected batch
    const parsedAutoTagIds: number[] = React.useMemo(() => {
        if (!selectedBatch?.auto_tag_ids) return [];
        try {
            const parsed = JSON.parse(selectedBatch.auto_tag_ids);
            return Array.isArray(parsed) ? parsed.map(Number) : [];
        } catch {
            return [];
        }
    }, [selectedBatch?.auto_tag_ids]);

    const selectedBatchTags = React.useMemo(() => {
        if (parsedAutoTagIds.length === 0 || localLabels.length === 0) return [];
        return localLabels.filter(lbl => parsedAutoTagIds.includes(lbl.id));
    }, [parsedAutoTagIds, localLabels]);

    const selectedBatchAccount = React.useMemo(() => {
        if (!selectedBatch?.assigned_account_id) return null;
        return visibleAccounts.find(a => a.zalo_id === selectedBatch.assigned_account_id) || null;
    }, [selectedBatch?.assigned_account_id, visibleAccounts]);

    const selectedBatchWorkflow = React.useMemo(() => {
        if (!selectedBatch?.auto_workflow_id) return null;
        return availableWorkflows.find(w => String(w.id) === String(selectedBatch.auto_workflow_id)) || null;
    }, [selectedBatch?.auto_workflow_id, availableWorkflows]);

    // Normalize phone numbers using central utility
    const normalizePhoneNumber = (raw: string): string => {
        return normalizePhone(raw);
    };

    // Parse phones from text + csv combined
    // Returns full phone stats breakdown for display
    const getPhoneStats = () => {
        const textPhones = formPhonesText
            .split(/[\r\n,;]+/)
            .map(p => p.trim())
            .filter(p => p.length > 0);

        const combined = [...textPhones, ...csvPhones];
        const rawCount = combined.length; // total lines entered (before any filter)

        const unique = new Set<string>();
        let invalidCount = 0;
        combined.forEach(p => {
            const normalized = normalizePhone(p);
            if (normalized && isValidVietnamPhone(normalized)) {
                unique.add(normalized);
            } else if (p) {
                invalidCount++;
            }
        });
        const parsedCount = unique.size;             // unique valid phones
        const inListDupCount = rawCount - parsedCount - invalidCount; // duplicates within the list
        const crmDupCount = existingCrmPhonesSet.size;
        const actualScanCount = formSkipCrmExisting
            ? Math.max(0, parsedCount - crmDupCount)
            : parsedCount;

        return { rawCount, parsedCount, inListDupCount, invalidCount, crmDupCount, actualScanCount };
    };

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

    // Download Sample Excel File (SĐT, Họ và tên, Giới tính, Ngày sinh)
    const downloadSampleExcel = () => {
        try {
            const sampleData = [
                { 'Số điện thoại': '0912345678', 'Họ và tên': 'Nguyễn Văn Anh', 'Giới tính': 'Nam', 'Ngày sinh': '15/08/1992' },
                { 'Số điện thoại': '0987654321', 'Họ và tên': 'Trần Thị Bình', 'Giới tính': 'Nữ', 'Ngày sinh': '20/11/1995' },
                { 'Số điện thoại': '0909123456', 'Họ và tên': 'Lê Hoàng Cường', 'Giới tính': 'Khác', 'Ngày sinh': '01/01/1990' },
            ];
            const worksheet = XLSX.utils.json_to_sheet(sampleData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'DS_SDT_Mau');
            XLSX.writeFile(workbook, 'Danh_sach_SDT_Quet_Mau.xlsx');
            showNotification('Đã tải xuống file mẫu Excel (SĐT, Họ và tên, Giới tính, Ngày sinh)!', 'success');
        } catch (err: any) {
            showNotification('Tải file mẫu thất bại: ' + err.message, 'error');
        }
    };

    // CSV & Excel Multi-Format File Reader
    const processUploadedFile = (file: File) => {
        if (!formName.trim()) {
            showNotification('Vui lòng nhập Tên lô quét ở cột bên trái trước khi tải file!', 'error');
            const nameInput = document.querySelector('input[placeholder*="VD: Lô khách hàng"]') as HTMLInputElement;
            if (nameInput) nameInput.focus();
            return;
        }
        if (hasMultipleZaloAccounts && formContactAssignmentMode === 'single' && !formTargetAccountId) {
            showNotification('Vui lòng chọn tài khoản Zalo nhận dữ liệu liên hệ ở cột bên trái!', 'error');
            return;
        }

        setWizardInitialFile(file);
        setShowImportWizard(true);
    };

    const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processUploadedFile(file);
    };

    const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingFile(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processUploadedFile(file);
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

        if (formContactAssignmentMode === 'single' && !formTargetAccountId) {
            showNotification('Vui lòng chọn 1 tài khoản Zalo nhận dữ liệu liên hệ', 'error');
            return;
        }

        try {
            const res = await ipc.crm?.createPhoneScanBatch({
                name: formName.trim(),
                assignedAccountId: formAssignedAccount || null,
                targetAccountId: formContactAssignmentMode === 'single' ? (formTargetAccountId || null) : null,
                contactAssignmentMode: formContactAssignmentMode,
                autoTagIds: formAutoTagIds,
                dailyLimit: formDailyLimit,
                hourlyLimit: formHourlyLimit,
                priority: formPriority,
                status: formStatus,
                scheduledTime: formScheduledTime,
                skipCrmExisting: formSkipCrmExisting,
                autoWorkflowId: formAutoWorkflowId ? Number(formAutoWorkflowId) : null,
                updateZaloAlias: formUpdateZaloAlias,
                phones
            });

            if (res?.success) {
                showNotification(formStatus === 'paused' ? 'Đã tạo lô nháp (Tạm dừng) thành công! Bấm nút Bật để bắt đầu quét.' : 'Đã khởi tạo lô quét thành công!', 'success');
                // Reset form
                setFormName('');
                setFormAssignedAccount('');
                setFormContactAssignmentMode('distributed');
                setFormDailyLimit(100);
                setFormHourlyLimit(30);
                setFormPriority(0);
                setFormStatus('paused');
                setFormScheduledTime('');
                setFormSkipCrmExisting(true);
                setFormUpdateZaloAlias(true);
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

    // Re-assign existing batch contacts
    const handleReassignBatch = async () => {
        if (!selectedBatch) return;
        if (reassignMode === 'single' && !reassignAccountId) {
            showNotification('Vui lòng chọn tài khoản Zalo đích', 'error');
            return;
        }
        setIsReassigning(true);
        try {
            const res = await ipc.crm?.reassignBatchContacts({
                batchId: selectedBatch.id,
                targetMode: reassignMode,
                targetAccountId: reassignMode === 'single' ? (reassignAccountId || null) : null
            });
            if (res?.success) {
                showNotification(`Đã chuyển quy tắc phân bổ thành công cho ${res.reassignedCount || 0} liên hệ!`, 'success');
                setShowReassignModal(false);
                fetchBatches();
                if (selectedBatch) {
                    fetchItems(selectedBatch.id, itemsPage, itemsStatusFilter);
                }
            } else {
                showNotification('Chuyển phân bổ thất bại: ' + (res?.error || 'Lỗi không xác định'), 'error');
            }
        } catch (err: any) {
            showNotification('Lỗi: ' + err.message, 'error');
        } finally {
            setIsReassigning(false);
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

    // Export Scan results to CSV file
    const handleExportCSV = async (batch: Batch) => {
        try {
            // Get all items without paging limit
            const res = await ipc.crm?.getPhoneScanItems({ batchId: batch.id, limit: 100000, offset: 0, status: 'all' });
            if (res?.success && res.items) {
                const itemsList: ScanItem[] = res.items;
                // Parse tag names for CSV export
                let batchTagNames = '';
                if (batch.auto_tag_ids) {
                    try {
                        const parsedIds: number[] = JSON.parse(batch.auto_tag_ids);
                        if (Array.isArray(parsedIds) && parsedIds.length > 0) {
                            batchTagNames = localLabels
                                .filter(l => parsedIds.includes(l.id))
                                .map(l => l.name)
                                .join('; ');
                        }
                    } catch {}
                }

                let csvContent = '\uFEFF'; // BOM for Excel UTF-8 display
                csvContent += 'Số điện thoại,SĐT chuẩn hóa,Trạng thái,UID Zalo,Tên Zalo,Nhãn CRM đã gán,Thời gian quét,Lỗi nếu có\n';
                
                itemsList.forEach(item => {
                    const timeStr = item.scanned_at ? new Date(item.scanned_at).toLocaleString('vi-VN') : '';
                    const statusStr = item.status === 'found' ? 'Tìm thấy Zalo'
                                    : item.status === 'not_found' ? 'Không có Zalo'
                                    : item.status === 'scanning' ? 'Đang quét'
                                    : item.status === 'error' ? 'Lỗi'
                                    : item.status === 'duplicate' ? 'Trùng'
                                    : 'Chờ quét';
                    const assignedTagsStr = item.status === 'found' ? batchTagNames : '';
                                    
                    const row = [
                        item.phone,
                        item.phone_normalized,
                        statusStr,
                        item.zalo_uid || '',
                        `"${(item.zalo_name || '').replace(/"/g, '""')}"`,
                        `"${assignedTagsStr.replace(/"/g, '""')}"`,
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
            <div className="bg-gray-850 border-b border-gray-700/60 p-5 flex-shrink-0">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h2 className="text-base font-bold text-gray-100 flex items-center gap-2">
                            <AppIcon name="phone" className="text-blue-500" size={16} />
                            Quét số điện thoại Zalo hàng loạt
                        </h2>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                            Quét danh sách số điện thoại số lượng lớn, tự động nhận diện và gán nhãn CRM định kỳ hàng ngày.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Account Filter Pill */}
                        <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1 shadow-2xs">
                            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">👤 Báo cáo tài khoản:</span>
                            <select
                                value={selectedScanAccount}
                                onChange={(e) => setSelectedScanAccount(e.target.value)}
                                className="bg-transparent text-gray-900 dark:text-white font-bold text-xs focus:outline-none cursor-pointer"
                            >
                                <option value="all" className="bg-white dark:bg-gray-900">
                                    🌐 Tất cả tài khoản được cấp quyền ({visibleAccounts.length} TK)
                                </option>
                                {visibleAccounts.map(acc => (
                                    <option key={acc.zalo_id} value={acc.zalo_id} className="bg-white dark:bg-gray-900">
                                        👤 {acc.display_name || acc.name || acc.zalo_id} ({acc.zalo_id})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Time Range Filter Pill */}
                        <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1 shadow-2xs">
                            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">⏱️ Thời gian quét:</span>
                            <select
                                value={scanTimeFilter}
                                onChange={(e) => setScanTimeFilter(e.target.value as any)}
                                className="bg-transparent text-gray-900 dark:text-white font-bold text-xs focus:outline-none cursor-pointer"
                            >
                                <option value="all" className="bg-white dark:bg-gray-900">🌐 Mọi lúc (Tất cả)</option>
                                <option value="today" className="bg-white dark:bg-gray-900">🎁 Hôm nay</option>
                                <option value="this_week" className="bg-white dark:bg-gray-900">📆 Tuần này</option>
                                <option value="this_month" className="bg-white dark:bg-gray-900">🎉 Tháng này</option>
                                <option value="custom" className="bg-white dark:bg-gray-900">📅 Tùy chọn khoảng thời gian...</option>
                            </select>
                        </div>

                        {scanTimeFilter === 'custom' && (
                            <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 border border-blue-500/40 rounded-lg px-2.5 py-1 text-xs">
                                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Từ:</span>
                                <input
                                    type="date"
                                    value={customStartDate}
                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                    className="bg-gray-200 dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:border-blue-500 cursor-pointer"
                                />
                                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Đến:</span>
                                <input
                                    type="date"
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    className="bg-gray-200 dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:border-blue-500 cursor-pointer"
                                />
                            </div>
                        )}

                        <button
                            onClick={() => setShowCreateForm(true)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0068FF] hover:bg-[#005AE0] text-white !text-white shadow-md transition-all cursor-pointer"
                        >
                            <AppIcon name="plus" size={14} />
                            Tạo lô quét mới
                        </button>
                    </div>
                </div>

                {/* Overall Stats Cards */}
                <div className="grid grid-cols-5 gap-4">
                    {(() => {
                        const batchTotals = batches.reduce(
                            (acc, b) => {
                                acc.total += b.total_count;
                                acc.scanned += b.scanned_count;
                                acc.found += b.found_count;
                                acc.notFound += (b.not_found_count + b.error_count);
                                acc.error += b.error_count;
                                acc.pending += Math.max(0, b.total_count - b.scanned_count);
                                return acc;
                            },
                            { total: 0, scanned: 0, found: 0, notFound: 0, error: 0, pending: 0 }
                        );

                        const totals = (scanTimeFilter !== 'all' && filteredStats) ? filteredStats : batchTotals;
                        const progress = totals.total > 0 ? Math.round((totals.scanned / totals.total) * 100) : 0;
                        const timeLabel = scanTimeFilter === 'today' ? '(HÔM NAY)'
                                        : scanTimeFilter === 'this_week' ? '(TUẦN NÀY)'
                                        : scanTimeFilter === 'this_month' ? '(THÁNG NÀY)'
                                        : scanTimeFilter === 'custom' ? `(${customStartDate} ➔ ${customEndDate})`
                                        : '';

                        return (
                            <>
                                <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-4 flex flex-col justify-between">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Tổng SĐT tải lên {timeLabel}</span>
                                    <span className="text-xl font-bold text-white mt-1">{totals.total.toLocaleString()}</span>
                                </div>
                                <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-4 flex flex-col justify-between">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Đã quét {timeLabel}</span>
                                    <div className="flex items-baseline justify-between mt-1">
                                        <span className="text-xl font-bold text-blue-400">{totals.scanned.toLocaleString()}</span>
                                        <span className="text-[10px] text-gray-400">({progress}%)</span>
                                    </div>
                                </div>
                                <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-4 flex flex-col justify-between">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Có Zalo (found) {timeLabel}</span>
                                    <span className="text-xl font-bold text-emerald-400 mt-1">{totals.found.toLocaleString()}</span>
                                </div>
                                <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-4 flex flex-col justify-between">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Không có Zalo {timeLabel}</span>
                                    <span className="text-xl font-bold text-amber-400 mt-1">{(scanTimeFilter === 'all' ? batchTotals.notFound : totals.notFound).toLocaleString()}</span>
                                </div>
                                <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-4 flex flex-col justify-between">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Số lượng còn lại {timeLabel}</span>
                                    <span className="text-xl font-bold text-gray-300 mt-1">{(totals.pending ?? (totals.total - totals.scanned)).toLocaleString()}</span>
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
                    ) : timeFilteredBatches.filter(b => batchFilterTab === 'all' ? true : b.status === batchFilterTab).length === 0 ? (
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
                            {(() => {
                                const displayedBatches = timeFilteredBatches.filter(b => batchFilterTab === 'all' ? true : b.status === batchFilterTab);
                                const activeBatchesList = displayedBatches.filter(b => b.status === 'active');

                                return displayedBatches.map((batch, index) => {
                                    const progress = batch.total_count > 0 ? Math.round((batch.scanned_count / batch.total_count) * 100) : 0;
                                    const conversionRate = batch.scanned_count > 0 ? Math.round((batch.found_count / batch.scanned_count) * 100) : 0;
                                    const isSelected = selectedBatch?.id === batch.id;

                                    const activeIndex = activeBatchesList.findIndex(b => b.id === batch.id);
                                    const isDraggingThis = draggedIndex === index;
                                    const isDragOverThis = dragOverIndex === index;

                                    return (
                                        <div
                                            key={batch.id}
                                            draggable={true}
                                            onDragStart={(e) => handleDragStart(e, index)}
                                            onDragOver={(e) => handleDragOver(e, index)}
                                            onDrop={(e) => handleDrop(e, index)}
                                            onClick={() => setSelectedBatch(batch)}
                                            className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                                                isDraggingThis ? 'opacity-40 scale-[0.98]' : ''
                                            } ${
                                                isDragOverThis ? 'border-2 border-blue-500 bg-blue-50/30 dark:bg-blue-950/30 ring-2 ring-blue-500/30' : ''
                                            } ${
                                                isSelected
                                                    ? 'bg-gray-50 dark:bg-gray-850 border-blue-500 shadow-md ring-1 ring-blue-500/20'
                                                    : batch.status === 'active'
                                                        ? 'bg-blue-50/30 dark:bg-blue-955/20 border-blue-200 dark:border-blue-900/40 hover:border-blue-400'
                                                        : 'bg-white dark:bg-gray-850 border-gray-200 dark:border-gray-700/80 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                                    {/* Drag handle icon */}
                                                    <div 
                                                        className="cursor-grab active:cursor-grabbing p-1 mt-0.5 hover:bg-gray-200 dark:hover:bg-gray-750 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex-shrink-0 transition-colors" 
                                                        title="Kéo thả để thay đổi thứ tự ưu tiên chạy"
                                                    >
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                                            <circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/>
                                                            <circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
                                                            <circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>
                                                        </svg>
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-bold text-gray-900 dark:text-white text-xs truncate max-w-[200px]">{batch.name}</span>
                                                            {batch.status === 'active' ? (
                                                                activeIndex === 0 ? (
                                                                    <span className="px-2 py-0.5 text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 rounded-full animate-pulse shadow-2xs">
                                                                        ▶️ Đang chạy (#1)
                                                                    </span>
                                                                ) : (
                                                                    <span className="px-2 py-0.5 text-[9px] font-bold bg-blue-100 dark:bg-blue-950/80 border border-blue-300 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 rounded-full">
                                                                        ⏳ Đang chờ (#{activeIndex + 1})
                                                                    </span>
                                                                )
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
                                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Tỷ lệ Zalo: {conversionRate}%</span>
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
                                });
                            })()}
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

                        {/* Option C Banner: Cấu hình Setup ban đầu & Báo cáo Nhãn đã gán */}
                        <div className="mx-5 mt-4 p-3.5 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/80 rounded-xl space-y-2 text-xs flex-shrink-0">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700/60 pb-2">
                                <div className="flex items-center gap-1.5 font-bold text-gray-800 dark:text-gray-200 text-xs">
                                    <AppIcon name="settings" size={14} className="text-blue-500" />
                                    <span>Cấu hình Setup ban đầu & Báo cáo Lô #{selectedBatch.id}</span>
                                </div>
                                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                    Tạo lúc: {new Date(selectedBatch.created_at).toLocaleString('vi-VN')}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-gray-600 dark:text-gray-300 text-[11px]">
                                {/* Account */}
                                <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-gray-400">Tài khoản chạy:</span>
                                    {selectedBatchAccount ? (
                                        <div className="flex items-center gap-1 font-medium text-gray-900 dark:text-white">
                                            {selectedBatchAccount.avatar_url && (
                                                <img src={selectedBatchAccount.avatar_url} className="w-4 h-4 rounded-full" alt="" />
                                            )}
                                            <span>{selectedBatchAccount.full_name || selectedBatchAccount.zalo_id}</span>
                                        </div>
                                    ) : (
                                        <span className="text-blue-600 dark:text-blue-400 font-medium">Tất cả tài khoản</span>
                                    )}
                                </div>

                                {/* Limits */}
                                <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-gray-400">Giới hạn:</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {selectedBatch.daily_limit} số/ngày {selectedBatch.hourly_limit ? `(${selectedBatch.hourly_limit} số/giờ)` : ''}
                                    </span>
                                </div>

                                {/* Skip CRM */}
                                <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-gray-400">Lọc CRM:</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {selectedBatch.skip_crm_existing ? '✓ Bỏ qua SĐT đã có trong CRM' : 'Quét toàn bộ'}
                                    </span>
                                </div>

                                {/* Contact Assignment Mode Banner */}
                                <div className="flex items-center gap-1.5 col-span-full justify-between bg-white dark:bg-gray-800/80 p-2 rounded-lg border border-gray-200 dark:border-gray-700/60">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-gray-400">Quy tắc phân bổ CRM:</span>
                                        <span className="font-bold text-gray-900 dark:text-white">
                                            {selectedBatch.contact_assignment_mode === 'single' ? '🔵 Gom về 1 tài khoản chỉ định'
                                             : selectedBatch.contact_assignment_mode === 'all_accounts' ? '🟣 Có mặt ở tất cả tài khoản Zalo'
                                             : '🟢 Phân tán theo tài khoản trực tiếp quét'}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setReassignMode(selectedBatch.contact_assignment_mode || 'distributed');
                                            setReassignAccountId(selectedBatch.assigned_account_id || '');
                                            setShowReassignModal(true);
                                        }}
                                        className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-700/50 transition-all flex items-center gap-1 cursor-pointer"
                                    >
                                        ⚡ Chuyển phân bổ liên hệ
                                    </button>
                                </div>

                                {/* Auto Workflow */}
                                {selectedBatchWorkflow && (
                                    <div className="flex items-center gap-1.5 col-span-full">
                                        <span className="font-semibold text-gray-400">Workflow tự động:</span>
                                        <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">
                                            ⚡ {selectedBatchWorkflow.name}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Auto-assigned Tags */}
                            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-200 dark:border-gray-700/40">
                                <span className="font-semibold text-gray-400 text-[11px] flex-shrink-0">🏷️ Nhãn đã gán tự động ({selectedBatchTags.length}):</span>
                                {selectedBatchTags.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {selectedBatchTags.map(tag => (
                                            <span
                                                key={tag.id}
                                                className="px-2 py-0.5 text-[10px] font-semibold rounded-full flex items-center gap-1 border shadow-xs"
                                                style={{
                                                    backgroundColor: `${tag.color || '#3B82F6'}15`,
                                                    borderColor: `${tag.color || '#3B82F6'}50`,
                                                    color: tag.color || '#3B82F6'
                                                }}
                                            >
                                                <span>{tag.emoji || '🏷️'}</span>
                                                <span>{tag.name}</span>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="text-gray-400 italic text-[11px]">Không cài đặt nhãn tự động</span>
                                )}
                            </div>
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
                                    {(() => {
                                        const showRealName = true;
                                        const showGender = items.some(i => i.gender !== null && i.gender !== undefined);
                                        const showBirthday = items.some(i => i.birthday && i.birthday.trim() !== '');

                                        return (
                                            <table className="w-full text-left text-xs border-collapse">
                                                <thead>
                                                    <tr className="border-b border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-500">
                                                        <th className="py-2.5 px-3 font-semibold">Số điện thoại</th>
                                                        <th className="py-2.5 px-3 font-semibold">Tên thật (Excel / CRM)</th>
                                                        {showGender && <th className="py-2.5 px-3 font-semibold">Giới tính</th>}
                                                        {showBirthday && <th className="py-2.5 px-3 font-semibold">Ngày sinh</th>}
                                                        <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
                                                        <th className="py-2.5 px-3 font-semibold">Zalo profile</th>
                                                        <th className="py-2.5 px-3 font-semibold">Tài khoản nhận CRM</th>
                                                        <th className="py-2.5 px-3 font-semibold">Nhãn CRM đã gán</th>
                                                        <th className="py-2.5 px-3 font-semibold">Ghi chú lỗi</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {items.map(item => (
                                                        <tr key={item.id} className="border-b border-gray-150 dark:border-gray-850 hover:bg-gray-100/40 dark:hover:bg-gray-850/30 transition-colors">
                                                            <td className="py-3 px-3 font-mono font-medium text-gray-700 dark:text-gray-300">{item.phone}</td>
                                                            {showRealName && (
                                                                <td className="py-3 px-3 font-semibold text-gray-900 dark:text-white">{item.real_name || '-'}</td>
                                                            )}
                                                            {showGender && (
                                                                <td className="py-3 px-3 font-medium text-gray-700 dark:text-gray-300">
                                                                    {item.gender === 0 ? 'Nam ♂' : item.gender === 1 ? 'Nữ ♀' : 'Chưa rõ'}
                                                                </td>
                                                            )}
                                                            {showBirthday && (
                                                                <td className="py-3 px-3 font-medium text-gray-700 dark:text-gray-300">{item.birthday || '-'}</td>
                                                            )}
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
                                                            <td className="py-3 px-3">
                                                                {item.status === 'found' ? (
                                                                    selectedBatch?.contact_assignment_mode === 'all_accounts' ? (
                                                                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 rounded border border-purple-200 dark:border-purple-800/50">
                                                                            Tất cả ({visibleAccounts.length} TK)
                                                                        </span>
                                                                    ) : selectedBatch?.contact_assignment_mode === 'single' ? (
                                                                        (() => {
                                                                            const targetId = selectedBatch.target_account_id || selectedBatch.assigned_account_id || item.scanned_by_account_id;
                                                                            const acc = visibleAccounts.find(a => a.zalo_id === targetId);
                                                                            return acc ? (
                                                                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-800/50 truncate max-w-[120px] inline-block" title={acc.full_name || acc.zalo_id}>
                                                                                    {acc.full_name || acc.zalo_id}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-gray-400 text-[10px]">{targetId ? `TK #${targetId}` : 'Tài khoản quét'}</span>
                                                                            );
                                                                        })()
                                                                    ) : (
                                                                        (() => {
                                                                            const acc = visibleAccounts.find(a => a.zalo_id === item.scanned_by_account_id);
                                                                            return acc ? (
                                                                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded border border-emerald-200 dark:border-emerald-800/50 truncate max-w-[120px] inline-block" title={acc.full_name || acc.zalo_id}>
                                                                                    {acc.full_name || acc.zalo_id}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-gray-400 text-[10px]">{item.scanned_by_account_id ? `TK #${item.scanned_by_account_id}` : 'Tài khoản quét'}</span>
                                                                            );
                                                                        })()
                                                                    )
                                                                ) : (
                                                                    <span className="text-gray-400 dark:text-gray-600">-</span>
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-3">
                                                                {item.status === 'found' && selectedBatchTags.length > 0 ? (
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {selectedBatchTags.map(tag => (
                                                                            <span
                                                                                key={tag.id}
                                                                                className="px-1.5 py-0.5 text-[9px] font-semibold rounded-md flex items-center gap-0.5 border"
                                                                                style={{
                                                                                    backgroundColor: `${tag.color || '#3B82F6'}15`,
                                                                                    borderColor: `${tag.color || '#3B82F6'}50`,
                                                                                    color: tag.color || '#3B82F6'
                                                                                }}
                                                                            >
                                                                                <span>{tag.emoji || '🏷️'}</span>
                                                                                <span>{tag.name}</span>
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-gray-400 dark:text-gray-600 text-[10px]">-</span>
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-3 text-rose-500 dark:text-rose-400 max-w-[150px] truncate" title={item.error_msg || ''}>
                                                                {item.error_msg || '-'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        );
                                    })()}
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

            {/* MODAL: Create New Batch Form (Redesigned matching Image 2 Campaign style) */}
            {showCreateForm && (
                <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs ${isCreateFormMaximized ? 'p-0' : 'p-4'}`}>
                    <div
                        className={`bg-[#f4f5f8] dark:bg-gray-900 border border-gray-200 dark:border-gray-700/80 shadow-2xl flex flex-col text-gray-900 dark:text-gray-100 overflow-hidden transition-all duration-200 ${
                            isCreateFormMaximized
                                ? 'w-full h-full max-w-none max-h-none rounded-none'
                                : 'rounded-2xl w-full max-w-[1280px]'
                        }`}
                        style={{ height: isCreateFormMaximized ? '100vh' : 'min(94vh, 50rem)' }}
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 bg-[#f4f5f8] dark:bg-gray-900">
                            <div className="flex items-center gap-3.5 flex-1">
                                <span className="text-sm font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                                    Khởi tạo lô quét SĐT Zalo mới
                                </span>
                                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-800/50 flex items-center gap-1.5 shadow-2xs truncate hidden md:inline-flex">
                                    ⚠️ Tránh quét dồn dập nhiều số điện thoại cùng lúc để hạn chế bị khóa tài khoản.
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateFormMaximized(!isCreateFormMaximized)}
                                    title={isCreateFormMaximized ? "Thu nhỏ lại" : "Mở rộng full màn hình"}
                                    className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200/60 dark:hover:bg-gray-800 transition-all"
                                >
                                    {isCreateFormMaximized ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                                        </svg>
                                    ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                                        </svg>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowCreateForm(false)}
                                    className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-200/60 dark:hover:bg-gray-800 transition-all"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Modal Body: 2-column layout matching Image 2 */}
                        <form onSubmit={handleCreateBatch} className="flex-1 min-h-0 flex flex-col justify-between bg-[#f4f5f8] dark:bg-gray-900">
                            <div className="flex-1 min-h-0 flex overflow-hidden">
                                {/* LEFT COLUMN: Configuration */}
                                <div className="w-1/2 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col overflow-y-auto p-5 gap-4 bg-[#f4f5f8] dark:bg-gray-900">
                                    {/* Batch Name */}
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Tên lô quét *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formName}
                                            onChange={e => setFormName(e.target.value)}
                                            placeholder="VD: Lô khách hàng VIP Tháng 7..."
                                            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all font-medium shadow-2xs"
                                        />
                                    </div>

                                     {/* Quy tắc phân bổ liên hệ & nhãn CRM (Chỉ hiển thị khi có từ 2 tài khoản Zalo trở lên) */}
                                     {hasMultipleZaloAccounts && (
                                         <div className="bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl p-3.5 space-y-2 flex-shrink-0">
                                             <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                                                 Quy tắc phân bổ liên hệ CRM *
                                             </label>
                                             <div className="flex flex-col gap-2">
                                                 <label
                                                     onClick={() => setFormContactAssignmentMode('distributed')}
                                                     className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                                         formContactAssignmentMode === 'distributed'
                                                             ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-500/80 ring-1 ring-emerald-500/20'
                                                             : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
                                                     }`}
                                                 >
                                                     <input
                                                         type="radio"
                                                         name="contact_assignment_mode"
                                                         checked={formContactAssignmentMode === 'distributed'}
                                                         onChange={() => setFormContactAssignmentMode('distributed')}
                                                         className="mt-0.5"
                                                     />
                                                     <div>
                                                         <div className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                                             <span>🟢 Phân tán theo tài khoản trực tiếp quét</span>
                                                         </div>
                                                         <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                             Tài khoản Zalo nào trực tiếp tìm thấy SĐT thì SĐT và nhãn CRM đó thuộc về tài khoản Zalo đó.
                                                         </div>
                                                     </div>
                                                 </label>

                                                 <label
                                                     onClick={() => setFormContactAssignmentMode('single')}
                                                     className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                                         formContactAssignmentMode === 'single'
                                                             ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-500/80 ring-1 ring-blue-500/20'
                                                             : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
                                                     }`}
                                                 >
                                                     <input
                                                         type="radio"
                                                         name="contact_assignment_mode"
                                                         checked={formContactAssignmentMode === 'single'}
                                                         onChange={() => setFormContactAssignmentMode('single')}
                                                         className="mt-0.5"
                                                     />
                                                     <div className="flex-1">
                                                         <div className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                                             <span>🔵 Gom toàn bộ về 1 tài khoản chỉ định</span>
                                                         </div>
                                                         <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                             Tất cả SĐT tìm thấy (bởi bất kỳ tài khoản nào) đều lưu profile và gán nhãn CRM về 1 tài khoản Zalo duy nhất.
                                                         </div>
                                                         {formContactAssignmentMode === 'single' && (
                                                             <div className="mt-2">
                                                                 <select
                                                                     value={formTargetAccountId}
                                                                     onChange={e => setFormTargetAccountId(e.target.value)}
                                                                     className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-900 dark:text-gray-100"
                                                                 >
                                                                     <option value="">-- Chọn tài khoản Zalo nhận toàn bộ --</option>
                                                                     {visibleAccounts.filter(acc => !acc.channel || acc.channel === 'zalo').map(acc => (
                                                                         <option key={acc.zalo_id} value={acc.zalo_id}>
                                                                             {acc.full_name || acc.zalo_id}
                                                                         </option>
                                                                     ))}
                                                                 </select>
                                                             </div>
                                                         )}
                                                     </div>
                                                 </label>

                                                 <label
                                                     onClick={() => setFormContactAssignmentMode('all_accounts')}
                                                     className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                                         formContactAssignmentMode === 'all_accounts'
                                                             ? 'bg-purple-50/50 dark:bg-purple-950/30 border-purple-500/80 ring-1 ring-purple-500/20'
                                                             : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
                                                     }`}
                                                 >
                                                     <input
                                                         type="radio"
                                                         name="contact_assignment_mode"
                                                         checked={formContactAssignmentMode === 'all_accounts'}
                                                         onChange={() => setFormContactAssignmentMode('all_accounts')}
                                                         className="mt-0.5"
                                                     />
                                                     <div>
                                                         <div className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                                             <span>🟣 Đồng bộ có mặt ở TẤT CẢ các tài khoản Zalo</span>
                                                         </div>
                                                         <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                             Tự động tạo profile liên hệ và gán nhãn CRM cho toàn bộ danh sách tài khoản Zalo active trong ứng dụng.
                                                         </div>
                                                     </div>
                                                 </label>
                                             </div>
                                         </div>
                                     )}

                                    {/* Assigned Account & Limits */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Tài khoản Zalo quét</label>
                                            <select
                                                value={formAssignedAccount}
                                                onChange={e => setFormAssignedAccount(e.target.value)}
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-2 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 transition-all font-medium shadow-2xs cursor-pointer"
                                            >
                                                <option value="">-- Tự động chia tất cả TK --</option>
                                                {visibleAccounts.filter(acc => !acc.channel || acc.channel === 'zalo').map(acc => (
                                                    <option key={acc.zalo_id} value={acc.zalo_id}>
                                                        {acc.full_name || acc.zalo_id}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Quét / ngày</label>
                                            <input
                                                type="number"
                                                required
                                                min={10}
                                                max={1000}
                                                value={formDailyLimit}
                                                onChange={e => setFormDailyLimit(Number(e.target.value))}
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 transition-all font-medium shadow-2xs"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Quét / giờ</label>
                                            <input
                                                type="number"
                                                required
                                                min={5}
                                                max={200}
                                                value={formHourlyLimit}
                                                onChange={e => setFormHourlyLimit(Number(e.target.value))}
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 transition-all font-medium shadow-2xs"
                                            />
                                        </div>
                                    </div>

                                    {/* Initial Status & Scheduled Start Time */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Trạng thái khởi tạo</label>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setFormStatus('paused')}
                                                    className={`flex-1 py-2 px-3 border rounded-xl text-xs font-semibold transition-all ${
                                                        formStatus === 'paused'
                                                            ? 'bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-500 text-amber-700 dark:text-amber-300 shadow-xs font-bold'
                                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750'
                                                    }`}
                                                >
                                                    ⏸️ Tạm dừng
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormStatus('active')}
                                                    className={`flex-1 py-2 px-3 border rounded-xl text-xs font-semibold transition-all ${
                                                        formStatus === 'active'
                                                            ? 'bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-500 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750'
                                                    }`}
                                                >
                                                    ▶️ Chạy ngay
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1.5">Hẹn giờ khởi động (Tùy chọn)</label>
                                            <input
                                                type="time"
                                                value={formScheduledTime}
                                                onChange={e => setFormScheduledTime(e.target.value)}
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 transition-all font-medium shadow-2xs"
                                            />
                                        </div>
                                    </div>

                                    {/* Skip CRM Existing Option */}
                                    <div className="flex items-center gap-3 p-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/80 rounded-2xl shadow-2xs hover:border-gray-300 transition-all">
                                        <input
                                            type="checkbox"
                                            id="skipCrmExisting"
                                            checked={formSkipCrmExisting}
                                            onChange={e => setFormSkipCrmExisting(e.target.checked)}
                                            className="w-4 h-4 text-blue-600 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500 cursor-pointer"
                                        />
                                        <label htmlFor="skipCrmExisting" className="text-xs font-semibold text-gray-800 dark:text-gray-200 cursor-pointer select-none">
                                            Bỏ qua các SĐT đã tồn tại trong danh bạ CRM (Tiết kiệm hạn ngạch quét)
                                        </label>
                                    </div>

                                    {/* Campaign Alias Option */}
                                    <div className="flex items-start gap-3 p-3.5 bg-white dark:bg-gray-800 border border-blue-200/80 dark:border-blue-900/60 rounded-2xl shadow-2xs hover:border-blue-300 transition-all">
                                        <input
                                            type="checkbox"
                                            id="updateZaloAlias"
                                            checked={formUpdateZaloAlias}
                                            onChange={e => setFormUpdateZaloAlias(e.target.checked)}
                                            className="mt-0.5 w-4 h-4 text-blue-600 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500 cursor-pointer"
                                        />
                                        <label htmlFor="updateZaloAlias" className="text-xs cursor-pointer select-none">
                                            <span className="font-bold text-gray-900 dark:text-gray-100 block">
                                                Cập nhật tên gợi nhớ Zalo & CRM theo quy tắc chiến dịch
                                            </span>
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-1 leading-snug">
                                                Định dạng: <code className="text-blue-600 dark:text-blue-400 font-mono font-bold bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800/60 text-[11px]">[Tên lô] - [Tên Zalo] - [SĐT]</code> (Đổi biệt danh hiển thị trực tiếp trên App Zalo điện thoại kể cả với Người Lạ)
                                            </span>
                                        </label>
                                    </div>

                                    {/* Tag Selection (Standardized Unified Label Picker) */}
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                                                Nhãn tự động gán (khi tìm thấy Zalo)
                                            </label>
                                            {formAutoTagIds.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setFormAutoTagIds([])}
                                                    className="text-[11px] font-semibold text-gray-400 hover:text-red-500 transition-colors"
                                                >
                                                    Bỏ chọn tất cả ({formAutoTagIds.length})
                                                </button>
                                            )}
                                        </div>

                                        <div className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/80 rounded-2xl shadow-2xs space-y-2.5">
                                            {formAutoTagIds.length > 0 ? (
                                                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                                                    {formAutoTagIds.map(tagId => {
                                                        const label = localLabels.find(l => l.id === tagId);
                                                        if (!label) return null;
                                                        const bgColor = label.color || '#14b8a6';
                                                        const textColor = getContrastColor(bgColor);
                                                        return (
                                                            <span
                                                                key={label.id}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold shadow-2xs border border-black/10 transition-all"
                                                                style={{ backgroundColor: bgColor, color: textColor }}
                                                            >
                                                                <span>{label.emoji || '🏷️'}</span>
                                                                <span>{label.name}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setFormAutoTagIds(formAutoTagIds.filter(id => id !== label.id))}
                                                                    className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-black/20 text-current transition-colors ml-0.5"
                                                                    title="Bỏ chọn nhãn"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-400 dark:text-gray-500 italic py-1">
                                                    Chưa chọn nhãn nào. Nhấn nút bên dưới để chọn nhãn tự động gán.
                                                </p>
                                            )}

                                            <button
                                                type="button"
                                                onClick={() => setShowLabelPickerModal(true)}
                                                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold transition-all border border-blue-200 dark:border-blue-800/60 cursor-pointer shadow-2xs"
                                            >
                                                <AppIcon name="settings" size={13} className="text-blue-500" />
                                                <span>{formAutoTagIds.length > 0 ? '🏷️ Thay đổi / Thêm nhãn mới' : '🏷️ Chọn nhãn tự động gán'}</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT COLUMN: CSV/Excel Dropzone + Download Template + Paste text area */}
                                <div className="w-1/2 flex-shrink-0 p-5 overflow-hidden flex flex-col gap-4 bg-[#f4f5f8] dark:bg-gray-900">
                                    {/* File CSV/Excel Dropzone */}
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1.5">
                                            Tải lên tệp CSV / Excel số điện thoại
                                        </label>
                                        
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            accept=".csv, .xlsx, .xls"
                                            onChange={handleCsvUpload}
                                            className="hidden"
                                        />

                                        <div
                                            onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                                            onDragLeave={() => setIsDraggingFile(false)}
                                            onDrop={handleFileDrop}
                                            onClick={() => {
                                                if (!formName.trim()) {
                                                    showNotification('Vui lòng nhập Tên lô quét bên trái trước khi tải file!', 'error');
                                                    const nameInput = document.querySelector('input[placeholder*="VD: Lô khách hàng"]') as HTMLInputElement;
                                                    if (nameInput) nameInput.focus();
                                                    return;
                                                }
                                                fileInputRef.current?.click();
                                            }}
                                            className={`relative border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                                                !formName.trim()
                                                    ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800/60'
                                                    : isDraggingFile
                                                    ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-950/50 scale-[1.01]'
                                                    : 'border-blue-300/80 dark:border-blue-800/80 bg-blue-50/20 dark:bg-blue-950/20 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-950/30'
                                            }`}
                                        >
                                            {!formName.trim() ? (
                                                <div className="py-2 flex flex-col items-center gap-1.5 text-amber-700 dark:text-amber-300">
                                                    <span className="text-xs font-bold flex items-center gap-1">
                                                        <span>⚠️</span> Vui lòng điền Tên lô quét ở cột bên trái trước
                                                    </span>
                                                    <span className="text-[11px] text-amber-600/90 dark:text-amber-400/80">
                                                        Nhập tên lô & cấu hình Zalo để mở khóa ô tải file CSV/Excel
                                                    </span>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="w-11 h-11 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-2xs">
                                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                            <polyline points="17 8 12 3 7 8" />
                                                            <line x1="12" y1="3" x2="12" y2="15" />
                                                        </svg>
                                                    </div>

                                                    <div>
                                                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
                                                            Chọn file CSV/Excel...
                                                        </span>
                                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 ml-1">
                                                            hoặc kéo thả file vào đây
                                                        </span>
                                                    </div>

                                                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                                        Hỗ trợ định dạng .csv, .xlsx, .xls (tối đa 10MB)
                                                    </p>
                                                </>
                                            )}
                                        </div>

                                        {/* Download template button & File name pill */}
                                        <div className="flex items-center justify-between mt-2.5 px-1 flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); downloadSampleExcel(); }}
                                                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline transition-colors"
                                            >
                                                <span>📥 Tải tệp CSV/Excel mẫu (SĐT, Họ và tên, Giới tính, Ngày sinh)</span>
                                            </button>

                                            {csvFilename && (
                                                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 rounded-xl shadow-2xs flex items-center gap-1.5 truncate max-w-[220px]">
                                                    📄 {csvFilename} ({csvPhones.length} số)
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); setCsvPhones([]); setCsvFilename(''); }}
                                                        className="text-red-500 hover:text-red-700 font-bold ml-1"
                                                        title="Xóa file"
                                                    >
                                                        ✕
                                                    </button>
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Textarea input inside clean card */}
                                    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/80 rounded-2xl p-4 shadow-2xs">
                                        <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-2">Nhập số điện thoại thủ công</label>
                                        <textarea
                                            value={formPhonesText}
                                            onChange={e => setFormPhonesText(e.target.value)}
                                            placeholder="Nhập danh sách số điện thoại, phân tách bằng dấu xuống dòng, dấu phẩy hoặc chấm phẩy...&#10;VD:&#10;0912345678&#10;0987654321"
                                            className="w-full flex-1 bg-transparent border-0 focus:outline-none focus:ring-0 text-xs font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none overflow-y-auto leading-relaxed"
                                        />
                                    </div>

                                    {/* Preview and validation box */}
                                    {getParsedPhones().length > 0 && (() => {
                                        const { rawCount, parsedCount, inListDupCount, invalidCount, crmDupCount, actualScanCount } = getPhoneStats();
                                        return (
                                            <div className="rounded-2xl border text-xs shadow-2xs overflow-hidden">
                                                {/* Header */}
                                                <div className="bg-slate-50 dark:bg-slate-900 border-b border-gray-200 dark:border-gray-700 px-3.5 py-2.5 flex items-center gap-2">
                                                    <span>📊</span>
                                                    <span className="font-bold text-gray-700 dark:text-gray-200">Phân tích danh sách số điện thoại</span>
                                                </div>

                                                {/* Breakdown rows */}
                                                <div className="divide-y divide-gray-100 dark:divide-gray-800">

                                                    {/* Row 1: Raw input */}
                                                    <div className="flex items-center justify-between px-3.5 py-2 bg-white dark:bg-gray-900">
                                                        <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                                            <span className="text-base">📥</span>
                                                            Tổng số nhập vào
                                                        </span>
                                                        <span className="font-bold text-gray-800 dark:text-gray-200 tabular-nums">{rawCount} số</span>
                                                    </div>

                                                    {/* Row 2: In-list duplicates */}
                                                    {(inListDupCount > 0 || invalidCount > 0) && (
                                                        <div className="flex items-center justify-between px-3.5 py-2 bg-white dark:bg-gray-900">
                                                            <span className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                                                <span className="text-base">🔁</span>
                                                                <span>
                                                                    Trùng trong danh sách{invalidCount > 0 ? ` / Không hợp lệ` : ''}
                                                                    {inListDupCount > 0 && invalidCount > 0 && <span className="ml-1 text-[10px] text-gray-400">({inListDupCount} trùng + {invalidCount} lỗi)</span>}
                                                                    {inListDupCount > 0 && invalidCount === 0 && <span className="ml-1 text-[10px] text-gray-400">(đã gộp)</span>}
                                                                    {inListDupCount === 0 && invalidCount > 0 && <span className="ml-1 text-[10px] text-gray-400">({invalidCount} số lỗi định dạng)</span>}
                                                                </span>
                                                            </span>
                                                            <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">−{inListDupCount + invalidCount} số</span>
                                                        </div>
                                                    )}

                                                    {/* Row 3: CRM duplicates */}
                                                    <div className={`flex items-center justify-between px-3.5 py-2 ${
                                                        crmDupCount > 0
                                                            ? 'bg-amber-50/60 dark:bg-amber-950/20'
                                                            : 'bg-white dark:bg-gray-900'
                                                    }`}>
                                                        <span className="flex items-center gap-2">
                                                            <span className="text-base">{crmDupCount > 0 ? '⚠️' : '✅'}</span>
                                                            <span className={crmDupCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'}>
                                                                Trùng CRM (tất cả tài khoản)
                                                            </span>
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            {formSkipCrmExisting && crmDupCount > 0 && (
                                                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">✓ sẽ bỏ qua</span>
                                                            )}
                                                            <span className={`font-semibold tabular-nums ${
                                                                crmDupCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'
                                                            }`}>
                                                                {crmDupCount > 0 ? `−${crmDupCount} số` : '0 số'}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Row 4: Actual scan count */}
                                                    <div className="flex items-center justify-between px-3.5 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border-t-2 border-emerald-200 dark:border-emerald-800">
                                                        <span className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-200">
                                                            <span className="text-base">🚀</span>
                                                            Thực tế sẽ quét Zalo
                                                        </span>
                                                        <strong className="text-sm font-extrabold bg-emerald-100 dark:bg-emerald-900/60 px-3 py-1 rounded-full text-emerald-800 dark:text-emerald-200 border border-emerald-300/60 dark:border-emerald-700/60 tabular-nums">
                                                            {actualScanCount} số
                                                        </strong>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Modal Footer actions */}
                            <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 bg-[#f4f5f8] dark:bg-gray-900 p-4">
                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateForm(false)}
                                        className="px-5 py-2.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200/60 dark:hover:bg-gray-800 transition-colors"
                                    >
                                        Hủy bỏ
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-6 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 active:scale-95 transition-all"
                                    >
                                        Khởi tạo lô quét
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Standardized Unified Label Picker Modal */}
            {showLabelPickerModal && (
                <UnifiedLabelPickerModal
                    open={showLabelPickerModal}
                    onClose={() => setShowLabelPickerModal(false)}
                    options={unifiedLabelOptions}
                    selected={formAutoTagIds.map(id => `local:${id}`)}
                    onChange={(selectedValues) => {
                        const numericIds = selectedValues
                            .map(v => (v.startsWith('local:') ? Number(v.split(':')[1]) : Number(v)))
                            .filter(id => !isNaN(id));
                        setFormAutoTagIds(numericIds);
                    }}
                    accounts={accounts}
                    onNewLabelCreated={() => {
                        fetchLocalLabels();
                    }}
                />
            )}

            {/* Modal: Re-assign batch contacts */}
            {showReassignModal && selectedBatch && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col text-gray-900 dark:text-gray-100">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
                            <h3 className="font-bold text-sm text-gray-900 dark:text-white">
                                ⚡ Chuyển quy tắc phân bổ liên hệ CRM cho Lô #{selectedBatch.id}
                            </h3>
                            <button
                                onClick={() => setShowReassignModal(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-lg"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-5 space-y-4 text-xs">
                            {!hasMultipleZaloAccounts ? (
                                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-600 dark:text-amber-300">
                                    ⚠️ Bạn chỉ đang sử dụng 1 tài khoản Zalo. Tất cả SĐT quét được trong Lô #{selectedBatch.id} mặc định được phân bổ về tài khoản Zalo duy nhất này.
                                </div>
                            ) : (
                                <>
                                    <p className="text-gray-600 dark:text-gray-300">
                                        Chọn quy tắc phân bổ mới để đồng bộ lại toàn bộ profile liên hệ và nhãn CRM cho các SĐT đã tìm thấy trong Lô quét này:
                                    </p>

                                    <div className="flex flex-col gap-2.5">
                                        <label
                                            onClick={() => setReassignMode('distributed')}
                                            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                                                reassignMode === 'distributed'
                                                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 ring-1 ring-emerald-500/20'
                                                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="reassign_mode"
                                                checked={reassignMode === 'distributed'}
                                                onChange={() => setReassignMode('distributed')}
                                                className="mt-0.5"
                                            />
                                            <div>
                                                <div className="font-bold text-gray-900 dark:text-white">🟢 Phân tán theo tài khoản trực tiếp quét</div>
                                                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Tài khoản Zalo nào quét được SĐT nào thì lưu profile và gán nhãn thuộc về tài khoản đó.</div>
                                            </div>
                                        </label>

                                        <label
                                            onClick={() => setReassignMode('single')}
                                            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                                                reassignMode === 'single'
                                                    ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-500 ring-1 ring-blue-500/20'
                                                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="reassign_mode"
                                                checked={reassignMode === 'single'}
                                                onChange={() => setReassignMode('single')}
                                                className="mt-0.5"
                                            />
                                            <div className="flex-1">
                                                <div className="font-bold text-gray-900 dark:text-white">🔵 Gom toàn bộ về 1 tài khoản chỉ định</div>
                                                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Chuyển toàn bộ SĐT tìm thấy về lưu profile và gán nhãn ở 1 tài khoản Zalo đích.</div>
                                                {reassignMode === 'single' && (
                                                    <select
                                                        value={reassignAccountId}
                                                        onChange={e => setReassignAccountId(e.target.value)}
                                                        className="w-full mt-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-900 dark:text-gray-100"
                                                    >
                                                        <option value="">-- Chọn tài khoản Zalo nhận dữ liệu --</option>
                                                        {visibleAccounts.filter(acc => !acc.channel || acc.channel === 'zalo').map(acc => (
                                                            <option key={acc.zalo_id} value={acc.zalo_id}>
                                                                {acc.full_name || acc.zalo_id}
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                            </div>
                                        </label>

                                        <label
                                            onClick={() => setReassignMode('all_accounts')}
                                            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                                                reassignMode === 'all_accounts'
                                                    ? 'bg-purple-50 dark:bg-purple-950/30 border-purple-500 ring-1 ring-purple-500/20'
                                                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="reassign_mode"
                                                checked={reassignMode === 'all_accounts'}
                                                onChange={() => setReassignMode('all_accounts')}
                                                className="mt-0.5"
                                            />
                                            <div>
                                                <div className="font-bold text-gray-900 dark:text-white">🟣 Đồng bộ có mặt ở TẤT CẢ các tài khoản Zalo</div>
                                                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Tự động nhân bản profile và nhãn CRM cho tất cả các tài khoản Zalo active trong hệ thống.</div>
                                            </div>
                                        </label>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-850 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowReassignModal(false)}
                                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={handleReassignBatch}
                                disabled={isReassigning}
                                className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-all disabled:opacity-50"
                            >
                                {isReassigning ? 'Đang đồng bộ...' : 'Áp dụng quy tắc mới'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showImportWizard && (
                <ImportWizardModal
                    initialFile={wizardInitialFile}
                    batchConfig={currentBatchConfig}
                    onClose={() => {
                        setShowImportWizard(false);
                        setWizardInitialFile(null);
                    }}
                    onSuccess={() => {
                        setShowCreateForm(false);
                        fetchBatches();
                    }}
                />
            )}
        </div>
    );
}
