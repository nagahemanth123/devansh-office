// Owner reports: three lenses (Company | Product | Dealer) on one page skeleton, the product x dealer grid,
// the drill path with a breadcrumb, and the trail card.
import { t } from '../i18n.js';
import { getState, subscribe } from '../store.js';
import {
  brandCards, productRows, dealerCards, grid, trail, productDealers, dealerBrands, dealerBrandProducts, dealerProductInvoices, invoiceDoc,
  BRAND, PRODUCT,
} from '../selectors.js';
import { esc, ST, inr, chip, logo, say, fmtDay, fmtTime, ownerNavHTML } from '../ui/common.js';
import { getRange, onRangeChange, timeToggleHTML, bindTimeToggle } from '../ui/time-toggle.js';
import { getFilters, onFiltersChange, filtersHTML, bindFilters } from '../ui/filters.js';
import { breadcrumbHTML } from '../ui/breadcrumb.js';
import { openSheet, openRecords } from '../ui/sheet.js';
import { invoiceHTML } from './invoice.js';

const LENSES = ['company', 'product', 'dealer'];
const H = (...p) => `#/owner/reports/${p.map(encodeURIComponent).join('/')}`;
const FILTERS = { company: ['district', 'brand'], product: ['district', 'brand'], dealer: ['district', 'brand', 'dealer', 'salesperson'], grid: [] };
const FLAG_WORD = { fast: ['green', 'pf.fast'], slow: ['amber', 'pf.slow'], dead: ['red', 'pf.dead'], runOut: ['amber', 'pf.runOut'] };

// Search and toggles that live inside the page (kept across re-renders).
const ui = { productQ: '', quick: 'all', gridQ: '', metric: 'sold' };

const num = (v) => esc(inr(v));
const pctText = (v) => (v == null ? '—' : `${v}%`);
const daysText = (v) => (v == null ? '—' : t('rep.nDays', { n: v }));
const thumb = (p) => `<img class="thumb" src="${esc(p.photo)}" alt="" loading="lazy" width="44" height="44">`;
const lrow = (href, { lead = '', title, sub = '', amount = '', side = '' }) => `<a class="lrow" href="${esc(href)}">${lead}<span class="lt"><span class="ln">${esc(title)}</span><span class="ls tel">${sub}</span></span><span class="la">${amount ? `<b class="num">${amount}</b>` : ''}${side}</span><span class="cv">▸</span></a>`;
const note = (key, vars) => `<p class="rep-note tel">${esc(t(key, vars))}</p>`;
const sectionHead = (title, side = '') => `<div class="sh"><h2 class="tel">${esc(title)}</h2>${side ? `<span class="side tel">${esc(side)}</span>` : ''}</div>`;

// ---------- company lens ----------
function brandCardHTML(c) {
  const why = c.healthReasons.slice(0, 2).map((r) => esc(say(r.key, r.vars))).join(' · ');
  const item = (k, v) => `<div><dt class="tel">${esc(t(`bc.${k}`))}</dt><dd class="num">${v}</dd></div>`;
  return `<article class="bcard rcard" data-brand-card="${c.key}">
    <div class="band" style="background:${c.colour}"></div>
    <div class="rc-in">
      <div class="rc-top"><a href="${H('company', c.key)}" class="rc-logo" aria-label="${esc(c.name)}">${logo(c.key, c.name)}</a>${chip(c.health, t(`health.${c.health}`))}</div>
      ${why ? `<p class="why tel">${why}</p>` : ''}
      <dl class="rc-grid">
        ${item('bought', num(c.bought))}${item('sold', num(c.sold))}${item('share', pctText(c.share))}${item('margin', pctText(c.marginPct))}
        ${item('deliveredOk', pctText(c.deliveredOkPct))}${item('shortDamaged', num(c.shortDamaged))}
        ${item('openClaims', `${c.openClaims.count} · ${num(c.openClaims.amount)}`)}${item('stockValue', num(c.stockValue))}
        ${item('daysCover', daysText(c.daysCover))}${item('slowStock', num(c.slowStock))}
        ${item('dealerDues', num(c.dealerDues))}${item('dues60', num(c.dealerDues60))}
        ${item('payable', num(c.payable))}${item('nextDue', c.nextDue ? `${num(c.nextDue.amount)}<small class="tel"> ${esc(fmtDay(c.nextDue.date))}</small>` : '—')}
      </dl>
      <p class="rebate tel">${esc(t('bc.rebate'))}: ${esc(c.rebate.scheme)}, ${c.rebate.pct}% · <b class="num">${num(c.rebate.earned)}</b> <i>(${esc(t('bc.sample'))})</i></p>
      <a class="open tel" href="${H('company', c.key)}">${esc(t('bc.open'))} ›</a>
    </div></article>`;
}

