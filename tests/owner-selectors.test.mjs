import test from 'node:test';
import assert from 'node:assert/strict';
import { seed } from '../js/store.js';
import { invoiceDoc, brandPaymentsWeek, topDealerDues, productDealers, dealerBrands, dealerBrandProducts, grid } from '../js/selectors.js';

const s = seed();

test('invoice document: CGST + SGST + round-off add up to the recorded total, for every invoice', () => {
  for (const inv of s.invoices) {
    const d = invoiceDoc(s, inv.id);
    assert.ok(Math.abs(d.taxable + d.cgst + d.sgst + d.roundOff - d.total) < 0.011, inv.id);
    assert.equal(d.total, inv.total);
    for (const l of d.lines) assert.ok(Math.abs(l.cgst + l.sgst - (l.total - l.taxable)) < 0.011);
  }
  assert.equal(invoiceDoc(s, 'nope'), null);
});

test('brand payments week and top dues are ordered', () => {
  const pays = brandPaymentsWeek(s);
  assert.ok(pays.length > 0);
  for (let k = 1; k < pays.length; k++) assert.ok(pays[k - 1].due <= pays[k].due);
  const dues = topDealerDues(s);
  assert.equal(dues.length, 5);
  for (let k = 1; k < dues.length; k++) assert.ok(dues[k - 1].owes >= dues[k].owes);
});

test('drill helpers agree with each other', () => {
  const g = grid(s, {});
  const pid = g.rows[0].productId;
  const dealers = productDealers(s, pid, {});
  assert.ok(dealers.length > 0);
  const did = dealers[0].dealerId;
  const brand = g.rows[0].brand;
  assert.ok(dealerBrands(s, did, {}).some((b) => b.brand === brand));
  assert.ok(dealerBrandProducts(s, did, brand, {}).some((p) => p.productId === pid));
  assert.equal(grid(s, {}).rows.length, 20);
});
