'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { apiFetch, apiPost } from '@/lib/api';
import {
  TrendingUp, ShoppingBag, AlertTriangle, IndianRupee,
  Clock, ChefHat, Users, CheckCircle, Play, Square, X,
  Gift, RotateCcw, Ban, Timer, AlertCircle,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const ORDER_STATUS_COLOR: Record<string, string> = {
  pending:   'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/20',
  confirmed: 'text-blue-400 bg-blue-900/20',
  preparing: 'text-purple-400 bg-purple-900/20',
  ready:     'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/20',
  served:    'text-slate-400 bg-slate-800',
};

// ← Order type display helper
function OrderTypeLabel({ type }: { type?: string }) {
  switch (type) {
    case 'dine_in':      return <span className="badge-slate text-xs">🍽 Dine In</span>;
    case 'takeaway':     return <span className="badge-slate text-xs">🥡 Takeaway</span>;
    case 'delivery':     return <span className="badge-slate text-xs">🛵 Delivery</span>;
    case 'room_service': return <span className="badge-slate text-xs">🛎 Room Service</span>;
    default:             return <span className="badge-slate text-xs capitalize">{type?.replace('_', ' ') || '—'}</span>;
  }
}

// ─── Open Shift Modal ──────────────────────────────────────────────────────────
function OpenShiftModal({ onClose, onOpened }: { onClose: () => void; onOpened: () => void }) {
  const [openingCash, setOpeningCash] = useState('');
  const mutation = useMutation({
    mutationFn: () => apiPost('/api/v1/shifts/open', { openingCash: parseFloat(openingCash) || 0 }),
    onSuccess: () => { toast.success('Shift opened'); onOpened(); onClose(); },
    onError:   (e: any) => toast.error(e.response?.data?.message || 'Failed to open shift'),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-white text-lg">Open Shift</h3>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>
        <div>
          <label className="label">Opening Cash in Drawer (₹)</label>
          <input
            className="input text-xl font-bold" type="number" min="0" step="0.50"
            value={openingCash} onChange={(e) => setOpeningCash(e.target.value)}
            placeholder="Enter amount" autoFocus
          />
          <div className="flex gap-2 mt-2 flex-wrap">
            {[0, 500, 1000, 2000, 5000].map((v) => (
              <button key={v} onClick={() => setOpeningCash(String(v))}
                className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-600 text-slate-600 dark:text-slate-300">
                ₹{v}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-primary flex-1">
            <Play size={14} /> {mutation.isPending ? 'Opening...' : 'Open Shift'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Close Shift Modal ─────────────────────────────────────────────────────────
function CloseShiftModal({
  shiftId, onClose, onClosed,
}: { shiftId: string; onClose: () => void; onClosed: () => void }) {
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes]             = useState('');
  const mutation = useMutation({
    mutationFn: () => apiPost(`/api/v1/shifts/${shiftId}/close`, {
      closingCash: parseFloat(closingCash) || 0, notes,
    }),
    onSuccess: () => { toast.success('Shift closed'); onClosed(); onClose(); },
    onError:   (e: any) => toast.error(e.response?.data?.message || 'Failed to close shift'),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 dark:text-white text-lg">Close Shift</h3>
          <button onClick={onClose} className="btn-ghost p-1"><X size={16} /></button>
        </div>
        <div>
          <label className="label">Closing Cash Count (₹)</label>
          <input
            className="input text-xl font-bold" type="number" min="0" step="0.50"
            value={closingCash} onChange={(e) => setClosingCash(e.target.value)}
            placeholder="Enter amount" autoFocus
          />
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input" rows={2} placeholder="Any handover notes..."
            value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-danger flex-1">
            <Square size={14} /> {mutation.isPending ? 'Closing...' : 'Close Shift'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shift Widget ──────────────────────────────────────────────────────────────
function ShiftWidget({
  shift, onOpenShift, onCloseShift,
}: { shift: any; onOpenShift: () => void; onCloseShift: () => void }) {
  if (shift) {
    return (
      <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700 rounded-xl px-4 py-2.5">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ChefHat size={13} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span className="text-emerald-700 dark:text-emerald-300 font-semibold text-sm">
              {shift.shiftNumber} — Open
            </span>
          </div>
          <p className="text-xs text-emerald-600/70 dark:text-emerald-500 mt-0.5 truncate">
            {shift.openedByUser?.fullName || 'Staff'} ·{' '}
            {dayjs(new Date(shift.openedAt)).fromNow(true)} ago ·{' '}
            ₹{Number(shift.totalSales || 0).toLocaleString('en-IN')} ·{' '}
            {shift.totalOrders || 0} orders
          </p>
        </div>
        <button
          onClick={onCloseShift}
          className="ml-auto flex-shrink-0 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:text-red-500 bg-red-100 dark:bg-red-900/20 hover:bg-red-200 dark:hover:bg-red-900/40 border border-red-300 dark:border-red-800 rounded-lg px-2.5 py-1.5 transition-all"
        >
          <Square size={11} /> Close
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5">
      <span className="w-2.5 h-2.5 rounded-full bg-slate-400 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">No Restaurant Shift Open</div>
        <p className="text-xs text-slate-500 mt-0.5">Open the restaurant shift to start accepting orders</p>
      </div>
      <button
        onClick={onOpenShift}
        className="ml-auto flex-shrink-0 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 hover:bg-amber-200 dark:hover:bg-amber-500/20 border border-amber-300 dark:border-amber-500/30 rounded-lg px-2.5 py-1.5 transition-all"
      >
        <Play size={11} /> Open Shift
      </button>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const qc = useQueryClient();
  const { branchId } = useAuthStore();
  const [openShiftModal,  setOpenShiftModal]  = useState(false);
  const [closeShiftModal, setCloseShiftModal] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ['dashboard', branchId],
    queryFn:  () => apiFetch('/api/v1/reports/dashboard').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const today = dayjs().format('YYYY-MM-DD');

  const { data: hourly } = useQuery({
    queryKey: ['hourly', branchId, today],
    queryFn:  () => apiFetch(`/api/v1/reports/hourly?date=${today}`).then((r) => r.data),
  });

  const { data: activeOrders } = useQuery({
    queryKey: ['active-orders', branchId],
    queryFn:  () => apiFetch('/api/v1/orders?status=pending,confirmed,preparing,ready&limit=8').then((r) => r.data),
    refetchInterval: 20_000,
  });

  const { data: shift, refetch: refetchShift } = useQuery({
    queryKey: ['current-shift', branchId],
    queryFn:  () => apiFetch('/api/v1/shifts/current').then((r) => r.data).catch(() => null),
    refetchInterval: 30_000,
  });

  const stats = [
    { label: "Today's Sales",    value: `₹${Number(summary?.todaySales    || 0).toLocaleString('en-IN')}`, icon: IndianRupee,   color: 'text-amber-600 dark:text-amber-400' },
    { label: "Today's Bills",    value: summary?.todayBills    || 0,                                         icon: ShoppingBag,  color: 'text-blue-400' },
    { label: 'Active Orders',    value: summary?.pendingOrders || 0,                                         icon: Clock,        color: 'text-purple-400' },
    { label: 'Low Stock Alerts', value: summary?.lowStockAlerts || 0,                                        icon: AlertTriangle, color: 'text-red-600 dark:text-red-400' },
  ];

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-500">{dayjs().format('dddd, D MMMM YYYY')}</p>
        </div>
        <ShiftWidget
          shift={shift}
          onOpenShift={() => setOpenShiftModal(true)}
          onCloseShift={() => setCloseShiftModal(true)}
        />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center justify-between">
              <span className="stat-label">{label}</span>
              <Icon size={16} className={color} />
            </div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hourly chart */}
        <div className="card lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4">Hourly Sales — Today</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourly || []} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <XAxis dataKey="hour" tick={{ fill: 'var(--chart-axis-text)', fontSize: 11 }} tickFormatter={(h) => `${h}:00`} />
              <YAxis tick={{ fill: 'var(--chart-axis-text)', fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
              <Tooltip
                contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)', borderRadius: 8, color: 'var(--chart-tooltip-text)' }}
                labelStyle={{ color: 'var(--chart-axis-text)' }}
                formatter={(v: any) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']}
                labelFormatter={(h) => `${h}:00 – ${Number(h) + 1}:00`}
              />
              <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                {(hourly || []).map((_: any, i: number) => (
                  <Cell key={i} fill={i === dayjs().hour() ? '#f59e0b' : 'var(--chart-bar-bg)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Week summary */}
        <div className="card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300">7-Day Revenue</h2>
              <TrendingUp size={16} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">
              ₹{Number(summary?.weekSales || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-slate-500 mt-1">Last 7 days</div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-500">Avg per Day</div>
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                ₹{Number((summary?.weekSales || 0) / 7).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Tables Occupied</div>
              <div className="text-lg font-bold text-purple-400">{summary?.occupiedTables || 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Order Statistics + Revenue Leakage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Order Statistics — Today</h2>
            <CheckCircle size={15} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Successful',    value: summary?.orderStats?.successful    ?? 0, icon: CheckCircle, bg: 'bg-emerald-500/15', color: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Cancelled',     value: summary?.orderStats?.cancelled     ?? 0, icon: Ban,         bg: 'bg-red-500/15',     color: 'text-red-600 dark:text-red-400' },
              { label: 'Complimentary', value: summary?.orderStats?.complimentary ?? 0, icon: Gift,        bg: 'bg-emerald-600/15', color: 'text-emerald-600 dark:text-emerald-300' },
              { label: 'Returns',       value: summary?.orderStats?.returns       ?? 0, icon: RotateCcw,   bg: 'bg-orange-500/15',  color: 'text-orange-400' },
            ].map(({ label, value, icon: Icon, bg, color }) => (
              <div key={label} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 flex items-center gap-3">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', bg)}>
                  <Icon size={15} className={color} />
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white">{value}</div>
                  <div className="text-xs text-slate-500">{label}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 bg-slate-100/40 dark:bg-slate-800/40 rounded-xl px-4 py-3">
            <Timer size={14} className="text-purple-400 flex-shrink-0" />
            <span className="text-xs text-slate-500 flex-1">Avg Table Turnaround</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">
              {summary?.tableStats?.avgTurnaroundMinutes ?? 0} min
            </span>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Revenue Leakage — Today</h2>
            <AlertCircle size={15} className="text-red-600 dark:text-red-400" />
          </div>
          <div className="space-y-3">
            {[
              { label: 'Voided Items', sub: 'Individual items removed from orders', value: summary?.revenuLeakage?.voidedItems ?? 0, icon: Ban, bg: 'bg-amber-100 dark:bg-amber-500/15', color: 'text-amber-600 dark:text-amber-400', activeColor: 'text-amber-600 dark:text-amber-400' },
              { label: 'Cancelled with Value', sub: 'Orders cancelled after items were added', value: summary?.revenuLeakage?.cancelledWithValue ?? 0, icon: AlertTriangle, bg: 'bg-red-500/15', color: 'text-red-600 dark:text-red-400', activeColor: 'text-red-600 dark:text-red-400' },
            ].map(({ label, sub, value, icon: Icon, bg, color, activeColor }) => (
              <div key={label} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-4 py-3">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', bg)}>
                  <Icon size={15} className={color} />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-slate-600 dark:text-slate-300 font-medium">{label}</div>
                  <div className="text-xs text-slate-500">{sub}</div>
                </div>
                <div className={cn('text-xl font-bold', value > 0 ? activeColor : 'text-slate-500')}>{value}</div>
              </div>
            ))}
            {(summary?.revenuLeakage?.voidedItems ?? 0) === 0 && (summary?.revenuLeakage?.cancelledWithValue ?? 0) === 0 && (
              <div className="flex items-center justify-center gap-2 py-4 text-emerald-600/70 text-sm">
                <CheckCircle size={15} /> No leakage detected today
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Orders */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-purple-400" />
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Live Orders</h2>
          </div>
          {activeOrders?.length > 0 && (
            <span className="badge-yellow text-xs">{activeOrders.length} active</span>
          )}
        </div>
        {!activeOrders || activeOrders.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-slate-600">
            <CheckCircle size={20} className="opacity-40" />
            <span className="text-sm">No active orders right now</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100/50 dark:bg-slate-800/50">
                <tr>
                  <th className="th">Order #</th>
                  <th className="th">Table</th>
                  <th className="th">Type</th>
                  <th className="th">Items</th>
                  <th className="th text-right">Total</th>
                  <th className="th">Status</th>
                  <th className="th">Time</th>
                </tr>
              </thead>
              <tbody>
                {activeOrders.map((order: any) => (
                  <tr key={order.id} className="table-row">
                    <td className="td font-medium text-amber-600 dark:text-amber-400">{order.orderNumber}</td>
                    <td className="td">{order.table?.name || <span className="text-slate-500 italic">—</span>}</td>
                    <td className="td">
                      {/* ← Fixed: shows emoji + proper label */}
                      <OrderTypeLabel type={order.type} />
                    </td>
                    <td className="td text-slate-500">{order.itemCount ?? order.items?.length ?? '—'}</td>
                    <td className="td text-right font-bold">₹{Number(order.grandTotal || 0).toFixed(2)}</td>
                    <td className="td">
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize', ORDER_STATUS_COLOR[order.status] || 'text-slate-400 bg-slate-800')}>
                        {order.status}
                      </span>
                    </td>
                    <td className="td text-slate-500 text-xs">{dayjs(order.createdAt).fromNow()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {openShiftModal && (
        <OpenShiftModal
          onClose={() => setOpenShiftModal(false)}
          onOpened={() => {
            refetchShift();
            qc.invalidateQueries({ queryKey: ['current-shift'] });
          }}
        />
      )}
      {closeShiftModal && shift && (
        <CloseShiftModal
          shiftId={shift.id}
          onClose={() => setCloseShiftModal(false)}
          onClosed={() => {
            refetchShift();
            qc.invalidateQueries({ queryKey: ['current-shift'] });
          }}
        />
      )}
    </div>
  );
}