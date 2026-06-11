import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';
import { subscriptionWallStore } from '@/store/subscriptionWall.store';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({ baseURL: BASE });

// Attach JWT + tenant headers to every request
api.interceptors.request.use((config) => {
  const { accessToken, tenantId, branchId, user } = useAuthStore.getState();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  // Superadmin JWT has tenantId='superadmin' — don't send x-tenant-id header
  // for superadmin users as it would cause a mismatch with their JWT payload
  if (tenantId && user?.role !== 'superadmin') config.headers['x-tenant-id'] = tenantId;
  if (branchId && user?.role !== 'superadmin') config.headers['x-branch-id'] = branchId;
  return config;
});

// Auto-refresh token on 401; subscription wall on 402
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;

    // ── 402 Payment Required → show subscription wall ──────────────────────
    if (err.response?.status === 402) {
      const body = err.response.data ?? {};
      subscriptionWallStore.block(
        body?.data?.plan ?? body?.plan ?? null,
        body?.data?.daysLeft ?? body?.daysLeft ?? 0,
      );
      return Promise.reject(err);
    }

    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const { refreshToken, setTokens, logout } = useAuthStore.getState();
      if (!refreshToken) { logout(); return Promise.reject(err); }
      try {
        const res = await axios.post(`${BASE}/api/v1/auth/refresh`, { refreshToken });
        const { accessToken: at, refreshToken: rt } = res.data.data;
        setTokens(at, rt);
        original.headers.Authorization = `Bearer ${at}`;
        return api(original);
      } catch {
        logout();
        window.location.href = '/login';
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  },
);

/** Helper to safely extract wrapped data even if it's null */
const extractData = (resData: any) => {
  if (resData && typeof resData === 'object' && 'success' in resData) {
    return resData.data; // Handles the { success: true, data: null } case correctly
  }
  return resData?.data ?? resData;
};

/** Convenience wrappers — returns response.data.data */
export const apiFetch = async (url: string, params?: object) => {
  const res = await api.get(url, { params });
  return { data: extractData(res.data), status: res.status };
};

export const apiPost = async (url: string, body?: object) => {
  const res = await api.post(url, body);
  return { data: extractData(res.data), status: res.status };
};

export const apiPatch = async (url: string, body?: object) => {
  const res = await api.patch(url, body);
  return { data: extractData(res.data), status: res.status };
};

export const apiPut = async (url: string, body?: object) => {
  const res = await api.put(url, body);
  return { data: extractData(res.data), status: res.status };
};

export const apiDelete = async (url: string) => {
  const res = await api.delete(url);
  return { data: extractData(res.data), status: res.status };
};
