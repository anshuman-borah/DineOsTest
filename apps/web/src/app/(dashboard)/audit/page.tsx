'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Shield, RefreshCw, ChevronLeft, ChevronRight, X, Search, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface AuditResponse {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_OPTIONS = [
  'orders', 'bills', 'users', 'shifts', 'menu_items',
  'menu_categories', 'inventory', 'branches', 'tenants',
];

const ACTION_OPTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'VOID', 'PRINT'];

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30',
  UPDATE: 'bg-blue-500/15   text-blue-400   ring-1 ring-blue-500/30',
  DELETE: 'bg-red-500/15    text-red-600 dark:text-red-400    ring-1 ring-red-500/30',
  LOGIN:  'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30',
  LOGOUT: 'bg-slate-500/15  text-slate-900 dark:text-slate-400  ring-1 ring-slate-500/30',
  VOID:   'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30',
  PRINT:  'bg-amber-100 dark:bg-amber-500/15  text-amber-600 dark:text-amber-400  ring-1 ring-amber-500/30',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractAuditResponse(raw: any): AuditResponse {
  if (Array.isArray(raw?.data)) {
    return {
      data:  raw.data,
      total: raw.total ?? raw.data.length,
      page:  raw.page  ?? 1,
      limit: raw.limit ?? raw.data.length,
    };
  }
  if (Array.isArray(raw)) {
    return { data: raw, total: raw.length, page: 1, limit: raw.length };
  }
  return { data: [], total: 0, page: 1, limit: 100 };
}

