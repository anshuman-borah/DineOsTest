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
    owner:              'bg-amber-500/20 text-amber-400',
    manager:            'bg-blue-500/20 text-blue-400',
    hotel_manager:      'bg-blue-500/20 text-blue-400',
    restaurant_manager: 'bg-blue-500/20 text-blue-400',
    receptionist:       'bg-teal-500/20 text-teal-400',
    cashier:            'bg-emerald-500/20 text-emerald-400',
    housekeeping:       'bg-purple-500/20 text-purple-400',
    waiter:             'bg-purple-500/20 text-purple-400',
    kitchen:            'bg-orange-500/20 text-orange-400',
    inventory:          'bg-slate-500/20 text-slate-400',
  };
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize',
      colors[role] || 'bg-slate-500/20 text-slate-400')}>
      {role.replace(/_/g, ' ')}
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
  if (fallbackId) return <span className="text-slate-500 text-xs font-mono">{fallbackId.slice(0, 8)}…</span>;
  return <span className="text-slate-600">—</span>;
}

export default function HotelShiftsPage() {
  const qc = useQueryClient();
  const { branchId } = useAuthStore();

  const [openingCash,       setOpeningCash]       = useState<string>('');
  const [closingCashInput,  setClosingCashInput]  = useState<string>('');
  const [closingCounts,     setClosingCounts]     = useState<Record<string, number>>({});
  const [showDenominations, setShowDenominations] = useState(false);
  const [notes,             setNotes]             = useState('');
  const [showOpen,          setShowOpen]          = useState(false);
  const [showClose,         setShowClose]         = useState(false);
  const [expandedShift,     setExpandedShift]     = useState<string | null>(null);

  const { data: activeShift } = useQuery({
    queryKey: ['hotel-activeShift', branchId],
    queryFn:  () => apiFetch('/api/v1/hotel-shifts/active').then((r) => r.data).catch(() => null),
    refetchInterval: 30_000,
    enabled: !!branchId,
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ['hotel-shifts', branchId],
    queryFn:  () => apiFetch('/api/v1/hotel-shifts').then((r) => r.data),
    enabled:  !!branchId,
  });

  const openingCashNum = parseFloat(openingCash) || 0;
  const denomsTotal    = denomTotal(closingCounts);
  const hasDenoms      = denomsTotal > 0;
  const closingTotal   = hasDenoms ? denomsTotal : (parseFloat(closingCashInput) || 0);
  const expectedCash   = activeShift
    ? Number(activeShift.openingCash || 0) + Number(activeShift.cashSales || 0)
    : 0;
  const difference = closingTotal - expectedCash;

  const openMutation = useMutation({
    mutationFn: () => apiPost('/api/v1/hotel-shifts/open', { openingCash: openingCashNum }),
    onSuccess: () => {
      toast.success('Hotel shift opened!');
      qc.invalidateQueries({ queryKey: ['hotel-activeShift'] });
      qc.invalidateQueries({ queryKey: ['hotel-shifts'] });
      setShowOpen(false);
      setOpeningCash('');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to open hotel shift'),
  });

  const closeMutation = useMutation({
    mutationFn: () => {
      if (!activeShift?.id) throw new Error('No active hotel shift');
      return apiPost(`/api/v1/hotel-shifts/${activeShift.id}/close`, {
        closingCash:   closingTotal,
        notes:         notes || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Hotel shift closed!');
      qc.invalidateQueries({ queryKey: ['hotel-activeShift'] });
      qc.invalidateQueries({ queryKey: ['hotel-shifts'] });
      setShowClose(false);
      setClosingCashInput('');
      setClosingCounts({});
      setShowDenominations(false);
      setNotes('');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to close hotel shift'),
  });

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Hotel Shift Management</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage front-desk cash shifts independently from restaurant</p>
        </div>
        {!activeShift ? (
          <button onClick={() => setShowOpen(true)} className="btn-primary">
            <Unlock size={14} /> Open Hotel Shift
          </button>
        ) : (
          <button onClick={() => setShowClose(true)} className="btn-danger">
            <Lock size={14} /> Close Hotel Shift
          </button>
        )}
      </div>

      {/* Active Shift Card */}
      {activeShift ? (
        <div className="card border-emerald-700/50 bg-emerald-900/10">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="font-bold text-emerald-400">Active Hotel Shift — {activeShift.shiftNumber}</h2>
            <span className="text-xs text-slate-400">
              Since {dayjs(new Date(activeShift.openedAt)).format('D MMM, h:mm A')}
              {' · '}{dayjs(new Date(activeShift.openedAt)).fromNow()}
            </span>
          </div>
          <div className="flex items-center gap-2 mb-4 text-sm">
            <User size={13} className="text-slate-500" />
            <span className="text-slate-400">Opened by</span>
            <span className="text-white font-medium">{activeShift.openedByUser?.fullName || 'Staff'}</span>
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
        </div>
      ) : (
        <div className="card text-center py-8 text-slate-500">
          <Lock size={32} className="mx-auto mb-2 opacity-30" />
          <p>No active hotel shift. Open a shift to start accepting hotel payments.</p>
        </div>
      )}

      {/* Shift History */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 font-semibold text-white">Hotel Shift History</div>
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
                const diff = Number(s.cashDifference || 0);
                const isExpand = expandedShift === s.id;
                return (
                  <>
                    <tr key={s.id} className="table-row cursor-pointer"
                      onClick={() => setExpandedShift(isExpand ? null : s.id)}>
                      <td className="td font-medium text-amber-400">{s.shiftNumber}</td>
                      <td className="td"><UserCell user={s.openedByUser} fallbackId={s.openedBy} /></td>
                      <td className="td"><UserCell user={s.closedByUser} fallbackId={s.closedBy} /></td>
                      <td className="td text-slate-400 text-xs">{dayjs(new Date(s.openedAt)).format('D MMM, h:mm A')}</td>
                      <td className="td text-right">{fmt(s.openingCash)}</td>
                      <td className="td text-right">{fmt(s.cashSales)}</td>
                      <td className="td text-right">{fmt(s.expectedCash)}</td>
                      <td className="td text-right">{fmt(s.closingCash)}</td>
                      <td className={cn('td text-right font-mono font-medium',
                        diff < 0 ? 'text-red-400' : diff > 0 ? 'text-emerald-400' : 'text-slate-400')}>
                        {diff !== 0 ? `${diff > 0 ? '+' : ''}${fmt(Math.abs(diff))}` : '₹0'}
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
                    {isExpand && (
                      <tr key={`${s.id}-exp`} className="bg-slate-800/30">
                        <td colSpan={11} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            {[
                              { label: 'UPI Sales',      value: fmt(s.upiSales),    color: 'text-white' },
                              { label: 'Card Sales',     value: fmt(s.cardSales),   color: 'text-white' },
                              { label: 'Wallet Sales',   value: fmt(s.walletSales), color: 'text-white' },
                              { label: 'Complimentary',  value: fmt(s.complimentary), color: 'text-emerald-400' },
                              { label: 'CGST Collected', value: fmt(s.totalCgst),   color: 'text-blue-400' },
                              { label: 'SGST Collected', value: fmt(s.totalSgst),   color: 'text-purple-400' },
                              { label: 'Total Orders',   value: s.totalOrders,      color: 'text-white' },
                              { label: 'Duration',       value: s.closedAt ? `${dayjs(s.closedAt).diff(dayjs(s.openedAt), 'hour')}h ${dayjs(s.closedAt).diff(dayjs(s.openedAt), 'minute') % 60}m` : 'Ongoing', color: 'text-white' },
                            ].map(({ label, value, color }) => (
                              <div key={label}>
                                <div className="text-slate-500 mb-1">{label}</div>
                                <div className={cn('font-medium', color)}>{value}</div>
                              </div>
                            ))}
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
                <tr><td colSpan={11} className="td text-center text-slate-500 py-8">No hotel shifts found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Open Shift Modal ─────────────────────────────────────────────────── */}
      {showOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-white text-lg">Open New Hotel Shift</h3>
            <div className="space-y-2">
              <label className="label">Opening Cash Amount (₹)</label>
              <input type="number" min="0" step="100" value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className="input w-full text-2xl font-bold h-14" placeholder="Enter amount" autoFocus />
              <p className="text-xs text-slate-500">Total cash physically present at the front desk right now.</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {[0, 500, 1000, 2000, 5000].map((v) => (
                <button key={v} onClick={() => setOpeningCash(v === 0 ? '0' : String(v))}
                  className={cn('text-xs px-3 py-1.5 rounded-lg border transition-all',
                    openingCashNum === v ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-slate-700 text-slate-400 hover:border-slate-500')}>
                  ₹{v.toLocaleString('en-IN')}
                </button>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowOpen(false); setOpeningCash(''); }} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => openMutation.mutate()} disabled={openMutation.isPending} className="btn-primary flex-1">
                {openMutation.isPending ? 'Opening...' : `Open Shift — ${fmt(openingCashNum)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Close Shift Modal ────────────────────────────────────────────────── */}
      {showClose && activeShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-md p-6 space-y-4">
            <div>
              <h3 className="font-bold text-white text-lg">Close Hotel Shift — {activeShift.shiftNumber}</h3>
              <p className="text-xs text-slate-400 mt-1">
                Opened {dayjs(new Date(activeShift.openedAt)).format('D MMM, h:mm A')} ·{' '}
                {dayjs(new Date(activeShift.openedAt)).fromNow(true)} ago
                {activeShift.openedByUser?.fullName && (
                  <> · by <span className="text-white">{activeShift.openedByUser.fullName}</span></>
                )}
              </p>
            </div>

            {/* Summary */}
            <div className="bg-slate-800 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Opening Cash</span><span className="text-white">{fmt(activeShift.openingCash)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Cash Collected</span><span className="text-emerald-400">+{fmt(activeShift.cashSales)}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-slate-700 pt-2">
                <span className="text-slate-300">Expected at Front Desk</span>
                <span className="text-white">{fmt(expectedCash)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span className="text-slate-300">Counted Cash</span>
                <span className="text-amber-400">{fmt(closingTotal)}</span>
              </div>
              <div className={cn('flex justify-between font-bold border-t border-slate-700 pt-2',
                difference < 0 ? 'text-red-400' : difference > 0 ? 'text-emerald-400' : 'text-slate-400')}>
                <span>Difference</span>
                <span>{difference > 0 ? '+' : ''}{fmt(difference)}</span>
              </div>
            </div>

            {/* ← Direct cash input */}
            <div>
              <label className="label">Closing Cash Amount (₹)</label>
              <input
                type="number" min="0" step="1"
                value={hasDenoms ? denomsTotal : closingCashInput}
                onChange={(e) => { setClosingCashInput(e.target.value); setClosingCounts({}); }}
                className="input w-full text-2xl font-bold h-14"
                placeholder="Enter total cash counted"
                autoFocus
                disabled={hasDenoms}
              />
              <p className="text-xs text-slate-500 mt-1">
                Count the physical cash and enter the total. Or use denomination breakdown below.
              </p>
            </div>

            {/* ← Denominations collapsible */}
            <div>
              <button type="button"
                onClick={() => { setShowDenominations(!showDenominations); if (showDenominations) setClosingCounts({}); }}
                className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                {showDenominations ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {showDenominations ? 'Hide denomination breakdown' : 'Use denomination breakdown (optional)'}
              </button>

              {showDenominations && (
                <div className="mt-3 bg-slate-800/50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-400">Denomination Count</span>
                    <span className="text-amber-400 font-bold text-sm">{fmt(denomsTotal)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {DENOMS.map((d) => (
                      <div key={d.key} className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 w-14">{d.label}</span>
                        <input type="number" min={0}
                          value={closingCounts[d.key] || ''}
                          onChange={(e) => setClosingCounts((c) => ({ ...c, [d.key]: parseInt(e.target.value) || 0 }))}
                          className="input text-center py-1 text-sm w-16" placeholder="0" />
                        <span className="text-xs text-slate-500 w-16 text-right">
                          = {fmt((closingCounts[d.key] || 0) * d.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="label">Handover Notes (Optional)</label>
              <textarea className="input" rows={2} value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any remarks, handover notes, issues..." />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowClose(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending} className="btn-danger flex-1">
                {closeMutation.isPending ? 'Closing...' : 'Close Hotel Shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}