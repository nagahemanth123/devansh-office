// Selectors: pure functions (state, opts) -> value. Every number a screen shows comes from here,
// computed from the records in the store. Nothing here changes state.
// Also holds the small pure helpers (dates, invoice maths, balances) that store.js and seed.js share.
import { CATALOG } from './data/catalog.js';

export const PRODUCT = new Map(CATALOG.products.map((p) => [p.id, p]));
export const BRAND = new Map(CATALOG.brands.map((b) => [b.key, b]));
export const DISTRICTS = ['Kadapa', 'Anantapur'];

// ---------- dates (ISO strings: 'YYYY-MM-DD' days, 'YYYY-MM-DDTHH:MM' moments) ----------
const DAY_MS = 864e5;
const ms = (iso) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
export const dayOf = (at) => at.slice(0, 10);
export const addDays = (iso, n) => new Date(ms(iso) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY_MS);
export const weekdayOf = (iso) => new Date(ms(iso)).getUTCDay(); // 0 = Sunday
export const mondayOf = (iso) => addDays(iso, -((weekdayOf(iso) + 6) % 7));
export function addMonths(iso, n) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}
export function addMinutes(at, n) {
  return new Date(Date.parse(`${at}:00Z`) + n * 60000).toISOString().slice(0, 16);
}

// ---------- money ----------
export const r2 = (n) => Math.round(n * 100) / 100;
const sumBy = (rows, f) => rows.reduce((a, r) => a + f(r), 0);

// Invoice maths: taxable and GST per line, total rounded to the rupee (the round-off is kept).
export function orderTotals(lines) {
  const out = lines.map(({ productId, qty, rate }) => {
    const p = PRODUCT.get(productId);
    const taxable = r2(qty * rate);
    return { productId, brand: p.brand, qty, rate, taxable, gstPct: p.gstPct, gst: r2((taxable * p.gstPct) / 100) };
  });
  const taxable = r2(sumBy(out, (l) => l.taxable));
  const gst = r2(sumBy(out, (l) => l.gst));
  const total = Math.round(taxable + gst);
  return { lines: out, taxable, gst, roundOff: r2(total - taxable - gst), total };
}

export const invoiceBalance = (inv) => (inv.status === 'cancelled' ? 0 : r2(inv.total - inv.paid));
export const invoiceCost = (state, inv) => sumBy(inv.lines, (l) => sumBy(l.lots, (u) => u.qty * u.cost));

export function dealerOwes(state, dealerId) {
  return r2(sumBy(state.invoices.filter((i) => i.dealerId === dealerId), invoiceBalance));
}

// What we owe a brand: its bills, less claims, less what we paid.
export function brandPayable(state, brand) {
  const f = (rows) => sumBy(rows.filter((r) => r.brand === brand), (r) => r.amount);
  return r2(f(state.bills) - f(state.claims) - f(state.brandPayments));
}

// ---------- index, rebuilt when state.rev changes ----------
const memo = new WeakMap();
function ix(s) {
  const hit = memo.get(s);
  if (hit && hit.rev === s.rev) return hit;
  const byId = (rows) => new Map(rows.map((r) => [r.id, r]));
  const group = (rows, key) => {
    const m = new Map();
    for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return m;
  };
  const payByInv = new Map();
  for (const p of s.payments) for (const a of p.allocations) {
    if (!payByInv.has(a.invoiceId)) payByInv.set(a.invoiceId, []);
    payByInv.get(a.invoiceId).push({ p, amount: a.amount });
  }
  const m = {
    rev: s.rev,
    dealer: byId(s.dealers), staff: byId(s.staff), vehicle: byId(s.vehicles), driver: byId(s.drivers),
    invoice: byId(s.invoices), order: byId(s.orders), trip: byId(s.trips), po: byId(s.pos), lot: byId(s.lots),
    invByDealer: group(s.invoices, 'dealerId'), payByDealer: group(s.payments, 'dealerId'), payByInv,
  };
  memo.set(s, m);
  return m;
}

const dealerLabel = (d) => `${d.name}, ${d.town}`;
const isCleared = (p, asOf) => p.status === 'cleared' && p.clearedAt <= asOf;
const counted = (inv) => inv.status !== 'cancelled';

// ---------- time ranges ----------
export function resolveRange(state, range = 'month') {
  const today = state.today;
  if (range === 'today') return { from: today, to: today, prev: { from: addDays(today, -1), to: addDays(today, -1) }, kind: 'day' };
  if (range === 'week') {
    const from = mondayOf(today);
    return { from, to: today, prev: { from: addDays(from, -7), to: addDays(today, -7) }, kind: 'week' };
  }
  if (range && typeof range === 'object' && range.from) {
    const n = daysBetween(range.from, range.to) + 1;
    return { from: range.from, to: range.to, prev: { from: addDays(range.from, -n), to: addDays(range.from, -1) }, kind: 'custom' };
  }
  const from = `${today.slice(0, 8)}01`;
  return { from, to: today, prev: { from: addMonths(from, -1), to: addMonths(today, -1) }, kind: 'month' };
}
const inRange = (iso, r) => { const d = iso.slice(0, 10); return d >= r.from && d <= r.to; };
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// ---------- the ₹1 Cr bar (spec §4) ----------
// Total = this month's goods received, at purchase cost. Each rupee sits in one part: still in the godown
// (not invoiced), on the road (invoiced, not delivered), delivered and unpaid, or back in the bank
// (cost share of what dealers paid; cheques only once cleared).
function barRows(s, month, asOf) {
  const i = ix(s);
  const lots = s.lots.filter((l) => l.grnId && l.date.slice(0, 7) === month && l.at <= asOf);
  const inMonth = new Map(lots.map((l) => [l.id, l]));
  const used = new Map();
  const road = []; const unpaid = []; const bank = [];
  for (const inv of s.invoices) {
    if (inv.at > asOf || !counted(inv)) continue;
    let cost = 0;
    for (const line of inv.lines) for (const u of line.lots) {
      if (!inMonth.has(u.lotId)) continue;
      cost += u.qty * u.cost;
      used.set(u.lotId, (used.get(u.lotId) || 0) + u.qty);
    }
    if (cost === 0) continue;
    const d = i.dealer.get(inv.dealerId);
    const base = { kind: 'invoice', id: inv.id, dealerId: inv.dealerId, label: dealerLabel(d), date: inv.date };
    if (!inv.deliveredAt || inv.deliveredAt > asOf) { road.push({ ...base, status: inv.status, sell: inv.total, amount: cost }); continue; }
    let paidShare = 0; let paidSell = 0;
    for (const { p, amount } of i.payByInv.get(inv.id) || []) {
      if (!isCleared(p, asOf)) continue;
      const share = Math.min(cost - paidShare, (amount / inv.total) * cost);
      if (share <= 0) continue;
      paidShare += share; paidSell += amount;
      bank.push({ kind: 'payment', id: p.id, invoiceId: inv.id, dealerId: inv.dealerId, label: dealerLabel(d), mode: p.mode, date: dayOf(p.clearedAt), sell: amount, amount: share });
    }
    if (cost - paidShare > 0.005) unpaid.push({ ...base, days: daysBetween(inv.date, dayOf(asOf)), sell: r2(inv.total - paidSell), amount: cost - paidShare });
  }
  const byProduct = new Map();
  const byGrn = new Map();
  for (const l of lots) {
    const left = l.qty - (used.get(l.id) || 0);
    if (left > 0) {
      const row = byProduct.get(l.productId) || { kind: 'stock', id: l.productId, productId: l.productId, brand: l.brand, label: PRODUCT.get(l.productId).name, qty: 0, amount: 0 };
      row.qty += left; row.amount += left * l.cost;
      byProduct.set(l.productId, row);
    }
    const g = byGrn.get(l.grnId) || { kind: 'grn', id: l.grnId, brand: l.brand, label: BRAND.get(l.brand).name, date: l.date, amount: 0 };
    g.amount += l.qty * l.cost;
    byGrn.set(l.grnId, g);
  }
  const incoming = s.pos.filter((p) => p.step !== 'received' && p.at.ordered <= asOf)
    .map((p) => ({ kind: 'po', id: p.id, brand: p.brand, label: BRAND.get(p.brand).name, step: p.step, date: p.date, amount: p.value }));
  return { total: [...byGrn.values()], godown: [...byProduct.values()], road, unpaid, bank, incoming };
}