function DiffViewer({
  old: oldVal,
  next,
}: {
  old: Record<string, unknown>;
  next: Record<string, unknown>;
}) {
  const keys = Array.from(new Set([
    ...Object.keys(oldVal ?? {}),
    ...Object.keys(next  ?? {}),
  ]));
  return (
    <div className="divide-y divide-slate-200 dark:divide-slate-800">
      {keys.map((k) => {
        const prev    = JSON.stringify(oldVal?.[k]);
        const curr    = JSON.stringify(next?.[k]);
        const changed = prev !== curr;
        return (
          <div key={k} className={cn('py-2 px-3 text-xs font-mono', changed && 'bg-yellow-500/5')}>
            <span className="text-slate-900 dark:text-slate-500 select-none mr-2">{k}</span>
            {changed ? (
              <span>
                <span className="line-through text-red-600 dark:text-red-400 mr-2">{prev}</span>
                <span className="text-emerald-600 dark:text-emerald-400">{curr}</span>
              </span>
            ) : (
              <span className="text-slate-900 dark:text-slate-400">{curr}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s <  60)   return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const [page,       setPage]       = useState(1);
  const [limit,      setLimit]      = useState(100);
  const [entity,     setEntity]     = useState('');
  const [action,     setAction]     = useState('');
  const [from,       setFrom]       = useState('');
  const [to,         setTo]         = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [drawerLog,  setDrawerLog]  = useState<AuditLog | null>(null);

  // Only send userId to API if it's a valid UUID
  const validUserFilter = userFilter && UUID_REGEX.test(userFilter) ? userFilter : '';
  const userFilterError = userFilter.length > 0 && !UUID_REGEX.test(userFilter);

  const queryKey = ['audit', page, limit, entity, action, from, to, validUserFilter];

  const { data: rawData, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page',  String(page));
      params.set('limit', String(limit));
      if (entity)          params.set('entity', entity);
      if (action)          params.set('action', action);
      if (from)            params.set('from',   from);
      if (to)              params.set('to',      to);
      if (validUserFilter) params.set('userId',  validUserFilter);
      const { data } = await apiFetch(`/api/v1/audit/tenant?${params}`);
      return data;
    },
    staleTime: 30_000,
  });

  const auditData  = extractAuditResponse(rawData);
  const logs       = auditData.data;
  const total      = auditData.total;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const resetPage = useCallback(() => setPage(1), []);
  useEffect(() => {
    resetPage();
  }, [entity, action, from, to, validUserFilter, limit, resetPage]);

  function clearFilters() {
    setEntity('');
    setAction('');
    setFrom('');
    setTo('');
    setUserFilter('');
  }

  const hasFilters = entity || action || from || to || userFilter;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center">
            <Shield size={16} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 dark:text-white">Audit Log</h1>
            <p className="text-xs text-slate-900 dark:text-slate-500">
              {total.toLocaleString()} event{total !== 1 ? 's' : ''} recorded
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex-shrink-0">
        <Filter size={14} className="text-slate-900 dark:text-slate-500 flex-shrink-0" />

        <select value={entity} onChange={(e) => setEntity(e.target.value)}
          className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500">
          <option value="">All entities</option>
          {ENTITY_OPTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>

        <select value={action} onChange={(e) => setAction(e.target.value)}
          className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500">
          <option value="">All actions</option>
          {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>

        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
          title="From date" />
        <span className="text-slate-600 text-xs">–</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
          title="To date" />

        {/* User ID filter with inline validation */}
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-900 dark:text-slate-500" />
          <input
            type="text"
            placeholder="User UUID…"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className={cn(
              'text-xs bg-slate-50 dark:bg-slate-800 border text-slate-600 dark:text-slate-300 rounded-lg pl-6 pr-2 py-1.5 w-48 focus:outline-none focus:ring-1',
              userFilterError
                ? 'border-red-500/50 focus:ring-red-500'
                : 'border-slate-300 dark:border-slate-700 focus:ring-violet-500',
            )}
          />
          {userFilterError && (
            <div className="absolute top-full left-0 mt-1 text-[10px] text-red-600 dark:text-red-400 whitespace-nowrap">
              Must be a valid UUID
            </div>
          )}
        </div>

        {hasFilters && (
          <button onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 transition-colors">
            <X size={12} /> Clear
          </button>
        )}

        <div className="flex-1" />

        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}
          className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500">
          {[50, 100, 250].map((n) => <option key={n} value={n}>{n} per page</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isError ? (
          <div className="flex items-center justify-center h-full text-slate-900 dark:text-slate-500 text-sm">
            Failed to load audit logs. Check your permissions.
          </div>
        ) : isFetching ? (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400 w-44">Timestamp</th>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400 w-24">Action</th>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400 w-28">Entity</th>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400">Entity ID</th>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400">User ID</th>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400 w-32">IP Address</th>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400 w-24">Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {Array.from({ length: 15 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-slate-800/80 rounded w-24"></div></td>
                  <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-slate-800/80 rounded w-16"></div></td>
                  <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-slate-800/80 rounded w-20"></div></td>
                  <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-slate-800/80 rounded w-32"></div></td>
                  <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-slate-800/80 rounded w-32"></div></td>
                  <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-slate-800/80 rounded w-24"></div></td>
                  <td className="px-4 py-3.5"><div className="h-4 bg-slate-200 dark:bg-slate-800/80 rounded w-12"></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
            <Shield size={40} />
            <p className="text-sm">
              {userFilterError
                ? 'Enter a complete valid UUID to filter by user.'
                : 'No audit events found for the selected filters.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400 w-44">Timestamp</th>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400 w-24">Action</th>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400 w-28">Entity</th>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400">Entity ID</th>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400">User ID</th>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400 w-32">IP Address</th>
                <th className="text-left px-4 py-3 font-medium text-slate-900 dark:text-slate-400 w-24">Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {logs.map((log) => {
                const hasDiff = log.oldValue || log.newValue;
                return (
                  <tr
                    key={log.id}
                    onClick={() => hasDiff && setDrawerLog(log)}
                    className={cn(
                      'hover:bg-slate-100/40 dark:bg-slate-800/40 transition-colors',
                      hasDiff && 'cursor-pointer',
                    )}
                  >
                    <td className="px-4 py-2.5 text-slate-900 dark:text-slate-400 whitespace-nowrap">
                      <div>{fmtDate(log.createdAt)}</div>
                      <div className="text-slate-600 text-[10px]">{timeAgo(log.createdAt)}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide uppercase',
                        ACTION_COLORS[log.action] ?? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
                      )}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 font-mono">{log.entity}</td>
                    <td className="px-4 py-2.5 text-slate-900 dark:text-slate-500 font-mono truncate max-w-[10rem]">
                      {log.entityId ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-900 dark:text-slate-500 font-mono truncate max-w-[10rem]">
                      {log.userId ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-900 dark:text-slate-500 font-mono">{log.ipAddress ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {hasDiff
                        ? <span className="text-violet-400 hover:text-violet-300 text-[10px] font-medium">View diff ›</span>
                        : <span className="text-slate-700">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && !isError && total > 0 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 bg-white dark:bg-slate-900/50">
          <span className="text-xs text-slate-900 dark:text-slate-500">
            Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-slate-900 dark:text-slate-400 min-w-[5rem] text-center">
              Page {page} / {totalPages}
            </span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Diff Drawer */}
      {drawerLog && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setDrawerLog(null)} />
          <aside className="w-full max-w-lg bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">

            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide',
                    ACTION_COLORS[drawerLog.action] ?? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
                  )}>
                    {drawerLog.action}
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white font-mono">
                    {drawerLog.entity}
                  </span>
                </div>
                <div className="text-xs text-slate-900 dark:text-slate-500 mt-1">{fmtDate(drawerLog.createdAt)}</div>
              </div>
              <button onClick={() => setDrawerLog(null)}
                className="p-1.5 rounded-lg hover:bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-slate-600 mb-0.5">Entity ID</div>
                <div className="font-mono text-slate-600 dark:text-slate-300 truncate">{drawerLog.entityId ?? '—'}</div>
              </div>
              <div>
                <div className="text-slate-600 mb-0.5">User ID</div>
                <div className="font-mono text-slate-600 dark:text-slate-300 truncate">{drawerLog.userId ?? '—'}</div>
              </div>
              <div>
                <div className="text-slate-600 mb-0.5">IP Address</div>
                <div className="font-mono text-slate-600 dark:text-slate-300">{drawerLog.ipAddress ?? '—'}</div>
              </div>
              <div>
                <div className="text-slate-600 mb-0.5">User Agent</div>
                <div className="font-mono text-slate-900 dark:text-slate-400 truncate text-[10px]">
                  {drawerLog.userAgent ? drawerLog.userAgent.slice(0, 60) + '…' : '—'}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              {drawerLog.oldValue && drawerLog.newValue ? (
                <div>
                  <div className="px-5 py-2 text-[10px] font-semibold text-slate-600 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800">
                    Field changes (before → after)
                  </div>
                  <DiffViewer old={drawerLog.oldValue} next={drawerLog.newValue} />
                </div>
              ) : drawerLog.newValue ? (
                <div>
                  <div className="px-5 py-2 text-[10px] font-semibold text-slate-600 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800">
                    Created with values
                  </div>
                  <div className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                    {JSON.stringify(drawerLog.newValue, null, 2)}
                  </div>
                </div>
              ) : drawerLog.oldValue ? (
                <div>
                  <div className="px-5 py-2 text-[10px] font-semibold text-slate-600 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800">
                    Deleted record
                  </div>
                  <div className="px-3 py-2 font-mono text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap">
                    {JSON.stringify(drawerLog.oldValue, null, 2)}
                  </div>
                </div>
              ) : null}

              {drawerLog.metadata && Object.keys(drawerLog.metadata).length > 0 && (
                <div>
                  <div className="px-5 py-2 text-[10px] font-semibold text-slate-600 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800 mt-4">
                    Metadata
                  </div>
                  <div className="px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-400 whitespace-pre-wrap">
                    {JSON.stringify(drawerLog.metadata, null, 2)}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}