function companyList(s, f, range) {
  let cards = brandCards(s, { range, district: f.district || undefined });
  if (f.brand) cards = cards.filter((c) => c.key === f.brand);
  return `<div class="list" data-brand-list>${cards.map(brandCardHTML).join('')}</div>`;
}

// ---------- shared pieces ----------
function trailHTML(s, pid, did) {
  const tr = trail(s, pid, did);
  const nextIdx = tr.steps.findIndex((x) => !x.done);
  return `<ol class="trail" aria-label="${esc(t('trail.title'))}">${tr.steps.map((st, i) => {
    const colour = st.done ? 'green' : i === nextIdx ? 'amber' : 'neutral';
    const when = st.at ? `${fmtDay(st.at)}, ${fmtTime(st.at)}` : t(i === nextIdx ? 'trail.waiting' : 'trail.notYet');
    const extra = st.key === 'paid' && !st.done && tr.invoiceId ? ` · ${t('trail.balance', { amount: inr(st.balance) })}` : '';
    return `<li class="${st.done ? 'done' : ''}"><span class="dot" style="background:${ST[colour]}"></span><span class="tn tel">${esc(t(`trail.${st.key}`))}</span><span class="tw tel">${esc(when + extra)}</span></li>`;
  }).join('')}</ol>`;
}

function invoiceRows(items, mk) {
  if (!items.length) return note('rep.noInvoices');
  return `<div class="list tight">${items.map((h) => lrow(mk(h), {
    title: h.invoiceId, sub: `${esc(fmtDay(h.date))} · ${esc(t('rep.qty', { n: h.qty }))}`, amount: num(h.amount),
    side: h.balance > 0 ? chip('amber', t('rep.balance', { amount: inr(h.balance) })) : chip('green', t('inv.paid')),
  })).join('')}</div>`;
}

function productRowHTML(r, href) {
  const fl = FLAG_WORD[r.flag];
  const bits = [t('rep.sold', { amount: inr(r.soldValue) }), t('rep.stockQty', { n: r.stockQty }), r.daysCover != null ? t('rep.cover', { n: r.daysCover }) : ''].filter(Boolean).map(esc).join(' · ');
  const reorder = r.flag === 'runOut' ? ` · <b>${esc(t('rep.reorder', { n: r.reorderQty }))}</b>` : '';
  return lrow(href, { lead: thumb(r), title: r.name, sub: bits + reorder, side: fl ? chip(fl[0], t(fl[1])) : '' });
}

function productHead(s, pid, range, district) {
  const p = PRODUCT.get(pid);
  const r = productRows(s, { brand: p.brand, q: p.name, district: district || undefined, range }).rows.find((x) => x.productId === pid);
  const stat = (k, v) => `<div><dt class="tel">${esc(t(k))}</dt><dd class="num">${v}</dd></div>`;
  return `<div class="card headcard"><div class="hc-top">${thumb(p)}<div><h2 class="hc-n">${esc(p.name)}</h2><p class="tel">${esc(BRAND.get(p.brand).name)}</p></div></div>
    <dl class="rc-grid">${stat('ph.sold', num(r.soldValue))}${stat('ph.stock', esc(t('rep.stockQty', { n: r.stockQty })))}${stat('ph.cover', daysText(r.daysCover))}${stat('ph.reorder', r.reorderQty ? esc(t('rep.pcs', { n: r.reorderQty })) : '—')}</dl></div>`;
}

function dealerHead(s, did) {
  const c = dealerCards(s, {}).find((x) => x.dealerId === did);
  return `<div class="card headcard"><div class="hc-top"><div><h2 class="hc-n">${esc(c.name)}</h2><p class="tel">${esc(c.town)} · ${esc(c.salesperson)}</p></div>${chip(c.status, t(`health.${c.status}`))}</div>
    <dl class="rc-grid"><div><dt class="tel">${esc(t('dc.owes'))}</dt><dd class="num">${num(c.owes)}</dd></div><div><dt class="tel">${esc(t('dc.limit'))}</dt><dd class="num">${num(c.limit)}</dd></div></dl>
    <button type="button" class="more slim" data-dealer-bills="${esc(did)}" data-name="${esc(c.name)}"><span class="tel">${esc(t('dc.openBills'))}</span></button></div>`;
}

