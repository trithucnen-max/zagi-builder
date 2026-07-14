import React, { useEffect, useState, useCallback } from 'react';

// Inline SVG icons — no external icon dependency needed
const ClockIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const XIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const AlertCircleIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const CheckCircleIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const SpinIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);

interface Checkpoint {
  id: string;
  workflow_id: string;
  workflow_name: string;
  triggered_by: string;
  resume_at: number;
  created_at: number;
  resume_node_id: string;
  wait_label: string;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'expired';
  error_message?: string;
}

function formatCountdown(resumeAt: number): string {
  const diff = resumeAt - Date.now();
  if (diff <= 0) return 'Sắp chạy...';
  const days    = Math.floor(diff / 86400_000);
  const hours   = Math.floor((diff % 86400_000) / 3600_000);
  const minutes = Math.floor((diff % 3600_000) / 60_000);
  if (days > 0)   return `${days} ngày ${hours} giờ`;
  if (hours > 0)  return `${hours} giờ ${minutes} phút`;
  return `${minutes} phút`;
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:    { label: 'Đang chờ',   className: 'bg-blue-100 text-blue-700' },
  processing: { label: 'Đang chạy', className: 'bg-yellow-100 text-yellow-700' },
  done:       { label: 'Hoàn thành', className: 'bg-green-100 text-green-700' },
  failed:     { label: 'Thất bại',   className: 'bg-red-100 text-red-700' },
  expired:    { label: 'Quá hạn',    className: 'bg-gray-100 text-gray-600' },
};

export function WorkflowCheckpointList() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await (window as any).api.workflow.getCheckpoints();
      setCheckpoints(res?.checkpoints || []);
    } catch {
      setCheckpoints([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Poll lại mỗi 30 giây
    const interval = setInterval(load, 30_000);
    // Cập nhật countdown mỗi 30 giây
    const tickInterval = setInterval(() => setTick(t => t + 1), 30_000);
    return () => {
      clearInterval(interval);
      clearInterval(tickInterval);
    };
  }, [load]);

  const handleCancel = async (id: string, workflowName: string) => {
    if (!confirm(`Huỷ bước đang chờ của workflow "${workflowName}"?\nThao tác này không thể hoàn tác.`)) return;
    setCancellingId(id);
    try {
      await (window as any).api.workflow.cancelCheckpoint(id);
      setCheckpoints(prev => prev.filter(cp => cp.id !== id));
    } finally {
      setCancellingId(null);
    }
  };

  const pending = checkpoints.filter(cp => cp.status === 'pending' || cp.status === 'processing');
  const failed  = checkpoints.filter(cp => cp.status === 'failed' || cp.status === 'expired');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        <SpinIcon className="animate-spin mr-2" />
        Đang tải...
      </div>
    );
  }

  if (checkpoints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
        <CheckCircleIcon className="text-gray-300" />
        <p className="text-sm">Không có bước nào đang chờ</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">
          {pending.length} đang chờ{failed.length > 0 ? ` · ${failed.length} thất bại` : ''}
        </span>
        <button
          onClick={load}
          className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
        >
          <SpinIcon /> Làm mới
        </button>
      </div>

      {/* Pending checkpoints */}
      {pending.length > 0 && (
        <section>
          <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Đang chờ resume</p>
          <div className="flex flex-col gap-2">
            {pending.map(cp => (
              <CheckpointRow
                key={cp.id}
                cp={cp}
                onCancel={() => handleCancel(cp.id, cp.workflow_name)}
                cancelling={cancellingId === cp.id}
              />
            ))}
          </div>
        </section>
      )}

      {/* Failed / expired checkpoints */}
      {failed.length > 0 && (
        <section className="mt-2">
          <p className="text-xs font-semibold text-red-500 mb-1.5 uppercase tracking-wide">Thất bại / Quá hạn</p>
          <div className="flex flex-col gap-2">
            {failed.map(cp => (
              <CheckpointRow
                key={cp.id}
                cp={cp}
                onCancel={() => handleCancel(cp.id, cp.workflow_name)}
                cancelling={cancellingId === cp.id}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CheckpointRow({
  cp,
  onCancel,
  cancelling,
}: {
  cp: Checkpoint;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const statusCfg = STATUS_CONFIG[cp.status] || STATUS_CONFIG.pending;
  const isError = cp.status === 'failed' || cp.status === 'expired';

  return (
    <div className={`
      flex items-start gap-3 rounded-lg border px-3 py-2.5
      ${isError ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}
    `}>
      {/* Icon */}
      <div className="mt-0.5 shrink-0">
        {isError
          ? <AlertCircleIcon className="text-red-400" />
          : <ClockIcon className="text-blue-400" />
        }
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800 truncate">{cp.workflow_name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusCfg.className}`}>
            {statusCfg.label}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 truncate">
          Bước: <span className="text-gray-700">{cp.wait_label || 'Chờ'}</span>
        </p>
        {!isError && (
          <p className="text-xs text-blue-600 mt-0.5">
            Resume lúc: {formatDateTime(cp.resume_at)}
            {' '}(<span className="font-medium">{formatCountdown(cp.resume_at)}</span> nữa)
          </p>
        )}
        {isError && cp.error_message && (
          <p className="text-xs text-red-500 mt-0.5 truncate" title={cp.error_message}>
            {cp.error_message}
          </p>
        )}
        <p className="text-[10px] text-gray-400 mt-0.5">
          Tạo: {formatDateTime(cp.created_at)}
        </p>
      </div>

      {/* Cancel button */}
      {(cp.status === 'pending' || isError) && (
        <button
          onClick={onCancel}
          disabled={cancelling}
          title="Huỷ checkpoint này"
          className="shrink-0 mt-0.5 p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
        >
          {cancelling ? (
            <SpinIcon className="animate-spin" />
          ) : (
            <XIcon />
          )}
        </button>
      )}
    </div>
  );
}
