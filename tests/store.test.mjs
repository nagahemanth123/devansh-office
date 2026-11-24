import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getState, subscribe, resetDemo, seed,
  createPO, advancePO, receivePO, createOrder, approveCredit, createTrip,
  markLoaded, markLeft, markDelivered, markNotDelivered, recordPayment, setCheque, raiseQuery,
} from '../js/store.js';
import { GUIDED, dealerRate } from '../js/seed.js';
import { invoiceBalance, dealerOwes, brandPayable } from '../js/selectors.js';

const godown = { role: 'godown', name: 'Prasad' };
const sales = { role: 'sales', name: 'Kiran' };
const admin = { role: 'admin', name: 'Ravi Kumar' };
const accounts = { role: 'accounts', name: 'Lakshmi' };
const driver = { role: 'driver', name: 'Suresh' };

const stockOf = (s, pid) => s.lots.filter((l) => l.productId === pid).reduce((a, l) => a + l.left, 0);

function fresh() { resetDemo(); return getState(); }

// A product with plenty of stock, used where the test only needs "an order".
function stockedProduct(s, min = 20) {
  const qty = new Map();
  for (const l of s.lots) qty.set(l.productId, (qty.get(l.productId) || 0) + l.left);
  for (const [pid, q] of qty) if (q >= min && !GUIDED.orderLines.some((g) => g.productId === pid)) return pid;
  throw new Error('no stocked product');
}

// An order that fits D-MYD-01's credit headroom and goes straight to an invoice.
function invoiceFor(dealerId = GUIDED.dealerId) {
  const { invoice } = createOrder(dealerId, GUIDED.orderLines, sales);
  assert.ok(invoice, 'guided order should not need approval');
  return invoice;
}

// An order a little bigger than the dealer's credit headroom, from the product with the most stock.
function overLimitLines(dealerId) {
  const s = getState();
  const d = s.dealers.find((x) => x.id === dealerId);
  const headroom = d.creditLimit - dealerOwes(s, dealerId);
  const qty = new Map();
  for (const l of s.lots) qty.set(l.productId, (qty.get(l.productId) || 0) + l.left);
  const [pid, have] = [...qty].filter(([p]) => !GUIDED.orderLines.some((g) => g.productId === p)).sort((a, b) => b[1] * dealerRate(b[0]) - a[1] * dealerRate(a[0]))[0];
  const need = Math.ceil((headroom + 1000) / (dealerRate(pid) * 1.18));
  assert.ok(need <= have, 'enough stock for an over-limit order');
  return [{ productId: pid, qty: need, rate: dealerRate(pid) }];
}

function tripFor(invoice) {
  const trip = createTrip({ vehicleId: GUIDED.vehicleId, driverId: GUIDED.driverId, invoiceIds: [invoice.id], ewayBill: GUIDED.ewayBill }, sales);
  markLoaded(trip.id, godown);
  markLeft(trip.id, driver);
  return getState().trips.find((t) => t.id === trip.id);
}

test('stock rises only on receive', () => {
  const s = fresh();
  const pid = 'goldmedal-x9-exhaust-fan';
  const before = stockOf(s, pid);
  const po = createPO('goldmedal', [{ productId: pid, qty: 30, rate: 1400 }], godown);
  assert.equal(po.step, 'ordered');
  assert.equal(stockOf(getState(), pid), before);
  advancePO(po.id, godown);
  advancePO(po.id, godown);
  assert.equal(getState().pos.find((p) => p.id === po.id).step, 'onway');
  assert.equal(stockOf(getState(), pid), before);
  assert.throws(() => advancePO(po.id, godown), /use receivePO/);
  receivePO(po.id, [{ productId: pid, received: 30, short: 0, damaged: 2 }], null, godown);
  assert.equal(stockOf(getState(), pid), before + 28);
  assert.equal(getState().damagedStock[pid], 2);
});