// Rounds parts to rupees so they add up exactly to the rounded total (largest remainder).
function roundParts(raw, total) {
  const keys = Object.keys(raw);
  const floors = Object.fromEntries(keys.map((k) => [k, Math.floor(raw[k])]));
  let left = total - sumBy(keys, (k) => floors[k]);
  for (const k of [...keys].sort((a, b) => (raw[b] - floors[b]) - (raw[a] - floors[a]))) { if (left <= 0) break; floors[k] += 1; left -= 1; }
  return floors;
}

function barAt(s, month, asOf) {
  const rows = barRows(s, month, asOf);
  const raw = Object.fromEntries(['godown', 'road', 'unpaid', 'bank'].map((k) => [k, sumBy(rows[k], (r) => r.amount)]));
  const total = Math.round(sumBy(rows.total, (r) => r.amount));
  return { total, ...roundParts(raw, total), incoming: Math.round(sumBy(rows.incoming, (r) => r.amount)) };
}

export function cycleBar(state, { month } = {}) {
  const m = month || state.today.slice(0, 7);
  const now = barAt(state, m, state.clock);
  // "At this point last month": last month's bar as it stood on the same day and time.
  const prevMonth = addMonths(`${m}-01`, -1).slice(0, 7);
  const prevAsOf = `${addMonths(dayOf(state.clock), -1)}${state.clock.slice(10)}`;
  const prev = barAt(state, prevMonth, prevAsOf);
  return { month: m, ...now, vsLastMonth: { bank: now.bank - prev.bank, prevMonth } };
}

// ---------- brand bills still open, oldest first (claims cut their own PO's bill first) ----------
function openBills(s) {
  const out = [];
  for (const b of CATALOG.brands) {
    const bills = s.bills.filter((x) => x.brand === b.key).sort((x, y) => (x.at < y.at ? -1 : 1)).map((x) => ({ ...x, left: x.amount }));
    for (const c of s.claims.filter((x) => x.brand === b.key)) {
      const bill = bills.find((x) => x.poId === c.poId);
      if (bill) bill.left -= c.amount;
    }
    let paid = sumBy(s.brandPayments.filter((x) => x.brand === b.key), (x) => x.amount);
    for (const bill of bills) { const take = Math.min(Math.max(bill.left, 0), paid); bill.left -= take; paid -= take; }
    for (const bill of bills) if (Math.abs(bill.left) > 0.005) out.push(bill);
  }
  return out;
}

// ---------- shared measures ----------
function cogsSince(s, from) {
  return sumBy(s.invoices.filter((inv) => counted(inv) && inv.date >= from), (inv) => invoiceCost(s, inv));
}
const stockValue = (s, filter = () => true) => sumBy(s.lots.filter((l) => l.left > 0 && filter(l)), (l) => l.left * l.cost);
function ageingOf(s, invoices) {
  const a = { d0_30: 0, d31_60: 0, d60p: 0 };
  for (const inv of invoices) {
    const bal = invoiceBalance(inv);
    if (bal <= 0) continue;
    const age = daysBetween(inv.date, s.today);
    a[age <= 30 ? 'd0_30' : age <= 60 ? 'd31_60' : 'd60p'] += bal;
  }
  return { d0_30: r2(a.d0_30), d31_60: r2(a.d31_60), d60p: r2(a.d60p) };
}
const todaysTrips = (s) => s.trips.filter((t) => t.date === s.today || t.status !== 'done');

