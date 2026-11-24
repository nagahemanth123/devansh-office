// The store: one set of records, the business rules that change them, and persistence.
// Every action takes `by: {role, name}` last, writes one audit entry when it changes something,
// saves to localStorage['dm.state.v1'] and tells subscribers. Without storage it runs in memory.
// The demo clock starts at the seed's morning and moves 4 minutes per action, so runs are repeatable.
import { seed as makeSeed, purchaseRate, dealerRate } from './seed.js';
import { PRODUCT, BRAND, orderTotals, invoiceBalance, dealerOwes, addDays, addMinutes, dayOf, r2 } from './selectors.js';

export { makeSeed as seed };

const KEY = 'dm.state.v1';
const EWAY_LIMIT = 50000;
const STEPS = ['ordered', 'left', 'onway', 'received'];
const listeners = new Set();
let state = null;

// ---------- persistence ----------
function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
function load() {
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === 1 && Array.isArray(s.invoices)) return s;
    }
  } catch { /* unreadable or blocked storage: start fresh */ }
  return makeSeed();
}
function persist() {
  try { storage()?.setItem(KEY, JSON.stringify(state)); } catch { /* private mode or full: keep going in memory */ }
}
const current = () => (state ??= load());

export function getState() { return current(); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function resetDemo() {
  state = makeSeed();
  persist();
  listeners.forEach((fn) => fn(state));
  return state;
}
// Tests only: forget the in-memory copy and read storage again, as a page reload would.
export function _reloadForTests() { state = null; return current(); }

// Wraps a rule as a public action: stamps the demo clock, saves and notifies on success.
function action(rule) {
  return (...args) => {
    const s = current();
    const by = args.at(-1);
    if (!by || !by.role || !by.name) throw new Error('by {role, name} needed');
    // Four minutes per action; after 8 pm the clock slows to a minute so a long session stays on today.
    const late = s.clock >= `${s.today}T20:00`;
    const at = late && s.clock >= `${s.today}T23:59` ? s.clock : addMinutes(s.clock, late ? 1 : 4);
    const before = s.audit.length;
    const out = rule(s, ...args.slice(0, -1), { at, by, log: true });
    if (s.audit.length !== before) { s.clock = at; s.rev += 1; persist(); listeners.forEach((fn) => fn(s)); }
    return out;
  };
}

// ---------- shared helpers for the rules ----------
const fail = (msg) => { throw new Error(msg); };
const find = (rows, id, what) => rows.find((r) => r.id === id) || fail(`${what} not found: ${id}`);
const yymm = (at) => at.slice(2, 4) + at.slice(5, 7);
const pad = (n, w) => String(n).padStart(w, '0');
const RESERVED = new Set(['PO-2611-041']); // the guided day's PO keeps its number

function nextId(s, kind, at) {
  const fmt = {
    po: (n) => `PO-${yymm(at)}-${pad(n, 3)}`, grn: (n) => `GRN-${yymm(at)}-${pad(n, 3)}`, claim: (n) => `CL-${yymm(at)}-${pad(n, 2)}`,
    bill: (n) => `BB-${yymm(at)}-${pad(n, 3)}`, bpay: (n) => `BP-${yymm(at)}-${pad(n, 2)}`, trip: (n) => `T-${yymm(at)}-${pad(n, 3)}`,
    pay: (n) => `RC-${yymm(at)}-${pad(n, 4)}`, order: (n) => `SO-${pad(n, 5)}`, inv: (n) => `DM/26-27/${n}`, lot: (n) => `L-${pad(n, 5)}`, query: (n) => `Q-${pad(n, 3)}`,
  }[kind];
  const monthly = !['order', 'inv', 'lot', 'query'].includes(kind);
  const counter = monthly ? `${kind}${yymm(at)}` : kind;
  let id;
  do { s.seq[counter] = (s.seq[counter] || (kind === 'inv' ? 3000 : 0)) + 1; id = fmt(s.seq[counter]); } while (RESERVED.has(id));
  return id;
}

function audit(s, ctx, action, ref, summary, key, vars) {
  if (!ctx.log) return;
  s.audit.push({ at: ctx.at, by: { role: ctx.by.role, name: ctx.by.name }, action, ref, summary, key, vars });
}

const isWhole = (n) => Number.isInteger(n) && n >= 0;
const available = (s, pid) => s.lots.reduce((a, l) => a + (l.productId === pid ? l.left : 0), 0);

function checkLines(lines, rateOf, what) {
  if (!Array.isArray(lines) || !lines.length) fail(`${what} needs at least one line`);
  return lines.map((l) => {
    if (!PRODUCT.has(l.productId)) fail(`unknown product: ${l.productId}`);
    if (!Number.isInteger(l.qty) || l.qty <= 0) fail('quantity must be a whole number above 0');
    const rate = l.rate ?? rateOf(l.productId);
    if (!(rate > 0)) fail('rate must be above 0');
    return { productId: l.productId, qty: l.qty, rate };
  });
}

function checkStock(s, lines) {
  const need = new Map();
  for (const l of lines) need.set(l.productId, (need.get(l.productId) || 0) + l.qty);
  for (const [pid, q] of need) if (available(s, pid) < q) fail('insufficient stock');
}

// Takes stock out oldest lot first (FIFO); each invoice line remembers its lots, so cost follows the goods.
function takeStock(s, pid, qty) {
  const used = [];
  for (const lot of s.lots) {
    if (qty === 0) break;
    if (lot.productId !== pid || lot.left === 0) continue;
    const q = Math.min(lot.left, qty);
    lot.left -= q; qty -= q;
    used.push({ lotId: lot.id, qty: q, cost: lot.cost });
  }
  return used;
}
// Puts returned goods back, newest lot first.
function returnStock(s, line, qty) {
  for (let k = line.lots.length - 1; k >= 0 && qty > 0; k -= 1) {
    const u = line.lots[k];
    const q = Math.min(u.qty, qty);
    s.lots.find((l) => l.id === u.lotId).left += q;
    u.qty -= q; qty -= q;
  }
  line.lots = line.lots.filter((u) => u.qty > 0);
}

function makeInvoice(s, order, ctx) {
  const totals = orderTotals(order.lines);
  const dealer = find(s.dealers, order.dealerId, 'dealer');
  const id = nextId(s, 'inv', ctx.at);
  const inv = {
    id, orderId: order.id, dealerId: order.dealerId, date: dayOf(ctx.at), at: ctx.at, dueDate: addDays(dayOf(ctx.at), dealer.creditDays),
    lines: totals.lines.map((l) => ({ ...l, lots: takeStock(s, l.productId, l.qty) })),
    taxable: totals.taxable, gst: totals.gst, roundOff: totals.roundOff, total: totals.total, paid: 0,
    status: 'waiting', tripId: null, deliveredAt: null,
  };
  s.invoices.push(inv);
  order.invoiceId = id;
  order.status = 'invoiced';
  return inv;
}

function resolveTrip(trip, ctx) {
  if (trip.drops.every((d) => d.status !== 'pending')) { trip.status = 'done'; trip.doneAt = ctx.at; }
}

// ---------- the rules (state, ...args, ctx) ----------
// seed.js runs these same rules to build the history, with ctx.at set to past moments.
function createPORule(s, brandKey, lines, ctx) {
  if (!BRAND.has(brandKey)) fail(`unknown brand: ${brandKey}`);
  const clean = checkLines(lines, purchaseRate, 'a purchase order');
  if (clean.some((l) => PRODUCT.get(l.productId).brand !== brandKey)) fail('every line must be from the same brand');
  const id = ctx.id || nextId(s, 'po', ctx.at);
  const value = r2(clean.reduce((a, l) => a + l.qty * l.rate, 0));
  const po = { id, brand: brandKey, date: dayOf(ctx.at), at: { ordered: ctx.at }, step: 'ordered', lines: clean, value, eta: addDays(dayOf(ctx.at), s.brandTerms[brandKey].leadDays + 1), grnId: null };
  s.pos.push(po);
  audit(s, ctx, 'po.create', id, `Purchase order ${id} to ${BRAND.get(brandKey).name}, ${clean.length} lines`, 'audit.poCreate', { po: id, brand: brandKey, lines: clean.length, value });
  return po;
}

function advancePORule(s, poId, from, ctx) {
  const po = find(s.pos, poId, 'purchase order');
  if (from && po.step !== from) return po; // a second tap after the step already moved
  if (po.step === 'onway') fail('use receivePO');
  if (po.step === 'received') fail('already received');
  const next = STEPS[STEPS.indexOf(po.step) + 1];
  po.step = next;
  po.at[next] = ctx.at;
  if (next === 'left') {
    // The brand bills us when the lorry leaves its godown; we pay on its credit days.
    const id = nextId(s, 'bill', ctx.at);
    s.bills.push({ id, brand: po.brand, poId: po.id, date: dayOf(ctx.at), at: ctx.at, amount: po.value, due: addDays(dayOf(ctx.at), s.brandTerms[po.brand].creditDays) });
  }
  audit(s, ctx, 'po.advance', po.id, `${po.id} moved to "${next}"`, 'audit.poAdvance', { po: po.id, step: next });
  return po;
}

function receivePORule(s, poId, lines, photo, ctx) {
  const po = find(s.pos, poId, 'purchase order');
  if (po.step === 'received') return s.grns.find((g) => g.id === po.grnId);
  if (po.step !== 'left' && po.step !== 'onway') fail('not on the way yet');
  const given = new Map((lines || []).map((l) => [l.productId, l]));
  for (const pid of given.keys()) if (!po.lines.some((l) => l.productId === pid)) fail(`not on this order: ${pid}`);
  const grnLines = po.lines.map((l) => {
    const g = given.get(l.productId) || { received: l.qty, short: 0, damaged: 0 };
    const received = g.received ?? l.qty; const short = g.short ?? 0; const damaged = g.damaged ?? 0;
    if (![received, short, damaged].every(isWhole)) fail('quantities must be whole numbers, 0 or more');
    if (damaged > received) fail('damaged cannot be more than received');
    return { productId: l.productId, ordered: l.qty, received, short, damaged, rate: l.rate };
  });
  const grnId = ctx.grnId || nextId(s, 'grn', ctx.at);
  for (const l of grnLines) {
    const good = l.received - l.damaged;
    if (good > 0) s.lots.push({ id: nextId(s, 'lot', ctx.at), grnId, productId: l.productId, brand: po.brand, date: dayOf(ctx.at), at: ctx.at, qty: good, cost: l.rate, left: good });
    if (l.damaged) s.damagedStock[l.productId] = (s.damagedStock[l.productId] || 0) + l.damaged;
  }
  const grn = { id: grnId, poId: po.id, brand: po.brand, date: dayOf(ctx.at), at: ctx.at, photo: photo ?? null, lines: grnLines, value: r2(grnLines.reduce((a, l) => a + (l.received - l.damaged) * l.rate, 0)) };
  s.grns.push(grn);
  const bad = grnLines.filter((l) => l.short + l.damaged > 0);
  let claim = null;
  if (bad.length) {
    claim = {
      id: nextId(s, 'claim', ctx.at), brand: po.brand, poId: po.id, grnId, date: dayOf(ctx.at), at: ctx.at, status: 'open',
      lines: bad.map((l) => ({ productId: l.productId, short: l.short, damaged: l.damaged, rate: l.rate })),
      amount: r2(bad.reduce((a, l) => a + (l.short + l.damaged) * l.rate, 0)),
    };
    s.claims.push(claim);
    grn.claimId = claim.id;
  }
  if (!po.at.onway) po.at.onway = ctx.at;
  po.step = 'received'; po.at.received = ctx.at; po.grnId = grnId;
  const summary = claim ? `Goods received on ${po.id}; claim ${claim.id} of ₹${claim.amount} raised on ${BRAND.get(po.brand).name}` : `Goods received on ${po.id}`;
  audit(s, ctx, 'po.receive', grnId, summary, claim ? 'audit.receiveClaim' : 'audit.receive', { po: po.id, grn: grnId, claim: claim?.id, amount: claim?.amount });
  return grn;
}

function createOrderRule(s, dealerId, lines, ctx) {
  const dealer = find(s.dealers, dealerId, 'dealer');
  const clean = checkLines(lines, dealerRate, 'an order');
  checkStock(s, clean);
  const { total } = orderTotals(clean);
  const owes = dealerOwes(s, dealerId);
  const needsApproval = owes + total > dealer.creditLimit;
  const order = { id: nextId(s, 'order', ctx.at), dealerId, date: dayOf(ctx.at), at: ctx.at, lines: clean, total, status: needsApproval ? 'needs-approval' : 'new', invoiceId: null, approvedBy: null, approvedAt: null };
  s.orders.push(order);
  const invoice = needsApproval ? null : makeInvoice(s, order, ctx);
  audit(s, ctx, 'order.create', order.id,
    needsApproval ? `Order ${order.id} for ${dealer.name} is over the credit limit and waits for admin approval` : `Order ${order.id} for ${dealer.name}; invoice ${invoice.id} raised`,
    needsApproval ? 'audit.orderHeld' : 'audit.orderInvoiced', { order: order.id, dealer: dealer.name, invoice: invoice?.id, total });
  return { order, invoice, needsApproval };
}

function approveCreditRule(s, orderId, ctx) {
  if (ctx.by.role !== 'admin') fail('not allowed');
  const order = find(s.orders, orderId, 'order');
  if (order.status === 'invoiced') return s.invoices.find((i) => i.id === order.invoiceId);
  if (order.status !== 'needs-approval') fail('nothing to approve');
  checkStock(s, order.lines);
  order.approvedBy = ctx.by.name; order.approvedAt = ctx.at;
  const inv = makeInvoice(s, order, ctx);
  audit(s, ctx, 'order.approve', order.id, `Credit exception approved for ${order.id}; invoice ${inv.id} raised`, 'audit.approve', { order: order.id, invoice: inv.id });
  return inv;
}

function otpFor(s, tripId, invoiceId, dealerId) {
  if (s.scriptedOtps[dealerId]) { const otp = s.scriptedOtps[dealerId]; delete s.scriptedOtps[dealerId]; return otp; }
  let h = 2166136261;
  for (const c of `${tripId}|${invoiceId}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return String(1000 + (h % 9000));
}

function createTripRule(s, { vehicleId, driverId, invoiceIds, ewayBill }, ctx) {
  find(s.vehicles, vehicleId, 'vehicle');
  find(s.drivers, driverId, 'driver');
  if (!Array.isArray(invoiceIds) || !invoiceIds.length) fail('a trip needs at least one invoice');
  if (new Set(invoiceIds).size !== invoiceIds.length) fail('an invoice is listed twice');
  const invs = invoiceIds.map((id) => find(s.invoices, id, 'invoice'));
  if (invs.some((i) => i.status !== 'waiting')) fail('invoice already on a trip or delivered');
  const value = r2(invs.reduce((a, i) => a + i.total, 0));
  const eway = (ewayBill || '').trim();
  if (value > EWAY_LIMIT && !eway) fail('eway bill needed');
  const id = nextId(s, 'trip', ctx.at);
  const trip = {
    id, vehicleId, driverId, date: dayOf(ctx.at), at: ctx.at, ewayBill: eway || null, value, status: 'planned', loadedAt: null, leftAt: null, doneAt: null,
    drops: invs.map((inv, k) => ({ seq: k + 1, invoiceId: inv.id, dealerId: inv.dealerId, otp: otpFor(s, id, inv.id, inv.dealerId), status: 'pending', reason: null, photo: null, at: null })),
  };
  s.trips.push(trip);
  for (const inv of invs) { inv.status = 'planned'; inv.tripId = id; }
  audit(s, ctx, 'trip.create', id, `Trip ${id} planned with ${invs.length} drops`, 'audit.tripCreate', { trip: id, drops: invs.length, value });
  return trip;
}

function markLoadedRule(s, tripId, ctx) {
  const trip = find(s.trips, tripId, 'trip');
  if (trip.status !== 'planned') return trip;
  trip.status = 'loaded'; trip.loadedAt = ctx.at;
  for (const d of trip.drops) find(s.invoices, d.invoiceId, 'invoice').status = 'loaded';
  audit(s, ctx, 'trip.loaded', tripId, `Trip ${tripId} loaded`, 'audit.tripLoaded', { trip: tripId });
  return trip;
}

function markLeftRule(s, tripId, ctx) {
  const trip = find(s.trips, tripId, 'trip');
  if (trip.status === 'planned') fail('not loaded yet');
  if (trip.status !== 'loaded') return trip;
  trip.status = 'left'; trip.leftAt = ctx.at;
  for (const d of trip.drops) if (d.status === 'pending') find(s.invoices, d.invoiceId, 'invoice').status = 'ontheway';
  audit(s, ctx, 'trip.left', tripId, `Trip ${tripId} left the godown`, 'audit.tripLeft', { trip: tripId });
  return trip;
}

function dropOf(s, tripId, invoiceId) {
  const trip = find(s.trips, tripId, 'trip');
  const drop = trip.drops.find((d) => d.invoiceId === invoiceId) || fail(`invoice ${invoiceId} is not on trip ${tripId}`);
  return { trip, drop, inv: find(s.invoices, invoiceId, 'invoice') };
}

function markDeliveredRule(s, tripId, invoiceId, { photo = null, otp } = {}, ctx) {
  const { trip, drop, inv } = dropOf(s, tripId, invoiceId);
  if (drop.status === 'delivered') return 'ok';
  if (drop.status !== 'pending') fail('drop already closed');
  if (trip.status === 'planned') fail('not loaded yet');
  if (String(otp ?? '').trim() !== drop.otp) {
    audit(s, ctx, 'delivery.badOtp', invoiceId, `Wrong OTP entered for ${invoiceId}`, 'audit.badOtp', { invoice: invoiceId });
    return 'bad-otp';
  }
  if (trip.status === 'loaded') { trip.status = 'left'; trip.leftAt = ctx.at; }
  drop.status = 'delivered'; drop.at = ctx.at; drop.photo = photo;
  inv.status = 'delivered'; inv.deliveredAt = ctx.at;
  resolveTrip(trip, ctx);
  audit(s, ctx, 'delivery.done', invoiceId, `${invoiceId} delivered with photo and OTP`, 'audit.delivered', { invoice: invoiceId, trip: tripId });
  return 'ok';
}

function markNotDeliveredRule(s, tripId, invoiceId, reason, partialLines, ctx) {
  const { trip, drop, inv } = dropOf(s, tripId, invoiceId);
  if (!['closed', 'rejected', 'partial'].includes(reason)) fail('reason must be closed, rejected or partial');
  if (drop.status !== 'pending') return drop;
  if (trip.status === 'planned') fail('not loaded yet');
  if (reason !== 'closed' && inv.paid > 0) fail('invoice has payments');
  let kind = reason;
  if (reason === 'partial') {
    const given = new Map((partialLines || []).map((l) => [l.productId, l.delivered]));
    for (const [pid, q] of given) {
      const line = inv.lines.find((l) => l.productId === pid) || fail(`not on this invoice: ${pid}`);
      if (!isWhole(q) || q > line.qty) fail('delivered quantity must be between 0 and the invoiced quantity');
    }
    const kept = inv.lines.map((l) => (given.has(l.productId) ? given.get(l.productId) : l.qty));
    if (kept.every((q) => q === 0)) kind = 'rejected';
    else {
      const returned = [];
      inv.lines.forEach((l, k) => {
        if (kept[k] === l.qty) return;
        returned.push({ productId: l.productId, qty: l.qty - kept[k] });
        returnStock(s, l, l.qty - kept[k]);
        l.qty = kept[k];
      });
      const lots = inv.lines.map((l) => l.lots);
      const totals = orderTotals(inv.lines.filter((l) => l.qty > 0));
      inv.lines = totals.lines.map((l) => ({ ...l, lots: lots[inv.lines.findIndex((x) => x.productId === l.productId)] }));
      Object.assign(inv, { taxable: totals.taxable, gst: totals.gst, roundOff: totals.roundOff, total: totals.total, returned, partial: true, status: 'delivered', deliveredAt: ctx.at });
      drop.status = 'partial';
    }
  }
  if (kind === 'rejected') {
    for (const l of inv.lines) returnStock(s, l, l.qty);
    inv.status = 'cancelled'; inv.cancelledAt = ctx.at;
    drop.status = 'not-delivered';
  }
  if (kind === 'closed') { inv.status = 'waiting'; inv.tripId = null; drop.status = 'not-delivered'; }
  drop.reason = reason; drop.at = ctx.at;
  resolveTrip(trip, ctx);
  audit(s, ctx, 'delivery.not', invoiceId, `${invoiceId} not delivered: ${reason}`, 'audit.notDelivered', { invoice: invoiceId, reason });
  return drop;
}

function recordPaymentRule(s, dealerId, { mode, amount, allocations, ref = null, key = null } = {}, ctx) {
  const dealer = find(s.dealers, dealerId, 'dealer');
  if (key) { const seen = s.payments.find((p) => p.key === key); if (seen) return seen; }
  if (!['cash', 'upi', 'cheque'].includes(mode)) fail('mode must be cash, upi or cheque');
  if (!(amount > 0)) fail('amount must be above 0');
  if (!Array.isArray(allocations) || !allocations.length) fail('allocations must equal amount');
  if (allocations.some((a) => !(a.amount > 0))) fail('each allocation must be above 0');
  if (Math.abs(allocations.reduce((a, x) => a + x.amount, 0) - amount) > 0.005) fail('allocations must equal amount');
  const per = new Map();
  for (const a of allocations) per.set(a.invoiceId, (per.get(a.invoiceId) || 0) + a.amount);
  for (const [id, amt] of per) {
    const inv = find(s.invoices, id, 'invoice');
    if (inv.dealerId !== dealerId) fail('invoice belongs to another dealer');
    if (amt > invoiceBalance(inv) + 0.005) fail('more than balance');
  }
  const p = {
    id: nextId(s, 'pay', ctx.at), dealerId, date: dayOf(ctx.at), at: ctx.at, mode, amount: r2(amount), ref, key,
    allocations: allocations.map((a) => ({ invoiceId: a.invoiceId, amount: r2(a.amount) })),
    status: mode === 'cheque' ? 'pending' : 'cleared', clearedAt: mode === 'cheque' ? null : ctx.at, bouncedAt: null,
  };
  for (const [id, amt] of per) { const inv = find(s.invoices, id, 'invoice'); inv.paid = r2(inv.paid + amt); }
  s.payments.push(p);
  audit(s, ctx, 'payment.record', p.id, `${mode.toUpperCase()} ₹${p.amount} from ${dealer.name} against ${per.size} invoice(s)`, 'audit.payment', { payment: p.id, mode, amount: p.amount, dealer: dealer.name, invoices: per.size });
  return p;
}

function setChequeRule(s, paymentId, status, ctx) {
  const p = find(s.payments, paymentId, 'payment');
  if (p.mode !== 'cheque') fail('not a cheque');
  if (!['cleared', 'bounced'].includes(status)) fail('status must be cleared or bounced');
  if (p.status === status) return p;
  if (p.status !== 'pending') fail(`cheque already ${p.status}`);
  p.status = status;
  if (status === 'cleared') p.clearedAt = ctx.at;
  else {
    p.bouncedAt = ctx.at;
    for (const a of p.allocations) { const inv = find(s.invoices, a.invoiceId, 'invoice'); inv.paid = r2(inv.paid - a.amount); }
  }
  const dealer = find(s.dealers, p.dealerId, 'dealer');
  audit(s, ctx, `cheque.${status}`, p.id, `Cheque ${p.ref || p.id} of ₹${p.amount} from ${dealer.name} ${status}`, status === 'cleared' ? 'audit.chequeCleared' : 'audit.chequeBounced', { payment: p.id, amount: p.amount, dealer: dealer.name });
  return p;
}

function raiseQueryRule(s, dealerId, text, ctx) {
  const dealer = find(s.dealers, dealerId, 'dealer');
  const body = String(text || '').trim() || fail('query text needed');
  const q = { id: nextId(s, 'query', ctx.at), dealerId, at: ctx.at, text: body, status: 'open' };
  s.queries.push(q);
  audit(s, { ...ctx, by: { role: 'dealer', name: dealer.name } }, 'query.raise', q.id, `${dealer.name} raised a query`, 'audit.query', { dealer: dealer.name });
  return q;
}

// Paying a brand is not a screen in the demo; the seed uses it to build history.
function payBrandRule(s, brand, amount, ctx) {
  const p = { id: nextId(s, 'bpay', ctx.at), brand, date: dayOf(ctx.at), at: ctx.at, amount: r2(amount) };
  s.brandPayments.push(p);
  audit(s, ctx, 'brand.pay', p.id, `Paid ₹${p.amount} to ${BRAND.get(brand).name}`, 'audit.brandPay', { brand, amount: p.amount });
  return p;
}

export const rules = {
  createPO: createPORule, advancePO: advancePORule, receivePO: receivePORule, createOrder: createOrderRule, approveCredit: approveCreditRule,
  createTrip: createTripRule, markLoaded: markLoadedRule, markLeft: markLeftRule, markDelivered: markDeliveredRule, markNotDelivered: markNotDeliveredRule,
  recordPayment: recordPaymentRule, setCheque: setChequeRule, raiseQuery: raiseQueryRule, payBrand: payBrandRule,
};

// ---------- public actions ----------
export const createPO = action(createPORule);
// advancePO(poId, by) moves one step. advancePO(poId, fromStep, by) only moves if the PO is still at fromStep,
// so a double tap on "Move to next step" moves once.
export function advancePO(poId, ...rest) {
  return action((s, id, ...args) => advancePORule(s, id, args.length === 2 ? args[0] : null, args.at(-1)))(poId, ...rest);
}
export const receivePO = action(receivePORule);
export const createOrder = action(createOrderRule);
export const approveCredit = action(approveCreditRule);
export const createTrip = action(createTripRule);
export const markLoaded = action(markLoadedRule);
export const markLeft = action(markLeftRule);
export const markDelivered = action(markDeliveredRule);
export const markNotDelivered = action(markNotDeliveredRule);
export const recordPayment = action(recordPaymentRule);
export const setCheque = action(setChequeRule);
export function raiseQuery(dealerId, text) {
  const d = current().dealers.find((x) => x.id === dealerId);
  return action(raiseQueryRule)(dealerId, text, { role: 'dealer', name: d ? d.name : 'Dealer' });
}

