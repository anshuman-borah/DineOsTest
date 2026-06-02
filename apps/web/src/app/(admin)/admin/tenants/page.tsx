'use client';
/**
 * Superadmin — Tenant / Business Management
 * Full CRUD for tenant businesses: list, search, suspend, activate, delete.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Building2, Plus, Search, RefreshCw, Loader2, X,
  CheckCircle2, Ban, Trash2, ChevronLeft, ChevronRight,
  Users, GitBranch, ShoppingBag, Pencil,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tenant {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  sub_status?: string;
  plan_name?: string;
  trial_ends_at?: string;
  user_count: number;
  branch_count: number;
  orders_30d: number;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function SubBadge({ status }: { status?: string }) {
  const cfg: Record<string, string> = {
    active:    'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    trial:     'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-500/30',
    past_due:  'bg-orange-500/15 text-orange-400 border-orange-500/30',
    cancelled: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30',
    paused:    'bg-slate-500/15 text-slate-900 dark:text-slate-400 border-slate-500/30',
  };
  return (
    <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize', cfg[status ?? ''] ?? cfg.paused)}>
      {status ?? 'no plan'}
    </span>
  );
}

// ─── Add Business Modal ───────────────────────────────────────────────────────

function AddBusinessModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', email: '', phone: '', businessType: 'restaurant', ownerName: '', ownerPassword: '', planCode: 'starter',
  });

  const { mutate: create, isPending, error } = useMutation({
    mutationFn: (body: typeof form) => api.post('/api/v1/admin/tenants', body).then(r => r.data.data),
    onSuccess: () => {
      toast.success('Business created successfully');
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message || 'Failed to create business';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));
  const err = (error as any)?.response?.data?.message;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Add New Business</h2>
          <button onClick={onClose} className="p-1 text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300"><X size={16} /></button>
        </div>

        {err && <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

        {/* Business info */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-900 dark:text-slate-500 uppercase tracking-wider">Business Details</p>
          <div className="space-y-1">
            <label className="label">Business Name *</label>
            <input className="input-field w-full" placeholder="e.g. Spice Garden Restaurant" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="label">Email *</label>
              <input className="input-field w-full" type="email" placeholder="owner@business.com" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="label">Phone</label>
              <input className="input-field w-full" placeholder="+91 98765 43210" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="label">Business Type</label>
              <select className="input-field w-full" value={form.businessType} onChange={e => set('businessType', e.target.value)}>
                <option value="restaurant">🍽️ Restaurant</option>
                <option value="hotel">🏨 Hotel</option>
                <option value="cafe">☕ Café</option>
                <option value="bakery">🥐 Bakery</option>
                <option value="bar">🍺 Bar &amp; Lounge</option>
                <option value="cloud_kitchen">📦 Cloud Kitchen</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="label">Plan</label>
              <select className="input-field w-full" value={form.planCode} onChange={e => set('planCode', e.target.value)}>
                <option value="starter">Starter — trial</option>
                <option value="growth">Growth — trial</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>
        </div>

        {/* Owner account */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-900 dark:text-slate-500 uppercase tracking-wider">
            Owner Account <span className="text-slate-600 font-normal normal-case">(optional)</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="label">Owner Name</label>
              <input className="input-field w-full" placeholder="Full name" value={form.ownerName} onChange={e => set('ownerName', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="label">Password</label>
              <input className="input-field w-full" type="password" placeholder="Min 8 chars" value={form.ownerPassword} onChange={e => set('ownerPassword', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => create(form)}
            disabled={!form.name || !form.email || isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create Business
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Subscription Modal ──────────────────────────────────────────────────

function EditSubscriptionModal({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    planCode: tenant.plan_name?.toLowerCase() || 'starter',
    status: tenant.sub_status || 'active',
  });

  const { mutate, isPending, error } = useMutation({
    mutationFn: (body: typeof form) => api.patch(`/api/v1/admin/tenants/${tenant.id}/plan`, body).then(r => r.data),
    onSuccess: () => {
      toast.success('Subscription updated');
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message || 'Failed to update subscription';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });

  const err = (error as any)?.response?.data?.message;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl w-full max-w-sm p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Edit Subscription</h2>
          <button onClick={onClose} className="p-1 text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300"><X size={16} /></button>
        </div>

        {err && <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="label">Plan</label>
            <select className="input-field w-full" value={form.planCode} onChange={e => setForm(p => ({ ...p, planCode: e.target.value }))}>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="label">Status</label>
            <select className="input-field w-full" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="past_due">Past Due</option>
              <option value="cancelled">Cancelled</option>
              <option value="paused">Paused</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => mutate(form)}
            disabled={isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const qc = useQueryClient();
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editSub, setEditSub] = useState<Tenant | null>(null);
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [toggling, setToggling]   = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<{ data: Tenant[]; total: number; page: number; limit: number }>({
    queryKey: ['admin-tenants', search, page],
    queryFn: () =>
      api.get(`/api/v1/admin/tenants?search=${encodeURIComponent(search)}&page=${page}&limit=15`)
        .then(r => r.data.data),
    staleTime: 30_000,
  });

  const tenants = data?.data ?? [];
  const total   = data?.total ?? 0;
  const limit   = data?.limit ?? 15;
  const pages   = Math.ceil(total / limit);

  const { mutate: toggleActive } = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/api/v1/admin/tenants/${id}/${active ? 'activate' : 'suspend'}`).then(r => r.data.data),
    onMutate: ({ id }) => setToggling(id),
    onSuccess: (_, { active }) => {
      toast.success(active ? 'Business activated' : 'Business suspended');
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message || 'Action failed';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    },
    onSettled: () => { setToggling(null); qc.invalidateQueries({ queryKey: ['admin-tenants'] }); },
  });

  const { mutate: deleteTenant } = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/tenants/${id}`).then(r => r.data),
    onMutate: (id) => setDeleting(id),
    onSuccess: () => {
      toast.success('Business permanently deleted');
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message || 'Delete failed';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    },
    onSettled: () => { setDeleting(null); qc.invalidateQueries({ queryKey: ['admin-tenants'] }); },
  });

  const handleDelete = (t: Tenant) => {
    if (!confirm(`Permanently delete "${t.name}" and ALL their data? This cannot be undone.`)) return;
    deleteTenant(t.id);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold text-slate-900 dark:text-white">Tenants</h1>
          <p className="text-xs text-slate-900 dark:text-slate-500">{total} businesses on the platform</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-400 transition-colors">
            <RefreshCw size={13} />
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-xs flex items-center gap-1.5">
            <Plus size={13} /> Add Business
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800/60 flex-shrink-0">
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900 dark:text-slate-500" />
          <input
            className="input-field w-full pl-8 py-1.5 text-sm"
            placeholder="Search by name, email or slug…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={22} className="animate-spin text-slate-600" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-600">
            <Building2 size={32} />
            <p className="text-sm">{search ? 'No businesses match your search' : 'No businesses yet'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="th">Business</th>
                <th className="th">Contact</th>
                <th className="th">Plan</th>
                <th className="th text-center">Users</th>
                <th className="th text-center">Branches</th>
                <th className="th text-center">Orders 30d</th>
                <th className="th">Status</th>
                <th className="th">Joined</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id} className={cn('table-row', !t.is_active && 'opacity-50')}>
                  <td className="td">
                    <div className="font-medium text-slate-900 dark:text-white">{t.name}</div>
                    <div className="text-xs text-slate-900 dark:text-slate-500">{t.slug}</div>
                  </td>
                  <td className="td">
                    <div>{t.email}</div>
                    {t.phone && <div className="text-xs text-slate-900 dark:text-slate-500">{t.phone}</div>}
                  </td>
                  <td className="td">
                    <SubBadge status={t.sub_status} />
                    {t.plan_name && <div className="text-[10px] text-slate-900 dark:text-slate-500 mt-0.5">{t.plan_name}</div>}
                  </td>
                  <td className="td text-center">
                    <span className="flex items-center justify-center gap-1">
                      <Users size={11} className="text-slate-900 dark:text-slate-500" />{t.user_count}
                    </span>
                  </td>
                  <td className="td text-center">
                    <span className="flex items-center justify-center gap-1">
                      <GitBranch size={11} className="text-slate-900 dark:text-slate-500" />{t.branch_count}
                    </span>
                  </td>
                  <td className="td text-center">
                    <span className="flex items-center justify-center gap-1">
                      <ShoppingBag size={11} className="text-slate-900 dark:text-slate-500" />{t.orders_30d}
                    </span>
                  </td>
                  <td className="td">
                    <span className={cn('text-xs font-medium', t.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-500')}>
                      {t.is_active ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="td text-xs text-slate-900 dark:text-slate-500">
                    {format(new Date(t.created_at), 'dd MMM yyyy')}
                  </td>
                  <td className="td">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditSub(t)}
                        title="Edit Subscription"
                        className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => toggleActive({ id: t.id, active: !t.is_active })}
                        disabled={toggling === t.id}
                        title={t.is_active ? 'Suspend' : 'Activate'}
                        className={cn(
                          'p-1.5 rounded-lg transition-colors',
                          t.is_active
                            ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:bg-amber-500/15'
                            : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15',
                        )}
                      >
                        {toggling === t.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : t.is_active ? <Ban size={13} /> : <CheckCircle2 size={13} />
                        }
                      </button>
                      <button
                        onClick={() => handleDelete(t)}
                        disabled={deleting === t.id}
                        title="Delete permanently"
                        className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/15 transition-colors"
                      >
                        {deleting === t.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Trash2 size={13} />
                        }
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
          <span className="text-xs text-slate-900 dark:text-slate-500">
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
              className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-400 disabled:opacity-40 transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-slate-900 dark:text-slate-400 px-2">Page {page} of {pages}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page === pages}
              className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-400 disabled:opacity-40 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {showAdd && <AddBusinessModal onClose={() => setShowAdd(false)} />}
      {editSub && <EditSubscriptionModal tenant={editSub} onClose={() => setEditSub(null)} />}
    </div>
  );
}
