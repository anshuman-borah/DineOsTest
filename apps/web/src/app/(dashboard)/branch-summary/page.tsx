'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  IndianRupee, ShoppingCart, BedDouble, Key, LogOut, AlertTriangle,
  Clock, Users, SprayCan, Activity, Banknote, CreditCard, Smartphone,
  Wallet, RefreshCw, TrendingUp, Package, CheckCircle2, ChefHat,
  Download, Calendar, Building2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import dayjs from 'dayjs';
import { cn } from '@/lib/utils';

// ── helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const fmtShort = (n: number) => {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000)    return `₹${(n / 1_000).toFixed(1)}K`;
  return fmt(n);
};

function today()      { return new Date().toISOString().slice(0, 10); }
function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const PAYMENT_ICONS: Record<string, React.ElementType> = {
  cash: Banknote, card: CreditCard, upi: Smartphone, wallet: Wallet,
};

// ── sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, color = 'text-slate-400', warn = false,
}: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; color?: string; warn?: boolean;
}) {
  return (
    <div className={cn(
      'bg-white dark:bg-slate-900 border rounded-xl p-4',
      warn ? 'border-red-300 dark:border-red-800/60' : 'border-slate-200 dark:border-slate-800',
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
        <Icon size={14} className={warn ? 'text-red-500' : color} />
      </div>
      <div className={cn('text-2xl font-bold', warn ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white')}>
        {value}
      </div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <Icon size={15} className="text-amber-500" />
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function BranchSummaryPage() {
  const { user, branchId } = useAuthStore();
  const [from, setFrom] = useState(monthStart());
  const [to,   setTo]   = useState(today());

  const { data: s, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['branch-summary', branchId, from, to],
    queryFn: () =>
      apiFetch(`/api/v1/reports/branch-summary?from=${from}&to=${to}`).then((r) => r.data),
    refetchInterval: 60_000,
  });

  // ── CSV Export ──────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!s) return;

    const rows: string[][] = [
      ['Branch Summary Report'],
      [`Period: ${from} to ${to}`],
      [''],
      ['REVENUE'],
      ['Metric', 'Value'],
      ['Total Revenue',       fmt(s.revenue?.total      || 0)],
      ['Restaurant Revenue',  fmt(s.revenue?.restaurant || 0)],
      ['Hotel Revenue',       fmt(s.revenue?.hotel      || 0)],
      ['Monthly Revenue',     fmt(s.revenue?.month      || 0)],
      ['Total Bills',         String(s.revenue?.totalBills || 0)],
      [''],
      ['RESTAURANT'],
      ['Metric', 'Value'],
      ['Orders (Period)',     String(s.restaurant?.ordersToday   || 0)],
      ['Billed Orders',       String(s.restaurant?.billedOrders  || 0)],
      ['Pending Orders',      String(s.restaurant?.pendingOrders || 0)],
      ['Bills',               String(s.restaurant?.billsToday    || 0)],
      ['Avg Order Value',     fmt(s.restaurant?.avgOrderValue    || 0)],
      ['Open Shifts',         String(s.restaurant?.openShifts    || 0)],
      ['Low Stock Items',     String(s.restaurant?.lowStockItems || 0)],
      [''],
      ['HOTEL (Live)'],
      ['Metric', 'Value'],
      ['Reservations Today',  String(s.hotel?.reservationsToday  || 0)],
      ['Check-ins Today',     String(s.hotel?.checkinsToday      || 0)],
      ['Check-outs Today',    String(s.hotel?.checkoutsToday     || 0)],
      ['In-House',            String(s.hotel?.inHouse            || 0)],
      ['Available Rooms',     String(s.hotel?.availableRooms     || 0)],
      ['Total Rooms',         String(s.hotel?.totalRooms         || 0)],
      ['Occupancy %',         `${s.hotel?.occupancyPct || 0}%`],
      ['HK Pending',          String(s.hotel?.housekeepingPending || 0)],
      [''],
      ['STAFF (Live)'],
      ['Role', 'Count'],
      ['Total',        String(s.staff?.total        || 0)],
      ['Cashiers',     String(s.staff?.cashiers     || 0)],
      ['Waiters',      String(s.staff?.waiters      || 0)],
      ['Kitchen',      String(s.staff?.kitchen      || 0)],
      ['Receptionist', String(s.staff?.receptionist || 0)],
      ['Housekeeping', String(s.staff?.housekeeping || 0)],
      [''],
      ['PAYMENTS (Period)'],
      ['Method', 'Amount', 'Transactions'],
      ...(s.paymentBreakdown || []).map((p: any) => [p.method, fmt(p.total), String(p.txns)]),
    ];

    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `branch-summary-${from}-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-slate-500 flex items-center gap-2">
          <Activity className="animate-spin" size={16} /> Loading branch summary…
        </div>
      </div>
    );
  }

  const totalRev     = Number(s?.revenue?.total      || 0);
  const restaurantRev = Number(s?.revenue?.restaurant || 0);
  const hotelRev     = Number(s?.revenue?.hotel       || 0);
  const posShare     = totalRev > 0 ? Math.round((restaurantRev / totalRev) * 100) : 0;
  const hotelShare   = totalRev > 0 ? 100 - posShare : 0;
  const hasAlerts    = (s?.alerts?.lowStock || 0) + (s?.alerts?.openShifts || 0) + (s?.alerts?.housekeepingPending || 0) > 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 lg:p-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 size={22} className="text-amber-500" />
            Branch Summary
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {dayjs().format('dddd, D MMMM YYYY')} ·{' '}
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              {user?.firstName} {user?.lastName}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="text-sm bg-transparent text-slate-900 dark:text-white outline-none" />
            <span className="text-slate-400 text-sm">→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="text-sm bg-transparent text-slate-900 dark:text-white outline-none" />
          </div>

          {/* Quick ranges */}
          {[
            { label: 'Today',  f: today(),      t: today() },
            { label: 'Month',  f: monthStart(), t: today() },
          ].map(({ label, f, t }) => (
            <button key={label}
              onClick={() => { setFrom(f); setTo(t); }}
              className={cn(
                'text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors',
                from === f && to === t
                  ? 'bg-amber-500 border-amber-500 text-slate-900'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-amber-400',
              )}>
              {label}
            </button>
          ))}

          <button onClick={() => refetch()}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-amber-500 transition-colors"
            title="Refresh">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>

          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-900 text-sm font-semibold transition-colors">
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* ── Revenue Hero ────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-amber-600/20 via-amber-500/10 to-slate-900 border border-amber-300 dark:border-amber-500/30 rounded-2xl p-5 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-amber-600 dark:text-amber-300 uppercase tracking-widest">
              Period Revenue
            </div>
            <div className="text-4xl font-extrabold text-slate-900 dark:text-white mt-1">
              {fmt(totalRev)}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {s?.revenue?.totalBills || 0} bills · Monthly: {fmtShort(s?.revenue?.month || 0)}
            </div>
          </div>
          <div className="flex gap-3">
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 min-w-[140px]">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1"><ShoppingCart size={11} /> Restaurant</div>
              <div className="text-xl font-bold text-blue-500">{fmt(restaurantRev)}</div>
              <div className="text-xs text-slate-400 mt-0.5">{posShare}% of total</div>
            </div>
            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 min-w-[140px]">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1"><BedDouble size={11} /> Hotel</div>
              <div className="text-xl font-bold text-emerald-500">{fmt(hotelRev)}</div>
              <div className="text-xs text-slate-400 mt-0.5">{hotelShare}% of total</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Alerts Banner ───────────────────────────────────────────────────── */}
      {hasAlerts && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl px-4 py-3 flex flex-wrap gap-4 items-center">
          <AlertTriangle size={15} className="text-red-500" />
          {(s?.alerts?.lowStock || 0) > 0 && (
            <span className="text-sm text-red-600 dark:text-red-400 font-medium">
              ⚠ Low Inventory: {s.alerts.lowStock} items
            </span>
          )}
          {(s?.alerts?.openShifts || 0) > 0 && (
            <span className="text-sm text-red-600 dark:text-red-400 font-medium">
              ⚠ Open Shifts: {s.alerts.openShifts}
            </span>
          )}
          {(s?.alerts?.housekeepingPending || 0) > 0 && (
            <span className="text-sm text-red-600 dark:text-red-400 font-medium">
              ⚠ HK Pending: {s.alerts.housekeepingPending} tasks
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left 2/3: Main KPIs + Chart ──────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Restaurant */}
          <SectionCard title="Restaurant" icon={ShoppingCart}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard icon={ShoppingCart} label="Orders"       value={s?.restaurant?.ordersToday   || 0}  sub={`${s?.restaurant?.pendingOrders || 0} pending`} color="text-blue-400" />
              <KpiCard icon={IndianRupee}  label="Bills"        value={s?.restaurant?.billsToday    || 0}  color="text-blue-400" />
              <KpiCard icon={TrendingUp}   label="Avg Order"    value={fmtShort(s?.restaurant?.avgOrderValue || 0)} color="text-amber-500" />
              <KpiCard icon={CheckCircle2} label="Billed"       value={s?.restaurant?.billedOrders  || 0}  sub="Completed" color="text-emerald-400" />
              <KpiCard icon={Clock}        label="Open Shifts"  value={s?.restaurant?.openShifts    || 0}  warn={s?.restaurant?.openShifts > 0} />
              <KpiCard icon={Package}      label="Low Stock"    value={s?.restaurant?.lowStockItems || 0}  warn={s?.restaurant?.lowStockItems > 0} sub="Items" />
            </div>
          </SectionCard>

          {/* Hotel (always live) */}
          <SectionCard title="Hotel — Live" icon={BedDouble}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard icon={BedDouble}   label="Reservations"  value={s?.hotel?.reservationsToday   || 0}  sub="Today" color="text-purple-400" />
              <KpiCard icon={Key}         label="Check-ins"     value={s?.hotel?.checkinsToday        || 0}  sub="Today" color="text-emerald-400" />
              <KpiCard icon={LogOut}      label="Check-outs"    value={s?.hotel?.checkoutsToday       || 0}  sub="Today" color="text-blue-400" />
              <KpiCard icon={Activity}    label="Occupancy"     value={`${s?.hotel?.occupancyPct || 0}%`}   sub={`${s?.hotel?.inHouse || 0} in-house`} color="text-amber-500" />
              <KpiCard icon={BedDouble}   label="Available"     value={s?.hotel?.availableRooms       || 0}  sub={`of ${s?.hotel?.totalRooms || 0}`} color="text-slate-400" />
              <KpiCard icon={SprayCan}    label="HK Pending"    value={s?.hotel?.housekeepingPending  || 0}  warn={s?.hotel?.housekeepingPending > 0} sub="Today" />
            </div>
          </SectionCard>

          {/* Revenue Chart */}
          <SectionCard title="Revenue by Day" icon={TrendingUp}>
            {(!s?.weeklyChart?.length) ? (
              <div className="h-[180px] flex items-center justify-center text-sm text-slate-400">
                No data for selected period
              </div>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={s.weeklyChart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmtShort} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }}
                      formatter={(v: number, name: string) => [fmt(v), name === 'pos' ? 'Restaurant' : 'Hotel']}
                    />
                    <Legend formatter={(v) => v === 'pos' ? 'Restaurant' : 'Hotel'} wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                    <Bar dataKey="pos"   stackId="r" fill="#3b82f6" />
                    <Bar dataKey="hotel" stackId="r" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Right 1/3: Staff + Payments + Alerts ─────────────────────────── */}
        <div className="space-y-5">

          {/* Staff (always live) */}
          <SectionCard title="Staff — Live" icon={Users}>
            <div className="space-y-2.5">
              {[
                { label: 'Total Active',  value: s?.staff?.total        || 0, icon: Users,        bold: true  },
                { label: 'Cashiers',      value: s?.staff?.cashiers     || 0, icon: IndianRupee,  bold: false },
                { label: 'Waiters',       value: s?.staff?.waiters      || 0, icon: ChefHat,      bold: false },
                { label: 'Kitchen',       value: s?.staff?.kitchen      || 0, icon: ChefHat,      bold: false },
                { label: 'Receptionist',  value: s?.staff?.receptionist || 0, icon: Key,          bold: false },
                { label: 'Housekeeping',  value: s?.staff?.housekeeping || 0, icon: SprayCan,     bold: false },
              ].map(({ label, value, icon: Icon, bold }) => (
                <div key={label} className={cn('flex items-center justify-between py-1', bold && 'border-b border-slate-100 dark:border-slate-800 pb-2 mb-1')}>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Icon size={13} className="text-slate-400" />
                    <span className={bold ? 'font-semibold text-slate-900 dark:text-white' : ''}>{label}</span>
                  </div>
                  <span className={cn('font-semibold', bold ? 'text-slate-900 dark:text-white text-lg' : 'text-slate-700 dark:text-slate-300')}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Payments */}
          <SectionCard title="Collections (Period)" icon={IndianRupee}>
            {(!s?.paymentBreakdown?.length) ? (
              <p className="text-sm text-slate-400 py-3 text-center">No payments for selected period</p>
            ) : (
              <div className="space-y-3">
                {s.paymentBreakdown.map((p: any) => {
                  const Icon = PAYMENT_ICONS[p.method] || Wallet;
                  const pct  = totalRev > 0 ? Math.round((p.total / totalRev) * 100) : 0;
                  return (
                    <div key={p.method}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                          <Icon size={13} />
                          <span className="capitalize">{p.method}</span>
                          <span className="text-xs text-slate-400">({p.txns})</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{fmt(p.total)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between text-sm">
                  <span className="text-slate-500">Total</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {fmt(s.paymentBreakdown.reduce((a: number, p: any) => a + Number(p.total), 0))}
                  </span>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Alerts */}
          <div className={cn(
            'rounded-xl p-5 border',
            hasAlerts
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50'
              : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50',
          )}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className={hasAlerts ? 'text-red-500' : 'text-emerald-500'} />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Alerts</span>
            </div>
            <div className="space-y-2 text-sm">
              {[
                { label: 'Low Inventory',  count: s?.alerts?.lowStock            || 0 },
                { label: 'Open Shifts',    count: s?.alerts?.openShifts          || 0 },
                { label: 'HK Pending',     count: s?.alerts?.housekeepingPending || 0 },
              ].map(({ label, count }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className={count > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                    {count > 0 ? '⚠' : '✓'} {label}
                  </span>
                  <span className={cn('font-semibold', count > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
                    {count > 0 ? count : 'OK'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Period info */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs space-y-1">
            <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Period</div>
            <div className="text-slate-500">From: <span className="text-slate-700 dark:text-white">{from}</span></div>
            <div className="text-slate-500">To: <span className="text-slate-700 dark:text-white">{to}</span></div>
            <div className="text-slate-400 mt-1 italic">Hotel & staff metrics are always live (current state)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