// ---------- drill pages ----------
function drillCompany(s, rest, f, range) {
  const [brand, pid, did, inv] = rest;
  const b = BRAND.get(brand);
  if (!b) return { crumbs: [], body: note('rep.notFound') };
  const district = f.district || undefined;
  const crumbs = [{ label: b.name, href: H('company', brand) }];
  const brandHead = () => { const c = brandCards(s, { range, district }).find((x) => x.key === brand); return `<div class="card headcard"><div class="hc-top">${logo(brand, b.name)}${chip(c.health, t(`health.${c.health}`))}</div><dl class="rc-grid"><div><dt class="tel">${esc(t('bc.sold'))}</dt><dd class="num">${num(c.sold)}</dd></div><div><dt class="tel">${esc(t('bc.share'))}</dt><dd class="num">${pctText(c.share)}</dd></div></dl></div>`; };
  if (!pid) {
    const rows = productRows(s, { brand, district, range }).rows.filter((r) => r.soldValue > 0 || r.stockQty > 0).slice(0, 60);
    return { crumbs, body: `${brandHead()}${sectionHead(t('rep.products'))}<div class="list tight">${rows.map((r) => productRowHTML(r, H('company', brand, r.productId))).join('')}</div>` };
  }
  crumbs.push({ label: PRODUCT.get(pid).name, href: H('company', brand, pid) });
  if (!did) {
    const ds = productDealers(s, pid, { district, range });
    return { crumbs, body: `${productHead(s, pid, range, district)}${sectionHead(t('rep.dealers'))}${ds.length ? `<div class="list tight">${ds.map((d) => lrow(H('company', brand, pid, d.dealerId), { title: d.name, sub: `${esc(d.town)} · ${esc(t('rep.qty', { n: d.qty }))}`, amount: num(d.value) })).join('')}</div>` : note('rep.noDealers')}` };
  }
  const d = s.dealers.find((x) => x.id === did);
  crumbs.push({ label: d.name, href: H('company', brand, pid, did) });
  if (!inv) return { crumbs, body: `${trailBlock(s, pid, did)}${sectionHead(t('rep.invoices'))}${invoiceRows(dealerProductInvoices(s, did, pid, { range }), (h) => H('company', brand, pid, did, h.invoiceId))}` };
  crumbs.push({ label: inv });
  return { crumbs, body: invoiceHTML(invoiceDoc(s, inv)) };
}

function trailBlock(s, pid, did) {
  return `<div class="card headcard"><h3 class="tel">${esc(t('trail.title'))}</h3>${trailHTML(s, pid, did)}</div>`;
}

function drillProduct(s, rest, f, range) {
  const [pid, did, inv] = rest;
  const p = PRODUCT.get(pid);
  if (!p) return { crumbs: [], body: note('rep.notFound') };
  const district = f.district || undefined;
  const crumbs = [{ label: p.name, href: H('product', pid) }];
  if (!did) {
    const ds = productDealers(s, pid, { district, range });
    return { crumbs, body: `${productHead(s, pid, range, district)}${sectionHead(t('rep.dealers'))}${ds.length ? `<div class="list tight">${ds.map((d) => lrow(H('product', pid, d.dealerId), { title: d.name, sub: `${esc(d.town)} · ${esc(t('rep.qty', { n: d.qty }))}`, amount: num(d.value) })).join('')}</div>` : note('rep.noDealers')}` };
  }
  const d = s.dealers.find((x) => x.id === did);
  crumbs.push({ label: d.name, href: H('product', pid, did) });
  if (!inv) return { crumbs, body: `${trailBlock(s, pid, did)}${sectionHead(t('rep.invoices'))}${invoiceRows(dealerProductInvoices(s, did, pid, { range }), (h) => H('product', pid, did, h.invoiceId))}` };
  crumbs.push({ label: inv });
  return { crumbs, body: invoiceHTML(invoiceDoc(s, inv)) };
}

