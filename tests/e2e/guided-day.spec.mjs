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

const st = (page, fn, arg) => page.evaluate(async ([src, a]) => { const m = await import('/js/store.js'); const sel = await import('/js/selectors.js'); return new Function('m', 'sel', 'a', `return (${src})(m, sel, a)`)(m, sel, a); }, [fn.toString(), arg]);
const photo = { name: 'drop.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('/9j/4AAQSkZJRg==', 'base64') };
const SCREENS = [
  { name: 'laptop', viewport: { width: 1280, height: 800 }, desktop: true },
  { name: 'phone', viewport: { width: 390, height: 844 }, desktop: false },
];

// Which steps are phone screens: they sit in the frame on a laptop. Staff steps do not.
const FRAMED = new Set([1, 5, 6, 8]);

const noTelugu = async (page) => expect(await page.evaluate(() => /[\u0C00-\u0C7F]/.test(document.body.innerText))).toBe(false);
const guide = (page) => page.locator('#guide');
const primary = (page) => guide(page).locator('[data-gb="primary"]');
// The guide ignores a second tap within 320 ms (a double tap on Next must not press the button that replaces it), so a person's next tap waits that long too.
const tap = async (page) => { await page.waitForTimeout(350); await primary(page).click(); };
const noSideScroll = async (page, what) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${what}: the page scrolls sideways`).toBeLessThanOrEqual(0);
const stepNow = async (page) => (await guide(page).locator('.g-dots li').evaluateAll((l) => l.findIndex((x) => x.classList.contains('now')))) + 1;
const bankText = (page) => page.locator('.part[data-part="bank"] .amt').first().innerText();

// The ring is on screen, inside the phone frame (laptop, phone screens) and clear of the bar / rail.
async function expectRing(page, n, desktop, frame) {
  const ring = page.locator('.guide-target').first();
  await expect(ring).toBeVisible();
  await expect(ring).toBeInViewport();
  const box = await ring.boundingBox();
  const g = await guide(page).boundingBox();
  const vp = page.viewportSize();
  if (desktop) expect(box.x).toBeGreaterThanOrEqual(g.x + g.width - 1);
  else expect(box.y + box.height).toBeLessThanOrEqual(g.y + 1);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  if (desktop && FRAMED.has(n)) {
    const f = await frame.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(f.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(f.x + f.width + 1);
  }
}

async function expectFrame(page, n, desktop) {
  if (!desktop) return;
  const framed = FRAMED.has(n);
  await expect(page.locator('#stage')).toHaveClass(framed ? /framed/ : /^(?!.*framed)/);
  if (framed) {
    const f = await page.locator('#phone').boundingBox();
    expect(f.width).toBeLessThanOrEqual(412);
    const v = await page.locator('#view').boundingBox();
    expect(v.width).toBeLessThanOrEqual(f.width);
  }
}

const closePanel = async (page) => { await page.locator('.sp [data-close-panel]').first().click(); await expect(page.getByRole('dialog')).toBeHidden(); };

// Walks the whole day by the guide's buttons, tapping the ringed target where the screen's own button does the step.
async function runDay(page, desktop, { stopAt = 9 } = {}) {
  await page.goto('/index.html');
  await page.locator('[data-reset]').click();
  await page.locator('[data-start-guide]').click();
  const info = {};
  for (let n = 1; n <= 8 && n < stopAt; n += 1) {
    await expect.poll(() => stepNow(page)).toBe(n);
    await expectFrame(page, n, desktop);
    await expectRing(page, n, desktop, page.locator('#phone'));
    await noTelugu(page);
    await noSideScroll(page, `step ${n}`);

    if (n === 1) { await expect(page.locator('[data-bar]')).toBeVisible(); info.before = await bankText(page); await tap(page); continue; }
    if (n === 2) {
      await page.locator('.guide-target').click(); // Move to next step
      await expect(page.locator('.guide-target[data-receive]')).toBeVisible();
      await expect.poll(() => st(page, (m) => m.getState().pos.find((p) => p.id === 'PO-2611-041').step)).toBe('onway');
    }
    if (n === 3 || n === 4 || n === 7) { // the target opens the real form; close it, the guide does the step
      await page.locator('.guide-target').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await closePanel(page);
    }
    if (n === 5) { // the driver does it for real: photo, then the dealer's OTP
      await page.locator('.guide-target').click();
      const ov = page.locator('.dr-ov');
      await ov.locator('input[type=file]').setInputFiles(photo);
      await ov.locator('[data-photo-next]').click();
      await ov.locator('[data-otp]').fill('4721');
      await ov.locator('[data-otp-go]').click();
      await expect(ov.locator('[data-done]')).toBeVisible();
      await ov.locator('[data-flow-close]').click();
    } else if (await primary(page).getAttribute('data-mode') === 'do') {
      await tap(page);
    }
    // the step is done: what changed shows up in the records
    await expect(primary(page)).not.toHaveAttribute('data-mode', 'do');
    if (n === 2) {
      expect(await st(page, (m) => m.getState().pos.find((p) => p.id === 'PO-2611-041').step)).toBe('received');
      expect(await st(page, (m) => m.getState().claims.filter((c) => c.poId === 'PO-2611-041').length)).toBe(1);
    }
    if (n === 3) {
      info.invoice = await st(page, (m) => m.getState().invoices.at(-1).id);
      expect(await st(page, (m) => m.getState().invoices.at(-1).dealerId)).toBe('D-MYD-01');
      await expect(primary(page)).toHaveAttribute('data-mode', 'phase'); // second stop: the invoice
      await tap(page);
      await expect(page.locator('.guide-target[data-grand]')).toBeVisible();
      await expectRing(page, n, desktop, page.locator('#phone'));
    }
    if (n === 4) expect(await st(page, (m) => m.getState().trips.at(-1).status)).toBe('left');
    if (n === 5) expect(await st(page, (m) => m.getState().trips.at(-1).drops[0].status)).toBe('delivered');
    if (n === 6) {
      await expect(page.locator('.dl-order[data-step="delivered"]').first()).toBeVisible();
      expect(Number(await page.locator('[data-owes]').first().getAttribute('data-owes'))).toBeGreaterThan(210000);
    }
    if (n === 7) {
      expect(await st(page, (m, sel) => sel.invoiceBalance(m.getState().invoices.at(-1)) > 0)).toBe(true); // half is still pending
      expect(await st(page, (m) => m.getState().payments.at(-1).mode)).toBe('upi');
    }
    if (n === 8) {
      await expect(page.locator('.part[data-part="bank"]')).toBeVisible();
      info.after = await bankText(page);
      expect(info.after).not.toBe(info.before);
      const text = await guide(page).locator('.g-text').innerText();
      expect(text).toContain(info.after);
      expect(text).toContain(info.before);
      // the bar says what moved since morning, the greeting reads evening, and the total is not claimed to stay the same
      await expect(page.locator('.hello b')).toHaveText('Good evening');
      await expect(page.locator('.hello span')).toContainText('pm');
      await expect(page.locator('[data-since]')).toContainText('This morning');
      await expect(page.locator('.part[data-part="bank"] [data-delta]')).toContainText('since morning');
      await expect(page.locator('.part[data-part="bank"] [data-delta]')).toContainText('+');
      expect(text).not.toMatch(/stays the same/i);
      expect(await page.locator('.part [data-delta]').count()).toBe(4);
      await noTelugu(page);
      await expectFrame(page, 8, desktop);
      await expectRing(page, 8, desktop, page.locator('#phone'));
      await expect(primary(page)).toHaveAttribute('data-mode', 'finish');
      await noSideScroll(page, 'step 8 end');
      await tap(page); // finish
      await expect(page.locator('[data-start-guide]')).toBeVisible();
      await expect(guide(page)).toBeHidden();
      break;
    }
    await tap(page); // Next
  }
  return info;
}

for (const sc of SCREENS) {
  test.describe(`${sc.name} ${sc.viewport.width}`, () => {
    test.use({ viewport: sc.viewport });

    test('the whole day, by tapping what is ringed, moves the bar and ends on the evening bar', async ({ page }) => {
      const info = await runDay(page, sc.desktop);
      expect(info.before).not.toBe(info.after);
      expect(page.errors).toEqual([]);
    });

    test('reload at step 5 resumes at step 5 with the state intact', async ({ page }) => {
      await runDay(page, sc.desktop, { stopAt: 5 });
      await expect.poll(() => stepNow(page)).toBe(5);
      const before = await st(page, (m) => ({ rev: m.getState().rev, inv: m.getState().invoices.length, po: m.getState().pos.find((p) => p.id === 'PO-2611-041').step, trip: m.getState().trips.at(-1).status }));
      expect(before.po).toBe('received');
      await page.reload();
      await page.locator('html[data-ready="1"]').waitFor({ state: 'attached' });
      await expect(guide(page)).toBeVisible();
      await expect.poll(() => stepNow(page)).toBe(5);
      expect(await st(page, (m) => ({ rev: m.getState().rev, inv: m.getState().invoices.length, po: m.getState().pos.find((p) => p.id === 'PO-2611-041').step, trip: m.getState().trips.at(-1).status }))).toEqual(before);
      await expectRing(page, 5, sc.desktop, page.locator('#phone'));
      // and the day can be finished from here
      await page.locator('.guide-target').click();
      const ov = page.locator('.dr-ov');
      await ov.locator('input[type=file]').setInputFiles(photo);
      await ov.locator('[data-photo-next]').click();
      await ov.locator('[data-otp]').fill('4721');
      await ov.locator('[data-otp-go]').click();
      await ov.locator('[data-flow-close]').click();
      await tap(page);
      await expect.poll(() => stepNow(page)).toBe(6);
    });

    test('reset, then the guide runs again and passes', async ({ page }) => {
      const first = await runDay(page, sc.desktop);
      await page.locator('[data-reset]').click();
      await expect(page.locator('[data-reset-note]')).not.toBeEmpty();
      expect(await st(page, (m) => m.getState().pos.find((p) => p.id === 'PO-2611-041').step)).toBe('left');
      const second = await runDay(page, sc.desktop);
      expect(second.before).toBe(first.before); // the starting day is the same every time
      expect(second.after).toBe(first.after);
      expect(page.errors).toEqual([]);
    });
  });
}

test.describe('start page and roles', () => {
  test('no Telugu anywhere, and a saved dm.lang=te is ignored', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('dm.lang', 'te'));
    for (const h of ['', '#/owner', '#/staff/inbound', '#/dealer/D-MYD-01']) {
      await page.goto(`/index.html${h}`);
      await expect(page.locator('#view')).not.toBeEmpty();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('.lang')).toHaveCount(0);
      await noTelugu(page);
    }
  });

  test('no visible text says WhatsApp, and an old #/whatsapp link opens the start page', async ({ page }) => {
    for (const h of ['', '#/owner', '#/staff/inbound', '#/staff/ledger', '#/dealer/D-MYD-01', '#/driver/demo']) {
      await page.goto(`/index.html${h}`);
      await expect(page.locator('#view')).not.toBeEmpty();
      expect((await page.locator('body').innerText()).toLowerCase(), h).not.toContain('whatsapp');
      expect(await page.locator('a[href*="whatsapp"]').count(), h).toBe(0);
    }
    // through the guided day too: every step's screen and the bar
    await page.goto('/index.html');
    await page.locator('[data-start-guide]').click();
    for (let n = 1; n <= 8; n += 1) {
      await expect.poll(() => stepNow(page)).toBe(n);
      expect((await page.locator('body').innerText()).toLowerCase(), `step ${n}`).not.toContain('whatsapp');
      for (let k = 0; n < 8 && k < 4 && (await stepNow(page)) === n; k += 1) {
        await tap(page);
        expect((await page.locator('body').innerText()).toLowerCase(), `step ${n} after tap ${k}`).not.toContain('whatsapp');
      }
    }
    for (const h of ['#/whatsapp/summary', '#/whatsapp/otp', '#/whatsapp']) {
      await page.goto(`/index.html${h}`);
      await expect(page.locator('[data-role-card]')).toHaveCount(4);
      await expect(page).toHaveURL(/index\.html#\/$/);
    }
    expect(page.errors).toEqual([]);
  });

  test('a double tap on Next lands on the next step and does not run it', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('[data-reset]').click();
    await page.locator('[data-start-guide]').click();
    await expect.poll(() => stepNow(page)).toBe(1);
    await page.waitForTimeout(350);
    await primary(page).dblclick();
    await expect.poll(() => stepNow(page)).toBe(2);
    await expect(primary(page)).toHaveAttribute('data-mode', 'do');
    expect(await st(page, (m) => m.getState().pos.find((p) => p.id === 'PO-2611-041').step)).toBe('left');
  });

  test('the scripted clock reads morning, then afternoon, then evening', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('[data-reset]').click();
    await page.locator('[data-start-guide]').click();
    await expect(page.locator('.hello b')).toHaveText('Good morning');
    const audit0 = await st(page, (m) => m.getState().audit.length);
    await tap(page);
    await expect.poll(() => stepNow(page)).toBe(2);
    expect(await st(page, (m) => m.getState().clock.slice(11))).toBe('10:20');
    expect(await st(page, (m) => m.getState().audit.length)).toBe(audit0); // moving the clock writes no audit entry
  });

  test.use({ viewport: { width: 1280, height: 800 } });

  test('four role cards, the guide, reset, Previews; the chip switches roles', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('[data-role-card]')).toHaveCount(4);
    await expect(page.locator('[data-start-guide]')).toBeVisible();
    await expect(page.locator('[data-reset]')).toBeVisible();
    await expect(page.locator('#ftr-previews')).toHaveAttribute('href', 'previews/');
    for (const [seat, hash] of [['dealer', '#/dealer/D-MYD-01'], ['owner', '#/owner'], ['staff', '#/staff']]) {
      await page.locator('#role-chip').click();
      await page.locator(`#role-menu [data-seat="${seat}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${hash.replace(/[/#]/g, '\\$&')}`));
    }
    await page.locator('#role-chip').click();
    await page.locator('#role-menu [data-seat="landing"]').click();
    await expect(page.locator('[data-role-card]')).toHaveCount(4);
    expect(page.errors).toEqual([]);
  });

  test('outside the guide the driver screen has drops today; app.html still opens the demo', async ({ page }) => {
    await page.goto('/index.html#/driver/demo');
    await expect(page.locator('[data-drop]').first()).toBeVisible();
    await page.goto('/app.html#/owner');
    await page.waitForURL(/index\.html#\/owner/);
    await expect(page.locator('[data-bar]')).toBeVisible();
  });

  test('Leave guide hides the bar and the ring; free clicking works', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('[data-start-guide]').click();
    await expect(guide(page)).toBeVisible();
    await guide(page).locator('[data-gb="exit"]').click();
    await expect(guide(page)).toBeHidden();
    await expect(page.locator('.guide-target')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('dm.guide'))).toBeNull();
  });
});
