'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useAuthStore } from '@/store/auth.store';
import {
  LayoutDashboard, ShoppingCart, Monitor, Layout, BookOpen, Package,
  Receipt, Clock, BarChart3, Users, Building2, Settings, LogOut,
  Wifi, WifiOff, Shield, Hotel, CalendarDays, SprayCan, BedDouble, Sun, Moon, Loader2
} from 'lucide-react';
import { useIsFetching, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useSubscriptionWall } from '@/hooks/useSubscriptionWall';
import { SubscriptionWall } from '@/components/ui/SubscriptionWall';
import { BranchSwitcher } from '@/components/BranchSwitcher';

interface NavItem { href: string; label: string; icon: React.ElementType; exact?: boolean; roles?: string[]; context?: 'global' | 'branch' }
interface NavSection { section: string; items: NavItem[] }

const navSections: NavSection[] = [
  {
    section: 'Overview',
    items: [
      { href: '/executive',              label: 'Owner Dashboard',    icon: LayoutDashboard, exact: true, roles: ['owner', 'manager'] },
      { href: '/owner/branch-performance', label: 'Branch Performance', icon: Building2,      exact: true, roles: ['owner'], context: 'global' },
      { href: '/branch-summary',         label: 'Branch Summary',     icon: BarChart3,       exact: true, roles: ['owner', 'manager', 'restaurant_manager', 'hotel_manager'], context: 'branch' },
    ],
  },
  {
    section: 'Restaurant',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true, roles: ['owner', 'manager', 'restaurant_manager'] },
      { href: '/cashier', label: 'Home', icon: LayoutDashboard, exact: true, roles: ['cashier'] },
      { href: '/waiter', label: 'Home', icon: LayoutDashboard, exact: true, roles: ['waiter'] },
      { href: '/pos', label: 'POS', icon: ShoppingCart, roles: ['owner', 'manager', 'restaurant_manager', 'cashier', 'waiter'] },
      { href: '/kds', label: 'Kitchen Display', icon: Monitor, roles: ['owner', 'manager', 'restaurant_manager', 'kitchen'] },
      { href: '/tables', label: 'Tables', icon: Layout, roles: ['owner', 'manager', 'restaurant_manager', 'cashier', 'waiter'] },
      { href: '/menu', label: 'Menu', icon: BookOpen, roles: ['owner', 'manager', 'restaurant_manager'] },
      { href: '/inventory', label: 'Inventory', icon: Package, roles: ['owner', 'manager', 'restaurant_manager', 'inventory'] },
      { href: '/billing', label: 'Bills', icon: Receipt, roles: ['owner', 'manager', 'restaurant_manager', 'cashier'] },
      { href: '/shifts', label: 'Shifts', icon: Clock, roles: ['owner', 'manager', 'restaurant_manager'] },
      { href: '/reports', label: 'Reports', icon: BarChart3, roles: ['owner', 'manager', 'restaurant_manager'] },
    ],
  },
  {
    section: 'Hotel',
    items: [
      { href: '/hotel/dashboard', label: 'Dashboard', icon: BarChart3, roles: ['owner', 'manager', 'hotel_manager'] },
      { href: '/hotel', label: 'Front Desk', icon: Hotel, exact: true, roles: ['owner', 'manager', 'hotel_manager', 'receptionist'] },
      { href: '/hotel/reservations', label: 'Reservations', icon: CalendarDays, roles: ['owner', 'manager', 'hotel_manager', 'receptionist'] },
      {
        href: '/hotel/rooms',
        label: 'Rooms',
        icon: BedDouble,
        roles: ['owner', 'manager', 'hotel_manager']
      },
      { href: '/hotel/housekeeping', label: 'Housekeeping', icon: SprayCan, roles: ['owner', 'manager', 'hotel_manager', 'housekeeping', 'receptionist'] },
      { href: '/hotel/billing', label: 'Billing', icon: Receipt, roles: ['owner', 'manager', 'hotel_manager'] },
      { href: '/hotel/shifts', label: 'Shifts', icon: Clock, roles: ['owner', 'manager', 'hotel_manager', 'receptionist'] },
      {
        href: '/hotel/report',
        label: 'Report',
        icon: BarChart3,
        roles: ['owner', 'manager', 'hotel_manager'],
      },
    ],
  },
  {
    section: 'Admin',
    items: [
      { href: '/employees', label: 'Employees', icon: Users, roles: ['owner', 'manager', 'restaurant_manager', 'hotel_manager'] },
      { href: '/branches', label: 'Branches', icon: Building2, roles: ['owner'] },
      { href: '/audit', label: 'Audit Log', icon: Shield, roles: ['owner'] },
      { href: '/settings', label: 'Settings', icon: Settings, roles: ['owner'] },
    ],
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user, accessToken, logout, branchId } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);
  const isOnline = useOnlineStatus();
  const { isBlocked, plan, daysLeft } = useSubscriptionWall();
  const isFetching = useIsFetching();

  // Fetch branches to get the current branch's type
  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => apiFetch('/api/v1/branches').then((r) => r.data),
    // Only fetch if we have a branchId and an accessToken (already handled by Hydration)
    enabled: !!branchId && !!accessToken,
  });

  const activeBranchType = branches?.find((b: any) => b.id === branchId)?.type || 'restaurant';

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) router.replace('/login');
  }, [hydrated, accessToken, router]);

  if (!hydrated || !accessToken) return null;

  // Onboarding wizard uses its own full-screen layout — skip the sidebar
  if (pathname === '/onboarding') {
    return (
      <ErrorBoundary section="Page">
        {children}
      </ErrorBoundary>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-black text-slate-900">D</span>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">Dine&Stay OS</div>
              <div className="text-xs text-slate-900 dark:text-slate-500 truncate">{user?.email}</div>
            </div>
          </div>
        </div>

        <div className="pt-3">
          <BranchSwitcher />
        </div>

        <nav className="flex-1 p-2 overflow-y-auto scrollbar-thin">
          {navSections.map(({ section, items }) => {
            // Hide branch-specific sections when in Global Mode (branchId is null)
            if (!branchId && (section === 'Restaurant' || section === 'Hotel')) {
              return null;
            }

            // Filter out sections based on branch type
            if (branchId) {
              if (section === 'Restaurant' && activeBranchType === 'hotel') {
                return null;
              }
              if (section === 'Hotel' && activeBranchType !== 'hotel' && activeBranchType !== 'hotel_and_restaurant') {
                return null;
              }
            }

            const allowedItems = items.filter(
              (item) => {
                // Role check
                if (item.roles && !(user?.role && item.roles.includes(user.role))) return false;
                // Context check: 'global' = only when no branch selected, 'branch' = only when a branch is selected
                if (item.context === 'global' && branchId) return false;
                if (item.context === 'branch' && !branchId && user?.role === 'owner') return false;
                return true;
              }
            );

            if (allowedItems.length === 0) return null;

            return (
              <div key={section} className="mb-3">
                <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-2 py-1.5">
                  {section}
                </div>
                <div className="space-y-0.5">
                  {allowedItems.map(({ href, label, icon: Icon, exact }) => {
                    const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
                    const displayLabel = href === '/executive'
                      ? (user?.role === 'owner' ? 'Owner Dashboard' : 'Branch Summary')
                      : label;

                    return (
                      <Link
                        key={href}
                        href={href}
                        className={cn('sidebar-link', isActive && 'sidebar-link-active')}
                      >
                        <Icon size={16} />
                        <span>{displayLabel}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center gap-2 px-2 py-2 bg-slate-100/40 dark:bg-slate-800/40 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
            <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-900 dark:text-white flex-shrink-0">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-900 dark:text-white truncate">{user?.firstName} {user?.lastName}</div>
              <div className="text-[10px] text-amber-600 dark:text-amber-400/90 capitalize truncate font-semibold">
                {user?.role === 'manager' ? 'Branch Manager' : user?.role?.replace('_', ' ')}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className={cn('flex items-center gap-2 text-xs px-2 py-1 rounded', isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
              {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
              <span>{isOnline ? 'Online' : 'Offline — syncing'}</span>
            </div>
            {isFetching > 0 && (
              <div className="text-amber-500 pr-2" title="Loading data...">
                <Loader2 size={14} className="animate-spin" />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="sidebar-link flex-1 justify-center text-slate-500 hover:text-amber-500 dark:text-slate-400 dark:hover:text-amber-600 dark:text-amber-400" title="Toggle Theme">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={async () => {
                await logout();
                router.replace('/login');
              }}
              className="sidebar-link flex-1 justify-center text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto scrollbar-thin relative">
        {isBlocked && <SubscriptionWall plan={plan} daysLeft={daysLeft} />}
        <ErrorBoundary section="Page">
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}//layout.tsx