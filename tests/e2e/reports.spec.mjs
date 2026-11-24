import { test as base, expect } from '@playwright/test';

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

test('lens switch keeps the page skeleton; company shows 10 brand cards with a health word', async ({ page }) => {
  await page.goto('/app.html#/owner/reports/company');
  const skeleton = async () => page.evaluate(() => ['.ow-nav', '.rep-h', '.lenses', '.tt', '.filters', '[data-content]'].map((s) => !!document.querySelector(s)));
  expect(await skeleton()).toEqual([true, true, true, true, true, true]);
  const cards = page.locator('[data-brand-card]');
  await expect(cards).toHaveCount(10);
  for (const c of await cards.all()) await expect(c.locator('.st').first()).toHaveText(/Good|Watch|Problem/);
  for (const lens of ['Product', 'Dealer', 'Company']) {
    await page.locator('.lenses').getByRole('link', { name: lens, exact: true }).click();
    await expect(page.locator('.lenses [aria-current="page"]')).toHaveText(lens);
    expect(await skeleton()).toEqual([true, true, true, true, true, true]);
  }
  expect(page.errors).toEqual([]);
});

test('company drill Goldmedal > product > dealer > invoice: 4 crumbs, district filter kept', async ({ page }) => {
  await page.goto('/app.html#/owner/reports/company');
  await page.locator('.seg [data-val="Kadapa"]').click();
  await page.locator('[data-brand-card="goldmedal"] a.open').click();
  await page.locator('.lrow').first().click();
  await page.locator('.lrow').first().click();
  await page.locator('.lrow').first().click();
  await expect(page.locator('.invdoc')).toBeVisible();
  await expect(page.locator('.crumbs li')).toHaveCount(4);
  await expect(page.locator('.crumbs li').first()).toContainText('Goldmedal');
  await expect(page.locator('.seg [data-val="Kadapa"]')).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dm.filters')).district)).toBe('Kadapa');
  // invoice content: GST split and the boxed IRN placeholder
  await expect(page.locator('.invdoc')).toContainText('CGST');
  await expect(page.locator('.invdoc')).toContainText('SGST');
  await expect(page.locator('.invdoc')).toContainText('HSN');
  await expect(page.locator('.irn')).toContainText('e-invoice IRN / QR appears here');
  const id = decodeURIComponent((await page.url()).split('/').pop());
  const total = await page.evaluate(async (i) => (await import('/js/store.js')).getState().invoices.find((x) => x.id === i).total, id);
  expect(Number(await page.locator('[data-grand]').getAttribute('data-grand'))).toBe(total);
  // breadcrumb link goes back up
  await page.locator('.crumbs a').nth(1).click();
  await expect(page.locator('.crumbs li')).toHaveCount(2);
  expect(page.errors).toEqual([]);
});

test('reverse path Dealer > Brand > Product works', async ({ page }) => {
  await page.goto('/app.html#/owner/reports/dealer');
  await page.locator('[data-dealer-card] a.open').first().click();
  await page.locator('.lrow').first().click();
  await page.locator('.lrow').first().click();
  await expect(page.locator('.trail li')).toHaveCount(5);
  await page.locator('.lrow').first().click();
  await expect(page.locator('.invdoc')).toBeVisible();
  await expect(page.locator('.crumbs li')).toHaveCount(4);
  expect(page.errors).toEqual([]);
});

test('product lens lists fast, slow, dead and about-to-run-out with reorder quantity', async ({ page }) => {
  await page.goto('/app.html#/owner/reports/product');
  for (const name of ['Fast movers', 'Slow movers', 'Dead stock', 'About to run out']) await expect(page.getByRole('radio', { name: new RegExp(name) })).toBeVisible();
  await page.getByRole('radio', { name: /About to run out/ }).click();
  const rows = page.locator('[data-product-list] .lrow');
  if (await rows.count()) await expect(rows.first()).toContainText('Reorder');
  await page.getByRole('radio', { name: /Fast movers/ }).click();
  expect(await page.locator('[data-product-list] .lrow').count()).toBeGreaterThan(0);
});

test('grid shows 20 rows; a cell opens a trail card with 5 steps', async ({ page }) => {
  await page.goto('/app.html#/owner/reports/grid');
  await expect(page.locator('[data-grid] tbody tr')).toHaveCount(20);
  await page.locator('[data-cell]').first().click();
  await expect(page.locator('.sheet .trail li')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: /Outstanding/ }).click();
  await expect(page.locator('[data-grid]')).toBeVisible();
  expect(page.errors).toEqual([]);
});

test('activity lists audit entries and has no edit controls', async ({ page }) => {
  await page.goto('/app.html#/owner/activity');
  expect(await page.locator('.act').count()).toBeGreaterThan(10);
  expect(await page.locator('[data-activity] button, [data-activity] input, [data-activity] select, [data-activity] textarea, [contenteditable]').count()).toBe(0);
  expect(page.errors).toEqual([]);
});

for (const lang of ['en', 'te']) {
  test(`report pages fit the screen and have no missing strings (${lang})`, async ({ page }) => {
    await page.addInitScript((l) => localStorage.setItem('dm.lang', l), lang);
    for (const w of [360, 390, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const h of ['company', 'product', 'dealer', 'grid']) {
        await page.goto(`/app.html#/owner/reports/${h}`);
        await expect(page.locator('[data-content] > *').first()).toBeVisible();
        const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
        expect(sw[0], `${h} at ${w}`).toBeLessThanOrEqual(sw[1]);
      }
    }
    await page.goto('/app.html#/owner/activity');
    await expect(page.locator('.act').first()).toBeVisible();
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(/\b(rep|lens|bc|dc|pl|pf|grid|trail|inv|act|actor|flt|flag|health)\.[a-zA-Z0-9]+/);
    if (lang === 'te') expect(await page.evaluate(() => [...(window.__missingTe || [])])).toEqual([]);
    expect(page.errors).toEqual([]);
  });
}
