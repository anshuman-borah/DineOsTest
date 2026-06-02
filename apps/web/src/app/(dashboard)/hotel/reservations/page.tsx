'use client';
/**
 * Hotel Reservations
 * ──────────────────────────────────────────────────────────────
 * • Filterable, paginated list — status tabs, date range, search
 * • New Reservation drawer — room picker, guest search/create, date picker
 * • Per-row actions: Check In, Check Out, Cancel, View Folio
 * • Folio drawer: shows all charges, total, balance; can add charges
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  BedDouble, Plus, Search, RefreshCw, X, ChevronLeft, ChevronRight,
  LogIn, LogOut, Ban, Receipt, Loader2, User, Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Guest { id: string; name: string; phone: string; email?: string }
interface RoomType { id: string; name: string; baseRate: number }
interface Room { id: string; roomNumber: string; floor: number; status: string; roomType: RoomType }
interface Reservation {
  id: string; status: string; checkInDate: string; checkOutDate: string;
  numNights: number; ratePerNight: number; totalAmount: number; advancePaid: number; balanceDue: number;
  numAdults: number; numChildren: number; source: string; bookingRef?: string;
  primaryGuest: Guest; room: Room;
}
interface FolioCharge {
  id: string; description: string; amount: number; chargeType: string; date: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_in', label: 'In House' },
  { value: 'checked_out', label: 'Checked Out' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_BADGE: Record<string, string> = {
  confirmed: 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400',
  checked_in: 'bg-blue-500/15  text-blue-400',
  checked_out: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  cancelled: 'bg-red-500/15   text-red-600 dark:text-red-400',
  no_show: 'bg-slate-600/30 text-slate-900 dark:text-slate-400',
};

const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtMoney = (n: number) => `₹${Number(n).toLocaleString('en-IN')}`;

// ─── New Reservation Drawer ───────────────────────────────────────────────────

function NewReservationDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    checkInDate: '', checkOutDate: '', roomId: '', numAdults: 1, numChildren: 0,
    advancePaid: 0, source: 'walk_in', specialRequests: '', notes: '',
  });
  const [guestSearch, setGuestSearch] = useState('');
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [newGuest, setNewGuest] = useState({ name: '', phone: '', email: '' });
  const [useNewGuest, setUseNewGuest] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [rateOverride, setRateOverride] = useState<string>('');

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ['hotel-rooms-available'],

    queryFn: async () => {
      const response = await api.get('/api/v1/hotel/rooms');

      const d = response.data;

      console.log('ROOMS API:', d);

      // direct array
      if (Array.isArray(d)) {
        return d;
      }

      // wrapped { data: [] }
      if (d && Array.isArray(d.data)) {
        return d.data;
      }

      // wrapped { rooms: [] }
      if (d && Array.isArray(d.rooms)) {
        return d.rooms;
      }

      return [];
    },

    staleTime: 30_000,
  });

  const { data: guestResults = [] } = useQuery<Guest[]>({
    queryKey: ['guest-search', guestSearch],

    queryFn: async () => {
      const response = await api.get(
        `/api/v1/hotel/guests?q=${encodeURIComponent(guestSearch)}`
      );

      const d = response.data;

      console.log('GUEST API:', d);

      // direct array
      if (Array.isArray(d)) {
        return d;
      }

      // wrapped { data: [] }
      if (d && Array.isArray(d.data)) {
        return d.data;
      }

      // wrapped { guests: [] }
      if (d && Array.isArray(d.guests)) {
        return d.guests;
      }

      return [];
    },

    enabled: guestSearch.length >= 2,
    staleTime: 10_000,
  });

  const nights = form.checkInDate && form.checkOutDate
    ? Math.max(1, Math.round((new Date(form.checkOutDate).getTime() - new Date(form.checkInDate).getTime()) / 86_400_000))
    : 0;
  const rate = rateOverride ? Number(rateOverride) : Number(selectedRoom?.roomType?.baseRate ?? 0);
  const subtotal = rate * nights;
  const tax = Math.round(subtotal * 0.12 * 100) / 100;
  const total = subtotal + tax;

  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (body: any) => api.post('/api/v1/hotel/reservations', body).then((r) => r.data),
    onSuccess: () => { toast.success('Reservation created'); qc.invalidateQueries({ queryKey: ['hotel-reservations'] }); qc.invalidateQueries({ queryKey: ['hotel-rooms'] }); onCreated(); onClose(); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to create reservation'),
  });

  const handleSubmit = () => {
    if (!form.roomId) return toast.error('Select a room');
    if (!form.checkInDate || !form.checkOutDate) return toast.error('Select dates');
    if (!selectedGuest && !useNewGuest) return toast.error('Select or enter a guest');
    if (useNewGuest && !newGuest.name) return toast.error('Guest name is required');
    if (useNewGuest && !newGuest.phone) return toast.error('Guest phone is required');

    create.mutate({
      ...form,
      ratePerNight: rate || undefined,
      primaryGuestId: selectedGuest?.id,
      guest: useNewGuest ? newGuest : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="w-full max-w-lg bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <BedDouble size={16} className="text-blue-400" /> New Reservation
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-500"><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="label">Check-in Date</label>
              <input type="date" value={form.checkInDate} onChange={(e) => setForm((f) => ({ ...f, checkInDate: e.target.value }))} className="input text-sm" min={new Date().toISOString().split('T')[0]} />
            </div>
            <div className="space-y-1">
              <label className="label">Check-out Date</label>
              <input type="date" value={form.checkOutDate} onChange={(e) => setForm((f) => ({ ...f, checkOutDate: e.target.value }))} className="input text-sm" min={form.checkInDate} />
            </div>
          </div>
          {nights > 0 && <p className="text-xs text-slate-900 dark:text-slate-500">{nights} night{nights !== 1 ? 's' : ''}</p>}

          {/* Room picker */}
          <div className="space-y-1">
            <label className="label">Room</label>
            <select
              value={form.roomId}
              onChange={(e) => {
                const r = (rooms ?? []).find((x) => x.id === e.target.value) ?? null;
                setSelectedRoom(r);
                setForm((f) => ({ ...f, roomId: e.target.value }));
              }}
              className="input text-sm"
            >
              <option value="">Select a room…</option>
              {(rooms ?? [])
                .filter((r) => r.status === 'available' || r.status === 'reserved')
                .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    Room {r.roomNumber} — {r.roomType?.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Rate override */}
          {selectedRoom && (
            <div className="space-y-1">
              <label className="label">Rate per Night (₹)</label>
              <input
                type="number"
                value={rateOverride}
                onChange={(e) => setRateOverride(e.target.value)}
                placeholder={`Default: ₹${Number(selectedRoom.roomType?.baseRate).toLocaleString('en-IN')}`}
                className="input text-sm"
              />
            </div>
          )}

          {/* Guest */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="label mb-0">Guest</label>
              <button onClick={() => { setUseNewGuest((v) => !v); setSelectedGuest(null); }} className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-600 dark:text-amber-300">
                {useNewGuest ? 'Search existing' : 'Add new guest'}
              </button>
            </div>

            {useNewGuest ? (
              <div className="space-y-2">
                <input type="text" placeholder="Full name *" value={newGuest.name} onChange={(e) => setNewGuest((g) => ({ ...g, name: e.target.value }))} className="input text-sm" />
                <input type="tel" placeholder="Phone *" value={newGuest.phone} onChange={(e) => setNewGuest((g) => ({ ...g, phone: e.target.value }))} className="input text-sm" />
                <input type="email" placeholder="Email (optional)" value={newGuest.email} onChange={(e) => setNewGuest((g) => ({ ...g, email: e.target.value }))} className="input text-sm" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900 dark:text-slate-500" />
                  <input
                    type="text" placeholder="Search by name or phone…"
                    value={guestSearch} onChange={(e) => setGuestSearch(e.target.value)}
                    className="input text-sm pl-8"
                  />
                </div>
                {selectedGuest && (
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div className="text-sm text-slate-900 dark:text-white">{selectedGuest.name} <span className="text-slate-900 dark:text-slate-400">· {selectedGuest.phone}</span></div>
                    <button onClick={() => setSelectedGuest(null)} className="text-slate-900 dark:text-slate-500 hover:text-red-600 dark:text-red-400"><X size={13} /></button>
                  </div>
                )}
                {!selectedGuest && guestSearch.length >= 2 && (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-200 dark:divide-slate-800/60 max-h-40 overflow-y-auto">
                    {(guestResults ?? []).length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-900 dark:text-slate-500">No guests found — <button onClick={() => { setUseNewGuest(true); setNewGuest((g) => ({ ...g, name: guestSearch })); }} className="text-amber-600 dark:text-amber-400 hover:underline">add new</button></div>
                    ) : (guestResults ?? []).map((g) => (
                      <button key={g.id} onClick={() => { setSelectedGuest(g); setGuestSearch(''); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:bg-slate-800 text-left">
                        <User size={12} className="text-slate-900 dark:text-slate-500 flex-shrink-0" />
                        <div>
                          <div className="text-xs text-slate-900 dark:text-white">{g.name}</div>
                          <div className="text-[10px] text-slate-900 dark:text-slate-500">{g.phone}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Occupancy */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="label">Adults</label>
              <input type="number" min={1} max={10} value={form.numAdults} onChange={(e) => setForm((f) => ({ ...f, numAdults: Number(e.target.value) }))} className="input text-sm" />
            </div>
            <div className="space-y-1">
              <label className="label">Children</label>
              <input type="number" min={0} max={10} value={form.numChildren} onChange={(e) => setForm((f) => ({ ...f, numChildren: Number(e.target.value) }))} className="input text-sm" />
            </div>
          </div>

          {/* Source + advance */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="label">Booking Source</label>
              <select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} className="input text-sm">
                <option value="walk_in">Walk-in</option>
                <option value="phone">Phone</option>
                <option value="ota">OTA (MakeMyTrip / OYO)</option>
                <option value="website">Website</option>
                <option value="agent">Agent</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="label">Advance Paid (₹)</label>
              <input type="number" min={0} value={form.advancePaid} onChange={(e) => setForm((f) => ({ ...f, advancePaid: Number(e.target.value) }))} className="input text-sm" />
            </div>
          </div>

          {/* Special requests */}
          <div className="space-y-1">
            <label className="label">Special Requests</label>
            <textarea rows={2} value={form.specialRequests} onChange={(e) => setForm((f) => ({ ...f, specialRequests: e.target.value }))} className="input text-sm resize-none" placeholder="Early check-in, extra pillows…" />
          </div>

          {/* Financial summary */}
          {nights > 0 && selectedRoom && (
            <div className="rounded-xl bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 p-4 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-900 dark:text-slate-400"><span>Room ({nights}N × ₹{rate.toLocaleString('en-IN')})</span><span>₹{subtotal.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between text-slate-900 dark:text-slate-400"><span>GST (12%)</span><span>₹{tax.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between text-slate-900 dark:text-slate-400"><span>Advance paid</span><span>-₹{Number(form.advancePaid).toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between font-semibold text-slate-900 dark:text-white border-t border-slate-300 dark:border-slate-700 pt-1.5"><span>Balance due</span><span>₹{Math.max(0, total - form.advancePaid).toLocaleString('en-IN')}</span></div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 text-sm bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={create.isPending} className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm disabled:opacity-50">
            {create.isPending ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : 'Create Reservation'}
          </button>
        </div>
      </aside>
    </div>
  );
}

// ─── Checkout Dialog (Real-world flow: review folio → collect payment → generate bill) ────

function CheckoutDialog({ reservation, onClose, onDone }: { reservation: Reservation; onClose: () => void; onDone: () => void }) {
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'wallet'>('card');
  const [amountPaid, setAmountPaid] = useState('');

  // ── Fetch active hotel shift ───────────────────────────────────────────────
  const { data: hotelShift } = useQuery<{ id: string } | null>({
    queryKey: ['hotel-shift-current'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/v1/hotel-shifts/current');
        const d = res.data;
        // Response could be null, direct object, or wrapped
        if (!d) return null;
        if (d.id) return d;
        if (d.data?.id) return d.data;
        return null;
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
  });

  const hasActiveShift = !!hotelShift?.id;
  const isCashBlocked = paymentMethod === 'cash' && !hasActiveShift;

  const { data: folio, isLoading: folioLoading } = useQuery<{ charges: FolioCharge[]; totalCharges: number; totalPaid: number; balance: number }>({
    queryKey: ['hotel-folio-checkout', reservation.id],
    queryFn: () => api.get(`/api/v1/hotel/reservations/${reservation.id}/folio`).then(r => r.data?.data ?? r.data),
  });

  const balance = Math.max(0, folio?.balance ?? 0);

  // Auto-fill the amount when folio loads
  useEffect(() => {
    if (balance > 0 && !amountPaid) setAmountPaid(String(balance));
  }, [balance]);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const paid = parseFloat(amountPaid) || 0;
      // 1. Perform checkout (marks room as cleaning, creates HK task)
      await api.post(`/api/v1/hotel/reservations/${reservation.id}/check-out`);
      // 2. Generate the final bill with payment collected
      //    Pass shiftId so the backend can link payment to the shift
      await api.post(`/api/v1/hotel/reservations/${reservation.id}/bill`, {
        paymentMethod,
        amountPaid: paid,
        shiftId: hotelShift?.id || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Guest checked out & bill generated!');
      onDone();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Checkout failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Checkout & Settle Bill</h2>
            <div className="text-xs text-slate-900 dark:text-slate-500">
              Room {reservation.room?.roomNumber} · {reservation.primaryGuest?.name}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-500"><X size={15} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* How hotel billing works */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300 space-y-1">
            <div className="font-semibold text-blue-200">How checkout billing works:</div>
            <div>1. Review the folio below (all charges during the stay)</div>
            <div>2. Collect the balance due from the guest</div>
            <div>3. Click &quot;Confirm Checkout&quot; — the bill is auto-generated</div>
          </div>

          {/* Folio summary */}
          <div className="bg-slate-100/50 dark:bg-slate-800/50 rounded-xl p-3 space-y-2 text-xs">
            <div className="font-semibold text-slate-600 dark:text-slate-300 mb-2">Folio Summary</div>
            {folioLoading ? (
              <div className="text-slate-900 dark:text-slate-500 animate-pulse">Loading charges…</div>
            ) : (
              <>
                <div className="divide-y divide-slate-200 dark:divide-slate-700/50 max-h-36 overflow-y-auto">
                  {(folio?.charges ?? []).map((c) => (
                    <div key={c.id} className="flex justify-between py-1.5">
                      <span className="text-slate-900 dark:text-slate-400">{c.description}</span>
                      <span className={Number(c.amount) < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}>
                        {Number(c.amount) < 0 ? '-' : ''}₹{Math.abs(Number(c.amount)).toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-300 dark:border-slate-700 pt-2 space-y-1">
                  <div className="flex justify-between text-slate-900 dark:text-slate-400">
                    <span>Total Charges</span>
                    <span>₹{Math.abs(folio?.totalCharges ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Already Paid (Advance)</span>
                    <span>₹{(folio?.totalPaid ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 dark:text-white text-sm border-t border-slate-300 dark:border-slate-600 pt-1">
                    <span>Balance Due</span>
                    <span className={balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
                      ₹{balance.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Payment collection */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-400">Collect Payment</div>
            <div className="grid grid-cols-4 gap-1.5">
              {(['cash', 'card', 'upi', 'wallet'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={cn(
                    'py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wide border transition-colors',
                    paymentMethod === m
                      ? 'bg-amber-200 dark:bg-amber-500/20 border-amber-400 dark:border-amber-500/50 text-amber-600 dark:text-amber-400'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-500 hover:border-slate-300 dark:border-slate-600',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Cash payment shift warning */}
            {isCashBlocked && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs space-y-1.5">
                <div className="font-semibold text-amber-600 dark:text-amber-400">⚠ No Active Hotel Shift</div>
                <div className="text-amber-700 dark:text-amber-300/80">
                  Cash payments require an open shift for drawer accountability.
                  Use Card or UPI instead, or open a shift first.
                </div>
                <Link
                  href="/hotel/shifts"
                  className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold hover:text-amber-500 dark:hover:text-amber-300 underline"
                >
                  Open Hotel Shift →
                </Link>
              </div>
            )}

            {/* Shift linked indicator */}
            {hasActiveShift && (
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400/70">
                ✓ Payment will be tracked in the current hotel shift
              </div>
            )}

            <input
              type="number"
              placeholder={`Amount collected (₹${balance.toLocaleString('en-IN')} due)`}
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="input text-sm"
            />
            {amountPaid && parseFloat(amountPaid) < balance && (
              <div className="text-xs text-amber-600 dark:text-amber-400">⚠ Amount is less than balance — bill will be marked as partially paid</div>
            )}
          </div>

          {/* Confirm */}
          <button
            onClick={() => checkoutMutation.mutate()}
            disabled={checkoutMutation.isPending || folioLoading || isCashBlocked}
            className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 disabled:opacity-50"
          >
            {checkoutMutation.isPending ? (
              <><Loader2 size={14} className="animate-spin" /> Processing…</>
            ) : isCashBlocked ? (
              <>⚠ Open Shift to Accept Cash</>
            ) : (
              <><LogOut size={14} /> Confirm Checkout & Generate Bill</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Folio Drawer ─────────────────────────────────────────────────────────────

function FolioDrawer({ reservation, onClose }: { reservation: Reservation; onClose: () => void }) {
  const [addForm, setAddForm] = useState({ description: '', amount: '', chargeType: 'service' });
  const qc = useQueryClient();

  const { data: folio, isLoading, isFetching } = useQuery<{ charges: FolioCharge[]; totalCharges: number; totalPaid: number; balance: number }>({
    queryKey: ['hotel-folio', reservation.id],
    queryFn: () => api.get(`/api/v1/hotel/reservations/${reservation.id}/folio`).then((r) => r.data?.data ?? r.data),
    staleTime: 0,
  });

  const addCharge = useMutation({
    mutationFn: (body: any) => api.post(`/api/v1/hotel/reservations/${reservation.id}/folio/charges`, body).then((r) => r.data),
    onSuccess: () => {
      toast.success('Charge added');
      qc.invalidateQueries({ queryKey: ['hotel-folio', reservation.id] });
      setAddForm({ description: '', amount: '', chargeType: 'service' });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e?.message || 'Failed to add charge'),
  });


  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="w-full max-w-md bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Folio — Room {reservation.room?.roomNumber}</h2>
            <div className="text-xs text-slate-900 dark:text-slate-500">{reservation.primaryGuest?.name} · {fmt(reservation.checkInDate)} → {fmt(reservation.checkOutDate)}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-500"><X size={15} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <div className="text-slate-900 dark:text-slate-500 text-sm text-center py-8 animate-pulse">Loading folio…</div>
          ) : (
            <>
              {isFetching && (
                <div className="flex items-center gap-2 text-xs text-slate-900 dark:text-slate-500 animate-pulse">
                  <Loader2 size={11} className="animate-spin" /> Refreshing…
                </div>
              )}
              <div className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {(folio?.charges ?? []).map((c) => (
                  <div key={c.id} className="py-2.5 flex justify-between items-center text-xs">
                    <div>
                      <div className="text-slate-600 dark:text-slate-300">{c.description}</div>
                      <div className="text-slate-600 capitalize">{c.chargeType.replace('_', ' ')} · {c.date}</div>
                    </div>
                    <span className={cn('font-semibold tabular-nums', Number(c.amount) < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200')}>
                      {Number(c.amount) < 0 ? '-' : ''}₹{Math.abs(Number(c.amount)).toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-slate-100/50 dark:bg-slate-800/50 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-900 dark:text-slate-400"><span>Total charges</span><span>₹{Math.abs(folio?.totalCharges ?? 0).toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400"><span>Total paid</span><span>₹{(folio?.totalPaid ?? 0).toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between font-bold text-slate-900 dark:text-white border-t border-slate-300 dark:border-slate-700 pt-1.5"><span>Balance</span><span>₹{Math.max(0, folio?.balance ?? 0).toLocaleString('en-IN')}</span></div>
              </div>

              {/* Add charge — only for active reservations */}
              {['confirmed', 'checked_in'].includes(reservation.status) && (
                <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-400">Add Charge</div>
                  <input type="text" placeholder="Description" value={addForm.description} onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))} className="input text-xs" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" placeholder="Amount (₹)" value={addForm.amount} onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))} className="input text-xs" />
                    <select value={addForm.chargeType} onChange={(e) => setAddForm((f) => ({ ...f, chargeType: e.target.value }))} className="input text-xs">
                      <option value="restaurant">Restaurant</option>
                      <option value="laundry">Laundry</option>
                      <option value="minibar">Minibar</option>
                      <option value="service">Service</option>
                      <option value="telephone">Telephone</option>
                      <option value="settlement">Payment received</option>
                      <option value="discount">Discount</option>
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      if (!addForm.description || !addForm.amount) {
                        toast.error('Please fill in description and amount');
                        return;
                      }
                      addCharge.mutate({
                        description: addForm.description,
                        amount: Number(addForm.amount),
                        chargeType: addForm.chargeType,
                      });
                    }}
                    disabled={addCharge.isPending}
                    className="btn-primary w-full text-xs py-1.5 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {addCharge.isPending ? (
                      <><Loader2 size={12} className="animate-spin" /> Adding…</>
                    ) : 'Add Charge'}
                  </button>
                </div>
              )}

              {reservation.status === 'checked_in' && (
                <div className="pt-2 text-xs text-slate-900 dark:text-slate-500 text-center">Use the Checkout button on the reservation row to settle and generate the bill.</div>
              )}

            </>
          )}
        </div>
      </aside>
    </div>
  );
}

// ─── Main reservations page ───────────────────────────────────────────────────

export default function ReservationsPage() {
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [folioRes, setFolioRes] = useState<Reservation | null>(null);
  const [checkoutRes, setCheckoutRes] = useState<Reservation | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => { setPage(1); }, [status, search, from, to]);

  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery<{
    data: Reservation[];
    total: number;
  }>({
    queryKey: [
      'hotel-reservations',
      status,
      search,
      from,
      to,
      page,
    ],

    queryFn: async () => {
      const p = new URLSearchParams({
        page: String(page),
        limit: '25',
      });

      if (status) p.set('status', status);
      if (search) p.set('search', search);
      if (from) p.set('from', from);
      if (to) p.set('to', to);

      const response = await api.get(
        `/api/v1/hotel/reservations?${p}`
      );

      const d = response.data;

      console.log('RESERVATIONS API:', d);

      // already correct shape
      if (d?.data?.data && Array.isArray(d.data.data)) {
        return {
          data: d.data.data,
          total: Number(d.data.total ?? d.data.data.length),
        };
      }

      // direct array response
      if (Array.isArray(d)) {
        return {
          data: d,
          total: d.length,
        };
      }

      // fallback
      return {
        data: [],
        total: 0,
      };
    },

    staleTime: 30_000,
  });

  const mutate = useCallback((id: string, url: string, method: 'post' | 'delete', body?: any, successMsg = 'Done') => {
    setProcessingId(id);
    api[method](url, body)
      .then(() => { toast.success(successMsg); qc.invalidateQueries({ queryKey: ['hotel-reservations'] }); qc.invalidateQueries({ queryKey: ['hotel-rooms'] }); qc.invalidateQueries({ queryKey: ['hotel-dashboard'] }); })
      .catch((e: any) => toast.error(e?.response?.data?.message ?? 'Action failed'))
      .finally(() => setProcessingId(null));
  }, [qc]);

  const reservations = Array.isArray(data?.data)
    ? data.data
    : [];
  const total =
    typeof data?.total === 'number'
      ? data.total
      : reservations.length;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <h1 className="text-base font-semibold text-slate-900 dark:text-white">Reservations</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-400 disabled:opacity-50 transition-colors">
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowNew(true)} className="btn-primary text-xs flex items-center gap-1.5">
            <Plus size={13} /> New Reservation
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 flex-shrink-0 overflow-x-auto scrollbar-none">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={cn(
              'px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors',
              status === t.value
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-6 py-2 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900 dark:text-slate-500" />
          <input type="text" placeholder="Guest name, room, ref…" value={search} onChange={(e) => setSearch(e.target.value)} className="input text-xs pl-8 py-1.5" />
        </div>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-xs py-1.5 w-36" title="From" />
        <span className="text-slate-600 text-xs">–</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input text-xs py-1.5 w-36" title="To" />
        {(from || to || search) && (
          <button onClick={() => { setFrom(''); setTo(''); setSearch(''); }} className="text-xs text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 flex items-center gap-1"><X size={12} /> Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-slate-900 dark:text-slate-500 text-sm animate-pulse">Loading…</div>
        ) : reservations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
            <BedDouble size={40} />
            <p className="text-sm">No reservations found</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400">Guest</th>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400">Room</th>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400">Dates</th>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400">Status</th>
                <th className="text-right px-4 py-3 font-medium text-slate-900 dark:text-slate-400">Amount</th>
                <th className="text-right px-4 py-3 font-medium text-slate-900 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {reservations.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="text-slate-700 dark:text-slate-200 font-medium">{r.primaryGuest?.name}</div>
                      {r.source === 'ota' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 font-semibold uppercase tracking-wider" title="Online Travel Agency (e.g. MakeMyTrip)">OTA</span>
                      )}
                    </div>
                    <div className="text-slate-900 dark:text-slate-500">{r.primaryGuest?.phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-600 dark:text-slate-300 font-mono">{r.room?.roomNumber}</div>
                    <div className="text-slate-900 dark:text-slate-500">{r.room?.roomType?.name}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-400">
                    <div>{fmt(r.checkInDate)} →</div>
                    <div>{fmt(r.checkOutDate)} ({r.numNights}N)</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide', STATUS_BADGE[r.status] ?? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300')}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="text-slate-700 dark:text-slate-200">{fmtMoney(r.totalAmount)}</div>
                    {r.balanceDue > 0 && <div className="text-red-600 dark:text-red-400">Due: {fmtMoney(r.balanceDue)}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {r.status === 'confirmed' && (
                        <button
                          onClick={() => mutate(r.id, `/api/v1/hotel/reservations/${r.id}/check-in`, 'post', undefined, 'Checked in')}
                          disabled={processingId === r.id}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 rounded-lg transition-colors disabled:opacity-50"
                          title="Check In"
                        >
                          {processingId === r.id ? <Loader2 size={11} className="animate-spin" /> : <LogIn size={11} />} Check In
                        </button>
                      )}
                      {r.status === 'checked_in' && (
                        <button
                          onClick={() => setCheckoutRes(r)}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 rounded-lg transition-colors"
                          title="Check Out & Pay"
                        >
                          <LogOut size={11} /> Check Out
                        </button>
                      )}
                      <button
                        onClick={() => setFolioRes(r)}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] bg-slate-200 dark:bg-slate-700/50 text-slate-900 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-700 rounded-lg transition-colors"
                        title="View Folio"
                      >
                        <Receipt size={11} /> Folio
                      </button>
                      {['confirmed', 'checked_in'].includes(r.status) && (
                        <button
                          onClick={() => { if (confirm('Cancel this reservation?')) mutate(r.id, `/api/v1/hotel/reservations/${r.id}/cancel`, 'post', { reason: 'Cancelled by staff' }, 'Reservation cancelled'); }}
                          disabled={processingId === r.id}
                          className="p-1.5 text-red-600 dark:text-red-400/60 hover:text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                          title="Cancel"
                        >
                          {processingId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 bg-white dark:bg-slate-900/50">
          <span className="text-xs text-slate-900 dark:text-slate-500">Showing {((page - 1) * 25) + 1}–{Math.min(page * 25, total)} of {total}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-400 disabled:opacity-30 transition-colors"><ChevronLeft size={14} /></button>
            <span className="text-xs text-slate-900 dark:text-slate-400">Page {page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-400 disabled:opacity-30 transition-colors"><ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {showNew && <NewReservationDrawer onClose={() => setShowNew(false)} onCreated={() => qc.invalidateQueries({ queryKey: ['hotel-reservations'] })} />}
      {folioRes && <FolioDrawer reservation={folioRes} onClose={() => setFolioRes(null)} />}
      {checkoutRes && (
        <CheckoutDialog
          reservation={checkoutRes}
          onClose={() => setCheckoutRes(null)}
          onDone={() => {
            setCheckoutRes(null);
            qc.invalidateQueries({ queryKey: ['hotel-reservations'] });
            qc.invalidateQueries({ queryKey: ['hotel-rooms'] });
            qc.invalidateQueries({ queryKey: ['hotel-dashboard'] });
            qc.invalidateQueries({ queryKey: ['hotel-bills'] });
          }}
        />
      )}
    </div>
  );
}
