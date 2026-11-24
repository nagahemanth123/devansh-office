// Order desk: dealer search -> dealer card -> order with the catalogue picker. Also the orders waiting for the admin,
// the dealers' queries, and the recent orders. The new-order form is the same desk in a side panel.
import { t } from '../i18n.js';
import { getState, subscribe, createOrder, approveCredit } from '../store.js';
import { orderTotals, dealerOwes, BRAND } from '../selectors.js';
import { dealerRate } from '../seed.js';
import { esc, chip, inr, logo, fmtDay, fmtTime, invoiceHref } from '../ui/common.js';
import { openPanel } from '../ui/panel.js';
import { mountPicker } from '../ui/product-picker.js';
import { me, getRole, discountLimit, guarded, showError, clearError, errText } from './staff.js';
import { openTripForm } from './staff-outbound.js';
import { setLedgerDealer } from './staff-ledger.js';

const FULL = { full: true };

function dealerFacts(s, d) {
  const owes = dealerOwes(s, d.id);
  const last = s.orders.filter((o) => o.dealerId === d.id).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  return { owes, left: d.creditLimit - owes, pct: Math.min(100, Math.round((owes / d.creditLimit) * 100)), last };
}

export function dealerCardHTML(s, d) {
  const f = dealerFacts(s, d);
  const rep = s.staff.find((x) => x.id === d.salespersonId);
  return `<div class="stf-dealer" data-dealer-card="${esc(d.id)}">
    <div class="dc-top"><div><b class="tel">${esc(d.name)}</b><span class="stf-hint tel">${esc(d.town)} · ${esc(d.id)}${rep ? ` · ${esc(rep.name)}` : ''}</span></div></div>
    <div class="dc-mix">${d.brandMix.map((b) => logo(b, BRAND.get(b).name)).join('')}</div>
    <div class="dc-nums"><div><span class="tel">${esc(t('ord.creditLeft'))}</span><b class="num${f.left < 0 ? ' neg' : ''}" data-credit-left="${Math.round(f.left)}">${esc(inr(f.left, FULL))}</b></div>
      <div><span class="tel">${esc(t('ord.outstanding'))}</span><b class="num">${esc(inr(f.owes, FULL))}</b></div>
      <div><span class="tel">${esc(t('ord.limit'))}</span><b class="num">${esc(inr(d.creditLimit, FULL))}</b></div></div>
    <div class="stf-prog" aria-hidden="true"><i class="${f.pct > 90 ? 'hot' : ''}" style="width:${f.pct}%"></i></div>
    <p class="stf-hint tel">${f.last ? esc(t('ord.last', { date: fmtDay(f.last.date), amount: inr(f.last.total, FULL) })) : esc(t('ord.noLast'))}</p></div>`;
}

// A search box that lists matching dealers; onPick(dealerId).
function dealerSearch(host, onPick) {
  host.innerHTML = `<label class="fm-l tel" for="ds-q">${esc(t('ord.findDealer'))}</label><input id="ds-q" class="fm-in" type="search" autocomplete="off" placeholder="${esc(t('ord.findPlaceholder'))}" data-ds-input><ul class="pk-list" data-ds-list></ul>`;
  const input = host.querySelector('[data-ds-input]'); const list = host.querySelector('[data-ds-list]');
  const draw = () => {
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hits = getState().dealers.filter((d) => words.every((w) => `${d.name} ${d.town} ${d.id}`.toLowerCase().includes(w))).slice(0, 6);
    list.innerHTML = hits.length ? hits.map((d) => `<li class="pk-row"><div class="pk-main"><b class="tel">${esc(d.name)}</b><span class="pk-sub tel">${esc(d.town)} · ${esc(d.id)}</span></div><button type="button" class="fm-btn small" data-dealer="${esc(d.id)}">${esc(t('ord.choose'))}</button></li>`).join('') : `<li class="pk-none tel">${esc(t('ord.noDealer'))}</li>`;
  };
  input.addEventListener('input', draw);
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-dealer]'); if (b) onPick(b.dataset.dealer); });
  draw();
  return input;
}

