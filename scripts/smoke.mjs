import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-smoke-'));
const dataDir = path.join(tmp, 'data');
const backupDir = path.join(tmp, 'backups');
const port = 3800 + Math.floor(Math.random() * 150);
const base = `http://127.0.0.1:${port}`;

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), POS_DATA_DIR: dataDir, POS_BACKUP_DIR: backupDir },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });

const assert = (cond, message) => { if (!cond) throw new Error(message); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`Server did not start.\n${serverLog}`);
}

async function req(p, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const ymd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const login = async (pin) => {
  const r = await req('/api/auth/login', { method: 'POST', body: { pin } });
  assert(r.status === 200 && r.data.token, `login failed for PIN ${pin}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.token;
};

try {
  await waitForServer();

  assert((await req('/api/bootstrap')).status === 401, 'bootstrap must require auth');
  assert((await req('/api/bootstrap', { token: 'forged' })).status === 401, 'forged token must fail');

  const owner = await login('1234');
  const cashier = await login('1111');
  assert((await req('/api/shifts/open', { method: 'POST', token: cashier, body: { opening_cash: 10000 } })).status === 200, 'cashier should open shift');
  const boot = await req('/api/bootstrap', { token: owner });
  assert(boot.status === 200, 'owner bootstrap failed');
  assert(boot.data.tables.length > 0 && boot.data.items.length > 0, 'seed data missing');
  assert(typeof boot.data.lowStockCount === 'number', 'low stock count missing');
  const withImages = boot.data.items.filter(i => i.image);
  assert(withImages.length === boot.data.items.length, `menu images missing: ${boot.data.items.filter(i => !i.image).map(i => i.name).join(', ')}`);
  assert(withImages.every(i => i.image.startsWith('/menu/')), 'menu image path wrong');
  const imgRes = await fetch(base + withImages[0].image);
  assert(imgRes.status === 200 && (imgRes.headers.get('content-type') || '').includes('image/webp'), 'menu image file not served');

  const dbPath = path.join(dataDir, 'pos.db');
  const ro = new DatabaseSync(dbPath, { readOnly: true });
  const pin = ro.prepare("SELECT pin FROM staff WHERE role = 'owner'").get().pin;
  ro.close();
  assert(String(pin).startsWith('scrypt$'), 'PIN is not hashed');

  const table = boot.data.tables.find(t => !t.order_id);
  assert(table, 'no free table');
  const created = await req('/api/orders', {
    method: 'POST', token: owner, body: { type: 'dine_in', tableId: table.id, guests: 2 }
  });
  assert(created.status === 200 && created.data.id, 'order create failed');
  const orderId = created.data.id;

  const item = boot.data.items.find(i => i.available);
  assert(item, 'no available item');
  const added = await req(`/api/orders/${orderId}/items`, {
    method: 'POST', token: owner, body: { itemId: item.id, qty: 2 }
  });
  assert(added.status === 200, 'add item failed');

  const sent = await req(`/api/orders/${orderId}/send-kitchen`, { method: 'POST', token: owner });
  assert(sent.status === 200 && Array.isArray(sent.data.warnings), 'send kitchen failed');

  const beforePay = await req(`/api/orders/${orderId}`, { token: owner });
  const total = beforePay.data.total;
  assert(total > 0, 'order total should be positive');
  const cashPart = Math.floor(total / 2);
  const paid = await req(`/api/orders/${orderId}/pay`, {
    method: 'POST', token: owner,
    body: {
      payments: [
        { method: 'cash', amount: cashPart },
        { method: 'kbzpay', amount: total - cashPart }
      ]
    }
  });
  assert(paid.status === 200, `split payment failed: ${JSON.stringify(paid.data)}`);
  const afterPay = await req(`/api/orders/${orderId}`, { token: owner });
  assert(afterPay.data.status === 'paid', 'order should be paid');
  assert(afterPay.data.payments.length === 2, 'split payment rows missing');

  const date = ymd();
  const history = await req(`/api/orders/history?from=${date}&to=${date}&q=${afterPay.data.order_no}`, { token: owner });
  assert(history.status === 200 && history.data.length === 1, 'order history lookup failed');

  const summary = await req(`/api/reports/summary?date=${date}`, { token: owner });
  assert(summary.data.orderCount === 1, 'report order count wrong');
  assert(typeof summary.data.cost === 'number' && summary.data.cost >= 0, 'report cost missing');
  assert(summary.data.profit === summary.data.netSales - summary.data.cost, 'report profit mismatch');
  const staffReport = await req(`/api/reports/staff?from=${date}&to=${date}`, { token: owner });
  assert(staffReport.status === 200 && staffReport.data.length === 1 && staffReport.data[0].orders === 1, 'staff report failed');
  const dishReport = await req(`/api/reports/items?from=${date}&to=${date}`, { token: owner });
  assert(dishReport.status === 200 && typeof dishReport.data[0].cost === 'number', 'dish cost missing');

  const backup = await fetch(`${base}/api/backup`, { headers: { Authorization: `Bearer ${owner}` } });
  assert(backup.status === 200, 'owner backup failed');

  // table move + merge
  const freeA = boot.data.tables.find(t => !t.order_id);
  const freeB = boot.data.tables.find(t => !t.order_id && t.id !== freeA.id);
  const freeC = boot.data.tables.find(t => !t.order_id && t.id !== freeA.id && t.id !== freeB.id);
  assert(freeA && freeB && freeC, 'need three free tables');
  const billA = await req('/api/orders', { method: 'POST', token: owner, body: { type: 'dine_in', tableId: freeA.id, guests: 2 } });
  const billB = await req('/api/orders', { method: 'POST', token: owner, body: { type: 'dine_in', tableId: freeB.id, guests: 2 } });
  await req(`/api/orders/${billA.data.id}/items`, { method: 'POST', token: owner, body: { itemId: item.id, qty: 1 } });
  await req(`/api/orders/${billB.data.id}/items`, { method: 'POST', token: owner, body: { itemId: item.id, qty: 2 } });
  const moved = await req(`/api/orders/${billA.data.id}/move`, { method: 'POST', token: owner, body: { tableId: freeB.id } });
  assert(moved.status === 400, `move onto busy table must fail: ${moved.status}`);
  const movedOk = await req(`/api/orders/${billA.data.id}/move`, { method: 'POST', token: owner, body: { tableId: freeC.id } });
  assert(movedOk.status === 200, 'move to free table failed');
  const movedTables = (await req('/api/bootstrap', { token: owner })).data.tables;
  assert(movedTables.find(t => t.id === freeC.id)?.order_id === billA.data.id, 'table move not applied');
  const merged = await req(`/api/orders/${billA.data.id}/merge`, { method: 'POST', token: owner, body: { intoId: billB.data.id } });
  assert(merged.status === 200, `merge failed: ${JSON.stringify(merged.data)}`);
  const mergedBill = await req(`/api/orders/${billB.data.id}`, { token: owner });
  assert(mergedBill.data.items.length === 2 && mergedBill.data.total > 0, 'merge did not move items');
  const mergedSource = await req(`/api/orders/${billA.data.id}`, { token: owner });
  assert(mergedSource.data.status === 'void', 'merged source should be void');
  await req(`/api/orders/${billB.data.id}/void`, { method: 'POST', token: owner });

  // cancelling a kitchen-sent item needs a reason and returns stock
  const cancelOrder = await req('/api/orders', { method: 'POST', token: owner, body: { type: 'takeaway' } });
  const cancelAdd = await req(`/api/orders/${cancelOrder.data.id}/items`, { method: 'POST', token: owner, body: { itemId: item.id, qty: 2 } });
  await req(`/api/orders/${cancelOrder.data.id}/send-kitchen`, { method: 'POST', token: owner });
  const noReason = await req(`/api/order-items/${cancelAdd.data.id}`, { method: 'PATCH', token: owner, body: { status: 'cancelled' } });
  assert(noReason.status === 400, 'cancel without reason must fail');
  const cancelled = await req(`/api/order-items/${cancelAdd.data.id}`, {
    method: 'PATCH', token: owner, body: { status: 'cancelled', reason: 'customer changed mind' }
  });
  assert(cancelled.status === 200, 'cancel with reason failed');
  const cancelDetail = await req(`/api/orders/${cancelOrder.data.id}`, { token: owner });
  const cancelledItem = cancelDetail.data.items.find(i => i.id === cancelAdd.data.id);
  assert(cancelledItem.status === 'cancelled' && cancelledItem.cancel_reason === 'customer changed mind', 'cancel reason not saved');
  assert(cancelDetail.data.total === 0, 'cancelled item still in total');
  await req(`/api/orders/${cancelOrder.data.id}/void`, { method: 'POST', token: owner });

  // loyalty points redemption
  const pointCust = boot.data.customers[0];
  await req(`/api/customers/${pointCust.id}`, { method: 'PATCH', token: owner, body: { points: 500 } });
  const pointOrder = await req('/api/orders', { method: 'POST', token: owner, body: { type: 'takeaway' } });
  await req(`/api/orders/${pointOrder.data.id}/items`, { method: 'POST', token: owner, body: { itemId: item.id, qty: 1 } });
  const pointBefore = await req(`/api/orders/${pointOrder.data.id}`, { token: owner });
  const pointPay = await req(`/api/orders/${pointOrder.data.id}/pay`, {
    method: 'POST', token: owner,
    body: { customerId: pointCust.id, pointsUsed: 200, payments: [{ method: 'cash', amount: pointBefore.data.total - 200 }] }
  });
  assert(pointPay.status === 200, `points payment failed: ${JSON.stringify(pointPay.data)}`);
  const pointAfter = await req(`/api/orders/${pointOrder.data.id}`, { token: owner });
  assert(pointAfter.data.points_used === 200 && pointAfter.data.points_amount === 200, 'points usage not recorded');
  assert(pointAfter.data.total === pointBefore.data.total - 200, 'points did not reduce total');
  const custAfter = (await req('/api/bootstrap', { token: owner })).data.customers.find(c => c.id === pointCust.id);
  const earned = Math.floor(pointAfter.data.total / 1000) * Number(boot.data.settings.points_per_1000 || 0);
  assert(custAfter.points === 500 - 200 + earned, `points balance wrong: ${custAfter.points}`);

  const waiter = await login('2222');
  assert((await req('/api/reports/summary', { token: waiter })).status === 403, 'waiter must not read reports');
  assert((await req('/api/settings', { token: waiter })).status === 403, 'waiter must not read settings');
  assert((await req('/api/expenses', { token: waiter })).status === 403, 'waiter must not read expenses');
  assert((await req('/api/expense-categories', { token: waiter })).status === 403, 'waiter must not read expense categories');
  assert((await req('/api/backup', { token: waiter })).status === 403, 'waiter must not download backup');
  assert((await req(`/api/customers/${pointCust.id}`, { method: 'PATCH', token: waiter, body: { points: 99999 } })).status === 403, 'waiter must not edit customer points');
  assert((await req('/api/kitchen', { token: waiter })).status === 200, 'waiter should read kitchen');
  assert((await req('/api/orders', { method: 'POST', token: waiter, body: { type: 'takeaway' } })).status === 200, 'waiter should create orders');

  assert((await req('/api/staff', { token: cashier })).status === 403, 'cashier must not list staff');
  assert((await req('/api/backup', { token: cashier })).status === 403, 'cashier must not download backup');
  const shiftOpen = await req('/api/shifts/current', { token: cashier });
  assert(shiftOpen.status === 200 && shiftOpen.data?.shift, 'shift should be open');

  const shiftBefore = await req('/api/shifts/current', { token: cashier });
  const exp = await req('/api/expenses', {
    method: 'POST', token: cashier,
    body: { category: 'ပစ္စည်းဝယ်ခြင်း', amount: 500, vendor: 'test supplier', method: 'cash', spent_on: date }
  });
  assert(exp.status === 200, `cashier should add expense: ${JSON.stringify(exp.data)}`);
  const expList = await req(`/api/expenses?from=${date}&to=${date}`, { token: cashier });
  assert(expList.status === 200 && expList.data.total === 500 && expList.data.cash === 500, 'expense list totals wrong');
  assert(expList.data.rows.length === 1 && expList.data.rows[0].staff_name, 'expense row staff missing');
  const expId = expList.data.rows[0].id;
  assert((await req(`/api/expenses/${expId}`, { method: 'DELETE', token: cashier })).status === 403, 'cashier must not delete expenses');
  const shiftNow = await req('/api/shifts/current', { token: cashier });
  assert(shiftNow.data.expectedCash === shiftBefore.data.expectedCash - 500, `cash expense must lower expected cash: ${shiftBefore.data.expectedCash} -> ${shiftNow.data.expectedCash}`);

  const withExpense = await req(`/api/reports/summary?date=${date}`, { token: owner });
  assert(withExpense.data.expenses === 500, 'summary expense total wrong');
  assert(withExpense.data.netProfit === withExpense.data.profit - 500, 'summary net profit wrong');
  assert(withExpense.data.expenseByCategory[0]?.amount === 500, 'summary expense by category wrong');
  assert((await req(`/api/expenses/${expId}`, { method: 'DELETE', token: owner })).status === 200, 'owner should delete expense');
  const afterDelete = await req(`/api/expenses?from=${date}&to=${date}`, { token: cashier });
  assert(afterDelete.data.total === 0 && afterDelete.data.rows.length === 0, 'expense delete failed');

  const cats0 = await req('/api/expense-categories', { token: cashier });
  assert(cats0.status === 200 && cats0.data.some(c => c.name === 'လစာ'), 'seed expense categories missing');
  assert((await req('/api/expense-categories', { method: 'POST', token: cashier, body: { name: 'cashier cat' } })).status === 403, 'cashier must not add categories');
  const newCat = await req('/api/expense-categories', { method: 'POST', token: owner, body: { name: 'စမ်းသပ်' } });
  assert(newCat.status === 200 && newCat.data.id, 'owner add category failed');
  assert((await req('/api/expense-categories', { method: 'POST', token: owner, body: { name: 'စမ်းသပ်' } })).status === 409, 'duplicate category must fail');
  const catId = newCat.data.id;
  const catExp = await req('/api/expenses', {
    method: 'POST', token: owner, body: { category: 'စမ်းသပ်', amount: 200, method: 'cash', spent_on: date }
  });
  assert(catExp.status === 200, 'expense with managed category failed');
  const catRow = (await req(`/api/expenses?from=${date}&to=${date}`, { token: owner })).data.rows.find(r => r.category === 'စမ်းသပ်');
  assert(catRow, 'managed category expense missing');
  assert((await req(`/api/expense-categories/${catId}`, { method: 'PATCH', token: owner, body: { name: 'စမ်းသပ်၂' } })).status === 200, 'category rename failed');
  const renamedRows = (await req(`/api/expenses?from=${date}&to=${date}`, { token: owner })).data.rows;
  assert(renamedRows.some(r => r.category === 'စမ်းသပ်၂'), 'rename must update expense rows');
  assert((await req(`/api/expense-categories/${catId}`, { method: 'DELETE', token: owner })).status === 409, 'used category must not delete');
  assert((await req(`/api/expenses/${catRow.id}`, { method: 'DELETE', token: owner })).status === 200, 'delete category expense failed');
  assert((await req(`/api/expense-categories/${catId}`, { method: 'DELETE', token: owner })).status === 200, 'unused category delete failed');
  const autoCat = await req('/api/expenses', {
    method: 'POST', token: owner, body: { category: 'အလိုအလျောက်', amount: 100, spent_on: date }
  });
  assert(autoCat.status === 200, 'auto category expense failed');
  const cats1 = await req('/api/expense-categories', { token: owner });
  const autoRow = cats1.data.find(c => c.name === 'အလိုအလျောက်');
  assert(autoRow, 'expense must auto-register its category');
  const autoExp = (await req(`/api/expenses?from=${date}&to=${date}`, { token: owner })).data.rows.find(r => r.category === 'အလိုအလျောက်');
  await req(`/api/expenses/${autoExp.id}`, { method: 'DELETE', token: owner });
  assert((await req(`/api/expense-categories/${autoRow.id}`, { method: 'DELETE', token: owner })).status === 200, 'auto category cleanup failed');

  const logout = await req('/api/auth/logout', { method: 'POST', token: owner });
  assert(logout.status === 200, 'logout failed');
  assert((await req('/api/bootstrap', { token: owner })).status === 401, 'logout must invalidate session');

  for (let i = 0; i < 10; i++) await req('/api/auth/login', { method: 'POST', body: { pin: '0000' } });
  assert((await req('/api/auth/login', { method: 'POST', body: { pin: '0000' } })).status === 429, 'login rate limit not enforced');

  console.log('SMOKE OK — auth, roles, order flow, split payment, history, backup, profit/staff reports, expenses, categories');
} catch (e) {
  console.error('SMOKE FAILED:', e.message);
  if (serverLog) console.error(serverLog);
  process.exitCode = 1;
} finally {
  server.kill();
  await sleep(400);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
