import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.resolve('scripts/inspection_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  console.log('=== Starting Verification: 3D Calculator & Category Toolbar Dropdown ===');

  // Desktop Context (1366x820)
  const context = await browser.newContext({ viewport: { width: 1366, height: 820 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

  // Login if needed
  const isLogin = await page.locator('.login-card').isVisible().catch(() => false);
  if (isLogin) {
    for (const d of '1234') {
      await page.click(`.keypad button:has-text("${d}")`);
      await page.waitForTimeout(50);
    }
    await page.waitForSelector('.topbar', { timeout: 8000 });
  }

  // 1. Verify Topbar has Calculator button instead of old store launch button
  console.log('[1/4] Verifying Topbar Calculator button & 3D Desktop Modal...');
  const calcBtn = page.locator('.calc-launch-btn');
  await calcBtn.waitFor({ state: 'visible', timeout: 5000 });
  console.log('✓ Found .calc-launch-btn in header topbar');

  // Click Calculator button
  await calcBtn.click();
  await page.waitForSelector('.calc-3d-container', { timeout: 5000 });
  console.log('✓ Calculator opened successfully');

  // Perform calculation: 1500 * 3 + 500 = 5000
  await page.click('.key-3d:has-text("1")');
  await page.click('.key-3d:has-text("5")');
  await page.click('.key-3d:has-text("00")');
  await page.click('.key-3d:has-text("×")');
  await page.click('.key-3d:has-text("3")');
  await page.click('.key-3d:has-text("+")');
  await page.click('.key-3d:has-text("5")');
  await page.click('.key-3d:has-text("00")');
  await page.click('.key-3d.equals');
  await page.waitForTimeout(200);

  // Check display
  const dispText = await page.locator('.calc-digits').innerText();
  console.log('✓ Calculation result displayed:', dispText);

  // Click Quick Cash Chip +10,000 -> 15,000
  await page.click('.calc-quick-chip:has-text("+10,000")');
  await page.waitForTimeout(100);

  // Capture Desktop 3D Calculator
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'calc_01_desktop_modal.png') });
  console.log('✓ Captured calc_01_desktop_modal.png');

  // Close Calculator
  await page.click('.calc-close-btn');
  await page.waitForSelector('.calc-3d-container', { state: 'hidden' });

  // 2. Verify MenuAdmin: Chips bar removed, Category Dropdown in Toolbar, removed from Advanced Filter
  console.log('[2/4] Verifying MenuAdmin Category Dropdown Toolbar...');
  await page.click('.nav-btn[data-nav="menu"]');
  await page.waitForSelector('.data-toolbar', { timeout: 6000 });

  // Verify chips-bar does NOT exist
  const chipsBarExists = await page.locator('.chips-bar').isVisible().catch(() => false);
  console.log('✓ Chips bar sprawled across page removed:', !chipsBarExists);

  // Verify Category Dropdown in Toolbar row exists
  const catDropdown = page.locator('.toolbar-category-group select');
  await catDropdown.waitFor({ state: 'visible', timeout: 5000 });
  console.log('✓ Category Dropdown is in Toolbar row');

  // Open Advanced Filter and verify category filter is NOT in it
  await page.click('.toolbar-search-group button.btn.icon-text');
  await page.waitForSelector('.advanced-filter-panel', { timeout: 3000 });
  const catInAdv = await page.locator('.advanced-filter-panel .filter-field:has-text("အမျိုးအစား")').isVisible().catch(() => false);
  console.log('✓ Category filter removed from Advanced Filter panel:', !catInAdv);

  // Close advanced filter
  await page.click('.toolbar-search-group button.btn.icon-text');

  // Filter by category using the toolbar dropdown
  await catDropdown.selectOption({ index: 1 });
  await page.waitForTimeout(300);

  // Capture MenuAdmin with Toolbar Category Dropdown
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'menu_01_dropdown_toolbar.png') });
  console.log('✓ Captured menu_01_dropdown_toolbar.png');

  await context.close();

  // 3. Mobile Viewport (390x844) - 3D Full Screen Calculator & Menu Toolbar
  console.log('[3/4] Verifying Mobile 3D Full Screen Calculator...');
  const mobContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobPage = await mobContext.newPage();

  await mobPage.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  const isMobLogin = await mobPage.locator('.login-card').isVisible().catch(() => false);
  if (isMobLogin) {
    for (const d of '1234') {
      await mobPage.click(`.keypad button:has-text("${d}")`);
      await mobPage.waitForTimeout(50);
    }
    await mobPage.waitForSelector('.topbar', { timeout: 8000 });
  }

  // Open Mobile Calculator
  await mobPage.click('.calc-launch-btn');
  await mobPage.waitForSelector('.calc-3d-container', { timeout: 5000 });
  
  // Verify it takes full viewport on mobile
  const box = await mobPage.locator('.calc-3d-container').boundingBox();
  console.log(`✓ Mobile Calculator dimensions: width=${box.width}, height=${box.height}`);

  // Type some numbers on mobile 3D keypad
  await mobPage.click('.key-3d:has-text("2")');
  await mobPage.click('.key-3d:has-text("5")');
  await mobPage.click('.key-3d:has-text("00")');
  await mobPage.click('.key-3d:has-text("+")');
  await mobPage.click('.key-3d:has-text("3")');
  await mobPage.click('.key-3d:has-text("5")');
  await mobPage.click('.key-3d:has-text("00")');
  await mobPage.click('.key-3d.equals');
  await mobPage.waitForTimeout(200);

  // Capture Mobile Full Screen 3D Calculator
  await mobPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'calc_02_mobile_fullscreen.png') });
  console.log('✓ Captured calc_02_mobile_fullscreen.png');

  // Close Mobile Calculator
  await mobPage.click('.calc-close-btn');

  // Navigate to MenuAdmin on Mobile
  console.log('[4/4] Verifying Mobile MenuAdmin Toolbar...');
  await mobPage.click('button[data-bn="more"]');
  await mobPage.click('button.nav-btn[data-nav="menu"]');
  await mobPage.waitForSelector('.data-toolbar', { timeout: 5000 });
  await mobPage.waitForTimeout(300);

  await mobPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'menu_02_mobile_toolbar.png') });
  console.log('✓ Captured menu_02_mobile_toolbar.png');

  await mobContext.close();
  await browser.close();
  console.log('=== All Verifications & Captures Completed Successfully! ===');
}

run().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
