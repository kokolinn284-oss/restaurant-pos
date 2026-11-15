import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('scripts/inspection_screenshots');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function run() {
  console.log('Starting Playwright test for Toolbar and Menu Images...');
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
    console.log('Login successful.');

    // Helper navigation
    const navigateTo = async (navKey) => {
      if (vp.width <= 980) {
        // Check if direct bottom nav exists
        const bn = page.locator(`.bottom-nav [data-bn="${navKey}"]`);
        if (await bn.count() > 0) {
          await bn.click();
        } else {
          // Open more drawer
          await page.click('[data-bn="more"]');
          await page.waitForTimeout(300);
          await page.click(`.sidebar [data-nav="${navKey}"]`);
        }
      } else {
        await page.click(`.sidebar [data-nav="${navKey}"]`);
      }
      await page.waitForTimeout(400);
    };

    // 2. MenuAdmin Screen
    await navigateTo('menu');
    console.log('Navigated to MenuAdmin.');
    await page.screenshot({ path: `${outDir}/${vp.name}_toolbar_01_grid_view_enhanced.png` });

    // Test View Mode Switching (Table View)
    await page.click('.view-btn[title*="ဇယား"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/${vp.name}_toolbar_02_table_view.png` });

    // Switch back to Grid View (Clean 2-view mode: Grid & Table)
    await page.click('.view-btn[title*="ကတ်"]');
    await page.waitForTimeout(300);
    await page.waitForTimeout(300);

    // Test Quick Search
    const searchInput = page.locator('.search-box input');
    await searchInput.fill('ထမင်းကြော်');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/${vp.name}_toolbar_04_search_results.png` });
    // Clear search
    await page.click('.search-box .clear-btn');
    await page.waitForTimeout(300);

    // Test Advanced Search Toggle
    await page.click('.btn.icon-text[title*="အသေးစိတ်"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/${vp.name}_toolbar_05_advanced_search_open.png` });

    // Close advanced search
    await page.click('.btn.icon-text[title*="အသေးစိတ်"]');
    await page.waitForTimeout(300);

    // Test Sorting (Price descending)
    const sortSelect = page.locator('.sort-select-wrapper select');
    await sortSelect.selectOption('price');
    await page.click('.sort-dir-btn'); // toggle to desc
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/${vp.name}_toolbar_06_sorted_price_desc.png` });

    // Test Pagination (change to 10 per page)
    const pageSizeSelect = page.locator('.page-size-selector select');
    if (await pageSizeSelect.count() > 0) {
      await pageSizeSelect.selectOption('10');
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${outDir}/${vp.name}_toolbar_07_pagination_page1.png` });
      // Go to next page
      await page.click('.pagination-controls .icon-btn[title*="နောက်"]');
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${outDir}/${vp.name}_toolbar_08_pagination_page2.png` });
      // Reset to 25
      await pageSizeSelect.selectOption('25');
      await page.waitForTimeout(300);
    }

    // Test Bulk Selection
    const checkboxes = page.locator('.dish-checkbox input');
    if (await checkboxes.count() >= 2) {
      await checkboxes.nth(0).check();
      await checkboxes.nth(1).check();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${outDir}/${vp.name}_toolbar_09_bulk_actions_bar.png` });
      // Deselect all
      await page.click('.bulk-selection-info .link-btn');
      await page.waitForTimeout(200);
    }

    // Test Food Presets Image Picker Modal
    await page.click('[data-action="add-dish"]');
    await page.waitForSelector('.modal', { timeout: 4000 });
    await page.waitForTimeout(300);
    // Click choose photo
    await page.click('.dish-image-info .btn');
    await page.waitForSelector('.preset-grid', { timeout: 4000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/${vp.name}_toolbar_10_food_preset_picker.png` });
    // Pick Mohinga preset
    await page.click('.preset-card:has-text("မုန့်ဟင်းခါး")');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/${vp.name}_toolbar_11_dish_modal_with_preset.png` });
    // Close modal
    await page.click('.modal-foot .btn.ghost');
    await page.waitForTimeout(300);

    // 3. Inventory Screen
    await navigateTo('inventory');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/${vp.name}_toolbar_12_inventory_grid.png` });
    // Switch to table view in Inventory
    await page.click('.view-btn[title*="ဇယား"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/${vp.name}_toolbar_13_inventory_table.png` });

    // 4. POS Order Screen (verify images on dish cards)
    await navigateTo('tables');
    await page.waitForTimeout(400);
    // Open table 1 (စားပွဲ 1)
    await page.click('.table-card');
    await page.waitForSelector('.order-screen', { timeout: 6000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/${vp.name}_toolbar_14_order_screen_dish_images.png` });

    // Check horizontal overflow
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    console.log(`Viewport ${vp.name} overflow check: ${overflow ? 'OVERFLOW DETECTED' : 'CLEAN (0 overflow)'}`);

    await context.close();
  }

  await browser.close();
  console.log('\nAll Playwright verification tests finished successfully!');
}

run().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
