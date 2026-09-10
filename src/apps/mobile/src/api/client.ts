import { Platform } from 'react-native';
import { tokenStorage } from '../store/tokenStorage';

export function getBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;

  // On Web: connect to current web host on port 8000 (handles localhost as well as LAN access)
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    return `http://${host}:8000`;
  }

  // If explicit environment variable is set
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.replace(/\/+$/, '');
  }

  // Physical phone default LAN IP
  return 'http://192.168.31.88:8000';
}

/**
 * Join the API base and a path with exactly one slash between them.
 */
export function apiUrl(path: string): string {
  const base = getBaseUrl();
  return `${base}/${path.replace(/^\/+/, '')}`;
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return apiUrl(url);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // A storage failure must not abort the request. Sending it unauthenticated
  // yields a clean 401 the UI already handles as "log in again", instead of
  // every screen reporting a network outage that never happened.
  let token: string | null = null;
  try {
    token = await tokenStorage.get('jwt');
  } catch {
    token = null;
  }

  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      ...(init.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(e.code ?? 'UNKNOWN', e.message ?? res.statusText, e.details);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string, headers?: Record<string, string>) => request<T>(p, { headers }),
  post: <T>(p: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined, headers }),
  patch: <T>(p: string, body: unknown, headers?: Record<string, string>) =>
    request<T>(p, { method: 'PATCH', body: JSON.stringify(body), headers }),
  delete: <T>(p: string, headers?: Record<string, string>) =>
    request<T>(p, { method: 'DELETE', headers }),
  upload: <T>(p: string, form: FormData, headers?: Record<string, string>) =>
    request<T>(p, { method: 'POST', body: form, headers }),
};
