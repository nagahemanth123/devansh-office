import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getState, resetDemo, advancePO, receivePO, createOrder, createTrip, markLoaded, markLeft, markDelivered, recordPayment,
} from '../js/store.js';
import { seed, GUIDED } from '../js/seed.js';
import {
  cycleBar, tiles, attention, comingIn, goingOut, districtWeekly, brandCards, productRows, dealerCards, grid, trail,
  dealerBalance, stock, recordsBehind, dealerView, driverView, invoiceCost,
} from '../js/selectors.js';

const sum = (rows) => rows.reduce((a, r) => a + r.amount, 0);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

const by = {
  godown: { role: 'godown', name: 'Prasad' },
  sales: { role: 'sales', name: 'Kiran' },
  dispatch: { role: 'godown', name: 'Naveen' },
  driver: { role: 'driver', name: 'Suresh' },
  accounts: { role: 'accounts', name: 'Lakshmi' },
};

// The 8 steps of spec §6, through the same actions the guided-day UI uses.
function runGuidedDay() {
  const before = cycleBar(getState());                                             // 1. owner, morning
  advancePO(GUIDED.poId, by.godown);                                               // 2. lorry on the way,
  receivePO(GUIDED.poId, GUIDED.receiveLines, 'lorry.jpg', by.godown);             //    received 10 short
  const afterReceive = cycleBar(getState());
  const { invoice } = createOrder(GUIDED.dealerId, GUIDED.orderLines, by.sales);   // 3. phone order
  const trip = createTrip({ vehicleId: GUIDED.vehicleId, driverId: GUIDED.driverId, invoiceIds: [invoice.id], ewayBill: GUIDED.ewayBill }, by.dispatch); // 4. trip
  markLoaded(trip.id, by.dispatch);
  markLeft(trip.id, by.driver);
  const r = markDelivered(trip.id, invoice.id, { photo: 'drop.jpg', otp: GUIDED.otp }, by.driver); // 5. driver
  const dealer = dealerView(getState(), GUIDED.dealerId);                          // 6. dealer sees it
  recordPayment(GUIDED.dealerId, { mode: 'upi', amount: GUIDED.paymentAmount, allocations: [{ invoiceId: invoice.id, amount: GUIDED.paymentAmount }], ref: 'UPI' }, by.accounts); // 7. half by UPI
  const after = cycleBar(getState());                                              // 8. owner, evening
  return { before, afterReceive, after, invoice: getState().invoices.find((i) => i.id === invoice.id), delivered: r, dealer };
}

test('cycle bar parts add up', () => {
  const s = seed();
  const b = cycleBar(s);
  near(b.godown + b.road + b.unpaid + b.bank, b.total, 1, 'parts');
  assert.ok([b.godown, b.road, b.unpaid, b.bank, b.incoming].every((v) => v >= 0));
});

test('seed lands near the preview', () => {
  const b = cycleBar(seed());
  near(b.total, 13800000, 1380000, 'total');
  near(b.bank, 5210000, 781500, 'bank');
  near(b.unpaid, 4430000, 664500, 'unpaid');
});

test('bar parts trace to records', () => {
  const s = seed();
  const b = cycleBar(s);
  for (const part of ['total', 'godown', 'road', 'unpaid', 'bank', 'incoming']) near(sum(recordsBehind(s, `bar.${part}`)), b[part], 1, part);
});

test('every tile traces to records', () => {
  const s = seed();
  for (const range of ['today', 'week', 'month']) {
    const ts = tiles(s, { range });
    assert.equal(ts.length, 8);
    for (const tile of ts) {
      const rows = recordsBehind(s, `tile.${tile.key}`, { range });
      if (tile.unit === 'count') assert.equal(rows.length, tile.value, `${range} ${tile.key}`);
      else near(sum(rows), tile.value, 1, `${range} ${tile.key}`);
      assert.ok(tile.compare && tile.compare.key, `${tile.key} has a compare`);
    }
  }
});

test('dues by age trace to records and add up to dealers owe', () => {
  const s = seed();
  const owe = tiles(s, { range: 'month' }).find((t) => t.key === 'dealersOwe').value;
  const bands = ['d0_30', 'd31_60', 'd60p'].map((k) => sum(recordsBehind(s, `dues.${k}`)));
  near(bands.reduce((a, b) => a + b, 0), owe, 1, 'bands');
  assert.ok(bands[2] > 0, 'some dues are 60+ days old');
});

test('guided day moves the bar', () => {
  resetDemo();
  const { before, afterReceive, after, invoice, delivered, dealer } = runGuidedDay();
  assert.equal(delivered, 'ok');
  assert.ok(afterReceive.total > before.total, 'receiving adds this month\'s goods');
  const cost = invoiceCost(getState(), invoice);
  assert.ok(cost > 0);
  near(afterReceive.godown - after.godown, cost, 1, 'godown down by the invoice cost');
  assert.ok(after.bank > afterReceive.bank, 'bank moved');
  assert.ok(after.unpaid > afterReceive.unpaid, 'unpaid moved');
  near(after.bank - afterReceive.bank, cost * GUIDED.paymentAmount / invoice.total, 1, 'bank by the paid share');
  near(after.total, afterReceive.total, 1, 'total unchanged by selling');
  assert.equal(dealer.orders[0].step, 'delivered');
});

