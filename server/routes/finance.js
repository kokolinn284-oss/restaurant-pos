import { Router } from 'express';
import { db, getSettings } from '../db.js';
import { ymdLocal, normalizeTs } from '../utils/helpers.js';
import { broadcast } from '../services/sse.js';

export const financeRouter = Router();

financeRouter.get('/api/credits', (req, res) => {
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

financeRouter.post('/api/credits/:id/pay', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM credits WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  if (cur.settled_at) return res.status(400).json({ error: 'အကြွေး ရှင်းပြီးသားပါ' });
  const remaining = cur.amount - cur.paid;
  const amount = Math.min(remaining, Math.max(0, Math.round(Number(req.body.amount) || 0)));
  if (amount <= 0) return res.status(400).json({ error: 'ဖြတ်မည့်ငွေ ထည့်ပါ' });
  const method = String(req.body.method || 'cash');
  const paid = cur.paid + amount;
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE credits SET paid = ?, settled_at = ${paid >= cur.amount ? "datetime('now','localtime')" : 'NULL'} WHERE id = ?`).run(paid, id);
    db.prepare('INSERT INTO credit_payments (credit_id, amount, method, staff_id) VALUES (?, ?, ?, ?)')
      .run(id, amount, method, req.staff?.id ?? null);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: 'အကြွေး ဖြတ်ခြင်း မအောင်မြင်ပါ' });
  }
  broadcast('credits');
  broadcast('shifts');
  res.json({ ok: true, paid, settled: paid >= cur.amount });
});


financeRouter.get('/api/expense-categories', (req, res) => {
  res.json(db.prepare(`
    SELECT c.id, c.name, COUNT(e.id) AS count, COALESCE(SUM(e.amount), 0) AS amount
    FROM expense_categories c LEFT JOIN expenses e ON e.category = c.name
    GROUP BY c.id ORDER BY c.id
  `).all());
});

financeRouter.post('/api/expense-categories', (req, res) => {
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

financeRouter.patch('/api/expense-categories/:id', (req, res) => {
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

financeRouter.delete('/api/expense-categories/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'အမျိုးအစား မတွေ့ပါ' });
  const used = db.prepare('SELECT COUNT(*) AS c FROM expenses WHERE category = ?').get(cur.name).c;
  if (used) return res.status(409).json({ error: `ဤအမျိုးအစားကို မှတ်တမ်း ${used} ခု အသုံးပြုနေပါသည် — ဖျက်မရပါ` });
  db.prepare('DELETE FROM expense_categories WHERE id = ?').run(cur.id);
  broadcast('expenses');
  res.json({ ok: true });
});

financeRouter.get('/api/expenses', (req, res) => {
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

financeRouter.post('/api/expenses', (req, res) => {
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

financeRouter.delete('/api/expenses/:id', (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(Number(req.params.id));
  broadcast('expenses');
  res.json({ ok: true });
});

/* ---------------- payment methods (ငွေချေမျိုးအစားများ) ---------------- */
financeRouter.get('/api/payment-methods', (req, res) => {
  res.json(db.prepare(`
    SELECT m.id, m.code, m.name, m.sort,
           (SELECT COUNT(*) FROM payments p WHERE p.method = m.code) AS count,
           (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.method = m.code) AS amount
    FROM payment_methods m ORDER BY m.sort, m.id
  `).all());
});

financeRouter.post('/api/payment-methods', (req, res) => {
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

financeRouter.patch('/api/payment-methods/:id', (req, res) => {
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

financeRouter.delete('/api/payment-methods/:id', (req, res) => {
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


export function shiftSummary(shift) {
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
  const creditArgs = [shift.opened_at];
  if (shift.closed_at) creditArgs.push(shift.closed_at);
  const creditByMethod = db.prepare(`
    SELECT cp.method, COALESCE(m.name, cp.method) AS method_name, SUM(cp.amount) AS amount, COUNT(*) AS count
    FROM credit_payments cp LEFT JOIN payment_methods m ON m.code = cp.method
    WHERE cp.paid_at >= ? ${shift.closed_at ? 'AND cp.paid_at <= ?' : ''}
    GROUP BY cp.method, m.name ORDER BY amount DESC
  `).all(...creditArgs);
  const creditCash = creditByMethod.find(m => m.method === 'cash')?.amount || 0;
  const creditTotal = creditByMethod.reduce((s, m) => s + m.amount, 0);
  const expectedCash = shift.opening_cash + cash + creditCash - expenseCash;
  return {
    shift, byMethod, cash, expenseCash, creditByMethod, creditCash, creditTotal,
    orderCount: orders.c, sales: orders.total,
    expectedCash,
    difference: shift.closing_cash != null ? shift.closing_cash - expectedCash : null
  };
}

export function currentShift() {
  const shift = db.prepare('SELECT * FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1').get();
  return shiftSummary(shift);
}

financeRouter.get('/api/shifts/current', (req, res) => res.json(currentShift()));

financeRouter.get('/api/shifts', (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, st.name AS staff_name FROM shifts s
    LEFT JOIN staff st ON st.id = s.staff_id
    ORDER BY s.id DESC LIMIT 30
  `).all();
  res.json(rows.map(s => ({ ...shiftSummary(s), staff_name: s.staff_name })));
});

financeRouter.post('/api/shifts/open', (req, res) => {
  const open = db.prepare('SELECT id FROM shifts WHERE closed_at IS NULL LIMIT 1').get();
  if (open) return res.status(400).json({ error: 'ဆိုင် ဖွင့်ထားပြီးသားပါ' });
  const r = db.prepare('INSERT INTO shifts (staff_id, opening_cash) VALUES (?, ?)')
    .run(req.staff.id, Math.round(Number(req.body.opening_cash) || 0));
  broadcast('shifts');
  res.json({ id: r.lastInsertRowid });
});

financeRouter.post('/api/shifts/close', (req, res) => {
  const shift = db.prepare('SELECT * FROM shifts WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1').get();
  if (!shift) return res.status(400).json({ error: 'ဖွင့်ထားသော ဆိုင် မရှိပါ' });
  const closing = Math.round(Number(req.body.closing_cash) || 0);
  db.prepare("UPDATE shifts SET closed_at = datetime('now','localtime'), closing_cash = ?, note = ? WHERE id = ?")
    .run(closing, req.body.note || '', shift.id);
  const summary = shiftSummary(db.prepare('SELECT * FROM shifts WHERE id = ?').get(shift.id));
  broadcast('shifts');
  res.json(summary);
});