let deskDealer = null;

export function mountOrders(host) {
  const draw = () => {
    const s = getState();
    const held = s.orders.filter((o) => o.status === 'needs-approval');
    const recent = [...s.orders].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8);
    const queries = [...s.queries].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8);
    const dealer = (id) => s.dealers.find((d) => d.id === id);
    const picked = deskDealer ? dealer(deskDealer) : null;
    host.querySelector('[data-desk]').innerHTML = picked
      ? `${dealerCardHTML(s, picked)}<div class="fm-actions"><button type="button" class="fm-btn primary" data-new-order="${esc(picked.id)}">${esc(t('ord.newFor'))}</button><button type="button" class="fm-btn" data-ledger="${esc(picked.id)}">${esc(t('ord.openLedger'))}</button><button type="button" class="fm-btn ghost" data-clear-desk>${esc(t('ord.change'))}</button></div>`
      : '<div data-desk-search></div>';
    if (!picked) dealerSearch(host.querySelector('[data-desk-search]'), (id) => { deskDealer = id; draw(); });
    host.querySelector('[data-held]').innerHTML = held.length ? held.map((o) => {
      const d = dealer(o.dealerId); const over = o.total + dealerOwes(s, d.id) - d.creditLimit;
      return `<li class="stf-item" data-held-order="${esc(o.id)}"><div><b class="tel">${esc(d.name)}</b><span class="stf-hint tel">${esc(d.town)} · ${esc(o.id)} · ${esc(t('ord.over', { amount: inr(over, FULL) }))}</span></div><b class="num">${esc(inr(o.total, FULL))}</b>
        <div>${getRole() === 'admin' ? `<button type="button" class="fm-btn primary" data-approve="${esc(o.id)}">${esc(t('ord.approve'))}</button>` : `${chip('amber', t('ord.needAdmin'))}`}</div></li>`;
    }).join('') : `<li class="stf-empty tel">${esc(t('ord.noneHeld'))}</li>`;
    host.querySelector('[data-queries]').innerHTML = queries.length ? queries.map((q) => {
      const d = dealer(q.dealerId);
      return `<li class="stf-item" data-query="${esc(q.id)}"><div><b class="tel">${esc(d.name)}</b><span class="stf-hint tel">${esc(d.town)} · ${esc(fmtDay(q.at))}, ${esc(fmtTime(q.at))}</span><p class="tel">${esc(q.text)}</p></div><span></span>${chip('amber', t('ord.queryOpen'))}</li>`;
    }).join('') : `<li class="stf-empty tel">${esc(t('ord.noQueries'))}</li>`;
    host.querySelector('[data-recent]').innerHTML = recent.map((o) => {
      const d = dealer(o.dealerId);
      return `<li class="stf-item"><div><b class="tel">${esc(d.name)}</b><span class="stf-hint tel">${esc(d.town)} · ${esc(fmtDay(o.date))} · ${o.invoiceId ? `<a class="num" href="${invoiceHref(o.invoiceId)}">${esc(o.invoiceId)}</a>` : esc(o.id)}</span></div><b class="num">${esc(inr(o.total, FULL))}</b>${o.status === 'needs-approval' ? chip('amber', t('ord.needAdmin')) : chip('green', t('ord.invoiced'))}</li>`;
    }).join('');
  };
  host.innerHTML = `<h1 class="stf-h1 tel">${esc(t('ord.title'))}</h1><div class="stf-cols">
    <section class="stf-card" aria-labelledby="od-h"><h2 id="od-h" class="tel">${esc(t('ord.desk'))}</h2><div data-desk></div></section>
    <section class="stf-card" aria-labelledby="oh-h"><h2 id="oh-h" class="tel">${esc(t('ord.held'))}</h2><ul class="stf-items" data-held></ul></section>
    <section class="stf-card" aria-labelledby="oq-h"><h2 id="oq-h" class="tel">${esc(t('ord.queries'))}</h2><ul class="stf-items" data-queries></ul></section>
    <section class="stf-card" aria-labelledby="or-h"><h2 id="or-h" class="tel">${esc(t('ord.recent'))}</h2><ul class="stf-items" data-recent></ul></section></div>`;
  host.addEventListener('click', (e) => {
    const n = e.target.closest('[data-new-order]');
    if (n) return openOrderForm({ dealerId: n.dataset.newOrder, from: n });
    const l = e.target.closest('[data-ledger]');
    if (l) { setLedgerDealer(l.dataset.ledger); location.hash = '#/staff/ledger'; return undefined; }
    if (e.target.closest('[data-clear-desk]')) { deskDealer = null; return draw(); }
    const a = e.target.closest('[data-approve]');
    if (a) return guarded(a, () => { try { approveCredit(a.dataset.approve, me()); return true; } catch (err) { a.title = errText(err); return false; } });
    return undefined;
  });
  draw();
  return subscribe(draw);
}

