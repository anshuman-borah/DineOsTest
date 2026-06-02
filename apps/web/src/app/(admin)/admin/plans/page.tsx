'use client';
/**
 * Superadmin — Plans Management
 * Full CRUD for subscription plans.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Plus, Search, RefreshCw, Loader2, X,
  CheckCircle2, Ban, Trash2, Pencil, Gem, DollarSign
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface Plan {
  id: string;
  code: string;
  name: string;
  description?: string;
  priceMonthly: number;
  priceAnnual?: number;
  maxBranches: number;
  maxUsers: number;
  maxMenuItems: number;
  features: string[];
  isActive: boolean;
  createdAt: string;
}

// ─── Plan Modal (Add/Edit) ───────────────────────────────────────────────────

function PlanModal({ plan, onClose }: { plan?: Plan; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!plan;
  const [form, setForm] = useState({
    code: plan?.code || '',
    name: plan?.name || '',
    description: plan?.description || '',
    priceMonthly: plan?.priceMonthly || 0,
    priceAnnual: plan?.priceAnnual || 0,
    maxBranches: plan?.maxBranches || 1,
    maxUsers: plan?.maxUsers || 5,
    maxMenuItems: plan?.maxMenuItems || 100,
    isActive: plan ? plan.isActive : true,
    features: plan?.features?.join(', ') || '',
  });

  const { mutate, isPending, error } = useMutation({
    mutationFn: (body: any) => {
      const payload = {
        ...body,
        priceMonthly: Number(body.priceMonthly),
        priceAnnual: Number(body.priceAnnual),
        maxBranches: Number(body.maxBranches),
        maxUsers: Number(body.maxUsers),
        maxMenuItems: Number(body.maxMenuItems),
        features: body.features.split(',').map((f: string) => f.trim()).filter(Boolean),
      };
      if (isEdit) {
        return api.patch(`/api/v1/admin/plans/${plan.id}`, payload).then(r => r.data);
      }
      return api.post('/api/v1/admin/plans', payload).then(r => r.data);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Plan updated successfully' : 'Plan created successfully');
      qc.invalidateQueries({ queryKey: ['admin-plans'] });
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message || 'Failed to save plan';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });

  const set = (k: keyof typeof form, v: any) => setForm(p => ({ ...p, [k]: v }));
  const err = (error as any)?.response?.data?.message;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{isEdit ? 'Edit Plan' : 'Add New Plan'}</h2>
          <button onClick={onClose} className="p-1 text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300"><X size={16} /></button>
        </div>

        {err && <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="label">Plan Name *</label>
              <input className="input-field w-full" placeholder="e.g. Premium" value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="label">Plan Code *</label>
              <input className="input-field w-full" placeholder="e.g. premium_tier" value={form.code} onChange={e => set('code', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="label">Description</label>
            <input className="input-field w-full" placeholder="Brief description of the plan" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="label">Monthly Price (₹) *</label>
              <input type="number" className="input-field w-full" value={form.priceMonthly} onChange={e => set('priceMonthly', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="label">Annual Price (₹)</label>
              <input type="number" className="input-field w-full" value={form.priceAnnual} onChange={e => set('priceAnnual', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="label">Max Branches</label>
              <input type="number" className="input-field w-full" value={form.maxBranches} onChange={e => set('maxBranches', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="label">Max Users</label>
              <input type="number" className="input-field w-full" value={form.maxUsers} onChange={e => set('maxUsers', e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="label">Max Menu Items</label>
              <input type="number" className="input-field w-full" value={form.maxMenuItems} onChange={e => set('maxMenuItems', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="label">Features (comma separated)</label>
            <textarea className="input-field w-full h-20" placeholder="Advanced Reporting, Priority Support, API Access" value={form.features} onChange={e => set('features', e.target.value)} />
          </div>
          
          {isEdit && (
            <div className="flex items-center gap-2 mt-2">
              <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} />
              <label htmlFor="isActive" className="text-sm font-medium text-slate-700 dark:text-slate-300">Plan is Active (Available for subscription)</label>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => mutate(form)}
            disabled={!form.name || !form.code || isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : (isEdit ? <Pencil size={14} /> : <Plus size={14} />)}
            {isEdit ? 'Save Changes' : 'Create Plan'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlansPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data: plans = [], isLoading, refetch } = useQuery<Plan[]>({
    queryKey: ['admin-plans'],
    queryFn: () => api.get('/api/v1/admin/plans').then(r => r.data.data || r.data),
    staleTime: 30_000,
  });

  const { mutate: deletePlan } = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/plans/${id}`).then(r => r.data),
    onMutate: (id) => setDeleting(id),
    onSuccess: (data) => {
      toast.success(data.message || 'Plan deleted');
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message || 'Delete failed';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    },
    onSettled: () => { setDeleting(null); qc.invalidateQueries({ queryKey: ['admin-plans'] }); },
  });

  const handleDelete = (p: Plan) => {
    if (!confirm(`Are you sure you want to delete the plan "${p.name}"? If it has active subscriptions, it will only be deactivated.`)) return;
    deletePlan(p.id);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold text-slate-900 dark:text-white">Subscription Plans</h1>
          <p className="text-xs text-slate-900 dark:text-slate-500">Manage pricing and features for your customers</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-400 transition-colors">
            <RefreshCw size={13} />
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-xs flex items-center gap-1.5">
            <Plus size={13} /> Add Plan
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={22} className="animate-spin text-slate-600" />
          </div>
        ) : plans.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-600 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <Gem size={32} />
            <p className="text-sm">No plans created yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map(p => (
              <div key={p.id} className={cn('bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col', !p.isActive && 'opacity-60 grayscale')}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{p.name}</h3>
                    <p className="text-xs text-slate-500 font-mono mt-1">{p.code}</p>
                  </div>
                  {!p.isActive && <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-1 rounded-md font-medium uppercase">Inactive</span>}
                </div>
                
                <div className="mb-4">
                  <div className="flex items-end gap-1 text-slate-900 dark:text-white">
                    <span className="text-2xl font-bold">₹{p.priceMonthly}</span>
                    <span className="text-sm text-slate-500 pb-1">/mo</span>
                  </div>
                  {p.priceAnnual > 0 && <p className="text-xs text-slate-500 mt-1">₹{p.priceAnnual}/yr</p>}
                </div>
                
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 flex-1">{p.description || 'No description provided.'}</p>
                
                <div className="space-y-2 mb-6">
                  <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300">
                    <span>Max Branches:</span> <span className="font-semibold">{p.maxBranches}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300">
                    <span>Max Users:</span> <span className="font-semibold">{p.maxUsers}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-700 dark:text-slate-300">
                    <span>Max Menu Items:</span> <span className="font-semibold">{p.maxMenuItems}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 pt-4 border-t border-slate-100 dark:border-slate-800 mt-auto">
                  <button
                    onClick={() => setEditPlan(p)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(p)}
                    disabled={deleting === p.id}
                    className="p-2 rounded-lg bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors"
                  >
                    {deleting === p.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && <PlanModal onClose={() => setShowAdd(false)} />}
      {editPlan && <PlanModal plan={editPlan} onClose={() => setEditPlan(null)} />}
    </div>
  );
}
