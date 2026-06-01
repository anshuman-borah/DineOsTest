'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPost } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';
import {
  Clock, Lock, Unlock, IndianRupee,
  TrendingUp, User, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

// ─── Denomination helper ───────────────────────────────────────────────────────
const DENOMS = [
  { key: 'note2000', label: '₹2000', value: 2000 },
  { key: 'note500',  label: '₹500',  value: 500  },
  { key: 'note200',  label: '₹200',  value: 200  },
  { key: 'note100',  label: '₹100',  value: 100  },
  { key: 'note50',   label: '₹50',   value: 50   },
  { key: 'note20',   label: '₹20',   value: 20   },
  { key: 'note10',   label: '₹10',   value: 10   },
  { key: 'coin5',    label: '₹5',    value: 5    },
  { key: 'coin2',    label: '₹2',    value: 2    },
  { key: 'coin1',    label: '₹1',    value: 1    },
];

function denomTotal(counts: Record<string, number>) {
  return DENOMS.reduce((s, d) => s + (counts[d.key] || 0) * d.value, 0);
}

function fmt(n: number | string) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`;
}

function RoleBadge({ role }: { role?: string }) {
  if (!role) return null;
  const colors: Record<string, string> = {
    owner:     'bg-amber-500/20 text-amber-400',
    manager:   'bg-blue-500/20 text-blue-400',
    cashier:   'bg-emerald-500/20 text-emerald-400',
    waiter:    'bg-purple-500/20 text-purple-400',
    kitchen:   'bg-orange-500/20 text-orange-400',
    inventory: 'bg-slate-500/20 text-slate-400',
  };
  return (
    <span className={cn(
      'text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize',
      colors[role] || 'bg-slate-500/20 text-slate-400',
    )}>
      {role}
    </span>
  );
}

function UserCell({ user, fallbackId }: { user?: any; fallbackId?: string }) {
  if (user?.fullName) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 text-slate-200">
          <User size={11} className="text-slate-500 flex-shrink-0" />
          <span className="font-medium">{user.fullName}</span>
        </div>
        <RoleBadge role={user.role} />
      </div>
    );
  }
  if (fallbackId) {
    return (
      <span className="text-slate-500 text-xs font-mono">
        {fallbackId.slice(0, 8)}…
      </span>
    );
  }
  return <span className="text-slate-600">—</span>;
}

function DenominationCount({
  label, counts, onChange,
}: {
  label: string;
  counts: Record<string, number>;
  onChange: (k: string, v: number) => void;
}) {
  const total = denomTotal(counts);
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">{label}</h3>
        <span className="text-amber-400 font-bold text-lg">{fmt(total)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {DENOMS.map((d) => (
          <div key={d.key} className="flex items-center gap-2">
            <span className="text-xs text-slate-400 w-14">{d.label}</span>
            <input
              type="number" min={0}
              value={counts[d.key] || 0}
              onChange={(e) => onChange(d.key, parseInt(e.target.value) || 0)}
              className="input text-center py-1 text-sm w-16"
            />
            <span className="text-xs text-slate-500 w-20 text-right">
              = {fmt((counts[d.key] || 0) * d.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ShiftsPage() {
  const qc = useQueryClient();
  const { branchId } = useAuthStore();

  const [openingCash,   setOpeningCash]   = useState<number>(0);
  const [closingCounts, setClosingCounts] = useState<Record<string, number>>({});
  const [notes,         setNotes]         = useState('');
  const [showOpen,      setShowOpen]      = useState(false);
  const [showClose,     setShowClose]     = useState(false);
  const [expandedShift, setExpandedShift] = useState<string | null>(null);

  // ── Active shift ───────────────────────────────────────────────────────────
  const { data: activeShift } = useQuery({
    queryKey: ['activeShift', branchId],
    queryFn:  () => apiFetch('/api/v1/shifts/active').then((r) => r.data).catch(() => null),
    refetchInterval: 30_000,
    enabled: !!branchId,
  });

  // ── Shifts list ────────────────────────────────────────────────────────────
  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts', branchId],
    queryFn:  () => apiFetch('/api/v1/shifts').then((r) => r.data),
    enabled:  !!branchId,
  });

  const closingTotal = denomTotal(closingCounts);
  const expectedCash = activeShift
    ? Number(activeShift.openingCash || 0) + Number(activeShift.cashSales || 0)
    : 0;
  const difference = closingTotal - expectedCash;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const openMutation = useMutation({
    mutationFn: () => apiPost('/api/v1/shifts/open', { openingCash }),
    onSuccess: () => {
      toast.success('Shift opened!');
      qc.invalidateQueries({ queryKey: ['activeShift'] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
      qc.invalidateQueries({ queryKey: ['current-shift'] });
      setShowOpen(false);
      setOpeningCash(0);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to open shift'),
  });

  const closeMutation = useMutation({
    mutationFn: () => {
      if (!activeShift?.id) throw new Error('No active shift');
      return apiPost(`/api/v1/shifts/${activeShift.id}/close`, {
        closingCash:   closingTotal,
        denominations: closingCounts,
        notes:         notes || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Shift closed!');
      qc.invalidateQueries({ queryKey: ['activeShift'] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
      qc.invalidateQueries({ queryKey: ['current-shift'] });
      setShowClose(false);
      setClosingCounts({});
      setNotes('');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to close shift'),
  });

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Shift Management</h1>
        {!activeShift ? (
          <button onClick={() => setShowOpen(true)} className="btn-primary">
            <Unlock size={14} /> Open Shift
          </button>
        ) : (
          <button onClick={() => setShowClose(true)} className="btn-danger">
            <Lock size={14} /> Close Shift
          </button>
        )}
      </div>

      {/* Active Shift Card */}
      {activeShift ? (
        <div className="card border-emerald-700/50 bg-emerald-900/10">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="font-bold text-emerald-400">
              Active Shift — {activeShift.shiftNumber}
            </h2>
            <span className="text-xs text-slate-400">
              Since {dayjs(activeShift.openedAt).format('D MMM, h:mm A')}
              {' · '}{dayjs(activeShift.openedAt).fromNow()}
            </span>
          </div>

          {/* Who opened it */}
          <div className="flex items-center gap-2 mb-4 text-sm">
            <User size={13} className="text-slate-500" />
            <span className="text-slate-400">Opened by</span>
            <span className="text-white font-medium">
              {activeShift.openedByUser?.fullName || 'Staff'}
            </span>
            <RoleBadge role={activeShift.openedByUser?.role} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Sales',  value: fmt(activeShift.totalSales),  icon: TrendingUp,  color: 'text-amber-400'   },
              { label: 'Orders',       value: activeShift.totalOrders || 0, icon: Clock,       color: 'text-blue-400'    },
              { label: 'Cash Sales',   value: fmt(activeShift.cashSales),   icon: IndianRupee, color: 'text-emerald-400' },
              { label: 'Opening Cash', value: fmt(activeShift.openingCash), icon: IndianRupee, color: 'text-slate-300'   },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-slate-800/50 rounded-lg p-3">
                <div className="flex items-center gap-1 text-xs text-slate-400 mb-1">
                  <Icon size={11} className={color} /> {label}
                </div>
                <div className={cn('text-lg font-bold', color)}>{value}</div>
              </div>
            ))}
          </div>

          {(Number(activeShift.upiSales) > 0 ||
            Number(activeShift.cardSales) > 0 ||
            Number(activeShift.walletSales) > 0) && (
            <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-slate-500 text-xs mb-0.5">UPI</div>
                <div className="font-medium text-white">{fmt(activeShift.upiSales)}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs mb-0.5">Card</div>
                <div className="font-medium text-white">{fmt(activeShift.cardSales)}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs mb-0.5">Wallet</div>
                <div className="font-medium text-white">{fmt(activeShift.walletSales)}</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card text-center py-8 text-slate-500">
          <Lock size={32} className="mx-auto mb-2 opacity-30" />
          <p>No active shift. Open a shift to start accepting orders.</p>
        </div>
      )}

      {/* Shift History */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 font-semibold text-white">
          Shift History
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="th">Shift</th>
                <th className="th">Opened By</th>
                <th className="th">Closed By</th>
                <th className="th">Date</th>
                <th className="th text-right">Opening</th>
                <th className="th text-right">Cash Sales</th>
                <th className="th text-right">Expected</th>
                <th className="th text-right">Actual</th>
                <th className="th text-right">Difference</th>
                <th className="th text-center">Status</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(shifts) ? shifts : []).map((s: any) => {
                const diff     = Number(s.cashDifference || 0);
                const isExpand = expandedShift === s.id;
                return (
                  <>
                    <tr
                      key={s.id}
                      className="table-row cursor-pointer"
                      onClick={() => setExpandedShift(isExpand ? null : s.id)}
                    >
                      <td className="td font-medium text-amber-400">{s.shiftNumber}</td>

                      {/* Opened By — name + role */}
                      <td className="td">
                        <UserCell user={s.openedByUser} fallbackId={s.openedBy} />
                      </td>

                      {/* Closed By — name + role */}
                      <td className="td">
                        <UserCell user={s.closedByUser} fallbackId={s.closedBy} />
                      </td>

                      <td className="td text-slate-400 text-xs">
                        {dayjs(s.openedAt).format('D MMM, h:mm A')}
                      </td>
                      <td className="td text-right">{fmt(s.openingCash)}</td>
                      <td className="td text-right">{fmt(s.cashSales)}</td>
                      <td className="td text-right">{fmt(s.expectedCash)}</td>
                      <td className="td text-right">{fmt(s.closingCash)}</td>
                      <td className={cn('td text-right font-mono font-medium',
                        diff < 0 ? 'text-red-400' :
                        diff > 0 ? 'text-emerald-400' :
                        'text-slate-400',
                      )}>
                        {diff !== 0
                          ? `${diff > 0 ? '+' : ''}${fmt(Math.abs(diff))}`
                          : '₹0'}
                      </td>
                      <td className="td text-center">
                        <span className={s.status === 'open' ? 'badge-green' : 'badge-slate'}>
                          {s.status?.toUpperCase()}
                        </span>
                      </td>
                      <td className="td text-slate-500">
                        {isExpand ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {isExpand && (
                      <tr key={`${s.id}-exp`} className="bg-slate-800/30">
                        <td colSpan={11} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            <div>
                              <div className="text-slate-500 mb-1">UPI Sales</div>
                              <div className="font-medium text-white">{fmt(s.upiSales)}</div>
                            </div>
                            <div>
                              <div className="text-slate-500 mb-1">Card Sales</div>
                              <div className="font-medium text-white">{fmt(s.cardSales)}</div>
                            </div>
                            <div>
                              <div className="text-slate-500 mb-1">Wallet Sales</div>
                              <div className="font-medium text-white">{fmt(s.walletSales)}</div>
                            </div>
                            <div>
                              <div className="text-slate-500 mb-1">Complimentary</div>
                              <div className="font-medium text-emerald-400">{fmt(s.complimentary)}</div>
                            </div>
                            <div>
                              <div className="text-slate-500 mb-1">CGST Collected</div>
                              <div className="font-medium text-blue-400">{fmt(s.totalCgst)}</div>
                            </div>
                            <div>
                              <div className="text-slate-500 mb-1">SGST Collected</div>
                              <div className="font-medium text-purple-400">{fmt(s.totalSgst)}</div>
                            </div>
                            <div>
                              <div className="text-slate-500 mb-1">Total Orders</div>
                              <div className="font-medium text-white">{s.totalOrders}</div>
                            </div>
                            <div>
                              <div className="text-slate-500 mb-1">Duration</div>
                              <div className="font-medium text-white">
                                {s.closedAt
                                  ? `${dayjs(s.closedAt).diff(dayjs(s.openedAt), 'hour')}h ${dayjs(s.closedAt).diff(dayjs(s.openedAt), 'minute') % 60}m`
                                  : 'Ongoing'}
                              </div>
                            </div>
                            {s.notes && (
                              <div className="col-span-4">
                                <div className="text-slate-500 mb-1">Notes</div>
                                <div className="text-slate-300">{s.notes}</div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {(!shifts || shifts.length === 0) && (
                <tr>
                  <td colSpan={11} className="td text-center text-slate-500 py-8">
                    No shifts found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Open Shift Modal ─────────────────────────────────────────────────── */}
      {showOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-white text-lg">Open New Shift</h3>
            <p className="text-sm text-slate-400">
              Count the cash in your drawer and enter the opening amount.
            </p>

            <div className="space-y-2">
              <label className="label">Opening Cash Amount (₹)</label>
              <input
                type="number" min="0" step="100"
                value={openingCash}
                onChange={(e) => setOpeningCash(Number(e.target.value))}
                className="input w-full text-2xl font-bold h-14"
                placeholder="0"
                autoFocus
              />
              <p className="text-xs text-slate-500">
                Enter the total cash physically present in the drawer right now.
              </p>
            </div>

            <div className="flex gap-2 flex-wrap">
              {[0, 500, 1000, 2000, 5000].map((v) => (
                <button
                  key={v}
                  onClick={() => setOpeningCash(v)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-lg border transition-all',
                    openingCash === v
                      ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500',
                  )}
                >
                  ₹{v.toLocaleString('en-IN')}
                </button>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowOpen(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={() => openMutation.mutate()}
                disabled={openMutation.isPending}
                className="btn-primary flex-1"
              >
                {openMutation.isPending ? 'Opening...' : `Open Shift — ${fmt(openingCash)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Close Shift Modal ────────────────────────────────────────────────── */}
      {showClose && activeShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-lg p-6 space-y-4 my-4">
            <div>
              <h3 className="font-bold text-white text-lg">
                Close Shift — {activeShift.shiftNumber}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Opened {dayjs(activeShift.openedAt).format('D MMM, h:mm A')} ·{' '}
                {dayjs(activeShift.openedAt).fromNow(true)} ago
                {activeShift.openedByUser?.fullName && (
                  <> · by <span className="text-white">{activeShift.openedByUser.fullName}</span></>
                )}
              </p>
            </div>

            {/* Summary */}
            <div className="bg-slate-800 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Opening Cash</span>
                <span className="text-white">{fmt(activeShift.openingCash)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Cash Sales during shift</span>
                <span className="text-emerald-400">+{fmt(activeShift.cashSales)}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-slate-700 pt-2">
                <span className="text-slate-300">Expected Cash in Drawer</span>
                <span className="text-white">{fmt(expectedCash)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-slate-300">Counted Cash</span>
                <span className="text-amber-400">{fmt(closingTotal)}</span>
              </div>
              <div className={cn(
                'flex justify-between font-bold border-t border-slate-700 pt-2',
                difference < 0 ? 'text-red-400' :
                difference > 0 ? 'text-emerald-400' :
                'text-slate-400',
              )}>
                <span>Difference</span>
                <span>{difference > 0 ? '+' : ''}{fmt(difference)}</span>
              </div>
            </div>

            <DenominationCount
              label="Count Closing Cash by Denomination"
              counts={closingCounts}
              onChange={(k, v) => setClosingCounts((c) => ({ ...c, [k]: v }))}
            />

            <div>
              <label className="label">Handover Notes (Optional)</label>
              <textarea
                className="input" rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any remarks, handover notes, issues..."
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowClose(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={() => closeMutation.mutate()}
                disabled={closeMutation.isPending}
                className="btn-danger flex-1"
              >
                {closeMutation.isPending ? 'Closing...' : 'Close Shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}