test('the guided day runs cleanly again after a reset', () => {
  resetDemo();
  const a = runGuidedDay();
  resetDemo();
  const b = runGuidedDay();
  assert.deepEqual(a.after, b.after);
});

test('dealer view data has no rates or other dealers', () => {
  resetDemo();
  runGuidedDay();
  const s = getState();
  const json = JSON.stringify(dealerView(s, 'D-MYD-01'));
  assert.ok(!/purchaseRate|margin|"cost"|lots/i.test(json), 'no purchase rates, margins or costs');
  for (const d of s.dealers) if (d.id !== 'D-MYD-01') {
    assert.ok(!json.includes(d.id), `mentions ${d.id}`);
    assert.ok(!json.includes(`"${d.name}"`), `mentions ${d.name}`);
  }
  const v = dealerView(s, 'D-MYD-01');
  assert.equal(v.dealer.name, 'Sri Durga Electricals');
  assert.ok(v.owes > 0 && v.limit === 600000);
  assert.ok(v.invoices.every((i) => ['paid', 'pending', 'dueSoon', 'overdue'].includes(i.label)));
});

test('dealer sees the OTP once loaded; the driver never does', () => {
  resetDemo();
  const { invoice } = createOrder(GUIDED.dealerId, GUIDED.orderLines, by.sales);
  const trip = createTrip({ vehicleId: 'V2', driverId: 'DR2', invoiceIds: [invoice.id], ewayBill: GUIDED.ewayBill }, by.dispatch);
  assert.equal(dealerView(getState(), GUIDED.dealerId).orders[0].otp, null);
  markLoaded(trip.id, by.dispatch);
  assert.equal(dealerView(getState(), GUIDED.dealerId).orders[0].otp, GUIDED.otp);
  const dv = driverView(getState(), 'DR2');
  const json = JSON.stringify(dv);
  assert.ok(!json.includes(GUIDED.otp) && !/otp|purchaseRate|margin|"cost"/i.test(json));
  assert.ok(dv.drops.some((d) => d.invoiceId === invoice.id && d.dealerName === 'Sri Durga Electricals'));
});

test('attention is sorted by money at risk', () => {
  const list = attention(seed());
  assert.ok(list.length >= 4);
  const money = list.filter((a) => a.amount != null).map((a) => a.amount);
  assert.deepEqual(money, [...money].sort((x, y) => y - x));
  const firstNull = list.findIndex((a) => a.amount == null);
  if (firstNull >= 0) assert.ok(list.slice(firstNull).every((a) => a.amount == null));
  for (const kind of ['credit', 'cheque', 'brand-payment', 'vehicle']) assert.ok(list.some((a) => a.kind === kind), kind);
});

test('trackers, chart and reports read from the records', () => {
  const s = seed();
  const ci = comingIn(s);
  assert.ok(ci.some((p) => p.poId === GUIDED.poId && p.step === 'left'));
  const go = goingOut(s);
  assert.ok(go.length >= 3 && go.some((t) => t.status === 'loaded'));
  const dw = districtWeekly(s);
  assert.equal(dw.weeks.length, 5);
  assert.ok(dw.Kadapa.every((v) => v >= 0) && dw.Anantapur.length === 5);
  const cards = brandCards(s, { range: 'month' });
  assert.equal(cards.length, 10);
  assert.ok(cards.every((c) => ['green', 'amber', 'red'].includes(c.health) && c.rebate && c.rebate.sample === true));
  near(cards.reduce((a, c) => a + c.share, 0), 100, 0.5, 'shares');
  const pr = productRows(s, {});
  assert.ok(pr.rows.length >= 500 && pr.lists.runOut.every((r) => r.reorderQty > 0));
  const dc = dealerCards(s, {});
  assert.equal(dc.length, s.dealers.length);
  assert.ok(dc.every((d) => d.salesperson && d.creditDays > 0 && d.habit));
  assert.ok(dc.some((d) => d.flags.some((f) => f.key === 'flag.noBrand')), 'a dealer stopped buying a brand');
  const g = grid(s, { metric: 'sold' });
  assert.equal(g.rows.length, 20);
  const cell = g.rows.flatMap((r) => g.cols.map((c) => [r.productId, c.dealerId, g.cells[r.productId]?.[c.dealerId] || 0])).find((x) => x[2] > 0);
  const tr = trail(s, cell[0], cell[1]);
  assert.deepEqual(tr.steps.map((x) => x.key), ['ordered', 'invoiced', 'loaded', 'delivered', 'paid']);
  const bal = dealerBalance(s, GUIDED.dealerId);
  assert.equal(bal.owes, 210000);
  assert.equal(bal.limit, 600000);
  near(bal.ageing.d0_30 + bal.ageing.d31_60 + bal.ageing.d60p, bal.owes, 1, 'ageing');
  const st = stock(s, { brand: 'goldmedal' });
  assert.ok(st.length > 0 && st.every((r) => r.brand === 'goldmedal'));
});
