'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { apiFetch, apiPost } from '@/lib/api';
import { ShoppingCart, Receipt, Layout, ChefHat, Play, Square, X, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import Link from 'next/link';

dayjs.extend(relativeTime);

/** Modal for opening a new shift */
function OpenShiftModal({ onClose, onOpened }: { onClose: () => void; onOpened: () => void }) {
  const [openingCash, setOpeningCash] = useState('0');
  const mutation = useMutation({
    mutationFn: () => apiPost('/api/v1/shifts/open', { openingCash: parseFloat(openingCash) || 0 }),
    onSuccess: () => { toast.success('Shift opened'); onOpened(); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to open shift'),
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
          <input className="input text-xl font-bold" type="number" min="0" step="0.50"
            value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} autoFocus />
          <div className="flex gap-2 mt-2 flex-wrap">
            {[0, 500, 1000, 2000, 5000].map((v) => (
              <button key={v} onClick={() => setOpeningCash(String(v))}
                className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-600 text-slate-600 dark:text-slate-300">₹{v}</button>
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

/** Modal for closing the current shift */
function CloseShiftModal({ shiftId, onClose, onClosed }: { shiftId: string; onClose: () => void; onClosed: () => void }) {
  const [closingCash, setClosingCash] = useState('0');
  const [notes, setNotes] = useState('');
  const mutation = useMutation({
    mutationFn: () => apiPost(`/api/v1/shifts/${shiftId}/close`, { closingCash: parseFloat(closingCash) || 0, notes }),
    onSuccess: () => { toast.success('Shift closed'); onClosed(); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to close shift'),
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
          <input className="input text-xl font-bold" type="number" min="0" step="0.50"
            value={closingCash} onChange={(e) => setClosingCash(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input" rows={2} placeholder="Any handover notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
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
export default function CashierDashboardPage() {
  const qc = useQueryClient();
  const { branchId, user } = useAuthStore();
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [closeShiftModal, setCloseShiftModal] = useState(false);


  const { data: shift, refetch: refetchShift } = useQuery({
    queryKey: ['current-shift', branchId],
    queryFn: async () => {
      try {
        const r = await apiFetch('/api/v1/shifts/current');
        // API returns: { success: true, data: shiftObject } or { success: true, data: null }
        // Extract the actual shift data, which will be null if no active shift
        return r.data?.data ?? null;
      } catch {
        return null;
      }
    },
    refetchInterval: 60_000,
  });
  // Also add a useEffect to log whenever shift changes

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Welcome, {user?.firstName}</h1>
        <p className="text-sm text-slate-900 dark:text-slate-400">Cashier Dashboard • {dayjs().format('dddd, D MMMM YYYY')}</p>
      </div>

      {/* Shift Status Widget */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Your Shift Status</h2>
        {shift ? (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-emerald-100 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <ChefHat size={16} className="text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-300 font-bold text-lg">Shift is Open</span>
                </div>
                <p className="text-sm text-emerald-600 mt-1">
                  Started {dayjs(shift.startedAt).fromNow()} by {shift.openedBy?.name || 'Staff'}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (!shift?.id) {
                  toast.error("No active shift found");
                  return;
                }
                setCloseShiftModal(true);
              }}
              className="flex items-center justify-center gap-2 text-sm text-red-600 dark:text-red-400 hover:text-slate-900 dark:text-white bg-red-900/30 hover:bg-red-600 border border-red-300 dark:border-red-800 hover:border-red-500 rounded-lg px-6 py-3 transition-all font-medium shadow-lg"
            >
              <Square size={16} /> Close Shift
            </button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-100/50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-slate-600 flex-shrink-0" />
              <div>
                <div className="text-slate-600 dark:text-slate-300 font-bold text-lg">No Active Shift</div>
                <p className="text-sm text-slate-900 dark:text-slate-500 mt-1">
                  You must open a shift to process transactions.
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpenShiftModal(true)}
              className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 border border-amber-600 rounded-lg px-6 py-3 text-sm transition-all font-bold shadow-lg shadow-amber-500/20"
            >
              <Play size={16} /> Open Shift
            </button>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mt-8 mb-2">Quick Actions</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/pos" className="group card hover:border-amber-500 transition-all cursor-pointer flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="w-16 h-16 rounded-2xl bg-amber-200 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <ShoppingCart size={32} />
          </div>
          <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-1">New Order (POS)</h3>
          <p className="text-xs text-slate-900 dark:text-slate-400">Take orders and process payments</p>
        </Link>

        <Link href="/billing" className="group card hover:border-blue-500 transition-all cursor-pointer flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/20 text-blue-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Receipt size={32} />
          </div>
          <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-1">Bills & Receipts</h3>
          <p className="text-xs text-slate-900 dark:text-slate-400">View and print past transactions</p>
        </Link>

        <Link href="/tables" className="group card hover:border-purple-500 transition-all cursor-pointer flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/20 text-purple-500 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Layout size={32} />
          </div>
          <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-1">Table Management</h3>
          <p className="text-xs text-slate-900 dark:text-slate-400">Manage dine-in customers</p>
        </Link>
      </div>

      {/* Modals */}
      {openShiftModal && (
        <OpenShiftModal
          onClose={() => setOpenShiftModal(false)}
          onOpened={() => { refetchShift(); qc.invalidateQueries({ queryKey: ['current-shift'] }); }}
        />
      )}
      {closeShiftModal && shift?.id && (
        <CloseShiftModal
          shiftId={shift.id}
          onClose={() => setCloseShiftModal(false)}
          onClosed={() => { refetchShift(); qc.invalidateQueries({ queryKey: ['current-shift'] }); }}
        />
      )}
    </div>
  );
}
