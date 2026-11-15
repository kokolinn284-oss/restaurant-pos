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
  const boot = await req('/api/bootstrap', { token: owner });
  assert(boot.status === 200, 'owner bootstrap failed');
  assert(boot.data.tables.length > 0 && boot.data.items.length > 0, 'seed data missing');

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

  const backup = await fetch(`${base}/api/backup`, { headers: { Authorization: `Bearer ${owner}` } });
  assert(backup.status === 200, 'owner backup failed');

  const waiter = await login('2222');
  assert((await req('/api/reports/summary', { token: waiter })).status === 403, 'waiter must not read reports');
  assert((await req('/api/settings', { token: waiter })).status === 403, 'waiter must not read settings');
  assert((await req('/api/backup', { token: waiter })).status === 403, 'waiter must not download backup');
  assert((await req('/api/orders', { method: 'POST', token: waiter, body: { type: 'takeaway' } })).status === 200, 'waiter should create orders');

  const cashier = await login('1111');
  assert((await req('/api/staff', { token: cashier })).status === 403, 'cashier must not list staff');
  assert((await req('/api/backup', { token: cashier })).status === 403, 'cashier must not download backup');
  assert((await req('/api/shifts/open', { method: 'POST', token: cashier, body: { opening_cash: 10000 } })).status === 200, 'cashier should open shift');

  const logout = await req('/api/auth/logout', { method: 'POST', token: owner });
  assert(logout.status === 200, 'logout failed');
  assert((await req('/api/bootstrap', { token: owner })).status === 401, 'logout must invalidate session');

  for (let i = 0; i < 10; i++) await req('/api/auth/login', { method: 'POST', body: { pin: '0000' } });
  assert((await req('/api/auth/login', { method: 'POST', body: { pin: '0000' } })).status === 429, 'login rate limit not enforced');

  console.log('SMOKE OK — auth, roles, order flow, split payment, history, backup');
} catch (e) {
  console.error('SMOKE FAILED:', e.message);
  if (serverLog) console.error(serverLog);
  process.exitCode = 1;
} finally {
  server.kill();
  await sleep(400);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
