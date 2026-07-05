import React, { useEffect, useState, useMemo } from 'react';
import ipc from '@/lib/ipc';

// ── Types ──────────────────────────────────────────────────────────────────────
interface CallLog {
  id: string;
  timestamp: number;
  isSelf: boolean;  // true = nhân viên gọi đi, false = khách gọi đến
  duration: number; // giây
  missed: boolean;
}

interface Props {
  contactId: string;
  contactName: string;
  activeAccountId: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
export function formatDuration(secs: number): string {
  if (!secs || secs <= 0) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}p ${s}s` : `${s}s`;
}

export function formatTs(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (dDay === today) return `Hôm nay ${time}`;
  if (dDay === yesterday) return `Hôm qua ${time}`;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ` ${time}`;
}


function exportCsv(logs: CallLog[], contactName: string) {
  const header = 'Thời gian,Hướng,Trạng thái,Thời lượng (giây)';
  const rows = logs.map(l => {
    const dir = l.isSelf ? 'Gọi đi' : 'Gọi đến';
    const status = l.missed ? 'Nhỡ' : 'Đã trả lời';
    const time = new Date(l.timestamp).toLocaleString('vi-VN');
    return `"${time}","${dir}","${status}",${l.duration}`;
  });
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `call-log-${contactName}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function CRMCallLogTab({ contactId, contactName, activeAccountId }: Props) {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!contactId || !activeAccountId) return;
    let cancelled = false;
    setLoading(true);
    ipc.db?.getCallLogsForContact({ zaloId: activeAccountId, threadId: contactId })
      .then((res: any) => {
        if (!cancelled && res?.success) setLogs(res.logs || []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [contactId, activeAccountId]);

  // Aggregate stats
  const stats = useMemo(() => {
    const total = logs.length;
    const missed = logs.filter(l => l.missed).length;
    const answered = total - missed;
    const outbound = logs.filter(l => l.isSelf).length;
    const inbound = total - outbound;
    const callbackCount = logs.filter(l => !l.isSelf && !l.missed).length; // khách gọi đến & không nhỡ
    const totalDuration = logs.reduce((sum, l) => sum + (l.missed ? 0 : l.duration), 0);
    return { total, missed, answered, outbound, inbound, callbackCount, totalDuration };
  }, [logs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-gray-500">
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-sm">Đang tải lịch sử cuộc gọi...</span>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-500">
        <span className="text-3xl">📞</span>
        <p className="text-sm">Chưa có cuộc gọi nào với {contactName}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* ── Stats Row ──────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard icon="📞" label="Tổng cuộc gọi" value={stats.total} />
        <StatCard icon="⏱" label="Tổng thời gian" value={formatDuration(stats.totalDuration) || '—'} />
        <StatCard icon="📵" label="Cuộc gọi nhỡ" value={stats.missed} accent={stats.missed > 0 ? 'red' : undefined} />
        <StatCard icon="📤" label="Gọi đi" value={stats.outbound} />
        <StatCard icon="📲" label="Gọi đến" value={stats.inbound} />
        <StatCard
          icon="🔄" label="Khách gọi lại" value={stats.callbackCount}
          accent={stats.callbackCount > 0 ? 'green' : undefined}
        />
      </div>

      {/* ── Export + Header ────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 font-medium">Lịch sử (mới nhất trước)</span>
        <button
          onClick={() => exportCsv(logs, contactName)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-2 py-1 transition-colors"
        >
          ↓ Xuất CSV
        </button>
      </div>

      {/* ── Call Log List ──────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        {logs.map(log => (
          <CallRow key={log.id} log={log} />
        ))}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, accent }: { icon: string; label: string; value: string | number; accent?: 'red' | 'green' }) {
  const accentClass = accent === 'red' ? 'border-red-500/30 bg-red-500/5' : accent === 'green' ? 'border-green-500/30 bg-green-500/5' : 'border-gray-700/50 bg-gray-800/30';
  const valueClass = accent === 'red' ? 'text-red-400' : accent === 'green' ? 'text-green-400' : 'text-white';
  return (
    <div className={`rounded-lg border p-2.5 flex flex-col gap-0.5 ${accentClass}`}>
      <div className="flex items-center gap-1">
        <span className="text-base leading-none">{icon}</span>
        <span className="text-[10px] text-gray-500 font-medium leading-tight">{label}</span>
      </div>
      <span className={`text-lg font-bold leading-tight ${valueClass}`}>{value}</span>
    </div>
  );
}

function CallRow({ log }: { log: CallLog }) {
  let icon: string;
  let label: string;
  let labelClass: string;

  if (log.missed && log.isSelf) {
    // Nhân viên gọi đi nhưng khách không bắt
    icon = '📵'; label = 'Gọi đi — nhỡ'; labelClass = 'text-red-400';
  } else if (log.missed && !log.isSelf) {
    // Khách gọi đến nhưng nhân viên không bắt
    icon = '📵'; label = 'Gọi đến — nhỡ'; labelClass = 'text-red-400';
  } else if (log.isSelf) {
    icon = '📤'; label = 'Gọi đi'; labelClass = 'text-blue-400';
  } else {
    icon = '📲'; label = 'Gọi đến'; labelClass = 'text-green-400';
  }

  return (
    <div className="flex items-center gap-2 py-2 px-2.5 rounded-lg hover:bg-gray-800/40 transition-colors border border-transparent hover:border-gray-700/50">
      <span className="text-lg flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-medium ${labelClass}`}>{label}</span>
        <p className="text-[11px] text-gray-500 mt-0.5">{formatTs(log.timestamp)}</p>
      </div>
      {!log.missed && log.duration > 0 && (
        <span className="text-xs text-gray-400 font-mono flex-shrink-0">⏱ {formatDuration(log.duration)}</span>
      )}
    </div>
  );
}
