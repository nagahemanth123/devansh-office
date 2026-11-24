// Stock: search by brand, category or SKU; quantity, value at cost, days of cover, last movement.
// The Godown role sees quantities only; cost columns carry data-field="purchaseRate" and are left out for it.
import { t } from '../i18n.js';
import { getState, subscribe } from '../store.js';
import { stock, BRAND } from '../selectors.js';
import { CATALOG } from '../data/catalog.js';
import { esc, inr, fmtDay } from '../ui/common.js';
import { canSeeCost } from './staff.js';

const FULL = { full: true };
const SHOW = 80;
const filter = { q: '', brand: '', category: '' };
const CATEGORIES = [...new Set(CATALOG.products.map((p) => p.category))].sort();

export function mountStock(host) {
  const cost = canSeeCost();
  host.innerHTML = `<div class="stf-sh"><h1 class="tel">${esc(t('stk.title'))}</h1><span class="stf-hint tel" data-count></span></div>
    <div class="stf-tools three"><div><label class="fm-l tel" for="sk-q">${esc(t('stk.search'))}</label><input id="sk-q" class="fm-in" type="search" autocomplete="off" placeholder="${esc(t('stk.placeholder'))}" data-q value="${esc(filter.q)}"></div>
    <div><label class="fm-l tel" for="sk-b">${esc(t('stk.brand'))}</label><select id="sk-b" class="fm-in" data-brand><option value="">${esc(t('flt.all'))}</option>${[...BRAND.values()].map((b) => `<option value="${esc(b.key)}"${filter.brand === b.key ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
    <div><label class="fm-l tel" for="sk-c">${esc(t('stk.category'))}</label><select id="sk-c" class="fm-in" data-category><option value="">${esc(t('flt.all'))}</option>${CATEGORIES.map((c) => `<option value="${esc(c)}"${filter.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div>
    <div class="tbl-wrap"><table class="fm-table stock" data-stock><thead><tr><th></th><th class="tel">${esc(t('rc.item'))}</th><th class="tel r">${esc(t('stk.qty'))}</th><th class="tel r">${esc(t('stk.damaged'))}</th>${cost ? `<th class="tel r" data-field="purchaseRate">${esc(t('stk.costRate'))}</th><th class="tel r" data-field="purchaseRate">${esc(t('stk.value'))}</th>` : ''}<th class="tel r">${esc(t('stk.cover'))}</th><th class="tel">${esc(t('stk.last'))}</th></tr></thead><tbody data-rows></tbody></table></div><p class="stf-hint tel" data-more></p>`;
  const draw = () => {
    const rows = stock(getState(), { q: filter.q, brand: filter.brand || undefined, category: filter.category || undefined });
    host.querySelector('[data-count]').textContent = t('stk.count', { n: rows.length });
    host.querySelector('[data-rows]').innerHTML = rows.slice(0, SHOW).map((r) => `<tr data-sku="${esc(r.productId)}"><td><img src="${esc(r.photo)}" alt="" width="40" height="40" loading="lazy"></td><td class="tel"><b>${esc(r.name)}</b><br><small>${esc(BRAND.get(r.brand).name)} · ${esc(r.category)}</small></td>
      <td class="num r">${r.qty}</td><td class="num r">${r.damaged || ''}</td>${cost ? `<td class="num r" data-field="purchaseRate">${r.qty ? esc(inr(r.value / r.qty, FULL)) : ''}</td><td class="num r" data-field="purchaseRate">${esc(inr(r.value, FULL))}</td>` : ''}
      <td class="num r">${r.daysCover == null ? '–' : esc(t('stk.days', { n: r.daysCover }))}</td><td class="tel">${r.lastMove ? esc(fmtDay(r.lastMove)) : '–'}</td></tr>`).join('') || `<tr><td colspan="8" class="stf-empty tel">${esc(t('stk.none'))}</td></tr>`;
    host.querySelector('[data-more]').textContent = rows.length > SHOW ? t('stk.more', { n: SHOW }) : '';
  };
  host.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { filter.q = e.target.value; draw(); } });
  host.addEventListener('change', (e) => {
    if (e.target.matches('[data-brand]')) filter.brand = e.target.value;
    if (e.target.matches('[data-category]')) filter.category = e.target.value;
    draw();
  });
  draw();
  return subscribe(draw);
}
