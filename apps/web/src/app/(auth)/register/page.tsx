'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

export default function RegisterPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [form, setForm] = useState({ businessName: '', email: '', phone: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/api/v1/auth/register', form);
      login(res.data.data);
      toast.success('Welcome! Your 14-day trial has started.');
      router.push('/onboarding');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500 mb-4">
            <span className="text-2xl font-black text-slate-900">D</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Start Free Trial</h1>
          <p className="text-slate-900 dark:text-slate-400 text-sm mt-1">14 days free, no credit card required</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label">Business Name</label>
            <input className="input" placeholder="Spice Garden Restaurant" value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="owner@spicegarden.in" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" type="tel" placeholder="+91 98765 43210" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          </div>
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <input className="input pr-10" type={showPassword ? 'text' : 'password'} placeholder="Min 8 characters" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-900 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Start Free Trial'}
          </button>
          <p className="text-center text-xs text-slate-900 dark:text-slate-500">
            By registering you agree to our{' '}
            <a href="/terms" target="_blank" className="text-amber-600 dark:text-amber-400 hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" target="_blank" className="text-amber-600 dark:text-amber-400 hover:underline">Privacy Policy</a>
          </p>
        </form>

        <p className="text-center text-sm text-slate-900 dark:text-slate-500 mt-4">
          Already have an account?{' '}
          <a href="/login" className="text-amber-600 dark:text-amber-400 hover:text-amber-600 dark:text-amber-300">Sign in →</a>
        </p>
      </div>
    </div>
  );
}