// ---------- new dealer order ----------
export function openOrderForm({ from, dealerId = null } = {}) {
  const pn = openPanel({ title: t('ord.form.title'), sub: t('ord.form.sub'), from });
  let dealer = null;
  const lines = []; // {p, qty}
  const s0 = getState();
  const pickDealer = (id) => { dealer = s0.dealers.find((d) => d.id === id); order(); };
  const rateOf = (p, pct) => (pct > 0 ? Math.round(dealerRate(p.id) * (1 - pct / 100)) : dealerRate(p.id));
  const pct = () => { const v = Number(pn.querySelector('[data-discount]')?.value || 0); return Number.isFinite(v) && v > 0 ? v : 0; };
  function order() {
    const s = getState();
    pn.innerHTML = `<div data-dcard>${dealerCardHTML(s, dealer)}</div>
      <div data-picker></div><div data-lines></div>
      <label class="fm-l tel" for="od-disc">${esc(t('ord.discount'))}</label>
      <div class="fm-inline"><input id="od-disc" class="fm-in num" type="number" inputmode="decimal" min="0" max="100" step="0.5" value="0" data-discount><span class="fm-note tel">${esc(t('ord.discountNote', { limit: discountLimit() }))}</span></div>
      <div class="fm-total" data-total></div>
      <div class="fm-actions" data-actions><button type="button" class="fm-btn primary" data-save disabled>${esc(t('ord.form.save'))}</button><button type="button" class="fm-btn ghost" data-close-panel>${esc(t('common.cancel'))}</button></div>`;
    mountPicker(pn.querySelector('[data-picker]'), { mode: 'dealer', onPick: (p) => { const ex = lines.find((l) => l.p.id === p.id); if (ex) ex.qty += 1; else lines.push({ p, qty: 1 }); drawLines(); } });
    drawLines();
  }
  function drawLines() {
    const save = pn.querySelector('[data-save]'); const d = pct();
    pn.querySelector('[data-lines]').innerHTML = lines.length ? `<table class="fm-table"><thead><tr><th class="tel">${esc(t('rc.item'))}</th><th class="tel">${esc(t('ord.qty'))}</th><th class="tel">${esc(t('ord.rate'))}</th><th class="tel">${esc(t('ord.line'))}</th><th></th></tr></thead><tbody>
      ${lines.map((l, k) => `<tr data-k="${k}"><td class="tel"><b>${esc(l.p.name)}</b></td><td><input class="fm-in num" type="number" inputmode="numeric" min="1" step="1" value="${l.qty}" data-qty aria-label="${esc(t('ord.qty'))}: ${esc(l.p.name)}"></td><td class="num" data-rate>${esc(inr(rateOf(l.p, d), FULL))}</td><td class="num" data-linetotal>${esc(inr(rateOf(l.p, d) * l.qty, FULL))}</td><td><button type="button" class="fm-btn ghost small" data-remove="${k}">${esc(t('common.remove'))}</button></td></tr>`).join('')}</tbody></table>` : '';
    totals();
    if (!save.hasAttribute('aria-busy')) save.disabled = !lines.length;
  }
  function totals() {
    const d = pct(); const s = getState();
    const box = pn.querySelector('[data-total]');
    if (!lines.length) { box.innerHTML = ''; return; }
    const tot = orderTotals(lines.map((l) => ({ productId: l.p.id, qty: l.qty, rate: rateOf(l.p, d) })));
    const left = dealer.creditLimit - dealerOwes(s, dealer.id) - tot.total;
    box.innerHTML = `<div><span class="tel">${esc(t('ord.total'))}</span> <b class="num" data-order-total="${tot.total}">${esc(inr(tot.total, FULL))}</b></div>
      <div><span class="tel">${esc(t('ord.creditAfter'))}</span> <b class="num${left < 0 ? ' neg' : ''}" data-credit-after>${esc(inr(left, FULL))}</b>${left < 0 ? ` ${chip('red', t('ord.overBy', { amount: inr(-left, FULL) }))}` : ''}</div>`;
  }
  pn.addEventListener('input', (e) => {
    const q = e.target.closest('[data-qty]');
    if (q) { const n = Math.floor(Number(q.value)); if (n >= 1) { lines[Number(q.closest('[data-k]').dataset.k)].qty = n; drawRates(); } return; }
    if (e.target.matches('[data-discount]')) { clearError(pn); drawRates(); }
  });
  function drawRates() { // update the numbers in place so the field being typed in keeps focus
    const d = pct();
    pn.querySelectorAll('[data-k]').forEach((tr) => { const l = lines[Number(tr.dataset.k)]; tr.querySelector('[data-rate]').textContent = inr(rateOf(l.p, d), FULL); tr.querySelector('[data-linetotal]').textContent = inr(rateOf(l.p, d) * l.qty, FULL); });
    totals();
  }
  pn.addEventListener('click', (e) => {
    const r = e.target.closest('[data-remove]');
    if (r) { lines.splice(Number(r.dataset.remove), 1); drawLines(); return; }
    if (e.target.closest('[data-plan]')) openTripForm({ invoiceId: e.target.closest('[data-plan]').dataset.plan, from });
  });
  pn.addEventListener('click', (e) => {
    const save = e.target.closest('[data-save]');
    if (!save) return;
    guarded(save, () => {
      clearError(pn);
      const d = pct(); const limit = discountLimit();
      if (d > limit) { showError(pn, t('err.discount', { pct: d, limit, role: t(`stf.role.${getRole()}`) })); return false; }
      try {
        const out = createOrder(dealer.id, lines.map((l) => ({ productId: l.p.id, qty: l.qty, rate: rateOf(l.p, d) })), me());
        const inv = out.invoice;
        pn.innerHTML = out.needsApproval
          ? `<div class="fm-done" data-result data-held="1">${chip('amber', t('ord.needAdmin'))}<p class="tel"><b>${esc(t('ord.heldMsg', { order: out.order.id, dealer: dealer.name }))}</b></p><div class="fm-actions"><a class="fm-btn primary" href="#/staff/orders" data-close-panel>${esc(t('ord.goOrders'))}</a></div></div>`
          : `<div class="fm-done" data-result data-invoice="${esc(inv.id)}">${chip('green', t('ord.invoiced'))}<p class="tel"><b>${esc(t('ord.doneMsg', { invoice: inv.id, amount: inr(inv.total, FULL) }))}</b></p><div class="fm-actions"><a class="fm-btn primary" data-close-panel data-invoice-link href="${invoiceHref(inv.id)}">${esc(t('ord.viewInvoice'))}</a><button type="button" class="fm-btn" data-plan="${esc(inv.id)}">${esc(t('ord.planTrip'))}</button></div></div>`;
        return true;
      } catch (err) { showError(pn, errText(err)); return false; }
    });
  });
  if (dealerId) pickDealer(dealerId);
  else { pn.innerHTML = '<div data-dsearch></div>'; dealerSearch(pn.querySelector('[data-dsearch]'), pickDealer).focus(); }
}
