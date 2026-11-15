import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('scripts/inspection_screenshots');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function run() {
  console.log('Testing Dedicated Category / Type Tab...');
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile_iphone', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    console.log(`\n=== Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2
    });
    const page = await context.newPage();

    // 1. Login with PIN 1234
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(500);
    for (const d of ['1', '2', '3', '4']) {
      await page.click(`button.key:has-text("${d}")`);
      await page.waitForTimeout(50);
    }
    await page.waitForSelector('.topbar', { timeout: 6000 });

    // Navigate to menu
    if (vp.width <= 980) {
      await page.click('[data-bn="more"]');
      await page.waitForTimeout(300);
      await page.click('.sidebar [data-nav="menu"]');
    } else {
      await page.click('.sidebar [data-nav="menu"]');
    }
    await page.waitForTimeout(400);

    // 2. Click Dedicated Category (Type) Tab
    const catTab = page.locator('.tabs button.tab:has-text("အမျိုးအစား")');
    await catTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/${vp.name}_category_tab_01_grid.png` });
    console.log('Category tab loaded.');

    // 3. Test Category Search
    const searchInput = page.locator('.stack .search-box input');
    if (await searchInput.count() > 0) {
      await searchInput.fill('ထမင်း');
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${outDir}/${vp.name}_category_tab_02_search.png` });
      await page.click('.stack .search-box .clear-btn');
      await page.waitForTimeout(300);
    }

    // 4. Test Add Category Modal
    await page.click('[data-action="add-category"]');
    await page.waitForSelector('.modal', { timeout: 4000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/${vp.name}_category_tab_03_add_modal.png` });
    await page.click('.modal-foot .btn.ghost');
    await page.waitForTimeout(300);

    // 5. Test "ဟင်းများ ကြည့်ရန်" (View Dishes in Category)
    const viewDishesBtn = page.locator('.cat-card-footer .link-btn').first();
    if (await viewDishesBtn.count() > 0) {
      await viewDishesBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${outDir}/${vp.name}_category_tab_04_filtered_dishes.png` });
      console.log('View dishes link clicked and transitioned to items tab.');
    }

    // Check overflow
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    console.log(`Viewport ${vp.name} overflow check: ${overflow ? 'OVERFLOW' : 'CLEAN (0 overflow)'}`);

    await context.close();
  }

  await browser.close();
  console.log('\nAll Category Tab verification tests completed successfully!');
}

run().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
