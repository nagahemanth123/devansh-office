import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CATALOG } from '../js/data/catalog.js';

const root = new URL('../', import.meta.url);

test('ten brands, each with a colour and a logo file', () => {
  assert.equal(CATALOG.brands.length, 10);
  for (const b of CATALOG.brands) {
    assert.match(b.colour, /^#[0-9A-F]{6}$/i, b.key);
    assert.ok(b.name && b.key, b.key);
    assert.ok(existsSync(new URL(b.logo, root)), `logo ${b.logo}`);
  }
});

test('500+ products: 485 real, Victura 8, Poddar 12', () => {
  assert.ok(CATALOG.products.length >= 500);
  const by = (k) => CATALOG.products.filter((p) => p.brand === k).length;
  assert.equal(by('victura'), 8);
  assert.equal(by('poddar'), 12);
  assert.equal(CATALOG.products.length - by('victura') - by('poddar'), 485);
});

test('every product has a price, GST and a photo that exists', () => {
  assert.ok(CATALOG.products.every((p) => p.mrp > 0 && p.gstPct > 0 && p.photo));
  assert.ok(CATALOG.products.every((p) => typeof p.mrpSample === 'boolean'));
  for (const p of CATALOG.products) assert.ok(existsSync(new URL(p.photo, root)), p.photo);
});

test('ids are unique and every product belongs to a listed brand', () => {
  assert.ok(new Set(CATALOG.products.map((p) => p.id)).size === CATALOG.products.length);
  const keys = new Set(CATALOG.brands.map((b) => b.key));
  assert.ok(CATALOG.products.every((p) => keys.has(p.brand)));
  for (const k of keys) assert.ok(CATALOG.products.some((p) => p.brand === k), `${k} has products`);
});
