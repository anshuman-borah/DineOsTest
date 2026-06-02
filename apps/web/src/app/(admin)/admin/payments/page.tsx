'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Receipt, Search, RefreshCw, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    captured:   'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    authorized: 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-500/30',
    failed:     'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
    refunded:   'bg-slate-500/15 text-slate-900 dark:text-slate-400 border-slate-500/30',
  };
  return (
    <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize', cfg[status] ?? cfg.failed)}>
      {status}
    </span>
  );
}

export default function AdminPaymentsPage() {
  const { data: response, isLoading, refetch } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: () => api.get('/api/v1/razorpay/payments').then(r => r.data.data || r.data),
    staleTime: 30_000,
  });

  const payments = response?.items ?? [];
  const total = response?.count ?? 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold text-slate-900 dark:text-white">Live Payment Ledger</h1>
          <p className="text-xs text-slate-900 dark:text-slate-500">
            Real-time transaction history from Razorpay API
          </p>
        </div>
        <button 
          onClick={() => refetch()} 
          className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-400 transition-colors flex items-center gap-2 text-xs"
        >
          <RefreshCw size={13} />
          Sync
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={22} className="animate-spin text-slate-600" />
          </div>
        ) : payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-600">
            <Receipt size={32} />
            <p className="text-sm">No recent payments found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="th">Date</th>
                <th className="th">Transaction ID</th>
                <th className="th">Contact</th>
                <th className="th">Method</th>
                <th className="th">Status</th>
                <th className="th text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p: any) => (
                <tr key={p.id} className="table-row">
                  <td className="td text-xs text-slate-900 dark:text-slate-500">
                    {format(new Date(p.created_at * 1000), 'dd MMM yyyy, hh:mm a')}
                  </td>
                  <td className="td">
                    <div className="font-medium text-slate-900 dark:text-white font-mono text-xs">
                      {p.id}
                    </div>
                    {p.order_id && (
                      <div className="text-xs text-slate-900 dark:text-slate-500 font-mono">
                        {p.order_id}
                      </div>
                    )}
                  </td>
                  <td className="td">
                    <div className="text-slate-900 dark:text-white">{p.email || '—'}</div>
                    <div className="text-xs text-slate-900 dark:text-slate-500">{p.contact || '—'}</div>
                  </td>
                  <td className="td capitalize text-slate-600 dark:text-slate-300">
                    {p.method} {p.card?.network ? `(${p.card.network})` : ''}
                  </td>
                  <td className="td"><StatusBadge status={p.status} /></td>
                  <td className="td text-right">
                    <div className="font-semibold text-slate-900 dark:text-white flex items-center justify-end gap-1">
                      {p.status === 'captured' ? (
                        <ArrowUpRight size={14} className="text-emerald-500" />
                      ) : p.status === 'failed' ? (
                        <ArrowDownRight size={14} className="text-red-500" />
                      ) : null}
                      ₹{(p.amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