// ---------- the 8 tiles ----------
export function tiles(state, { range = 'month' } = {}) {
  const s = state;
  const r = resolveRange(s, range);
  const sales = (rr) => sumBy(s.invoices.filter((x) => counted(x) && inRange(x.date, rr)), (x) => x.total);
  const salesNow = sales(r); const salesPrev = sales(r.prev);
  const collected = sumBy(s.payments.filter((p) => p.status === 'cleared' && inRange(p.clearedAt, r)), (p) => p.amount);
  const owe = sumBy(s.invoices, invoiceBalance);
  const age = ageingOf(s, s.invoices);
  const bills = openBills(s);
  const weOwe = sumBy(bills, (b) => b.left);
  const dueWeek = sumBy(bills.filter((b) => b.due <= addDays(s.today, 7)), (b) => b.left);
  const stockVal = stockValue(s);
  const daily = cogsSince(s, addDays(s.today, -30)) / 30;
  const lorries = s.pos.filter((p) => p.step === 'left' || p.step === 'onway');
  const trips = todaysTrips(s);
  const drops = trips.flatMap((t) => t.drops);
  const present = s.staff.filter((x) => x.present).length;
  const change = pct(salesNow - salesPrev, salesPrev);
  return [
    { key: 'sales', unit: 'money', value: r2(salesNow), trend: change > 2 ? 'up' : change < -2 ? 'down' : 'flat', status: null,
      compare: { key: 'cmp.vsPrev', vars: { pct: change, period: r.kind, prevFrom: r.prev.from, prevTo: r.prev.to } } },
    { key: 'collected', unit: 'money', value: r2(collected), status: null, compare: { key: 'cmp.pctOfSales', vars: { pct: Math.round(pct(collected, salesNow)) } } },
    { key: 'dealersOwe', unit: 'money', value: r2(owe), status: age.d60p > 0.2 * owe ? 'red' : age.d60p > 0 ? 'amber' : 'green',
      compare: { key: 'cmp.old60', vars: { amount: age.d60p } } },
    { key: 'weOwe', unit: 'money', value: r2(weOwe), status: dueWeek > 0 ? 'amber' : null, compare: { key: 'cmp.dueThisWeek', vars: { amount: r2(dueWeek) } } },
    { key: 'stock', unit: 'money', value: r2(stockVal), status: null, compare: { key: 'cmp.daysCover', vars: { days: daily ? Math.round(stockVal / daily) : null } } },
    { key: 'lorries', unit: 'count', value: lorries.length, status: null, compare: { key: 'cmp.goodsValue', vars: { amount: r2(sumBy(lorries, (p) => p.value)) } } },
    { key: 'vehicles', unit: 'count', value: trips.filter((t) => t.status === 'left').length, of: s.vehicles.length,
      status: trips.some((t) => t.status === 'loaded') ? 'amber' : null,
      compare: { key: 'cmp.dropsDone', vars: { done: drops.filter((d) => d.status !== 'pending').length, total: drops.length } } },
    { key: 'staff', unit: 'count', value: present, of: s.staff.length, status: null, compare: { key: 'cmp.onLeave', vars: { count: s.staff.length - present } } },
  ];
}

// ---------- records behind any number ----------
// Row: {kind, id, label, date?, amount, ...}. Money rows add up to the number; count rows are one per thing.
export function recordsBehind(state, key, { range = 'month', month } = {}) {
  const s = state;
  const i = ix(s);
  if (key.startsWith('bar.')) {
    const rows = barRows(s, month || s.today.slice(0, 7), s.clock);
    return rows[key.slice(4)] || [];
  }
  const r = resolveRange(s, range);
  const invRow = (inv, amount) => ({ kind: 'invoice', id: inv.id, dealerId: inv.dealerId, label: dealerLabel(i.dealer.get(inv.dealerId)), date: inv.date, status: inv.status, amount });
  const byAge = (lo, hi) => s.invoices.filter((inv) => { const a = daysBetween(inv.date, s.today); return invoiceBalance(inv) > 0 && a >= lo && a <= hi; })
    .map((inv) => ({ ...invRow(inv, invoiceBalance(inv)), days: daysBetween(inv.date, s.today) }));
  switch (key) {
    case 'tile.sales': return s.invoices.filter((x) => counted(x) && inRange(x.date, r)).map((x) => invRow(x, x.total));
    case 'tile.collected': return s.payments.filter((p) => p.status === 'cleared' && inRange(p.clearedAt, r))
      .map((p) => ({ kind: 'payment', id: p.id, dealerId: p.dealerId, label: dealerLabel(i.dealer.get(p.dealerId)), mode: p.mode, date: dayOf(p.clearedAt), amount: p.amount }));
    case 'tile.dealersOwe': return byAge(0, Infinity);
    case 'dues.d0_30': return byAge(0, 30);
    case 'dues.d31_60': return byAge(31, 60);
    case 'dues.d60p': return byAge(61, Infinity);
    case 'tile.weOwe': return openBills(s).map((b) => ({ kind: 'bill', id: b.id, poId: b.poId, brand: b.brand, label: BRAND.get(b.brand).name, date: b.date, due: b.due, amount: r2(b.left) }));
    case 'tile.stock': {
      const m = new Map();
      for (const l of s.lots) if (l.left > 0) {
        const row = m.get(l.productId) || { kind: 'stock', id: l.productId, productId: l.productId, brand: l.brand, label: PRODUCT.get(l.productId).name, qty: 0, amount: 0 };
        row.qty += l.left; row.amount += l.left * l.cost; m.set(l.productId, row);
      }
      return [...m.values()].sort((a, b) => b.amount - a.amount);
    }
    case 'tile.lorries': return s.pos.filter((p) => p.step === 'left' || p.step === 'onway').map((p) => ({ kind: 'po', id: p.id, brand: p.brand, label: BRAND.get(p.brand).name, step: p.step, date: p.date, amount: p.value }));
    case 'tile.vehicles': return todaysTrips(s).filter((t) => t.status === 'left').map((t) => ({ kind: 'trip', id: t.id, label: i.vehicle.get(t.vehicleId).plate, driver: i.driver.get(t.driverId).name, date: t.date, amount: t.value }));
    case 'tile.staff': return s.staff.filter((x) => x.present).map((x) => ({ kind: 'staff', id: x.id, label: x.name, role: x.role, amount: 0 }));
    default:
      if (key.startsWith('dealer.')) return (i.invByDealer.get(key.slice(7)) || []).filter((inv) => invoiceBalance(inv) > 0).map((inv) => invRow(inv, invoiceBalance(inv)));
      return [];
  }
}

