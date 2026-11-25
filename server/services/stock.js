import { db } from '../db.js';
import { roundQty } from '../utils/helpers.js';

export function applyRecipe(itemId, orderId, multiplier) {
  if (!itemId || !multiplier) return;
  const lines = db.prepare('SELECT * FROM recipe_items WHERE menu_item_id = ?').all(itemId);
  for (const l of lines) {
    const q = roundQty(l.qty * multiplier);
    db.prepare('UPDATE inventory_items SET qty = ROUND(qty - ?, 3) WHERE id = ?').run(q, l.inventory_item_id);
    db.prepare(`INSERT INTO stock_moves (item_id, qty, reason, order_id)
      VALUES (?, ?, ?, ?)`).run(l.inventory_item_id, -q, multiplier > 0 ? 'order' : 'order_cancel', orderId);
  }
}
