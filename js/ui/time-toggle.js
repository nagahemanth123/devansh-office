// Time toggle: Today | This week | This month | Custom. It sits in the same place on every owner screen.
// TimeRange = 'today' | 'week' | 'month' | {from, to}, remembered in localStorage['dm.range'].
import { t } from '../i18n.js';
import { getState } from '../store.js';
import { esc } from './common.js';

const KEY = 'dm.range';
const listeners = new Set();
let memo = null; // used when storage is blocked

function read() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      if (raw === 'today' || raw === 'week' || raw === 'month') return raw;
      const o = JSON.parse(raw);
      if (o && /^\d{4}-\d{2}-\d{2}$/.test(o.from) && /^\d{4}-\d{2}-\d{2}$/.test(o.to) && o.from <= o.to) return o;
    }
  } catch { /* fall through */ }
  return memo || 'month';
}

export function getRange() { return read(); }
export function setRange(r) {
  memo = r;
  try { globalThis.localStorage?.setItem(KEY, typeof r === 'string' ? r : JSON.stringify(r)); } catch { /* in-memory only */ }
  listeners.forEach((fn) => fn(r));
}
export function onRangeChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export const rangeKind = (r) => (typeof r === 'string' ? r : 'custom');

export function timeToggleHTML() {
  const r = getRange();
  const kind = rangeKind(r);
  const today = getState().today;
  const b = (k) => `<button type="button" role="radio" aria-checked="${kind === k}" data-range="${k}">${esc(t(`range.${k}`))}</button>`;
  const custom = kind === 'custom'
    ? `<div class="tt-custom"><label>${esc(t('range.from'))}<input type="date" data-range-from value="${esc(r.from)}" max="${today}"></label><label>${esc(t('range.to'))}<input type="date" data-range-to value="${esc(r.to)}" max="${today}"></label></div>`
    : '';
  return `<div class="tt" role="radiogroup" aria-label="${esc(t('range.label'))}">${['today', 'week', 'month', 'custom'].map(b).join('')}</div>${custom}`;
}

// Delegated, so it survives re-renders of the host.
export function bindTimeToggle(root) {
  const onClick = (e) => {
    const btn = e.target.closest('[data-range]');
    if (!btn || !root.contains(btn)) return;
    const k = btn.dataset.range;
    if (k === 'custom') { if (rangeKind(getRange()) !== 'custom') { const today = getState().today; setRange({ from: `${today.slice(0, 8)}01`, to: today }); } return; }
    setRange(k);
  };
  const onChange = (e) => {
    const inp = e.target.closest('[data-range-from],[data-range-to]');
    if (!inp) return;
    const r = getRange();
    if (typeof r === 'string') return;
    const next = { ...r, [inp.hasAttribute('data-range-from') ? 'from' : 'to']: inp.value };
    if (next.from && next.to && next.from <= next.to) setRange(next);
  };
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  return () => { root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); };
}
