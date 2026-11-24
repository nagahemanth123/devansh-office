// Header search: one box that finds a dealer, brand, product or invoice number (owner and staff only).
import { t } from '../i18n.js';
import { getState } from '../store.js';
import { search } from '../selectors.js';
import { esc, invoiceHref } from './common.js';

const OWNER_LINK = {
  dealer: (h) => `#/owner/reports/dealer/${encodeURIComponent(h.id)}`,
  brand: (h) => `#/owner/reports/company/${encodeURIComponent(h.id)}`,
  product: (h) => `#/owner/reports/product/${encodeURIComponent(h.id)}`,
  invoice: (h) => invoiceHref(h.id),
};

let box = null;
let allowed = false;

export function setSearchAllowed(on) {
  allowed = on;
  if (!on && box) { box.hidden = true; box.innerHTML = ''; }
}

// input: the header <input>, form: its <form>. linkFor(hit) -> href.
export function initSearch(input, form, linkFor = (h) => OWNER_LINK[h.kind](h)) {
  box = document.createElement('div');
  box.className = 'search-results';
  box.id = 'search-results';
  box.hidden = true;
  form.append(box);
  input.setAttribute('aria-controls', 'search-results');
  const run = () => {
    if (!allowed) { box.hidden = true; return; }
    const q = input.value.trim();
    if (q.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
    const hits = search(getState(), q, { limit: 12 });
    box.hidden = false;
    box.innerHTML = hits.length
      ? hits.map((h) => `<a class="hit" href="${esc(linkFor(h))}"><span class="hk">${esc(t(`search.kind.${h.kind}`))}</span><span class="hl">${esc(h.label)}</span>${h.sub ? `<span class="hs">${esc(h.sub)}</span>` : ''}</a>`).join('')
      : `<p class="none">${esc(t('search.none'))}</p>`;
  };
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { box.hidden = true; input.blur(); } });
  box.addEventListener('click', (e) => { if (e.target.closest('a')) { box.hidden = true; input.value = ''; } });
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) box.hidden = true; });
  window.addEventListener('hashchange', () => { box.hidden = true; });
}