test('short on receipt makes a claim and cuts the payable', () => {
  const s = fresh();
  const po = s.pos.find((p) => p.id === GUIDED.poId);
  assert.equal(po.step, 'left');
  assert.equal(po.lines.length, 6);
  const switchLine = po.lines.find((l) => l.productId === GUIDED.shortProductId);
  assert.equal(switchLine.qty, 200);
  const payableBefore = brandPayable(getState(), 'goldmedal');
  advancePO(GUIDED.poId, godown);
  const grn = receivePO(GUIDED.poId, GUIDED.receiveLines, 'lorry-photo.jpg', godown);
  const claim = getState().claims.find((c) => c.grnId === grn.id);
  assert.ok(claim);
  assert.equal(claim.brand, 'goldmedal');
  assert.equal(claim.amount, 10 * switchLine.rate);
  assert.equal(brandPayable(getState(), 'goldmedal'), payableBefore - claim.amount);
});

test('receiving twice is a no-op', () => {
  fresh();
  advancePO(GUIDED.poId, godown);
  const a = receivePO(GUIDED.poId, GUIDED.receiveLines, null, godown);
  const lots = getState().lots.length;
  const b = receivePO(GUIDED.poId, GUIDED.receiveLines, null, godown);
  assert.equal(a.id, b.id);
  assert.equal(getState().lots.length, lots);
});

test('advancePO with an expected step happens once', () => {
  fresh();
  const pid = getState().lots.find((l) => l.brand === 'finolex').productId;
  const po = createPO('finolex', [{ productId: pid, qty: 10 }], godown);
  advancePO(po.id, 'ordered', godown);
  advancePO(po.id, 'ordered', godown); // double tap: still at the step after "ordered"
  assert.equal(getState().pos.find((p) => p.id === po.id).step, 'left');
});

test('invoice drops stock at creation, not delivery', () => {
  const s = fresh();
  const pid = GUIDED.orderLines[0].productId;
  const before = stockOf(s, pid);
  const inv = invoiceFor();
  assert.equal(stockOf(getState(), pid), before - GUIDED.orderLines[0].qty);
  const trip = tripFor(inv);
  const after = stockOf(getState(), pid);
  assert.equal(markDelivered(trip.id, inv.id, { photo: 'p.jpg', otp: GUIDED.otp }, driver), 'ok');
  assert.equal(stockOf(getState(), pid), after);
});

test('insufficient stock throws and changes nothing', () => {
  const s = fresh();
  const pid = stockedProduct(s);
  const rev = getState().rev;
  assert.throws(() => createOrder(GUIDED.dealerId, [{ productId: pid, qty: stockOf(s, pid) + 1, rate: dealerRate(pid) }], sales), /insufficient stock/);
  assert.equal(getState().rev, rev);
});

test('over-limit order needs admin approval', () => {
  const s = fresh();
  const dealer = s.dealers.find((d) => d.id === GUIDED.dealerId);
  assert.equal(dealer.creditLimit, 600000);
  assert.equal(dealerOwes(s, dealer.id), 210000);
  invoiceFor(); // the guided order (about 1.8 L) fits the 3.9 L headroom
  const { order, invoice, needsApproval } = createOrder(GUIDED.dealerId, overLimitLines(GUIDED.dealerId), sales);
  assert.equal(needsApproval, true);
  assert.equal(invoice, null);
  assert.equal(order.status, 'needs-approval');
  assert.throws(() => approveCredit(order.id, sales), /not allowed/);
  const inv = approveCredit(order.id, admin);
  assert.equal(inv.orderId, order.id);
  assert.equal(getState().orders.find((o) => o.id === order.id).status, 'invoiced');
  assert.equal(approveCredit(order.id, admin).id, inv.id); // second approval is a no-op
});

