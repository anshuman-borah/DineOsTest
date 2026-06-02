'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, Loader2, ShieldCheck, Key } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

export default function AdminSettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    razorpayKeyId: '',
    razorpayKeySecret: '',
    razorpayWebhookSecret: '',
  });

  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get('/api/v1/admin/settings').then(r => r.data.data || r.data),
    staleTime: 0,
  });

  useEffect(() => {
    if (!isLoading && settings) {
      setForm({
        razorpayKeyId: settings.razorpayKeyId || '',
        razorpayKeySecret: settings.razorpayKeySecret || '',
        razorpayWebhookSecret: settings.razorpayWebhookSecret || '',
      });
    }
  }, [isLoading, settings]);

  const { mutate, isPending } = useMutation({
    mutationFn: (body: any) => api.patch('/api/v1/admin/settings', body).then(r => r.data),
    onSuccess: () => {
      toast.success('Settings saved successfully');
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Failed to save settings');
    },
  });

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950">
      <div className="flex items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 bg-white dark:bg-slate-900">
        <div>
          <h1 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings size={18} /> Global Settings
          </h1>
          <p className="text-xs text-slate-500 mt-1">Manage platform-wide configurations</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-6">
          
          {/* Razorpay Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Razorpay Configuration</h2>
                <p className="text-xs text-slate-500">Credentials to collect SaaS subscription payments from tenants.</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="animate-spin text-slate-400" size={24} />
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Key ID</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Key size={14} />
                      </div>
                      <input 
                        type="text" 
                        placeholder="rzp_live_xxxxxxxxxxxxxx"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white outline-none transition-all"
                        value={form.razorpayKeyId}
                        onChange={e => set('razorpayKeyId', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Key Secret</label>
                    <input 
                      type="password" 
                      placeholder="Enter your Razorpay Secret Key"
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white outline-none transition-all"
                      value={form.razorpayKeySecret}
                      onChange={e => set('razorpayKeySecret', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Webhook Secret</label>
                    <input 
                      type="password" 
                      placeholder="Secret used to verify webhooks"
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white outline-none transition-all"
                      value={form.razorpayWebhookSecret}
                      onChange={e => set('razorpayWebhookSecret', e.target.value)}
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Make sure this matches the secret configured in your Razorpay Webhook settings.</p>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button 
                      onClick={() => mutate(form)}
                      disabled={isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Save Configuration
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
