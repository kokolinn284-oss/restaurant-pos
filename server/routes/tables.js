import { Router } from 'express';
import { db, tableStatus } from '../db.js';
import { normalizeTs } from '../utils/helpers.js';
import { broadcast } from '../services/sse.js';

export const tablesRouter = Router();

tablesRouter.get('/api/reservations', (req, res) => {
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

tablesRouter.post('/api/reservations', (req, res) => {
  const { customer_name, phone = '', party_size = 2, table_id = null, reserved_at, note = '' } = req.body;
  if (!customer_name || !reserved_at) return res.status(400).json({ error: 'အမည်နှင့် အချိန် ထည့်ပါ' });
  const r = db.prepare(`INSERT INTO reservations (customer_name, phone, party_size, table_id, reserved_at, note)
    VALUES (?, ?, ?, ?, ?, ?)`).run(customer_name, phone, Number(party_size) || 1, table_id ? Number(table_id) : null, reserved_at, note);
  broadcast('reservations');
  res.json({ id: r.lastInsertRowid });
});

tablesRouter.patch('/api/reservations/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE reservations SET status = COALESCE(?, status) WHERE id = ?').run(status ?? null, Number(req.params.id));
  broadcast('reservations');
  res.json({ ok: true });
});

tablesRouter.delete('/api/reservations/:id', (req, res) => {
  db.prepare('DELETE FROM reservations WHERE id = ?').run(Number(req.params.id));
  broadcast('reservations');
  res.json({ ok: true });
});

tablesRouter.post('/api/tables', (req, res) => {
  const { name, zone, seats } = req.body;
  if (!name) return res.status(400).json({ error: 'အမည် ထည့်ပါ' });
  const r = db.prepare('INSERT INTO tables (name, zone, seats) VALUES (?, ?, ?)')
    .run(name, zone || '', Number(seats) || 4);
  broadcast('tables');
  res.json({ id: r.lastInsertRowid });
});

tablesRouter.patch('/api/tables/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM tables WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const b = req.body;
  db.prepare('UPDATE tables SET name=?, zone=?, seats=? WHERE id=?')
    .run(b.name ?? cur.name, b.zone ?? cur.zone, Number(b.seats ?? cur.seats), id);
  broadcast('tables');
  res.json({ ok: true });
});

tablesRouter.delete('/api/tables/:id', (req, res) => {
  const open = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE table_id = ? AND status = 'open'").get(Number(req.params.id)).c;
  if (open) return res.status(400).json({ error: 'ဒီစားပွဲမှာ order ဖွင့်ထားပါတယ်' });
  db.prepare('DELETE FROM tables WHERE id = ?').run(Number(req.params.id));
  broadcast('tables');
  res.json({ ok: true });
});

tablesRouter.get('/api/tables', (req, res) => res.json(tableStatus()));

