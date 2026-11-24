// The dealer's phone: what he owes, how his orders are moving, his invoices and purchases at his own rates,
// and two big buttons (reorder, raise a query). Reads only dealerView; it never sees costs or other dealers.
import { addStrings, t } from '../i18n.js';
import { getState, subscribe, createOrder, raiseQuery } from '../store.js';
import { dealerView } from '../selectors.js';
import { esc, chip, inr, fmtDay, fmtTime } from '../ui/common.js';
import phoneStrings from '../strings/en-phone.js';
import staffStrings from '../strings/en-staff.js';
addStrings(phoneStrings);
addStrings(staffStrings);

const FULL = { full: true };
export const DEFAULT_DEALER = 'D-MYD-01';
const PICKER = [DEFAULT_DEALER, 'D-PDT-01', 'D-KDP-01', 'D-JMD-01', 'D-PUL-01', 'D-ATP-01']; // codes only: the presenter's switch never shows other dealers' names
const STEPS = ['placed', 'packed', 'loaded', 'ontheway', 'delivered'];
const LABEL = { paid: 'green', pending: 'blue', dueSoon: 'amber', overdue: 'red' };
const ui = { more: false, moreInv: false, panel: '', draft: '', note: null }; // note: {kind:'ok'|'bad', text}

const trackerHTML = (step) => {
  const at = STEPS.indexOf(step);
  return `<ol class="dl-trk" aria-label="${esc(t('d.tracker'))}">${STEPS.map((k, i) => `<li class="${i < at || step === 'delivered' ? 'done' : i === at ? 'now' : ''}"${i === at && step !== 'delivered' ? ' aria-current="step"' : ''}><i aria-hidden="true"></i><span class="tel">${esc(t(`d.step.${k}`))}</span></li>`).join('')}</ol>`;
};

function orderCard(o) {
  const cancelled = o.step === 'cancelled';
  const eta = o.eta ? fmtTime(`2000-01-01T${o.eta}`) : null;
  return `<article class="dl-card dl-order" data-order="${esc(o.orderId)}" data-step="${o.step}">
    <header><div><b class="tel">${esc(t('d.order', { id: o.orderId }))}</b><span class="dl-sub tel">${esc(fmtDay(o.date))}</span></div><b class="num">${esc(inr(o.total, FULL))}</b></header>
    ${cancelled ? chip('red', t('d.cancelled')) : `<p class="dl-now tel">${esc(t(`d.step.${o.step}`))}</p>${trackerHTML(o.step)}`}
    ${o.vehicle ? `<dl class="dl-van"><div><dt class="tel">${esc(t('d.vehicle'))}</dt><dd><span class="plate-no">${esc(o.vehicle)}</span></dd></div><div><dt class="tel">${esc(t('d.driver'))}</dt><dd>${esc(o.driver)}</dd></div>${eta ? `<div><dt class="tel">${esc(t('d.expected'))}</dt><dd class="num">${esc(eta)}</dd></div>` : ''}</dl>` : ''}
    ${o.otp ? `<div class="dl-otp" data-otp><p class="tel">${esc(t('d.otp'))}</p><b class="num" aria-label="${esc(o.otp.split('').join(' '))}">${esc(o.otp)}</b><p class="dl-sub tel">${esc(t('d.otpNote'))}</p></div>` : ''}
    ${o.step === 'delivered' && o.deliveredAt ? `<p class="dl-sub tel">${esc(t('d.deliveredAt', { when: `${fmtDay(o.deliveredAt)}, ${fmtTime(o.deliveredAt)}` }))}</p>` : ''}</article>`;
}

// What a reorder can really ask for: the last order's items, with quantities held to what the godown has.
const askLines = (last) => last.lines.filter((l) => l.take > 0);

function reorderHTML(last, names) {
  const lines = askLines(last);
  if (!lines.length) return `<div class="dl-card dl-confirm" data-confirm><b class="tel">${esc(t('d.reorderNone'))}</b><div class="dl-actions"><button type="button" class="pbtn ghost" data-cancel>${esc(t('common.cancel'))}</button></div></div>`;
  const short = lines.some((l, k) => l.take < last.lines.find((x) => x.productId === l.productId).qty) || lines.length < last.lines.length;
  return `<div class="dl-card dl-confirm" data-confirm><b class="tel">${esc(t('d.reorderAsk', { n: lines.length }))}</b>
    <ul class="tel">${lines.map((l) => `<li>${l.take} × ${esc(names.get(l.productId) || t('d.item'))}</li>`).join('')}</ul>
    ${short ? `<p class="dl-sub tel">${esc(t('d.reorderShort'))}</p>` : ''}
    <div class="dl-actions"><button type="button" class="pbtn" data-reorder-yes>${esc(t('d.reorderYes'))}</button><button type="button" class="pbtn ghost" data-cancel>${esc(t('common.cancel'))}</button></div></div>`;
}

