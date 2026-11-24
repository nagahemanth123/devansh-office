# Devansh Marketing dashboard: clickable demo, design

Prepared by Busy Fox · 24 Nov 2026 · Source brief: `~/Downloads/Devansh Marketing Dashboard Brief.docx` (read it; this doc does not repeat it, it decides what the demo does with it).

## 1. Intent and the why

Devansh Marketing is a 30-year-old distributor in Proddatur. It buys from 10 brands, stores goods in its godown, and sells to dealers in Kadapa and Anantapur on credit. The owner can't see in one place where his money is: in the godown, on a lorry, with a dealer who hasn't paid, or back in the bank.

We are building a **clickable demo**, not the real app. Busy Fox will open it on the owner's phone and on an office computer, play through one working day, and win the go-ahead for the real build. The PRID Control Desk demo (work.busyfox.in/prid-office) did exactly this, and the client loved it.

The demo has to make the owner believe two things:
1. "I can see where my money is in 5 seconds, from my phone."
2. "My staff, my dealers and my drivers could actually use this."

**Success** = the brief's acceptance-test day (section 9) runs from start to finish in the demo, live, with no workarounds, and the owner's ₹1 Cr bar visibly changes at the end.

## 2. Goals, non-goals, anti-goals

**Goals**
- All four roles: Owner (phone), Staff (desktop, also usable on a godown tablet), Dealer (phone), Driver (phone).
- A **guided "One day at Devansh"** mode that walks the acceptance test step by step and hops between roles, so the presenter never gets lost.
- Every number is computed from one shared set of records (lines, invoices, payments). Tapping any number lists the records behind it. Nothing is hard-coded as a total.
- Changes made in one role show up in the others (staff marks received → owner's tiles change; driver marks delivered → dealer sees "Delivered").
- EN | తె toggle on every screen.

**Non-goals (not in this demo)**
- Real logins, server, database, or sending anything (SMS, OTP). Everything runs in the browser.
- **WhatsApp of any kind** (8 pm summary, reminders, OTP messages): removed by the client on 24 Nov 2026.
- **Telugu**: removed by the client on 24 Nov 2026. The demo is English only, with no language toggle.
- Tally import, GST filing, e-invoice IRN generation. (The invoice shows where the IRN/QR would go.)
- Attendance details, salesperson targets, and per-brand profit reports beyond the margin % shown on the owner's brand card (all v2 in the brief).
- A report builder.

**Anti-goals (fail even if it works)**
- Looks AI-made or like a generic admin template.
- Dense and "too complicated" (the PRID owner's words about a busy dashboard).
- A dealer or driver can see purchase rates, margins or other dealers, even by accident in the demo.
- Two screens show different totals for the same thing.
- Numbers in millions or "K".

## 3. Constraints

- **Look: "Godown board"**, picked by the client from 4 previews. The reference is `~/Downloads/devansh-office/previews/godown-board/index.html`. Keep its tokens: sapphire `#0F52BA` (press `#0B4296`, ink `#0A3A84`), ink `#0E1A2B`, paper `#F3F2EE`, cards white, status green `#17804A` / blue `#2563EB` / amber `#AE5A00` / red `#C22A2A` / neutral `#59636F`. Status colours are solid fills with white words. Font: Archivo (wide/heavy for figures) + Anek Telugu. Radius 14 px. Number-plate style for vehicles. Brand cards carry the brand's own colour band and logo.
- Every new screen (staff desktop, dealer, driver, lenses, forms) must be designed in that same language. Staff desktop is the same system at a denser but still calm scale; dealer and driver use bigger type and bigger tap targets.
- House rules: Indian money (₹ L / Cr, 1,38,00,000); status = colour + word, never colour alone; plain words ("Dealers owe us", "Goods received"); the brief's ban on AI tells (no glows, gradients, glass, emoji, icon-circle grids, eyebrow labels everywhere); WCAG AA contrast; tap targets ≥ 44 px (≥ 56 px for driver and dealer primary buttons); Telugu must render whole.
- Phones: check 360, 390, 430. Desktop staff: 1280 and 1440, plus a 1024 tablet check.
- Owner home opens in under 3 s on a slow 4G phone: keep the first load small and lazy-load product photos.
- Hosting: the same link, **https://work.busyfox.in/devansh-office/** (repo `nagahemanth123/devansh-office`, GitHub Pages, no custom DNS). The four look previews stay reachable at `/previews/`.
- Data on a public link: products and brands are real; dealers, drivers, staff, vehicles and all money figures are sample. Every screen's footer says "Sample data · Busy Fox demo".

## 4. Decided "how" (Busy Fox's calls, approved by the client only through approving this doc)

- **Static site**: plain HTML, CSS and JavaScript, no framework or build step unless the builder needs a tiny one. One shared `store.js` holds the records and the business rules, and every screen reads from it.
- **Demo state** lives in the browser (localStorage), so actions carry across roles and page reloads on the same device. A visible **"Reset demo"** button restores the starting day. Two devices do not share state; the presenter uses one device, and on a laptop the "Show phone" view shows the phone screens at phone size.
- **No login.** The landing page has four big "Open as …" role cards plus the guided-day button. Inside, a small role chip in the header lets the presenter switch roles. In the real app each role gets its own login.
- **Starting data** (seeded, deterministic, same every reset). The seed is **scripted around the guided day** (Busy Fox's call): it includes the Goldmedal PO ready to move, the dealer for the phone order (credit headroom that fits, order big enough to move the bar visibly), the trip vehicle and driver, and so on. The history around it can be generated, but every total is still computed from records.
  - Products: the real catalogue in `~/FoxCut-packs/devansh-marketing/src/catalog/*.json` (485 products, 8 brands) plus Victura (8 fan models) and Poddar Pipes (about 12 lines) built from `~/Downloads/devansh-awareness-posters/assets/{victura,poddar}/FACTS.md` and the product images in those folders (logos are already in `previews/assets/brands/`; take brand colours from the logos, as the Godown board preview did). Where a product has no MRP, give a believable sample price and mark it sample in the data. Purchase rate = a sample discount off MRP per brand (owner-only). GST % per category (18% for most electricals and sanitary; let the builder set sensible values and mark them sample).
  - Photos: use the catalogue's `.webp` files, copied in at a web size (max ~400 px), loaded lazily.
  - About 40 sample dealers in real towns: Kadapa district (Proddatur, Kadapa, Pulivendula, Jammalamadugu, Badvel, Mydukur, Yerraguntla, Kamalapuram) and Anantapur district (Anantapur, Tadipatri, Guntakal, Gooty, Kalyandurg, Rayadurg, Uravakonda). Each dealer has a credit limit, credit days, a salesperson, a brand mix and payment habits, so the flags have something to find.
  - 5 vehicles, 5 drivers, about 16 staff in roles: godown, sales desk, accounts, plus one admin.
  - About 2 months of history (POs, receipts, invoices, trips, payments) so the charts, ageing and "60+ days" have real records behind them. The starting numbers should land close to the preview's (₹1.38 Cr cycle, ₹52.1 L back, ₹44.3 L with dealers, etc.). They must come out of the records, not be typed in.
- **The ₹1 Cr bar, defined** (Busy Fox's call): its total is **this month's goods received, valued at purchase cost** (₹1.38 Cr at the start of the demo). Each rupee of that is in exactly one place: *Still in the godown* (received, not invoiced), *On the road* (invoiced and loaded, not delivered), *Delivered, dealers yet to pay* (delivered, cost share of the unpaid invoice amount), or *Cash back in the bank* (cost share of what dealers have paid, with cheques counted only once cleared). Goods ordered but not yet received are not in the bar; they show as a line under it ("₹27.6 L more is coming from brands"). The bar's caption says "at purchase cost", so it isn't confused with the Collected tile, which is at selling price. Heading stays "Did the ₹1 Cr come back?".
- **The chain rule is the data model**: PO line → goods-received line → invoice line → trip drop → delivery proof → payment allocation. Every line carries brand, product, dealer (where relevant), district, quantity, rate and date. The three lenses are filters on those lines.
- **Business rules implemented in the demo** (brief section 6): stock rises only on "received"; it falls when the invoice is created; a shortage on receipt creates a brand claim and reduces the payable; an over-limit dealer order is flagged and needs admin approval (one tap in the demo, logged); one payment can be split across invoices and an invoice can be part-paid; cheques are pending → cleared or bounced, and a bounce puts the amount back on dues and raises a red flag; a trip over ₹50,000 asks for an e-way bill number (free text).
- **Audit trail**: every change writes a log entry (who = role and sample staff name, what, when). The owner can open "Activity", which shows the owner cannot edit.
- **Delivery proof**: the driver's Delivered button opens the phone camera or file picker (`<input type="file" accept="image/*" capture>`), then asks for a 4-digit OTP. In the demo the dealer's screen shows that OTP. "Offline": a toggle in the driver header simulates no network, so the delivery is saved as "Waiting to sync" and syncs when switched back.
- **Telugu**: EN is the default and the toggle is on every screen. All UI text, headings, buttons, status words and tile comparisons are translated into spoken Telugu mixed with common English terms ("invoice", "stock", "outstanding"). Dealer, product and brand names stay as they are. The choice is remembered. Telugu strings are marked "needs native check" in a list for Busy Fox. This covers **every** screen, staff desktop forms and lenses included (the client chose "toggle everywhere").

## 5. What each role sees

### Landing
Devansh logo, one line ("Where is my money today? A working demo on sample data."), four role cards (Owner, Office staff, Dealer, Driver), the **"One day at Devansh"** guided button, and "Reset demo".

### Owner (phone first; also fine on desktop)
1. **Home**: the Godown board preview, now live from the records: ₹1 Cr bar (bank / delivered-unpaid / on the road / godown), 8 tiles, Needs attention sorted by money at risk, Coming in / Going out trackers, district weekly chart, top brands, money tables (dues by age, top dealers who owe, brand payments this week). Every part of the bar, every tile and every row opens the list behind it.
2. **Search** (header): one box that finds dealer, brand, product or invoice number.
3. **Time toggle** that never moves: Today | This week | This month | Custom.
4. **Reports** with the lens switch **Company | Product | Dealer**, the same layout under each:
   - Company: one card per brand (bought, delivered properly %, short/damaged, open claims, stock value, days of cover, slow stock, sold, share, gross margin %, dealer dues on this brand, payable and due dates, scheme or rebate earned as sample), each with a health colour.
   - Product: one row per SKU with photo; quick lists for fast movers, slow movers, dead stock, about to run out (with a suggested reorder quantity).
   - Dealer: one card per dealer (sales trend, brand mix, outstanding and age, average days to pay, credit used vs limit, last order, pending deliveries, automatic flags such as "No Parryware for 45 days" or "Paying slower than before").
   - **Product × dealer grid**: top 20 by default plus search, with a sold ₹ | outstanding toggle and darker cells for more. Tapping a cell opens the **trail card** (Ordered → Invoiced → Loaded → Delivered → Paid/pending).
   - Drill-down Company → Product → Dealer → Invoice with a breadcrumb; filters (month, district) carry through; the reverse path works.
5. **Activity**: the audit log, read-only.
6. Filters district, brand, dealer and salesperson where they apply, remembered.

### Office staff (desktop first; godown also on tablet)
- **Quick actions bar**, always visible: New purchase order · Record goods received · New dealer order · New trip · Record payment. Each opens a short form (a side panel, not a new page) that works and changes the records.
- **Inbound tracker**: one row per PO, with a single button that moves it to the next step (Ordered → Left brand godown → On the way → Received). "Received" opens the goods-received check: ordered vs arrived per line, short and damaged quantities, a photo, and an auto-made claim.
- **Outbound tracker**: one row per trip with a progress bar ("4 of 6 dealers received") and per-drop status.
- **Dealer ledger**: pick a dealer to see invoices, payments, balance, credit limit and ageing on one page, with the record-payment form split across invoices and cheque clear/bounce buttons.
- **Stock**: search by brand, category or SKU; quantity, value, days of cover, last movement.
- **Order desk**: dealer search → dealer card (brand mix, last order, credit left, outstanding) → order with the catalogue picker (photo, MRP, dealer rate). A discount beyond the approved limit is blocked; over-credit shows the flag and the approve step.
- A **staff role picker** (Godown / Sales desk / Accounts / Admin) changes what is visible: Godown never sees purchase rates or margins; only Admin approves credit exceptions.

### Dealer (phone, big and simple)
Top: "You owe ₹X", credit used as a bar, next due date. Order tracker in 5 steps (Placed → Packed → Loaded → On the way → Delivered), with vehicle number, driver name, expected time and, once loaded, the delivery OTP. Invoices as coloured labels (Paid, Pending, Due soon, Overdue). "My purchases" by brand and product at his own rates. Two big buttons: **Reorder last order** and **Raise a query** (a short form; the query appears in the staff view). Dealer picker for the presenter (default: the dealer used in the guided day). Never shows margins, purchase rates or other dealers.

### Driver (phone, very simple)
Today's drops in order, each with dealer name, town, address, a call button (tel: link to a dummy number) and invoice amount. One big **Delivered** button → photo → OTP → done. **Not delivered** → reason: Shop closed / Rejected / Partial (partial asks which lines). An offline toggle (see 4). Driver picker for the presenter.


## 6. The guided day ("One day at Devansh")

A slim step guide (a bottom bar on phone, a side rail on desktop) with Next/Back, which switches role and screen at each step and highlights what to tap. These are the brief's acceptance steps, with the 10-brand list:

1. **Owner, morning**: open the home screen. Note the ₹1 Cr bar.
2. **Staff, godown**: a Goldmedal lorry is moved to "On the way", then "Received" with 10 units short. A claim appears, the payable drops, and stock rises only now.
3. **Staff, sales desk**: a dealer phones in an order. The dealer card shows credit left, the order is created, stock drops, and an invoice is raised (GST lines, e-invoice placeholder).
4. **Staff, dispatch**: the invoice goes on a trip (vehicle, driver, drop order, e-way bill if over ₹50,000).
5. **Driver**: mark the drop Delivered with a photo and the OTP.
6. **Dealer**: sees "Delivered" and what he owes.
7. **Staff, accounts**: the dealer pays half by UPI. The payment is attached to the invoice and the balance shows pending.
8. **Owner, evening**: the ₹1 Cr bar has moved, with a short, accurate "before → after" note.

It runs once per reset: "Reset demo" puts the day back to its start, and it must run cleanly again after every reset. One device drives the whole demo (the presenter's phone or laptop). On a laptop the owner, dealer and driver screens show inside a phone-sized frame. If someone opens the link on a second device, it shows its own fresh copy; that is accepted. Users can also leave the guide and click freely.

## 7. Done means

- The guided day passes end to end on a 390-wide phone view and on a 1280 desktop, in EN and in తె.
- Every owner number opens the records behind it, and they add up to the number shown.
- The role-visibility rules hold (a test checks the dealer and driver views for any purchase rate, margin or other dealer name).
- No console errors; no horizontal scroll at 360/390/430; AA contrast; Telugu renders whole.
- Owner home first load is small enough for under 3 s on slow 4G (check with throttling).
- QC review passed, then published at https://work.busyfox.in/devansh-office/ with previews still at /previews/.

## 8. Left to the builder

File and folder structure; how the seeded history is generated (it must be deterministic); exact sample prices, rates and GST %; chart details within the look; icon set (simple line icons, consistent, no emoji); form field details; exact Telugu wording (spoken style, flagged for native check); how the guided-step highlight is drawn; whether to split pages by role or use one app shell with hash routes.

## 9. Open with the client (not blocking the demo)

Confirm the brand list (the brief has 8; the demo shows 10); the dealer portal's place in v1 vs v2; Tally replace vs import (Busy Fox recommends keeping Tally and importing); GST e-invoicing (needed if turnover > ₹5 Cr); the 5 numbers the owner checks every morning; approval limits for discounts, credit exceptions and returns.
