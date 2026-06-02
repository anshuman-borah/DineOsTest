'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import {
  LayoutDashboard, Users, CreditCard,
  Activity, LogOut, ShieldAlert, Loader2, Gem
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin',               label: 'Overview',       icon: LayoutDashboard },
  { href: '/admin/tenants',       label: 'Tenants',        icon: Users },
  { href: '/admin/subscriptions', label: 'Subscriptions',  icon: CreditCard },
  { href: '/admin/plans',         label: 'Plans',          icon: Gem },
  { href: '/admin/activity',      label: 'Activity',       icon: Activity },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, accessToken, logout } = useAuthStore();
  // Give the store a moment to hydrate from localStorage before redirecting
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) { router.replace('/login'); return; }
    if (user?.role !== 'superadmin') router.replace('/dashboard');
  }, [hydrated, accessToken, user, router]);

  // Show loading spinner while hydrating to avoid flash-redirect
  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 size={24} className="animate-spin text-slate-600" />
      </div>
    );
  }

  if (!accessToken || user?.role !== 'superadmin') return null;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <aside className="w-56 flex-shrink-0 flex flex-col bg-white dark:bg-slate-900 border-r border-red-900/40">
        {/* Header */}
        <div className="p-4 border-b border-red-900/40">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-red-600 dark:text-red-400" />
            <div>
              <div className="text-sm font-bold text-red-600 dark:text-red-400">Superadmin</div>
              <div className="text-xs text-slate-900 dark:text-slate-500 truncate">{user?.email}</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'sidebar-link',
                pathname === href && 'sidebar-link-active',
              )}
            >
              <Icon size={15} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={() => { logout(); router.replace('/login'); }}
            className="sidebar-link w-full text-red-600 dark:text-red-400 hover:text-red-300"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto scrollbar-thin">
        {children}
      </main>
    </div>
  );
}
