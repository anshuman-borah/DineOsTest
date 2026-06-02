import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId: string;
  branchId: string;
  permissions?: Record<string, any>;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  tenantId: string | null;
  branchId: string | null;
  login: (payload: { accessToken: string; refreshToken: string; user?: AuthUser }) => void;
  logout: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setBranch: (branchId: string | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      tenantId: null,
      branchId: null,

      login: (payload) =>
        set({
          accessToken: payload.accessToken,
          refreshToken: payload.refreshToken,
          user: payload.user || null,
          tenantId: payload.user?.tenantId || null,
          branchId: payload.user?.role === 'owner' ? null : (payload.user?.branchId || null),
        }),

      logout: async () => {
        const { accessToken } = get();

        // ── Call backend to revoke session in Redis ──────────────────
        if (accessToken) {
          try {
            await fetch(`${API_URL}/api/v1/auth/sessions`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            });
          } catch (err) {
            // Don't block logout if API call fails
            console.warn('Failed to revoke session on server:', err);
          }
        }

        // ── Clear frontend store ─────────────────────────────────────
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          tenantId: null,
          branchId: null,
        });
      },

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),

      setBranch: (branchId) => set({ branchId }),
    }),
    { name: 'dinestay-auth' },
  ),
);//auth.store.ts