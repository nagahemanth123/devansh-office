// EN | తె strings. English is the default; the choice is remembered in localStorage['dm.lang'].
// A missing Telugu key falls back to English and is recorded in window.__missingTe.
import en from './strings/en.js';
import te from './strings/te.js';

const STRINGS = { en, te };
const STORE_KEY = 'dm.lang';
const listeners = new Set();

function readStored() {
  try { return globalThis.localStorage?.getItem(STORE_KEY); } catch { return null; }
}

let lang = readStored() === 'te' ? 'te' : 'en';
applyToDocument();

function applyToDocument() {
  if (globalThis.document) document.documentElement.lang = lang;
}

export function getLang() { return lang; }

export function setLang(next) {
  if (next !== 'en' && next !== 'te') return;
  if (next === lang) return;
  lang = next;
  try { globalThis.localStorage?.setItem(STORE_KEY, lang); } catch { /* private mode or full: keep going in memory */ }
  applyToDocument();
  listeners.forEach((fn) => fn(lang));
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key, vars) {
  let s = STRINGS[lang][key];
  if (s === undefined) {
    if (lang === 'te' && key in en) (globalThis.__missingTe ??= new Set()).add(key);
    s = en[key] ?? key;
  }
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
