import crypto from 'node:crypto';
import { db } from '../db.js';

export const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
export const bearer = (req) => {
  const raw = req.headers.authorization || '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
};
export const SESSION_DAYS = 7;

export const loginAttempts = new Map();
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 10;
export function loginBlocked(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > LOGIN_WINDOW_MS) { loginAttempts.delete(ip); return false; }
  return rec.count >= LOGIN_MAX_ATTEMPTS;
}
export function noteLoginFailure(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec || Date.now() - rec.first > LOGIN_WINDOW_MS) loginAttempts.set(ip, { first: Date.now(), count: 1 });
  else rec.count += 1;
}


export const WAITER_DENY = [
  ['*', /^\/(shifts|reports|settings|backup|staff|credits|expenses|expense-categories)(\/|$)/],
  ['POST|PATCH|DELETE', /^\/payment-methods(\/|$)/],
  ['POST', /^\/orders\/\d+\/(pay|void)$/],
  ['PATCH', /^\/customers(\/|$)/],
  ['POST|PATCH|DELETE', /^\/(items|categories|inventory|promotions|tables|stations|menu-units)(\/|$)/]
];
export const CASHIER_DENY = [
  ['*', /^\/(backup|staff)(\/|$)/],
  ['POST|PATCH|DELETE', /^\/settings(\/|$)/],
  ['POST|PATCH|DELETE', /^\/expense-categories(\/|$)/],
  ['POST|PATCH|DELETE', /^\/payment-methods(\/|$)/],
  ['DELETE', /^\/(items|categories|tables|promotions|expenses)(\/|$)/]
];
export function canAccess(role, method, reqPath) {
  if (role === 'owner') return true;
  const rules = role === 'waiter' ? WAITER_DENY : CASHIER_DENY;
  for (const [methods, re] of rules) {
    if (!re.test(reqPath)) continue;
    if (methods === '*' || methods.split('|').includes(method)) return false;
  }
  return true;
}

export const PUBLIC_API = new Set(['/health', '/auth/login', '/shop', '/events', '/catalog/menu', '/catalog/tables', '/catalog/order', '/catalog/orders']);

export function authMiddleware(req, res, next) {
  if (PUBLIC_API.has(req.path)) return next();
  const token = bearer(req);
  const staff = token ? db.prepare(`
    SELECT s.id, s.name, s.role FROM sessions ss
    JOIN staff s ON s.id = ss.staff_id
    WHERE ss.token_hash = ? AND s.active = 1 AND ss.expires_at > datetime('now','localtime')
  `).get(sha256(token)) : null;
  if (!staff) return res.status(401).json({ error: 'ပြန်လည် ဝင်ရောက်ပါ' });
  if (!canAccess(staff.role, req.method, req.path)) {
    return res.status(403).json({ error: 'ဒီလုပ်ဆောင်ချက်အတွက် ခွင့်ပြုချက် မရှိပါ' });
  }
  req.staff = staff;
  next();
}