test('eway bill required over 50000', () => {
  fresh();
  const inv = invoiceFor();
  assert.ok(inv.total > 50000);
  assert.throws(() => createTrip({ vehicleId: 'V2', driverId: 'DR2', invoiceIds: [inv.id] }, sales), /eway bill needed/);
  assert.throws(() => createTrip({ vehicleId: 'V2', driverId: 'DR2', invoiceIds: [inv.id], ewayBill: '  ' }, sales), /eway bill needed/);
  const trip = createTrip({ vehicleId: 'V2', driverId: 'DR2', invoiceIds: [inv.id], ewayBill: GUIDED.ewayBill }, sales);
  assert.match(trip.drops[0].otp, /^\d{4}$/);
});

test('small trip needs no eway bill and each drop has an OTP', () => {
  const s = fresh();
  const pid = stockedProduct(s);
  const { invoice } = createOrder('D-PDT-05', [{ productId: pid, qty: 1, rate: dealerRate(pid) }], sales);
  assert.ok(invoice.total <= 50000);
  const trip = createTrip({ vehicleId: 'V5', driverId: 'DR5', invoiceIds: [invoice.id] }, sales);
  assert.match(trip.drops[0].otp, /^\d{4}$/);
});

test('delivery needs the right OTP and is idempotent', () => {
  fresh();
  const inv = invoiceFor();
  const trip = tripFor(inv);
  assert.equal(trip.drops[0].otp, GUIDED.otp);
  assert.equal(markDelivered(trip.id, inv.id, { photo: 'p.jpg', otp: '0000' }, driver), 'bad-otp');
  assert.equal(getState().invoices.find((i) => i.id === inv.id).status, 'ontheway');
  assert.equal(markDelivered(trip.id, inv.id, { photo: 'p.jpg', otp: GUIDED.otp }, driver), 'ok');
  const snap = JSON.stringify(getState());
  assert.equal(markDelivered(trip.id, inv.id, { photo: 'p.jpg', otp: GUIDED.otp }, driver), 'ok');
  assert.equal(JSON.stringify(getState()), snap);
  const after = getState();
  assert.equal(after.invoices.find((i) => i.id === inv.id).status, 'delivered');
  assert.equal(after.trips.find((t) => t.id === trip.id).status, 'done');
});

test('not delivered: closed goes back to waiting, partial returns lines to stock', () => {
  fresh();
  const inv = invoiceFor();
  const trip = tripFor(inv);
  markNotDelivered(trip.id, inv.id, 'closed', null, driver);
  let s = getState();
  assert.equal(s.invoices.find((i) => i.id === inv.id).status, 'waiting');
  const trip2 = tripFor(inv);
  const { productId, qty } = inv.lines[0];
  const totalBefore = inv.total;
  const stockBefore = stockOf(getState(), productId);
  markNotDelivered(trip2.id, inv.id, 'partial', [{ productId, delivered: qty - 2 }], driver);
  s = getState();
  const inv2 = s.invoices.find((i) => i.id === inv.id);
  assert.equal(inv2.status, 'delivered');
  assert.equal(inv2.lines[0].qty, qty - 2);
  assert.ok(inv2.total < totalBefore);
  assert.equal(inv2.lines[0].lots.reduce((a, u) => a + u.qty, 0), qty - 2);
  assert.equal(s.trips.find((t) => t.id === trip2.id).drops[0].status, 'partial');
  assert.equal(stockOf(s, productId), stockBefore + 2);
});

test('split payment across invoices and part-pay', () => {
  fresh();
  const s = getState();
  const open = s.invoices.filter((i) => i.dealerId === GUIDED.dealerId && invoiceBalance(i) > 0);
  assert.ok(open.length >= 2, 'guided dealer has at least two open invoices');
  const [a, b] = open;
  const balA = invoiceBalance(a); const balB = invoiceBalance(b);
  const half = Math.round(balB / 2);
  const amount = balA + half;
  const pay = recordPayment(GUIDED.dealerId, { mode: 'upi', amount, allocations: [{ invoiceId: a.id, amount: balA }, { invoiceId: b.id, amount: half }], ref: 'UPI 4431' }, accounts);
  const after = getState();
  assert.equal(pay.allocations.length, 2);
  assert.equal(invoiceBalance(after.invoices.find((i) => i.id === a.id)), 0);
  assert.equal(invoiceBalance(after.invoices.find((i) => i.id === b.id)), balB - half);
  assert.equal(dealerOwes(after, GUIDED.dealerId), 210000 - amount);
});

