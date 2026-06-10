'use client';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiPost, apiPut, apiDelete } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Plus, Edit2, Trash2, Users, CheckCircle,
  Clock, Sparkles, LayoutGrid, Layers, X, Lock,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';

/* ─── Status config ───────────────────────────────────────────────────────── */
const STATUSES = ['available', 'occupied', 'reserved', 'cleaning'] as const;
type TableStatus = typeof STATUSES[number];

const STATUS_CONFIG: Record<TableStatus, {
  label: string;
  icon: React.ReactNode;
  dot: string;
  // Table card
  card: string;
  cardHover: string;
  title: string;
  meta: string;
  // Badge (current status shown on card)
  badge: string;
  // Dropdown option
  option: string;
  optionActive: string;
  // Summary card at top
  summary: string;
  summaryIcon: string;
  summaryValue: string;
  summaryLabel: string;
  // Edit button
  editBtn: string;
}> = {
  available: {
    label: 'Available',
    icon: <CheckCircle size={13} />,
    dot: 'bg-emerald-500',
    card: 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-800/60',
    cardHover: 'hover:shadow-emerald-200/40 dark:hover:shadow-emerald-900/30 hover:border-emerald-300 dark:hover:border-emerald-700',
    title: 'text-emerald-800 dark:text-emerald-300',
    meta: 'text-emerald-600/70 dark:text-emerald-500/70',
    badge: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    option: 'hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    optionActive: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-semibold',
    summary: 'bg-gradient-to-br from-emerald-50 to-emerald-100/60 dark:from-emerald-950/30 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-800/60',
    summaryIcon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    summaryValue: 'text-emerald-700 dark:text-emerald-300',
    summaryLabel: 'text-emerald-600/80 dark:text-emerald-500/80',
    editBtn: 'bg-emerald-100 dark:bg-emerald-900/30 hover:bg-emerald-200 dark:hover:bg-emerald-800/50 text-emerald-700 dark:text-emerald-400',
  },
  occupied: {
    label: 'Occupied',
    icon: <Users size={13} />,
    dot: 'bg-red-500',
    card: 'bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/40 dark:to-red-900/20 border-red-200 dark:border-red-800/60',
    cardHover: 'hover:shadow-red-200/40 dark:hover:shadow-red-900/30 hover:border-red-300 dark:hover:border-red-700',
    title: 'text-red-800 dark:text-red-300',
    meta: 'text-red-600/70 dark:text-red-500/70',
    badge: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
    option: 'hover:bg-red-50 dark:hover:bg-red-900/30 text-red-700 dark:text-red-400',
    optionActive: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 font-semibold',
    summary: 'bg-gradient-to-br from-red-50 to-red-100/60 dark:from-red-950/30 dark:to-red-900/20 border-red-200 dark:border-red-800/60',
    summaryIcon: 'bg-red-500/10 text-red-600 dark:text-red-400',
    summaryValue: 'text-red-700 dark:text-red-300',
    summaryLabel: 'text-red-600/80 dark:text-red-500/80',
    editBtn: 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-800/50 text-red-700 dark:text-red-400',
  },
  reserved: {
    label: 'Reserved',
    icon: <Clock size={13} />,
    dot: 'bg-amber-500',
    card: 'bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 border-amber-200 dark:border-amber-800/60',
    cardHover: 'hover:shadow-amber-200/40 dark:hover:shadow-amber-900/30 hover:border-amber-300 dark:hover:border-amber-700',
    title: 'text-amber-800 dark:text-amber-300',
    meta: 'text-amber-600/70 dark:text-amber-500/70',
    badge: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    option: 'hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    optionActive: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-semibold',
    summary: 'bg-gradient-to-br from-amber-50 to-amber-100/60 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200 dark:border-amber-800/60',
    summaryIcon: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    summaryValue: 'text-amber-700 dark:text-amber-300',
    summaryLabel: 'text-amber-600/80 dark:text-amber-500/80',
    editBtn: 'bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-800/50 text-amber-700 dark:text-amber-400',
  },
  cleaning: {
    label: 'Cleaning',
    icon: <Sparkles size={13} />,
    dot: 'bg-violet-500 dark:bg-violet-400',
    card: 'bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/40 dark:to-violet-900/20 border-violet-200 dark:border-violet-800/60',
    cardHover: 'hover:shadow-violet-200/40 dark:hover:shadow-violet-900/30 hover:border-violet-300 dark:hover:border-violet-700',
    title: 'text-violet-800 dark:text-violet-300',
    meta: 'text-violet-600/70 dark:text-violet-500/70',
    badge: 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800',
    option: 'hover:bg-violet-50 dark:hover:bg-violet-900/30 text-violet-700 dark:text-violet-400',
    optionActive: 'bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300 font-semibold',
    summary: 'bg-gradient-to-br from-violet-50 to-violet-100/60 dark:from-violet-950/30 dark:to-violet-900/20 border-violet-200 dark:border-violet-800/60',
    summaryIcon: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    summaryValue: 'text-violet-700 dark:text-violet-300',
    summaryLabel: 'text-violet-600/80 dark:text-violet-500/80',
    editBtn: 'bg-violet-100 dark:bg-violet-900/30 hover:bg-violet-200 dark:hover:bg-violet-800/50 text-violet-700 dark:text-violet-400',
  },
};

