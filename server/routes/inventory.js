import { Router } from 'express';
import { db } from '../db.js';
import { roundQty } from '../utils/helpers.js';
import { broadcast } from '../services/sse.js';

export const inventoryRouter = Router();

inventoryRouter.get('/api/inventory', (req, res) => {
  const items = db.prepare('SELECT * FROM inventory_items ORDER BY name').all();
  const moves = db.prepare('SELECT * FROM stock_moves ORDER BY id DESC LIMIT 100').all();
  const expenses = db.prepare('SELECT * FROM expenses ORDER BY id DESC LIMIT 50').all();
  res.json({ items, moves, expenses });
});

inventoryRouter.post('/api/inventory', (req, res) => {
  const { name, unit, qty, reorder_level, cost } = req.body;
  if (!name) return res.status(400).json({ error: 'အမည် ထည့်ပါ' });
  const r = db.prepare('INSERT INTO inventory_items (name, unit, qty, reorder_level, cost) VALUES (?, ?, ?, ?, ?)')
    .run(name, unit || '', roundQty(qty), Number(reorder_level) || 0, Math.round(Number(cost) || 0));
  broadcast('inventory');
  res.json({ id: r.lastInsertRowid });
});

inventoryRouter.post('/api/inventory/:id/move', (req, res) => {
  const id = Number(req.params.id);
  const { type, qty, note = '' } = req.body;
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const q = roundQty(qty);
  const delta = type === 'in' ? q : type === 'out' ? -q : q;
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE inventory_items SET qty = ROUND(qty + ?, 3) WHERE id = ?').run(delta, id);
    db.prepare('INSERT INTO stock_moves (item_id, type, qty, note, staff_id) VALUES (?, ?, ?, ?, ?)')
      .run(id, type || 'adjust', q, note, req.staff.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ error: e.message }); }
  broadcast('inventory');
  res.json({ ok: true });
});

inventoryRouter.patch('/api/inventory/:id', (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'မတွေ့ပါ' });
  const b = req.body;
  db.prepare(`UPDATE inventory_items SET name=?, unit=?, qty=?, reorder_level=?, cost=?, sku=?, category=? WHERE id=?`)
    .run(
      b.name ?? cur.name,
      b.unit ?? cur.unit,
      roundQty(b.qty ?? cur.qty),
      Number(b.reorder_level ?? cur.reorder_level) || 0,
      Math.round(Number(b.cost ?? cur.cost) || 0),
      b.sku ?? cur.sku ?? '',
      b.category ?? cur.category ?? '',
      id
    );
  broadcast('inventory');
  res.json({ ok: true });
});

inventoryRouter.delete('/api/inventory/:id', (req, res) => {
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

inventoryRouter.post('/api/inventory/bulk-delete', (req, res) => {
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

inventoryRouter.post('/api/inventory/bulk-move', (req, res) => {
  const { ids, type, qty, note = '' } = req.body || {};
  if (!Array.isArray(ids) || !ids.length || !qty) return res.status(400).json({ error: 'အချက်အလက် မပြည့်စုံပါ' });
  const q = roundQty(qty);
  const delta = type === 'in' ? q : type === 'out' ? -q : q;
  db.exec('BEGIN');
  try {
    const updateQty = db.prepare('UPDATE inventory_items SET qty = MAX(0, ROUND(qty + ?, 3)) WHERE id = ?');
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

inventoryRouter.post('/api/inventory/bulk-import', (req, res) => {
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
      const qty = roundQty(it.qty);
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

