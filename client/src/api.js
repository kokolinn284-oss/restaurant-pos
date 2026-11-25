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
  let res;
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const err = new Error('အော့ဖ်လိုင်း ဖြစ်နေပါသည်');
      err.offline = true;
      throw err;
    }
    res = await fetch('/api' + path, { ...opts, headers });
  } catch (e) {
    if (e.offline) throw e;
    const err = new Error('ဆာဗာ ချိတ်ဆက်မှု မရပါ — အော့ဖ်လိုင်း ဖြစ်နေနိုင်ပါသည်');
    err.offline = true;
    throw err;
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401 && path !== '/auth/login') onUnauthorized?.(data.error);
  if (!res.ok) {
    const err = new Error(data.error || 'တောင်းဆိုမှု မအောင်မြင်ပါ');
    err.status = res.status;
    if (res.status >= 502 && res.status <= 504) err.offline = true;
    throw err;
  }
  return data;
}

export const METHOD_KEY = {
  cash: 'ငွေသား (Cash)',
  kbzpay: 'KBZPay (KPay QR)',
  wavepay: 'WavePay',
  ayapay: 'AYA Pay',
  bank: 'ဘဏ်ကတ် / Mobile Banking',
  credit: 'အကြွေး / စာရင်းဖွင့်'
};

export const METHOD_COLORS = {
  cash: 'var(--brand)',
  kbzpay: '#005baa',
  wavepay: '#fdb913',
  ayapay: '#dc2626',
  bank: 'var(--indigo)',
  credit: 'var(--rose)'
};

export const PAY_METHODS_FALLBACK = Object.entries(METHOD_KEY).map(([code, name]) => ({ code, name }));

export const money = (n) => {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'my';
  const suffix = lang === 'en' ? 'Ks' : lang === 'zh' ? '缅币' : 'ကျပ်';
  return `${Number(n || 0).toLocaleString('en-US')} ${suffix}`;
};

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