/* ─── Custom Status Picker ────────────────────────────────────────────────── */
 // Replace ONLY the StatusPicker component in your tables page

function StatusPicker({
  value,
  onChange,
  disabled,
}: {
  value: TableStatus;
  onChange: (status: TableStatus) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cfg = STATUS_CONFIG[value];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative w-full">
      {/* Trigger button */}
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all',
          'focus:outline-none focus:ring-2 focus:ring-amber-500/40',
          cfg.badge,
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-sm',
        )}
      >
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0 animate-pulse', cfg.dot)} />
        <span className="flex-1 text-left truncate">{cfg.label}</span>
        <ChevronDown
          size={12}
          className={cn(
            'flex-shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown — wider than trigger, right-aligned to prevent overflow */}
      {open && (
        <div className={cn(
          'absolute z-50 mt-1.5',
          'w-44 right-0',
          'bg-white dark:bg-slate-900',
          'border border-slate-200 dark:border-slate-700',
          'rounded-xl shadow-xl dark:shadow-2xl',
          'overflow-hidden',
          'animate-in fade-in slide-in-from-top-1 duration-150',
        )}>
          <div className="p-1.5 space-y-0.5">
            {STATUSES.map((status) => {
              const opt = STATUS_CONFIG[status];
              const isActive = status === value;
              return (
                <button
                  key={status}
                  onClick={() => {
                    if (status !== value) onChange(status);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-lg transition-all',
                    isActive ? opt.optionActive : opt.option,
                  )}
                >
                  {/* Colored dot */}
                  <span className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0 ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-900 transition-all',
                    opt.dot,
                    isActive ? 'ring-current scale-110' : 'ring-transparent',
                  )} />

                  {/* Icon */}
                  <span className="flex-shrink-0 opacity-70">{opt.icon}</span>

                  {/* Label — takes remaining space */}
                  <span className="flex-1 text-left whitespace-nowrap">{opt.label}</span>

                  {/* Active check — fixed width so it never gets clipped */}
                  <span className="w-4 flex-shrink-0 flex items-center justify-center">
                    {isActive && <CheckCircle size={12} className="text-current opacity-60" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


/* ─── Page Tab type ───────────────────────────────────────────────────────── */
type PageTab = 'floor' | 'sections';

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN TABLES PAGE
   ═══════════════════════════════════════════════════════════════════════════ */
export default function TablesPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const { data: freshUser } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiFetch('/api/v1/auth/me').then((r) => r.data),
    staleTime: 0,
    gcTime: 0,
  });

  const MANAGE_ROLES = ['owner', 'manager', 'restaurant_manager'];
  const canManage =
    MANAGE_ROLES.includes(user?.role ?? '') ||
    (user?.role === 'waiter' && Boolean(freshUser?.permissions?.canManageTables));

  const [pageTab,       setPageTab]       = useState<PageTab>('floor');
  const [filterSection, setFilterSection] = useState<string | null>(null);

  const [showTableForm,   setShowTableForm]   = useState(false);
  const [editTable,       setEditTable]       = useState<any>(null);
  const [tableForm,       setTableForm]       = useState({ name: '', capacity: 4, sectionId: '' });

  const [showSectionForm, setShowSectionForm] = useState(false);
  const [editSection,     setEditSection]     = useState<any>(null);
  const [sectionForm,     setSectionForm]     = useState({ name: '', description: '', sortOrder: '' });

  /* ── Queries ──────────────────────────────────────────────────────────── */
  const { data: tables, isLoading: tablesLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => apiFetch('/api/v1/tables').then((r) => r.data),
  });

  const { data: sections } = useQuery({
    queryKey: ['tableSections'],
    queryFn: () => apiFetch('/api/v1/tables/sections').then((r) => r.data),
  });

  /* ── Mutations ────────────────────────────────────────────────────────── */
  const saveTableMutation = useMutation({
    mutationFn: () =>
      editTable
        ? apiPut(`/api/v1/tables/${editTable.id}`, tableForm)
        : apiPost('/api/v1/tables', tableForm),
    onSuccess: () => {
      toast.success(editTable ? 'Table updated' : 'Table created');
      qc.invalidateQueries({ queryKey: ['tables'] });
      setShowTableForm(false);
      setEditTable(null);
      setTableForm({ name: '', capacity: 4, sectionId: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to save table'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiPut(`/api/v1/tables/${id}`, { status }),
    onSuccess: (_data, { status }) => {
      toast.success(`Table marked as ${status}`);
      qc.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to update status'),
  });

  const deleteTableMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/tables/${id}`),
    onSuccess: () => {
      toast.success('Table removed');
      qc.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to delete table'),
  });

  const saveSectionMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...sectionForm,
        sortOrder: sectionForm.sortOrder ? parseInt(sectionForm.sortOrder) : undefined,
      };
      return editSection
        ? apiPut(`/api/v1/tables/sections/${editSection.id}`, payload)
        : apiPost('/api/v1/tables/sections', payload);
    },
    onSuccess: () => {
      toast.success(editSection ? 'Section updated' : 'Section created');
      qc.invalidateQueries({ queryKey: ['tableSections'] });
      qc.invalidateQueries({ queryKey: ['tables'] });
      setShowSectionForm(false);
      setEditSection(null);
      setSectionForm({ name: '', description: '', sortOrder: '' });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to save section'),
  });

  const deleteSectionMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/tables/sections/${id}`),
    onSuccess: () => {
      toast.success('Section removed');
      qc.invalidateQueries({ queryKey: ['tableSections'] });
      qc.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Section not empty — move tables first'),
  });

  /* ── Derived ──────────────────────────────────────────────────────────── */
  const visibleTables = (tables || []).filter((t: any) =>
    !filterSection || t.sectionId === filterSection,
  );

  const sectionMap: Record<string, string> = Object.fromEntries(
    (sections || []).map((s: any) => [s.id, s.name]),
  );

  const statusCounts = Object.fromEntries(
    STATUSES.map((s) => [s, (tables || []).filter((t: any) => t.status === s).length]),
  );

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  function openCreateTable() {
    setEditTable(null);
    setTableForm({ name: '', capacity: 4, sectionId: filterSection || '' });
    setShowTableForm(true);
  }
  function openEditTable(t: any) {
    setEditTable(t);
    setTableForm({ name: t.name, capacity: t.capacity, sectionId: t.sectionId || '' });
    setShowTableForm(true);
  }
  function openCreateSection() {
    setEditSection(null);
    setSectionForm({ name: '', description: '', sortOrder: String((sections?.length || 0) + 1) });
    setShowSectionForm(true);
  }
  function openEditSection(s: any) {
    setEditSection(s);
    setSectionForm({ name: s.name, description: s.description || '', sortOrder: String(s.sortOrder || '') });
    setShowSectionForm(true);
  }

  function confirmDeleteTable(table: any) {
    if (table.status === 'occupied') {
      toast.error(`Cannot delete "${table.name}" — table is currently occupied`);
      return;
    }
    toast((t) => (
      <div className="flex flex-col gap-2">
        <span className="font-medium text-slate-900 dark:text-white">
          Delete table &quot;{table.name}&quot;?
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => { toast.dismiss(t.id); deleteTableMutation.mutate(table.id); }}
            className="px-3 py-1 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
          >
            Delete
          </button>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="px-3 py-1 text-sm bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300"
          >
            Cancel
          </button>
        </div>
      </div>
    ), { duration: 10000 });
  }

  function confirmDeleteSection(sec: any, sectionTables: any[]) {
    if (sectionTables.length > 0) {
      toast.error(`Cannot delete "${sec.name}" — move all ${sectionTables.length} table(s) first`);
      return;
    }
    toast((t) => (
      <div className="flex flex-col gap-2">
        <span className="font-medium text-slate-900 dark:text-white">
          Delete section &quot;{sec.name}&quot;?
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => { toast.dismiss(t.id); deleteSectionMutation.mutate(sec.id); }}
            className="px-3 py-1 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
          >
            Delete
          </button>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="px-3 py-1 text-sm bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300"
          >
            Cancel
          </button>
        </div>
      </div>
    ), { duration: 10000 });
  }

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div className="p-6 space-y-5">

      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Table Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {tables?.length || 0} tables · {sections?.length || 0} sections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setPageTab('floor')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                pageTab === 'floor'
                  ? 'bg-amber-500 text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white',
              )}
            >
              <LayoutGrid size={14} /> Floor Plan
            </button>
            <button
              onClick={() => setPageTab('sections')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                pageTab === 'sections'
                  ? 'bg-amber-500 text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white',
              )}
            >
              <Layers size={14} /> Sections
            </button>
          </div>

          {pageTab === 'floor'    && canManage && <button onClick={openCreateTable}   className="btn-primary"><Plus size={14} /> Add Table</button>}
          {pageTab === 'sections' && canManage && <button onClick={openCreateSection} className="btn-primary"><Plus size={14} /> Add Section</button>}

          {user?.role === 'waiter' && !canManage && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <Lock size={12} /> Table management restricted
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          FLOOR PLAN TAB
      ══════════════════════════════════════════════════════════════════ */}
      {pageTab === 'floor' && (
        <>
          {/* Status summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {STATUSES.map((status) => {
              const cfg = STATUS_CONFIG[status];
              return (
                <button
                  key={status}
                  onClick={() => setFilterSection(null)}
                  className={cn(
                    'rounded-xl border p-3 flex items-center gap-3 transition-all hover:shadow-md',
                    cfg.summary,
                  )}
                >
                  <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', cfg.summaryIcon)}>
                    {cfg.icon}
                  </span>
                  <div className="text-left">
                    <div className={cn('text-2xl font-bold leading-none', cfg.summaryValue)}>
                      {statusCounts[status] || 0}
                    </div>
                    <div className={cn('text-xs mt-0.5', cfg.summaryLabel)}>{cfg.label}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Section filter */}
          {(sections?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500 font-medium">Filter:</span>
              <button
                onClick={() => setFilterSection(null)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                  !filterSection
                    ? 'bg-amber-500 text-slate-900 border-amber-500 shadow-sm shadow-amber-200 dark:shadow-amber-900/30'
                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400 bg-white dark:bg-transparent',
                )}
              >
                All sections
              </button>
              {sections?.map((sec: any) => (
                <button
                  key={sec.id}
                  onClick={() => setFilterSection(filterSection === sec.id ? null : sec.id)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                    filterSection === sec.id
                      ? 'bg-amber-500 text-slate-900 border-amber-500 shadow-sm shadow-amber-200 dark:shadow-amber-900/30'
                      : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400 bg-white dark:bg-transparent',
                  )}
                >
                  {sec.name}
                </button>
              ))}
            </div>
          )}

          {/* Tables grid */}
          {tablesLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-xl border-2 border-slate-200 dark:border-slate-700 p-4 h-40 animate-pulse bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {visibleTables.map((table: any) => {
                const cfg = STATUS_CONFIG[table.status as TableStatus] || STATUS_CONFIG.available;
                return (
                  <div
                    key={table.id}
                    className={cn(
                      'rounded-xl border-2 p-3 flex flex-col gap-2.5 transition-all shadow-sm',
                      cfg.card, cfg.cardHover,
                    )}
                  >
                    {/* Name + animated dot */}
                    <div className="flex items-center justify-between gap-1">
                      <span className={cn('font-bold text-sm truncate', cfg.title)}>
                        {table.name}
                      </span>
                      <span className="relative flex-shrink-0">
                        <span className={cn('block w-2.5 h-2.5 rounded-full', cfg.dot)} />
                        {table.status === 'occupied' && (
                          <span className={cn('absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping opacity-40', cfg.dot)} />
                        )}
                      </span>
                    </div>

                    {/* Section name */}
                    {table.sectionId && sectionMap[table.sectionId] && (
                      <div className={cn('text-[11px] truncate leading-tight -mt-1', cfg.meta)}>
                        {sectionMap[table.sectionId]}
                      </div>
                    )}

                    {/* Capacity */}
                    <div className={cn('text-[11px] flex items-center gap-1', cfg.meta)}>
                      <Users size={10} /> {table.capacity} seats
                    </div>

                    {/* Custom status picker (replaces ugly select) */}
                    <StatusPicker
                      value={table.status as TableStatus}
                      onChange={(newStatus) => statusMutation.mutate({ id: table.id, status: newStatus })}
                      disabled={statusMutation.isPending}
                    />

                    {/* Edit / Delete */}
                    {canManage && (
                      <div className="flex gap-1.5 -mx-0.5">
                        <button
                          onClick={() => openEditTable(table)}
                          className={cn(
                            'flex-1 text-[11px] py-1.5 rounded-lg font-medium transition-all',
                            'flex items-center justify-center gap-1',
                            cfg.editBtn,
                          )}
                        >
                          <Edit2 size={10} /> Edit
                        </button>
                        <button
                          onClick={() => confirmDeleteTable(table)}
                          className="flex-1 text-[11px] py-1.5 rounded-lg font-medium transition-all flex items-center justify-center gap-1 bg-red-100 dark:bg-red-900/20 hover:bg-red-200 dark:hover:bg-red-800/40 text-red-600 dark:text-red-400"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {visibleTables.length === 0 && (
                <div className="col-span-full text-center py-16 text-slate-400 dark:text-slate-500 text-sm">
                  No tables{filterSection ? ' in this section' : ''}.{' '}
                  {canManage && (
                    <button onClick={openCreateTable} className="underline hover:text-slate-600 dark:hover:text-slate-300">
                      Add one
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTIONS TAB
      ══════════════════════════════════════════════════════════════════ */}
      {pageTab === 'sections' && (
        <div className="space-y-3">
          {(!sections || sections.length === 0) && (
            <div className="text-center py-16 text-slate-400 dark:text-slate-500">
              <Layers size={40} className="mx-auto mb-3 opacity-30" />
              <p>No sections yet. Sections let you group tables by floor, area or room.</p>
              {canManage && (
                <button onClick={openCreateSection} className="btn-primary mt-4">
                  <Plus size={14} /> Create First Section
                </button>
              )}
            </div>
          )}

          {sections?.map((sec: any) => {
            const sectionTables = (tables || []).filter((t: any) => t.sectionId === sec.id);
            return (
              <div key={sec.id} className="card flex items-center gap-4 hover:shadow-md transition-shadow">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-800/10 border border-amber-200 dark:border-amber-700/40 flex items-center justify-center flex-shrink-0">
                  <Layers size={18} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-white">{sec.name}</div>
                  {sec.description && (
                    <div className="text-xs text-slate-500 mt-0.5">{sec.description}</div>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                      {sectionTables.length} table{sectionTables.length !== 1 ? 's' : ''}
                    </span>
                    {sectionTables.filter((t: any) => t.status === 'available').length > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {sectionTables.filter((t: any) => t.status === 'available').length} available
                      </span>
                    )}
                    {sectionTables.filter((t: any) => t.status === 'occupied').length > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        {sectionTables.filter((t: any) => t.status === 'occupied').length} occupied
                      </span>
                    )}
                    {sectionTables.filter((t: any) => t.status === 'reserved').length > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        {sectionTables.filter((t: any) => t.status === 'reserved').length} reserved
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-slate-400 font-mono">#{sec.sortOrder ?? '—'}</div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEditSection(sec)} className="btn-ghost p-2 rounded-lg">
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => confirmDeleteSection(sec, sectionTables)}
                      className="btn-ghost p-2 rounded-lg text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TABLE FORM MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {showTableForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-lg">
                {editTable ? 'Edit Table' : 'Add New Table'}
              </h3>
              <button onClick={() => setShowTableForm(false)} className="btn-ghost p-1.5 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div>
              <label className="label">Table Name / Number *</label>
              <input
                className="input"
                value={tableForm.name}
                onChange={(e) => setTableForm({ ...tableForm, name: e.target.value })}
                placeholder="T1, Table 1, Terrace-A…"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Capacity (seats)</label>
              <input
                className="input"
                type="number"
                min={1}
                max={50}
                value={tableForm.capacity}
                onChange={(e) => setTableForm({ ...tableForm, capacity: +e.target.value })}
              />
            </div>
            <div>
              <label className="label">Section</label>
              <select
                className="input"
                value={tableForm.sectionId}
                onChange={(e) => setTableForm({ ...tableForm, sectionId: e.target.value })}
              >
                <option value="">— No section —</option>
                {sections?.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {(!sections || sections.length === 0) && (
                <p className="text-xs text-slate-500 mt-1">
                  <button
                    type="button"
                    onClick={() => { setShowTableForm(false); setPageTab('sections'); openCreateSection(); }}
                    className="underline hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    Create a section first
                  </button>{' '}
                  to organise tables by floor or area.
                </p>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowTableForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => {
                  if (!tableForm.sectionId) { toast.error('Please select a section'); return; }
                  saveTableMutation.mutate();
                }}
                disabled={saveTableMutation.isPending || !tableForm.name}
                className="btn-primary flex-1"
              >
                {saveTableMutation.isPending ? 'Saving…' : 'Save Table'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION FORM MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {showSectionForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-lg">
                {editSection ? 'Edit Section' : 'Add New Section'}
              </h3>
              <button onClick={() => setShowSectionForm(false)} className="btn-ghost p-1.5 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div>
              <label className="label">Section Name *</label>
              <input
                className="input"
                value={sectionForm.name}
                onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
                placeholder="Ground Floor, Rooftop, Private Room…"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Description</label>
              <input
                className="input"
                value={sectionForm.description}
                onChange={(e) => setSectionForm({ ...sectionForm, description: e.target.value })}
                placeholder="Optional note about this area"
              />
            </div>
            <div>
              <label className="label">Sort Order</label>
              <input
                className="input"
                type="number"
                min={1}
                value={sectionForm.sortOrder}
                onChange={(e) => setSectionForm({ ...sectionForm, sortOrder: e.target.value })}
                placeholder="1"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowSectionForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => saveSectionMutation.mutate()}
                disabled={saveSectionMutation.isPending || !sectionForm.name}
                className="btn-primary flex-1"
              >
                {saveSectionMutation.isPending ? 'Saving…' : 'Save Section'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}