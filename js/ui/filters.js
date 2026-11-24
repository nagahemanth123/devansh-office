// Report filters: district, brand, dealer, salesperson. Remembered in localStorage['dm.filters'] and carried through every drill step.
import { t } from '../i18n.js';
import { getState } from '../store.js';
import { BRAND, DISTRICTS } from '../selectors.js';
import { esc } from './common.js';

const KEY = 'dm.filters';
const EMPTY = { district: '', brand: '', dealer: '', salesperson: '' };
const listeners = new Set();
let memo = null;

export function getFilters() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch { /* fall through */ }
  return { ...EMPTY, ...(memo || {}) };
}
export function setFilters(patch) {
  const next = { ...getFilters(), ...patch };
  memo = next;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(next)); } catch { /* in-memory only */ }
  listeners.forEach((fn) => fn(next));
}
export function onFiltersChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// which = the filters this lens uses
export function filtersHTML(which = ['district', 'brand']) {
  const f = getFilters();
  const s = getState();
  const seg = `<div class="seg" role="radiogroup" aria-label="${esc(t('flt.district'))}">${['', ...DISTRICTS].map((d) => `<button type="button" role="radio" aria-checked="${f.district === d}" data-flt="district" data-val="${d}">${esc(d ? t(`dist.${d}`) : t('flt.all'))}</button>`).join('')}</div>`;
  const sel = (name, options) => `<label class="fsel"><span>${esc(t(`flt.${name}`))}</span><select data-flt-select="${name}"><option value="">${esc(t('flt.all'))}</option>${options.map(([v, l]) => `<option value="${esc(v)}"${f[name] === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const extra = [];
  if (which.includes('brand')) extra.push(sel('brand', [...BRAND.values()].map((b) => [b.key, b.name])));
  if (which.includes('dealer')) extra.push(sel('dealer', s.dealers.map((d) => [d.id, `${d.name}, ${d.town}`]).sort((a, b) => (a[1] < b[1] ? -1 : 1))));
  if (which.includes('salesperson')) extra.push(sel('salesperson', s.staff.filter((x) => x.role === 'sales').map((x) => [x.id, x.name])));
  return `<div class="filters">${seg}${extra.length ? `<div class="fgrid">${extra.join('')}</div>` : ''}</div>`;
}

export function bindFilters(root) {
  const onClick = (e) => { const b = e.target.closest('[data-flt]'); if (b && root.contains(b)) setFilters({ [b.dataset.flt]: b.dataset.val }); };
  const onChange = (e) => { const s = e.target.closest('[data-flt-select]'); if (s && root.contains(s)) setFilters({ [s.dataset.fltSelect]: s.value }); };
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  return () => { root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); };
}
