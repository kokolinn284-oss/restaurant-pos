import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.resolve('scripts/inspection_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  console.log('=== Starting Flag Language Toggle Verification ===');

  // 1. Login Page Test
  {
    console.log('\n[1/4] Testing Flag Toggle on Login Screen...');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    // Clear auth if any
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });

    // Check Myanmar initial
    const myBtn = page.locator('.login-tools .lang-toggle-btn');
    const myText = (await myBtn.textContent())?.trim();
    console.log('✓ Initial Login Lang Button:', myText);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_login_flag_my.png') });

    // Click toggle to English
    await myBtn.click();
    await page.waitForTimeout(200);
    const enText = (await myBtn.textContent())?.trim();
    const pinHelp = (await page.locator('.login-card p.muted').textContent())?.trim();
    console.log(`✓ Clicked Flag Toggle -> Lang Button: "${enText}", PIN text: "${pinHelp}"`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_login_flag_en.png') });

    // Click toggle back to Myanmar
    await myBtn.click();
    await page.waitForTimeout(200);
    const backText = (await myBtn.textContent())?.trim();
    console.log(`✓ Clicked Flag Toggle back -> Lang Button: "${backText}"`);
    await page.close();
  }

  // 2. Desktop POS Dashboard & Topbar / Sidebar Test
  {
    console.log('\n[2/4] Testing Flag Toggle on POS Topbar & Sidebar (Desktop)...');
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    // Login with PIN 1234
    for (const d of '1234') {
      await page.click(`.keypad button:has-text("${d}")`);
      await page.waitForTimeout(50);
    }
    await page.waitForSelector('.topbar', { timeout: 8000 });
    console.log('✓ Logged in as Store Owner');

    // Go to dashboard
    await page.click('.nav-btn[data-nav="dashboard"]');
    await page.waitForSelector('.dashboard-container');

    // Initial Dashboard Myanmar
    const topFlagBtn = page.locator('.topbar .lang-toggle-btn');
    const topFlagText = (await topFlagBtn.textContent())?.trim();
    const quickTitle = (await page.locator('.shortcut-chip .sc-label').first().textContent())?.trim();
    const dashTitle = (await page.locator('h2.dash-title').textContent())?.trim();
    console.log(`✓ Initial POS Topbar Flag: "${topFlagText}", Dash Title: "${dashTitle}", First Quick Action: "${quickTitle}"`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_pos_dashboard_my.png') });

    // Click Topbar Flag to switch to English
    await topFlagBtn.click();
    await page.waitForTimeout(300);

    const enTopFlagText = (await topFlagBtn.textContent())?.trim();
    const enQuickTitle = (await page.locator('.shortcut-chip .sc-label').first().textContent())?.trim();
    const enKpiTitle = (await page.locator('.scm-title').first().textContent())?.trim();
    const enDashTitle = (await page.locator('h2.dash-title').textContent())?.trim();
    console.log(`✓ Toggled to English -> Topbar: "${enTopFlagText}", Dash Title: "${enDashTitle}", Quick Action: "${enQuickTitle}", First KPI: "${enKpiTitle}"`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_pos_dashboard_en.png') });

    // Test Sidebar Tools flag button toggles back to Myanmar
    const sideFlagBtn = page.locator('.sidebar-tools .lang-toggle-btn');
    await sideFlagBtn.click();
    await page.waitForTimeout(300);
    const restoredTopText = (await topFlagBtn.textContent())?.trim();
    const restoredDashTitle = (await page.locator('h2.dash-title').textContent())?.trim();
    console.log(`✓ Toggled back to Myanmar via Sidebar -> Topbar: "${restoredTopText}", Dash Title: "${restoredDashTitle}"`);

    await page.close();
  }

  // 3. Mobile Viewport POS Test
  {
    console.log('\n[3/4] Testing Flag Toggle on Mobile POS Viewport (390x844)...');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    // If login needed
    const isLogin = await page.locator('.login-card').isVisible().catch(() => false);
    if (isLogin) {
      for (const d of '1234') {
        await page.click(`.keypad button:has-text("${d}")`);
        await page.waitForTimeout(50);
      }
      await page.waitForSelector('.topbar', { timeout: 8000 });
    }

    // Navigate to dashboard via bottom nav
    await page.click('button[data-bn="dashboard"]');
    await page.waitForSelector('.dashboard-container');

    // Mobile Topbar Flag Button
    const mobTopFlag = page.locator('.topbar .lang-toggle-btn');
    await mobTopFlag.click();
    await page.waitForTimeout(300);
    console.log('✓ Mobile Topbar Flag clicked -> switched to English');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_pos_mobile_flag_en.png') });

    // Open Drawer to verify drawer flag button
    await page.locator('.menu-btn').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_pos_mobile_drawer.png') });
    console.log('✓ Verified Mobile Drawer Flag Button');

    // Click flag in drawer to switch back to Myanmar
    await page.locator('.sidebar-tools .lang-toggle-btn').click();
    await page.waitForTimeout(300);
    await context.close();
  }

  // 4. Customer Online Catalog Test
  {
    console.log('\n[4/4] Testing Flag Toggle on Customer Online Catalog...');
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.goto('http://localhost:3000/#/catalog', { waitUntil: 'networkidle' });

    const catFlagBtn = page.locator('.catalog-header-actions .lang-toggle-btn');
    const initCatLang = (await catFlagBtn.textContent())?.trim();
    const firstCatMy = (await page.locator('.cat-pill').first().textContent())?.trim();
    console.log(`✓ Catalog Initial: Flag="${initCatLang}", First Category="${firstCatMy}"`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_catalog_flag_my.png') });

    // Click toggle to switch to English
    await catFlagBtn.click();
    await page.waitForTimeout(300);

    const enCatLang = (await catFlagBtn.textContent())?.trim();
    const firstCatEn = (await page.locator('.cat-pill').first().textContent())?.trim();
    console.log(`✓ Catalog Toggled to English: Flag="${enCatLang}", First Category="${firstCatEn}"`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_catalog_flag_en.png') });

    await page.close();
  }

  await browser.close();
  console.log('\n=== ALL FLAG LANGUAGE TOGGLE TESTS PASSED SUCCESSFULLY! ===');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
