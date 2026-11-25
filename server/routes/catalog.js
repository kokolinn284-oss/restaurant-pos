import { Router } from 'express';
import crypto from 'node:crypto';
import { db, getSettings, nextOrderNo } from '../db.js';
import { getStations } from '../utils/helpers.js';
import { broadcast } from '../services/sse.js';

export const catalogRouter = Router();

catalogRouter.get('/api/catalog/menu', (req, res) => {
  const settings = getSettings();
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort, id').all();
  const items = db.prepare('SELECT id, category_id, name, price, unit, available, sort, is_alcohol, station, image, code FROM menu_items WHERE available = 1 ORDER BY sort, id').all();
  res.json({
    shop: {
      name: settings.shop_name || 'စည်တော်ကြီး စားသောက်ဆိုင်',
      name_en: settings.shop_name_en || 'Si Daw Gyi Restaurant',
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

catalogRouter.get('/api/catalog/tables', (req, res) => {
  const tables = db.prepare(`
    SELECT t.id, t.name, t.zone, t.seats,
           (SELECT COUNT(*) FROM orders o WHERE o.table_id = t.id AND o.status = 'open') AS is_busy
    FROM tables t ORDER BY t.zone, t.id
  `).all();
  res.json(tables);
});

catalogRouter.post('/api/catalog/order', (req, res) => {
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

catalogRouter.get('/api/catalog/orders', (req, res) => {
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