function draw(el, id) {
  const dv = dealerView(getState(), id);
  if (!dv) { el.innerHTML = `<div class="dl"><div class="dl-pad"><p class="dl-card tel">${esc(t('d.notFound'))}</p>${picker(id)}</div></div>`; return; }
  const used = Math.min(100, dv.usedPct);
  const orders = ui.more ? dv.orders : dv.orders.slice(0, 2);
  const invs = ui.moreInv ? dv.invoices.slice(0, 20) : dv.invoices.slice(0, 5);
  const last = dv.lastOrder;
  const names = new Map(dv.purchases.byProduct.map((p) => [p.productId, p.name]));
  el.innerHTML = `<div class="dl">
    <section class="dl-hero" aria-label="${esc(t('d.owe'))}">
      <p class="dl-who tel">${esc(dv.dealer.name)} · ${esc(dv.dealer.town)}</p>
      <p class="dl-q tel">${esc(t('d.owe'))}</p>
      <b class="dl-owe num" data-owes="${dv.owes}">${esc(inr(dv.owes, FULL))}</b>
      <div class="dl-credit"><div class="dl-bar" role="img" aria-label="${esc(t('d.creditUsed', { used: inr(dv.used, FULL), limit: inr(dv.limit, FULL) }))}"><i style="width:${used}%"></i></div>
        <p class="tel">${esc(t('d.creditUsed', { used: inr(dv.used, FULL), limit: inr(dv.limit, FULL) }))}</p>
        <p class="tel"><b>${esc(t('d.creditLeft', { left: inr(Math.max(0, dv.headroom), FULL) }))}</b></p></div>
      ${dv.nextDue ? `<p class="dl-next tel">${esc(t('d.nextDue', { amount: inr(dv.nextDue.amount, FULL), date: fmtDay(dv.nextDue.date) }))}</p>` : `<p class="dl-next tel">${esc(t('d.nothingDue'))}</p>`}
    </section>
    <div class="dl-pad">
      ${ui.note ? `<p class="dl-note ${ui.note.kind}" role="status" data-note>${esc(ui.note.text)}</p>` : ''}
      <div class="dl-actions">
        <button type="button" class="pbtn" data-reorder${last ? '' : ' disabled'}>${esc(t('d.reorder'))}</button>
        <button type="button" class="pbtn alt" data-query>${esc(t('d.query'))}</button>
      </div>
      ${ui.panel === 'reorder' && last ? reorderHTML(last, names) : ''}
      ${ui.panel === 'query' ? `<form class="dl-card dl-form" data-query-form><label class="tel" for="dl-q">${esc(t('d.queryLabel'))}</label>
        <textarea id="dl-q" rows="4" data-draft>${esc(ui.draft)}</textarea>
        <div class="dl-actions"><button type="submit" class="pbtn">${esc(t('d.querySend'))}</button><button type="button" class="pbtn ghost" data-cancel>${esc(t('common.cancel'))}</button></div></form>` : ''}
      <section aria-labelledby="dl-o"><h2 id="dl-o" class="tel">${esc(t('d.orders'))}</h2><div class="dl-list">${orders.map(orderCard).join('') || `<p class="dl-card tel">${esc(t('d.noOrders'))}</p>`}</div>
        ${dv.orders.length > 2 ? `<button type="button" class="dl-more tel" data-more>${esc(t(ui.more ? 'd.less' : 'd.showOlder'))}</button>` : ''}</section>
      <section aria-labelledby="dl-i"><h2 id="dl-i" class="tel">${esc(t('d.invoices'))}</h2><div class="dl-list">${invs.map((i) => `<article class="dl-card dl-inv" data-invoice="${esc(i.id)}"><div><b class="num">${esc(i.id)}</b><span class="dl-sub tel">${esc(fmtDay(i.date))} · ${esc(t('d.dueOn', { date: fmtDay(i.dueDate) }))}</span></div>
        <div class="r"><b class="num">${esc(inr(i.total, FULL))}</b>${i.balance > 0 && i.balance < i.total ? `<span class="dl-sub tel">${esc(t('d.balance', { amount: inr(i.balance, FULL) }))}</span>` : ''}</div>
        <div class="dl-lbl"><span class="st lg" style="background:var(--${LABEL[i.label]})" data-label="${i.label}">${esc(t(`d.lbl.${i.label}`))}</span></div></article>`).join('')}</div>
        ${dv.invoices.length > 5 ? `<button type="button" class="dl-more tel" data-more-inv>${esc(t(ui.moreInv ? 'd.less' : 'd.showOlder'))}</button>` : ''}</section>
      <section aria-labelledby="dl-p"><h2 id="dl-p" class="tel">${esc(t('d.purchases'))}</h2>
        <div class="dl-card"><h3 class="tel">${esc(t('d.byBrand'))}</h3><ul class="dl-rows">${dv.purchases.byBrand.map((b) => `<li><span>${esc(b.name)}</span><b class="num">${esc(inr(b.value, FULL))}</b></li>`).join('')}</ul></div>
        <div class="dl-card"><h3 class="tel">${esc(t('d.byProduct'))}</h3><ul class="dl-rows">${dv.purchases.byProduct.slice(0, 8).map((p) => `<li><span class="tel">${esc(p.name)}<small>${esc(t('d.yourRate', { rate: inr(p.rate, FULL), qty: p.qty }))}</small></span><b class="num">${esc(inr(p.value, FULL))}</b></li>`).join('')}</ul></div></section>
      ${dv.queries.length ? `<section aria-labelledby="dl-qs"><h2 id="dl-qs" class="tel">${esc(t('d.myQueries'))}</h2><div class="dl-list">${dv.queries.slice(-3).reverse().map((q) => `<article class="dl-card" data-q="${esc(q.id)}"><p class="tel">${esc(q.text)}</p>${chip('amber', t('d.queryOpen'))}</article>`).join('')}</div></section>` : ''}
      ${picker(id)}
    </div></div>`;
}