function drillDealer(s, rest, f, range) {
  const [did, brand, pid, inv] = rest;
  const d = s.dealers.find((x) => x.id === did);
  if (!d) return { crumbs: [], body: note('rep.notFound') };
  const crumbs = [{ label: d.name, href: H('dealer', did) }];
  if (!brand) {
    const bs = dealerBrands(s, did, { range });
    return { crumbs, body: `${dealerHead(s, did)}${sectionHead(t('rep.brands'))}${bs.length ? `<div class="list tight">${bs.map((b) => lrow(H('dealer', did, b.brand), { lead: logo(b.brand, b.name), title: b.name, amount: num(b.value) })).join('')}</div>` : note('rep.noInvoices')}` };
  }
  crumbs.push({ label: BRAND.get(brand).name, href: H('dealer', did, brand) });
  if (!pid) {
    const ps = dealerBrandProducts(s, did, brand, { range });
    return { crumbs, body: `${sectionHead(t('rep.products'))}<div class="list tight">${ps.map((p) => lrow(H('dealer', did, brand, p.productId), { lead: thumb(p), title: p.name, sub: esc(t('rep.qty', { n: p.qty })), amount: num(p.value) })).join('')}</div>` };
  }
  crumbs.push({ label: PRODUCT.get(pid).name, href: H('dealer', did, brand, pid) });
  if (!inv) return { crumbs, body: `${trailBlock(s, pid, did)}${sectionHead(t('rep.invoices'))}${invoiceRows(dealerProductInvoices(s, did, pid, { range }), (h) => H('dealer', did, brand, pid, h.invoiceId))}` };
  crumbs.push({ label: inv });
  return { crumbs, body: invoiceHTML(invoiceDoc(s, inv)) };
}

// ---------- product lens list ----------
function productList(s, f, range) {
  const { rows, lists } = productRows(s, { brand: f.brand || undefined, q: ui.productQ, district: f.district || undefined, range });
  const tabs = [['all', rows.length], ['fast', lists.fast.length], ['slow', lists.slow.length], ['dead', lists.dead.length], ['runOut', lists.runOut.length]];
  const shown = ui.quick === 'all' ? rows.filter((r) => r.soldValue > 0 || r.stockQty > 0 || ui.productQ) : lists[ui.quick];
  return `<div class="search-row"><input type="search" data-pq value="${esc(ui.productQ)}" placeholder="${esc(t('pl.search'))}" aria-label="${esc(t('pl.search'))}"></div>
    <div class="seg wrap" role="radiogroup" aria-label="${esc(t('pl.quick'))}">${tabs.map(([k, n]) => `<button type="button" role="radio" aria-checked="${ui.quick === k}" data-quick="${k}">${esc(t(`pl.${k}`))} <span class="num">${n}</span></button>`).join('')}</div>
    ${ui.quick === 'runOut' ? note('pl.runOutNote') : ''}
    <div class="list tight" data-product-list>${shown.slice(0, 60).map((r) => productRowHTML(r, H('product', r.productId))).join('') || note('rep.noProducts')}</div>
    ${shown.length > 60 ? note('pl.more', { n: shown.length - 60 }) : ''}`;
}

// ---------- dealer lens list ----------
function sparkline(values) {
  const max = Math.max(...values, 1);
  const w = 7; const gap = 3; const h = 28;
  return `<svg class="spark" width="${values.length * (w + gap)}" height="${h}" viewBox="0 0 ${values.length * (w + gap)} ${h}" aria-hidden="true">${values.map((v, i) => `<rect x="${i * (w + gap)}" y="${h - Math.max(2, (v / max) * h)}" width="${w}" height="${Math.max(2, (v / max) * h)}" rx="1.5" fill="${i === values.length - 1 ? '#0F52BA' : '#9DB9E6'}"/>`).join('')}</svg>`;
}