// ---------- needs attention, sorted by money at risk ----------
export function attention(state) {
  const s = state;
  const i = ix(s);
  const out = [];
  for (const o of s.orders.filter((x) => x.status === 'needs-approval')) {
    const d = i.dealer.get(o.dealerId);
    const over = r2(dealerOwes(s, d.id) + o.total - d.creditLimit);
    out.push({ kind: 'credit', ref: o.id, dealerId: d.id, amount: over, status: 'red', key: 'att.credit', vars: { dealer: d.name, town: d.town, amount: over } });
  }
  for (const p of s.payments.filter((x) => x.status === 'bounced' && daysBetween(dayOf(x.bouncedAt), s.today) <= 30)) {
    const d = i.dealer.get(p.dealerId);
    out.push({ kind: 'cheque', ref: p.id, dealerId: d.id, amount: p.amount, status: 'red', key: 'att.bounced', vars: { dealer: d.name, town: d.town, amount: p.amount } });
  }
  for (const c of s.claims.filter((x) => x.status === 'open' && daysBetween(x.date, s.today) <= 7)) {
    const short = sumBy(c.lines, (l) => l.short); const damaged = sumBy(c.lines, (l) => l.damaged);
    out.push({ kind: 'short', ref: c.id, poId: c.poId, amount: c.amount, status: 'red', key: 'att.claim',
      vars: { brand: BRAND.get(c.brand).name, short, damaged, product: PRODUCT.get(c.lines[0].productId).name, amount: c.amount } });
  }
  const week = addDays(s.today, 7);
  const dueByBrand = new Map();
  for (const b of openBills(s)) if (b.due <= week && b.left > 0) {
    const x = dueByBrand.get(b.brand) || { amount: 0, due: b.due };
    x.amount += b.left; if (b.due < x.due) x.due = b.due;
    dueByBrand.set(b.brand, x);
  }
  const dues = [...dueByBrand].sort((a, b) => b[1].amount - a[1].amount).filter(([, x], k) => k < 2 || x.due < s.today);
  for (const [brand, x] of dues) out.push({ kind: 'brand-payment', ref: brand, amount: r2(x.amount), status: x.due < s.today ? 'red' : 'amber', key: 'att.brandDue', vars: { brand: BRAND.get(brand).name, amount: r2(x.amount), due: x.due } });
  for (const t of s.trips.filter((x) => x.status === 'loaded')) {
    out.push({ kind: 'vehicle', ref: t.id, amount: t.value, status: 'amber', key: 'att.notLeft', vars: { plate: i.vehicle.get(t.vehicleId).plate, loadedAt: t.loadedAt, amount: t.value } });
  }
  const old = s.dealers.map((d) => ({ d, amt: ageingOf(s, i.invByDealer.get(d.id) || []).d60p })).filter((x) => x.amt > 0).sort((a, b) => b.amt - a.amt).slice(0, 2);
  for (const { d, amt } of old) out.push({ kind: 'overdue', ref: d.id, dealerId: d.id, amount: amt, status: 'red', key: 'att.old60', vars: { dealer: d.name, town: d.town, amount: amt } });
  for (const row of productRows(s, {}).lists.runOut.slice(0, 2)) {
    out.push({ kind: 'stock', ref: row.productId, amount: null, status: 'amber', key: 'att.runOut', vars: { brand: BRAND.get(row.brand).name, product: row.name, days: row.daysCover } });
  }
  for (const q of s.queries.filter((x) => x.status === 'open')) {
    const d = i.dealer.get(q.dealerId);
    out.push({ kind: 'query', ref: q.id, dealerId: d.id, amount: null, status: 'amber', key: 'att.query', vars: { dealer: d.name, town: d.town, text: q.text } });
  }
  return out.sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1));
}

// ---------- coming in / going out ----------
const STEP_ORDER = { received: 0, onway: 1, left: 2, ordered: 3 };
export function comingIn(state) {
  const s = state;
  return s.pos.filter((p) => p.step !== 'received' || dayOf(p.at.received) === s.today)
    .map((p) => {
      const claim = s.claims.find((c) => c.poId === p.id);
      return { poId: p.id, brand: p.brand, value: p.value, step: p.step, at: p.at[p.step], eta: p.eta, short: claim ? sumBy(claim.lines, (l) => l.short + l.damaged) : 0, claimAmount: claim ? claim.amount : 0 };
    })
    .sort((a, b) => STEP_ORDER[a.step] - STEP_ORDER[b.step] || (a.at < b.at ? 1 : -1));
}

export function goingOut(state) {
  const s = state;
  const i = ix(s);
  return todaysTrips(s).map((t) => {
    const towns = [];
    for (const d of t.drops) { const town = i.dealer.get(d.dealerId).town; if (!towns.includes(town)) towns.push(town); }
    return { tripId: t.id, vehicleId: t.vehicleId, plate: i.vehicle.get(t.vehicleId).plate, driverId: t.driverId, driver: i.driver.get(t.driverId).name,
      towns, drops: t.drops.length, done: t.drops.filter((d) => d.status !== 'pending').length, value: t.value, status: t.status, loadedAt: t.loadedAt, leftAt: t.leftAt };
  });
}

// ---------- district weekly sales (Monday weeks; the last one is partial) ----------
export function districtWeekly(state, { weeks = 5 } = {}) {
  const s = state;
  const i = ix(s);
  const last = mondayOf(s.today);
  const starts = Array.from({ length: weeks }, (_, k) => addDays(last, -7 * (weeks - 1 - k)));
  const out = { weeks: starts, partialLast: weekdayOf(s.today) !== 0, daysInLast: daysBetween(last, s.today) + 1 };
  for (const dist of DISTRICTS) out[dist] = starts.map(() => 0);
  for (const inv of s.invoices) {
    if (!counted(inv) || inv.date < starts[0]) continue;
    const k = Math.floor(daysBetween(starts[0], inv.date) / 7);
    out[i.dealer.get(inv.dealerId).district][k] += inv.total;
  }
  for (const dist of DISTRICTS) out[dist] = out[dist].map(r2);
  return out;
}

