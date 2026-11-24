import test from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../js/router.js';

test('landing', () => {
  for (const h of ['#/', '', '#', '/']) assert.equal(route(h).name, 'landing', h);
});

test('owner and report lenses', () => {
  assert.equal(route('#/owner').name, 'owner');
  const r = route('#/owner/reports/brand');
  assert.deepEqual([r.name, r.params.lens], ['owner-report', 'brand']);
});

test('staff, dealer, driver carry their parameter', () => {
  assert.deepEqual(route('#/staff/inbound').params, { page: 'inbound' });
  assert.equal(route('#/staff').name, 'staff');
  assert.deepEqual(route('#/dealer/d07').params, { dealerId: 'd07' });
  assert.deepEqual(route('#/driver/dr2').params, { driverId: 'dr2' });
  assert.equal(route('#/whatsapp/summary').name, 'unknown'); // the WhatsApp segment was removed
});

test('unknown hashes and trailing slashes', () => {
  assert.equal(route('#/nope').name, 'unknown');
  assert.equal(route('#/owner/').name, 'owner');
  assert.equal(route('#/owner/reports').name, 'unknown');
  assert.equal(route('#/dealer').name, 'unknown');
  assert.equal(route('#/dealer/a%20b').params.dealerId, 'a b');
});
