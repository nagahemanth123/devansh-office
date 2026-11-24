# Devansh Marketing clickable demo: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hosted, no-login clickable demo of the Devansh dashboard (owner, staff, dealer, driver and WhatsApp mockups) in the "Godown board" look, which runs the brief's acceptance-test day end to end.

**Architecture:** A static site with no build step. One pure-logic module (`js/store.js`) holds the records, the business rules and the selectors, persists to localStorage, and is unit-tested in Node. Views are plain ES modules that render from the store, routed by URL hash inside one app shell. A Node script generates the product data and web-size photos once from the real catalogue.

**Tech Stack:** HTML, CSS, vanilla JS ES modules; Node 24 `node --test` for logic; Playwright (`npx playwright`, Chromium) for end-to-end; macOS `sips` for photo resizing; GitHub Pages hosting.

**Spec:** `/Users/nagahemanth/Downloads/devansh-office/docs/2026-11-24-devansh-demo-design.md` (read it with the source brief `~/Downloads/Devansh Marketing Dashboard Brief.docx`). Look reference: `site/previews/godown-board/index.html`.

**Repo:** `/Users/nagahemanth/Downloads/devansh-office/site` (git, `main`, remote `nagahemanth123/devansh-office`). All paths below are relative to it. Do not touch `previews/`.

## Global Constraints