// ---------- lens: company (one card per brand) ----------
export function brandCards(state, { range = 'month', district } = {}) {
  const s = state;
  const i = ix(s);
  const r = resolveRange(s, range);
  const inDist = (inv) => !district || i.dealer.get(inv.dealerId).district === district;
  const invs = s.invoices.filter((inv) => counted(inv) && inRange(inv.date, r) && inDist(inv));
  const bills = openBills(s);
  const lastSale = lastSoldMap(s);
  const since30 = addDays(s.today, -30);
  const cards = CATALOG.brands.map((b) => {
    const lines = invs.flatMap((inv) => inv.lines.filter((l) => l.brand === b.key));
    const sold = sumBy(lines, (l) => l.taxable + l.gst);
    const taxable = sumBy(lines, (l) => l.taxable);
    const cost = sumBy(lines, (l) => sumBy(l.lots, (u) => u.qty * u.cost));
    const grns = s.grns.filter((g) => g.brand === b.key && inRange(g.date, r));
    const ordered = sumBy(grns, (g) => sumBy(g.lines, (l) => l.ordered * l.rate));
    const good = sumBy(grns, (g) => sumBy(g.lines, (l) => (l.received - l.damaged) * l.rate));
    const claimsIn = s.claims.filter((c) => c.brand === b.key && inRange(c.date, r));
    const open = s.claims.filter((c) => c.brand === b.key && c.status === 'open');
    const stockVal = stockValue(s, (l) => l.brand === b.key);
    const slowVal = stockValue(s, (l) => l.brand === b.key && !(lastSale.get(l.productId) >= addDays(s.today, -45)));
    const daily = sumBy(s.invoices.filter((inv) => counted(inv) && inv.date >= since30), (inv) => sumBy(inv.lines.filter((l) => l.brand === b.key), (l) => sumBy(l.lots, (u) => u.qty * u.cost))) / 30;
    let dues = 0; let dues60 = 0;
    for (const inv of s.invoices) {
      const bal = invoiceBalance(inv);
      if (bal <= 0 || !inDist(inv)) continue;
      const share = sumBy(inv.lines.filter((l) => l.brand === b.key), (l) => l.taxable + l.gst) / (inv.total || 1);
      dues += bal * share;
      if (daysBetween(inv.date, s.today) > 60) dues60 += bal * share;
    }
    const myBills = bills.filter((x) => x.brand === b.key);
    const next = myBills.filter((x) => x.left > 0).sort((x, y) => (x.due < y.due ? -1 : 1))[0];
    const bought = sumBy(s.bills.filter((x) => x.brand === b.key && inRange(x.date, r)), (x) => x.amount);
    const terms = s.brandTerms[b.key];
    const marginPct = taxable ? Math.round(((taxable - cost) / taxable) * 1000) / 10 : null;
    const daysCover = daily ? Math.round(stockVal / daily) : null;
    const reasons = [];
    if (open.length) reasons.push({ key: 'health.openClaims', vars: { count: open.length, amount: r2(sumBy(open, (c) => c.amount)) } });
    if (dues > 0 && dues60 / dues > 0.3) reasons.push({ key: 'health.oldDues', vars: { amount: r2(dues60) } });
    if (daysCover != null && daysCover < 7) reasons.push({ key: 'health.lowCover', vars: { days: daysCover } });
    if (daysCover != null && daysCover > 90) reasons.push({ key: 'health.highCover', vars: { days: daysCover } });
    if (marginPct != null && marginPct < 7) reasons.push({ key: 'health.lowMargin', vars: { pct: marginPct } });
    const openAmt = sumBy(open, (c) => c.amount);
    const health = (bought && openAmt > 0.01 * bought) || (dues > 0 && dues60 / dues > 0.3) ? 'red' : reasons.length ? 'amber' : 'green';
    return {
      key: b.key, name: b.name, colour: b.colour, logo: b.logo,
      bought: r2(bought), deliveredOkPct: ordered ? Math.round((good / ordered) * 1000) / 10 : null,
      shortDamaged: r2(sumBy(claimsIn, (c) => c.amount)), openClaims: { count: open.length, amount: r2(sumBy(open, (c) => c.amount)) },
      stockValue: r2(stockVal), daysCover, slowStock: r2(slowVal),
      sold: r2(sold), share: 0, marginPct, dealerDues: r2(dues), dealerDues60: r2(dues60),
      payable: r2(sumBy(myBills, (x) => x.left)), nextDue: next ? { date: next.due, amount: r2(next.left) } : null,
      rebate: { scheme: terms.scheme, pct: terms.rebatePct, earned: r2((bought * terms.rebatePct) / 100), sample: true },
      health, healthReasons: reasons,
    };
  });
  const total = sumBy(cards, (c) => c.sold);
  for (const c of cards) c.share = total ? Math.round((c.sold / total) * 1000) / 10 : 0;
  return cards.sort((a, b) => b.sold - a.sold);
}

function lastSoldMap(s) {
  const m = new Map();
  for (const inv of s.invoices) if (counted(inv)) for (const l of inv.lines) if (!(m.get(l.productId) >= inv.date)) m.set(l.productId, inv.date);
  return m;
}

// ---------- lens: product (one row per SKU, plus quick lists) ----------
export function productRows(state, { brand, q, district, range = 'month' } = {}) {
  const s = state;
  const i = ix(s);
  const r = resolveRange(s, range);
  const since30 = addDays(s.today, -30);
  const agg = new Map();
  const get = (pid) => { if (!agg.has(pid)) agg.set(pid, { stockQty: 0, stockValue: 0, soldQty: 0, soldValue: 0, soldQty30: 0, soldValue30: 0, lastSold: null, lastIn: null, onOrder: 0 }); return agg.get(pid); };
  for (const l of s.lots) { const a = get(l.productId); a.stockQty += l.left; a.stockValue += l.left * l.cost; if (l.grnId && !(a.lastIn >= l.date)) a.lastIn = l.date; }
  for (const inv of s.invoices) {
    if (!counted(inv)) continue;
    const okDist = !district || i.dealer.get(inv.dealerId).district === district;
    for (const l of inv.lines) {
      const a = get(l.productId);
      if (!(a.lastSold >= inv.date)) a.lastSold = inv.date;
      if (inv.date >= since30) { a.soldQty30 += l.qty; a.soldValue30 += l.taxable + l.gst; }
      if (okDist && inRange(inv.date, r)) { a.soldQty += l.qty; a.soldValue += l.taxable + l.gst; }
    }
  }
  for (const p of s.pos) if (p.step !== 'received') for (const l of p.lines) get(l.productId).onOrder += l.qty;
  const needle = (q || '').trim().toLowerCase();
  const rows = CATALOG.products
    .filter((p) => (!brand || p.brand === brand) && (!needle || `${p.name} ${p.category} ${p.id}`.toLowerCase().includes(needle)))
    .map((p) => {
      const a = get(p.id);
      const daily = a.soldQty30 / 30;
      const daysCover = daily ? Math.round(a.stockQty / daily) : null;
      const reorderQty = daily ? Math.max(0, Math.ceil(daily * 21 - a.stockQty - a.onOrder)) : 0;
      const lastMove = [a.lastSold, a.lastIn].filter(Boolean).sort().at(-1) || null;
      return { productId: p.id, name: p.name, brand: p.brand, category: p.category, photo: p.photo, mrp: p.mrp,
        stockQty: a.stockQty, stockValue: r2(a.stockValue), soldQty: a.soldQty, soldValue: r2(a.soldValue),
        soldQty30: a.soldQty30, soldValue30: r2(a.soldValue30), daysCover, onOrder: a.onOrder, reorderQty, lastSold: a.lastSold, lastMove };
    });
  const deadBefore = addDays(s.today, -60);
  const fast = rows.filter((x) => x.soldValue30 > 0).sort((a, b) => b.soldValue30 - a.soldValue30).slice(0, 15);
  // About to run out: under a week of stock, and what is already ordered will not cover ten days.
  const runOut = rows.filter((x) => x.daysCover != null && x.daysCover < 7 && x.stockQty + x.onOrder < (x.soldQty30 / 30) * 10 && x.reorderQty > 0)
    .sort((a, b) => b.soldValue30 - a.soldValue30);
  // Slow: sold in the last 60 days, but the stock would last more than 45 days at this pace (or nothing sold in 30).
  const slow = rows.filter((x) => x.stockQty > 0 && x.lastSold >= deadBefore && (x.daysCover == null || x.daysCover > 45)).sort((a, b) => b.stockValue - a.stockValue);
  const dead = rows.filter((x) => x.stockQty > 0 && !(x.lastSold >= deadBefore)).sort((a, b) => b.stockValue - a.stockValue);
  const tag = new Map();
  for (const [name, list] of [['dead', dead], ['slow', slow], ['fast', fast], ['runOut', runOut]]) for (const x of list) tag.set(x.productId, name);
  for (const x of rows) x.flag = tag.get(x.productId) || null;
  return { rows: rows.sort((a, b) => b.soldValue - a.soldValue || b.stockValue - a.stockValue), lists: { fast, slow, dead, runOut } };
}

