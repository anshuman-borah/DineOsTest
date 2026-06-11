'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPatch } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import {
  CheckCircle, RefreshCw, Clock, ChefHat,
  AlertCircle, Volume2, VolumeX, FlameKindling, Loader2,
  ArrowDown, Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { KdsTicketSkeleton } from '@/components/ui/Skeleton';
import toast from 'react-hot-toast';

/* ─── Audio ───────────────────────────────────────────────────────────────── */
let audioContext: AudioContext | null = null;

function playBeep(frequency = 880, duration = 0.18, volume = 0.4) {
  if (typeof window === 'undefined') return;
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') audioContext.resume();
    const osc  = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + duration);
  } catch (e) {
    console.warn('Audio playback failed:', e);
  }
}

function playReadyChime() {
  playBeep(660, 0.15, 0.3);
  setTimeout(() => playBeep(880,  0.15, 0.3),  180);
  setTimeout(() => playBeep(1100, 0.2,  0.35), 360);
}

function playBumpSound() {
  playBeep(440, 0.1, 0.2);
}

/* ─── Stations ────────────────────────────────────────────────────────────── */
const STATIONS = [
  { id: 'all',  label: 'All Stations',    icon: '📋', keywords: [] },
  { id: 'hot',  label: 'Hot Kitchen',     icon: '🔥', keywords: ['starter', 'main', 'curry', 'grill', 'tandoor', 'soup', 'rice', 'tikka', 'dal', 'chicken', 'mutton', 'fish', 'bread', 'roti', 'naan', 'paneer', 'burger', 'burgwer'] },
  { id: 'cold', label: 'Cold Section',    icon: '🧊', keywords: ['salad', 'raita', 'cold', 'yogurt', 'lassi', 'shake', 'ice', 'dessert', 'sweet', 'gulab', 'kheer', 'halwa', 'cake'] },
  { id: 'bar',  label: 'Bar / Beverages', icon: '🥤', keywords: ['beer', 'wine', 'whisky', 'rum', 'gin', 'vodka', 'cocktail', 'mocktail', 'juice', 'soda', 'water', 'beverage', 'drink', 'lime', 'mango', 'lassi', 'lagoon', 'matcha', 'tea', 'coffee'] },
] as const;

type StationId    = (typeof STATIONS)[number]['id'];
const STATION_KEY = 'dinestay:kds:station';
const URGENT_SECS = 600; // 10 min

interface KDSItem {
  order_item_id:      string;
  order_id:           string;
  order_order_number: string;
  item_name:          string;
  category_name?:     string;
  quantity:           number;
  notes?:             string;
  kds_status:         'pending' | 'acknowledged' | 'preparing' | 'ready';
  age_seconds:        number;
  order_type?:        string;
  table_name?:        string;
  created_at:         string;
  kds_ready_at?:      string;
}

function matchesStation(item: KDSItem, stationId: StationId): boolean {
  if (stationId === 'all') return true;
  const station = STATIONS.find((s) => s.id === stationId);
  if (!station?.keywords.length) return true;
  const haystack = `${item.item_name || ''} ${item.category_name || ''}`.toLowerCase();
  return station.keywords.some((kw) => haystack.includes(kw));
}

/* ─── Live timer hook ─────────────────────────────────────────────────────── */
function useAgeSeconds(createdAt: string): number {
  const [age, setAge] = useState(() =>
    Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)),
  );
  useEffect(() => {
    const interval = setInterval(() => {
      setAge(Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);
  return age;
}

/* Time since a specific point (for "ready since" counter) */
function useTimeSince(isoDate: string | null): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isoDate) { setElapsed(0); return; }
    const calc = () => Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
    setElapsed(calc());
    const interval = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(interval);
  }, [isoDate]);
  return elapsed;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h  = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  return `${m}m ${s}s`;
}

/* ─── Priority sorting ────────────────────────────────────────────────────── */
function getOrderPriority(tickets: KDSItem[]): number {
  const allReady    = tickets.every((t) => t.kds_status === 'ready');
  if (allReady) return 3;
  const anyPending  = tickets.some((t) => t.kds_status === 'pending');
  if (anyPending) {
    const oldest   = tickets.reduce(
      (min, t) => Math.min(min, new Date(t.created_at).getTime()),
      Infinity,
    );
    const ageSecs  = Math.floor((Date.now() - oldest) / 1000);
    return ageSecs > URGENT_SECS ? 0 : 1;
  }
  return 2; // preparing
}

