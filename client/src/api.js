let currentStaff = null;

export function setStaff(staff) {
  currentStaff = staff;
}

export async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (currentStaff) headers['x-staff-id'] = currentStaff.id;
  const res = await fetch('/api' + path, { ...opts, headers });
  let data = {};
  try { data = await res.json(); } catch {}
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