test('allocations must equal amount / not exceed balance', () => {
  fresh();
  const s = getState();
  const inv = s.invoices.find((i) => i.dealerId === GUIDED.dealerId && invoiceBalance(i) > 0);
  const bal = invoiceBalance(inv);
  const rev = getState().rev;
  assert.throws(() => recordPayment(GUIDED.dealerId, { mode: 'cash', amount: 1000, allocations: [{ invoiceId: inv.id, amount: 900 }] }, accounts), /allocations must equal amount/);
  assert.throws(() => recordPayment(GUIDED.dealerId, { mode: 'cash', amount: bal + 1, allocations: [{ invoiceId: inv.id, amount: bal + 1 }] }, accounts), /more than balance/);
  assert.equal(getState().rev, rev);
});

test('a payment key makes a double tap record once', () => {
  fresh();
  const inv = getState().invoices.find((i) => i.dealerId === GUIDED.dealerId && invoiceBalance(i) > 0);
  const p1 = recordPayment(GUIDED.dealerId, { mode: 'cash', amount: 1000, allocations: [{ invoiceId: inv.id, amount: 1000 }], key: 'tap-1' }, accounts);
  const p2 = recordPayment(GUIDED.dealerId, { mode: 'cash', amount: 1000, allocations: [{ invoiceId: inv.id, amount: 1000 }], key: 'tap-1' }, accounts);
  assert.equal(p1.id, p2.id);
  assert.equal(getState().payments.filter((p) => p.key === 'tap-1').length, 1);
});

test('bounced cheque puts dues back and flags red', async () => {
  fresh();
  const { attention } = await import('../js/selectors.js');
  const inv = getState().invoices.find((i) => i.dealerId === GUIDED.dealerId && invoiceBalance(i) > 0);
  const owes = dealerOwes(getState(), GUIDED.dealerId);
  const pay = recordPayment(GUIDED.dealerId, { mode: 'cheque', amount: 50000, allocations: [{ invoiceId: inv.id, amount: 50000 }], ref: 'CHQ 118842' }, accounts);
  assert.equal(pay.status, 'pending');
  assert.equal(dealerOwes(getState(), GUIDED.dealerId), owes - 50000);
  setCheque(pay.id, 'bounced', accounts);
  assert.equal(dealerOwes(getState(), GUIDED.dealerId), owes);
  const flag = attention(getState()).find((a) => a.kind === 'cheque' && a.ref === pay.id);
  assert.ok(flag);
  assert.equal(flag.status, 'red');
  assert.equal(flag.amount, 50000);
});

test('every action writes an audit entry', () => {
  fresh();
  const count = () => getState().audit.length;
  const step = (fn) => { const n = count(); const r = fn(); assert.equal(count(), n + 1); const e = getState().audit.at(-1); assert.ok(e.at && e.by && e.by.role && e.by.name && e.action && e.ref && e.summary); return r; };
  const pid = 'goldmedal-x9-exhaust-fan';
  const po = step(() => createPO('goldmedal', [{ productId: pid, qty: 5 }], godown));
  step(() => advancePO(po.id, godown));
  step(() => advancePO(po.id, godown));
  step(() => receivePO(po.id, [], null, godown));
  const { invoice } = step(() => createOrder(GUIDED.dealerId, GUIDED.orderLines, sales));
  const trip = step(() => createTrip({ vehicleId: 'V2', driverId: 'DR2', invoiceIds: [invoice.id], ewayBill: GUIDED.ewayBill }, sales));
  step(() => markLoaded(trip.id, godown));
  step(() => markLeft(trip.id, driver));
  step(() => markDelivered(trip.id, invoice.id, { photo: null, otp: GUIDED.otp }, driver));
  const pay = step(() => recordPayment(GUIDED.dealerId, { mode: 'cheque', amount: 1000, allocations: [{ invoiceId: invoice.id, amount: 1000 }] }, accounts));
  step(() => setCheque(pay.id, 'cleared', accounts));
  step(() => raiseQuery(GUIDED.dealerId, 'Please send the Parryware price list'));
  const n = count();
  markNotDelivered(trip.id, invoice.id, 'closed', null, driver); // already delivered: a no-op, so no entry
  assert.equal(count(), n);
});

