import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import {
  db, DB_PATH, getSettings, setSettings, nextOrderNo, orderTotals, orderWithItems, tableStatus
} from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));

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

app.post('/api/auth/login', (req, res) => {
  const { pin } = req.body || {};
  const staff = db.prepare('SELECT id, name, role FROM staff WHERE pin = ? AND active = 1').get(String(pin || ''));
  if (!staff) return res.status(401).json({ error: 'PIN မှားနေပါတယ်' });
  res.json({ staff });
});

app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/auth/login' || req.path === '/events') return next();
  const id = req.headers['x-staff-id'] || req.query.staffId;
  const staff = id ? db.prepare('SELECT id, name, role FROM staff WHERE id = ? AND active = 1').get(Number(id)) : null;
  if (!staff) return res.status(401).json({ error: 'ပြန်လည် ဝင်ရောက်ပါ' });
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
    tables: tableStatus(),
    staff: db.prepare('SELECT id, name, role, active FROM staff ORDER BY id').all(),
    customers: db.prepare('SELECT * FROM customers ORDER BY id DESC').all(),
    openOrders: db.prepare(`
      SELECT o.id, o.order_no, o.table_id, o.type, o.total, o.opened_at, o.guests,
             (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id AND i.status != 'cancelled') AS item_count
      FROM orders o WHERE o.status = 'open' ORDER BY o.opened_at
    `).all(),
    reservations: db.prepare(`
      SELECT r.*, t.name AS table_name FROM reservations r LEFT JOIN tables t ON t.id = r.table_id
      WHERE r.status = 'booked' AND date(r.reserved_at) >= date('now','localtime')
      ORDER BY r.reserved_at LIMIT 50
    `).all(),
    creditOutstanding: db.prepare('SELECT COALESCE(SUM(amount - paid), 0) AS amount FROM credits WHERE settled_at IS NULL').get().amount,
    shift: currentShift(),
    promotions: db.prepare('SELECT * FROM promotions ORDER BY active DESC, id').all(),
    kitchenCount: db.prepare("SELECT COUNT(*) AS c FROM order_items i LEFT JOIN menu_items m ON m.id = i.item_id WHERE i.status = 'cooking' AND COALESCE(m.station, 'kitchen') = 'kitchen'").get().c,
    barCount: db.prepare("SELECT COUNT(*) AS c FROM order_items i LEFT JOIN menu_items m ON m.id = i.item_id WHERE i.status = 'cooking' AND m.station = 'bar'").get().c,
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
  const { category_id, name, price, cost, unit, available, sort, is_alcohol = 0, station = 'kitchen' } = req.body;
  if (!category_id || !name || price == null) return res.status(400).json({ error: 'အချက်အလက် မပြည့်စုံပါ' });
  const r = db.prepare('INSERT INTO menu_items (category_id, name, price, cost, unit, available, sort, is_alcohol, station) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(Number(category_id), name, Math.round(Number(price)), Math.round(Number(cost) || 0), unit || '', available ? 1 : 0, Number(sort) || 0,
      is_alcohol ? 1 : 0, station === 'bar' ? 'bar' : 'kitchen');
  broadcast('menu');
  res.json({ id: r.lastInsertRowid });
});

app.patch('/api/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const b = req.body;
  db.prepare(`UPDATE menu_items SET category_id=?, name=?, price=?, cost=?, unit=?, available=?, sort=?, is_alcohol=?, station=? WHERE id=?`)
    .run(
      Number(b.category_id ?? cur.category_id),
      b.name ?? cur.name,
      Math.round(Number(b.price ?? cur.price)),
      Math.round(Number(b.cost ?? cur.cost)),
      b.unit ?? cur.unit,
      (b.available ?? cur.available) ? 1 : 0,
      Number(b.sort ?? cur.sort),
      (b.is_alcohol ?? cur.is_alcohol) ? 1 : 0,
      (b.station ?? cur.station) === 'bar' ? 'bar' : 'kitchen',
      id
    );
  broadcast('menu');
  res.json({ ok: true });
});