function dealerCardHTML(c) {
  const item = (k, v) => `<div><dt class="tel">${esc(t(`dc.${k}`))}</dt><dd class="num">${v}</dd></div>`;
  const bar = c.usedPct > 100 ? 'red' : c.usedPct > 80 ? 'amber' : 'green';
  const dueBar = ['d0_30', 'd31_60', 'd60p'].map((k, i) => `<i style="flex:${Math.max(c.ageing[k], 0.0001)} 1 0;background:${ST[['green', 'amber', 'red'][i]]}"></i>`).join('');
  return `<article class="bcard rcard dcard" data-dealer-card="${esc(c.dealerId)}">
    <div class="rc-in">
      <div class="rc-top"><a href="${H('dealer', c.dealerId)}" class="dn-link"><b>${esc(c.name)}</b><span class="tel">${esc(c.town)} · ${esc(c.salesperson)}</span></a>${chip(c.status, t(`health.${c.status}`))}</div>
      ${c.flags.length ? `<ul class="flags">${c.flags.map((x) => `<li class="tel"><span class="fd" style="background:${ST[x.status]}"></span>${esc(say(x.key, x.vars))}</li>`).join('')}</ul>` : ''}
      <div class="limitbar"><div class="lb"><i style="width:${Math.min(c.usedPct, 100)}%;background:${ST[bar]}"></i></div><span class="tel">${esc(t('dc.used', { pct: c.usedPct, limit: inr(c.limit) }))}</span></div>
      <dl class="rc-grid">
        ${item('owes', num(c.owes))}${item('avgPay', c.avgDaysToPay != null ? esc(t('rep.nDays', { n: c.avgDaysToPay })) : '—')}
        ${item('lastOrder', c.lastOrder ? esc(fmtDay(c.lastOrder)) : '—')}${item('pending', String(c.pendingDeliveries))}
      </dl>
      ${c.owes > 0 ? `<div class="age"><div class="agebar">${dueBar}</div><span class="tel">${esc(t('dc.age'))}</span></div>` : ''}
      <div class="mix"><span class="tel">${esc(t('dc.trend'))}</span>${sparkline(c.salesTrend.values)}</div>
      <div class="mixlogos">${c.brandMix.slice(0, 4).map((b) => logo(b.brand, BRAND.get(b.brand).name)).join('')}</div>
      <a class="open tel" href="${H('dealer', c.dealerId)}">${esc(t('dc.open'))} ›</a>
    </div></article>`;
}

function dealerList(s, f) {
  let cards = dealerCards(s, { district: f.district || undefined, salespersonId: f.salesperson || undefined });
  if (f.dealer) cards = cards.filter((c) => c.dealerId === f.dealer);
  if (f.brand) { const ids = new Set(s.dealers.filter((d) => d.brandMix.includes(f.brand)).map((d) => d.id)); cards = cards.filter((c) => ids.has(c.dealerId)); }
  cards.sort((a, b) => b.owes - a.owes);
  return `<div class="list" data-dealer-list>${cards.map(dealerCardHTML).join('') || note('rep.noDealers')}</div>`;
}

// ---------- grid ----------
const compact = (v) => inr(v).slice(1);
function gridHTML(s, f) {
  const g = grid(s, { metric: ui.metric, q: ui.gridQ, district: f.district || undefined });
  const rows = g.rows;
  const cell = (r, c) => {
    const v = g.cells[r.productId][c.dealerId];
    if (!v) return '<td><span class="cell nil" aria-label="0">·</span></td>';
    const a = (0.12 + 0.78 * (v / g.max)).toFixed(2);
    return `<td><button type="button" class="cell" data-cell data-p="${esc(r.productId)}" data-d="${esc(c.dealerId)}" data-v="${v}" style="background:rgba(15,82,186,${a});color:${a > 0.5 ? '#fff' : 'var(--ink)'}" aria-label="${esc(`${r.name}, ${c.name}: ${inr(v)}`)}">${esc(compact(v))}</button></td>`;
  };
  return `<div class="grid-ctl"><div class="seg" role="radiogroup" aria-label="${esc(t('grid.metric'))}">${['sold', 'outstanding'].map((m) => `<button type="button" role="radio" aria-checked="${ui.metric === m}" data-metric="${m}">${esc(t(`grid.${m}`))}</button>`).join('')}</div>
    <div class="search-row"><input type="search" data-gq value="${esc(ui.gridQ)}" placeholder="${esc(t('grid.search'))}" aria-label="${esc(t('grid.search'))}"></div></div>
    ${rows.length ? `<div class="gridwrap" tabindex="0" role="region" aria-label="${esc(t('grid.title'))}"><table class="gridt" data-grid><thead><tr><th scope="col" class="pcol"><span class="tel">${esc(t('grid.corner'))}</span></th>${g.cols.map((c) => `<th scope="col"><span class="gh">${esc(c.name)}</span><span class="gt">${esc(c.town)}</span></th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr><th scope="row" class="pcol"><span class="pn"><i style="background:${BRAND.get(r.brand).colour}"></i>${esc(r.name)}</span></th>${g.cols.map((c) => cell(r, c)).join('')}</tr>`).join('')}</tbody></table></div>
    ${note('grid.foot', { rows: rows.length, cols: g.cols.length })}` : note('grid.none')}`;
}

