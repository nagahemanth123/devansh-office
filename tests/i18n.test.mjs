import test from 'node:test';
import assert from 'node:assert/strict';
import { t, getLang, setLang, onLangChange } from '../js/i18n.js';
import en from '../js/strings/en.js';
import te from '../js/strings/te.js';

test('every English key has a Telugu string, and no Telugu key is orphaned', () => {
  assert.deepEqual(Object.keys(en).filter((k) => !(k in te)), []);
  assert.deepEqual(Object.keys(te).filter((k) => !(k in en)), []);
});

test('English is the default and t() interpolates', () => {
  assert.equal(getLang(), 'en');
  assert.equal(t('footer.sample'), 'Sample data · Busy Fox demo');
  assert.equal(t('landing.title'), en['landing.title']);
});

test('setLang switches, notifies, and ignores unknown languages', () => {
  const seen = [];
  const off = onLangChange((l) => seen.push(l));
  setLang('te');
  assert.equal(getLang(), 'te');
  assert.equal(t('footer.sample'), te['footer.sample']);
  setLang('fr');
  assert.equal(getLang(), 'te');
  setLang('en');
  off();
  setLang('te');
  setLang('en');
  assert.deepEqual(seen, ['te', 'en']);
});

test('a missing key falls back to English, then to the key; missing TE keys are logged', () => {
  Object.assign(en, { 'test.only.en': 'English only', 'test.greeting': 'Hello {name}' }); // fixtures
  setLang('te');
  globalThis.__missingTe = undefined;
  assert.equal(t('test.only.en'), 'English only');
  assert.ok(globalThis.__missingTe.has('test.only.en'));
  assert.equal(t('no.such.key'), 'no.such.key');
  setLang('en');
});

test('variables fill {name} placeholders', () => {
  en['test.greeting'] = 'Hello {name}';
  assert.equal(t('test.greeting', { name: 'Ravi' }), 'Hello Ravi');
});

