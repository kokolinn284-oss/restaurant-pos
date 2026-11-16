import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-ui-'));
const port = 4373;
const base = `http://127.0.0.1:${port}`;
const outDir = path.resolve('scripts/inspection_screenshots');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    POS_DATA_DIR: path.join(tmp, 'data'),
    POS_BACKUP_DIR: path.join(tmp, 'backups')
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

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

async function seed() {
  const login = await req('/api/auth/login', { method: 'POST', body: { pin: '1234' } });
  const token = login.data.token;
  const boot = await req('/api/bootstrap', { token });
  const table = boot.data.tables.find(t => !t.order_id);
  const item = boot.data.items.find(i => i.available);
  const o = await req('/api/orders', { method: 'POST', token, body: { type: 'dine_in', tableId: table.id, guests: 2 } });
  await req(`/api/orders/${o.data.id}/items`, { method: 'POST', token, body: { itemId: item.id, qty: 2 } });
  const before = await req(`/api/orders/${o.data.id}`, { token });
  const total = before.data.total;
  const pay = await req(`/api/orders/${o.data.id}/pay`, {
    method: 'POST', token,
    body: { payments: [{ method: 'cash', amount: Math.floor(total / 2) }, { method: 'bank', amount: total - Math.floor(total / 2) }, { method: 'credit', amount: 0 }].filter(p => p.amount > 0) }
  });
  assert(pay.status === 200, 'seed pay failed');
  await req('/api/expenses', { method: 'POST', token, body: { category: 'ပစ္စည်းဝယ်ခြင်း', amount: 15000, method: 'cash', vendor: 'Seed Vendor' } });
  await req('/api/expenses', { method: 'POST', token, body: { category: 'လစာ', amount: 90000, method: 'bank', note: 'Seed payroll' } });

  // payment methods: seeded defaults + usage aggregation
  let methods = await req('/api/payment-methods', { token });
  assert(methods.status === 200 && methods.data.length >= 5, `payment methods missing ${methods.status}`);
  const cashRow = methods.data.find(m => m.code === 'cash');
  assert(cashRow && cashRow.count >= 1 && cashRow.amount > 0, 'cash usage not aggregated');

  // custom type kept for checkout UI check
  const custom = await req('/api/payment-methods', { method: 'POST', token, body: { name: 'AYA Pay' } });
  assert(custom.status === 200 && custom.data.code === 'aya-pay', `payment method add failed ${JSON.stringify(custom.data)}`);

  // full CRUD on a throwaway type
  const tmp = await req('/api/payment-methods', { method: 'POST', token, body: { name: 'Test Method' } });
  assert(tmp.status === 200, 'temp payment method add failed');
  const ren = await req(`/api/payment-methods/${tmp.data.id}`, { method: 'PATCH', token, body: { name: 'Test Method 2' } });
  assert(ren.status === 200, 'payment method rename failed');
  methods = await req('/api/payment-methods', { token });
  assert(methods.data.find(m => m.id === tmp.data.id)?.name === 'Test Method 2', 'rename not applied');
  const delUsed = await req(`/api/payment-methods/${cashRow.id}`, { method: 'DELETE', token });
  assert(delUsed.status === 409, 'used payment method should not delete');
  const delTmp = await req(`/api/payment-methods/${tmp.data.id}`, { method: 'DELETE', token });
  assert(delTmp.status === 200, 'unused payment method delete failed');

  // open order for checkout modal check
  const table2 = boot.data.tables.find(t => !t.order_id && t.id !== table.id);
  assert(table2, 'no second free table for checkout check');
  const open = await req('/api/orders', { method: 'POST', token, body: { type: 'dine_in', tableId: table2.id, guests: 2 } });
  await req(`/api/orders/${open.data.id}/items`, { method: 'POST', token, body: { itemId: item.id, qty: 1 } });

  return { openTable: table2.name };
}

async function measure(page, sel) {
  return page.$$eval(sel, els => els.map(el => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), text: el.textContent.trim().slice(0, 40) };
  }));
}