// ---------- lens: dealer (one card per dealer, with automatic flags) ----------
function daysToPay(s, payments, invById) {
  let w = 0; let d = 0;
  for (const p of payments) {
    if (p.status === 'bounced') continue;
    for (const a of p.allocations) { const inv = invById.get(a.invoiceId); w += a.amount; d += a.amount * daysBetween(inv.date, p.date); }
  }
  return w ? Math.round(d / w) : null;
}

export function dealerCards(state, { district, salespersonId, q } = {}) {
  const s = state;
  const i = ix(s);
  const needle = (q || '').trim().toLowerCase();
  const weekStarts = Array.from({ length: 8 }, (_, k) => addDays(mondayOf(s.today), -7 * (7 - k)));
  return s.dealers
    .filter((d) => (!district || d.district === district) && (!salespersonId || d.salespersonId === salespersonId) && (!needle || `${d.name} ${d.town}`.toLowerCase().includes(needle)))
    .map((d) => {
      const invs = (i.invByDealer.get(d.id) || []).filter(counted);
      const pays = i.payByDealer.get(d.id) || [];
      const owes = r2(sumBy(invs, invoiceBalance));
      const ageing = ageingOf(s, invs);
      const trend = weekStarts.map((w) => r2(sumBy(invs.filter((inv) => inv.date >= w && inv.date < addDays(w, 7)), (inv) => inv.total)));
      const mix = new Map();
      for (const inv of invs.filter((x) => x.date >= addDays(s.today, -60))) for (const l of inv.lines) mix.set(l.brand, (mix.get(l.brand) || 0) + l.taxable + l.gst);
      const lastByBrand = new Map();
      for (const inv of invs) for (const l of inv.lines) if (!(lastByBrand.get(l.brand) >= inv.date)) lastByBrand.set(l.brand, inv.date);
      const cut = addDays(s.today, -30);
      const recent = daysToPay(s, pays.filter((p) => p.date >= cut), i.invoice);
      const earlier = daysToPay(s, pays.filter((p) => p.date < cut), i.invoice);
      const flags = [];
      if (owes > d.creditLimit) flags.push({ key: 'flag.overLimit', status: 'red', vars: { amount: r2(owes - d.creditLimit) } });
      const waiting = s.orders.filter((o) => o.dealerId === d.id && o.status === 'needs-approval');
      if (waiting.length) flags.push({ key: 'flag.awaitingApproval', status: 'red', vars: { amount: r2(sumBy(waiting, (o) => o.total)) } });
      const bounced = pays.filter((p) => p.status === 'bounced' && p.date >= cut);
      if (bounced.length) flags.push({ key: 'flag.bounced', status: 'red', vars: { amount: r2(sumBy(bounced, (p) => p.amount)) } });
      if (ageing.d60p > 0) flags.push({ key: 'flag.old60', status: 'red', vars: { amount: ageing.d60p } });
      if (recent != null && earlier != null && recent > earlier + 7) flags.push({ key: 'flag.payingSlower', status: 'amber', vars: { before: earlier, now: recent } });
      for (const b of d.brandMix) {
        const last = lastByBrand.get(b);
        const days = last ? daysBetween(last, s.today) : null;
        if (days == null || days >= 45) flags.push({ key: 'flag.noBrand', status: 'amber', vars: { brand: BRAND.get(b).name, days } });
      }
      const sp = i.staff.get(d.salespersonId);
      const last = invs.map((x) => x.date).sort().at(-1) || null;
      return {
        dealerId: d.id, name: d.name, town: d.town, district: d.district, salespersonId: d.salespersonId, salesperson: sp.name,
        creditDays: d.creditDays, habit: d.habit, limit: d.creditLimit, owes, usedPct: Math.round((owes / d.creditLimit) * 100), ageing,
        avgDaysToPay: daysToPay(s, pays, i.invoice), lastOrder: last,
        pendingDeliveries: invs.filter((x) => x.status !== 'delivered').length,
        salesTrend: { weeks: weekStarts, values: trend },
        brandMix: [...mix].map(([brand, value]) => ({ brand, value: r2(value) })).sort((a, b) => b.value - a.value),
        flags, status: flags.some((f) => f.status === 'red') ? 'red' : flags.length ? 'amber' : 'green',
      };
    });
}

// ---------- product × dealer grid ----------
export function grid(state, { metric = 'sold', top = 20, cols = 10, q, district } = {}) {
  const s = state;
  const i = ix(s);
  const needle = (q || '').trim().toLowerCase();
  const cells = {}; const rowTot = new Map(); const colTot = new Map();
  for (const inv of s.invoices) {
    if (!counted(inv)) continue;
    const d = i.dealer.get(inv.dealerId);
    if (district && d.district !== district) continue;
    const f = metric === 'outstanding' ? invoiceBalance(inv) / inv.total : 1;
    if (f <= 0) continue;
    for (const l of inv.lines) {
      const v = (l.taxable + l.gst) * f;
      (cells[l.productId] ||= {})[d.id] = (cells[l.productId][d.id] || 0) + v;
    }
  }
  const dealerHit = needle && s.dealers.some((d) => `${d.name} ${d.town}`.toLowerCase().includes(needle));
  const productOk = (pid) => !needle || dealerHit || `${PRODUCT.get(pid).name} ${PRODUCT.get(pid).brand}`.toLowerCase().includes(needle);
  const dealerOk = (did) => !dealerHit || `${i.dealer.get(did).name} ${i.dealer.get(did).town}`.toLowerCase().includes(needle);
  for (const [pid, row] of Object.entries(cells)) {
    if (!productOk(pid)) continue;
    for (const [did, v] of Object.entries(row)) if (dealerOk(did)) rowTot.set(pid, (rowTot.get(pid) || 0) + v);
  }
  const rows = [...rowTot].sort((a, b) => b[1] - a[1]).slice(0, top).map(([pid, total]) => ({ productId: pid, name: PRODUCT.get(pid).name, brand: PRODUCT.get(pid).brand, total: r2(total) }));
  for (const { productId } of rows) for (const [did, v] of Object.entries(cells[productId])) if (dealerOk(did)) colTot.set(did, (colTot.get(did) || 0) + v);
  const colList = [...colTot].sort((a, b) => b[1] - a[1]).slice(0, cols).map(([did, total]) => ({ dealerId: did, name: i.dealer.get(did).name, town: i.dealer.get(did).town, total: r2(total) }));
  const out = {}; let max = 0;
  for (const { productId } of rows) {
    out[productId] = {};
    for (const { dealerId } of colList) { const v = r2(cells[productId][dealerId] || 0); out[productId][dealerId] = v; max = Math.max(max, v); }
  }
  return { metric, rows, cols: colList, cells: out, max };
}

