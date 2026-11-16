import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  db, DB_PATH, DATA_DIR, getSettings, setSettings, nextOrderNo, orderTotals, orderWithItems, tableStatus,
  hashPin, verifyPin
} from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.POS_TRUST_PROXY === '1') app.set('trust proxy', 1);

const ymdLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function normalizeTs(value) {
  if (!value) return null;
  const m = String(value).trim().replace('T', ' ').match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(?::(\d{2}))?$/);
  return m ? `${m[1]} ${m[2]}:${m[3] || '00'}` : null;
}

const DEFAULT_STATIONS = [
  { value: 'kitchen', label: 'မီးဖိုချောင်', label_en: 'Kitchen' },
  { value: 'bar', label: 'ဘား', label_en: 'Bar' },
];
const DEFAULT_UNITS = ['ပွဲ', 'ခွက်', 'ဘူး', 'ပုလင်း', 'ပန်းကန်'];

function readSettingsList(key) {
  try {
    const v = JSON.parse(getSettings()[key] || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveSettingsList(key, list) {
  setSettings({ [key]: JSON.stringify(list) });
}

function getStations() {
  const custom = readSettingsList('custom_stations')
    .map(st => (typeof st === 'string' ? { value: st, label: st } : st))
    .filter(st => st && st.value && !DEFAULT_STATIONS.some(d => d.value === st.value));
  return [...DEFAULT_STATIONS, ...custom];
}

function resolveStation(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return 'kitchen';
  const low = raw.toLowerCase();
  const found = getStations().find(st =>
    String(st.value).toLowerCase() === low ||
    String(st.label || '').toLowerCase() === low ||
    String(st.label_en || '').toLowerCase() === low
  );
  return found ? found.value : null;
}

function stationTitle(value) {
  const st = getStations().find(s => s.value === value);
  return String(st?.label_en || st?.label || value || 'KITCHEN').toUpperCase();
}

function getUnits() {
  const seen = new Set();
  const out = [];
  const saved = readSettingsList('custom_units').map(u => (typeof u === 'string' ? u : u?.name));
  const used = db.prepare("SELECT DISTINCT unit FROM menu_items WHERE TRIM(COALESCE(unit, '')) != ''").all().map(r => r.unit);
  for (const u of [...DEFAULT_UNITS, ...saved, ...used]) {
    const name = String(u || '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

app.use(express.json({ limit: '10mb' }));

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

app.post('/api/upload', (req, res) => {
  const { data, filename } = req.body || {};
  if (!data) return res.status(400).json({ error: 'ပုံဒေတာ မပါရှိပါ' });
  const match = String(data).match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (!match) return res.status(400).json({ error: 'မှားယွင်းသော ပုံဖော်မတ် ဖြစ်နေပါသည်' });
  let ext = match[1].toLowerCase();
  if (ext === 'jpeg') ext = 'jpg';
  else if (ext.includes('svg')) ext = 'svg';
  const buf = Buffer.from(match[2], 'base64');
  const safeName = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, safeName), buf);
  res.json({ url: `/uploads/${safeName}` });
});

/* ---------------- realtime (SSE) ---------------- */
const clients = new Set();
function broadcast(type, payload = {}) {
  const msg = `data: ${JSON.stringify({ type, ...payload })}\n\n`;
  for (const res of clients) {
    try { res.write(msg); } catch { clients.delete(res); }
  }
}

app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  clients.add(res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});

/* ---------------- auth ---------------- */
app.get('/api/shop', (req, res) => {
  const s = getSettings();
  res.json({ shop_name: s.shop_name, shop_name_en: s.shop_name_en, address: s.address, phone: s.phone });
});

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const bearer = (req) => {
  const raw = req.headers.authorization || '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : '';
};
const SESSION_DAYS = 7;

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
function loginBlocked(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > LOGIN_WINDOW_MS) { loginAttempts.delete(ip); return false; }
  return rec.count >= LOGIN_MAX_ATTEMPTS;
}
function noteLoginFailure(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec || Date.now() - rec.first > LOGIN_WINDOW_MS) loginAttempts.set(ip, { first: Date.now(), count: 1 });
  else rec.count += 1;
}

app.post('/api/auth/login', (req, res) => {
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

app.post('/api/auth/logout', (req, res) => {
  const token = bearer(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.json({ ok: true });
});

const WAITER_DENY = [
  ['*', /^\/(shifts|reports|settings|backup|staff|credits|expenses|expense-categories)(\/|$)/],
  ['POST|PATCH|DELETE', /^\/payment-methods(\/|$)/],
  ['POST', /^\/orders\/\d+\/(pay|void)$/],
  ['POST|PATCH|DELETE', /^\/(items|categories|inventory|promotions|tables|stations|menu-units)(\/|$)/]
];
const CASHIER_DENY = [
  ['*', /^\/(backup|staff)(\/|$)/],
  ['POST|PATCH|DELETE', /^\/settings(\/|$)/],
  ['POST|PATCH|DELETE', /^\/expense-categories(\/|$)/],
  ['POST|PATCH|DELETE', /^\/payment-methods(\/|$)/],
  ['DELETE', /^\/(items|categories|tables|promotions|expenses)(\/|$)/]
];
function canAccess(role, method, reqPath) {
  if (role === 'owner') return true;
  const rules = role === 'waiter' ? WAITER_DENY : CASHIER_DENY;
  for (const [methods, re] of rules) {
    if (!re.test(reqPath)) continue;
    if (methods === '*' || methods.split('|').includes(method)) return false;
  }
  return true;
}

const PUBLIC_API = new Set(['/health', '/auth/login', '/shop', '/events', '/catalog/menu', '/catalog/tables', '/catalog/order', '/catalog/orders']);

app.get('/api/catalog/menu', (req, res) => {
  const settings = getSettings();
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort, id').all();
  const items = db.prepare('SELECT id, category_id, name, price, unit, available, sort, is_alcohol, station, image, code FROM menu_items WHERE available = 1 ORDER BY sort, id').all();
  res.json({
    shop: {
      name: settings.shop_name || 'စည်တော်ကြီး စားသောက်ဆိုင်',
      name_en: settings.shop_name_en || 'Sintawgyi Restaurant',
      phone: settings.phone || '',
      address: settings.address || '',
      tax_rate: Number(settings.tax_rate || 0),
      service_rate: Number(settings.service_rate || 0)
    },
    categories,
    items,
    stations: getStations()
  });
});

app.get('/api/catalog/tables', (req, res) => {
  const tables = db.prepare(`
    SELECT t.id, t.name, t.zone, t.seats,
           (SELECT COUNT(*) FROM orders o WHERE o.table_id = t.id AND o.status = 'open') AS is_busy
    FROM tables t ORDER BY t.zone, t.id
  `).all();
  res.json(tables);
});

app.post('/api/catalog/order', (req, res) => {
  const { type = 'dine_in', tableId = null, customerName = '', customerPhone = '', note = '', items = [] } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'မှာယူမည့် ဟင်းပွဲများ ရွေးချယ်ပေးပါ' });
  }
  if (type === 'dine_in' && !tableId) {
    return res.status(400).json({ error: 'စားပွဲ ရွေးချယ်ပေးပါ' });
  }
  if (type === 'takeaway' && !customerPhone && !customerName) {
    return res.status(400).json({ error: 'ဖောက်သည် အမည် သို့မဟုတ် ဖုန်းနံပါတ် ဖြည့်သွင်းပါ' });
  }

  const itemIds = items.map(it => Number(it.id)).filter(Boolean);
  const menuRows = itemIds.length ? db.prepare(`SELECT * FROM menu_items WHERE id IN (${itemIds.map(() => '?').join(',')})`).all(...itemIds) : [];
  const menuMap = new Map(menuRows.map(m => [m.id, m]));

  db.exec('BEGIN');
  try {
    const orderNo = nextOrderNo();
    const cleanNote = note ? `[Online Order] ${note}` : '[Online Order]';
    const publicToken = crypto.randomBytes(16).toString('hex');

    const r = db.prepare(`
      INSERT INTO orders (order_no, table_id, type, guests, staff_id, customer_name, customer_phone, source, note, public_token)
      VALUES (?, ?, ?, ?, NULL, ?, ?, 'online', ?, ?)
    `).run(orderNo, tableId ? Number(tableId) : null, type, 1, customerName || 'အွန်လိုင်း ဖောက်သည်', customerPhone || '', cleanNote, publicToken);
    
    const orderId = r.lastInsertRowid;
    const insItem = db.prepare(`
      INSERT INTO order_items (order_id, item_id, name, price, qty, note, status)
      VALUES (?, ?, ?, ?, ?, ?, 'new')
    `);

    let subtotal = 0;
    for (const it of items) {
      const mi = menuMap.get(Number(it.id));
      const qty = Math.max(1, Number(it.qty) || 1);
      const price = mi ? mi.price : Math.round(Number(it.price) || 0);
      const name = mi ? mi.name : (it.name || 'ဟင်းပွဲ');
      const itemNote = it.note || '';
      insItem.run(orderId, mi?.id || null, name, price, qty, itemNote);
      subtotal += price * qty;
    }

    db.prepare('UPDATE orders SET subtotal = ?, total = ? WHERE id = ?').run(subtotal, subtotal, orderId);
    db.exec('COMMIT');

    let tableName = '';
    if (tableId) {
      const tbl = db.prepare('SELECT name FROM tables WHERE id = ?').get(Number(tableId));
      tableName = tbl ? tbl.name : '';
    }

    broadcast('orders', { id: orderId });
    broadcast('tables');
    broadcast('kitchen');

    res.json({
      ok: true,
      orderId,
      orderNo,
      token: publicToken,
      subtotal,
      total: subtotal,
      type,
      tableName,
      itemCount: items.length
    });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'အော်ဒါတင်ခြင်း မအောင်မြင်ပါ: ' + e.message });
  }
});

function customerOrderState(order, items) {
  if (order.status === 'void') return 'cancelled';
  if (order.status === 'paid') return 'completed';
  if (!order.confirmed_at) return 'pending';
  const active = items.filter(i => i.status !== 'cancelled');
  if (active.length > 0 && active.every(i => i.status === 'served')) return 'served';
  if (active.some(i => i.status === 'cooking')) return 'preparing';
  return 'confirmed';
}