let browser;
async function run() {
  await waitForServer();
  const seeded = await seed();
  const openTable = seeded.openTable;
  console.log(`seed ok — payment methods ready, open table ${openTable}`);

  browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 }
  ];
  const results = {};

  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForTimeout(500);
    for (const d of ['1', '2', '3', '4']) {
      await page.click(`button.key:has-text("${d}")`);
      await page.waitForTimeout(60);
    }
    await page.waitForSelector('.topbar', { timeout: 8000 });

    const navigate = async (key) => {
      if (vp.width < 1000) {
        await page.click('.menu-btn');
        await page.waitForTimeout(450);
      }
      if (['expensecats', 'payments'].includes(key) && !(await page.locator(`.sidebar [data-nav="${key}"]`).count())) {
        await page.click('.sidebar [data-nav="settings"]');
        await page.waitForTimeout(400);
      }
      await page.click(`.sidebar [data-nav="${key}"]`);
      await page.waitForTimeout(700);
    };

    const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

    // Expenses
    await navigate('expenses');
    const expSections = await page.$$eval('main section.panel h3', els => els.map(e => e.textContent.trim()));
    assert(expSections.length === 1, `expenses should have 1 panel, got ${expSections.length}: ${expSections}`);
    const expStats = await measure(page, '.stat-grid.compact .stat-card');
    assert(expStats.length === 3, `expenses stat cards ${expStats.length}`);
    assert(expStats.every(s => s.h <= 80), `expense stat height too tall: ${JSON.stringify(expStats)}`);
    const expOverflow = await overflow();
    assert(expOverflow <= 1, `expenses overflow ${expOverflow}`);
    results[`expenses_${vp.name}`] = { statH: expStats.map(s => s.h), overflow: expOverflow };
    await page.screenshot({ path: `${outDir}/new_${vp.name}_expenses.png` });

    // Expense categories
    await navigate('expensecats');
    const catsPanels = await page.$$eval('main section.panel h3', els => els.map(e => e.textContent.trim()));
    assert(catsPanels.length === 2, `expensecats panels ${catsPanels.length}`);
    const addBtn = page.locator('.page-head.inline .btn').first();
    assert(await addBtn.count() === 1, 'expensecats add button missing for owner');
    await addBtn.click();
    await page.waitForTimeout(300);
    assert(await page.locator('.modal input').count() >= 1, 'add category modal input missing');
    await page.click('.modal-head .icon-btn');
    await page.waitForTimeout(300);
    const catRows = await page.locator('main .list-row').count();
    assert(catRows >= 2, `expensecats rows ${catRows}`);
    const catStats = await measure(page, '.stat-grid.compact .stat-card');
    assert(catStats.length === 3, `expensecats stat cards ${catStats.length}`);
    const noDateFilter = await page.locator('main .date-field').count();
    assert(noDateFilter === 0, 'date filter should be removed from expensecats');
    const catOverflow = await overflow();
    assert(catOverflow <= 1, `expensecats overflow ${catOverflow}`);
    results[`expensecats_${vp.name}`] = { rows: catRows, statH: catStats.map(s => s.h), overflow: catOverflow };
    await page.screenshot({ path: `${outDir}/new_${vp.name}_expensecats.png` });

    // Payment types
    await navigate('payments');
    const payHeadText = await page.textContent('.page-head.inline h2');
    assert(payHeadText.includes('ငွေပေးချေမှု အမျိုးအစား'), `payments heading "${payHeadText}"`);
    const payStats = await measure(page, '.stat-grid.compact .stat-card');
    assert(payStats.length === 3, `payments stat cards ${payStats.length}`);
    assert(payStats.every(s => s.h <= 80), `payment stat height too tall: ${JSON.stringify(payStats)}`);
    const payRows = await page.locator('main .list .list-row').count();
    assert(payRows >= 6, `payment type rows ${payRows}`);
    const payBars = await page.locator('main .bars .bar-row').count();
    assert(payBars >= 1, `payment usage bars ${payBars}`);
    const payOverflow = await overflow();
    assert(payOverflow <= 1, `payments overflow ${payOverflow}`);
    const pageHeadOneRow = await page.evaluate(() => {
      const head = document.querySelector('.page-head.inline');
      const rects = Array.from(head.children).map(c => c.getBoundingClientRect());
      const top = Math.min(...rects.map(r => r.top));
      const bottom = Math.max(...rects.map(r => r.bottom));
      const overlap = rects.every(r => r.bottom > top + 2 && r.top < bottom - 2);
      return head.getBoundingClientRect().height < 80 && overlap;
    });
    assert(pageHeadOneRow, 'payments page-head not single row');
    results[`payments_${vp.name}`] = { rows: payRows, bars: payBars, statH: payStats.map(s => s.h), overflow: payOverflow };
    await page.screenshot({ path: `${outDir}/new_${vp.name}_payments.png` });

    // Add type modal (owner)
    if (vp.name === 'desktop') {
      await page.click('.page-head.inline .btn');
      await page.waitForTimeout(400);
      assert(await page.locator('.modal input').count() >= 1, 'add payment type modal input missing');
      await page.screenshot({ path: `${outDir}/new_${vp.name}_payment_add.png` });
      await page.click('.modal-head .icon-btn');
      await page.waitForTimeout(300);
    }

    // Checkout uses predefined types
    if (vp.name === 'desktop') {
      await navigate('tables');
      await page.click(`.table-card:has-text("${openTable}")`);
      await page.waitForTimeout(900);
      await page.click('[data-action="pay"]');
      await page.waitForTimeout(500);
      const opts = await page.$$eval('.pay-row select option', els => els.map(e => e.textContent.trim()));
      assert(opts.includes('KBZPay') && opts.includes('AYA Pay'), `pay modal methods ${opts}`);
      await page.screenshot({ path: `${outDir}/new_${vp.name}_pay_modal.png` });
      await page.click('.modal-head .icon-btn');
      await page.waitForTimeout(300);
    }

    await context.close();
  }

  // English pass on desktop
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForTimeout(500);
  for (const d of ['1', '2', '3', '4']) {
    await page.click(`button.key:has-text("${d}")`);
    await page.waitForTimeout(60);
  }
  await page.waitForSelector('.topbar', { timeout: 8000 });
  await page.click('.lang-toggle-btn');
  await page.waitForTimeout(400);
  await page.click('.sidebar [data-nav="settings"]');
  await page.waitForTimeout(400);
  await page.click('.sidebar [data-nav="payments"]');
  await page.waitForTimeout(700);
  const enHead = await page.textContent('.page-head.inline h2');
  assert(enHead.trim() === 'Payment Methods', `EN payments heading "${enHead}"`);
  const enOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(enOverflow <= 1, `EN payments overflow ${enOverflow}`);
  await page.screenshot({ path: `${outDir}/new_desktop_payments_en.png` });
  await page.click('.sidebar [data-nav="expensecats"]');
  await page.waitForTimeout(700);
  const enCats = await page.textContent('.page-head.inline h2');
  assert(enCats.trim() === 'Expense Categories', `EN expensecats heading "${enCats}"`);
  await page.screenshot({ path: `${outDir}/new_desktop_expensecats_en.png` });

  // UI rename + delete of the custom type (owner, desktop)
  await page.click('.sidebar [data-nav="payments"]');
  await page.waitForTimeout(700);
  const beforeRows = await page.locator('main .list .list-row').count();
  await page.locator('main .list .list-row', { hasText: 'AYA Pay' }).locator('.act-edit').click();
  await page.waitForTimeout(300);
  const nameInput = page.locator('main .list .list-row input').first();
  await nameInput.fill('AYA Pay (Cash)');
  await nameInput.press('Enter');
  await page.waitForTimeout(800);
  const renamed = await page.locator('main .list .list-row', { hasText: 'AYA Pay (Cash)' }).count();
  assert(renamed === 1, 'ui rename not applied');
  page.once('dialog', d => d.accept());
  await page.locator('main .list .list-row', { hasText: 'AYA Pay (Cash)' }).locator('.act-delete').click();
  await page.waitForTimeout(800);
  const afterRows = await page.locator('main .list .list-row').count();
  assert(afterRows === beforeRows - 1, `ui delete failed ${beforeRows} -> ${afterRows}`);
  console.log(`ui rename + delete ok — rows ${beforeRows} -> ${afterRows}`);
  await context.close();

  await browser.close();
  console.log('RESULTS', JSON.stringify(results, null, 2));

  // Cashier read-only check
  const login = await req('/api/auth/login', { method: 'POST', body: { pin: '1111' } });
  if (login.status === 200) {
    const cats = await req('/api/expense-categories', { token: login.data.token });
    console.log('cashier can read categories:', cats.status === 200);
    const del = await req('/api/expense-categories/1', { method: 'DELETE', token: login.data.token });
    console.log('cashier delete blocked:', del.status === 403 || del.status === 401);
    const pmRead = await req('/api/payment-methods', { token: login.data.token });
    console.log('cashier can read payment methods:', pmRead.status === 200);
    const pmAdd = await req('/api/payment-methods', { method: 'POST', token: login.data.token, body: { name: 'Nope' } });
    console.log('cashier payment method POST blocked:', pmAdd.status === 403 || pmAdd.status === 401);
  }
}

try {
  await run();
  console.log('VERIFY OK');
} catch (e) {
  console.error('VERIFY FAILED:', e.message);
  console.error(serverLog.slice(-1500));
  process.exitCode = 1;
} finally {
  try { await browser?.close(); } catch {}
  server.kill();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
