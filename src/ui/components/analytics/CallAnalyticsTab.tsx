import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useAccountStore } from '@/store/accountStore';
import ipc from '@/lib/ipc';

// ── Types ──────────────────────────────────────────────────────────────────────
interface CallTotals {
  total: number;
  answered: number;
  missed: number;
  inbound: number;
  outbound: number;
  totalDuration: number;
}
interface ContactRow {
  threadId: string;
  total: number;
  answered: number;
  missed: number;
  inbound: number;
  outbound: number;
  totalDuration: number;
}
interface DayRow {
  day: string;
  total: number;
  answered: number;
  missed: number;
  inbound: number;
  outbound: number;
  totalDuration: number;
}
interface ReportData {
  byContact: ContactRow[];
  byDay: DayRow[];
  totals: CallTotals;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
export function fmtDuration(secs: number): string {
  if (!secs || secs <= 0) return '0s';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}p`;
  if (m > 0) return `${m}p ${s}s`;
  return `${s}s`;
}

export function fmtDay(dayStr: string): string {
  const [, m, d] = dayStr.split('-');
  return `${d}/${m}`;
}


function exportCsv(byContact: ContactRow[], accounts: any[]) {
  const header = 'Khách hàng (threadId),Tổng cuộc,Đã trả lời,Nhỡ,Gọi đi,Gọi đến,Tổng TG (giây)';
  const rows = byContact.map(r =>
    `"${r.threadId}",${r.total},${r.answered},${r.missed},${r.outbound},${r.inbound},${r.totalDuration}`
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `call-report-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KPICard({ icon, label, value, sub, accent = 'blue' }: { icon: string; label: string; value: string | number; sub?: string; accent?: 'blue' | 'green' | 'red' | 'orange' }) {
  const styles = {
    blue:   'from-blue-500/10 to-blue-600/5 border-blue-500/20',
    green:  'from-green-500/10 to-green-600/5 border-green-500/20',
    red:    'from-red-500/10 to-red-600/5 border-red-500/20',
    orange: 'from-orange-500/10 to-orange-600/5 border-orange-500/20',
  };
  return (
    <div className={`bg-gradient-to-br ${styles[accent]} border rounded-xl p-4 flex flex-col gap-1`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-gray-400 font-medium">{label}</span>
      </div>
      <span className="text-2xl font-bold text-white">{value}</span>
      {sub && <span className="text-[11px] text-gray-500">{sub}</span>}
    </div>
  );
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl text-xs">
      <p className="text-gray-300 font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
interface Props {
  sinceTs: number;
  untilTs: number;
  periodDays: number;
  isBoss?: boolean;            // true = boss (xem được tất cả)
  assignedAccounts?: string[]; // danh sách tài khoản được gán cho nhân viên
}

export default function CallAnalyticsTab({ sinceTs, untilTs, periodDays, isBoss = false, assignedAccounts }: Props) {
  const { accounts, activeAccountId } = useAccountStore();

  // Account selector — boss thấy all, employee chỉ thấy tài khoản được gán
  const availableAccounts = useMemo(() => {
    if (!isBoss && assignedAccounts) {
      return accounts.filter(a => assignedAccounts.includes(a.id));
    }
    return accounts;
  }, [accounts, isBoss, assignedAccounts]);

  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    if (!isBoss && assignedAccounts && assignedAccounts.length > 0) {
      if (activeAccountId && assignedAccounts.includes(activeAccountId)) {
        return activeAccountId;
      }
      return assignedAccounts[0];
    }
    return activeAccountId || (accounts[0]?.id ?? '');
  });


  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});

  // Load report
  const load = useCallback(async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      const res = await ipc.db?.getCallReport({ zaloId: selectedAccountId, fromTs: sinceTs, toTs: untilTs });
      if (res?.success) {
        setData({ byContact: res.byContact || [], byDay: res.byDay || [], totals: res.totals || {} as CallTotals });
        // Resolve contact names from conversations list
        const ids = (res.byContact || []).map((c: ContactRow) => c.threadId);
        if (ids.length > 0) {
          const namesRes = await ipc.db?.getContactNamesBatch?.({ zaloId: selectedAccountId, contactIds: ids }).catch(() => null);
          if (namesRes?.success) setContactNames(namesRes.names || {});
        }
      }
    } catch {}
    finally { setLoading(false); }
  }, [selectedAccountId, sinceTs, untilTs]);

  useEffect(() => { load(); }, [load]);

  // Chart data: fill missing days with 0
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.byDay.map(d => ({
      day: fmtDay(d.day),
      'Gọi đi': d.outbound,
      'Gọi đến': d.inbound,
      'Nhỡ': d.missed,
    }));
  }, [data]);

  const totals = data?.totals ?? { total: 0, answered: 0, missed: 0, inbound: 0, outbound: 0, totalDuration: 0 };
  const missedPct = totals.total > 0 ? Math.round((totals.missed / totals.total) * 100) : 0;
  const callbackCount = data?.byContact.reduce((sum, c) => sum + (c.inbound > 0 && !c.missed ? 1 : 0), 0) ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Account Selector ──────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Tài khoản Zalo:</span>
          <select
            value={selectedAccountId}
            onChange={e => setSelectedAccountId(e.target.value)}
            disabled={!isBoss && (!assignedAccounts || assignedAccounts.length <= 1)}
            className="bg-gray-800 border border-gray-600 rounded-lg text-xs text-white px-3 py-1.5 focus:outline-none focus:border-blue-500 disabled:opacity-60"
          >
            {availableAccounts.map(a => (
              <option key={a.id} value={a.id}>{a.name || a.id}</option>
            ))}
          </select>
        </div>
        {loading && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Đang tải...
          </div>
        )}
        {data && !loading && (
          <button
            onClick={() => exportCsv(data.byContact, availableAccounts)}
            className="ml-auto flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition-colors"
          >
            ↓ Xuất CSV
          </button>
        )}
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-700/30 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard icon="📞" label="Tổng cuộc gọi" value={totals.total.toLocaleString('vi-VN')}
            sub={`${totals.outbound} gọi đi · ${totals.inbound} gọi đến`} accent="blue" />
          <KPICard icon="⏱" label="Tổng thời gian" value={fmtDuration(totals.totalDuration)}
            sub={`TB: ${totals.answered > 0 ? fmtDuration(Math.round(totals.totalDuration / totals.answered)) : '—'}/cuộc`} accent="green" />
          <KPICard icon="📵" label="Cuộc gọi nhỡ" value={totals.missed}
            sub={`${missedPct}% tổng cuộc gọi`} accent="red" />
          <KPICard icon="🔄" label="Khách gọi lại" value={callbackCount}
            sub={`số khách chủ động gọi`} accent="orange" />
        </div>
      )}

      {/* ── Bar Chart: Volume theo ngày ───────────────────────── */}
      {!loading && chartData.length > 0 && (
        <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-medium mb-3">📈 Cuộc gọi theo ngày</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              <Bar dataKey="Gọi đi" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Gọi đến" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Nhỡ" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Top Contacts Table ────────────────────────────────── */}
      {!loading && data && data.byContact.length > 0 && (
        <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
            <p className="text-xs text-gray-400 font-medium">📋 Top khách hàng được gọi</p>
            <span className="text-[11px] text-gray-600">{data.byContact.length} khách hàng</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700/50">
                  <th className="text-left px-4 py-2 text-gray-500 font-medium">#</th>
                  <th className="text-left px-4 py-2 text-gray-500 font-medium">Khách hàng</th>
                  <th className="text-center px-3 py-2 text-gray-500 font-medium">Tổng</th>
                  <th className="text-center px-3 py-2 text-gray-500 font-medium">Gọi đi</th>
                  <th className="text-center px-3 py-2 text-gray-500 font-medium">Gọi đến</th>
                  <th className="text-center px-3 py-2 text-gray-500 font-medium">Nhỡ</th>
                  <th className="text-right px-4 py-2 text-gray-500 font-medium">Tổng TG</th>
                </tr>
              </thead>
              <tbody>
                {data.byContact.slice(0, 20).map((row, i) => {
                  const name = contactNames[row.threadId] || row.threadId;
                  const hasCallback = row.inbound > 0;
                  return (
                    <tr key={row.threadId} className="border-b border-gray-700/30 hover:bg-gray-700/20 transition-colors">
                      <td className="px-4 py-2 text-gray-600">{i + 1}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-200 font-medium truncate max-w-[150px]">{name}</span>
                          {hasCallback && (
                            <span className="flex-shrink-0 text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 rounded px-1 py-0.5">Gọi lại</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-white font-semibold">{row.total}</td>
                      <td className="px-3 py-2 text-center text-blue-400">{row.outbound}</td>
                      <td className="px-3 py-2 text-center text-green-400">{row.inbound}</td>
                      <td className="px-3 py-2 text-center">
                        {row.missed > 0 ? <span className="text-red-400">{row.missed}</span> : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-300 font-mono">{fmtDuration(row.totalDuration)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.byContact.length > 20 && (
            <div className="px-4 py-2 text-center text-[11px] text-gray-600 border-t border-gray-700/50">
              Hiển thị 20 / {data.byContact.length} khách. Xuất CSV để xem toàn bộ.
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────── */}
      {!loading && (!data || data.totals.total === 0) && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-500">
          <span className="text-4xl">📞</span>
          <p className="text-sm">Không có cuộc gọi nào trong khoảng thời gian này</p>
          <p className="text-xs text-gray-600">Thử chọn khoảng thời gian rộng hơn</p>
        </div>
      )}
    </div>
  );
}
