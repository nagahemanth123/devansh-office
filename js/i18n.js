// UI strings. The demo is English only (client decision, 24 Nov): the Telugu files stay in js/strings but nothing loads them.
import en from './strings/en.js';

const listeners = new Set();

export function getLang() { return 'en'; }
export function setLang() { /* English only */ }
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key, vars) {
  const s = en[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

// Fills data-i18n="key" (text) and data-i18n-attr="placeholder:key;aria-label:key" (attributes).
export function translateDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr.trim(), t(key.trim()));
    });
  });
}
