'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2, TrendingUp, TrendingDown, ShoppingCart, BarChart3,
  Trophy, Minus, RefreshCw, Download, Calendar,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { apiFetch } from '@/lib/api';

// ── helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const fmtShort = (n: number) => {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return fmt(n);
};

function today() { return new Date().toISOString().slice(0, 10); }
function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4'];

// ── sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function GrowthBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-slate-400 text-xs">—</span>;
  if (pct === 0) return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Minus size={12} />0%</span>
  );
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full
      ${up ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
        : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? '+' : ''}{pct}%
    </span>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function BranchPerformancePage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['branch-performance', from, to],
    queryFn: () =>
      apiFetch(`/api/v1/reports/branch-performance?from=${from}&to=${to}`).then((r) => r.data),
  });

  const branches: any[] = data?.branches || [];
  const top: any = data?.topBranch || null;

  // CSV export
  const handleExport = () => {
    if (!branches.length) return;
    const headers = ['Rank', 'Branch', 'Code', 'City', 'Revenue', 'POS Revenue', 'Hotel Revenue', 'Orders', 'Bills', 'Growth %'];
    const rows = branches.map((b: any, i: number) => [
      i + 1, b.branchName, b.branchCode, b.city || '',
      b.revenue, b.posRevenue, b.hotelRevenue, b.orders, b.bills,
      b.growthPct !== null ? `${b.growthPct}%` : 'N/A',
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `branch-performance-${from}-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 size={24} className="text-amber-500" />
            Branch Performance
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Cross-branch revenue &amp; orders overview
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="text-sm bg-transparent text-slate-900 dark:text-white outline-none" />
            <span className="text-slate-400 text-sm">→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="text-sm bg-transparent text-slate-900 dark:text-white outline-none" />
          </div>
          <button onClick={() => refetch()}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-amber-500 transition-colors"
            title="Refresh">
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-900 text-sm font-semibold transition-colors">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400 text-sm animate-pulse">Loading branch data…</div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard icon={Building2} label="Total Branches" value={String(data?.totalBranches ?? 0)}
              sub="Active branches" color="bg-amber-500" />
            <KpiCard icon={BarChart3} label="Total Revenue" value={fmtShort(data?.totalRevenue ?? 0)}
              sub={`${from} → ${to}`} color="bg-blue-500" />
            <KpiCard icon={ShoppingCart} label="Total Orders" value={(data?.totalOrders ?? 0).toLocaleString('en-IN')}
              sub={`${data?.totalBills ?? 0} bills`} color="bg-emerald-500" />
            <KpiCard icon={TrendingUp} label="Avg Revenue / Branch" value={fmtShort(data?.avgRevenue ?? 0)}
              sub="Per active branch" color="bg-violet-500" />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left: Chart + Table */}
            <div className="lg:col-span-2 space-y-6">
              {/* Bar Chart */}
              {branches.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Revenue by Branch</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={branches} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="branchName" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => fmtShort(v)} tick={{ fontSize: 11 }} width={60} />
                      <Tooltip
                        formatter={(v: number) => [fmt(v), 'Revenue']}
                        contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }}
                      />
                      <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                        {branches.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Ranking Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Branch Ranking</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 uppercase tracking-wide">
                        <th className="px-4 py-3 text-left font-semibold">#</th>
                        <th className="px-4 py-3 text-left font-semibold">Branch</th>
                        <th className="px-4 py-3 text-right font-semibold">Revenue</th>
                        <th className="px-4 py-3 text-right font-semibold">Orders</th>
                        <th className="px-4 py-3 text-right font-semibold">Bills</th>
                        <th className="px-4 py-3 text-right font-semibold">Growth</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {branches.map((b: any, i: number) => (
                        <tr key={b.branchId}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3">
                            {i === 0 ? (
                              <span className="text-amber-500 text-base">🏆</span>
                            ) : (
                              <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs
                                flex items-center justify-center font-semibold">
                                {i + 1}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 dark:text-white">{b.branchName}</div>
                            <div className="text-xs text-slate-400">{b.city || b.branchCode}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                            {fmt(b.revenue)}
                            <div className="text-[10px] text-slate-400 font-normal">
                              POS {fmtShort(b.posRevenue)} · Hotel {fmtShort(b.hotelRevenue)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                            {b.orders.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                            {b.bills.toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <GrowthBadge pct={b.growthPct} />
                          </td>
                        </tr>
                      ))}
                      {branches.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-slate-400 text-sm">
                            No data for selected period
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right: Top Branch Spotlight */}
            <div className="space-y-4">
              {top && (
                <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl p-5 text-white shadow-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy size={18} />
                    <span className="text-sm font-semibold opacity-90">Best Performing Branch</span>
                  </div>
                  <p className="text-2xl font-bold">{top.branchName}</p>
                  {top.city && <p className="text-sm opacity-80 mt-0.5">{top.city}</p>}
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="opacity-75">Revenue</span>
                      <span className="font-semibold">{fmt(top.revenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-75">Orders</span>
                      <span className="font-semibold">{top.orders.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-75">POS</span>
                      <span className="font-semibold">{fmt(top.posRevenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-75">Hotel</span>
                      <span className="font-semibold">{fmt(top.hotelRevenue)}</span>
                    </div>
                    {top.growthPct !== null && (
                      <div className="flex justify-between pt-2 border-t border-white/20">
                        <span className="opacity-75">vs Prior Period</span>
                        <span className={`font-bold ${top.growthPct >= 0 ? 'text-white' : 'text-red-200'}`}>
                          {top.growthPct >= 0 ? '+' : ''}{top.growthPct}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Revenue Share donut-style list */}
              {branches.length > 0 && data?.totalRevenue > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Revenue Share</h2>
                  <div className="space-y-3">
                    {branches.map((b: any, i: number) => {
                      const pct = data.totalRevenue > 0
                        ? Math.round((b.revenue / data.totalRevenue) * 100) : 0;
                      return (
                        <div key={b.branchId}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-700 dark:text-slate-300 font-medium">{b.branchName}</span>
                            <span className="text-slate-500">{pct}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Period info */}
              {data?.period && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs text-slate-500 space-y-1">
                  <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Period Info</div>
                  <div>Current: <span className="text-slate-700 dark:text-white">{data.period.from} → {data.period.to}</span></div>
                  <div>Compared to: <span className="text-slate-700 dark:text-white">{data.period.prevFrom} → {data.period.prevTo}</span></div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