const picker = (id) => `<div class="dl-presenter"><label class="tel" for="dl-sw">${esc(t('d.presenter'))}</label><select id="dl-sw" data-switch>${PICKER.map((c) => `<option value="${c}"${c === id ? ' selected' : ''}>${c}${c === DEFAULT_DEALER ? ` · ${esc(t('d.guided'))}` : ''}</option>`).join('')}</select></div>`;

export function renderDealer(el, { dealerId } = {}) {
  const id = !dealerId || dealerId === 'demo' ? DEFAULT_DEALER : dealerId;
  const redraw = () => draw(el, id);
  const act = (e) => {
    if (e.target.closest('[data-reorder]')) { ui.panel = 'reorder'; ui.note = null; return redraw(); }
    if (e.target.closest('[data-query]')) { ui.panel = 'query'; ui.note = null; redraw(); el.querySelector('[data-draft]')?.focus(); return undefined; }
    if (e.target.closest('[data-cancel]')) { ui.panel = ''; return redraw(); }
    if (e.target.closest('[data-more]')) { ui.more = !ui.more; return redraw(); }
    if (e.target.closest('[data-more-inv]')) { ui.moreInv = !ui.moreInv; return redraw(); }
    const yes = e.target.closest('[data-reorder-yes]');
    if (yes) {
      yes.disabled = true;
      const dv = dealerView(getState(), id);
      try {
        const out = createOrder(id, askLines(dv.lastOrder).map((l) => ({ productId: l.productId, qty: l.take, rate: l.rate })), { role: 'dealer', name: dv.dealer.name });
        ui.note = { kind: 'ok', text: out.needsApproval ? t('d.reorderHeld', { id: out.order.id }) : t('d.reorderDone', { id: out.order.id }) };
      } catch (err) { ui.note = { kind: 'bad', text: err.message === 'insufficient stock' ? t('d.reorderStock') : t('d.reorderFail') }; }
      ui.panel = '';
      return redraw();
    }
    return undefined;
  };
  const input = (e) => { if (e.target.matches('[data-draft]')) ui.draft = e.target.value; };
  const change = (e) => { if (e.target.matches('[data-switch]')) location.hash = `#/dealer/${e.target.value}`; };
  const submit = (e) => {
    if (!e.target.matches('[data-query-form]')) return;
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    const text = ui.draft.trim();
    if (!text) { ui.note = { kind: 'bad', text: t('d.queryEmpty') }; return redraw(); }
    btn.disabled = true;
    try { raiseQuery(id, text); ui.note = { kind: 'ok', text: t('d.querySent') }; ui.draft = ''; ui.panel = ''; } catch { ui.note = { kind: 'bad', text: t('d.reorderFail') }; }
    return redraw();
  };
  el.addEventListener('click', act); el.addEventListener('input', input); el.addEventListener('change', change); el.addEventListener('submit', submit);
  ui.panel = ''; ui.note = null;
  redraw();
  const off = subscribe(redraw);
  return () => { off(); el.removeEventListener('click', act); el.removeEventListener('input', input); el.removeEventListener('change', change); el.removeEventListener('submit', submit); };
}
