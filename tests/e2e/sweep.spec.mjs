// Final sweep: every route at the phone widths (owner, dealer, driver, start page) and the laptop widths (staff).
// English only. Each page must load with no console error, never scroll sideways, and show no clipped pill or button.
import { test as base, expect } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    page.errors = errors;
    await use(page);
  },
});

const PHONE = [360, 390, 430];
const LAPTOP = [1024, 1280, 1440];
const SEATS = [
  { seat: 'landing', widths: PHONE, routes: ['#/'] },
  {
    seat: 'owner', widths: PHONE,
    routes: ['#/owner', '#/owner/reports/company', '#/owner/reports/product', '#/owner/reports/dealer', '#/owner/reports/grid',
      '#/owner/reports/company/goldmedal', '#/owner/activity', '#/owner/invoice/DM%2F26-27%2F3001'],
  },
  { seat: 'dealer', widths: PHONE, routes: ['#/dealer/D-MYD-01'] },
  { seat: 'driver', widths: PHONE, routes: ['#/driver/demo'] },
  { seat: 'staff', widths: LAPTOP, routes: ['#/staff/inbound', '#/staff/outbound', '#/staff/orders', '#/staff/ledger', '#/staff/stock'] },
];

// Pills (.st, .chip) and buttons: the text must fit its box, and the box must sit inside the screen.
// Elements inside a deliberately scrollable box (a table that scrolls sideways) are left out.
function clipped() {
  const out = [];
  const scrolls = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth) return true; } return false; };
  for (const el of document.querySelectorAll('.st, .chip, button, a.btn, [role="button"], .stf-q, .fm-btn')) {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || scrolls(el)) continue;
    const name = `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`;
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') out.push(`${name}: text cut off (${el.scrollWidth} > ${el.clientWidth})`);
    if (r.left < -1 || r.right > innerWidth + 1) out.push(`${name}: outside the screen (${Math.round(r.left)}..${Math.round(r.right)} of ${innerWidth})`);
    if (el.matches('.st') && el.scrollHeight > el.clientHeight + 2) out.push(`${name}: pill text wraps out of its box`);
  }
  return out;
}

for (const { seat, widths, routes } of SEATS) {
  for (const width of widths) {
    test(`${seat} at ${width}: every route loads clean, fits, nothing clipped`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      for (const hash of routes) {
        await page.goto(`/index.html${hash}`);
        await page.locator('html[data-ready="1"]').waitFor({ state: 'attached' });
        await expect(page.locator('#view')).not.toBeEmpty();
        await page.waitForLoadState('networkidle');
        const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        expect(w[0], `${hash} at ${width}: the page scrolls sideways`).toBeLessThanOrEqual(w[1]);
        expect(await page.evaluate(clipped), `${hash} at ${width}`).toEqual([]);
        expect((await page.locator('body').innerText()), `${hash}: a raw string key shows`).not.toMatch(/\b(home|tile|att|cmp|bar|dues|brandPay|po|trip|dist|ak|age|stf|inv|d|dr|g)\.[a-z][a-zA-Z0-9]+\b/);
      }
      expect(page.errors).toEqual([]);
    });
  }
}