// ---------- trail card: Ordered → Invoiced → Loaded → Delivered → Paid ----------
export function trail(state, productId, dealerId) {
  const s = state;
  const i = ix(s);
  const invs = (i.invByDealer.get(dealerId) || []).filter((inv) => counted(inv) && inv.lines.some((l) => l.productId === productId)).sort((a, b) => (a.at < b.at ? 1 : -1));
  const history = invs.map((inv) => {
    const l = inv.lines.find((x) => x.productId === productId);
    return { invoiceId: inv.id, date: inv.date, qty: l.qty, amount: r2(l.taxable + l.gst), status: inv.status, balance: invoiceBalance(inv) };
  });
  const inv = invs[0];
  if (!inv) return { productId, dealerId, steps: ['ordered', 'invoiced', 'loaded', 'delivered', 'paid'].map((key) => ({ key, done: false, at: null })), history };
  const order = i.order.get(inv.orderId);
  const trip = inv.tripId ? i.trip.get(inv.tripId) : null;
  const pays = (i.payByInv.get(inv.id) || []).filter((x) => x.p.status !== 'bounced');
  const paid = invoiceBalance(inv) <= 0;
  return {
    productId, dealerId, invoiceId: inv.id, history,
    steps: [
      { key: 'ordered', done: true, at: order ? order.at : inv.at, ref: inv.orderId },
      { key: 'invoiced', done: true, at: inv.at, ref: inv.id },
      { key: 'loaded', done: !!(trip && trip.loadedAt), at: trip ? trip.loadedAt : null, ref: trip ? trip.id : null },
      { key: 'delivered', done: !!inv.deliveredAt, at: inv.deliveredAt, ref: trip ? trip.id : null },
      { key: 'paid', done: paid, at: paid && pays.length ? pays.map((x) => x.p.at).sort().at(-1) : null, ref: pays.map((x) => x.p.id).at(-1) || null, balance: invoiceBalance(inv) },
    ],
  };
}

// ---------- one dealer's money ----------
export function dealerBalance(state, dealerId) {
  const s = state;
  const i = ix(s);
  const d = i.dealer.get(dealerId);
  const invs = (i.invByDealer.get(dealerId) || []).filter((inv) => invoiceBalance(inv) > 0);
  const owes = r2(sumBy(invs, invoiceBalance));
  const next = [...invs].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];
  const pending = (i.payByDealer.get(dealerId) || []).filter((p) => p.status === 'pending');
  return {
    owes, limit: d.creditLimit, used: owes, headroom: r2(d.creditLimit - owes), usedPct: Math.round((owes / d.creditLimit) * 100),
    ageing: ageingOf(s, invs), nextDue: next ? { invoiceId: next.id, date: next.dueDate, amount: invoiceBalance(next) } : null,
    pendingCheques: r2(sumBy(pending, (p) => p.amount)),
  };
}

export function dealerLedger(state, dealerId) {
  const s = state;
  const i = ix(s);
  return {
    balance: dealerBalance(s, dealerId),
    invoices: (i.invByDealer.get(dealerId) || []).map((inv) => ({ id: inv.id, date: inv.date, dueDate: inv.dueDate, total: inv.total, paid: inv.paid, balance: invoiceBalance(inv), status: inv.status, label: invoiceLabel(s, inv) })).reverse(),
    payments: (i.payByDealer.get(dealerId) || []).map((p) => ({ id: p.id, date: p.date, mode: p.mode, amount: p.amount, ref: p.ref, status: p.status, allocations: p.allocations })).reverse(),
  };
}

function invoiceLabel(s, inv) {
  if (invoiceBalance(inv) <= 0) return 'paid';
  if (inv.dueDate < s.today) return 'overdue';
  if (inv.dueDate <= addDays(s.today, 7)) return 'dueSoon';
  return 'pending';
}

// ---------- stock ----------
export function stock(state, { q, brand, category } = {}) {
  const s = state;
  const needle = (q || '').trim().toLowerCase();
  const { rows } = productRows(s, { brand });
  return rows
    .filter((r) => (!category || r.category === category) && (needle ? `${r.name} ${r.category} ${r.brand} ${r.productId}`.toLowerCase().includes(needle) : r.stockQty > 0 || s.damagedStock[r.productId] > 0))
    .map((r) => ({ productId: r.productId, name: r.name, brand: r.brand, category: r.category, photo: r.photo, qty: r.stockQty, damaged: s.damagedStock[r.productId] || 0, value: r.stockValue, daysCover: r.daysCover, lastMove: r.lastMove }))
    .sort((a, b) => b.value - a.value);
}

// ---------- tonight's 8 pm summary ----------
export function summary8pm(state, date = state.today) {
  const s = state;
  const invs = s.invoices.filter((inv) => counted(inv) && inv.date === date);
  const cleared = s.payments.filter((p) => p.status === 'cleared' && dayOf(p.clearedAt) === date);
  const cheques = s.payments.filter((p) => p.mode === 'cheque' && p.date === date && p.status === 'pending');
  const drops = s.trips.filter((t) => t.date === date).flatMap((t) => t.drops);
  const overdue = s.invoices.filter((inv) => invoiceBalance(inv) > 0 && inv.dueDate < date);
  const bar = cycleBar(s);
  return {
    date, sales: r2(sumBy(invs, (x) => x.total)), invoices: invs.length,
    collected: r2(sumBy(cleared, (p) => p.amount)), chequesPending: r2(sumBy(cheques, (p) => p.amount)),
    deliveries: { done: drops.filter((d) => d.status === 'delivered').length, total: drops.length },
    overdue: r2(sumBy(overdue, invoiceBalance)), overdueDealers: new Set(overdue.map((x) => x.dealerId)).size,
    claims: s.claims.filter((c) => c.date === date).length,
    bar: { total: bar.total, bank: bar.bank },
  };
}

