import { Router } from 'express';
import crypto from 'node:crypto';
import { db, getSettings, verifyPin } from '../db.js';
import { sha256, bearer, SESSION_DAYS, loginBlocked, noteLoginFailure, loginAttempts } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.get('/api/shop', (req, res) => {
  const s = getSettings();
  res.json({ shop_name: s.shop_name, shop_name_en: s.shop_name_en, address: s.address, phone: s.phone });
});

authRouter.post('/api/auth/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (loginBlocked(ip)) {
    return res.status(429).json({ error: 'PIN မှားယွင်းမှု များလာပါတယ် — ခဏနေရင် ပြန်စမ်းပါ' });
  }
  const raw = String(req.body?.pin || '');
  const candidates = db.prepare('SELECT id, name, role, pin FROM staff WHERE active = 1').all();
  const staff = raw ? candidates.find(s => verifyPin(raw, s.pin)) : null;
  if (!staff) {
    noteLoginFailure(ip);
    return res.status(401).json({ error: 'PIN မှားနေပါတယ်' });
  }
  loginAttempts.delete(ip);
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare(`INSERT INTO sessions (token_hash, staff_id, expires_at)
    VALUES (?, ?, datetime('now','localtime','+${SESSION_DAYS} days'))`).run(sha256(token), staff.id);
  res.json({ staff: { id: staff.id, name: staff.name, role: staff.role }, token });
});

authRouter.post('/api/auth/logout', (req, res) => {
  const token = bearer(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.json({ ok: true });
});
