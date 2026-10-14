// Remove credentials saved by older versions. The server now owns the session
// in an HttpOnly cookie, which JavaScript cannot read.
try {
  localStorage.removeItem('praos-admin-session');
} catch {
  /* Storage can be unavailable in private browsing. */
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };

export async function adminFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) onUnauthorized?.();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data as T;
}

export async function login(password: string) {
  await adminFetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
}

export async function logout() {
  await adminFetch('/api/admin/logout', { method: 'POST' });
}
