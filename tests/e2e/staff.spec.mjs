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
test.use({ viewport: { width: 1280, height: 800 } });

const PAGES = ['inbound', 'outbound', 'orders', 'ledger', 'stock'];
const QUICK = ['New purchase order', 'Record goods received', 'New dealer order', 'New trip', 'Record payment'];
const st = (page, fn, arg) => page.evaluate(async ([src, a]) => { const m = await import('/js/store.js'); const sel = await import('/js/selectors.js'); return new Function('m', 'sel', 'a', `return (${src})(m, sel, a)`)(m, sel, a); }, [fn.toString(), arg]);
const role = (page, r) => page.addInitScript((x) => localStorage.setItem('dm.staffRole', x), r);

test('the five quick actions are visible on every staff page', async ({ page }) => {
  for (const p of PAGES) {
    await page.goto(`/index.html#/staff/${p}`);
    await expect(page.locator('[data-quick]')).toHaveCount(5);
    for (const name of QUICK) await expect(page.locator('.stf-quick').getByRole('button', { name, exact: true })).toBeVisible();
  }
  expect(page.errors).toEqual([]);
});

test('inbound: one button, a double click moves one step, receiving short 10 raises a claim', async ({ page }) => {
  await page.goto('/index.html#/staff/inbound');
  const row = page.locator('[data-po="PO-2611-041"]');
  await expect(row.getByRole('button', { name: 'Move to next step' })).toHaveCount(1);
  await row.getByRole('button', { name: 'Move to next step' }).dblclick();
  expect(await st(page, (m) => m.getState().pos.find((p) => p.id === 'PO-2611-041').step)).toBe('onway');
  await expect(row.getByRole('button', { name: 'Move to next step' })).toHaveCount(0);
  await page.waitForTimeout(450); // a person pauses between the two taps; a double tap must not reach the next button
  await row.getByRole('button', { name: 'Record goods received' }).click();
  const panel = page.getByRole('dialog');
  const sw = panel.locator('[data-line="goldmedal-gifa-mini-10ax-switch"]');
  await sw.locator('[data-arrived]').fill('190');
  await expect(sw.locator('[data-short]')).toHaveText('10');
  await panel.getByRole('button', { name: 'Save goods received' }).click();
  await expect(panel.locator('[data-claim]')).toContainText('Claim CL-');
  expect(await st(page, (m) => m.getState().claims.filter((c) => c.poId === 'PO-2611-041').length)).toBe(1);
  expect(page.errors).toEqual([]);
});

