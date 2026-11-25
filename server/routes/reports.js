import { Router } from 'express';
import { db, getSettings } from '../db.js';
import { ymdLocal } from '../utils/helpers.js';

export const reportsRouter = Router();

reportsRouter.get('/api/reports/summary', (req, res) => {
  const date = req.query.date || ymdLocal();
  const orders = db.prepare("SELECT * FROM orders WHERE status='paid' AND date(closed_at)=?").all(date);
  const ids = orders.map(o => o.id);
  const total = orders.reduce((s, o) => s + o.total, 0);
  const discount = orders.reduce((s, o) => s + o.discount, 0);
  const tax = orders.reduce((s, o) => s + o.tax, 0);
  const service = orders.reduce((s, o) => s + o.service, 0);
  const byMethod = ids.length ? db.prepare(`
    SELECT p.method, COALESCE(m.name, p.method) AS method_name, SUM(p.amount) AS amount, COUNT(*) AS count
    FROM payments p LEFT JOIN payment_methods m ON m.code = p.method
    WHERE p.order_id IN (${ids.map(() => '?').join(',')}) GROUP BY p.method, m.name ORDER BY amount DESC
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
  const expenseDay = "COALESCE(NULLIF(spent_on, ''), date(created_at))";
  const expenses = db.prepare(`SELECT COALESCE(SUM(amount),0) AS amount FROM expenses WHERE ${expenseDay}=?`).get(date).amount;
  const expenseByCategory = db.prepare(`
    SELECT category, SUM(amount) AS amount FROM expenses WHERE ${expenseDay}=?
    GROUP BY category ORDER BY amount DESC
  `).all(date);
  const openCount = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status='open'").get().c;
  const creditOutstanding = db.prepare("SELECT COALESCE(SUM(amount - paid),0) AS amount FROM credits WHERE settled_at IS NULL").get().amount;
  const cost = ids.length ? db.prepare(`
    SELECT COALESCE(SUM(COALESCE(m.cost, 0) * oi.qty), 0) AS cost
    FROM order_items oi LEFT JOIN menu_items m ON m.id = oi.item_id
    WHERE oi.order_id IN (${ids.map(() => '?').join(',')}) AND oi.status != 'cancelled'
  `).get(...ids).cost : 0;
  const netSales = orders.reduce((s, o) => s + o.subtotal - o.discount, 0);
  const profit = netSales - cost;
  const netProfit = profit - expenses;
  const creditPaid = db.prepare("SELECT COALESCE(SUM(amount),0) AS amount FROM credit_payments WHERE date(paid_at)=?").get(date).amount;
  const alcohol = ids.length ? db.prepare(`
    SELECT COALESCE(SUM(oi.price * oi.qty), 0) AS amount, COALESCE(SUM(oi.qty), 0) AS qty
    FROM order_items oi JOIN menu_items m ON m.id = oi.item_id
    WHERE oi.order_id IN (${ids.map(() => '?').join(',')}) AND oi.status != 'cancelled' AND m.is_alcohol = 1
  `).get(...ids) : { amount: 0, qty: 0 };
  const recentOrders = db.prepare(`
    SELECT o.id, o.order_no, o.type, o.status, o.total, o.source, o.opened_at, t.name AS table_name,
           (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id AND i.status != 'cancelled') AS item_count
    FROM orders o LEFT JOIN tables t ON t.id = o.table_id
    ORDER BY o.id DESC LIMIT 8
  `).all();
  const weeklyTrend = db.prepare(`
    SELECT date(closed_at) AS date, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS total
    FROM orders WHERE status='paid' AND date(closed_at) >= date(? , '-6 days') AND date(closed_at) <= ?
    GROUP BY date(closed_at) ORDER BY date(closed_at)
  `).all(date, date);
  const onlineOrderCount = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE source = 'online' AND status = 'open'").get().c;

  res.json({
    date, orderCount: orders.length, total, discount, tax, service, expenses, creditOutstanding,
    netSales, cost, profit, margin: netSales ? Math.round(profit / netSales * 100) : 0,
    netProfit, netMargin: netSales ? Math.round(netProfit / netSales * 100) : 0,
    creditPaid, expenseByCategory,
    avg: orders.length ? Math.round(total / orders.length) : 0,
    byMethod, topItems, byHour, openCount, onlineOrderCount,
    alcoholSales: alcohol.amount, alcoholQty: alcohol.qty,
    recentOrders, weeklyTrend
  });
});

reportsRouter.get('/api/reports/daily', (req, res) => {
  const from = req.query.from || ymdLocal();
  const to = req.query.to || from;
  res.json(db.prepare(`
    SELECT date(closed_at) AS date, COUNT(*) AS orders, SUM(subtotal) AS subtotal,
           SUM(discount) AS discount, SUM(total) AS total
    FROM orders WHERE status='paid' AND date(closed_at) BETWEEN ? AND ?
    GROUP BY date(closed_at) ORDER BY date
  `).all(from, to));
});

reportsRouter.get('/api/reports/items', (req, res) => {
  const from = req.query.from || ymdLocal();
  const to = req.query.to || from;
  const alcoholOnly = req.query.alcohol === '1';
  res.json(db.prepare(`
    SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.price*oi.qty) AS amount,
           COALESCE(SUM(COALESCE(m.cost, 0) * oi.qty), 0) AS cost
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN menu_items m ON m.id = oi.item_id
    WHERE o.status='paid' AND date(o.closed_at) BETWEEN ? AND ? AND oi.status != 'cancelled'
      ${alcoholOnly ? 'AND m.is_alcohol = 1' : ''}
    GROUP BY oi.name ORDER BY amount DESC
  `).all(from, to));
});

reportsRouter.get('/api/reports/staff', (req, res) => {
  const from = req.query.from || ymdLocal();
  const to = req.query.to || from;
  res.json(db.prepare(`
    SELECT COALESCE(s.name, '—') AS name, COUNT(o.id) AS orders, SUM(o.total) AS total
    FROM orders o LEFT JOIN staff s ON s.id = o.staff_id
    WHERE o.status='paid' AND date(o.closed_at) BETWEEN ? AND ?
    GROUP BY o.staff_id ORDER BY total DESC
  `).all(from, to));
});

reportsRouter.get('/api/reports/voids', (req, res) => {
  const from = req.query.from || ymdLocal();
  const to = req.query.to || from;
  const auditLogs = db.prepare(`
    SELECT a.*, COALESCE(NULLIF(a.staff_name, ''), s.name, '—') AS actor_name
    FROM audit_logs a
    LEFT JOIN staff s ON s.id = a.staff_id
    WHERE date(a.created_at) BETWEEN ? AND ?
    ORDER BY a.id DESC
    LIMIT 200
  `).all(from, to);

  const cancelledItems = db.prepare(`
    SELECT oi.id, oi.order_id, oi.name, oi.price, oi.qty, oi.cancel_reason, oi.cancelled_at,
           o.order_no, t.name AS table_name, s.name AS cancelled_by_name
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN tables t ON t.id = o.table_id
    LEFT JOIN staff s ON s.id = oi.cancelled_by
    WHERE oi.status = 'cancelled'
      AND date(COALESCE(NULLIF(oi.cancelled_at, ''), oi.created_at)) BETWEEN ? AND ?
    ORDER BY COALESCE(oi.cancelled_at, oi.created_at) DESC, oi.id DESC
    LIMIT 100
  `).all(from, to);

  const voidedOrders = db.prepare(`
    SELECT o.id, o.order_no, o.type, o.total, o.opened_at, o.closed_at,
           COALESCE(NULLIF(o.void_reason, ''), o.note) AS reason,
           t.name AS table_name, COALESCE(vs.name, s.name, '—') AS staff_name
    FROM orders o
    LEFT JOIN tables t ON t.id = o.table_id
    LEFT JOIN staff vs ON vs.id = o.voided_by
    LEFT JOIN staff s ON s.id = o.staff_id
    WHERE o.status = 'void'
      AND COALESCE(o.note, '') NOT LIKE '%(merged →%'
      AND date(COALESCE(o.closed_at, o.opened_at)) BETWEEN ? AND ?
    ORDER BY o.id DESC
    LIMIT 100
  `).all(from, to);

  const itemCancelAmount = auditLogs.length
    ? auditLogs.filter(a => a.action === 'item_cancel' || a.action === 'qty_reduce').reduce((s, a) => s + (a.amount || 0), 0)
    : cancelledItems.reduce((s, c) => s + Math.round(c.price * c.qty), 0);
  const orderVoidAmount = auditLogs.length
    ? auditLogs.filter(a => a.action === 'order_void' || a.action === 'paid_void').reduce((s, a) => s + (a.amount || 0), 0)
    : voidedOrders.reduce((s, v) => s + (v.total || 0), 0);

  res.json({
    auditLogs,
    cancelledItems,
    voidedOrders,
    summary: {
      itemCancelCount: auditLogs.length
        ? auditLogs.filter(a => a.action === 'item_cancel' || a.action === 'qty_reduce').length
        : cancelledItems.length,
      itemCancelAmount,
      orderVoidCount: auditLogs.length
        ? auditLogs.filter(a => a.action === 'order_void' || a.action === 'paid_void').length
        : voidedOrders.length,
      orderVoidAmount
    }
  });
});

