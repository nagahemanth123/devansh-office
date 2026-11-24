// Catalogue picker: type to search, each result shows the photo, MRP and the dealer rate.
// In 'purchase' mode the purchase rate shows too, unless showCost is false (the Godown role never sees it).
import { t } from '../i18n.js';
import { getState } from '../store.js';
import { PRODUCT, BRAND } from '../selectors.js';
import { dealerRate, purchaseRate } from '../seed.js';
import { esc, inr } from './common.js';

const HAY = new Map();
const hay = (p) => { let h = HAY.get(p.id); if (!h) { h = `${p.name} ${BRAND.get(p.brand).name} ${p.category} ${p.size || ''}`.toLowerCase(); HAY.set(p.id, h); } return h; };

export function stockMap(state = getState()) {
  const m = new Map();
  for (const l of state.lots) if (l.left) m.set(l.productId, (m.get(l.productId) || 0) + l.left);
  return m;
}

// host: an element; opts: {mode:'dealer'|'purchase', brand, showCost, onPick(product)}. Returns {focus}.
export function mountPicker(host, { mode = 'dealer', brand = null, showCost = true, onPick }) {
  host.innerHTML = `<label class="fm-l tel" for="pk-q">${esc(t('pk.search'))}</label>
    <input id="pk-q" class="fm-in" type="search" autocomplete="off" placeholder="${esc(t('pk.placeholder'))}" data-pk-input>
    <ul class="pk-list" data-pk-list aria-live="polite"></ul>`;
  const input = host.querySelector('[data-pk-input]');
  const list = host.querySelector('[data-pk-list]');
  const stock = mode === 'dealer' ? stockMap() : null;
  const pool = [...PRODUCT.values()].filter((p) => !brand || p.brand === brand);
  const draw = () => {
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hits = (words.length ? pool.filter((p) => words.every((w) => hay(p).includes(w))) : pool).slice(0, 8);
    if (!hits.length) { list.innerHTML = `<li class="pk-none tel">${esc(t('pk.none'))}</li>`; return; }
    list.innerHTML = hits.map((p) => {
      const left = stock ? stock.get(p.id) || 0 : null;
      const out = stock && left === 0;
      return `<li class="pk-row">
        <img src="${esc(p.photo)}" alt="" width="44" height="44" loading="lazy">
        <div class="pk-main"><b class="tel">${esc(p.name)}</b>
          <span class="pk-sub tel">${esc(BRAND.get(p.brand).name)}${p.size ? ` · ${esc(p.size)}` : ''} · ${esc(t('pk.mrp'))} <span class="num">${esc(inr(p.mrp, { full: true }))}</span>${p.mrpSample ? ` (${esc(t('pk.sample'))})` : ''}</span>
          <span class="pk-sub tel">${esc(t('pk.dealerRate'))} <b class="num">${esc(inr(dealerRate(p.id), { full: true }))}</b>${mode === 'purchase' && showCost ? ` · <span data-field="purchaseRate">${esc(t('pk.purchaseRate'))} <b class="num">${esc(inr(purchaseRate(p.id), { full: true }))}</b></span>` : ''}${stock ? ` · ${esc(out ? t('pk.out') : t('pk.inStock', { n: left }))}` : ''}</span></div>
        <button type="button" class="fm-btn small" data-pk-add="${esc(p.id)}"${out ? ' disabled' : ''}>${esc(t('pk.add'))}</button></li>`;
    }).join('');
  };
  input.addEventListener('input', draw);
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pk-add]');
    if (b && !b.disabled) onPick(PRODUCT.get(b.dataset.pkAdd));
  });
  draw();
  return { focus: () => input.focus() };
}
