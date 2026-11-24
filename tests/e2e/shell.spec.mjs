import { test as base, expect } from '@playwright/test';

// Every test waits until the shell script has wired its handlers.
const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    page.goto = async (...a) => { const r = await goto(...a); await page.locator('html[data-ready="1"]').waitFor({ state: 'attached' }); return r; };
    await use(page);
  },
});

const WIDTHS = [360, 390, 430, 1024, 1280];

test('shell renders landing with header, role chip, search, toggle and footer', async ({ page }) => {
  await page.goto('/app.html');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('img', { name: 'Devansh Marketing' })).toBeVisible();
  await expect(page.locator('#role-chip')).toHaveText('Demo');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Devansh Marketing demo');
  await expect(page.locator('footer')).toHaveText('Sample data · Busy Fox demo');
});

test('EN | తె toggle flips html lang, translates, and is remembered', async ({ page }) => {
  await page.goto('/app.html');
  await page.getByRole('button', { name: 'తె' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'te');
  await expect(page.locator('footer')).toHaveText('శాంపిల్ డేటా · Busy Fox డెమో');
  await expect(page.getByRole('button', { name: 'తె' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('dm.lang'))).toBe('te');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'te');
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('hash routes update the view and role chip', async ({ page }) => {
  await page.goto('/app.html#/owner');
  await expect(page.locator('#role-chip')).toHaveText('Owner');
  await page.goto('/app.html#/dealer/d07');
  await expect(page.locator('#role-chip')).toHaveText('Dealer');
  await expect(page.locator('.stub code')).toHaveText('#/dealer/d07');
  await page.goto('/app.html#/nowhere');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('That page was not found');
});

test('demo still runs when localStorage throws', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  await page.goto('/app.html');
  await page.getByRole('button', { name: 'తె' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'te');
});

for (const lang of ['en', 'te']) {
  for (const width of WIDTHS) {
    test(`no horizontal scroll and tap targets >= 44px at ${width}px in ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.addInitScript((l) => { try { localStorage.setItem('dm.lang', l); } catch {} }, lang);
      await page.goto('/app.html');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('header a, header button, header input, main a')]
          .filter((e) => e.offsetParent !== null)
          .map((e) => [e.id || e.className || e.tagName, e.getBoundingClientRect()])
          .filter(([, r]) => r.height < 44 || r.width < 44)
          .map(([n, r]) => `${n} ${Math.round(r.width)}x${Math.round(r.height)}`));
      expect(small).toEqual([]);
      await page.screenshot({ path: `test-results/shell-${lang}-${width}.png` });
    });
  }
}

test('search opens on phone and stays inline on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto('/app.html');
  await expect(page.locator('#search-input')).toBeHidden();
  await page.locator('#search-toggle').click();
  await expect(page.locator('#search-input')).toBeVisible();
  await expect(page.locator('#search-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({ path: 'test-results/shell-search-open-360.png' });
  await page.setViewportSize({ width: 1280, height: 700 });
  await expect(page.locator('#search-input')).toBeVisible();
  await expect(page.locator('#search-toggle')).toBeHidden();
});
