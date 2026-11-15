import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-ui-offline-'));
const port = 3120 + Math.floor(Math.random() * 40);
const base = `http://127.0.0.1:${port}`;
const shots = path.join(root, 'scripts', 'inspection_screenshots');
fs.mkdirSync(shots, { recursive: true });

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), POS_DATA_DIR: path.join(tmp, 'data'), POS_BACKUP_DIR: path.join(tmp, 'backups') },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });

const assert = (cond, message) => { if (!cond) throw new Error(message); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error(`Server did not start.\n${serverLog}`);
}

const ymd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('.login-card', { timeout: 10000 });
  for (const d of '1234') {
    await page.click(`.keypad button:has-text("${d}")`);
    await page.waitForTimeout(45);
  }
  await page.waitForSelector('.table-grid', { timeout: 15000 });
  await page.waitForTimeout(500);

  await context.setOffline(true);
  await sleep(300);

  await page.locator('.table-card').first().click();
  await page.waitForSelector('.order-screen', { timeout: 10000 });
  await page.waitForSelector('.item-card', { timeout: 10000 });

  await page.locator('.item-card').first().click();
  await page.waitForTimeout(120);
  await page.locator('.item-card').first().click();
  await page.waitForTimeout(250);

  const localOrderNo = await page.locator('.cart-head .order-tag').first().innerText();
  assert(localOrderNo.includes('OFF-'), `expected local order tag, got: ${localOrderNo}`);
  await page.screenshot({ path: path.join(shots, 'offline_01_order.png'), fullPage: false });

  await page.locator('[data-action="pay"]').click();
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.screenshot({ path: path.join(shots, 'offline_02_pay.png'), fullPage: false });
  await page.locator('.modal-foot .btn:not(.ghost)').click();
  await page.waitForSelector('.receipt-sheet', { timeout: 8000 });
  await page.screenshot({ path: path.join(shots, 'offline_03_receipt.png'), fullPage: false });

  const draft = await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('pos_offline_drafts_v1') || '[]');
    return list.find(d => d.status === 'paid') || null;
  });
  assert(draft, 'paid offline draft missing');
  assert(draft.items.length === 1 && draft.items[0].qty === 2, `unexpected local items: ${JSON.stringify(draft.items)}`);
  assert(draft.total > 0 && draft.payments.length === 1, 'local totals/payments missing');
  const offlineTotal = draft.total;

  await page.locator('.modal-foot .btn.ghost').first().click();
  await page.waitForTimeout(300);

  await context.setOffline(false);
  for (let i = 0; i < 80; i++) {
    const left = await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('pos_offline_drafts_v1') || '[]');
      return list.filter(d => d.status === 'paid').length;
    });
    if (left === 0) break;
    await sleep(250);
  }

  const synced = await page.evaluate(async ({ baseUrl }) => {
    const auth = JSON.parse(localStorage.getItem('pos_auth'));
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const r = await fetch(`${baseUrl}/api/orders/history?from=${day}&to=${day}`, {
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    return r.json();
  }, { baseUrl: base });

  assert(Array.isArray(synced) && synced.length >= 1, 'synced order not found on server');
  const order = synced.find(o => o.status === 'paid' && o.total === offlineTotal);
  assert(order, `synced total ${offlineTotal} not found: ${JSON.stringify(synced)}`);

  const detail = await page.evaluate(async ({ baseUrl, id }) => {
    const auth = JSON.parse(localStorage.getItem('pos_auth'));
    const r = await fetch(`${baseUrl}/api/orders/${id}`, { headers: { Authorization: `Bearer ${auth.token}` } });
    return r.json();
  }, { baseUrl: base, id: order.id });
  assert(detail.items.length === 1 && detail.items[0].qty === 2, 'synced items mismatch');
  assert(detail.payments.reduce((s, p) => s + p.amount, 0) === offlineTotal, 'synced payment mismatch');
  assert(detail.opened_at && detail.closed_at, 'offline timestamps missing');

  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(shots, 'offline_04_synced.png'), fullPage: false });

  const remaining = await page.evaluate(() => JSON.parse(localStorage.getItem('pos_offline_drafts_v1') || '[]').length);
  assert(remaining === 0, `drafts left after sync: ${remaining}`);
  assert(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);

  console.log(`UI OFFLINE OK — local order ${draft.order_no} paid offline (${offlineTotal}) and synced as #${detail.order_no}`);
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await sleep(300);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
