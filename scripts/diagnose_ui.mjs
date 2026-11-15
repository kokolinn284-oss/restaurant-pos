import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('scripts/inspection_screenshots');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile_iphone', width: 390, height: 844 },
    { name: 'mobile_compact', width: 360, height: 780 }
  ];

  const results = [];

  for (const vp of viewports) {
    console.log(`\n=== Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ===`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2
    });
    const page = await context.newPage();

    // 1. Login Page
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/${vp.name}_01_login.png` });

    // Enter PIN 1234
    for (const d of ['1', '2', '3', '4']) {
      await page.click(`button.key:has-text("${d}")`);
      await page.waitForTimeout(40);
    }
    // Wait for main dashboard / tables
    await page.waitForSelector('.topbar', { timeout: 5000 });
    await page.waitForTimeout(500);

    // Function to check overflow & touch target issues
    const checkGlitches = async (screenName) => {
      return await page.evaluate((sName) => {
        const issues = [];
        const winW = window.innerWidth;
        const scrollW = document.documentElement.scrollWidth;
        if (scrollW > winW) {
          issues.push({
            type: 'HORIZONTAL_OVERFLOW',
            screen: sName,
            detail: `document scrollWidth ${scrollW} > window.innerWidth ${winW}`
          });
        }

        // Check overflowing elements
        const all = document.querySelectorAll('*');
        for (const el of all) {
          const rect = el.getBoundingClientRect();
          if (rect.right > winW + 1 && el.offsetWidth > 0 && rect.width < winW * 3) {
            const style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden' && style.position !== 'fixed' && !el.closest('.sidebar:not(.open)')) {
              issues.push({
                type: 'ELEMENT_OVERFLOW',
                screen: sName,
                tag: el.tagName,
                class: el.className,
                rect: { left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) },
                text: (el.textContent || '').slice(0, 30).trim()
              });
            }
          }

          // Touch targets for mobile
          if (winW <= 500 && (el.tagName === 'BUTTON' || (el.tagName === 'A' && el.href))) {
            if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight) {
              if (rect.height < 36 || rect.width < 36) {
                issues.push({
                  type: 'SMALL_TOUCH_TARGET',
                  screen: sName,
                  tag: el.tagName,
                  class: el.className,
                  dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
                  text: (el.textContent || el.getAttribute('aria-label') || '').slice(0, 25).trim()
                });
              }
            }
          }
        }
        return issues;
      }, screenName);
    };

    // Helper navigation using data-nav or data-bn
    const gotoNav = async (key) => {
      if (vp.width <= 980) {
        const bn = page.locator(`button[data-bn="${key}"]`);
        if (await bn.isVisible()) {
          await bn.click();
        } else {
          await page.click('.topbar .menu-btn');
          await page.waitForTimeout(250);
          await page.click(`button[data-nav="${key}"]`);
        }
      } else {
        await page.click(`button[data-nav="${key}"]`);
      }
      await page.waitForTimeout(400);
    };

    // 2. Tables screen
    results.push(...await checkGlitches('Tables'));
    await page.screenshot({ path: `${outDir}/${vp.name}_02_tables.png` });

    // 3. Mobile Navigation Drawer Test
    if (vp.width <= 980) {
      console.log('Testing Mobile Drawer...');
      await page.click('.topbar .menu-btn');
      await page.waitForTimeout(300);
      results.push(...await checkGlitches('MobileDrawer_Open'));
      await page.screenshot({ path: `${outDir}/${vp.name}_03_mobile_drawer.png` });

      // click Dashboard in drawer
      await page.click('button[data-nav="dashboard"]');
      await page.waitForTimeout(400);
    } else {
      await page.click('button[data-nav="dashboard"]');
      await page.waitForTimeout(400);
    }

    // 4. Dashboard screen
    results.push(...await checkGlitches('Dashboard'));
    await page.screenshot({ path: `${outDir}/${vp.name}_04_dashboard.png` });

    // 5. Open Order (POS Counter Experience)
    await gotoNav('tables');
    const firstTable = page.locator('.table-card').first();
    await firstTable.click();
    await page.waitForTimeout(500);

    // We are now in Order screen
    results.push(...await checkGlitches('OrderScreen'));
    await page.screenshot({ path: `${outDir}/${vp.name}_05_order.png` });

    // Test search dishes
    await page.fill('.search input', 'ကြက်');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${outDir}/${vp.name}_06_order_search.png` });
    await page.click('.search .link-btn'); // clear search
    await page.waitForTimeout(200);

    // Add items to cart
    const itemCards = page.locator('.item-card');
    const count = await itemCards.count();
    if (count > 0) {
      await itemCards.nth(0).click();
      await page.waitForTimeout(250);
      if (count > 1) {
        await itemCards.nth(1).click();
        await page.waitForTimeout(250);
      }
    }
    await page.screenshot({ path: `${outDir}/${vp.name}_07_order_items_added.png` });

    // On mobile, test Cart Drawer / Sheet
    if (vp.width <= 980) {
      console.log('Testing Mobile Cart FAB and Sheet...');
      const cartFab = page.locator('.cart-fab');
      if (await cartFab.isVisible()) {
        await cartFab.click();
        await page.waitForTimeout(350);
        results.push(...await checkGlitches('MobileCart_Open'));
        await page.screenshot({ path: `${outDir}/${vp.name}_08_cart_mobile_sheet.png` });

        // Test payment modal from cart sheet
        const payBtn = page.locator('button[data-action="pay"]');
        if (await payBtn.isVisible()) {
          await payBtn.click();
          await page.waitForTimeout(350);
          results.push(...await checkGlitches('PayModal_Mobile'));
          await page.screenshot({ path: `${outDir}/${vp.name}_09_pay_modal_mobile.png` });
          await page.click('.modal-head .icon-btn');
          await page.waitForTimeout(250);
        }

        const closeCart = page.locator('.cart-head .icon-btn');
        if (await closeCart.isVisible()) {
          await closeCart.click();
          await page.waitForTimeout(250);
        }
      }
    } else {
      // Desktop: test Pay Modal
      const payBtn = page.locator('button[data-action="pay"]');
      if (await payBtn.isVisible()) {
        await payBtn.click();
        await page.waitForTimeout(350);
        results.push(...await checkGlitches('PayModal_Desktop'));
        await page.screenshot({ path: `${outDir}/${vp.name}_09_pay_modal_desktop.png` });
        await page.click('.modal-head .icon-btn');
        await page.waitForTimeout(250);
      }
    }

    // Go back from Order using cart back button or topbar back
    const backBtn = page.locator('.cart-pane .btn:has-text("နောက်သို့")');
    if (await backBtn.isVisible()) {
      await backBtn.click();
    } else {
      const topBack = page.locator('.topbar-left button.icon-btn:not(.menu-btn)');
      await topBack.click();
    }
    await page.waitForTimeout(400);

    // 6. MenuAdmin Screen
    await gotoNav('menu');
    results.push(...await checkGlitches('MenuAdmin'));
    await page.screenshot({ path: `${outDir}/${vp.name}_10_menu_admin.png` });

    // Open Add Dish Modal
    const addDishBtn = page.locator('button[data-action="add-dish"]');
    if (await addDishBtn.isVisible()) {
      await addDishBtn.click();
      await page.waitForTimeout(300);
      results.push(...await checkGlitches('MenuAdmin_AddDishModal'));
      await page.screenshot({ path: `${outDir}/${vp.name}_11_menu_add_dish_modal.png` });
      await page.click('.modal-head .icon-btn');
      await page.waitForTimeout(250);
    }

    // 7. Inventory Screen
    await gotoNav('inventory');
    results.push(...await checkGlitches('Inventory'));
    await page.screenshot({ path: `${outDir}/${vp.name}_12_inventory.png` });

    // Open Add Stock Item Modal
    const addInvBtn = page.locator('button[data-action="add-inventory"]');
    if (await addInvBtn.isVisible()) {
      await addInvBtn.click();
      await page.waitForTimeout(300);
      results.push(...await checkGlitches('Inventory_AddItemModal'));
      await page.screenshot({ path: `${outDir}/${vp.name}_13_inventory_add_item_modal.png` });
      await page.click('.modal-head .icon-btn');
      await page.waitForTimeout(250);
    }

    // 8. Expenses Screen
    await gotoNav('expenses');
    results.push(...await checkGlitches('Expenses'));
    await page.screenshot({ path: `${outDir}/${vp.name}_14_expenses.png` });

    // 9. Reports Screen
    await gotoNav('reports');
    results.push(...await checkGlitches('Reports'));
    await page.screenshot({ path: `${outDir}/${vp.name}_15_reports.png` });

    // 10. Settings Screen
    await gotoNav('settings');
    results.push(...await checkGlitches('Settings'));
    await page.screenshot({ path: `${outDir}/${vp.name}_16_settings.png` });

    await context.close();
  }

  await browser.close();

  console.log('\n=== DIAGNOSTIC REPORT SUMMARY ===');
  console.log(`Total issues identified: ${results.length}`);
  const grouped = {};
  for (const r of results) {
    grouped[r.type] = (grouped[r.type] || 0) + 1;
  }
  console.log('Issues by type:', grouped);

  const uniqueIssues = [];
  const seen = new Set();
  for (const r of results) {
    const key = `${r.type}_${r.screen}_${r.tag}_${r.class}_${r.text}_${r.dimensions || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueIssues.push(r);
    }
  }

  fs.writeFileSync('scripts/inspection_results.json', JSON.stringify(uniqueIssues, null, 2));
  console.log('Saved detailed results to scripts/inspection_results.json');
}

run().catch(console.error);
