import test from 'node:test';
import assert from 'node:assert/strict';
import { formatINR } from '../js/money.js';

// Ruling 1: a no-break space (U+00A0) sits between the figure and L / Cr.
test('short form: crore with two decimals', () => {
  assert.equal(formatINR(13800000), '₹1.38 Cr');
  assert.equal(formatINR(10000000), '₹1.00 Cr');
});

test('short form: lakh with one decimal', () => {
  assert.equal(formatINR(4430000), '₹44.3 L');
  assert.equal(formatINR(3300000), '₹33.0 L');
  assert.equal(formatINR(100000), '₹1.0 L');
});

test('below one lakh: rupees with Indian grouping', () => {
  assert.equal(formatINR(86000), '₹86,000');
  assert.equal(formatINR(99999), '₹99,999');
  assert.equal(formatINR(950), '₹950');
  assert.equal(formatINR(0), '₹0');
});

test('full form uses lakh-crore grouping', () => {
  assert.equal(formatINR(13800000, { full: true }), '₹1,38,00,000');
  assert.equal(formatINR(4430000, { full: true }), '₹44,30,000');
  assert.equal(formatINR(86000, { full: true }), '₹86,000');
});

test('negative amounts use a true minus before the rupee sign', () => {
  assert.equal(formatINR(-14600), '−₹14,600');
  assert.equal(formatINR(-13800000), '−₹1.38 Cr');
  assert.equal(formatINR(-14600, { full: true }), '−₹14,600');
});

test('rounding never produces 100.0 L or an M or K figure', () => {
  assert.equal(formatINR(9999999), '₹1.00 Cr');
  assert.equal(formatINR(99999.6), '₹1.0 L');
  for (const n of [1, 999, 12345, 987654, 5432100, 123456789, 5e9]) assert.doesNotMatch(formatINR(n), /[MK]/);
});

test('fractional rupees are rounded, bad input is rejected', () => {
  assert.equal(formatINR(1234.56), '₹1,235');
  assert.throws(() => formatINR(NaN), TypeError);
  assert.throws(() => formatINR('12'), TypeError);
});
