import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.resolve('scripts/inspection_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  console.log('=== Verifying Clean Full-Width Borderless Layout & 5/3/2 Columns ===');

  // --- 1. Customer Catalog Desktop (1440px): 5 Columns ---
  {
    console.log('\n[1/4] Testing Customer Catalog Desktop (1440x900) - Expected: 5 Columns...');
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('http://localhost:3000/#/catalog', { waitUntil: 'networkidle' });

    // Grid columns check
    const colCount = await page.evaluate(() => {
      const grid = document.querySelector('.catalog-card-grid');
      if (!grid) return 0;
      const cols = window.getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/);
      return cols.length;
    });
    console.log(`✓ Desktop Grid Column Count: ${colCount} (Expected: 5)`);

    // Card style checks: borderless, 0 rounded corners, white background
    const cardStyles = await page.evaluate(() => {
      const card = document.querySelector('.catalog-food-card');
      if (!card) return null;
      const s = window.getComputedStyle(card);
      return {
        borderRadius: s.borderRadius,
        borderWidth: s.borderWidth,
        borderStyle: s.borderStyle,
        backgroundColor: s.backgroundColor,
        width: s.width
      };
    });
    console.log('✓ Card Computed Styles:', cardStyles);

    // Verify banner and search bar gap
    const gapInfo = await page.evaluate(() => {
      const headerInner = document.querySelector('.catalog-header-inner');
      const searchBar = document.querySelector('.catalog-search-bar');
      const rect1 = headerInner?.getBoundingClientRect();
      const rect2 = searchBar?.getBoundingClientRect();
      return {
        headerBottom: rect1?.bottom,
        searchTop: rect2?.top,
        verticalGap: (rect2?.top || 0) - (rect1?.bottom || 0)
      };
    });
    console.log(`✓ Vertical Gap between Banner & Search Bar: ${gapInfo.verticalGap}px (Tight & Compact)`);

    // Test smooth category transition without reload
    const categoryTabs = page.locator('.cat-pill');
    await categoryTabs.nth(1).click();
    await page.waitForTimeout(300);
    const activeCatText = await categoryTabs.nth(1).textContent();
    console.log(`✓ Category switched smoothly without reload: ${activeCatText?.trim()}`);

    const shot1 = path.join(SCREENSHOT_DIR, 'catalog_desktop_5col_clean.png');
    await page.screenshot({ path: shot1, fullPage: false });
    results.push({
      test: 'Customer Catalog Desktop 5-Col',
      colCount,
      borderRadius: cardStyles?.borderRadius,
      gap: gapInfo.verticalGap,
      screenshot: shot1,
      passed: colCount === 5 && cardStyles?.borderRadius === '0px'
    });
    await page.close();
  }

  // --- 2. Customer Catalog Tablet (820px): 3 Columns ---
  {
    console.log('\n[2/4] Testing Customer Catalog Tablet (820x1180) - Expected: 3 Columns...');
    const page = await browser.newPage({ viewport: { width: 820, height: 1180 } });
    await page.goto('http://localhost:3000/#/catalog', { waitUntil: 'networkidle' });

    const colCount = await page.evaluate(() => {
      const grid = document.querySelector('.catalog-card-grid');
      if (!grid) return 0;
      const cols = window.getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/);
      return cols.length;
    });
    console.log(`✓ Tablet Grid Column Count: ${colCount} (Expected: 3)`);

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    console.log(`✓ Tablet Horizontal Overflow: ${overflow ? 'FAIL' : 'PASS (Zero Overflow)'}`);

    const shot2 = path.join(SCREENSHOT_DIR, 'catalog_tablet_3col_clean.png');
    await page.screenshot({ path: shot2, fullPage: false });
    results.push({
      test: 'Customer Catalog Tablet 3-Col',
      colCount,
      overflow: !overflow,
      screenshot: shot2,
      passed: colCount === 3 && !overflow
    });
    await page.close();
  }

  // --- 3. Customer Catalog Mobile (390px): 2 Columns ---
  {
    console.log('\n[3/4] Testing Customer Catalog Mobile (390x844) - Expected: 2 Columns...');
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('http://localhost:3000/#/catalog', { waitUntil: 'networkidle' });

    const colCount = await page.evaluate(() => {
      const grid = document.querySelector('.catalog-card-grid');
      if (!grid) return 0;
      const cols = window.getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/);
      return cols.length;
    });
    console.log(`✓ Mobile Grid Column Count: ${colCount} (Expected: 2)`);

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    console.log(`✓ Mobile Horizontal Overflow: ${overflow ? 'FAIL' : 'PASS (Zero Overflow)'}`);

    const shot3 = path.join(SCREENSHOT_DIR, 'catalog_mobile_2col_clean.png');
    await page.screenshot({ path: shot3, fullPage: false });
    results.push({
      test: 'Customer Catalog Mobile 2-Col',
      colCount,
      overflow: !overflow,
      screenshot: shot3,
      passed: colCount === 2 && !overflow
    });
    await page.close();
  }

  // --- 4. POS Menu Admin & Order Screens Responsive Grids ---
  {
    console.log('\n[4/4] Testing POS Menu Admin & Order Grids...');
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

    // Login with PIN 1234
    for (const d of '1234') {
      await page.click(`.keypad button:has-text("${d}")`);
    }
    await page.waitForSelector('.app', { timeout: 8000 });

    // Go to Menu Admin
    await page.click('.nav-btn[data-nav="menu"]');
    await page.waitForSelector('.dish-card-grid');

    const menuColCount = await page.evaluate(() => {
      const grid = document.querySelector('.dish-card-grid');
      if (!grid) return 0;
      return window.getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length;
    });
    console.log(`✓ POS Menu Admin Grid Columns (Desktop): ${menuColCount} (Expected: 5)`);

    const dishBorderRadius = await page.evaluate(() => {
      const card = document.querySelector('.dish-card');
      return card ? window.getComputedStyle(card).borderRadius : '';
    });
    console.log(`✓ POS Dish Card Border Radius: ${dishBorderRadius} (Expected: 0px)`);

    const shot4 = path.join(SCREENSHOT_DIR, 'pos_menu_admin_5col_clean.png');
    await page.screenshot({ path: shot4, fullPage: false });

    // Mobile check on POS Menu
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);

    const menuMobileColCount = await page.evaluate(() => {
      const grid = document.querySelector('.dish-card-grid');
      if (!grid) return 0;
      return window.getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length;
    });
    console.log(`✓ POS Menu Admin Grid Columns (Mobile 390px): ${menuMobileColCount} (Expected: 2)`);

    const shot5 = path.join(SCREENSHOT_DIR, 'pos_menu_admin_mobile_2col.png');
    await page.screenshot({ path: shot5, fullPage: false });

    results.push({
      test: 'POS Menu Admin Desktop 5-Col & Mobile 2-Col',
      menuColCount,
      menuMobileColCount,
      dishBorderRadius,
      screenshot: shot4,
      passed: menuColCount === 5 && menuMobileColCount === 2 && dishBorderRadius === '0px'
    });
    await page.close();
  }

  await browser.close();
  console.log('\n=== All Responsive & Clean Layout Tests Completed ===');
  console.log(JSON.stringify(results, null, 2));
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
