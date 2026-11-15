import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.resolve('scripts/inspection_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  console.log('=== Starting Modern SaaS UI Capture & Verification ===');

  // Desktop Context (1366x820)
  const context = await browser.newContext({ viewport: { width: 1366, height: 820 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

  // Login as owner (1234)
  const isLogin = await page.locator('.login-card').isVisible().catch(() => false);
  if (isLogin) {
    for (const d of '1234') {
      await page.click(`.keypad button:has-text("${d}")`);
      await page.waitForTimeout(50);
    }
    await page.waitForSelector('.topbar', { timeout: 8000 });
  }

  // 1. POS Tables Screen (Modern 14px rounded table cards & quick cards)
  console.log('[1/6] Capturing Modern POS Tables & Counter...');
  await page.click('.nav-btn[data-nav="tables"]');
  await page.waitForSelector('.table-grid');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'saas_01_tables_counter.png') });

  // 2. POS Order Screen (Item cards with soft elevation)
  console.log('[2/6] Capturing Modern POS Order Screen...');
  await page.click('.quick-card.takeaway');
  await page.waitForSelector('.item-grid', { timeout: 8000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'saas_02_order_screen.png') });

  // 3. Admin Dashboard (Modern SaaS 6 KPIs, trend chart, quick actions)
  console.log('[3/6] Capturing Modern Admin Dashboard...');
  await page.click('.nav-btn[data-nav="dashboard"]');
  await page.waitForSelector('.dashboard-container');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'saas_03_dashboard.png') });

  // 4. Menu Admin (Modern dish cards)
  console.log('[4/6] Capturing Menu Admin...');
  await page.click('.nav-btn[data-nav="menu"]');
  await page.waitForSelector('.dish-card-grid');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'saas_04_menu_admin.png') });

  // 5. Customer Online Catalog (Modern Food Cards, Pills, Search, Tray)
  console.log('[5/6] Capturing Customer Online Catalog (Desktop)...');
  await page.goto('http://localhost:3000/#/catalog', { waitUntil: 'networkidle' });
  await page.waitForSelector('.catalog-card-grid');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'saas_05_customer_catalog.png') });

  // Open detail modal in catalog to check modal styling
  await page.locator('.catalog-food-card').first().click();
  await page.waitForSelector('.catalog-dish-modal');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'saas_06_catalog_modal.png') });

  await context.close();

  // 6. Mobile Viewports (390x844)
  console.log('[6/6] Capturing Mobile Viewports (POS & Customer Catalog)...');
  const mobContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobPage = await mobContext.newPage();

  // Mobile Catalog
  await mobPage.goto('http://localhost:3000/#/catalog', { waitUntil: 'networkidle' });
  await mobPage.waitForSelector('.catalog-card-grid');
  await mobPage.waitForTimeout(300);
  await mobPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'saas_07_catalog_mobile.png') });

  // Mobile POS Dashboard
  await mobPage.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  const isMobLogin = await mobPage.locator('.login-card').isVisible().catch(() => false);
  if (isMobLogin) {
    for (const d of '1234') {
      await mobPage.click(`.keypad button:has-text("${d}")`);
      await mobPage.waitForTimeout(50);
    }
    await mobPage.waitForSelector('.topbar', { timeout: 8000 });
  }
  await mobPage.click('button[data-bn="dashboard"]');
  await mobPage.waitForSelector('.dashboard-container');
  await mobPage.waitForTimeout(300);
  await mobPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'saas_08_dashboard_mobile.png') });

  await mobContext.close();
  await browser.close();

  console.log('=== All Modern SaaS UI Captures Completed Successfully! ===');
}

run().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
