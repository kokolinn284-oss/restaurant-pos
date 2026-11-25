import { Router } from 'express';
import { db } from '../db.js';
import { roundQty } from '../utils/helpers.js';
import { broadcast } from '../services/sse.js';
import { applyRecipe } from '../services/stock.js';

export const menuRouter = Router();

menuRouter.post('/api/categories', (req, res) => {
  const { name, sort } = req.body;
  if (!name) return res.status(400).json({ error: 'အမည် ထည့်ပါ' });
  const r = db.prepare('INSERT INTO categories (name, sort) VALUES (?, ?)').run(name, Number(sort) || 0);
  broadcast('menu');
  res.json({ id: r.lastInsertRowid });
});

menuRouter.patch('/api/categories/:id', (req, res) => {
  const { name, sort } = req.body;
  db.prepare('UPDATE categories SET name = COALESCE(?, name), sort = COALESCE(?, sort) WHERE id = ?')
    .run(name ?? null, sort ?? null, Number(req.params.id));
  broadcast('menu');
  res.json({ ok: true });
});

menuRouter.delete('/api/categories/:id', (req, res) => {
  const used = db.prepare('SELECT COUNT(*) AS c FROM menu_items WHERE category_id = ?').get(Number(req.params.id)).c;
  if (used) return res.status(400).json({ error: 'ဒီအမျိုးအစားမှာ ဟင်းတွေ ရှိနေပါတယ်' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(Number(req.params.id));
  broadcast('menu');
  res.json({ ok: true });
});

/* ---------------- menu items ---------------- */
menuRouter.post('/api/items', (req, res) => {
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

menuRouter.patch('/api/items/:id', (req, res) => {
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

menuRouter.post('/api/items/bulk-delete', (req, res) => {
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

menuRouter.post('/api/items/bulk-status', (req, res) => {
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

menuRouter.post('/api/items/bulk-category', (req, res) => {
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

menuRouter.post('/api/items/bulk-import', (req, res) => {
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

menuRouter.delete('/api/items/:id', (req, res) => {
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

menuRouter.get('/api/promotions', (req, res) => res.json(db.prepare('SELECT * FROM promotions ORDER BY active DESC, id').all()));

menuRouter.post('/api/promotions', (req, res) => {
  const { name, type = 'percent', value = 0, min_subtotal = 0, start_time = '', end_time = '', active = 1 } = req.body;
  if (!name) return res.status(400).json({ error: 'အမည် ထည့်ပါ' });
  const r = db.prepare(`INSERT INTO promotions (name, type, value, min_subtotal, start_time, end_time, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(name, type, Math.round(Number(value) || 0), Math.round(Number(min_subtotal) || 0), start_time, end_time, active ? 1 : 0);
  broadcast('promotions');
  res.json({ id: r.lastInsertRowid });
});

menuRouter.patch('/api/promotions/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM promotions WHERE id = ?').get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const b = req.body;
  db.prepare(`UPDATE promotions SET name=?, type=?, value=?, min_subtotal=?, start_time=?, end_time=?, active=? WHERE id=?`)
    .run(b.name ?? cur.name, b.type ?? cur.type, Math.round(Number(b.value ?? cur.value)), Math.round(Number(b.min_subtotal ?? cur.min_subtotal)),
      b.start_time ?? cur.start_time, b.end_time ?? cur.end_time, (b.active ?? cur.active) ? 1 : 0, cur.id);
  broadcast('promotions');
  res.json({ ok: true });
});

menuRouter.delete('/api/promotions/:id', (req, res) => {
  db.prepare('DELETE FROM promotions WHERE id = ?').run(Number(req.params.id));
  broadcast('promotions');
  res.json({ ok: true });
});


menuRouter.get('/api/recipes/:itemId', (req, res) => {
  res.json(db.prepare(`
    SELECT r.*, i.name AS inv_name, i.unit, i.qty AS stock
    FROM recipe_items r JOIN inventory_items i ON i.id = r.inventory_item_id
    WHERE r.menu_item_id = ? ORDER BY r.id
  `).all(Number(req.params.itemId)));
});

menuRouter.put('/api/recipes/:itemId', (req, res) => {
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