app.get('/api/catalog/orders', (req, res) => {
  const tokens = String(req.query.tokens || '')
    .split(',').map(s => s.trim()).filter(s => /^[a-f0-9]{32}$/.test(s)).slice(0, 30);
  if (tokens.length === 0) return res.json([]);
  const rows = db.prepare(`
    SELECT o.id, o.order_no, o.type, o.status, o.total, o.confirmed_at, o.opened_at, o.closed_at,
           o.public_token, t.name AS table_name
    FROM orders o LEFT JOIN tables t ON t.id = o.table_id
    WHERE o.public_token IN (${tokens.map(() => '?').join(',')})
    ORDER BY o.id DESC
  `).all(...tokens);
  const itemStmt = db.prepare('SELECT name, price, qty, note, status FROM order_items WHERE order_id = ? ORDER BY id');
  res.json(rows.map(o => {
    const items = itemStmt.all(o.id);
    return {
      id: o.id,
      token: o.public_token,
      orderNo: o.order_no,
      type: o.type,
      tableName: o.table_name || '',
      total: o.total,
      openedAt: o.opened_at,
      closedAt: o.closed_at,
      state: customerOrderState(o, items),
      items: items.map(i => ({ name: i.name, price: i.price, qty: i.qty, note: i.note, status: i.status }))
    };
  }));
});

app.use('/api', (req, res, next) => {
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
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

/* ---------------- bootstrap ---------------- */
app.get('/api/bootstrap', (req, res) => {
  res.json({
    settings: getSettings(),
    categories: db.prepare('SELECT * FROM categories ORDER BY sort, id').all(),
    items: db.prepare('SELECT * FROM menu_items ORDER BY sort, id').all(),
    stations: getStations(),
    units: getUnits(),
    tables: tableStatus(),
    staff: db.prepare('SELECT id, name, role, active FROM staff ORDER BY id').all(),
    customers: db.prepare('SELECT * FROM customers ORDER BY id DESC').all(),
    openOrders: db.prepare(`
      SELECT o.id, o.order_no, o.table_id, o.type, o.total, o.opened_at, o.guests, o.source, o.confirmed_at,
             o.customer_name, o.customer_phone, t.name AS table_name,
             (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id AND i.status != 'cancelled') AS item_count
      FROM orders o LEFT JOIN tables t ON t.id = o.table_id
      WHERE o.status = 'open' ORDER BY o.opened_at
    `).all(),
    reservations: db.prepare(`
      SELECT r.*, t.name AS table_name FROM reservations r LEFT JOIN tables t ON t.id = r.table_id
      WHERE r.status = 'booked' AND date(r.reserved_at) >= date('now','localtime')
      ORDER BY r.reserved_at LIMIT 50
    `).all(),
    creditOutstanding: db.prepare('SELECT COALESCE(SUM(amount - paid), 0) AS amount FROM credits WHERE settled_at IS NULL').get().amount,
    shift: currentShift(),
    promotions: db.prepare('SELECT * FROM promotions ORDER BY active DESC, id').all(),
    lowStockCount: db.prepare('SELECT COUNT(*) AS c FROM inventory_items WHERE qty <= reorder_level').get().c,
    kitchenCount: db.prepare("SELECT COUNT(*) AS c FROM order_items i LEFT JOIN menu_items m ON m.id = i.item_id WHERE i.status = 'cooking' AND COALESCE(m.station, 'kitchen') = 'kitchen'").get().c,
    barCount: db.prepare("SELECT COUNT(*) AS c FROM order_items i LEFT JOIN menu_items m ON m.id = i.item_id WHERE i.status = 'cooking' AND m.station = 'bar'").get().c,
    stationCounts: db.prepare(`
      SELECT COALESCE(m.station, 'kitchen') AS station, COUNT(*) AS c
      FROM order_items i
      JOIN orders o ON o.id = i.order_id AND o.status = 'open'
      LEFT JOIN menu_items m ON m.id = i.item_id
      WHERE i.status = 'cooking'
      GROUP BY COALESCE(m.station, 'kitchen')
    `).all(),
    me: req.staff
  });
});

/* ---------------- reservations ---------------- */
app.get('/api/reservations', (req, res) => {
  const date = req.query.date;
  let sql = `SELECT r.*, t.name AS table_name FROM reservations r LEFT JOIN tables t ON t.id = r.table_id`;
  const where = [];
  const args = [];
  if (date) { where.push('date(r.reserved_at) = ?'); args.push(date); }
  else { where.push("r.status = 'booked' AND date(r.reserved_at) >= date('now','localtime')"); }
  if (req.query.status) { where.push('r.status = ?'); args.push(req.query.status); }
  sql += ` WHERE ${where.join(' AND ')} ORDER BY r.reserved_at LIMIT 100`;
  res.json(db.prepare(sql).all(...args));
});

app.post('/api/reservations', (req, res) => {
  const { customer_name, phone = '', party_size = 2, table_id = null, reserved_at, note = '' } = req.body;
  if (!customer_name || !reserved_at) return res.status(400).json({ error: 'အမည်နှင့် အချိန် ထည့်ပါ' });
  const r = db.prepare(`INSERT INTO reservations (customer_name, phone, party_size, table_id, reserved_at, note)
    VALUES (?, ?, ?, ?, ?, ?)`).run(customer_name, phone, Number(party_size) || 1, table_id ? Number(table_id) : null, reserved_at, note);
  broadcast('reservations');
  res.json({ id: r.lastInsertRowid });
});

app.patch('/api/reservations/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE reservations SET status = COALESCE(?, status) WHERE id = ?').run(status ?? null, Number(req.params.id));
  broadcast('reservations');
  res.json({ ok: true });
});

app.delete('/api/reservations/:id', (req, res) => {
  db.prepare('DELETE FROM reservations WHERE id = ?').run(Number(req.params.id));
  broadcast('reservations');
  res.json({ ok: true });
});

/* ---------------- credits (အကြွေး) ---------------- */
app.get('/api/credits', (req, res) => {
  const all = req.query.all === '1';
  const rows = db.prepare(`
    SELECT c.*, cu.name AS customer_name, cu.phone, o.order_no
    FROM credits c JOIN customers cu ON cu.id = c.customer_id
    LEFT JOIN orders o ON o.id = c.order_id
    ${all ? '' : 'WHERE c.settled_at IS NULL'}
    ORDER BY c.id DESC LIMIT 200
  `).all();
  res.json(rows);
});

app.post('/api/credits/:id/pay', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM credits WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const amount = Math.max(0, Math.round(Number(req.body.amount) || 0));
  const paid = Math.min(cur.amount, cur.paid + amount);
  const settled = paid >= cur.amount ? "datetime('now','localtime')" : 'NULL';
  db.prepare(`UPDATE credits SET paid = ?, settled_at = ${settled} WHERE id = ?`).run(paid, id);
  broadcast('credits');
  res.json({ ok: true, paid, settled: settled !== 'NULL' });
});

/* ---------------- categories ---------------- */
app.post('/api/categories', (req, res) => {
  const { name, sort } = req.body;
  if (!name) return res.status(400).json({ error: 'အမည် ထည့်ပါ' });
  const r = db.prepare('INSERT INTO categories (name, sort) VALUES (?, ?)').run(name, Number(sort) || 0);
  broadcast('menu');
  res.json({ id: r.lastInsertRowid });
});

app.patch('/api/categories/:id', (req, res) => {
  const { name, sort } = req.body;
  db.prepare('UPDATE categories SET name = COALESCE(?, name), sort = COALESCE(?, sort) WHERE id = ?')
    .run(name ?? null, sort ?? null, Number(req.params.id));
  broadcast('menu');
  res.json({ ok: true });
});