app.delete('/api/items/:id', (req, res) => {
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(Number(req.params.id));
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
  db.prepare('UPDATE orders SET note = COALESCE(?, note), guests = COALESCE(?, guests), customer_id = COALESCE(?, customer_id) WHERE id = ?')
    .run(note ?? null, guests ?? null, customerId ?? null, id);
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

app.post('/api/orders/:id/send-kitchen', (req, res) => {
  const id = Number(req.params.id);
  const rows = db.prepare("SELECT * FROM order_items WHERE order_id = ? AND status = 'new' AND stock_deducted = 0").all(id);
  db.exec('BEGIN');
  try {
    for (const it of rows) {
      applyRecipe(it.item_id, id, it.qty);
      db.prepare('UPDATE order_items SET stock_deducted = 1 WHERE id = ?').run(it.id);
    }
    db.prepare("UPDATE order_items SET status = 'cooking', sent_at = datetime('now','localtime') WHERE order_id = ? AND status = 'new'").run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  broadcast('kitchen');
  broadcast('orders', { id });
  broadcast('inventory');
  res.json({ ok: true });
});

app.post('/api/orders/:id/pay', (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order || order.status !== 'open') return res.status(400).json({ error: 'Order မဖွင့်ထားပါ' });
  const { discount = 0, payments = [], customerId = null, promotionId = null } = req.body;

  const settings = getSettings();
  const { subtotal } = orderTotals(id);
  const disc = Math.min(Math.max(0, Math.round(Number(discount) || 0)), subtotal);
  const taxRate = Number(settings.tax_rate || 0);
  const serviceRate = Number(settings.service_rate || 0);
  const taxable = subtotal - disc;
  const tax = Math.round(taxable * taxRate / 100);
  const service = Math.round(taxable * serviceRate / 100);
  const total = taxable + tax + service;

  const paid = payments.reduce((s, p) => s + Math.round(Number(p.amount) || 0), 0);
  if (paid < total) return res.status(400).json({ error: `ငွေမလုံလောက်ပါ (လိုသေးသည် ${total - paid} ကျပ်)` });
  const creditAmount = payments.filter(p => p.method === 'credit').reduce((s, p) => s + Math.round(Number(p.amount) || 0), 0);
  const custId = customerId ? Number(customerId) : order.customer_id;
  if (creditAmount > 0 && !custId) return res.status(400).json({ error: 'အကြွေးအတွက် အဖွဲ့ဝင် ရွေးချယ်ပါ' });

  db.exec('BEGIN');
  try {
    const insPay = db.prepare('INSERT INTO payments (order_id, method, amount, ref, staff_id) VALUES (?, ?, ?, ?, ?)');
    for (const p of payments) insPay.run(id, p.method || 'cash', Math.round(Number(p.amount) || 0), p.ref || '', req.staff.id);
    db.prepare(`UPDATE orders SET status='paid', subtotal=?, discount=?, tax=?, service=?, total=?, customer_id=COALESCE(?, customer_id), promotion_id=?, closed_at=datetime('now','localtime') WHERE id=?`)
      .run(subtotal, disc, tax, service, total, customerId ? Number(customerId) : null, promotionId ? Number(promotionId) : null, id);
    if (creditAmount > 0) {
      db.prepare('INSERT INTO credits (customer_id, order_id, amount, note) VALUES (?, ?, ?, ?)')
        .run(custId, id, creditAmount, `Order ${order.order_no}`);
    }
    const ptsPer1000 = Number(settings.points_per_1000 || 0);
    if (custId && ptsPer1000 > 0) {
      db.prepare('UPDATE customers SET points = points + ? WHERE id = ?').run(Math.floor(total / 1000) * ptsPer1000, custId);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'ငွေရှင်း မအောင်မြင်ပါ: ' + e.message });
  }
  broadcast('orders', { id });
  broadcast('tables');
  res.json({ ok: true, total, subtotal, discount: disc, tax, service });
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
  const station = req.query.station === 'bar' ? 'bar' : 'kitchen';
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
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const orders = db.prepare("SELECT * FROM orders WHERE status='paid' AND date(closed_at)=?").all(date);
  const ids = orders.map(o => o.id);
  const total = orders.reduce((s, o) => s + o.total, 0);
  const discount = orders.reduce((s, o) => s + o.discount, 0);
  const tax = orders.reduce((s, o) => s + o.tax, 0);
  const service = orders.reduce((s, o) => s + o.service, 0);
  const byMethod = ids.length ? db.prepare(`
    SELECT method, SUM(amount) AS amount, COUNT(*) AS count FROM payments
    WHERE order_id IN (${ids.map(() => '?').join(',')}) GROUP BY method ORDER BY amount DESC
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
  const expenses = db.prepare("SELECT COALESCE(SUM(amount),0) AS amount FROM expenses WHERE date(created_at)=?").get(date).amount;
  const openCount = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status='open'").get().c;
  const creditOutstanding = db.prepare("SELECT COALESCE(SUM(amount - paid),0) AS amount FROM credits WHERE settled_at IS NULL").get().amount;
  const alcohol = ids.length ? db.prepare(`
    SELECT COALESCE(SUM(oi.price * oi.qty), 0) AS amount, COALESCE(SUM(oi.qty), 0) AS qty
    FROM order_items oi JOIN menu_items m ON m.id = oi.item_id
    WHERE oi.order_id IN (${ids.map(() => '?').join(',')}) AND oi.status != 'cancelled' AND m.is_alcohol = 1
  `).get(...ids) : { amount: 0, qty: 0 };
  res.json({
    date, orderCount: orders.length, total, discount, tax, service, expenses, creditOutstanding,
    avg: orders.length ? Math.round(total / orders.length) : 0,
    byMethod, topItems, byHour, openCount,
    alcoholSales: alcohol.amount, alcoholQty: alcohol.qty
  });
});

app.get('/api/reports/daily', (req, res) => {
  const from = req.query.from || new Date().toISOString().slice(0, 10);
  const to = req.query.to || from;
  res.json(db.prepare(`
    SELECT date(closed_at) AS date, COUNT(*) AS orders, SUM(subtotal) AS subtotal,
           SUM(discount) AS discount, SUM(total) AS total
    FROM orders WHERE status='paid' AND date(closed_at) BETWEEN ? AND ?
    GROUP BY date(closed_at) ORDER BY date
  `).all(from, to));
});

app.get('/api/reports/items', (req, res) => {
  const from = req.query.from || new Date().toISOString().slice(0, 10);
  const to = req.query.to || from;
  const alcoholOnly = req.query.alcohol === '1';
  res.json(db.prepare(`
    SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.price*oi.qty) AS amount
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    ${alcoholOnly ? 'JOIN menu_items m ON m.id = oi.item_id' : ''}
    WHERE o.status='paid' AND date(o.closed_at) BETWEEN ? AND ? AND oi.status != 'cancelled'
      ${alcoholOnly ? 'AND m.is_alcohol = 1' : ''}
    GROUP BY oi.name ORDER BY amount DESC
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

app.post('/api/expenses', (req, res) => {
  const { category = '', amount, note = '' } = req.body;
  db.prepare('INSERT INTO expenses (category, amount, note, staff_id) VALUES (?, ?, ?, ?)')
    .run(category, Math.round(Number(amount) || 0), note, req.staff.id);
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
  const r = db.prepare('INSERT INTO staff (name, pin, role) VALUES (?, ?, ?)').run(name, String(pin), role);
  res.json({ id: r.lastInsertRowid });
});

app.patch('/api/staff/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM staff WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const b = req.body;
  db.prepare('UPDATE staff SET name=?, pin=?, role=?, active=? WHERE id=?')
    .run(b.name ?? cur.name, b.pin != null ? String(b.pin) : cur.pin, b.role ?? cur.role, (b.active ?? cur.active) ? 1 : 0, cur.id);
  res.json({ ok: true });
});

/* ---------------- shift / cash drawer ---------------- */
function shiftSummary(shift) {
  if (!shift) return null;
  const args = [shift.opened_at];
  let endSql = '';
  if (shift.closed_at) { endSql = 'AND p.paid_at <= ?'; args.push(shift.closed_at); }
  const byMethod = db.prepare(`
    SELECT p.method, SUM(p.amount) AS amount, COUNT(*) AS count
    FROM payments p JOIN orders o ON o.id = p.order_id
    WHERE p.paid_at >= ? ${endSql} GROUP BY p.method ORDER BY amount DESC
  `).all(...args);
  const cash = byMethod.find(m => m.method === 'cash')?.amount || 0;
  const orders = db.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(total), 0) AS total FROM orders
    WHERE status = 'paid' AND closed_at >= ? ${shift.closed_at ? 'AND closed_at <= ?' : ''}
  `).get(...(shift.closed_at ? [shift.opened_at, shift.closed_at] : [shift.opened_at]));
  return {
    shift, byMethod, cash, orderCount: orders.c, sales: orders.total,
    expectedCash: shift.opening_cash + cash,
    difference: shift.closing_cash != null ? shift.closing_cash - (shift.opening_cash + cash) : null
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
const BACKUP_DIR = path.resolve(process.cwd(), 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

app.get('/api/backup', (req, res) => {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const stamp = localDate();
    res.download(DB_PATH, `pos-backup-${stamp}.db`);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function dailyBackup() {
  try {
    const stamp = localDate();
    const file = path.join(BACKUP_DIR, `pos-${stamp}.db`);
    if (fs.existsSync(file)) return;
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(DB_PATH, file);
  } catch {}
}
dailyBackup();

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
  const methods = o.payments.map(p => `${p.method}: ${moneyText(p.amount)}`).join('  ');
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
  const rows = [`${station === 'bar' ? 'BAR' : 'KITCHEN'} TICKET`, '-'.repeat(42), `#${o.order_no}  ${table || o.type}`, new Date().toLocaleString('en-GB'), '-'.repeat(42)];
  for (const it of o.items) {
    if (it.status === 'cancelled') continue;
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
    const station = req.body?.station === 'bar' ? 'bar' : 'kitchen';
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

/* ---------------- static ---------------- */
const dist = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
  }
  console.log(`POS server: http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Network:  http://${ip}:${PORT}`);
});