// ---------- the only data the dealer and driver screens may read ----------
// They carry no purchase rates, margins, costs, or anything about another dealer.
const DEALER_STEP = { waiting: 'packed', planned: 'packed', loaded: 'loaded', ontheway: 'ontheway', delivered: 'delivered', cancelled: 'cancelled' };

export function dealerView(state, dealerId) {
  const s = state;
  const i = ix(s);
  const d = i.dealer.get(dealerId);
  if (!d) return null;
  const bal = dealerBalance(s, dealerId);
  const orders = s.orders.filter((o) => o.dealerId === dealerId && o.status !== 'rejected').sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 5).map((o) => {
    const inv = o.invoiceId ? i.invoice.get(o.invoiceId) : null;
    const trip = inv && inv.tripId ? i.trip.get(inv.tripId) : null;
    const drop = trip ? trip.drops.find((x) => x.invoiceId === inv.id) : null;
    const showOtp = drop && drop.status === 'pending' && (trip.status === 'loaded' || trip.status === 'left');
    const start = trip && (trip.leftAt || trip.loadedAt);
    return {
      orderId: o.id, invoiceId: inv ? inv.id : null, date: o.date, total: o.total,
      step: inv ? DEALER_STEP[inv.status] : 'placed',
      vehicle: trip ? i.vehicle.get(trip.vehicleId).plate : null, driver: trip ? i.driver.get(trip.driverId).name : null,
      eta: start && inv.status !== 'delivered' ? addMinutes(start, 60 + 45 * drop.seq).slice(11) : null,
      deliveredAt: inv ? inv.deliveredAt : null, otp: showOtp ? drop.otp : null,
    };
  });
  const invs = (i.invByDealer.get(dealerId) || []).filter(counted);
  const byBrand = new Map(); const byProduct = new Map();
  for (const inv of invs) for (const l of inv.lines) {
    byBrand.set(l.brand, (byBrand.get(l.brand) || 0) + l.taxable + l.gst);
    const p = byProduct.get(l.productId) || { productId: l.productId, name: PRODUCT.get(l.productId).name, brand: l.brand, qty: 0, value: 0, rate: l.rate };
    p.qty += l.qty; p.value += l.taxable + l.gst; p.rate = l.rate;
    byProduct.set(l.productId, p);
  }
  const lastOrder = s.orders.filter((o) => o.dealerId === dealerId).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  return {
    dealer: { id: d.id, name: d.name, town: d.town, district: d.district, address: d.address },
    owes: bal.owes, limit: bal.limit, used: bal.used, headroom: bal.headroom, usedPct: bal.usedPct, nextDue: bal.nextDue,
    orders,
    invoices: invs.map((inv) => ({ id: inv.id, date: inv.date, dueDate: inv.dueDate, total: inv.total, paid: inv.paid, balance: invoiceBalance(inv), label: invoiceLabel(s, inv) })).reverse(),
    purchases: {
      byBrand: [...byBrand].map(([brand, value]) => ({ brand, name: BRAND.get(brand).name, value: r2(value) })).sort((a, b) => b.value - a.value),
      byProduct: [...byProduct.values()].map((p) => ({ ...p, value: r2(p.value) })).sort((a, b) => b.value - a.value),
    },
    lastOrder: lastOrder ? { orderId: lastOrder.id, lines: lastOrder.lines.map((l) => ({ productId: l.productId, qty: l.qty, rate: l.rate })) } : null,
    queries: s.queries.filter((x) => x.dealerId === dealerId).map((x) => ({ id: x.id, at: x.at, text: x.text, status: x.status })),
  };
}

export function driverView(state, driverId) {
  const s = state;
  const i = ix(s);
  const dr = i.driver.get(driverId);
  if (!dr) return null;
  const trips = s.trips.filter((t) => t.driverId === driverId && (t.date === s.today || t.status !== 'done'));
  const vehicle = trips.length ? i.vehicle.get(trips.at(-1).vehicleId) : s.vehicles.find((v) => v.driverId === driverId);
  return {
    driver: { id: dr.id, name: dr.name },
    vehicle: vehicle ? { id: vehicle.id, plate: vehicle.plate } : null,
    trips: trips.map((t) => ({ tripId: t.id, status: t.status, plate: i.vehicle.get(t.vehicleId).plate, ewayBill: t.ewayBill || null })),
    drops: trips.flatMap((t) => t.drops.map((x) => {
      const d = i.dealer.get(x.dealerId);
      const inv = i.invoice.get(x.invoiceId);
      return {
        tripId: t.id, tripStatus: t.status, seq: x.seq, invoiceId: x.invoiceId, dealerName: d.name, town: d.town, address: d.address, phone: d.phone,
        amount: inv.total, status: x.status, reason: x.reason, at: x.at,
        lines: inv.lines.map((l) => ({ productId: l.productId, name: PRODUCT.get(l.productId).name, qty: l.qty })),
      };
    })),
  };
}

// ---------- search and activity ----------
export function search(state, q, { limit = 12 } = {}) {
  const s = state;
  const n = (q || '').trim().toLowerCase();
  if (n.length < 2) return [];
  const hits = [];
  for (const d of s.dealers) if (`${d.name} ${d.town}`.toLowerCase().includes(n)) hits.push({ kind: 'dealer', id: d.id, label: d.name, sub: d.town });
  for (const b of CATALOG.brands) if (b.name.toLowerCase().includes(n)) hits.push({ kind: 'brand', id: b.key, label: b.name });
  for (const inv of s.invoices) if (inv.id.toLowerCase().includes(n)) hits.push({ kind: 'invoice', id: inv.id, label: inv.id, sub: ix(s).dealer.get(inv.dealerId).name });
  for (const p of CATALOG.products) if (`${p.name} ${p.category}`.toLowerCase().includes(n)) hits.push({ kind: 'product', id: p.id, label: p.name, sub: BRAND.get(p.brand).name });
  return hits.slice(0, limit);
}

export function activity(state, { limit = 200 } = {}) {
  return state.audit.slice(-limit).reverse();
}
