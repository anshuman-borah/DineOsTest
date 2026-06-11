'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiPost, apiPatch, apiFetch } from '@/lib/api';
import { enqueueSync, getResolvedId, getPendingSyncItems } from '@/lib/offline';
import { useAuthStore } from '@/store/auth.store';
import { usePosStore } from '@/store/pos.store';
import { printHtml } from '@/lib/printer';
import { amountInWords } from '@/lib/gst';
import { X, Printer, CheckCircle, Loader2, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

type PayMethod = 'cash' | 'card' | 'upi' | 'wallet' | 'credit' | 'complimentary';

const PAYMENT_METHODS: { id: PayMethod; label: string; icon: string }[] = [
  { id: 'cash',          label: 'Cash',   icon: '💵' },
  { id: 'upi',           label: 'UPI',    icon: '📱' },
  { id: 'card',          label: 'Card',   icon: '💳' },
  { id: 'wallet',        label: 'Wallet', icon: '👛' },
  { id: 'credit',        label: 'Credit', icon: '📋' },
  { id: 'complimentary', label: 'Comp',   icon: '🎁' },
];

function round2(n: number): number {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function nearestRupee(n: number): number {
  return Math.round(round2(n));
}

function formatInputAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

interface Props {
  shiftId?: string | null;
  grandTotal: number;
  subtotal: number;
  gstTotal: number;
  orderId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function BillingModal({
  shiftId,
  grandTotal: rawGrandTotal,
  subtotal: rawSubtotal,
  gstTotal: rawGstTotal,
  orderId,
  onClose,
  onSuccess,
}: Props) {
  const { branchId, tenantId } = useAuthStore();
  const { cart, orderType, tableId, tableName, discountAmount, discountPercent } = usePosStore();

  // Exact amounts from POS
  const exactGrandTotal = round2(rawGrandTotal);
  const subtotal = round2(rawSubtotal);
  const gstTotal = round2(rawGstTotal);

  // Default billing behavior: nearest rupee
  const defaultPayable = nearestRupee(exactGrandTotal);
  const defaultRoundOff = round2(defaultPayable - exactGrandTotal);

  const [method, setMethod] = useState<PayMethod>('cash');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [splitPayments, setSplitPayments] = useState<Array<{ method: PayMethod; amount: number }>>([]);
  const [isSplit, setIsSplit] = useState(false);
  const [billed, setBilled] = useState(false);
  const [billData, setBillData] = useState<any>(null);
  const [customerEmail, setCustomerEmail] = useState('');

  // Bill amount cashier will charge
  const [finalTotal, setFinalTotal] = useState<number>(defaultPayable);
  const [manualOverride, setManualOverride] = useState(false);

  // Cash tendered defaults to payable amount, not ceil()
  const [cashEntered, setCashEntered] = useState<string>(formatInputAmount(defaultPayable));

  const cashAmount = round2(parseFloat(cashEntered) || 0);
  const change = round2(cashAmount - finalTotal);

  const billMutation = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let oid = orderId;

      // Resolve OFFLINE- IDs that were already synced in a previous session
      // (PosStore may still hold the old OFFLINE-xxx even though the order is on the server)
      if (oid?.startsWith('OFFLINE-')) {
        const resolved = await getResolvedId(oid);
        if (resolved) {
          oid = resolved;
        }
      }

      // 1. Create order if needed (skip if already have an OFFLINE- or real order ID)
      if (!oid) {
        const payload = {
          type: orderType,
          tableId,
          items: cart.map((i: any) => ({
            menuItemId: i.id,
            quantity: i.qty,
            notes: i.notes,
            variationId: i.variationId ?? undefined,
          })),
        };

        if (isOffline) {
          oid = `OFFLINE-${Date.now()}`;
          await enqueueSync({
            entityType: 'orders',
            entityId: oid,
            operation: 'create',
            payload: { ...payload, isOfflineSync: true, offlineId: oid },
            branchId: branchId || '',
            tenantId: tenantId || '',
          });
        } else {
          const orderRes = await apiPost('/api/v1/orders', payload);
          oid = orderRes.data.id;
        }
      }

      // 2. Apply discount before billing
      if ((discountPercent > 0 || discountAmount > 0) && oid) {
        const discountPayload = { discountPercent, discountAmount };
        if (isOffline) {
          await enqueueSync({
            entityType: `orders/${oid}/discount`,
            entityId: '',
            operation: 'update',
            payload: { ...discountPayload, _isDiscount: true },
            branchId: branchId || '',
            tenantId: tenantId || '',
          });
        } else {
          await apiPatch(`/api/v1/orders/${oid}/discount`, discountPayload);
        }
      }

      // 3. Fetch server-confirmed total (only when oid is a real UUID, not offline)
      let serverGrandTotal = defaultPayable;
      if (!isOffline && oid && !oid.startsWith('OFFLINE-')) {
        try {
          const orderRes = await apiFetch(`/api/v1/orders/${oid}`);
          serverGrandTotal = round2(Number(orderRes.data.grandTotal));
        } catch { /* use defaultPayable fallback */ }
      }

      // 4. Use cashier override if manually changed, else use server total
      const billAmount = manualOverride ? round2(finalTotal) : serverGrandTotal;

      // Keep UI in sync with actual billed amount
      setFinalTotal(billAmount);

      // If cashier didn’t manually touch cash amount, keep it aligned too
      if (!manualOverride && method === 'cash') {
        setCashEntered(formatInputAmount(billAmount));
      }

      // 5. Payments
      const payments = isSplit
        ? splitPayments
        : [
            {
              method,
              amount: method === 'cash' ? round2(parseFloat(cashEntered) || 0) : billAmount,
            },
          ];

      const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
      if (totalPaid < billAmount - 0.01) {
        throw new Error(
          `Payment ₹${round2(totalPaid).toFixed(2)} is less than bill amount ₹${billAmount.toFixed(2)}. Please adjust.`
        );
      }

      const billPayload = {
        orderId: oid,
        branchId,
        tenantId,
        shiftId: shiftId || undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerGstin: customerGstin || undefined,
        payments,
      };

      // 6. Create bill
      if (isOffline) {
        // ── Step 6a: Flush any unsent cart items to the order BEFORE the bill ──
        // This ensures all items are on the server so the bill is complete.
        // isOfflineSync: true tells the backend to skip the KDS kitchen notification.
        const unsentItems = cart.filter((i: any) => !i.alreadySent);
        if (unsentItems.length > 0 && oid) {
          await enqueueSync({
            entityType: `orders/${oid}/items`,
            entityId: '',
            operation: 'create',
            payload: {
              items: unsentItems.map((i: any) => ({
                menuItemId:  i.id,
                quantity:    i.qty,
                notes:       i.notes   || undefined,
                variationId: i.variationId || undefined,
              })),
              isOfflineSync: true,  // ← skips KDS event on backend
            },
            branchId: branchId || '',
            tenantId: tenantId || '',
          });
        }

        // Safety check: if oid is still OFFLINE-xxx, verify the order-create is still
        // in the sync queue. If it's already gone (order synced but ID not resolved),
        // we cannot safely bill — the bill would be stuck forever.
        if (oid!.startsWith('OFFLINE-')) {
          const queue = await getPendingSyncItems();
          const orderExists = queue.some(
            (q) => q.entityId === oid && q.entityType === 'orders' && q.operation === 'create'
          );
          if (!orderExists) {
            throw new Error(
              'This order has already synced but the bill link is missing. Please refresh the page and re-open the order to bill it.'
            );
          }
        }

        // entityId must be the same OFFLINE-xxx as the order so the DB rewrite
        // engine can update orderId inside this payload when the order syncs.
        await enqueueSync({
          entityType: 'billing/bills',
          entityId: oid!,
          operation: 'create',
          payload: { ...billPayload, isOfflineSync: true },
          branchId: branchId || '',
          tenantId: tenantId || '',
        });

        return {
          id: oid!,
          billNumber: `OFF-${Math.floor(Math.random() * 10000)}`,
          serverGrandTotal: billAmount,
          gstSummary: [],
        };
      }

      const res = await apiPost('/api/v1/billing/bills', billPayload);

      return { ...res.data, serverGrandTotal: billAmount };
    },
    onSuccess: (data) => {
      setBillData(data);
      setFinalTotal(round2(data.serverGrandTotal));
      setBilled(true);
      toast.success('Bill created successfully!');

      // Fire-and-forget: send email receipt if email was provided
      if (customerEmail.trim() && data?.id) {
        apiPost(`/api/v1/billing/bills/${data.id}/email`, { email: customerEmail.trim() })
          .then(() => toast.success('Receipt emailed to ' + customerEmail.trim()))
          .catch((err: any) => {
            console.error('Email send failed:', err);
            toast.error('Could not send email receipt. You can resend from the billing page.');
          });
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Billing failed';
      toast.error(msg);
    },
  });

  const handlePrint = () => {
    if (!billData) return;
    try {
      printHtml({
        restaurantName: 'Dine&Stay Restaurant',
        billNumber: billData.billNumber,
        invoiceDate: new Date().toLocaleString('en-IN'),
        tableName: tableName || undefined,
        orderType,
        customerName: customerName || undefined,
        customerGstin: customerGstin || undefined,
        items: cart.map((i: any) => ({
          name: i.name,
          qty: i.qty,
          rate: round2(i.price),
          amount: round2(i.price * i.qty),
        })),
        subtotal,
        discountAmount: round2(discountAmount),
        totalTax: gstTotal,
        grandTotal: round2(finalTotal),
        payments: isSplit
          ? splitPayments
          : [{ method, amount: method === 'cash' ? cashAmount : round2(finalTotal) }],
        changeAmount: method === 'cash' && !isSplit ? Math.max(0, round2(change)) : 0,
        gstSummary: billData.gstSummary,
      });
    } catch (err) {
      console.error('Print failed:', err);
      toast.error('Print failed. Check browser console.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-700 w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {billed ? 'Bill Generated ✓' : 'Generate Bill'}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {billed ? (
            <div className="p-6 space-y-4">
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle size={48} className="text-emerald-600 dark:text-emerald-400" />
                <div className="text-center">
                  <div className="text-slate-900 dark:text-white font-bold text-xl">₹{round2(finalTotal).toFixed(2)}</div>
                  <div className="text-slate-900 dark:text-slate-400 text-sm">Bill #{billData?.billNumber}</div>
                  {method === 'cash' && change > 0 && (
                    <div className="mt-2 text-amber-600 dark:text-amber-400 font-semibold text-lg">
                      Change: ₹{round2(change).toFixed(2)}
                    </div>
                  )}
                </div>
                <div className="text-xs text-slate-900 dark:text-slate-500 text-center">
                  {amountInWords(round2(finalTotal))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button onClick={handlePrint} className="btn-secondary">
                  <Printer size={14} /> Print Receipt
                </button>
                <button onClick={onSuccess} className="btn-primary">
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-5">

              {/* Summary */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-slate-900 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span>₹{subtotal.toFixed(2)}</span>
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Discount ({discountPercent}%)</span>
                    <span>-₹{round2(discountAmount).toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-900 dark:text-slate-400">
                  <span>GST</span>
                  <span>₹{gstTotal.toFixed(2)}</span>
                </div>

                {defaultRoundOff !== 0 && !manualOverride && (
                  <div className="flex justify-between text-slate-900 dark:text-slate-400">
                    <span>Round Off</span>
                    <span>{defaultRoundOff > 0 ? '+' : ''}₹{Math.abs(defaultRoundOff).toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-900 dark:text-white font-bold text-base border-t border-slate-300 dark:border-slate-700 pt-2">
                  <span>Grand Total</span>
                  <span>₹{round2(finalTotal).toFixed(2)}</span>
                </div>

                {manualOverride && Math.abs(finalTotal - defaultPayable) > 0.01 && (
                  <div className="flex justify-between text-amber-600 dark:text-amber-400 text-xs">
                    <span>Adjusted Total</span>
                    <span>₹{round2(finalTotal).toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Charge amount */}
              <div>
                <label className="label">
                  Charge Amount
                  <span className="text-slate-900 dark:text-slate-500 font-normal ml-1">(edit if needed)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900 dark:text-slate-400 text-sm">₹</span>
                  <input
                    className="input pl-7 text-lg font-bold"
                    type="number"
                    min={0}
                    step={0.01}
                    value={formatInputAmount(finalTotal)}
                    onChange={(e) => {
                      const val = round2(parseFloat(e.target.value) || 0);
                      setFinalTotal(val);
                      setManualOverride(true);
                      setCashEntered(formatInputAmount(val));
                    }}
                  />
                </div>

                {manualOverride && (
                  <button
                    className="text-xs text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 mt-1"
                    onClick={() => {
                      setFinalTotal(defaultPayable);
                      setManualOverride(false);
                      setCashEntered(formatInputAmount(defaultPayable));
                    }}
                  >
                    Reset to ₹{defaultPayable.toFixed(2)}
                  </button>
                )}
              </div>

              {/* Customer info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Customer Name</label>
                  <input
                    className="input"
                    placeholder="Optional"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input
                    className="input"
                    placeholder="Optional"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Email <span className="text-slate-900 dark:text-slate-500 font-normal">(for receipt)</span></label>
                  <div className="relative">
                    <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900 dark:text-slate-500" />
                    <input
                      className="input pl-8"
                      type="email"
                      placeholder="Optional"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">GSTIN <span className="text-slate-900 dark:text-slate-500 font-normal">(B2B)</span></label>
                  <input
                    className="input"
                    placeholder="Optional"
                    value={customerGstin}
                    onChange={(e) => setCustomerGstin(e.target.value)}
                  />
                </div>
              </div>

              {/* Payment method */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Payment Method</label>
                  <button
                    onClick={() => setIsSplit(!isSplit)}
                    className={cn(
                      'text-xs px-2 py-1 rounded',
                      isSplit
                        ? 'bg-amber-200 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400'
                        : 'text-slate-900 dark:text-slate-400 hover:text-slate-900 dark:text-white'
                    )}
                  >
                    Split Payment
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMethod(m.id)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-xl py-3 text-xs font-medium transition-all border',
                        method === m.id && !isSplit
                          ? 'border-amber-500 bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-400 hover:border-slate-300 dark:border-slate-600',
                      )}
                    >
                      <span className="text-lg">{m.icon}</span>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cash tendered */}
              {method === 'cash' && !isSplit && (
                <div>
                  <label className="label">Cash Tendered</label>
                  <input
                    className="input text-lg font-bold"
                    type="number"
                    value={cashEntered}
                    onChange={(e) => setCashEntered(e.target.value)}
                  />

                  {change >= 0 ? (
                    <div className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                      Change: ₹{round2(change).toFixed(2)}
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-red-600 dark:text-red-400">
                      Short by ₹{Math.abs(round2(change)).toFixed(2)}
                    </div>
                  )}

                  <div className="flex gap-2 mt-2 flex-wrap">
                    {[
                      round2(finalTotal),
                      Math.ceil(finalTotal / 10) * 10,
                      Math.ceil(finalTotal / 50) * 50,
                      Math.ceil(finalTotal / 100) * 100,
                      Math.ceil(finalTotal / 500) * 500,
                    ]
                      .filter((v, i, arr) => arr.indexOf(v) === i)
                      .map((amt) => (
                        <button
                          key={amt}
                          onClick={() => setCashEntered(formatInputAmount(amt))}
                          className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-600 text-slate-600 dark:text-slate-300"
                        >
                          ₹{amt}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!billed && (
          <div className="px-6 pb-6 pt-2 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
            <button
              onClick={() => billMutation.mutate()}
              disabled={
                billMutation.isPending ||
                (method === 'cash' && !isSplit && cashAmount < finalTotal)
              }
              className="btn-primary w-full py-3 text-base"
            >
              {billMutation.isPending
                ? <><Loader2 size={16} className="animate-spin" /> Processing...</>
                : `Collect ₹${round2(finalTotal).toFixed(2)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}