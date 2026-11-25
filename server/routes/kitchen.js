import { Router } from 'express';
import { db } from '../db.js';

export const kitchenRouter = Router();

kitchenRouter.get('/api/kitchen', (req, res) => {
  const requested = String(req.query.station || '');
  const station = getStations().some(st => st.value === requested) ? requested : 'kitchen';
  res.json(db.prepare(`
    SELECT i.id, i.order_id, i.name, i.qty, i.note, i.status, i.sent_at,
           COALESCE(m.is_alcohol, 0) AS is_alcohol, COALESCE(m.station, 'kitchen') AS station,
           o.order_no, o.type, t.name AS table_name
    FROM order_items i
    JOIN orders o ON o.id = i.order_id AND o.status IN ('open','paid')
    LEFT JOIN tables t ON t.id = o.table_id
    LEFT JOIN menu_items m ON m.id = i.item_id
    WHERE i.status = 'cooking' AND COALESCE(m.station, 'kitchen') = ?
    ORDER BY i.sent_at, i.id
  `).all(station));
});

