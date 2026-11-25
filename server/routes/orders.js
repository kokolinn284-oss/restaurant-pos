import { Router } from 'express';
import { db, getSettings, nextOrderNo, orderTotals, orderWithItems, tableStatus } from '../db.js';
import { ymdLocal, normalizeTs, roundQty, HttpError } from '../utils/helpers.js';
import { broadcast } from '../services/sse.js';
import { applyRecipe } from '../services/stock.js';

export const ordersRouter = Router();

function listOpenOrders() {
  return db.prepare(`
    SELECT o.*, t.name AS table_name,
      (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id AND i.status != 'cancelled') AS item_count
    FROM orders o LEFT JOIN tables t ON t.id = o.table_id
    WHERE o.status = 'open' ORDER BY o.opened_at
  `).all();
}

ordersRouter.get('/api/orders', (req, res) => {
  const { status, date } = req.query;
  if (status === 'open' || !status) return res.json(listOpenOrders());
  let sql = `SELECT o.*, t.name AS table_name FROM orders o LEFT JOIN tables t ON t.id=o.table_id WHERE o.status = ?`;
  const args = [status];
  if (date) { sql += ` AND date(o.opened_at) = ?`; args.push(date); }
  sql += ' ORDER BY o.id DESC LIMIT 300';
  res.json(db.prepare(sql).all(...args));
});