function getOldestTimestamp(tickets: KDSItem[]): number {
  return tickets.reduce(
    (min, t) => Math.min(min, new Date(t.created_at).getTime()),
    Infinity,
  );
}

/* ─── Ticket Card ─────────────────────────────────────────────────────────── */
function TicketCard({
  orderNum, tickets,
  onStartCooking, onMarkReady, onBump,
  isBumping, isMarkingReady, isStartingCooking,
}: {
  orderNum:         string;
  tickets:          KDSItem[];
  onStartCooking:   (ids: string[]) => void;
  onMarkReady:      (ids: string[]) => void;
  onBump:           (ids: string[]) => void;
  isBumping:        boolean;
  isMarkingReady:   boolean;
  isStartingCooking: boolean;
}) {
  const oldest = [...tickets].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )[0];

  const allReady    = tickets.every((t) => t.kds_status === 'ready');
  const anyPending  = tickets.some((t) => t.kds_status === 'pending');
  const anyPreparing = tickets.some(
    (t) => t.kds_status === 'preparing' || t.kds_status === 'acknowledged',
  );

  // Latest ready_at timestamp (for ready orders)
  const latestReadyAt = allReady
    ? tickets
        .filter((t) => t.kds_ready_at)
        .sort((a, b) => new Date(b.kds_ready_at!).getTime() - new Date(a.kds_ready_at!).getTime())[0]
        ?.kds_ready_at ?? null
    : null;

  const ageSeconds = useAgeSeconds(oldest?.created_at || new Date().toISOString());
  const readySince = useTimeSince(latestReadyAt);

  const isUrgent = !allReady && ageSeconds > URGENT_SECS;

  const orderTypeDisplay = (() => {
    const type = oldest?.order_type || 'dine_in';
    if (type === 'takeaway') return { icon: '🥡', label: 'Takeaway' };
    if (type === 'delivery') return { icon: '🛵', label: 'Delivery' };
    return { icon: '🍽️', label: 'Dine In' };
  })();

  /* ── Card container styles ── */
  const cardClass = cn(
    'rounded-2xl border-2 shadow-lg overflow-hidden flex flex-col transition-all duration-300',
    allReady
      ? 'border-emerald-400 dark:border-emerald-500 bg-gradient-to-b from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-slate-900'
      : isUrgent
        ? 'border-red-500 ring-2 ring-red-400/40 shadow-red-100 dark:shadow-red-900/20'
        : anyPending
          ? 'border-amber-400 dark:border-amber-500/70'
          : anyPreparing
            ? 'border-blue-400 dark:border-blue-500/60'
            : 'border-slate-200 dark:border-slate-700',
  );

  /* ── Header bg ── */
  const headerClass = cn(
    'px-4 py-3 border-b flex items-start justify-between',
    allReady
      ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800'
      : isUrgent
        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700',
  );

  /* ── Timer badge ── */
  const timerClass = cn(
    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums flex-shrink-0 ml-2',
    allReady
      ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
      : isUrgent
        ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 animate-pulse'
        : ageSeconds > 300
          ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  );

  return (
    <div className={cardClass}>

      {/* Urgent ribbon */}
      {isUrgent && !allReady && (
        <div className="bg-red-500 text-white text-center text-xs font-bold py-1.5 flex items-center justify-center gap-1.5 animate-pulse">
          <AlertCircle size={13} />
          URGENT — {formatAge(ageSeconds)} waiting
        </div>
      )}

      {/* Header */}
      <div className={headerClass}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className={cn(
              'font-extrabold text-lg leading-none',
              allReady   ? 'text-emerald-700 dark:text-emerald-300' :
              isUrgent   ? 'text-red-700 dark:text-red-300' :
              'text-slate-900 dark:text-white',
            )}>
              #{oldest?.order_order_number || orderNum}
            </h2>
            {allReady && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                Ready
              </span>
            )}
            {anyPending && !allReady && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                New
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
            <span>{orderTypeDisplay.icon}</span>
            <span>{orderTypeDisplay.label}</span>
            {oldest?.table_name && (
              <>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Table {oldest.table_name}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Timer */}
        <div className={timerClass}>
          <Clock size={12} />
          <span>{allReady ? formatAge(readySince) : formatAge(ageSeconds)}</span>
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 p-3 space-y-1.5 overflow-y-auto max-h-[300px] bg-white dark:bg-slate-900">
        {tickets.map((ticket) => {
          const isReady    = ticket.kds_status === 'ready';
          const isPending  = ticket.kds_status === 'pending';
          const isCooking  = ticket.kds_status === 'preparing' || ticket.kds_status === 'acknowledged';

          return (
            <div
              key={ticket.order_item_id}
              className={cn(
                'rounded-xl border p-2.5 flex items-start gap-2.5 transition-all',
                isReady   && 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/20',
                isPending && 'border-amber-200  dark:border-amber-800/50  bg-amber-50/60  dark:bg-amber-950/10',
                isCooking && 'border-blue-200   dark:border-blue-800/50   bg-blue-50/40   dark:bg-blue-950/10',
              )}
            >
              {/* Qty badge */}
              <div className={cn(
                'min-w-[34px] h-8 rounded-lg flex items-center justify-center font-black text-sm flex-shrink-0',
                isReady   ? 'bg-emerald-500 text-white' :
                isPending ? 'bg-amber-500 text-slate-900' :
                'bg-blue-500 text-white',
              )}>
                {Math.round(ticket.quantity)}×
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-slate-900 dark:text-white font-semibold text-sm leading-snug break-words">
                  {ticket.item_name}
                </p>

                {ticket.notes && (
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 px-2 py-0.5">
                    <span className="text-red-600 dark:text-red-400 text-[11px] font-medium">
                      📝 {ticket.notes}
                    </span>
                  </div>
                )}

                {/* Status label */}
                {isReady && (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle size={11} /> Ready
                  </div>
                )}
                {isCooking && (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
                    <ChefHat size={11} className="animate-pulse" /> Cooking...
                  </div>
                )}
                {isPending && (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-500">
                    <Clock size={11} /> Waiting...
                  </div>
                )}
              </div>

              {isReady && (
                <CheckCircle size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />
              )}
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80">
        {allReady ? (
          /* ── READY: BUMP button ─── */
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <div className="relative">
                <CheckCircle size={14} />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              </div>
              Ready
              {readySince > 0 && (
                <span className="text-emerald-500/70 font-normal">
                  · waiting {formatAge(readySince)}
                </span>
              )}
            </div>

            <button
              onClick={() => onBump(tickets.map((t) => t.order_item_id))}
              disabled={isBumping}
              className={cn(
                'w-full py-3 rounded-xl font-bold text-sm transition-all',
                'bg-gradient-to-r from-emerald-500 to-emerald-600',
                'hover:from-emerald-600 hover:to-emerald-700',
                'text-white shadow-md shadow-emerald-200/60 dark:shadow-emerald-900/30',
                'flex items-center justify-center gap-2',
                'active:scale-[0.97]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {isBumping
                ? <><Loader2 size={15} className="animate-spin" /> Bumping...</>
                : <><Package size={15} /> BUMP — Order Picked Up</>
              }
            </button>
          </div>
        ) : (
          /* ── COOKING: Start / Mark Ready ─── */
          <div className={cn(
            'grid gap-2',
            anyPending && anyPreparing ? 'grid-cols-2' : 'grid-cols-1',
          )}>
            {anyPending && (
              <button
                onClick={() => onStartCooking(
                  tickets.filter((t) => t.kds_status === 'pending').map((t) => t.order_item_id),
                )}
                disabled={isStartingCooking}
                className={cn(
                  'flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600',
                  'text-slate-800 dark:text-white',
                  'active:scale-[0.97] disabled:opacity-50',
                )}
              >
                {isStartingCooking
                  ? <Loader2 size={14} className="animate-spin" />
                  : <ChefHat size={14} />
                }
                Start Cooking
              </button>
            )}

            {(anyPreparing || anyPending) && (
              <button
                onClick={() => onMarkReady(
                  tickets
                    .filter((t) =>
                      t.kds_status === 'pending' ||
                      t.kds_status === 'preparing' ||
                      t.kds_status === 'acknowledged',
                    )
                    .map((t) => t.order_item_id),
                )}
                disabled={isMarkingReady}
                className={cn(
                  'flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all',
                  'bg-amber-500 hover:bg-amber-400 text-slate-900',
                  'active:scale-[0.97] disabled:opacity-50',
                )}
              >
                {isMarkingReady
                  ? <Loader2 size={14} className="animate-spin" />
                  : <CheckCircle size={14} />
                }
                Mark Ready
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN KDS PAGE
   ═══════════════════════════════════════════════════════════════════════════ */
export default function KdsPage() {
  const qc             = useQueryClient();
  const isMutatingRef  = useRef(false);

  const [soundOn,          setSoundOn]          = useState(true);
  const [station,          setStation]          = useState<StationId>('all');
  const [bumping,          setBumping]          = useState<Set<string>>(new Set());
  const [marking,          setMarking]          = useState<Set<string>>(new Set());
  const [starting,         setStarting]         = useState<Set<string>>(new Set());
  const [showReadySection, setShowReadySection] = useState(true);

  const prevCountRef = useRef<number | null>(null);

  /* ── Restore station preference ─────────────────────────────────────── */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STATION_KEY) as StationId | null;
      if (saved && STATIONS.find((s) => s.id === saved)) setStation(saved);
    } catch {}
  }, []);

  const switchStation = (s: StationId) => {
    setStation(s);
    try { localStorage.setItem(STATION_KEY, s); } catch {}
  };

  /* ── Init audio on first interaction ────────────────────────────────── */
  useEffect(() => {
    const init = () => { audioContext?.resume().catch(() => {}); };
    document.addEventListener('click', init, { once: true });
    return () => document.removeEventListener('click', init);
  }, []);

  /* ── Data query ─────────────────────────────────────────────────────── */
  const { data: items, refetch, isLoading, error } = useQuery({
    queryKey: ['kds-pending'],
    queryFn:  () => apiFetch('/api/v1/kds/pending').then((r) => r.data),
    refetchInterval: (starting.size > 0 || marking.size > 0 || bumping.size > 0) ? false : 15_000,
    refetchOnWindowFocus: true,
  });

  /* ── Sound on new pending items ─────────────────────────────────────── */
  useEffect(() => {
    if (!items || !Array.isArray(items)) return;
    const filtered = station === 'all'
      ? items
      : items.filter((i: KDSItem) => matchesStation(i, station));
    const count = filtered.filter((i: KDSItem) => i.kds_status === 'pending').length;
    if (prevCountRef.current !== null && count > prevCountRef.current && soundOn) {
      playBeep(880, 0.18);
      setTimeout(() => playBeep(1100, 0.15), 220);
    }
    prevCountRef.current = count;
  }, [items, soundOn, station]);

  /* ── Socket handlers ────────────────────────────────────────────────── */
  const handleRefetch = useCallback(() => {
    if (isMutatingRef.current) return;
    qc.invalidateQueries({ queryKey: ['kds-pending'] });
  }, [qc]);

  const handleNewOrder = useCallback(() => {
    handleRefetch();
    if (soundOn) {
      playBeep(880, 0.18);
      setTimeout(() => playBeep(1100, 0.15), 220);
    }
  }, [handleRefetch, soundOn]);

  useSocket('order:created',         handleNewOrder);
  useSocket('order:itemsAdded',      handleNewOrder);
  useSocket('order:statusChanged',   handleRefetch);
  useSocket('kds:itemStatusChanged', handleRefetch);

  /* ── Start Cooking ──────────────────────────────────────────────────── */
  const startCooking = useCallback(async (ids: string[]) => {
    isMutatingRef.current = true;
    setStarting((s) => new Set([...s, ...ids]));
    await qc.cancelQueries({ queryKey: ['kds-pending'] });
    qc.setQueryData(['kds-pending'], (old: KDSItem[] | undefined) =>
      old?.map((item) =>
        ids.includes(item.order_item_id) ? { ...item, kds_status: 'preparing' } : item,
      ),
    );
    try {
      await Promise.all(ids.map((id) => apiPatch(`/api/v1/kds/items/${id}/status`, { status: 'preparing' })));
      if (soundOn) playBeep(660, 0.12, 0.2);
    } finally {
      qc.invalidateQueries({ queryKey: ['kds-pending'] });
      setStarting((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });
      isMutatingRef.current = false;
    }
  }, [qc, soundOn]);

  /* ── Mark Ready ─────────────────────────────────────────────────────── */
  const markReady = useCallback(async (ids: string[]) => {
    isMutatingRef.current = true;
    setMarking((s) => new Set([...s, ...ids]));
    await qc.cancelQueries({ queryKey: ['kds-pending'] });
    qc.setQueryData(['kds-pending'], (old: KDSItem[] | undefined) =>
      old?.map((item) =>
        ids.includes(item.order_item_id)
          ? { ...item, kds_status: 'ready', kds_ready_at: new Date().toISOString() }
          : item,
      ),
    );
    try {
      await Promise.all(ids.map((id) => apiPatch(`/api/v1/kds/items/${id}/status`, { status: 'ready' })));
      if (soundOn) playReadyChime();
      toast.success('Order marked ready! Waiter notified. 🔔', { duration: 2500 });
    } finally {
      qc.invalidateQueries({ queryKey: ['kds-pending'] });
      setMarking((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });
      isMutatingRef.current = false;
    }
  }, [qc, soundOn]);

  /* ── Bump ───────────────────────────────────────────────────────────── */
  const bump = useCallback(async (ids: string[]) => {
    isMutatingRef.current = true;
    setBumping((s) => new Set([...s, ...ids]));
    await qc.cancelQueries({ queryKey: ['kds-pending'] });
    // Optimistically remove from view
    qc.setQueryData(['kds-pending'], (old: KDSItem[] | undefined) =>
      old?.filter((item) => !ids.includes(item.order_item_id)),
    );
    try {
      await Promise.all(ids.map((id) => apiPatch(`/api/v1/kds/items/${id}/bump`, {})));
      if (soundOn) playBumpSound();
      toast.success('Order bumped! ✅', { duration: 1500 });
    } finally {
      qc.invalidateQueries({ queryKey: ['kds-pending'] });
      setBumping((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });
      isMutatingRef.current = false;
    }
  }, [qc, soundOn]);

  /* ── Filter + group + sort ──────────────────────────────────────────── */
  /* ── Filter + group + sort ──────────────────────────────────────────── */
const allItems = Array.isArray(items) ? items : [];
const filtered = allItems.filter((i: KDSItem) => matchesStation(i, station));

const grouped = filtered.reduce<Record<string, KDSItem[]>>((acc, item: KDSItem) => {
  const key = item.order_order_number || item.order_item_id;
  if (!acc[key]) acc[key] = [];
  acc[key].push(item);
  return acc;
}, {});

/* Split active vs ready */
const activeOrders: [string, KDSItem[]][] = [];
const readyOrders:  [string, KDSItem[]][] = [];

Object.entries(grouped).forEach(([orderNum, tickets]) => {
  if (tickets.every((t: KDSItem) => t.kds_status === 'ready')) {
    readyOrders.push([orderNum, tickets]);
  } else {
    activeOrders.push([orderNum, tickets]);
  }
});

/* Sort active: urgent → pending → preparing → oldest first within group */
activeOrders.sort((a: [string, KDSItem[]], b: [string, KDSItem[]]) => {
  const priA = getOrderPriority(a[1]);
  const priB = getOrderPriority(b[1]);
  if (priA !== priB) return priA - priB;
  return getOldestTimestamp(a[1]) - getOldestTimestamp(b[1]);
});

/* Sort ready: most recently ready first */
readyOrders.sort((a: [string, KDSItem[]], b: [string, KDSItem[]]) =>
  getOldestTimestamp(b[1]) - getOldestTimestamp(a[1]),
);

  /* Counts */
  const pendingCount  = filtered.filter((i: KDSItem) => i.kds_status === 'pending').length;
  const preparingCount = filtered.filter((i: KDSItem) => i.kds_status === 'preparing' || i.kds_status === 'acknowledged').length;
  const readyCount    = filtered.filter((i: KDSItem) => i.kds_status === 'ready').length;
  const totalGroups   = Object.keys(grouped).length;

  /* ── Loading ─────────────────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="h-full bg-slate-50 dark:bg-slate-950 flex flex-col">
        <div className="px-5 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <ChefHat size={20} className="text-amber-600 dark:text-amber-400" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Kitchen Display</h1>
        </div>
        <div className="flex-1 p-5 overflow-y-auto">
          <KdsTicketSkeleton count={6} />
        </div>
      </div>
    );
  }

  /* ── Error ───────────────────────────────────────────────────────────── */
  if (error) {
    return (
      <div className="h-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4 opacity-70" />
          <p className="text-red-600 dark:text-red-400 font-semibold mb-3">Failed to load orders</p>
          <button onClick={() => refetch()} className="btn-primary">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    );
  }

  /* ── Main render ─────────────────────────────────────────────────────── */
  return (
    <div className="h-full bg-slate-50 dark:bg-slate-950 flex flex-col">

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <ChefHat size={18} className="text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Kitchen Display</h1>

          <div className="flex items-center gap-1.5 ml-1">
            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-medium border border-slate-200 dark:border-slate-700">
              {totalGroups} order{totalGroups !== 1 ? 's' : ''}
            </span>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-bold border border-amber-200 dark:border-amber-800 animate-pulse">
                {pendingCount} new
              </span>
            )}
            {preparingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-xs font-medium border border-blue-200 dark:border-blue-800">
                {preparingCount} cooking
              </span>
            )}
            {readyCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs font-medium border border-emerald-200 dark:border-emerald-800">
                {readyCount} ready
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundOn((s) => !s)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              soundOn
                ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700',
            )}
          >
            {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {soundOn ? 'Sound On' : 'Muted'}
          </button>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors border border-slate-200 dark:border-slate-700"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* Station filter bar */}
      <div className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 overflow-x-auto scrollbar-none">
        <span className="text-xs text-slate-500 font-medium mr-1 whitespace-nowrap flex items-center gap-1 flex-shrink-0">
          <FlameKindling size={12} /> Station:
        </span>
        {STATIONS.map((s) => {
          const sItems   = s.id === 'all' ? allItems : allItems.filter((i: KDSItem) => matchesStation(i, s.id));
          const sPending = sItems.filter((i: KDSItem) => i.kds_status === 'pending').length;
          return (
            <button
              key={s.id}
              onClick={() => switchStation(s.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border flex-shrink-0',
                station === s.id
                  ? 'bg-amber-500 text-slate-900 border-amber-500 shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-amber-300 hover:text-slate-800 dark:hover:text-white',
              )}
            >
              <span>{s.icon}</span>
              {s.label}
              {sPending > 0 && (
                <span className={cn(
                  'text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold',
                  station === s.id ? 'bg-white/90 text-amber-600' : 'bg-red-500 text-white',
                )}>
                  {sPending}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main content */}
      {totalGroups === 0 ? (
        /* All clear */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <div className="w-24 h-24 rounded-3xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <CheckCircle size={48} className="text-emerald-500 dark:text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-300">All Clear! 🎉</h2>
          <p className="text-sm text-slate-500 dark:text-slate-500 text-center max-w-sm">
            {station === 'all'
              ? 'Kitchen is caught up. New orders will appear here automatically.'
              : `No tickets for ${STATIONS.find((s) => s.id === station)?.label}. New orders will appear automatically.`}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">

          {/* Active orders: pending + preparing */}
          {activeOrders.length > 0 && (
            <div className="p-4 pb-2">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {activeOrders.map(([orderNum, tickets]) => (
                  <TicketCard
                    key={orderNum}
                    orderNum={orderNum}
                    tickets={tickets}
                    onStartCooking={startCooking}
                    onMarkReady={markReady}
                    onBump={bump}
                    isBumping={tickets.some((t) => bumping.has(t.order_item_id))}
                    isMarkingReady={tickets.some((t) => marking.has(t.order_item_id))}
                    isStartingCooking={tickets.some((t) => starting.has(t.order_item_id))}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Ready orders: waiting for waiter bump */}
          {readyOrders.length > 0 && (
            <div className="px-4 pb-4 pt-2">
              {/* Collapsible section header */}
              <button
                onClick={() => setShowReadySection((v) => !v)}
                className="w-full flex items-center gap-3 py-2 group"
              >
                <div className="flex-1 h-px bg-emerald-200 dark:bg-emerald-800/60" />
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/50 transition-colors">
                  <CheckCircle size={13} className="text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    {readyOrders.length} Ready — Waiting for Pickup
                  </span>
                  <ArrowDown
                    size={12}
                    className={cn('text-emerald-500 transition-transform duration-200', !showReadySection && '-rotate-90')}
                  />
                </div>
                <div className="flex-1 h-px bg-emerald-200 dark:bg-emerald-800/60" />
              </button>

              {showReadySection && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mt-2">
                  {readyOrders.map(([orderNum, tickets]) => (
                    <TicketCard
                      key={orderNum}
                      orderNum={orderNum}
                      tickets={tickets}
                      onStartCooking={startCooking}
                      onMarkReady={markReady}
                      onBump={bump}
                      isBumping={tickets.some((t) => bumping.has(t.order_item_id))}
                      isMarkingReady={tickets.some((t) => marking.has(t.order_item_id))}
                      isStartingCooking={tickets.some((t) => starting.has(t.order_item_id))}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}