function openTrail(s, pid, did, v, from) {
  const p = PRODUCT.get(pid); const d = s.dealers.find((x) => x.id === did);
  const tr = trail(s, pid, did);
  const hist = tr.history.slice(0, 6).map((h) => `<a class="inv link" data-amount="0" href="#/owner/invoice/${encodeURIComponent(h.invoiceId)}"><div><div class="dn">${esc(h.invoiceId)}</div><div class="no">${esc(fmtDay(h.date))} · ${esc(t('rep.qty', { n: h.qty }))}</div></div><div class="amt num">${esc(inr(h.amount))}</div></a>`).join('');
  openSheet({
    title: `${p.name} · ${d.name}`, status: 'sapphire', big: inr(v),
    body: `<h3 class="sheet-h tel">${esc(t('trail.title'))}</h3><div class="trailcard">${trailHTML(s, pid, did)}</div><h3 class="sheet-h tel">${esc(t('rep.invoices'))}</h3>${hist}`,
  }, from);
}

// ---------- page ----------
export function renderOwnerReports(el, { lens = 'company', rest = [] } = {}) {
  const isGrid = lens === 'grid';
  if (!isGrid && !LENSES.includes(lens)) lens = 'company';
  const tabs = [...LENSES, 'grid'];

  function content() {
    const s = getState(); const f = getFilters(); const range = getRange();
    if (isGrid) return { crumbs: [], body: gridHTML(s, f) };
    if (rest.length) return { company: drillCompany, product: drillProduct, dealer: drillDealer }[lens](s, rest, f, range);
    return { crumbs: [], body: { company: companyList, product: productList, dealer: dealerList }[lens](s, f, range) };
  }

  function draw() {
    const y = window.scrollY;
    const c = content();
    el.innerHTML = `<div class="ow">${ownerNavHTML('reports')}<div class="ow-in rep">
      <h1 class="rep-h tel">${esc(t('rep.title'))}</h1>
      <div class="lenses" role="navigation" aria-label="${esc(t('lens.label'))}">${tabs.map((k) => `<a href="${H(k)}" class="tel"${k === lens ? ' aria-current="page"' : ''}>${esc(t(`lens.${k}`))}</a>`).join('')}</div>
      <div class="ttsec" data-tt>${timeToggleHTML()}</div>
      ${filtersHTML(FILTERS[lens])}
      ${breadcrumbHTML(c.crumbs)}
      <div class="rep-body" data-content>${c.body}</div></div></div>`;
    window.scrollTo(0, y);
  }
  function drawContent() { el.querySelector('[data-content]').innerHTML = content().body; }

  function onClick(e) {
    let b;
    if ((b = e.target.closest('[data-quick]'))) { ui.quick = b.dataset.quick; draw(); return; }
    if ((b = e.target.closest('[data-metric]'))) { ui.metric = b.dataset.metric; draw(); return; }
    if ((b = e.target.closest('[data-cell]'))) { openTrail(getState(), b.dataset.p, b.dataset.d, Number(b.dataset.v), b); return; }
    if ((b = e.target.closest('[data-dealer-bills]'))) openRecords(`dealer.${b.dataset.dealerBills}`, b.dataset.name, { from: b, status: 'amber' });
  }
  function onInput(e) {
    if (e.target.matches('[data-pq]')) { ui.productQ = e.target.value; drawContent(); const i = el.querySelector('[data-pq]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    if (e.target.matches('[data-gq]')) { ui.gridQ = e.target.value; drawContent(); const i = el.querySelector('[data-gq]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  el.addEventListener('click', onClick);
  el.addEventListener('input', onInput);
  const offs = [bindTimeToggle(el), bindFilters(el), subscribe(() => draw()), onRangeChange(() => draw()), onFiltersChange(() => draw())];
  draw();
  return () => { el.removeEventListener('click', onClick); el.removeEventListener('input', onInput); offs.forEach((fn) => fn()); };
}
