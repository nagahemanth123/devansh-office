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

const st = (page, fn, arg) => page.evaluate(async ([src, a]) => { const m = await import('/js/store.js'); return new Function('m', 'a', `return (${src})(m, a)`)(m, a); }, [fn.toString(), arg]);
// A loaded trip for D-MYD-01 on vehicle V2 with driver DR2, as on the guided day.
const loadTrip = async (page) => { if (page.url() === 'about:blank') await page.goto('/index.html'); return loadTripNow(page); };
const loadTripNow = (page) => st(page, (m) => {
  const by = { role: 'sales', name: 'Sandeep' };
  const { invoice } = m.createOrder('D-MYD-01', [{ productId: 'parryware-casa-coupled-closet', qty: 8 }, { productId: 'parryware-elite-ewc', qty: 4 }], by);
  const trip = m.createTrip({ vehicleId: 'V2', driverId: 'DR2', invoiceIds: [invoice.id], ewayBill: '3412 7781 9025' }, by);
  m.markLoaded(trip.id, by);
  return { invoice: invoice.id, trip: trip.id };
});
const photo = { name: 'drop.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('/9j/4AAQSkZJRg==', 'base64') };
const tall = async (loc) => { for (const b of await loc.all()) if (await b.isVisible()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(56); };

test('dealer: what he owes, a credit bar, a 5-step tracker, invoice labels, two big buttons, and nothing private', async ({ page }) => {
  await page.goto('/index.html#/dealer/D-MYD-01');
  await expect(page.getByText('You owe', { exact: true })).toBeVisible();
  await expect(page.locator('[data-owes]')).toHaveAttribute('data-owes', '210000');
  await expect(page.locator('.dl-bar')).toBeVisible();
  await expect(page.locator('.dl-trk').first().locator('li')).toHaveCount(5);
  expect(await page.locator('[data-label]').count()).toBeGreaterThan(0);
  const labels = await page.locator('[data-label]').evaluateAll((els) => els.map((e) => e.textContent));
  for (const l of labels) expect(['Paid', 'Pending', 'Due soon', 'Overdue']).toContain(l);
  await expect(page.getByRole('button', { name: 'Reorder last order' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Raise a query' })).toBeVisible();
  await tall(page.locator('.pbtn'));
  const html = (await page.locator('#view').innerHTML());
  const others = await st(page, (m) => m.getState().dealers.filter((d) => d.id !== 'D-MYD-01').map((d) => d.name));
  for (const name of others) expect(html.includes(name), name).toBe(false);
  expect(html).not.toMatch(/purchaseRate|margin/i);
  expect(page.errors).toEqual([]);
});

test('dealer: a query appears in the staff orders; a reorder places an order; the OTP shows once loaded', async ({ page }) => {
  await page.goto('/index.html#/dealer/D-MYD-01');
  await page.getByRole('button', { name: 'Raise a query' }).click();
  await page.getByLabel('What do you want to ask us?').fill('Please send the invoice copy for last week.');
  await tall(page.locator('.pbtn'));
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('[data-note]')).toContainText('Sent');
  const before = await st(page, (m) => m.getState().orders.length);
  await page.getByRole('button', { name: 'Reorder last order' }).click();
  await page.getByRole('button', { name: 'Yes, order' }).click();
  await expect(page.locator('[data-note]')).toContainText('placed');
  expect(await st(page, (m) => m.getState().orders.length)).toBe(before + 1);
  await expect(page.locator('[data-otp]')).toHaveCount(0);
  await loadTrip(page);
  await page.goto('/index.html#/dealer/D-MYD-01');
  await expect(page.locator('[data-otp] b').first()).toHaveText('4721');
  await page.goto('/index.html#/staff/orders');
  await expect(page.locator('[data-queries]')).toContainText('Please send the invoice copy for last week.');
  expect(page.errors).toEqual([]);
});

test('driver: drops in order with a call link, wrong OTP then the right one', async ({ page }) => {
  await loadTrip(page);
  await page.goto('/index.html#/driver/DR2');
  const card = page.locator('[data-drop]').first();
  await expect(card).toContainText('Sri Durga Electricals');
  await expect(card.locator('a[href^="tel:"]')).toBeVisible();
  await tall(page.locator('.pbtn'));
  await card.getByRole('button', { name: 'Delivered', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(photo);
  await expect(page.locator('[data-photo-ok]')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await tall(page.locator('.pbtn'));
  await page.locator('[data-otp]').fill('0000');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('[data-error]')).toContainText('Wrong OTP');
  await page.locator('[data-otp]').fill('4721');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('[data-done]')).toContainText('Delivered');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(card).toHaveAttribute('data-status', 'delivered');
  expect(page.errors).toEqual([]);
});

test('driver offline: the delivery waits to sync, then syncs when the switch is off', async ({ page }) => {
  const { trip, invoice } = await loadTrip(page);
  await page.goto('/index.html#/driver/DR2');
  await page.getByRole('switch').click();
  const card = page.locator('[data-drop]').first();
  await card.getByRole('button', { name: 'Delivered', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(photo);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.locator('[data-otp]').fill('4721');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(card.getByText('Waiting to sync')).toBeVisible();
  expect(await st(page, (m, a) => m.getState().trips.find((t) => t.id === a).drops[0].status, trip)).toBe('pending');
  await page.getByRole('switch').click();
  await expect(card).toHaveAttribute('data-status', 'delivered');
  expect(await st(page, (m, a) => m.getState().invoices.find((i) => i.id === a).status, invoice)).toBe('delivered');
  expect(page.errors).toEqual([]);
});

test('driver: not delivered, partial asks which lines', async ({ page }) => {
  const { invoice } = await loadTrip(page);
  await page.goto('/index.html#/driver/DR2');
  const card = page.locator('[data-drop]').first();
  await card.getByRole('button', { name: 'Not delivered' }).click();
  await expect(page.getByRole('button', { name: 'Shop closed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rejected' })).toBeVisible();
  await tall(page.locator('.pbtn'));
  await page.getByRole('button', { name: 'Partial' }).click();
  await expect(page.locator('.dr-lines li')).toHaveCount(2);
  await tall(page.locator('.stp'));
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('[data-error]')).toBeVisible();
  await page.locator('.dr-lines li').first().getByRole('button', { name: 'One less' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(card).toHaveAttribute('data-status', 'partial');
  expect(await st(page, (m, a) => m.getState().invoices.find((i) => i.id === a).partial, invoice)).toBe(true);
  expect(page.errors).toEqual([]);
});

test('phone screens hold at 360 and 430', async ({ page }) => {
  await loadTrip(page);
  for (const lang of ['en']) {
    await page.addInitScript((l) => localStorage.setItem('dm.lang', l), lang);
    for (const w of [360, 430]) {
      await page.setViewportSize({ width: w, height: 844 });
      for (const hash of ['#/dealer/D-MYD-01', '#/driver/DR2']) {
        await page.goto(`/index.html${hash}`);
        await expect(page.locator('#view')).not.toBeEmpty();
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `${hash} ${w} ${lang}`).toBeLessThanOrEqual(0);
      }
    }
  }
});
