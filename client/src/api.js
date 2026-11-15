let currentAuth = null;
let onUnauthorized = null;

export function setAuth(auth) {
  currentAuth = auth;
}

export function getToken() {
  return currentAuth?.token || '';
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (currentAuth?.token) headers.Authorization = `Bearer ${currentAuth.token}`;
  const res = await fetch('/api' + path, { ...opts, headers });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401 && path !== '/auth/login') onUnauthorized?.(data.error);
  if (!res.ok) {
    const err = new Error(data.error || 'တောင်းဆိုမှု မအောင်မြင်ပါ');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const money = (n) => {
  const suffix = typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'Ks' : 'ကျပ်';
  return `${Number(n || 0).toLocaleString('en-US')} ${suffix}`;
};

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
