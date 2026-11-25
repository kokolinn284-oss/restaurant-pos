import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { db, DB_PATH, DATA_DIR, getSettings, setSettings, tableStatus, hashPin } from '../db.js';
import { ymdLocal, getStations, getUnits, resolveStation, readSettingsList, saveSettingsList } from '../utils/helpers.js';
import { broadcast } from '../services/sse.js';
import { buildReceiptText, buildKitchenText, runPrinter } from '../services/printer.js';
import { currentShift } from './finance.js';

export const settingsRouter = Router();

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

settingsRouter.post('/api/upload', (req, res) => {
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

settingsRouter.get('/api/health', (req, res) => res.json({ ok: true }));


settingsRouter.get('/api/bootstrap', (req, res) => {
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
    kitchenCount: db.prepare("SELECT COUNT(*) AS c FROM order_items i JOIN orders o ON o.id = i.order_id AND o.status IN ('open','paid') LEFT JOIN menu_items m ON m.id = i.item_id WHERE i.status = 'cooking' AND COALESCE(m.station, 'kitchen') = 'kitchen'").get().c,
    barCount: db.prepare("SELECT COUNT(*) AS c FROM order_items i JOIN orders o ON o.id = i.order_id AND o.status IN ('open','paid') LEFT JOIN menu_items m ON m.id = i.item_id WHERE i.status = 'cooking' AND m.station = 'bar'").get().c,
    stationCounts: db.prepare(`
      SELECT COALESCE(m.station, 'kitchen') AS station, COUNT(*) AS c
      FROM order_items i
      JOIN orders o ON o.id = i.order_id AND o.status IN ('open','paid')
      LEFT JOIN menu_items m ON m.id = i.item_id
      WHERE i.status = 'cooking'
      GROUP BY COALESCE(m.station, 'kitchen')
    `).all(),
    me: req.staff
  });
});


settingsRouter.get('/api/customers', (req, res) => {
  const q = `%${req.query.q || ''}%`;
  res.json(db.prepare('SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY id DESC LIMIT 100').all(q, q));
});

settingsRouter.post('/api/customers', (req, res) => {
  const { name, phone = '', note = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'အမည် ထည့်ပါ' });
  const r = db.prepare('INSERT INTO customers (name, phone, note) VALUES (?, ?, ?)').run(name, phone, note);
  res.json({ id: r.lastInsertRowid });
});

settingsRouter.patch('/api/customers/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM customers WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const b = req.body;
  db.prepare('UPDATE customers SET name=?, phone=?, points=?, tier=?, note=? WHERE id=?')
    .run(b.name ?? cur.name, b.phone ?? cur.phone, Math.round(Number(b.points ?? cur.points)), b.tier ?? cur.tier, b.note ?? cur.note, cur.id);
  res.json({ ok: true });
});

/* ---------------- staff ---------------- */
settingsRouter.get('/api/staff', (req, res) => res.json(db.prepare('SELECT id, name, role, active FROM staff ORDER BY id').all()));

settingsRouter.post('/api/staff', (req, res) => {
  const { name, pin, role = 'cashier' } = req.body;
  if (!name || !pin) return res.status(400).json({ error: 'အမည်/PIN ထည့်ပါ' });
  const r = db.prepare('INSERT INTO staff (name, pin, role) VALUES (?, ?, ?)').run(name, hashPin(String(pin)), role);
  res.json({ id: r.lastInsertRowid });
});

settingsRouter.patch('/api/staff/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM staff WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const b = req.body;
  db.prepare('UPDATE staff SET name=?, pin=?, role=?, active=? WHERE id=?')
    .run(b.name ?? cur.name, b.pin != null && b.pin !== '' ? hashPin(String(b.pin)) : cur.pin,
      b.role ?? cur.role, (b.active ?? cur.active) ? 1 : 0, cur.id);
  res.json({ ok: true });
});


const BACKUP_DIR = process.env.POS_BACKUP_DIR
  ? path.resolve(process.env.POS_BACKUP_DIR)
  : path.resolve(process.cwd(), 'backups');
const BACKUP_KEEP = 30;
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

settingsRouter.get('/api/backup', (req, res) => {
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


settingsRouter.post('/api/print/receipt/:id', async (req, res) => {
  try {
    await runPrinter(buildReceiptText(Number(req.params.id)));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

settingsRouter.post('/api/print/kitchen/:id', async (req, res) => {
  try {
    const station = resolveStation(req.body?.station) || 'kitchen';
    await runPrinter(buildKitchenText(Number(req.params.id), station));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

settingsRouter.post('/api/print/test', async (req, res) => {
  try {
    const s = getSettings();
    await runPrinter(`${s.shop_name || 'POS'}\nPrinter test OK\n${new Date().toLocaleString('en-GB')}\n\n`);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});


settingsRouter.get('/api/settings', (req, res) => res.json(getSettings()));
settingsRouter.patch('/api/settings', (req, res) => { setSettings(req.body || {}); broadcast('settings'); res.json({ ok: true }); });

/* ---------------- stations & units ---------------- */
settingsRouter.post('/api/stations', (req, res) => {
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

settingsRouter.post('/api/menu-units', (req, res) => {
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

