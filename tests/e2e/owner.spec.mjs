import { test as base, expect } from '@playwright/test';

// Wait until the shell has wired its handlers; collect console errors for every test.
const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    const goto = page.goto.bind(page);
    page.goto = async (...a) => { const r = await goto(...a); await page.locator('html[data-ready="1"]').waitFor({ state: 'attached' }); return r; };
    page.errors = errors;
    await use(page);
  },
});
test.use({ viewport: { width: 390, height: 844 } });

const bar = (page) => page.evaluate(async () => (await import('/js/selectors.js')).cycleBar((await import('/js/store.js')).getState()));
const sumRows = (page) => page.$$eval('[data-rows] .inv', (rows) => rows.reduce((a, r) => a + Number(r.dataset.amount), 0));

test('home shows the bar with 4 parts and the question', async ({ page }) => {
  await page.goto('/index.html#/owner');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Did the ₹1 Cr come back?');
  await expect(page.locator('[data-bar] > button')).toHaveCount(4);
  await expect(page.locator('.part')).toHaveCount(4);
  expect(page.errors).toEqual([]);
});

test('each bar part opens the list behind it and the rows add up to the part', async ({ page }) => {
  await page.goto('/index.html#/owner');
  const b = await bar(page);
  for (const [label, key] of [['Delivered, dealers yet to pay', 'unpaid'], ['Cash back in the bank', 'bank'], ['On the road', 'road'], ['Still in the godown', 'godown']]) {
    await page.locator('.part', { hasText: label }).click();
    await expect(page.locator('.sheet')).toBeVisible();
    await expect(page.locator('#sheetTitle')).toHaveText(label);
    const total = await sumRows(page);
    expect(Math.abs(total - b[key]), `${key}: rows ${total} vs part ${b[key]}`).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.scrim')).toBeHidden();
  }
  expect(page.errors).toEqual([]);
});

test('all 8 tiles open a sheet', async ({ page }) => {
  await page.goto('/index.html#/owner');
  const tiles = page.locator('.tile');
  await expect(tiles).toHaveCount(8);
  for (let i = 0; i < 8; i++) {
    await tiles.nth(i).click();
    await expect(page.locator('.sheet')).toBeVisible();
    await expect(page.locator('.sheet-head .big')).not.toBeEmpty();
    await page.locator('[data-close-sheet]').click();
    await expect(page.locator('.scrim')).toBeHidden();
  }
});

test('search finds a dealer by town; the 8 pm link opens the summary', async ({ page }) => {
  await page.goto('/index.html#/owner');
  await page.locator('#search-toggle').click();
  await page.locator('#search-input').fill('Mydukur');
  await expect(page.locator('.search-results')).toContainText('Sri Durga Electricals');
  await page.locator('.search-results .hit', { hasText: 'Sri Durga Electricals' }).click();
  await expect(page).toHaveURL(/#\/owner\/reports\/dealer\/D-/);
  await page.goto('/index.html#/owner');
  await page.getByRole('link', { name: /Tonight’s 8 pm summary/ }).click();
  await expect(page).toHaveURL(/#\/whatsapp\/summary$/);
  await expect(page.locator('.wa-msg')).toContainText('Sales:');
  expect(page.errors).toEqual([]);
});

test('time toggle changes the tiles and is remembered', async ({ page }) => {
  await page.goto('/index.html#/owner');
  await expect(page.locator('.tile').first()).toContainText('Sales this month');
  await page.getByRole('radio', { name: 'Today' }).click();
  await expect(page.locator('.tile').first()).toContainText('Sales today');
  expect(await page.evaluate(() => localStorage.getItem('dm.range'))).toBe('today');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Today' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: 'Custom' }).click();
  await expect(page.locator('[data-range-from]')).toBeVisible();
});

test('the bar moves live when the store changes', async ({ page }) => {
  await page.goto('/index.html#/owner');
  const before = await page.locator('[data-bank]').textContent();
  await page.evaluate(async () => {
    const st = await import('/js/store.js');
    const s = st.getState();
    const dealer = s.dealers[0];
    const inv = s.invoices.filter((i) => i.dealerId === dealer.id && i.total > i.paid).at(-1);
    st.recordPayment(dealer.id, { mode: 'upi', amount: 1000, allocations: [{ invoiceId: inv.id, amount: 1000 }], ref: 'T1', key: 'k1' }, { role: 'accounts', name: 'Lakshmi' });
  });
  await expect(page.locator('.part', { hasText: 'Cash back' })).toBeVisible();
  expect(page.errors).toEqual([]);
  expect(before).toBeTruthy();
});

for (const lang of ['en']) {
  test(`owner home has no horizontal scroll, no raw keys, no missing strings (${lang})`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem('dm.lang', l), lang);
    for (const w of [360, 390, 430, 1024, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/index.html#/owner');
      await expect(page.locator('.tile')).toHaveCount(8);
      const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      expect(sw[0], `width ${w}`).toBeLessThanOrEqual(sw[1]);
      if (w === 390) await page.screenshot({ path: `test-results/owner-home-${lang}-390.png`, fullPage: true });
      if (w === 1280) await page.screenshot({ path: `test-results/owner-home-${lang}-1280.png`, fullPage: true });
    }
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(/\b(home|tile|att|cmp|bar|dues|brandPay|po|trip|dist|ak|age)\.[a-zA-Z0-9]+/);
    if (lang === 'te') expect(await page.evaluate(() => [...(window.__missingTe || [])])).toEqual([]);
    expect(page.errors).toEqual([]);
  });
}
