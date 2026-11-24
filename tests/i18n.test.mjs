import test from 'node:test';
import assert from 'node:assert/strict';
import { t, getLang, setLang } from '../js/i18n.js';
import en from '../js/strings/en.js';

test('English is the only language and t() interpolates', () => {
  assert.equal(getLang(), 'en');
  setLang('te');
  assert.equal(getLang(), 'en');
  assert.equal(t('footer.sample'), 'Sample data · Busy Fox demo');
  assert.equal(t('landing.title'), en['landing.title']);
});

test('a missing key falls back to the key; variables fill placeholders', () => {
  en['test.greeting'] = 'Hello {name}';
  assert.equal(t('test.greeting', { name: 'Ravi' }), 'Hello Ravi');
  assert.equal(t('no.such.key'), 'no.such.key');
});
