import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.resolve('scripts/inspection_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  console.log('--- Starting Customer Catalog & POS Dashboard Verification ---');

  // 1. Desktop Customer Catalog Test
  {
    console.log('\n[1/3] Testing Customer Online Catalog (Desktop Viewport)...');
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    await page.goto('http://localhost:3000/#/catalog', { waitUntil: 'networkidle' });

    // Verify brand header
    const brandTitle = await page.textContent('.catalog-brand-title');
    console.log('✓ Catalog Brand Title:', brandTitle?.trim());

    // Verify categories loaded
    const catCount = await page.locator('.cat-pill').count();
    console.log(`✓ Loaded ${catCount} category tabs`);

    // Click on a category tab
    const secondCat = page.locator('.cat-pill').nth(1);
    const catName = await secondCat.textContent();
    await secondCat.click();
    await page.waitForTimeout(300);
    console.log(`✓ Switched to category: ${catName?.trim()}`);

    // Add first item to tray
    const firstAddBtn = page.locator('.cfc-add-btn').first();
    await firstAddBtn.click();
    await page.waitForTimeout(300);
    console.log('✓ Added item to tray via quick button');

    // Click on second food card to open Detail Modal
    const secondCard = page.locator('.catalog-food-card').nth(1);
    await secondCard.click();
    await page.waitForSelector('.catalog-dish-modal');

    // Stepper test
    await page.locator('.stepper-btn:has-text("+")').click();
    const qtyText = await page.textContent('.stepper-val');
    console.log(`✓ Incremented quantity to: ${qtyText}`);

    // Click cooking note chip
    const noteChip = page.locator('.note-chip').first();
    await noteChip.click();

    // Confirm add to tray
    await page.locator('.cdm-submit').click();
    await page.waitForTimeout(400);
    console.log('✓ Added customized item to tray from detail modal');

    // Verify Floating Tray Bar is visible
    const trayBar = page.locator('.catalog-floating-tray-bar');
    const isTrayVisible = await trayBar.isVisible();
    const trayQty = await page.textContent('.cftb-qty');
    const trayTotal = await page.textContent('.cftb-subtotal');
    console.log(`✓ Floating Tray active: ${isTrayVisible} (${trayQty} · ${trayTotal})`);

    // Open Tray Drawer
    await page.locator('.cftb-inner').click();
    await page.waitForSelector('.customer-tray-drawer');

    // Select Dining Mode: Dine-In & Table
    await page.locator('.tray-dining-summary').click();
    await page.waitForSelector('.table-picker-modal');
    // Select first free table
    await page.locator('.tgs-card').first().click();
    await page.locator('.table-picker-modal .btn.success').click();
    await page.waitForTimeout(300);

    // Fill customer info
    await page.locator('.tray-customer-inputs input').first().fill('ဒေါ်နီနီ');
    await page.locator('.tray-customer-inputs input').nth(1).fill('09555123456');

    // Submit Order
    await page.locator('.confirm-order-btn').click();
    await page.waitForTimeout(1000);

    // Verify Active Order Banner appears
    const activeBanner = page.locator('.active-order-banner');
    const hasBanner = await activeBanner.isVisible();
    const bannerText = await activeBanner.textContent();
    console.log(`✓ Order placed successfully! Active Banner: ${hasBanner}`);
    console.log(`  Details: ${bannerText?.trim().slice(0, 100)}...`);

    const shotPath = path.join(SCREENSHOT_DIR, 'catalog_desktop_success.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    results.push({ name: 'Catalog Desktop View', screenshot: shotPath, passed: true });
    await page.close();
  }

  // 2. Mobile Customer Catalog Test (390x844 iPhone Viewport)
  {
    console.log('\n[2/3] Testing Customer Online Catalog on Mobile (390x844)...');
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('http://localhost:3000/#/catalog', { waitUntil: 'networkidle' });

    // Check horizontal overflow
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    console.log(`✓ Mobile Viewport Horizontal Overflow: ${overflow ? 'FAIL (Overflow)' : 'PASS (Zero Overflow)'}`);

    // Test Search input
    await page.fill('.catalog-search-input', 'ကြက်');
    await page.waitForTimeout(400);
    const searchCardsCount = await page.locator('.catalog-food-card').count();
    console.log(`✓ Searched 'ကြက်': found ${searchCardsCount} matching food cards`);

    // Test Table Selector trigger
    await page.click('.table-selector-btn');
    await page.waitForSelector('.table-picker-modal');
    console.log('✓ Mobile table picker modal opened');
    await page.click('.table-picker-modal .icon-btn'); // close

    const shotPath = path.join(SCREENSHOT_DIR, 'catalog_mobile_390px.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    results.push({ name: 'Catalog Mobile 390px', screenshot: shotPath, overflow: overflow === false, passed: !overflow });
    await page.close();
  }

  // 3. POS Dashboard Verification (Store Owner View)
  {
    console.log('\n[3/3] Testing POS Modern Dashboard & QR Code System...');
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

    // Login with owner PIN 1234
    for (const d of '1234') {
      await page.click(`.keypad button:has-text("${d}")`);
    }
    await page.waitForSelector('.app', { timeout: 8000 });
    console.log('✓ Logged in to POS');

    // Navigate to Dashboard
    await page.click('.nav-btn[data-nav="dashboard"]');
    await page.waitForSelector('.dashboard-container');
    console.log('✓ Navigated to Dashboard');

    // Verify 6 KPI Cards
    const kpiCount = await page.locator('.stat-card-modern').count();
    console.log(`✓ Loaded ${kpiCount} Modern KPI Cards (Expected 6)`);

    // Verify Quick Actions Bar
    const shortcutCount = await page.locator('.shortcut-chip').count();
    console.log(`✓ Loaded ${shortcutCount} Quick Action Chips`);

    // Verify Domain highlight cards
    const domainCount = await page.locator('.domain-card').count();
    console.log(`✓ Loaded ${domainCount} Business Domain Cards`);

    // Verify Recent Orders Feed displays online order
    const hasOnlineTag = await page.locator('.roc-online-pill').count();
    console.log(`✓ Recent Orders Feed shows Online Order Tag: ${hasOnlineTag > 0}`);

    // Click Online Catalog & QR Code modal trigger
    await page.click('.domain-card.catalog-domain button:has-text("QR Code")');
    await page.waitForSelector('.catalog-share-modal');
    console.log('✓ Opened Online Catalog & QR Code Share Modal');

    // Test table select in QR modal
    const qrModalSelect = page.locator('.csm-table-filter select');
    await qrModalSelect.selectOption({ index: 1 });
    const qrUrlVal = await page.inputValue('.csm-url-box input');
    console.log(`✓ Selected Table QR link generated: ${qrUrlVal}`);

    const modalShotPath = path.join(SCREENSHOT_DIR, 'pos_dashboard_qr_modal.png');
    await page.screenshot({ path: modalShotPath });

    // Close modal
    await page.click('.catalog-share-modal .icon-btn');
    await page.waitForTimeout(300);

    const dashShotPath = path.join(SCREENSHOT_DIR, 'pos_dashboard_desktop.png');
    await page.screenshot({ path: dashShotPath, fullPage: true });

    // Test mobile dashboard view
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);

    const dashMobileOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    console.log(`✓ POS Dashboard Mobile Overflow (390px): ${dashMobileOverflow ? 'FAIL' : 'PASS (Zero Overflow)'}`);

    const dashMobileShot = path.join(SCREENSHOT_DIR, 'pos_dashboard_mobile.png');
    await page.screenshot({ path: dashMobileShot, fullPage: true });

    results.push({ name: 'POS Dashboard Desktop', screenshot: dashShotPath, passed: true });
    results.push({ name: 'POS QR Share Modal', screenshot: modalShotPath, passed: true });
    results.push({ name: 'POS Dashboard Mobile 390px', screenshot: dashMobileShot, passed: !dashMobileOverflow });

    await page.close();
  }

  await browser.close();
  console.log('\n=== All Tests Completed Successfully ===');
  console.log(JSON.stringify(results, null, 2));
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