- Tokens, copied from the Godown board look: sapphire `#0F52BA`, press `#0B4296`, ink `#0A3A84`; text `#0E1A2B` / `#38424F` / `#5A6372`; paper `#F3F2EE`, card `#FFFFFF`, line `#E2E0D9`, well `#E7E5DE`, page `#DEDCD5`; status green `#17804A`, blue `#2563EB`, amber `#AE5A00`, red `#C22A2A`, neutral `#59636F`; radius 14 px; font `"Archivo","Anek Telugu",system-ui,sans-serif` (Archivo from Google Fonts `wdth,wght@62..125,400..900`; Anek Telugu from `assets/fonts/AnekTelugu-Variable.woff2`).
- Money is Indian only: `₹1.38 Cr`, `₹44.3 L` (one decimal for L and two for Cr in short form), `₹86,000`, `₹1,38,00,000` in full. Never M or K.
- Status = solid colour + word, the same mapping everywhere: green received/paid/fine, blue in progress, amber due soon/needs a look, red overdue/short/problem.
- Plain words: "Dealers owe us", "Goods received", "We owe brands". Banned: glows, gradients, glass/blur, emoji, icon-in-circle grids, eyebrow labels on every heading, shadows on everything.
- Tap targets ≥ 44 px; driver and dealer primary buttons ≥ 56 px; body ≥ 15 px on phone; WCAG AA.
- Phone widths 360/390/430; staff desktop 1280/1440, tablet 1024.
- Dealer and driver views never render purchase rates, margins, or another dealer's name or amounts. Godown staff never see purchase rates or margins.
- Every screen footer: "Sample data · Busy Fox demo". EN default; EN | తె toggle on every screen, remembered (`localStorage['dm.lang']`).
- Every displayed total comes from a selector over records. No typed-in totals.
- Commit after each task with the message given, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Reload or close the tab mid guided day:** state and the current guide step come back exactly where they were. Test in Task 7.
2. **localStorage unavailable (private mode or full):** the demo still runs in memory and shows no error. Test in Task 2.
3. **Double tap on a step button** ("Move to next step", "Delivered", "Record payment"): the action happens once, not twice. Test in Task 2 (actions idempotent per id/step) and Task 5.
4. **Payment allocations not adding up** (allocations ≠ amount, or more than an invoice's balance): the form blocks it with a plain message, and the store throws. Test in Task 2.
5. **Long Telugu strings at 360 px** (tiles, buttons, status pills): they wrap without clipping or horizontal scroll. Test in Task 8's width sweep in తె.

---

### Task 1: Foundation: money, i18n, catalogue data, app shell

**Files:**
- Create: `js/money.js`, `js/i18n.js`, `js/strings/en.js`, `js/strings/te.js`, `css/tokens.css`, `css/app.css`, `app.html`, `js/router.js`, `tools/build-catalog.mjs`, `js/data/catalog.js` (generated), `assets/` (copy `previews/assets/{brands,devansh,fonts}`; product photos to `assets/products/<brand>/<id>.webp`)
- Test: `tests/money.test.mjs`, `tests/catalog.test.mjs`

**Interfaces:**
- Produces: `formatINR(n: number, opts?: {full?: boolean}) -> string`; `t(key: string, vars?: object) -> string`; `getLang() -> 'en'|'te'`; `setLang(l)`; `onLangChange(fn)`; `CATALOG: {brands: Brand[], products: Product[]}` where `Brand = {key, name, colour, logo}` and `Product = {id, brand, category, name, size, mrp, mrpSample: boolean, gstPct, photo}`; `route(hash) / onRoute(fn)` with hashes `#/owner`, `#/owner/reports/:lens`, `#/staff/:page`, `#/dealer/:dealerId`, `#/driver/:driverId`, `#/whatsapp/:kind`, `#/` (landing).

- [ ] **Step 1: Write the failing tests**
```js
// tests/money.test.mjs
assert.equal(formatINR(13800000), '₹1.38 Cr');
assert.equal(formatINR(4430000), '₹44.3 L');
assert.equal(formatINR(3300000), '₹33.0 L');
assert.equal(formatINR(86000), '₹86,000');
assert.equal(formatINR(13800000, {full: true}), '₹1,38,00,000');
assert.equal(formatINR(-14600), '−₹14,600');
// tests/catalog.test.mjs
assert.equal(CATALOG.brands.length, 10);
assert.ok(CATALOG.products.length >= 500);           // 485 real + Victura 8 + Poddar ~12
assert.ok(CATALOG.products.every(p => p.mrp > 0 && p.gstPct > 0 && p.photo));
assert.ok(new Set(CATALOG.products.map(p => p.id)).size === CATALOG.products.length);
```
- [ ] **Step 2:** Run `node --test tests/` and expect FAIL (modules missing).
- [ ] **Step 3:** Implement `formatINR` (short form ≥ 1 Cr → 2 decimals Cr; ≥ 1 L → 1 decimal L; below → lakh-comma rupees; ` ` between figure and L/Cr).
- [ ] **Step 4:** Write `tools/build-catalog.mjs`. It reads `~/FoxCut-packs/devansh-marketing/src/catalog/*.json` and builds Victura (8 fans) and Poddar (about 12 lines) from `~/Downloads/devansh-awareness-posters/assets/{victura,poddar}/FACTS.md` plus their `product-*.png`. Missing MRP → a believable sample with `mrpSample: true`. GST: 18% default. Brand colours come from the logos. Photos are resized to max 400 px webp (`sips` then `cwebp` if present, else JPEG at 80). It writes `js/data/catalog.js` as an ES module. Run it.
- [ ] **Step 5:** Write `css/tokens.css` (Global Constraints values as CSS variables), the `i18n` module (keys in `en.js`/`te.js`; `t()` falls back to EN and logs missing TE keys to `window.__missingTe`), the router, and `app.html` (header with logo, role chip, search, EN | తె toggle; `<main id="view">`; footer).
- [ ] **Step 6:** Run `node --test tests/` and expect PASS. Open `app.html` via `python3 -m http.server` and check that the shell renders and the toggle flips `<html lang>`.
- [ ] **Step 7:** Commit: `feat: foundation (money, i18n, catalogue, shell)`.

### Task 2: The store: records, scripted seed, business rules, selectors

**Files:**
- Create: `js/store.js`, `js/seed.js`, `js/selectors.js`
- Test: `tests/store.test.mjs`, `tests/selectors.test.mjs`

**Interfaces:**
- Consumes: `CATALOG`, `formatINR`.
- Produces (all actions take `by: {role, name}` last; each writes one audit entry `{at, by, action, ref, summary}` and returns the changed record; persistence key `dm.state.v1`):
  - `getState()`, `subscribe(fn) -> unsubscribe`, `resetDemo()`, `seed(today = '2026-11-24') -> State` (deterministic, seeded PRNG `mulberry32(20261124)`).
  - `createPO(brandKey, lines:[{productId, qty, rate}], by) -> PO`
  - `advancePO(poId, by) -> PO` (steps `ordered → left → onway → received`; at `onway`, calling it opens the receive flow instead of jumping to received: it throws `'use receivePO'`)
  - `receivePO(poId, lines:[{productId, received, short, damaged}], photo: string|null, by) -> GRN` (stock += received − damaged; damaged → `damagedStock`; `short + damaged > 0` → creates `Claim {brand, amount = (short+damaged)×rate}` and reduces the brand payable)
  - `createOrder(dealerId, lines:[{productId, qty, rate}], by) -> {order, invoice|null, needsApproval: boolean}` (if outstanding + order total > credit limit → `needsApproval`, no invoice yet; else invoice created now, stock −= qty; throws `'insufficient stock'`)
  - `approveCredit(orderId, by)` (Admin only, else throws `'not allowed'`) → creates the invoice.
  - `createTrip({vehicleId, driverId, invoiceIds, ewayBill?}, by) -> Trip` (throws `'eway bill needed'` if the trip total > 50000 and no `ewayBill`; each drop gets a 4-digit OTP)
  - `markLoaded(tripId, by)`, `markLeft(tripId, by)`
  - `markDelivered(tripId, invoiceId, {photo, otp}, by) -> 'ok'|'bad-otp'` (second call for the same drop is a no-op that returns `'ok'`)
  - `markNotDelivered(tripId, invoiceId, reason: 'closed'|'rejected'|'partial', partialLines?, by)`
  - `recordPayment(dealerId, {mode: 'cash'|'upi'|'cheque', amount, allocations:[{invoiceId, amount}], ref?}, by) -> Payment` (throws `'allocations must equal amount'`, `'more than balance'`; cheque counts toward "Cash back" only when cleared)
  - `setCheque(paymentId, 'cleared'|'bounced', by)` (bounced → allocations reversed, red attention item)
  - `raiseQuery(dealerId, text)`
  - Selectors in `selectors.js` (pure, `(state, opts) -> value`): `cycleBar(state, {month}) -> {total, godown, road, unpaid, bank, incoming}` (spec §4 definition, at purchase cost; parts sum to total within ₹1); `tiles(state, {range})` (8 tiles with `{key, value, compare, status}`); `attention(state)` (sorted by money at risk desc); `comingIn`, `goingOut`; `districtWeekly`; `brandCards(state, {range, district})`; `productRows`; `dealerCards`; `grid(state, {metric: 'sold'|'outstanding', top: 20, q})`; `trail(state, productId, dealerId)`; `dealerBalance(state, dealerId) -> {owes, limit, used, ageing: {d0_30, d31_60, d60p}, nextDue}`; `stock(state, {q, brand})`; `recordsBehind(state, key) -> Record[]`; `summary8pm(state, date)`.
- Scripted guided-day records in the seed (exact IDs; later tasks rely on them): PO `PO-2611-041` Goldmedal, step `left`, 6 lines including `6A modular switch` qty 200; dealer `D-MYD-01` "Sri Durga Electricals, Mydukur", credit limit ₹6,00,000, outstanding ₹2,10,000; vehicle `V2` "AP 04 TV 1187", driver `DR2` "Suresh"; the guided order ≈ ₹1,80,000 of Parryware + Ultravolt lines; the guided drop OTP `4721`; the guided UPI payment = half the guided invoice.

- [ ] **Step 1: Write the failing tests** (`tests/store.test.mjs`), each starting from `seed()`:
```js
test('stock rises only on receive', …) // createPO → stock unchanged; advancePO ×2 → unchanged; receivePO → +received−damaged
test('short on receipt makes a claim and cuts the payable', …) // receivePO PO-2611-041 with short 10 on 6A switch → claim.amount === 10*rate; payable drops by the same
test('invoice drops stock at creation, not delivery', …)
test('over-limit order needs admin approval', …) // order > headroom → needsApproval true, no invoice; approveCredit by sales → throws 'not allowed'; by admin → invoice
test('eway bill required over 50000', …)
test('delivery needs the right OTP and is idempotent', …) // 'bad-otp' then 'ok', second 'ok' changes nothing
test('split payment across invoices and part-pay', …)
test('allocations must equal amount / not exceed balance', …) // both throw
test('bounced cheque puts dues back and flags red', …)
test('every action writes an audit entry', …)
test('works without localStorage', …) // globalThis.localStorage = undefined → seed/actions still work
test('seed is deterministic', …) // JSON.stringify(seed()) === JSON.stringify(seed())
```
`tests/selectors.test.mjs`:
```js
test('cycle bar parts add up', …) // |godown+road+unpaid+bank − total| ≤ 1
test('seed lands near the preview', …) // total within ±10% of 13800000; bank ±15% of 5210000; unpaid ±15% of 4430000
test('every tile traces to records', …) // for each tile key, sum(recordsBehind) === tile.value (±1)
test('guided day moves the bar', …) // run the 8 guided actions; bank and unpaid change; godown down by the guided invoice cost
test('dealer view data has no rates or other dealers', …) // dealerView(state,'D-MYD-01') JSON has no 'purchaseRate'|'margin' and no other dealer id
```
- [ ] **Step 2:** Run `node --test tests/` and expect FAIL.
- [ ] **Step 3:** Implement `seed.js`. About 40 dealers in the 15 spec towns, 5 vehicles, 5 drivers, 16 staff, and about 2 months of history (POs, GRNs, invoices, trips, payments incl. cheques) tuned so the preview-near test passes, plus the scripted guided-day records above. Add `dealerView(state, dealerId)` and `driverView(state, driverId)` as the only data the dealer and driver screens may read.
- [ ] **Step 4:** Implement the actions in `store.js` (persist after each action; on load, a parse failure or missing storage → fresh seed in memory) and the selectors in `selectors.js`.
- [ ] **Step 5:** Run `node --test tests/` and expect PASS.
- [ ] **Step 6:** Commit: `feat: store, seed and business rules`.

### Task 3: Owner home (live Godown board) + drill-down + search + time + 8 pm summary

**Files:**
- Create: `js/views/owner-home.js`, `js/ui/sheet.js` (bottom sheet listing `recordsBehind` with a total line), `js/ui/search.js`, `js/ui/time-toggle.js`, `js/views/whatsapp.js` (the `summary8pm` kind here; the other kinds in Task 6), `css/owner.css`
- Test: `tests/e2e/owner.spec.mjs`

**Interfaces:** Consumes the selectors, `formatINR`, `t`. Produces `renderOwnerHome(el)`, `openRecords(key, title)`, `TimeRange = 'today'|'week'|'month'|{from,to}` stored at `localStorage['dm.range']`.

- [ ] **Step 1: Write the failing e2e test:** at 390×844, `#/owner` shows the bar with 4 parts and the text "Did the ₹1 Cr come back?". Tapping "Delivered, dealers yet to pay" opens a sheet whose rows' amounts sum to the bar part. Tapping each of the 8 tiles opens a sheet. The search "Mydukur" finds `Sri Durga Electricals`. The "Tonight's 8 pm summary" link opens `#/whatsapp/summary`. There are no console errors.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/owner.spec.mjs` and expect FAIL.
- [ ] **Step 3:** Port the preview's layout and CSS into `owner-home.js`/`owner.css`, rendering from selectors (header, sapphire block, thick bar, 8 tiles, attention, trackers, district chart as hand SVG with the partial-week note, top brands, money tables), with the time toggle above the tiles. Re-render on `subscribe` and `onLangChange`.
- [ ] **Step 4:** Run the test and expect PASS. Visually compare against `previews/godown-board/shot-390.png` (the same look).
- [ ] **Step 5:** Commit: `feat: owner home live`.

### Task 4: Owner reports: lenses, grid, trail, drill path, activity

**Files:**
- Create: `js/views/owner-reports.js`, `js/views/owner-activity.js`, `js/ui/breadcrumb.js`, `js/ui/filters.js` (district, brand, dealer, salesperson; remembered in `localStorage['dm.filters']`)
- Test: `tests/e2e/reports.spec.mjs`

- [ ] **Step 1: Write the failing e2e test:** the lens switch Company | Product | Dealer keeps the same page skeleton. Company shows 10 brand cards, each with a health word. Drilling Goldmedal → a product → a dealer → an invoice shows a breadcrumb of 4 crumbs and keeps the district filter. The reverse path Dealer → Brand → Product works. The grid shows 20 rows by default, and a cell opens a trail card with 5 steps. Activity lists audit entries and has no edit controls.
- [ ] **Step 2:** Run it and expect FAIL.
- [ ] **Step 3:** Implement the views from `brandCards`, `productRows` (with fast/slow/dead/run-out lists and the reorder qty), `dealerCards` (flags), `grid`, `trail`, in the Godown board language (brand colour band and logo on brand cards).
- [ ] **Step 4:** Run it and expect PASS.
- [ ] **Step 5:** Commit: `feat: owner reports`.

### Task 5: Staff desktop

**Files:**
- Create: `js/views/staff.js` (shell, quick-actions bar, staff role picker Godown/Sales desk/Accounts/Admin at `localStorage['dm.staffRole']`), `js/views/staff-inbound.js`, `js/views/staff-outbound.js`, `js/views/staff-ledger.js`, `js/views/staff-stock.js`, `js/views/staff-orders.js`, `js/ui/panel.js` (side panel for the 5 forms), `js/ui/product-picker.js` (photo, MRP, dealer rate), `css/staff.css`
- Test: `tests/e2e/staff.spec.mjs`

- [ ] **Step 1: Write the failing e2e test** at 1280×800:
  - The 5 quick actions are visible on every staff page.
  - The inbound row PO-2611-041 has one "Move to next step" button. Double-clicking it advances only one step. At "On the way" the button reads "Record goods received" and opens the check with short 10 → a claim is visible.
  - New dealer order for `D-MYD-01` shows credit left and creates an invoice. A discount above the limit (sample: 5% off the dealer rate for Sales desk) is blocked with a message.
  - The invoice view (`js/views/invoice.js`, also opened from owner drill-downs) shows GSTIN placeholders, HSN/GST % and CGST+SGST lines per item, a grand total that equals the record, and a boxed "e-invoice IRN / QR appears here" placeholder.
  - New trip with that invoice asks for an e-way bill.
  - In the ledger, a payment whose allocations don't add up shows "Amounts must add up to the payment" and isn't saved.
  - The Godown role hides every purchase-rate column (no `[data-field=purchaseRate]` in the DOM).
  - The layout also works at 1024.
- [ ] **Step 2:** Run it and expect FAIL.
- [ ] **Step 3:** Implement the views. The forms call the store actions and disable their submit button while running.
- [ ] **Step 4:** Run it and expect PASS.
- [ ] **Step 5:** Commit: `feat: staff desktop`.

### Task 6: Dealer, driver and WhatsApp mockups

**Files:**
- Create: `js/views/dealer.js`, `js/views/driver.js`, extend `js/views/whatsapp.js` (kinds `summary`, `reminder` (TE + EN), `otp`), `css/phone-roles.css`
- Test: `tests/e2e/dealer-driver.spec.mjs`

- [ ] **Step 1: Write the failing e2e test** at 390×844:
  - The dealer `#/dealer/D-MYD-01` shows "You owe", a credit bar, a 5-step tracker, invoice labels, and Reorder / Raise a query (the query then appears in staff orders). Its HTML contains no other dealer name and no `purchaseRate` or `margin`.
  - The driver `#/driver/DR2` lists drops in order with a call link. Delivered → photo input → OTP `0000` gives "Wrong OTP"; `4721` gives Delivered. With the offline toggle on, a delivery shows "Waiting to sync" and syncs when toggled off.
  - Not delivered → Partial asks for lines.
  - The primary buttons are ≥ 56 px tall.
- [ ] **Step 2:** Run it and expect FAIL.
- [ ] **Step 3:** Implement, reading only `dealerView`/`driverView`. The WhatsApp screens are generic chat bubbles: no WhatsApp logo or name, and a "Nothing is sent in this demo" line.
- [ ] **Step 4:** Run it and expect PASS.
- [ ] **Step 5:** Commit: `feat: dealer, driver, whatsapp`.

### Task 7: Landing, role switching, phone frame, guided day, full Telugu

**Files:**
- Create: `index.html` (replaces the redirect: landing with the 4 role cards, "One day at Devansh", "Reset demo"; it loads the app shell), `js/views/landing.js`, `js/guide.js` (8 steps from spec §6; current step at `localStorage['dm.guide']`), `css/guide.css`; complete `js/strings/te.js`; `docs/telugu-native-check.md` (every TE string, for a native reader)
- Test: `tests/e2e/guided-day.spec.mjs`

**Interfaces:** `startGuide()`, `guideStep(n)`; each step = `{role, hash, target: cssSelector, text_key, action?: () => void}`. The highlight is an outline ring on `target`, plus a bottom bar on phone or a side rail on desktop.

- [ ] **Step 1: Write the failing e2e test:**
  - At 1280×800 and at 390×844, reset → start guide → complete all 8 steps by tapping the highlighted targets. Assert the owner's bar "Cash back" text differs before vs after and the 8 pm summary shows. On desktop the owner, dealer and driver steps render inside the phone frame.
  - Reload at step 5 → the guide resumes at step 5 with state intact.
  - Reset → run the guide again → it passes.
  - With తె on, the whole day passes and `window.__missingTe.length === 0`.
- [ ] **Step 2:** Run it and expect FAIL.
- [ ] **Step 3:** Implement the landing, the role chip switching, the phone frame (laptop only, ≥ 900 px), the guide and every Telugu string (spoken style).
- [ ] **Step 4:** Run it and expect PASS.
- [ ] **Step 5:** Commit: `feat: landing, guided day, telugu`.

### Task 8: Whole-site QC and publish

**Files:**
- Create: `tests/e2e/sweep.spec.mjs` (every route × widths 360/390/430 phone roles, 1024/1280/1440 staff × EN/తె: no console errors, `scrollWidth <= innerWidth`, no text clipped (`scrollHeight > clientHeight` on fixed-height pills), AA contrast via axe-core if available)
- Modify: whatever the sweep finds.

- [ ] **Step 1:** Write the sweep test and run it. Fix every failure.
- [ ] **Step 2:** Check the owner home's first load with Slow 4G throttling (Playwright CDP `Network.emulateNetworkConditions` 400 kbps / 400 ms): content visible in < 3 s. If not, defer the catalogue and photos.
- [ ] **Step 3:** One fresh reviewer (most capable model) reviews the whole branch against the spec and these constraints. Fix its findings.
- [ ] **Step 4:** Run `node --test tests/ && npx playwright test` and expect all PASS.
- [ ] **Step 5:** Commit `chore: qc fixes`, `git push`. Then check that `https://work.busyfox.in/devansh-office/` returns 200 and that `/previews/` still works.
