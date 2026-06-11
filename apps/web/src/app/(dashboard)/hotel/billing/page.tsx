'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiFetch, apiPost } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { formatCurrency } from '@/lib/utils';
import { printHtml } from '@/lib/printer';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { Receipt, Search, FileText, Printer, RefreshCw, XCircle, Mail, X, Loader2, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Bill {
  id: string;
  billNumber: string;
  customerName: string | null;
  status: string;
  grandTotal: number;
  paidAmount: number;
  createdAt: string;
  notes: string | null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function HotelBillingPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedBill, setSelectedBill] = useState<any>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [emailModal, setEmailModal] = useState<{ billId: string; billNumber: string } | null>(null);
  const [emailInput, setEmailInput] = useState('');

  const { data: bills = [], isLoading, refetch, isFetching } = useQuery<Bill[]>({
    queryKey: ['hotel-bills', user?.branchId],
    queryFn: async () => {
      const res = await api.get('/api/v1/billing/bills?source=hotel');
      const d = res.data;
      // Handle various response shapes
      if (Array.isArray(d)) return d;
      if (Array.isArray(d?.data)) return d.data;
      if (Array.isArray(d?.data?.data)) return d.data.data;
      return [];
    },
    staleTime: 30_000,
    enabled: !!user?.branchId,
  });

  const { data: billDetail } = useQuery({
    queryKey: ['hotel-billDetail', selectedBill?.id],
    queryFn: () => apiFetch(`/api/v1/billing/bills/${selectedBill?.id}`).then((r) => r.data),
    enabled: !!selectedBill,
  });

  const filteredBills = (Array.isArray(bills) ? bills : []).filter(b =>
    !search ||
    b.billNumber?.toLowerCase().includes(search.toLowerCase()) ||
    b.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  /** Print a hotel bill by fetching its detail and rendering via printHtml */
  const handlePrint = async (billId: string) => {
    setPrintingId(billId);
    try {
      const res = await apiFetch(`/api/v1/billing/bills/${billId}`);
      const detail = res.data;
      if (!detail) throw new Error('Bill data not found');

      printHtml({
        restaurantName: 'Dine&Stay Hotel',
        billNumber: detail.billNumber,
        invoiceDate: dayjs(detail.createdAt).format('D MMM YYYY h:mm A'),
        orderType: 'hotel',
        customerName: detail.customerName || undefined,
        customerGstin: detail.customerGstin || undefined,
        items: detail.orderItems?.map((i: any) => ({
          name: i.name || i.description,
          qty: Number(i.quantity || 1),
          rate: Number(i.unitPrice || i.rate || 0),
          amount: Number(i.lineTotal || i.amount || 0),
        })) || [],
        subtotal: Number(detail.subtotal || 0),
        discountAmount: Number(detail.discountAmount || 0),
        totalTax: Number(detail.totalTax || 0),
        grandTotal: Number(detail.grandTotal || 0),
        payments: detail.payments?.map((p: any) => ({
          method: p.method,
          amount: Number(p.amount),
        })) || [],
        gstSummary: detail.gstSummary,
      });
      toast.success('Print dialog opened');
    } catch (err: any) {
      console.error('Print failed:', err);
      toast.error(err?.message || 'Failed to print bill');
    } finally {
      setPrintingId(null);
    }
  };

  /** Print from the detail panel (uses already-fetched billDetail) */
  const handleDetailPrint = () => {
    if (!billDetail) return;
    try {
      printHtml({
        restaurantName: 'Dine&Stay Hotel',
        billNumber: billDetail.billNumber,
        invoiceDate: dayjs(billDetail.createdAt).format('D MMM YYYY h:mm A'),
        orderType: 'hotel',
        customerName: billDetail.customerName || undefined,
        customerGstin: billDetail.customerGstin || undefined,
        items: billDetail.orderItems?.map((i: any) => ({
          name: i.name || i.description,
          qty: Number(i.quantity || 1),
          rate: Number(i.unitPrice || i.rate || 0),
          amount: Number(i.lineTotal || i.amount || 0),
        })) || [],
        subtotal: Number(billDetail.subtotal || 0),
        discountAmount: Number(billDetail.discountAmount || 0),
        totalTax: Number(billDetail.totalTax || 0),
        grandTotal: Number(billDetail.grandTotal || 0),
        payments: billDetail.payments?.map((p: any) => ({
          method: p.method,
          amount: Number(p.amount),
        })) || [],
        gstSummary: billDetail.gstSummary,
      });
    } catch (err) {
      console.error('Print failed:', err);
      toast.error('Print failed. Check browser console.');
    }
  };

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.patch(`/api/v1/billing/bills/${id}/void`, { reason }),
    onSuccess: () => { toast.success('Bill voided'); qc.invalidateQueries({ queryKey: ['hotel-bills'] }); setSelectedBill(null); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const emailMutation = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) => apiPost(`/api/v1/billing/bills/${id}/email`, { email }),
    onSuccess: () => { toast.success('Bill emailed successfully'); setEmailModal(null); setEmailInput(''); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Email failed'),
  });

  return (
    <div className="flex h-full overflow-hidden">
      {/* Bill List */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center">
              <Receipt size={16} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-900 dark:text-white">Hotel Billing</h1>
              <p className="text-xs text-slate-900 dark:text-slate-500">Guest invoices generated at checkout</p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-400 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <div className="relative max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search by invoice # or guest name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input text-xs pl-8 py-1.5 w-full"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-slate-900 dark:text-slate-500 text-sm animate-pulse">Loading…</div>
          ) : filteredBills.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
              <FileText size={40} />
              <p className="text-sm">
                {search ? 'No bills match your search' : 'No hotel bills yet — bills are generated at checkout'}
              </p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400">Invoice #</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400">Guest</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400">Date</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-900 dark:text-slate-400">Total</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-900 dark:text-slate-400">Paid</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-900 dark:text-slate-400">Balance</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-900 dark:text-slate-400">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {filteredBills.map((bill) => {
                  const balance = Math.max(0, Number(bill.grandTotal) - Number(bill.paidAmount));
                  return (
                    <tr
                      key={bill.id}
                      onClick={() => setSelectedBill(bill)}
                      className={cn(
                        'hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer',
                        selectedBill?.id === bill.id && 'bg-amber-50 dark:bg-amber-500/10',
                      )}
                    >
                      <td className="px-4 py-3 font-mono font-medium text-amber-600 dark:text-amber-400">{bill.billNumber}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{bill.customerName ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-900 dark:text-slate-400">{fmtDate(bill.createdAt)}</td>
                      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">{formatCurrency(Number(bill.grandTotal))}</td>
                      <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(Number(bill.paidAmount))}</td>
                      <td className="px-4 py-3 text-right">
                        {balance > 0.01
                          ? <span className="text-red-600 dark:text-red-400">{formatCurrency(balance)}</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide', {
                          'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400': bill.status === 'paid',
                          'bg-red-500/15 text-red-600 dark:text-red-400': bill.status === 'void',
                          'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400': bill.status === 'issued' || bill.status === 'draft',
                        })}>
                          {bill.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-slate-200 dark:bg-slate-700/50 text-slate-900 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                          disabled={printingId === bill.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePrint(bill.id);
                          }}
                        >
                          {printingId === bill.id ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Printer size={11} />
                          )}
                          {printingId === bill.id ? 'Printing…' : 'Print'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Email Modal */}
      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Mail size={18} className="text-amber-600 dark:text-amber-400" />
              <h3 className="font-bold text-slate-900 dark:text-white">Email Bill {emailModal.billNumber}</h3>
            </div>
            <div>
              <label className="label">Customer Email</label>
              <input
                className="input"
                type="email"
                placeholder="customer@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && emailInput && emailMutation.mutate({ id: emailModal.billId, email: emailInput })}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setEmailModal(null); setEmailInput(''); }} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => emailMutation.mutate({ id: emailModal.billId, email: emailInput })}
                disabled={emailMutation.isPending || !emailInput}
                className="btn-primary flex-1"
              >
                {emailMutation.isPending ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bill Detail Panel */}
      {selectedBill && (
        <div className="w-80 flex-shrink-0 border-l border-slate-200 dark:border-slate-800 flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white">{selectedBill.billNumber}</h3>
            <button onClick={() => setSelectedBill(null)} className="btn-ghost p-1"><XCircle size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {billDetail && (
              <>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-slate-900 dark:text-slate-400">Date</span><span>{dayjs(billDetail.createdAt).format('D MMM YYYY, h:mm A')}</span></div>
                  {billDetail.customerName && <div className="flex justify-between"><span className="text-slate-900 dark:text-slate-400">Guest</span><span>{billDetail.customerName}</span></div>}
                  {billDetail.customerGstin && <div className="flex justify-between"><span className="text-slate-900 dark:text-slate-400">GSTIN</span><span className="font-mono text-xs">{billDetail.customerGstin}</span></div>}
                </div>

                <div className="space-y-1">
                  {billDetail.orderItems?.map((item: any) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">{item.quantity || 1}× {item.name || item.description}</span>
                      <span className="text-slate-900 dark:text-white font-medium">₹{Number(item.lineTotal || item.amount || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-300 dark:border-slate-700 pt-3 space-y-1 text-sm">
                  <div className="flex justify-between text-slate-900 dark:text-slate-400"><span>Subtotal</span><span>₹{Number(billDetail.subtotal || 0).toFixed(2)}</span></div>
                  {Number(billDetail.discountAmount) > 0 && <div className="flex justify-between text-emerald-600 dark:text-emerald-400"><span>Discount</span><span>-₹{Number(billDetail.discountAmount).toFixed(2)}</span></div>}
                  <div className="flex justify-between text-slate-900 dark:text-slate-400"><span>GST</span><span>₹{Number(billDetail.totalTax || 0).toFixed(2)}</span></div>
                  <div className="flex justify-between text-slate-900 dark:text-white font-bold text-base border-t border-slate-300 dark:border-slate-700 pt-2"><span>Grand Total</span><span>₹{Number(billDetail.grandTotal).toFixed(2)}</span></div>
                </div>

                {billDetail.payments?.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs text-slate-900 dark:text-slate-500 uppercase tracking-wide">Payments</div>
                    {billDetail.payments.map((p: any) => (
                      <div key={p.id} className="flex justify-between text-sm">
                        <span className="badge-slate capitalize">{p.method}</span>
                        <span>₹{Number(p.amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDetailPrint}
                disabled={!billDetail}
                className="btn-secondary text-xs disabled:opacity-50"
              >
                <Printer size={13} /> Print
              </button>
              <button
                onClick={() => { setEmailInput(billDetail?.customerEmail || ''); setEmailModal({ billId: selectedBill.id, billNumber: selectedBill.billNumber }); }}
                className="btn-secondary text-xs"
              >
                <Mail size={13} /> Email
              </button>
            </div>
            {selectedBill.status !== 'void' && (
              <button onClick={() => { const r = prompt('Void reason?'); if (r) voidMutation.mutate({ id: selectedBill.id, reason: r }); }} className="btn-danger w-full text-sm">
                <XCircle size={14} /> Void Bill
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