app.delete('/api/categories/:id', (req, res) => {
  const used = db.prepare('SELECT COUNT(*) AS c FROM menu_items WHERE category_id = ?').get(Number(req.params.id)).c;
  if (used) return res.status(400).json({ error: 'ဒီအမျိုးအစားမှာ ဟင်းတွေ ရှိနေပါတယ်' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(Number(req.params.id));
  broadcast('menu');
  res.json({ ok: true });
});

/* ---------------- menu items ---------------- */
app.post('/api/items', (req, res) => {
  const { category_id, name, price, cost, unit, available, sort, is_alcohol = 0, station = 'kitchen', image = '', code = '' } = req.body;
  if (!category_id || !name || price == null) return res.status(400).json({ error: 'အချက်အလက် မပြည့်စုံပါ' });
  const stationValue = resolveStation(station);
  if (!stationValue) return res.status(400).json({ error: 'ဌာန မမှန်ကန်ပါ' });
  const r = db.prepare('INSERT INTO menu_items (category_id, name, price, cost, unit, available, sort, is_alcohol, station, image, code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(Number(category_id), name, Math.round(Number(price)), Math.round(Number(cost) || 0), unit || '', available ? 1 : 0, Number(sort) || 0,
      is_alcohol ? 1 : 0, stationValue, image || '', code || '');
  broadcast('menu');
  res.json({ id: r.lastInsertRowid });
});

app.patch('/api/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const b = req.body;
  const stationValue = resolveStation(b.station ?? cur.station);
  if (!stationValue) return res.status(400).json({ error: 'ဌာန မမှန်ကန်ပါ' });
  db.prepare(`UPDATE menu_items SET category_id=?, name=?, price=?, cost=?, unit=?, available=?, sort=?, is_alcohol=?, station=?, image=?, code=? WHERE id=?`)
    .run(
      Number(b.category_id ?? cur.category_id),
      b.name ?? cur.name,
      Math.round(Number(b.price ?? cur.price)),
      Math.round(Number(b.cost ?? cur.cost)),
      b.unit ?? cur.unit,
      (b.available ?? cur.available) ? 1 : 0,
      Number(b.sort ?? cur.sort),
      (b.is_alcohol ?? cur.is_alcohol) ? 1 : 0,
      stationValue,
      b.image !== undefined ? b.image : (cur.image || ''),
      b.code !== undefined ? b.code : (cur.code || ''),
      id
    );
  broadcast('menu');
  res.json({ ok: true });
});

app.post('/api/items/bulk-delete', (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ပစ္စည်းများ ရွေးပါ' });
  db.exec('BEGIN');
  try {
    const delRecipe = db.prepare('DELETE FROM recipe_items WHERE menu_item_id = ?');
    const delItem = db.prepare('DELETE FROM menu_items WHERE id = ?');
    for (const id of ids) {
      delRecipe.run(Number(id));
      delItem.run(Number(id));
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  broadcast('menu');
  res.json({ ok: true, count: ids.length });
});

app.post('/api/items/bulk-status', (req, res) => {
  const { ids, available } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ပစ္စည်းများ ရွေးပါ' });
  const stmt = db.prepare('UPDATE menu_items SET available = ? WHERE id = ?');
  const val = available ? 1 : 0;
  db.exec('BEGIN');
  try {
    for (const id of ids) stmt.run(val, Number(id));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  broadcast('menu');
  res.json({ ok: true, count: ids.length });
});

app.post('/api/items/bulk-category', (req, res) => {
  const { ids, category_id } = req.body || {};
  if (!Array.isArray(ids) || !ids.length || !category_id) return res.status(400).json({ error: 'အချက်အလက် မပြည့်စုံပါ' });
  const stmt = db.prepare('UPDATE menu_items SET category_id = ? WHERE id = ?');
  db.exec('BEGIN');
  try {
    for (const id of ids) stmt.run(Number(category_id), Number(id));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  broadcast('menu');
  res.json({ ok: true, count: ids.length });
});

app.post('/api/items/bulk-import', (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'တင်သွင်းမည့် ပစ္စည်း မရှိပါ' });
  db.exec('BEGIN');
  try {
    const getCat = db.prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE');
    const insCat = db.prepare('INSERT INTO categories (name, sort) VALUES (?, ?)');
    const maxSortCat = db.prepare('SELECT COALESCE(MAX(sort), 0) as s FROM categories');
    
    const findItem = db.prepare('SELECT id FROM menu_items WHERE name = ? COLLATE NOCASE');
    const insItem = db.prepare(`INSERT INTO menu_items (category_id, name, price, cost, unit, available, sort, is_alcohol, station, image, code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const updateItem = db.prepare(`UPDATE menu_items SET category_id=?, price=?, cost=?, unit=?, available=?, is_alcohol=?, station=?, image=?, code=? WHERE id=?`);

    let inserted = 0;
    let updated = 0;

    for (const it of items) {
      if (!it.name) continue;
      let catId = Number(it.category_id);
      if (!catId && it.category_name) {
        const found = getCat.get(String(it.category_name).trim());
        if (found) {
          catId = found.id;
        } else {
          const s = (maxSortCat.get()?.s || 0) + 1;
          const r = insCat.run(String(it.category_name).trim(), s);
          catId = r.lastInsertRowid;
        }
      }
      if (!catId) {
        const first = db.prepare('SELECT id FROM categories ORDER BY sort, id LIMIT 1').get();
        catId = first ? first.id : 1;
      }

      const existing = findItem.get(String(it.name).trim());
      const price = Math.round(Number(it.price) || 0);
      const cost = Math.round(Number(it.cost) || 0);
      const unit = it.unit || 'ပွဲ';
      const available = it.available !== undefined ? (it.available ? 1 : 0) : 1;
      const is_alcohol = it.is_alcohol ? 1 : 0;
      const station = resolveStation(it.station) || 'kitchen';
      const image = it.image || '';
      const code = it.code || '';

      if (existing) {
        updateItem.run(catId, price, cost, unit, available, is_alcohol, station, image, code, existing.id);
        updated++;
      } else {
        insItem.run(catId, String(it.name).trim(), price, cost, unit, available, 0, is_alcohol, station, image, code);
        inserted++;
      }
    }
    db.exec('COMMIT');
    broadcast('menu');
    res.json({ ok: true, inserted, updated, total: inserted + updated });
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
});

app.delete('/api/items/:id', (req, res) => {
  const id = Number(req.params.id);
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM recipe_items WHERE menu_item_id = ?').run(id);
    db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  broadcast('menu');
  res.json({ ok: true });
});

/* ---------------- tables ---------------- */
app.post('/api/tables', (req, res) => {
  const { name, zone, seats } = req.body;
  if (!name) return res.status(400).json({ error: 'အမည် ထည့်ပါ' });
  const r = db.prepare('INSERT INTO tables (name, zone, seats) VALUES (?, ?, ?)')
    .run(name, zone || '', Number(seats) || 4);
  broadcast('tables');
  res.json({ id: r.lastInsertRowid });
});

app.patch('/api/tables/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM tables WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const b = req.body;
  db.prepare('UPDATE tables SET name=?, zone=?, seats=? WHERE id=?')
    .run(b.name ?? cur.name, b.zone ?? cur.zone, Number(b.seats ?? cur.seats), id);
  broadcast('tables');
  res.json({ ok: true });
});

app.delete('/api/tables/:id', (req, res) => {
  const open = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE table_id = ? AND status = 'open'").get(Number(req.params.id)).c;
  if (open) return res.status(400).json({ error: 'ဒီစားပွဲမှာ order ဖွင့်ထားပါတယ်' });
  db.prepare('DELETE FROM tables WHERE id = ?').run(Number(req.params.id));
  broadcast('tables');
  res.json({ ok: true });
});

app.get('/api/tables', (req, res) => res.json(tableStatus()));

/* ---------------- promotions ---------------- */
app.get('/api/promotions', (req, res) => res.json(db.prepare('SELECT * FROM promotions ORDER BY active DESC, id').all()));

app.post('/api/promotions', (req, res) => {
  const { name, type = 'percent', value = 0, min_subtotal = 0, start_time = '', end_time = '', active = 1 } = req.body;
  if (!name) return res.status(400).json({ error: 'အမည် ထည့်ပါ' });
  const r = db.prepare(`INSERT INTO promotions (name, type, value, min_subtotal, start_time, end_time, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(name, type, Math.round(Number(value) || 0), Math.round(Number(min_subtotal) || 0), start_time, end_time, active ? 1 : 0);
  broadcast('promotions');
  res.json({ id: r.lastInsertRowid });
});

app.patch('/api/promotions/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM promotions WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const b = req.body;
  db.prepare(`UPDATE promotions SET name=?, type=?, value=?, min_subtotal=?, start_time=?, end_time=?, active=? WHERE id=?`)
    .run(b.name ?? cur.name, b.type ?? cur.type, Math.round(Number(b.value ?? cur.value)), Math.round(Number(b.min_subtotal ?? cur.min_subtotal)),
      b.start_time ?? cur.start_time, b.end_time ?? cur.end_time, (b.active ?? cur.active) ? 1 : 0, cur.id);
  broadcast('promotions');
  res.json({ ok: true });
});

app.delete('/api/promotions/:id', (req, res) => {
  db.prepare('DELETE FROM promotions WHERE id = ?').run(Number(req.params.id));
  broadcast('promotions');
  res.json({ ok: true });
});

/* ---------------- recipes ---------------- */
app.get('/api/recipes/:itemId', (req, res) => {
  res.json(db.prepare(`
    SELECT r.*, i.name AS inv_name, i.unit, i.qty AS stock
    FROM recipe_items r JOIN inventory_items i ON i.id = r.inventory_item_id
    WHERE r.menu_item_id = ? ORDER BY r.id
  `).all(Number(req.params.itemId)));
});

app.put('/api/recipes/:itemId', (req, res) => {
  const itemId = Number(req.params.itemId);
  const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM recipe_items WHERE menu_item_id = ?').run(itemId);
    const ins = db.prepare('INSERT INTO recipe_items (menu_item_id, inventory_item_id, qty) VALUES (?, ?, ?)');
    for (const l of lines) {
      if (!l.inventory_item_id) continue;
      ins.run(itemId, Number(l.inventory_item_id), Number(l.qty) || 0);
    }
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- orders ---------------- */
function applyRecipe(itemId, orderId, multiplier) {
  if (!itemId || !multiplier) return;
  const lines = db.prepare('SELECT * FROM recipe_items WHERE menu_item_id = ?').all(itemId);
  for (const l of lines) {
    const q = l.qty * multiplier;
    db.prepare('UPDATE inventory_items SET qty = qty - ? WHERE id = ?').run(q, l.inventory_item_id);
    db.prepare('INSERT INTO stock_moves (item_id, type, qty, note, staff_id) VALUES (?, ?, ?, ?, ?)')
      .run(l.inventory_item_id, multiplier > 0 ? 'sale' : 'void_return', Math.abs(q), `Order #${orderId}`);
  }
}

function listOpenOrders() {
  return db.prepare(`
    SELECT o.*, t.name AS table_name,
      (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id AND i.status != 'cancelled') AS item_count
    FROM orders o LEFT JOIN tables t ON t.id = o.table_id
    WHERE o.status = 'open' ORDER BY o.opened_at
  `).all();
}

app.get('/api/orders', (req, res) => {
  const { status, date } = req.query;
  if (status === 'open' || !status) return res.json(listOpenOrders());
  let sql = `SELECT o.*, t.name AS table_name FROM orders o LEFT JOIN tables t ON t.id=o.table_id WHERE o.status = ?`;
  const args = [status];
  if (date) { sql += ` AND date(o.opened_at) = ?`; args.push(date); }
  sql += ' ORDER BY o.id DESC LIMIT 300';
  res.json(db.prepare(sql).all(...args));
});

app.get('/api/orders/history', (req, res) => {
  const from = req.query.from || ymdLocal();
  const to = req.query.to || from;
  const status = req.query.status === 'void' ? 'void' : req.query.status === 'all' ? null : 'paid';
  const q = String(req.query.q || '').trim();
  const where = ['date(o.closed_at) BETWEEN ? AND ?'];
  const args = [from, to];
  if (status) { where.push('o.status = ?'); args.push(status); }
  if (q) {
    where.push('(o.order_no LIKE ? OR t.name LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  res.json(db.prepare(`
    SELECT o.id, o.order_no, o.type, o.status, o.total, o.subtotal, o.discount, o.guests,
           o.opened_at, o.closed_at, o.customer_name, t.name AS table_name,
           (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id AND i.status != 'cancelled') AS item_count
    FROM orders o LEFT JOIN tables t ON t.id = o.table_id
    WHERE ${where.join(' AND ')}
    ORDER BY o.closed_at DESC, o.id DESC LIMIT 200
  `).all(...args));
});

app.get('/api/orders/:id', (req, res) => {
  const o = orderWithItems(Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'မတွေ့ပါ' });
  res.json(o);
});

app.post('/api/orders', (req, res) => {
  const { type = 'dine_in', tableId = null, guests = 1, customerId = null, note = '' } = req.body;
  if (type === 'dine_in' && tableId) {
    const existing = db.prepare("SELECT id FROM orders WHERE table_id = ? AND status = 'open'").get(Number(tableId));
    if (existing) return res.json({ id: existing.id, existing: true });
  }
  const r = db.prepare(`INSERT INTO orders (order_no, table_id, type, guests, staff_id, customer_id, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(nextOrderNo(), tableId ? Number(tableId) : null, type, Number(guests) || 1, req.staff.id, customerId ? Number(customerId) : null, note);
  broadcast('orders');
  res.json({ id: r.lastInsertRowid });
});

app.patch('/api/orders/:id', (req, res) => {
  const id = Number(req.params.id);
  const { note, guests, customerId } = req.body;
  const hasCustomer = Object.prototype.hasOwnProperty.call(req.body, 'customerId');
  if (hasCustomer) {
    db.prepare('UPDATE orders SET note = COALESCE(?, note), guests = COALESCE(?, guests), customer_id = ? WHERE id = ?')
      .run(note ?? null, guests ?? null, customerId ? Number(customerId) : null, id);
  } else {
    db.prepare('UPDATE orders SET note = COALESCE(?, note), guests = COALESCE(?, guests) WHERE id = ?')
      .run(note ?? null, guests ?? null, id);
  }
  broadcast('orders', { id });
  res.json({ ok: true });
});

app.post('/api/orders/:id/items', (req, res) => {
  const orderId = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order || order.status !== 'open') return res.status(400).json({ error: 'Order မဖွင့်ထားပါ' });
  const { itemId, name, price, qty, note = '', modifiers = [] } = req.body;
  let item = null;
  if (itemId) item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(Number(itemId));
  const itemName = name || item?.name;
  const itemPrice = price != null ? Math.round(Number(price)) : item?.price;
  if (!itemName || itemPrice == null) return res.status(400).json({ error: 'ဟင်း အချက်အလက် မမှန်ပါ' });
  const r = db.prepare('INSERT INTO order_items (order_id, item_id, name, price, qty, note) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orderId, item?.id ?? null, itemName, itemPrice, Number(qty) || 1, note);
  const oiId = r.lastInsertRowid;
  const insMod = db.prepare('INSERT INTO order_item_modifiers (order_item_id, name, price) VALUES (?, ?, ?)');
  for (const m of modifiers) insMod.run(oiId, m.name, Math.round(Number(m.price) || 0));
  const { subtotal } = orderTotals(orderId);
  db.prepare('UPDATE orders SET subtotal = ?, total = ? WHERE id = ?').run(subtotal, subtotal, orderId);
  broadcast('orders', { id: orderId });
  res.json({ id: oiId });
});

app.patch('/api/order-items/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM order_items WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const { qty, note, status } = req.body;
  const newQty = qty != null ? Number(qty) : cur.qty;
  db.exec('BEGIN');
  try {
    if (cur.stock_deducted && newQty !== cur.qty) applyRecipe(cur.item_id, cur.order_id, newQty - cur.qty);
    db.prepare('UPDATE order_items SET qty = COALESCE(?, qty), note = COALESCE(?, note), status = COALESCE(?, status) WHERE id = ?')
      .run(qty != null ? newQty : null, note ?? null, status ?? null, id);
    const { subtotal } = orderTotals(cur.order_id);
    db.prepare('UPDATE orders SET subtotal = ?, total = ? WHERE id = ?').run(subtotal, subtotal, cur.order_id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  broadcast('orders', { id: cur.order_id });
  res.json({ ok: true });
});

app.delete('/api/order-items/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM order_items WHERE id = ?').get(id);
  if (!cur) return res.json({ ok: true });
  db.exec('BEGIN');
  try {
    if (cur.stock_deducted) applyRecipe(cur.item_id, cur.order_id, -cur.qty);
    db.prepare('DELETE FROM order_items WHERE id = ?').run(id);
    const { subtotal } = orderTotals(cur.order_id);
    db.prepare('UPDATE orders SET subtotal = ?, total = ? WHERE id = ?').run(subtotal, subtotal, cur.order_id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  broadcast('orders', { id: cur.order_id });
  res.json({ ok: true });
});

app.post('/api/orders/:id/split', (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order || order.status !== 'open') return res.status(400).json({ error: 'Order မဖွင့်ထားပါ' });
  const ids = (req.body.itemIds || []).map(Number);
  const all = db.prepare("SELECT * FROM order_items WHERE order_id = ? AND status != 'cancelled'").all(id);
  const move = all.filter(it => ids.includes(it.id));
  if (!move.length) return res.status(400).json({ error: 'ခွဲမည့် ဟင်း ရွေးပါ' });
  if (move.length === all.length) return res.status(400).json({ error: 'အနည်းဆုံး တစ်ခု မူလဘီလ်တွင် ချန်ထားပါ' });
  db.exec('BEGIN');
  try {
    const r = db.prepare(`INSERT INTO orders (order_no, table_id, type, guests, staff_id, customer_id, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(nextOrderNo(), order.table_id, order.type, 1, req.staff.id, order.customer_id, order.note ? `${order.note} (split)` : '');
    const newId = r.lastInsertRowid;
    const upd = db.prepare('UPDATE order_items SET order_id = ? WHERE id = ?');
    for (const it of move) upd.run(newId, it.id);
    for (const oid of [id, newId]) {
      const { subtotal } = orderTotals(oid);
      db.prepare('UPDATE orders SET subtotal = ?, total = ? WHERE id = ?').run(subtotal, subtotal, oid);
    }
    const created = db.prepare('SELECT order_no FROM orders WHERE id = ?').get(newId);
    db.exec('COMMIT');
    broadcast('orders', { id });
    broadcast('tables');
    res.json({ id: newId, order_no: created.order_no });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'ဘီလ်ခွဲ မအောင်မြင်ပါ: ' + e.message });
  }
});

function recipeShortages(rows) {
  const need = new Map();
  for (const it of rows) {
    if (!it.item_id) continue;
    for (const l of db.prepare('SELECT * FROM recipe_items WHERE menu_item_id = ?').all(it.item_id)) {
      need.set(l.inventory_item_id, (need.get(l.inventory_item_id) || 0) + l.qty * it.qty);
    }
  }
  const warnings = [];
  for (const [invId, qty] of need) {
    const inv = db.prepare('SELECT name, qty, unit FROM inventory_items WHERE id = ?').get(invId);
    if (inv && inv.qty - qty < 0) {
      warnings.push(`${inv.name} လက်ကျန် မလုံလောက်ပါ (${inv.qty} ${inv.unit})`);
    }
  }
  return warnings;
}

function sendNewItemsToKitchen(orderId) {
  const rows = db.prepare("SELECT * FROM order_items WHERE order_id = ? AND status = 'new' AND stock_deducted = 0").all(orderId);
  const warnings = recipeShortages(rows);
  db.exec('BEGIN');
  try {
    for (const it of rows) {
      applyRecipe(it.item_id, orderId, it.qty);
      db.prepare('UPDATE order_items SET stock_deducted = 1 WHERE id = ?').run(it.id);
    }
    db.prepare("UPDATE order_items SET status = 'cooking', sent_at = datetime('now','localtime') WHERE order_id = ? AND status = 'new'").run(orderId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return warnings;
}

app.post('/api/orders/:id/send-kitchen', (req, res) => {
  const id = Number(req.params.id);
  let warnings;
  try {
    warnings = sendNewItemsToKitchen(id);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  broadcast('kitchen');
  broadcast('orders', { id });
  broadcast('inventory');
  res.json({ ok: true, warnings });
});

app.post('/api/orders/:id/confirm', (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'မတွေ့ပါ' });
  if (order.status !== 'open') return res.status(400).json({ error: 'ဤအော်ဒါကို အတည်ပြု၍ မရနိုင်ပါ' });
  let warnings = [];
  let sent = false;
  try {
    const hasNew = db.prepare("SELECT 1 FROM order_items WHERE order_id = ? AND status = 'new' LIMIT 1").get(id);
    if (hasNew) {
      warnings = sendNewItemsToKitchen(id);
      sent = true;
    }
    if (!order.confirmed_at) {
      db.prepare("UPDATE orders SET confirmed_at = datetime('now','localtime') WHERE id = ?").run(id);
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  broadcast('orders', { id });
  broadcast('tables');
  if (sent) {
    broadcast('kitchen');
    broadcast('inventory');
  }
  res.json({ ok: true, warnings });
});

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* Caller must wrap this in a transaction. */
function payOrderTx(order, { discount = 0, customerId = null, promotionId = null, payments = [], staffId = null, paidAt = null } = {}) {
  if (!order || order.status !== 'open') throw new HttpError(400, 'Order မဖွင့်ထားပါ');
  if (payments.some(p => Math.round(Number(p.amount) || 0) < 0)) throw new HttpError(400, 'ငွေပမာဏ မမှန်ပါ');

  const settings = getSettings();
  const { subtotal } = orderTotals(order.id);
  const disc = Math.min(Math.max(0, Math.round(Number(discount) || 0)), subtotal);
  const taxRate = Number(settings.tax_rate || 0);
  const serviceRate = Number(settings.service_rate || 0);
  const taxable = subtotal - disc;
  const tax = Math.round(taxable * taxRate / 100);
  const service = Math.round(taxable * serviceRate / 100);
  const total = taxable + tax + service;

  const paid = payments.reduce((s, p) => s + Math.round(Number(p.amount) || 0), 0);
  if (paid < total) throw new HttpError(400, `ငွေမလုံလောက်ပါ (လိုသေးသည် ${total - paid} ကျပ်)`);
  const creditAmount = payments.filter(p => p.method === 'credit').reduce((s, p) => s + Math.round(Number(p.amount) || 0), 0);
  const custId = customerId ? Number(customerId) : order.customer_id;
  if (creditAmount > 0 && !custId) throw new HttpError(400, 'အကြွေးအတွက် အဖွဲ့ဝင် ရွေးချယ်ပါ');

  const insPay = db.prepare(`INSERT INTO payments (order_id, method, amount, ref, staff_id, paid_at)
    VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')))`);
  for (const p of payments) {
    insPay.run(order.id, p.method || 'cash', Math.round(Number(p.amount) || 0), p.ref || '', staffId, paidAt);
  }
  db.prepare(`UPDATE orders SET status='paid', subtotal=?, discount=?, tax=?, service=?, total=?, customer_id=COALESCE(?, customer_id), promotion_id=?, closed_at=COALESCE(?, datetime('now','localtime')) WHERE id=?`)
    .run(subtotal, disc, tax, service, total, customerId ? Number(customerId) : null, promotionId ? Number(promotionId) : null, paidAt, order.id);
  if (creditAmount > 0) {
    db.prepare('INSERT INTO credits (customer_id, order_id, amount, note) VALUES (?, ?, ?, ?)')
      .run(custId, order.id, creditAmount, `Order ${order.order_no}`);
  }
  const ptsPer1000 = Number(settings.points_per_1000 || 0);
  if (custId && ptsPer1000 > 0) {
    db.prepare('UPDATE customers SET points = points + ? WHERE id = ?').run(Math.floor(total / 1000) * ptsPer1000, custId);
  }
  return { subtotal, discount: disc, tax, service, total };
}

app.post('/api/orders/:id/pay', (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order || order.status !== 'open') return res.status(400).json({ error: 'Order မဖွင့်ထားပါ' });
  const payments = Array.isArray(req.body.payments) ? req.body.payments : [];

  db.exec('BEGIN');
  try {
    const result = payOrderTx(order, {
      discount: req.body.discount,
      customerId: req.body.customerId,
      promotionId: req.body.promotionId,
      payments,
      staffId: req.staff.id
    });
    db.exec('COMMIT');
    broadcast('orders', { id });
    broadcast('tables');
    res.json({ ok: true, total: result.total, subtotal: result.subtotal, discount: result.discount, tax: result.tax, service: result.service });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(e.status || 500).json({ error: e.status ? e.message : 'ငွေရှင်း မအောင်မြင်ပါ: ' + e.message });
  }
});

/* Offline queue: apply a whole draft (order + items + optional payment) once. */
app.post('/api/sync/order', (req, res) => {
  const d = req.body || {};
  const clientRef = String(d.clientRef || '').trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(clientRef)) {
    return res.status(400).json({ error: 'Sync ကုဒ် မမှန်ပါ' });
  }
  const existing = db.prepare('SELECT id, order_no, status, total FROM orders WHERE client_ref = ?').get(clientRef);
  if (existing) {
    return res.json({ ...existing, duplicate: true });
  }

  const paidDraft = d.paid && Array.isArray(d.paid.payments) && d.paid.payments.length ? d.paid : null;
  if (paidDraft && req.staff.role === 'waiter') {
    return res.status(403).json({ error: 'ငွေရှင်းခွင့် မရှိပါ — ကောင်တာမှ ဝင်ရောက်ပါ' });
  }
  const items = Array.isArray(d.items) ? d.items.slice(0, 200) : [];
  if (!items.length) return res.status(400).json({ error: 'အော်ဒါတွင် ဟင်းမပါပါ' });

  const type = ['dine_in', 'takeaway', 'delivery'].includes(d.type) ? d.type : 'takeaway';
  const tableId = d.tableId ? Number(d.tableId) : null;
  const table = tableId ? db.prepare('SELECT id FROM tables WHERE id = ?').get(tableId) : null;
  let staffId = Number(d.staffId) || req.staff.id;
  if (!db.prepare('SELECT id FROM staff WHERE id = ? AND active = 1').get(staffId)) staffId = req.staff.id;
  const guests = Math.max(1, Math.round(Number(d.guests) || 1));
  const openedAt = normalizeTs(d.openedAt);

  db.exec('BEGIN');
  try {
    const orderId = db.prepare(`INSERT INTO orders (order_no, table_id, type, guests, staff_id, customer_id, note, opened_at, client_ref)
      VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')), ?)`)
      .run(nextOrderNo(), table ? table.id : null, type, guests, staffId,
        d.customerId ? Number(d.customerId) : null, String(d.note || '').slice(0, 500), openedAt, clientRef).lastInsertRowid;

    const insItem = db.prepare(`INSERT INTO order_items
      (order_id, item_id, name, price, qty, note, status, sent_at, stock_deducted, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')))`);
    const insMod = db.prepare('INSERT INTO order_item_modifiers (order_item_id, name, price) VALUES (?, ?, ?)');
    const cooking = [];

    for (const it of items) {
      const menu = it.itemId ? db.prepare('SELECT id, name, price FROM menu_items WHERE id = ?').get(Number(it.itemId)) : null;
      const name = menu?.name || String(it.name || '').trim();
      const price = Math.round(Number(menu ? menu.price : it.price));
      const qty = Number(it.qty);
      if (!name || !Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) {
        throw new HttpError(400, 'ဟင်း အချက်အလက် မမှန်ပါ');
      }
      const status = ['cooking', 'served'].includes(it.status) ? it.status : 'new';
      const sentAt = status === 'new' ? null : (normalizeTs(it.sentAt) || openedAt);
      const oiId = insItem.run(orderId, menu ? menu.id : null, name, price, qty,
        String(it.note || '').slice(0, 300), status, sentAt, status === 'new' ? 0 : 1, normalizeTs(it.createdAt)).lastInsertRowid;
      for (const m of (Array.isArray(it.modifiers) ? it.modifiers : []).slice(0, 20)) {
        insMod.run(oiId, String(m.name || '').slice(0, 100), Math.round(Number(m.price) || 0));
      }
      if (status !== 'new' && menu) cooking.push({ itemId: menu.id, qty });
    }

    const { subtotal } = orderTotals(orderId);
    db.prepare('UPDATE orders SET subtotal = ?, total = ? WHERE id = ?').run(subtotal, subtotal, orderId);
    for (const c of cooking) applyRecipe(c.itemId, orderId, c.qty);

    let payResult = null;
    if (paidDraft) {
      payResult = payOrderTx({ id: orderId, status: 'open', customer_id: d.customerId || null }, {
        discount: paidDraft.discount,
        customerId: paidDraft.customerId ?? d.customerId,
        promotionId: paidDraft.promotionId,
        payments: paidDraft.payments,
        staffId,
        paidAt: normalizeTs(paidDraft.paidAt)
      });
    }

    db.exec('COMMIT');
    const saved = db.prepare('SELECT id, order_no, status, total FROM orders WHERE id = ?').get(orderId);
    broadcast('orders');
    broadcast('tables');
    if (cooking.length) {
      broadcast('kitchen');
      broadcast('inventory');
    }
    res.json({ ...saved, duplicate: false, paid: payResult });
  } catch (e) {
    db.exec('ROLLBACK');
    if (e.status) return res.status(e.status).json({ error: e.message, code: 'SYNC_REJECTED' });
    res.status(500).json({ error: 'Sync မအောင်မြင်ပါ: ' + e.message });
  }
});

app.post('/api/orders/:id/void', (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? AND stock_deducted = 1').all(id);
  db.exec('BEGIN');
  try {
    for (const it of items) applyRecipe(it.item_id, id, -it.qty);
    db.prepare('UPDATE order_items SET stock_deducted = 0 WHERE order_id = ?').run(id);
    db.prepare("UPDATE orders SET status='void', closed_at=datetime('now','localtime') WHERE id=?").run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  broadcast('orders', { id });
  broadcast('tables');
  broadcast('inventory');
  res.json({ ok: true });
});

/* ---------------- kitchen ---------------- */
app.get('/api/kitchen', (req, res) => {
  const requested = String(req.query.station || '');
  const station = getStations().some(st => st.value === requested) ? requested : 'kitchen';
  res.json(db.prepare(`
    SELECT i.id, i.order_id, i.name, i.qty, i.note, i.status, i.sent_at,
           COALESCE(m.is_alcohol, 0) AS is_alcohol, COALESCE(m.station, 'kitchen') AS station,
           o.order_no, o.type, t.name AS table_name
    FROM order_items i
    JOIN orders o ON o.id = i.order_id AND o.status = 'open'
    LEFT JOIN tables t ON t.id = o.table_id
    LEFT JOIN menu_items m ON m.id = i.item_id
    WHERE i.status = 'cooking' AND COALESCE(m.station, 'kitchen') = ?
    ORDER BY i.sent_at, i.id
  `).all(station));
});

/* ---------------- reports ---------------- */
app.get('/api/reports/summary', (req, res) => {
  const date = req.query.date || ymdLocal();
  const orders = db.prepare("SELECT * FROM orders WHERE status='paid' AND date(closed_at)=?").all(date);
  const ids = orders.map(o => o.id);
  const total = orders.reduce((s, o) => s + o.total, 0);
  const discount = orders.reduce((s, o) => s + o.discount, 0);
  const tax = orders.reduce((s, o) => s + o.tax, 0);
  const service = orders.reduce((s, o) => s + o.service, 0);
  const byMethod = ids.length ? db.prepare(`
    SELECT p.method, COALESCE(m.name, p.method) AS method_name, SUM(p.amount) AS amount, COUNT(*) AS count
    FROM payments p LEFT JOIN payment_methods m ON m.code = p.method
    WHERE p.order_id IN (${ids.map(() => '?').join(',')}) GROUP BY p.method, m.name ORDER BY amount DESC
  `).all(...ids) : [];
  const topItems = ids.length ? db.prepare(`
    SELECT name, SUM(qty) AS qty, SUM(price*qty) AS amount FROM order_items
    WHERE order_id IN (${ids.map(() => '?').join(',')}) AND status != 'cancelled'
    GROUP BY name ORDER BY qty DESC LIMIT 10
  `).all(...ids) : [];
  const byHour = ids.length ? db.prepare(`
    SELECT substr(closed_at,12,2) AS hour, COUNT(*) AS orders, SUM(total) AS amount
    FROM orders WHERE id IN (${ids.map(() => '?').join(',')}) GROUP BY hour ORDER BY hour
  `).all(...ids) : [];
  const expenseDay = "COALESCE(NULLIF(spent_on, ''), date(created_at))";
  const expenses = db.prepare(`SELECT COALESCE(SUM(amount),0) AS amount FROM expenses WHERE ${expenseDay}=?`).get(date).amount;
  const expenseByCategory = db.prepare(`
    SELECT category, SUM(amount) AS amount FROM expenses WHERE ${expenseDay}=?
    GROUP BY category ORDER BY amount DESC
  `).all(date);
  const openCount = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status='open'").get().c;
  const creditOutstanding = db.prepare("SELECT COALESCE(SUM(amount - paid),0) AS amount FROM credits WHERE settled_at IS NULL").get().amount;
  const cost = ids.length ? db.prepare(`
    SELECT COALESCE(SUM(COALESCE(m.cost, 0) * oi.qty), 0) AS cost
    FROM order_items oi LEFT JOIN menu_items m ON m.id = oi.item_id
    WHERE oi.order_id IN (${ids.map(() => '?').join(',')}) AND oi.status != 'cancelled'
  `).get(...ids).cost : 0;
  const netSales = orders.reduce((s, o) => s + o.subtotal - o.discount, 0);
  const profit = netSales - cost;
  const alcohol = ids.length ? db.prepare(`
    SELECT COALESCE(SUM(oi.price * oi.qty), 0) AS amount, COALESCE(SUM(oi.qty), 0) AS qty
    FROM order_items oi JOIN menu_items m ON m.id = oi.item_id
    WHERE oi.order_id IN (${ids.map(() => '?').join(',')}) AND oi.status != 'cancelled' AND m.is_alcohol = 1
  `).get(...ids) : { amount: 0, qty: 0 };
  const recentOrders = db.prepare(`
    SELECT o.id, o.order_no, o.type, o.status, o.total, o.source, o.opened_at, t.name AS table_name,
           (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id AND i.status != 'cancelled') AS item_count
    FROM orders o LEFT JOIN tables t ON t.id = o.table_id
    ORDER BY o.id DESC LIMIT 8
  `).all();
  const weeklyTrend = db.prepare(`
    SELECT date(closed_at) AS date, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS total
    FROM orders WHERE status='paid' AND date(closed_at) >= date(? , '-6 days') AND date(closed_at) <= ?
    GROUP BY date(closed_at) ORDER BY date(closed_at)
  `).all(date, date);
  const onlineOrderCount = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE source = 'online' AND status = 'open'").get().c;

  res.json({
    date, orderCount: orders.length, total, discount, tax, service, expenses, creditOutstanding,
    netSales, cost, profit, margin: netSales ? Math.round(profit / netSales * 100) : 0,
    netProfit: profit - expenses, expenseByCategory,
    avg: orders.length ? Math.round(total / orders.length) : 0,
    byMethod, topItems, byHour, openCount, onlineOrderCount,
    alcoholSales: alcohol.amount, alcoholQty: alcohol.qty,
    recentOrders, weeklyTrend
  });
});

app.get('/api/reports/daily', (req, res) => {
  const from = req.query.from || ymdLocal();
  const to = req.query.to || from;
  res.json(db.prepare(`
    SELECT date(closed_at) AS date, COUNT(*) AS orders, SUM(subtotal) AS subtotal,
           SUM(discount) AS discount, SUM(total) AS total
    FROM orders WHERE status='paid' AND date(closed_at) BETWEEN ? AND ?
    GROUP BY date(closed_at) ORDER BY date
  `).all(from, to));
});

app.get('/api/reports/items', (req, res) => {
  const from = req.query.from || ymdLocal();
  const to = req.query.to || from;
  const alcoholOnly = req.query.alcohol === '1';
  res.json(db.prepare(`
    SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.price*oi.qty) AS amount,
           COALESCE(SUM(COALESCE(m.cost, 0) * oi.qty), 0) AS cost
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN menu_items m ON m.id = oi.item_id
    WHERE o.status='paid' AND date(o.closed_at) BETWEEN ? AND ? AND oi.status != 'cancelled'
      ${alcoholOnly ? 'AND m.is_alcohol = 1' : ''}
    GROUP BY oi.name ORDER BY amount DESC
  `).all(from, to));
});

app.get('/api/reports/staff', (req, res) => {
  const from = req.query.from || ymdLocal();
  const to = req.query.to || from;
  res.json(db.prepare(`
    SELECT COALESCE(s.name, '—') AS name, COUNT(o.id) AS orders, SUM(o.total) AS total
    FROM orders o LEFT JOIN staff s ON s.id = o.staff_id
    WHERE o.status='paid' AND date(o.closed_at) BETWEEN ? AND ?
    GROUP BY o.staff_id ORDER BY total DESC
  `).all(from, to));
});

/* ---------------- inventory ---------------- */
app.get('/api/inventory', (req, res) => {
  const items = db.prepare('SELECT * FROM inventory_items ORDER BY name').all();
  const moves = db.prepare('SELECT * FROM stock_moves ORDER BY id DESC LIMIT 100').all();
  const expenses = db.prepare('SELECT * FROM expenses ORDER BY id DESC LIMIT 50').all();
  res.json({ items, moves, expenses });
});

app.post('/api/inventory', (req, res) => {
  const { name, unit, qty, reorder_level, cost } = req.body;
  if (!name) return res.status(400).json({ error: 'အမည် ထည့်ပါ' });
  const r = db.prepare('INSERT INTO inventory_items (name, unit, qty, reorder_level, cost) VALUES (?, ?, ?, ?, ?)')
    .run(name, unit || '', Number(qty) || 0, Number(reorder_level) || 0, Math.round(Number(cost) || 0));
  broadcast('inventory');
  res.json({ id: r.lastInsertRowid });
});

app.post('/api/inventory/:id/move', (req, res) => {
  const id = Number(req.params.id);
  const { type, qty, note = '' } = req.body;
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const q = Number(qty) || 0;
  const delta = type === 'in' ? q : type === 'out' ? -q : q;
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE inventory_items SET qty = qty + ? WHERE id = ?').run(delta, id);
    db.prepare('INSERT INTO stock_moves (item_id, type, qty, note, staff_id) VALUES (?, ?, ?, ?, ?)')
      .run(id, type || 'adjust', q, note, req.staff.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ error: e.message }); }
  broadcast('inventory');
  res.json({ ok: true });
});

app.patch('/api/inventory/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const b = req.body;
  db.prepare(`UPDATE inventory_items SET name=?, unit=?, qty=?, reorder_level=?, cost=?, sku=?, category=? WHERE id=?`)
    .run(
      b.name ?? cur.name,
      b.unit ?? cur.unit,
      Number(b.qty ?? cur.qty) || 0,
      Number(b.reorder_level ?? cur.reorder_level) || 0,
      Math.round(Number(b.cost ?? cur.cost) || 0),
      b.sku ?? cur.sku ?? '',
      b.category ?? cur.category ?? '',
      id
    );
  broadcast('inventory');
  res.json({ ok: true });
});

app.delete('/api/inventory/:id', (req, res) => {
  const id = Number(req.params.id);
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM recipe_items WHERE inventory_item_id = ?').run(id);
    db.prepare('DELETE FROM stock_moves WHERE item_id = ?').run(id);
    db.prepare('DELETE FROM inventory_items WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  broadcast('inventory');
  res.json({ ok: true });
});

app.post('/api/inventory/bulk-delete', (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ပစ္စည်းများ ရွေးပါ' });
  db.exec('BEGIN');
  try {
    const delRecipe = db.prepare('DELETE FROM recipe_items WHERE inventory_item_id = ?');
    const delMove = db.prepare('DELETE FROM stock_moves WHERE item_id = ?');
    const delItem = db.prepare('DELETE FROM inventory_items WHERE id = ?');
    for (const id of ids) {
      delRecipe.run(Number(id));
      delMove.run(Number(id));
      delItem.run(Number(id));
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  broadcast('inventory');
  res.json({ ok: true, count: ids.length });
});

app.post('/api/inventory/bulk-move', (req, res) => {
  const { ids, type, qty, note = '' } = req.body || {};
  if (!Array.isArray(ids) || !ids.length || !qty) return res.status(400).json({ error: 'အချက်အလက် မပြည့်စုံပါ' });
  const q = Number(qty) || 0;
  const delta = type === 'in' ? q : type === 'out' ? -q : q;
  db.exec('BEGIN');
  try {
    const updateQty = db.prepare('UPDATE inventory_items SET qty = MAX(0, qty + ?) WHERE id = ?');
    const recordMove = db.prepare('INSERT INTO stock_moves (item_id, type, qty, note, staff_id) VALUES (?, ?, ?, ?, ?)');
    for (const id of ids) {
      updateQty.run(delta, Number(id));
      recordMove.run(Number(id), type || 'adjust', q, note, req.staff?.id || 1);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  broadcast('inventory');
  res.json({ ok: true, count: ids.length });
});

app.post('/api/inventory/bulk-import', (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'တင်သွင်းမည့် ပစ္စည်း မရှိပါ' });
  db.exec('BEGIN');
  try {
    const findInv = db.prepare('SELECT id FROM inventory_items WHERE name = ? COLLATE NOCASE');
    const insInv = db.prepare(`INSERT INTO inventory_items (name, unit, qty, reorder_level, cost, sku, category)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const updateInv = db.prepare(`UPDATE inventory_items SET unit=?, qty=?, reorder_level=?, cost=?, sku=?, category=? WHERE id=?`);

    let inserted = 0;
    let updated = 0;

    for (const it of items) {
      if (!it.name) continue;
      const existing = findInv.get(String(it.name).trim());
      const unit = it.unit || 'ကီလို';
      const qty = Number(it.qty) || 0;
      const reorder_level = Number(it.reorder_level) || 0;
      const cost = Math.round(Number(it.cost) || 0);
      const sku = it.sku || '';
      const category = it.category || '';

      if (existing) {
        updateInv.run(unit, qty, reorder_level, cost, sku, category, existing.id);
        updated++;
      } else {
        insInv.run(String(it.name).trim(), unit, qty, reorder_level, cost, sku, category);
        inserted++;
      }
    }
    db.exec('COMMIT');
    broadcast('inventory');
    res.json({ ok: true, inserted, updated, total: inserted + updated });
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/expense-categories', (req, res) => {
  res.json(db.prepare(`
    SELECT c.id, c.name, COUNT(e.id) AS count, COALESCE(SUM(e.amount), 0) AS amount
    FROM expense_categories c LEFT JOIN expenses e ON e.category = c.name
    GROUP BY c.id ORDER BY c.id
  `).all());
});

app.post('/api/expense-categories', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'အမျိုးအစား အမည် ထည့်ပါ' });
  if (name.length > 40) return res.status(400).json({ error: 'အမည် ရှည်လွန်းနေပါသည်' });
  try {
    const r = db.prepare('INSERT INTO expense_categories (name) VALUES (?)').run(name);
    broadcast('expenses');
    res.json({ ok: true, id: Number(r.lastInsertRowid) });
  } catch {
    res.status(409).json({ error: 'အမျိုးအစား ရှိပြီးသားပါ' });
  }
});

app.patch('/api/expense-categories/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'အမျိုးအစား မတွေ့ပါ' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'အမျိုးအစား အမည် ထည့်ပါ' });
  if (name.length > 40) return res.status(400).json({ error: 'အမည် ရှည်လွန်းနေပါသည်' });
  try {
    db.exec('BEGIN');
    db.prepare('UPDATE expense_categories SET name = ? WHERE id = ?').run(name, cur.id);
    db.prepare('UPDATE expenses SET category = ? WHERE category = ?').run(name, cur.name);
    db.exec('COMMIT');
  } catch {
    db.exec('ROLLBACK');
    return res.status(409).json({ error: 'အမျိုးအစား ရှိပြီးသားပါ' });
  }
  broadcast('expenses');
  res.json({ ok: true });
});

app.delete('/api/expense-categories/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'အမျိုးအစား မတွေ့ပါ' });
  const used = db.prepare('SELECT COUNT(*) AS c FROM expenses WHERE category = ?').get(cur.name).c;
  if (used) return res.status(409).json({ error: `ဤအမျိုးအစားကို မှတ်တမ်း ${used} ခု အသုံးပြုနေပါသည် — ဖျက်မရပါ` });
  db.prepare('DELETE FROM expense_categories WHERE id = ?').run(cur.id);
  broadcast('expenses');
  res.json({ ok: true });
});

app.get('/api/expenses', (req, res) => {
  const from = req.query.from || ymdLocal();
  const to = req.query.to || from;
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '').trim();
  const day = "COALESCE(NULLIF(e.spent_on, ''), date(e.created_at))";
  const where = [`${day} BETWEEN ? AND ?`];
  const args = [from, to];
  if (category) { where.push('e.category = ?'); args.push(category); }
  if (q) {
    where.push('(e.note LIKE ? OR e.vendor LIKE ? OR e.category LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const rows = db.prepare(`
    SELECT e.id, e.category, e.amount, e.note, e.created_at, e.staff_id, e.vendor, e.method,
           ${day} AS spent_on, s.name AS staff_name
    FROM expenses e LEFT JOIN staff s ON s.id = e.staff_id
    WHERE ${where.join(' AND ')} ORDER BY spent_on DESC, e.id DESC LIMIT 500
  `).all(...args);
  const byCategory = Object.values(rows.reduce((m, r) => {
    const key = r.category || '';
    m[key] = m[key] || { category: key, amount: 0 };
    m[key].amount += r.amount;
    return m;
  }, {})).sort((a, b) => b.amount - a.amount);
  res.json({
    rows,
    count: rows.length,
    total: rows.reduce((s, r) => s + r.amount, 0),
    cash: rows.filter(r => r.method === 'cash').reduce((s, r) => s + r.amount, 0),
    bank: rows.filter(r => r.method !== 'cash').reduce((s, r) => s + r.amount, 0),
    byCategory
  });
});

app.post('/api/expenses', (req, res) => {
  const { category = '', amount, note = '', spent_on, method = 'cash', vendor = '' } = req.body;
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) return res.status(400).json({ error: 'ပမာဏ ထည့်ပါ' });
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(spent_on || '')) ? spent_on : ymdLocal();
  const cat = String(category).trim();
  if (cat) db.prepare('INSERT OR IGNORE INTO expense_categories (name) VALUES (?)').run(cat);
  db.prepare(`INSERT INTO expenses (category, amount, note, spent_on, method, vendor, staff_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(cat, amt, String(note).trim(), day, method === 'bank' ? 'bank' : 'cash', String(vendor).trim(), req.staff.id);
  broadcast('expenses');
  res.json({ ok: true });
});

app.delete('/api/expenses/:id', (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(Number(req.params.id));
  broadcast('expenses');
  res.json({ ok: true });
});

/* ---------------- payment methods (ငွေချေမျိုးအစားများ) ---------------- */
app.get('/api/payment-methods', (req, res) => {
  res.json(db.prepare(`
    SELECT m.id, m.code, m.name, m.sort,
           (SELECT COUNT(*) FROM payments p WHERE p.method = m.code) AS count,
           (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.method = m.code) AS amount
    FROM payment_methods m ORDER BY m.sort, m.id
  `).all());
});

app.post('/api/payment-methods', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'အမျိုးအစား အမည် ထည့်ပါ' });
  if (name.length > 40) return res.status(400).json({ error: 'အမည် ရှည်လွန်းနေပါသည်' });
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pm';
  let code = base;
  for (let n = 2; db.prepare('SELECT 1 FROM payment_methods WHERE code = ?').get(code); n++) code = `${base}-${n}`;
  const sort = db.prepare('SELECT COALESCE(MAX(sort), 0) AS s FROM payment_methods').get().s + 10;
  try {
    const r = db.prepare('INSERT INTO payment_methods (code, name, sort) VALUES (?, ?, ?)').run(code, name, sort);
    broadcast('payments');
    res.json({ ok: true, id: Number(r.lastInsertRowid), code });
  } catch {
    res.status(409).json({ error: 'အမျိုးအစား ရှိပြီးသားပါ' });
  }
});

app.patch('/api/payment-methods/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'အမျိုးအစား မတွေ့ပါ' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'အမျိုးအစား အမည် ထည့်ပါ' });
  if (name.length > 40) return res.status(400).json({ error: 'အမည် ရှည်လွန်းနေပါသည်' });
  try {
    db.prepare('UPDATE payment_methods SET name = ? WHERE id = ?').run(name, cur.id);
  } catch {
    return res.status(409).json({ error: 'အမျိုးအစား ရှိပြီးသားပါ' });
  }
  broadcast('payments');
  res.json({ ok: true });
});

app.delete('/api/payment-methods/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'အမျိုးအစား မတွေ့ပါ' });
  const used = db.prepare('SELECT COUNT(*) AS c FROM payments WHERE method = ?').get(cur.code).c;
  if (used) return res.status(409).json({ error: `ဤအမျိုးအစားကို ငွေချေမှု ${used} ခု အသုံးပြုနေပါသည် — ဖျက်မရပါ` });
  if (db.prepare('SELECT COUNT(*) AS c FROM payment_methods').get().c <= 1) {
    return res.status(409).json({ error: 'အနည်းဆုံး ငွေချေမျိုးအစား တစ်ခု ထားရှိရပါမည်' });
  }
  db.prepare('DELETE FROM payment_methods WHERE id = ?').run(cur.id);
  broadcast('payments');
  res.json({ ok: true });
});

/* ---------------- customers ---------------- */
app.get('/api/customers', (req, res) => {
  const q = `%${req.query.q || ''}%`;
  res.json(db.prepare('SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY id DESC LIMIT 100').all(q, q));
});

app.post('/api/customers', (req, res) => {
  const { name, phone = '', note = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'အမည် ထည့်ပါ' });
  const r = db.prepare('INSERT INTO customers (name, phone, note) VALUES (?, ?, ?)').run(name, phone, note);
  res.json({ id: r.lastInsertRowid });
});

app.patch('/api/customers/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM customers WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const b = req.body;
  db.prepare('UPDATE customers SET name=?, phone=?, points=?, tier=?, note=? WHERE id=?')
    .run(b.name ?? cur.name, b.phone ?? cur.phone, Math.round(Number(b.points ?? cur.points)), b.tier ?? cur.tier, b.note ?? cur.note, cur.id);
  res.json({ ok: true });
});

/* ---------------- staff ---------------- */
app.get('/api/staff', (req, res) => res.json(db.prepare('SELECT id, name, role, active FROM staff ORDER BY id').all()));

app.post('/api/staff', (req, res) => {
  const { name, pin, role = 'cashier' } = req.body;
  if (!name || !pin) return res.status(400).json({ error: 'အမည်/PIN ထည့်ပါ' });
  const r = db.prepare('INSERT INTO staff (name, pin, role) VALUES (?, ?, ?)').run(name, hashPin(String(pin)), role);
  res.json({ id: r.lastInsertRowid });
});

app.patch('/api/staff/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM staff WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const b = req.body;
  db.prepare('UPDATE staff SET name=?, pin=?, role=?, active=? WHERE id=?')
    .run(b.name ?? cur.name, b.pin != null && b.pin !== '' ? hashPin(String(b.pin)) : cur.pin,
      b.role ?? cur.role, (b.active ?? cur.active) ? 1 : 0, cur.id);
  res.json({ ok: true });
});

/* ---------------- shift / cash drawer ---------------- */
function shiftSummary(shift) {
  if (!shift) return null;
  const args = [shift.opened_at];
  let endSql = '';
  if (shift.closed_at) { endSql = 'AND p.paid_at <= ?'; args.push(shift.closed_at); }
  const byMethod = db.prepare(`
    SELECT p.method, COALESCE(m.name, p.method) AS method_name, SUM(p.amount) AS amount, COUNT(*) AS count
    FROM payments p JOIN orders o ON o.id = p.order_id
    LEFT JOIN payment_methods m ON m.code = p.method
    WHERE p.paid_at >= ? ${endSql} GROUP BY p.method, m.name ORDER BY amount DESC
  `).all(...args);
  const cash = byMethod.find(m => m.method === 'cash')?.amount || 0;
  const orders = db.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(total), 0) AS total FROM orders
    WHERE status = 'paid' AND closed_at >= ? ${shift.closed_at ? 'AND closed_at <= ?' : ''}
  `).get(...(shift.closed_at ? [shift.opened_at, shift.closed_at] : [shift.opened_at]));
  const expArgs = [shift.opened_at];
  if (shift.closed_at) expArgs.push(shift.closed_at);
  const expenseCash = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS amount FROM expenses
    WHERE method = 'cash' AND created_at >= ? ${shift.closed_at ? 'AND created_at <= ?' : ''}
  `).get(...expArgs).amount;
  const expectedCash = shift.opening_cash + cash - expenseCash;
  return {
    shift, byMethod, cash, expenseCash, orderCount: orders.c, sales: orders.total,
    expectedCash,
    difference: shift.closing_cash != null ? shift.closing_cash - expectedCash : null
  };
}

function currentShift() {
  const shift = db.prepare('SELECT * FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1').get();
  return shiftSummary(shift);
}

app.get('/api/shifts/current', (req, res) => res.json(currentShift()));

app.post('/api/shifts/open', (req, res) => {
  const open = db.prepare('SELECT id FROM shifts WHERE closed_at IS NULL LIMIT 1').get();
  if (open) return res.status(400).json({ error: 'ဆိုင် ဖွင့်ထားပြီးသားပါ' });
  const r = db.prepare('INSERT INTO shifts (staff_id, opening_cash) VALUES (?, ?)')
    .run(req.staff.id, Math.round(Number(req.body.opening_cash) || 0));
  broadcast('shifts');
  res.json({ id: r.lastInsertRowid });
});

app.post('/api/shifts/close', (req, res) => {
  const shift = db.prepare('SELECT * FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1').get();
  if (!shift) return res.status(400).json({ error: 'ဖွင့်ထားသော ဆိုင် မရှိပါ' });
  const closing = Math.round(Number(req.body.closing_cash) || 0);
  db.prepare("UPDATE shifts SET closed_at = datetime('now','localtime'), closing_cash = ?, note = ? WHERE id = ?")
    .run(closing, req.body.note || '', shift.id);
  const summary = shiftSummary(db.prepare('SELECT * FROM shifts WHERE id = ?').get(shift.id));
  broadcast('shifts');
  res.json(summary);
});

/* ---------------- backup ---------------- */
const BACKUP_DIR = process.env.POS_BACKUP_DIR
  ? path.resolve(process.env.POS_BACKUP_DIR)
  : path.resolve(process.cwd(), 'backups');
const BACKUP_KEEP = 30;
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

app.get('/api/backup', (req, res) => {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    res.download(DB_PATH, `pos-backup-${ymdLocal()}.db`);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function dailyBackup() {
  try {
    const file = path.join(BACKUP_DIR, `pos-${ymdLocal()}.db`);
    if (!fs.existsSync(file)) {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      fs.copyFileSync(DB_PATH, file);
    }
    const old = fs.readdirSync(BACKUP_DIR)
      .filter(f => /^pos-\d{4}-\d{2}-\d{2}\.db$/.test(f))
      .sort()
      .slice(0, -BACKUP_KEEP);
    for (const f of old) {
      try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {}
    }
  } catch (e) {
    console.error('Backup failed:', e.message);
  }
}
dailyBackup();
setInterval(dailyBackup, 60 * 60 * 1000);

/* ---------------- direct printing ---------------- */
const moneyText = n => Number(n || 0).toLocaleString('en-US');
const lineText = (a, b, width = 42) => {
  const left = String(a);
  const right = String(b);
  const gap = Math.max(1, width - left.length - right.length);
  return left + ' '.repeat(gap) + right;
};

function buildReceiptText(orderId) {
  const o = orderWithItems(orderId);
  if (!o) throw new Error('Order မတွေ့ပါ');
  const s = getSettings();
  const rows = [];
  rows.push((s.shop_name || 'POS').toUpperCase());
  if (s.shop_name_en) rows.push(s.shop_name_en);
  if (s.address) rows.push(s.address);
  if (s.phone) rows.push(`Tel: ${s.phone}`);
  rows.push('-'.repeat(42));
  rows.push(lineText(`Order #${o.order_no}`, o.opened_at?.slice(0, 16) || ''));
  rows.push(lineText(`Type: ${o.type}`, `Guests: ${o.guests}`));
  rows.push('-'.repeat(42));
  for (const it of o.items) {
    if (it.status === 'cancelled') continue;
    rows.push(lineText(`${it.name} x${it.qty}`, moneyText(Math.round(it.price * it.qty))));
    if (it.note) rows.push(`  * ${it.note}`);
  }
  rows.push('-'.repeat(42));
  rows.push(lineText('Subtotal', moneyText(o.subtotal)));
  if (o.discount) rows.push(lineText('Discount', '-' + moneyText(o.discount)));
  if (o.tax) rows.push(lineText('Tax', moneyText(o.tax)));
  if (o.service) rows.push(lineText('Service', moneyText(o.service)));
  rows.push(lineText('TOTAL', moneyText(o.total)));
  const methods = o.payments.map(p => `${p.method_name || p.method}: ${moneyText(p.amount)}`).join('  ');
  if (methods) rows.push(methods);
  rows.push('-'.repeat(42));
  if (o.items.some(it => it.status !== 'cancelled' && it.is_alcohol)) {
    rows.push('18+ Alcohol - not for sale to under 18');
  }
  rows.push(s.footer || '');
  rows.push('');
  return rows.join('\n');
}

function buildKitchenText(orderId, station = 'kitchen') {
  const o = orderWithItems(orderId);
  if (!o) throw new Error('Order မတွေ့ပါ');
  const table = o.table_id ? db.prepare('SELECT name FROM tables WHERE id = ?').get(o.table_id)?.name : '';
  const rows = [`${stationTitle(station)} TICKET`, '-'.repeat(42), `#${o.order_no}  ${table || o.type}`, new Date().toLocaleString('en-GB'), '-'.repeat(42)];
  for (const it of o.items) {
    if (it.status !== 'cooking') continue;
    if ((it.station || 'kitchen') !== station) continue;
    rows.push(`${it.name}  x${it.qty}`);
    if (it.note) rows.push(`   >> ${it.note}`);
  }
  rows.push('-'.repeat(42), '');
  return rows.join('\n');
}

function runPrinter(text) {
  const s = getSettings();
  const mode = s.printer_mode || 'browser';
  if (mode === 'network') {
    const host = s.printer_host;
    const port = Number(s.printer_port) || 9100;
    if (!host) return Promise.reject(new Error('Printer IP မထည့်ရသေးပါ'));
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host, port, timeout: 5000 }, () => {
        const data = Buffer.concat([Buffer.from([0x1b, 0x40]), Buffer.from(text + '\n\n\n', 'utf8'), Buffer.from([0x1d, 0x56, 0x00])]);
        sock.end(data);
      });
      sock.on('close', resolve);
      sock.on('error', reject);
      sock.on('timeout', () => { sock.destroy(); reject(new Error('Printer ချိတ်ဆက်မှု timeout')); });
    });
  }
  if (mode === 'windows') {
    const file = path.join(os.tmpdir(), `pos-print-${Date.now()}.txt`);
    fs.writeFileSync(file, text, 'utf8');
    const name = (s.printer_name || '').replace(/'/g, "''");
    const cmd = name
      ? `Get-Content -LiteralPath '${file.replace(/'/g, "''")}' -Encoding UTF8 | Out-Printer -Name '${name}'`
      : `Get-Content -LiteralPath '${file.replace(/'/g, "''")}' -Encoding UTF8 | Out-Printer`;
    return new Promise((resolve, reject) => {
      const p = spawn('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true });
      let err = '';
      p.stderr.on('data', d => { err += d.toString(); });
      p.on('error', reject);
      p.on('close', code => {
        try { fs.unlinkSync(file); } catch {}
        code === 0 ? resolve() : reject(new Error(err || `Print failed (${code})`));
      });
    });
  }
  return Promise.reject(new Error('Printer mode ကို Settings မှာ ရွေးပါ'));
}

app.post('/api/print/receipt/:id', async (req, res) => {
  try {
    await runPrinter(buildReceiptText(Number(req.params.id)));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/print/kitchen/:id', async (req, res) => {
  try {
    const station = resolveStation(req.body?.station) || 'kitchen';
    await runPrinter(buildKitchenText(Number(req.params.id), station));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/print/test', async (req, res) => {
  try {
    const s = getSettings();
    await runPrinter(`${s.shop_name || 'POS'}\nPrinter test OK\n${new Date().toLocaleString('en-GB')}\n\n`);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ---------------- settings ---------------- */
app.get('/api/settings', (req, res) => res.json(getSettings()));
app.patch('/api/settings', (req, res) => { setSettings(req.body || {}); broadcast('settings'); res.json({ ok: true }); });

/* ---------------- stations & units ---------------- */
app.post('/api/stations', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'ဌာနအမည် ထည့်ပါ' });
  const low = name.toLowerCase();
  const exists = getStations().some(st =>
    [st.value, st.label, st.label_en].filter(Boolean).some(v => String(v).toLowerCase() === low)
  );
  if (exists) return res.status(409).json({ error: 'ဒီဌာန ရှိပြီးသားပါ' });
  const custom = readSettingsList('custom_stations');
  custom.push({ value: name, label: name });
  saveSettingsList('custom_stations', custom);
  broadcast('settings');
  res.json({ value: name, label: name });
});

app.post('/api/menu-units', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'ယူနစ်အမည် ထည့်ပါ' });
  if (getUnits().some(u => u.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: 'ဒီယူနစ် ရှိပြီးသားပါ' });
  }
  const custom = readSettingsList('custom_units');
  custom.push(name);
  saveSettingsList('custom_units', custom);
  broadcast('settings');
  res.json({ value: name });
});

/* ---------------- static ---------------- */
const dist = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
  }
  console.log(`POS server: http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Network:  http://${ip}:${PORT}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received — closing server…`);
  for (const res of clients) { try { res.end(); } catch {} }
  clients.clear();
  server.close(() => {
    try { db.close(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