test('approval writes an audit entry', () => {
  fresh();
  const { order } = createOrder(GUIDED.dealerId, overLimitLines(GUIDED.dealerId), sales);
  const n = getState().audit.length;
  approveCredit(order.id, admin);
  assert.equal(getState().audit.length, n + 1);
  assert.equal(getState().audit.at(-1).by.role, 'admin');
});

test('subscribe hears actions and can unsubscribe', () => {
  fresh();
  let heard = 0;
  const off = subscribe(() => { heard += 1; });
  raiseQuery(GUIDED.dealerId, 'One');
  off();
  raiseQuery(GUIDED.dealerId, 'Two');
  assert.equal(heard, 1);
});

test('persists to localStorage and reloads from it', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  try {
    resetDemo();
    raiseQuery(GUIDED.dealerId, 'Saved?');
    const saved = JSON.parse(mem.get('dm.state.v1'));
    assert.equal(saved.queries.at(-1).text, 'Saved?');
    mem.set('dm.state.v1', '{not json');
    const { _reloadForTests } = await import('../js/store.js');
    _reloadForTests();
    assert.ok(getState().dealers.length >= 40, 'a parse failure falls back to a fresh seed');
  } finally {
    delete globalThis.localStorage;
  }
});

test('works without localStorage', () => {
  globalThis.localStorage = undefined;
  try {
    resetDemo();
    const inv = invoiceFor();
    assert.ok(getState().invoices.some((i) => i.id === inv.id));
  } finally {
    delete globalThis.localStorage;
  }
  // A storage that throws (private mode, full) also keeps working in memory.
  globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  try {
    resetDemo();
    raiseQuery(GUIDED.dealerId, 'still works');
    assert.equal(getState().queries.at(-1).text, 'still works');
  } finally {
    delete globalThis.localStorage;
  }
});

test('seed is deterministic', () => {
  assert.equal(JSON.stringify(seed()), JSON.stringify(seed()));
});

test('seed has the scripted guided-day records', () => {
  const s = seed();
  assert.equal(s.dealers.length >= 38 && s.dealers.length <= 42, true);
  assert.equal(s.vehicles.length, 5);
  assert.equal(s.drivers.length, 5);
  assert.equal(s.staff.length, 16);
  const d = s.dealers.find((x) => x.id === 'D-MYD-01');
  assert.equal(d.name, 'Sri Durga Electricals');
  assert.equal(d.town, 'Mydukur');
  assert.equal(s.vehicles.find((v) => v.id === 'V2').plate, 'AP 04 TV 1187');
  assert.equal(s.drivers.find((v) => v.id === 'DR2').name, 'Suresh');
  const total = GUIDED.orderTotal;
  assert.ok(total > 170000 && total < 190000, `guided order ${total}`);
  assert.deepEqual([...new Set(GUIDED.orderLines.map((l) => l.productId.split('-')[0]))].sort(), ['parryware', 'ultravolt']);
  assert.equal(GUIDED.paymentAmount, Math.round(total / 2));
  // No negative stock anywhere, no lot over-consumed.
  assert.ok(s.lots.every((l) => l.left >= 0 && l.left <= l.qty));
});