ordersRouter.get('/api/orders/history', (req, res) => {
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

ordersRouter.get('/api/orders/:id', (req, res) => {
  const o = orderWithItems(Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'မတွေ့ပါ' });
  res.json(o);
});

ordersRouter.post('/api/orders', (req, res) => {
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

ordersRouter.patch('/api/orders/:id', (req, res) => {
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

ordersRouter.post('/api/orders/:id/items', (req, res) => {
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

function logAudit({ action, orderId, orderNo = '', tableName = '', itemName = '', qty = 0, amount = 0, reason = '', staff = null }) {
  db.prepare(`INSERT INTO audit_logs (action, order_id, order_no, table_name, item_name, qty, amount, reason, staff_id, staff_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(action, orderId ?? null, String(orderNo || ''), String(tableName || ''), String(itemName || ''),
      Number(qty) || 0, Math.round(Number(amount) || 0), String(reason || '').slice(0, 300),
      staff?.id ?? null, String(staff?.name || ''));
}

ordersRouter.patch('/api/order-items/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM order_items WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const order = db.prepare(`SELECT o.status, o.order_no, t.name AS table_name
    FROM orders o LEFT JOIN tables t ON t.id = o.table_id WHERE o.id = ?`).get(cur.order_id);
  if (!order) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const { qty, note, status, reason } = req.body;
  const statusOnly = status && qty == null && note == null;
  if (!statusOnly && order.status !== 'open') return res.status(400).json({ error: 'Order မဖွင့်ထားပါ' });
  if (status === 'cancelled') {
    if (order.status !== 'open') return res.status(400).json({ error: 'Order မဖွင့်ထားပါ' });
    if (cur.status === 'cancelled') return res.json({ ok: true });
    const why = String(reason || '').trim();
    if (!why) return res.status(400).json({ error: 'ပယ်ဖျက်ရသည့် အကြောင်းပြချက် ထည့်ပါ' });
    db.exec('BEGIN');
    try {
      if (cur.stock_deducted) applyRecipe(cur.item_id, cur.order_id, -cur.qty);
      db.prepare(`UPDATE order_items SET status='cancelled', cancel_reason=?, cancelled_by=?, cancelled_at=datetime('now','localtime'), stock_deducted=0 WHERE id=?`)
        .run(why.slice(0, 300), req.staff?.id ?? null, id);
      logAudit({
        action: 'item_cancel',
        orderId: cur.order_id,
        orderNo: order.order_no,
        tableName: order.table_name || '',
        itemName: cur.name,
        qty: cur.qty,
        amount: Math.round(cur.price * cur.qty),
        reason: why,
        staff: req.staff
      });
      const { subtotal } = orderTotals(cur.order_id);
      db.prepare('UPDATE orders SET subtotal = ?, total = ? WHERE id = ?').run(subtotal, subtotal, cur.order_id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: e.message });
    }
    broadcast('orders', { id: cur.order_id });
    broadcast('kitchen');
    broadcast('inventory');
    return res.json({ ok: true });
  }
  const newQty = qty != null ? Number(qty) : cur.qty;
  if (!(newQty > 0)) return res.status(400).json({ error: 'အရေအတွက် မမှန်ပါ' });
  db.exec('BEGIN');
  try {
    if (cur.stock_deducted && newQty !== cur.qty) applyRecipe(cur.item_id, cur.order_id, newQty - cur.qty);
    if ((cur.status === 'cooking' || cur.status === 'served') && newQty < cur.qty) {
      const diff = cur.qty - newQty;
      logAudit({
        action: 'qty_reduce',
        orderId: cur.order_id,
        orderNo: order.order_no,
        tableName: order.table_name || '',
        itemName: cur.name,
        qty: diff,
        amount: Math.round(cur.price * diff),
        reason: String(reason || note || 'အရေအတွက် လျှော့ချခြင်း'),
        staff: req.staff
      });
    }
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

ordersRouter.delete('/api/order-items/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM order_items WHERE id = ?').get(id);
  if (!cur) return res.json({ ok: true });
  const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(cur.order_id);
  if (!order || order.status !== 'open') return res.status(400).json({ error: 'Order မဖွင့်ထားပါ' });
  if (cur.status === 'cooking' || cur.status === 'served') {
    return res.status(400).json({ error: 'မီးဖိုပို့ပြီး ဟင်းကို အကြောင်းပြချက်ဖြင့် ပယ်ဖျက်ပါ' });
  }
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

ordersRouter.post('/api/orders/:id/split', (req, res) => {
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

ordersRouter.post('/api/orders/:id/move', (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order || order.status !== 'open') return res.status(400).json({ error: 'Order မဖွင့်ထားပါ' });
  const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(Number(req.body.tableId));
  if (!table) return res.status(400).json({ error: 'စားပွဲ မတွေ့ပါ' });
  if (table.id === order.table_id) return res.json({ ok: true, table_id: table.id });
  const conflict = db.prepare("SELECT id FROM orders WHERE table_id = ? AND status = 'open' AND id <> ?").get(table.id, id);
  if (conflict) return res.status(400).json({ error: 'ရွေးထားသော စားပွဲတွင် အော်ဒါ ရှိနေပါသည်' });
  db.prepare("UPDATE orders SET table_id = ?, type = 'dine_in' WHERE id = ?").run(table.id, id);
  broadcast('orders', { id });
  broadcast('tables');
  res.json({ ok: true, table_id: table.id });
});

ordersRouter.post('/api/orders/:id/merge', (req, res) => {
  const id = Number(req.params.id);
  const intoId = Number(req.body.intoId);
  if (!intoId || intoId === id) return res.status(400).json({ error: 'ပေါင်းမည့် ဘီလ် ရွေးပါ' });
  const source = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  const target = db.prepare('SELECT * FROM orders WHERE id = ?').get(intoId);
  if (!source || !target) return res.status(404).json({ error: 'မတွေ့ပါ' });
  if (source.status !== 'open' || target.status !== 'open') return res.status(400).json({ error: 'ဖွင့်ထားသော ဘီလ်များကိုသာ ပေါင်းနိုင်ပါသည်' });
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE order_items SET order_id = ? WHERE order_id = ?').run(intoId, id);
    db.prepare('UPDATE orders SET customer_id = COALESCE(customer_id, ?), guests = guests + ? WHERE id = ?')
      .run(source.customer_id, source.guests, intoId);
    const { subtotal } = orderTotals(intoId);
    db.prepare('UPDATE orders SET subtotal = ?, total = ? WHERE id = ?').run(subtotal, subtotal, intoId);
    db.prepare("UPDATE orders SET status='void', subtotal=0, total=0, note=TRIM(COALESCE(note,'') || ?), closed_at=datetime('now','localtime') WHERE id=?")
      .run(` (merged → #${target.order_no})`, id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'ဘီလ်ပေါင်း မအောင်မြင်ပါ: ' + e.message });
  }
  broadcast('orders', { id: intoId });
  broadcast('tables');
  res.json({ ok: true, id: intoId, order_no: target.order_no });
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

ordersRouter.post('/api/orders/:id/send-kitchen', (req, res) => {
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

ordersRouter.post('/api/orders/:id/confirm', (req, res) => {
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

// HttpError imported from helpers.js

/* Caller must wrap this in a transaction. */
function payOrderTx(order, { discount = 0, customerId = null, promotionId = null, payments = [], pointsUsed = 0, staffId = null, paidAt = null } = {}) {
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
  const baseTotal = taxable + tax + service;

  const custId = customerId ? Number(customerId) : order.customer_id;
  const pointValue = Math.max(0, Math.round(Number(settings.point_value ?? 1)));
  let usedPoints = 0;
  let pointsAmount = 0;
  const requestedPoints = Math.max(0, Math.round(Number(pointsUsed) || 0));
  if (requestedPoints > 0) {
    if (!custId) throw new HttpError(400, 'အမှတ်သုံးရန် အဖွဲ့ဝင် ရွေးပါ');
    if (pointValue <= 0) throw new HttpError(400, 'အမှတ် လဲလှယ်နှုန်း သတ်မှတ်ထားခြင်း မရှိပါ');
    const cust = db.prepare('SELECT points FROM customers WHERE id = ?').get(custId);
    if (!cust) throw new HttpError(400, 'အဖွဲ့ဝင် မတွေ့ပါ');
    if (requestedPoints > cust.points) throw new HttpError(400, 'အမှတ် မလုံလောက်ပါ');
    usedPoints = Math.min(requestedPoints, Math.floor(baseTotal / pointValue));
    pointsAmount = usedPoints * pointValue;
  }
  const total = baseTotal - pointsAmount;

  const paid = payments.reduce((s, p) => s + Math.round(Number(p.amount) || 0), 0);
  if (paid < total) throw new HttpError(400, `ငွေမလုံလောက်ပါ (လိုသေးသည် ${total - paid} ကျပ်)`);
  const creditAmount = payments.filter(p => p.method === 'credit').reduce((s, p) => s + Math.round(Number(p.amount) || 0), 0);
  if (creditAmount > 0 && !custId) throw new HttpError(400, 'အကြွေးအတွက် အဖွဲ့ဝင် ရွေးချယ်ပါ');

  const insPay = db.prepare(`INSERT INTO payments (order_id, method, amount, ref, staff_id, paid_at)
    VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')))`);
  for (const p of payments) {
    insPay.run(order.id, p.method || 'cash', Math.round(Number(p.amount) || 0), p.ref || '', staffId, paidAt);
  }
  db.prepare(`UPDATE orders SET status='paid', subtotal=?, discount=?, tax=?, service=?, total=?, customer_id=COALESCE(?, customer_id), promotion_id=?, points_used=?, points_amount=?, closed_at=COALESCE(?, datetime('now','localtime')) WHERE id=?`)
    .run(subtotal, disc, tax, service, total, customerId ? Number(customerId) : null, promotionId ? Number(promotionId) : null, usedPoints, pointsAmount, paidAt, order.id);
  if (creditAmount > 0) {
    db.prepare('INSERT INTO credits (customer_id, order_id, amount, note) VALUES (?, ?, ?, ?)')
      .run(custId, order.id, creditAmount, `Order ${order.order_no}`);
  }
  const ptsPer1000 = Number(settings.points_per_1000 || 0);
  if (custId) {
    const earned = ptsPer1000 > 0 ? Math.floor(total / 1000) * ptsPer1000 : 0;
    if (earned || usedPoints) {
      db.prepare('UPDATE customers SET points = points - ? + ? WHERE id = ?').run(usedPoints, earned, custId);
    }
  }
  return { subtotal, discount: disc, tax, service, total, pointsUsed: usedPoints, pointsAmount };
}

ordersRouter.post('/api/orders/:id/pay', (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order || order.status !== 'open') return res.status(400).json({ error: 'Order မဖွင့်ထားပါ' });
  if (!db.prepare('SELECT id FROM shifts WHERE closed_at IS NULL LIMIT 1').get()) {
    return res.status(400).json({ error: 'ဆိုင်မဖွင့်ရသေးပါ — ငွေရှင်းမီ ဆိုင်ဖွင့်ပါ' });
  }
  const payments = Array.isArray(req.body.payments) ? req.body.payments : [];

  db.exec('BEGIN');
  try {
    const result = payOrderTx(order, {
      discount: req.body.discount,
      customerId: req.body.customerId,
      promotionId: req.body.promotionId,
      pointsUsed: req.body.pointsUsed,
      payments,
      staffId: req.staff.id
    });
    db.exec('COMMIT');
    broadcast('orders', { id });
    broadcast('tables');
    res.json({ ok: true, total: result.total, subtotal: result.subtotal, discount: result.discount, tax: result.tax, service: result.service, pointsUsed: result.pointsUsed, pointsAmount: result.pointsAmount });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(e.status || 500).json({ error: e.status ? e.message : 'ငွေရှင်း မအောင်မြင်ပါ: ' + e.message });
  }
});

/* Offline queue: apply a whole draft (order + items + optional payment) once. */
ordersRouter.post('/api/sync/order', (req, res) => {
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

ordersRouter.post('/api/orders/:id/void', (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare(`SELECT o.*, t.name AS table_name
    FROM orders o LEFT JOIN tables t ON t.id = o.table_id WHERE o.id = ?`).get(id);
  if (!order) return res.status(404).json({ error: 'မတွေ့ပါ' });
  if (order.status === 'void') return res.json({ ok: true });
  if (order.status === 'paid' && req.staff?.role !== 'owner') {
    return res.status(403).json({ error: 'ငွေရှင်းပြီးသား ဘီလ်ကို ဆိုင်ရှင်သာ ပယ်ဖျက်နိုင်ပါသည်' });
  }
  const activeItems = db.prepare("SELECT * FROM order_items WHERE order_id = ? AND status != 'cancelled'").all(id);
  const reason = String(req.body?.reason || '').trim();
  if (activeItems.length > 0 && !reason) {
    return res.status(400).json({ error: 'ဘီလ်ပယ်ဖျက်ရသည့် အကြောင်းပြချက် ထည့်ပါ' });
  }
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? AND stock_deducted = 1').all(id);
  const activeTotal = activeItems.reduce((s, it) => s + Math.round(it.price * it.qty), 0);
  db.exec('BEGIN');
  try {
    for (const it of items) applyRecipe(it.item_id, id, -it.qty);
    db.prepare('UPDATE order_items SET stock_deducted = 0 WHERE order_id = ?').run(id);
    db.prepare("UPDATE orders SET status='void', void_reason=?, voided_by=?, closed_at=datetime('now','localtime') WHERE id=?")
      .run(reason.slice(0, 300), req.staff?.id ?? null, id);
    if (activeItems.length > 0 || order.total > 0) {
      logAudit({
        action: order.status === 'paid' ? 'paid_void' : 'order_void',
        orderId: id,
        orderNo: order.order_no,
        tableName: order.table_name || '',
        itemName: `${activeItems.length} မျိုး`,
        qty: activeItems.length,
        amount: order.total || activeTotal,
        reason: reason || 'ဘီလ်ပယ်ဖျက်ခြင်း',
        staff: req.staff
      });
    }
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