test('order desk: credit left, a blocked discount, then an invoice with the GST layout', async ({ page }) => {
  await page.goto('/index.html#/staff/orders');
  await page.locator('.stf-quick').getByRole('button', { name: 'New dealer order' }).click();
  const panel = page.getByRole('dialog');
  await panel.getByPlaceholder('Name or town').fill('Durga');
  await panel.locator('[data-dealer="D-MYD-01"]').click();
  await expect(panel.locator('[data-credit-left]')).toContainText('₹3,90,000');
  await panel.getByPlaceholder('Type a name, brand or size').fill('casa coupled');
  await panel.locator('[data-pk-add]').first().click();
  const before = await st(page, (m) => m.getState().invoices.length);
  await panel.locator('[data-discount]').fill('5');
  await panel.getByRole('button', { name: 'Create order and invoice' }).click();
  await expect(panel.locator('[data-error]')).toContainText('above the 2% limit');
  expect(await st(page, (m) => m.getState().invoices.length)).toBe(before);
  await panel.locator('[data-discount]').fill('0');
  await expect(panel.locator('[data-credit-after]')).toBeVisible();
  await panel.getByRole('button', { name: 'Create order and invoice' }).click();
  const done = panel.locator('[data-result]');
  await expect(done).toContainText('created for');
  const id = await done.getAttribute('data-invoice');
  expect(await st(page, (m) => m.getState().invoices.length)).toBe(before + 1);
  await panel.locator('[data-invoice-link]').click();
  await expect(page).toHaveURL(/#\/owner\/invoice\//);
  const doc = page.locator('.invdoc');
  await expect(doc).toContainText(id);
  await expect(doc).toContainText('GSTIN 37XXXXX0000X1ZX');
  await expect(doc).toContainText('HSN');
  await expect(doc).toContainText('GST 18%');
  await expect(doc).toContainText('CGST 9%');
  await expect(doc).toContainText('SGST 9%');
  const grand = await doc.locator('[data-grand]').getAttribute('data-grand');
  expect(Number(grand)).toBe(await st(page, (m, s, a) => m.getState().invoices.find((i) => i.id === a).total, id));
  await expect(page.locator('.irn')).toContainText('e-invoice IRN / QR appears here');
});

test('an order over the credit limit waits for the admin, who approves it', async ({ page }) => {
  await role(page, 'admin');
  await page.goto('/index.html#/staff/orders');
  await expect(page.locator('[data-held-order]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Approve credit exception' }).click();
  await expect(page.locator('[data-held-order]')).toHaveCount(0);
  expect(page.errors).toEqual([]);
});

test('a new trip with that invoice asks for an e-way bill', async ({ page }) => {
  await page.goto('/index.html#/staff/outbound');
  const inv = await st(page, (m, s) => {
    const by = { role: 'sales', name: 'Sandeep' };
    return m.createOrder('D-MYD-01', [{ productId: 'parryware-casa-coupled-closet', qty: 8 }], by).invoice.id;
  });
  await page.locator('.stf-quick').getByRole('button', { name: 'New trip' }).click();
  const panel = page.getByRole('dialog');
  await expect(panel.locator('[data-eway-box]')).toBeHidden();
  await panel.locator(`[data-inv="${inv}"]`).check();
  await expect(panel.getByLabel('E-way bill number')).toBeVisible();
  await panel.getByRole('button', { name: 'Plan trip' }).click();
  await expect(panel.locator('[data-error]')).toContainText('e-way bill');
  expect(await st(page, (m) => m.getState().trips.length)).toBe(259);
  await panel.getByLabel('E-way bill number').fill('3412 7781 9025');
  await panel.getByRole('button', { name: 'Plan trip' }).click();
  await expect(panel.locator('[data-result]')).toContainText('planned');
  expect(await st(page, (m) => m.getState().trips.length)).toBe(260);
});

test('ledger: a payment that does not add up is refused, a split payment is saved', async ({ page }) => {
  await page.goto('/index.html#/staff/ledger');
  await expect(page.locator('[data-owes]')).toHaveAttribute('data-owes', '210000');
  await page.locator('.stf-quick').getByRole('button', { name: 'Record payment' }).click();
  const panel = page.getByRole('dialog');
  await panel.locator('[data-amount]').fill('1000');
  await panel.locator('[data-alloc-inv]').first().fill('400');
  await panel.getByRole('button', { name: 'Save payment' }).click();
  await expect(panel.locator('[data-error]')).toHaveText('Amounts must add up to the payment');
  expect(await st(page, (m) => m.getState().payments.length)).toBe(469);
  await panel.getByRole('button', { name: 'Fill oldest first' }).click();
  await panel.getByRole('button', { name: 'Save payment' }).click();
  await expect(panel.locator('[data-result]')).toContainText('saved');
  expect(await st(page, (m) => m.getState().payments.length)).toBe(470);
  await panel.getByRole('link', { name: 'Done' }).click();
  await expect(page.locator('[data-owes]')).toHaveAttribute('data-owes', '209000');
});

test('the Godown role never sees a purchase rate; the other roles do', async ({ page }) => {
  await role(page, 'godown');
  for (const p of PAGES) {
    await page.goto(`/index.html#/staff/${p}`);
    await expect(page.locator('.stf-page')).not.toBeEmpty();
    expect(await page.locator('[data-field=purchaseRate]').count(), p).toBe(0);
  }
  await page.goto('/index.html#/staff/inbound');
  await page.locator('.stf-quick').getByRole('button', { name: 'New purchase order' }).click();
  await page.getByRole('dialog').locator('[data-brand]').selectOption('goldmedal');
  await page.getByRole('dialog').getByRole('button', { name: 'Add' }).first().click();
  await expect(page.getByRole('dialog').locator('[data-qty]')).toHaveCount(1);
  expect(await page.locator('[data-field=purchaseRate]').count()).toBe(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Accounts', exact: true }).click();
  await expect(page.locator('.stf-inb [data-field=purchaseRate]').first()).toBeVisible();
});

test('layout holds at 1024', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  for (const lang of ['en']) {
    await page.addInitScript((l) => localStorage.setItem('dm.lang', l), lang);
    for (const p of PAGES) {
      await page.goto(`/index.html#/staff/${p}`);
      await expect(page.locator('[data-quick]')).toHaveCount(5);
      await expect(page.locator('.stf-page')).not.toBeEmpty();
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `${p} ${lang}`).toBeLessThanOrEqual(0);
    }
  }
});
