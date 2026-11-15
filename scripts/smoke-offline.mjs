import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-sync-'));
const port = 3950 + Math.floor(Math.random() * 40);
const base = `http://127.0.0.1:${port}`;

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), POS_DATA_DIR: path.join(tmp, 'data'), POS_BACKUP_DIR: path.join(tmp, 'backups') },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });

const assert = (cond, message) => { if (!cond) throw new Error(message); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));async function waitForServer() {
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

const login = async (pin) => {
  const r = await req('/api/auth/login', { method: 'POST', body: { pin } });
  assert(r.status === 200 && r.data.token, `login failed for ${pin}: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
};

const ymd = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function draftFor({ staffId, tableId, items, discount = 0, paid, clientRef, openedAt, paidAt }) {
  return {
    clientRef,
    type: 'dine_in',
    tableId,
    guests: 2,
    note: 'offline smoke',
    openedAt,
    staffId,
    items,
    paid: paid ? { discount, payments: paid, paidAt } : null
  };
}

try {
  await waitForServer();
  const owner = await login('1234');
  const boot = await req('/api/bootstrap', { token: owner.token });
  assert(boot.status === 200, 'bootstrap failed');
  const settings = boot.data.settings;
  const taxRate = Number(settings.tax_rate || 0);
  const serviceRate = Number(settings.service_rate || 0);
  const table = boot.data.tables.find(t => !t.order_id);
  const menu = boot.data.items.filter(i => i.available && !i.is_alcohol).slice(0, 2);
  assert(table && menu.length === 2, 'seed data missing');

  const mods = [{ name: 'အစပ်လျှော့', price: 500 }];
  const subtotal = Math.round((menu[0].price + 500) * 2) + Math.round(menu[1].price * 1);
  const discount = 1000;
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * taxRate / 100);
  const service = Math.round(taxable * serviceRate / 100);
  const total = taxable + tax + service;
  const clientRef = `smoke_${Date.now()}_paid`;
  const openedAt = '2026-01-02T10:15';
  const paidAt = '2026-01-02T10:20';

  const body = draftFor({
    staffId: boot.data.me.id,
    tableId: table.id,
    clientRef,
    openedAt,
    paidAt,
    discount,
    items: [
      { itemId: menu[0].id, name: menu[0].name, price: menu[0].price, qty: 2, note: 'less spicy', status: 'new', modifiers: mods },
      { itemId: menu[1].id, name: menu[1].name, price: menu[1].price, qty: 1, note: '', status: 'cooking', sentAt: openedAt, modifiers: [] }
    ],
    paid: [{ method: 'cash', amount: total }]
  });

  const synced = await req('/api/sync/order', { method: 'POST', token: owner.token, body });
  assert(synced.status === 200, `sync failed: ${synced.status} ${JSON.stringify(synced.data)}`);
  assert(synced.data.duplicate === false && synced.data.status === 'paid', 'paid draft not created');
  assert(synced.data.total === total, `server total ${synced.data.total} != ${total}`);

  const order = await req(`/api/orders/${synced.data.id}`, { token: owner.token });
  assert(order.status === 200, 'created order missing');
  assert(order.data.items.length === 2, 'items missing');
  assert(order.data.items[0].modifiers.length === 1 && order.data.items[0].note === 'less spicy', 'modifiers/note missing');
  assert(order.data.opened_at === '2026-01-02 10:15:00', `offline opened_at not kept: ${order.data.opened_at}`);
  assert(String(order.data.closed_at).startsWith('2026-01-02 10:20:00'), `offline paid_at not kept: ${order.data.closed_at}`);
  assert(order.data.payments.length === 1 && order.data.payments[0].amount === total, 'payment row missing');
  assert(order.data.client_ref === clientRef, 'client ref not stored');
  assert(order.data.discount === discount && order.data.tax === tax && order.data.service === service, 'totals mismatch');

  const retry = await req('/api/sync/order', { method: 'POST', token: owner.token, body });
  assert(retry.status === 200 && retry.data.duplicate === true && retry.data.id === synced.data.id, 'retry not idempotent');

  const history = await req(`/api/orders/history?from=2026-01-02&to=2026-01-02&q=${order.data.order_no}`, { token: owner.token });
  assert(history.data.length === 1, 'duplicate order created on retry');

  const cashier = await login('1111');
  const openRef = `smoke_${Date.now()}_open`;
  const openDraft = draftFor({
    staffId: boot.data.me.id,
    tableId: null,
    clientRef: openRef,
    openedAt: '2026-01-02T11:00',
    items: [{ itemId: menu[0].id, name: menu[0].name, price: menu[0].price, qty: 1, status: 'cooking', sentAt: '2026-01-02T11:00' }]
  });
  const openSync = await req('/api/sync/order', { method: 'POST', token: cashier.token, body: openDraft });
  assert(openSync.status === 200 && openSync.data.status === 'open', `open draft sync failed: ${JSON.stringify(openSync.data)}`);
  const kitchen = await req('/api/kitchen', { token: cashier.token });
  assert(kitchen.data.some(i => i.order_id === openSync.data.id), 'sync did not send cooking items to kitchen');

  const waiter = await login('2222');
  const waiterBody = draftFor({
    staffId: boot.data.me.id,
    tableId: null,
    clientRef: `smoke_${Date.now()}_waiter`,
    openedAt: '2026-01-02T11:30',
    items: [{ itemId: menu[0].id, name: menu[0].name, price: menu[0].price, qty: 1, status: 'new' }],
    paid: [{ method: 'cash', amount: 1000 }]
  });
  const denied = await req('/api/sync/order', { method: 'POST', token: waiter.token, body: waiterBody });
  assert(denied.status === 403, `waiter paid sync should be denied, got ${denied.status}`);

  const badRef = await req('/api/sync/order', {
    method: 'POST', token: owner.token,
    body: { ...body, clientRef: 'bad ref!', paid: null, items: body.items }
  });
  assert(badRef.status === 400, 'invalid client ref should be rejected');

  const empty = await req('/api/sync/order', {
    method: 'POST', token: owner.token,
    body: draftFor({ staffId: boot.data.me.id, tableId: null, clientRef: `smoke_${Date.now()}_empty`, items: [] })
  });
  assert(empty.status === 400, 'empty draft should be rejected');

  console.log('SYNC OK — offline draft create, items/modifiers, offline timestamps, idempotent retry, role guard, validation');
} finally {
  server.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 300));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
