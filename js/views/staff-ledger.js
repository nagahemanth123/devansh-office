// Dealer ledger: invoices, payments, balance, credit limit and ageing on one page, cheque clear / bounce buttons,
// and the record-payment form that splits one payment across invoices.
import { t } from '../i18n.js';
import { getState, subscribe, recordPayment, setCheque } from '../store.js';
import { dealerLedger, dealerOwes, invoiceBalance, r2 } from '../selectors.js';
import { esc, chip, inr, fmtDay, invoiceHref } from '../ui/common.js';
import { openPanel } from '../ui/panel.js';
import { me, guarded, showError, clearError, errText } from './staff.js';

const FULL = { full: true };
const KEY = 'dm.staffDealer';
const LABEL = { paid: 'green', pending: 'neutral', dueSoon: 'amber', overdue: 'red' };
let dealerNow = null;

export function getLedgerDealer() {
  let id = dealerNow;
  try { id = globalThis.localStorage?.getItem(KEY) || id; } catch { /* storage blocked */ }
  return getState().dealers.some((d) => d.id === id) ? id : 'D-MYD-01';
}
export function setLedgerDealer(id) {
  dealerNow = id;
  try { globalThis.localStorage?.setItem(KEY, id); } catch { /* keep in memory */ }
}

export function mountLedger(host) {
  const s0 = getState();
  const dealers = [...s0.dealers].sort((a, b) => (a.name < b.name ? -1 : 1));
  host.innerHTML = `<div class="stf-sh"><h1 class="tel">${esc(t('led.title'))}</h1></div>
    <div class="stf-tools"><div><label class="fm-l tel" for="led-d">${esc(t('led.pick'))}</label>
    <select id="led-d" class="fm-in" data-dealer>${dealers.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} · ${esc(d.town)}</option>`).join('')}</select></div></div>
    <div data-body></div>`;
  const sel = host.querySelector('[data-dealer]');
  sel.value = getLedgerDealer();
  const draw = () => {
    const s = getState(); const id = sel.value; const d = s.dealers.find((x) => x.id === id);
    const L = dealerLedger(s, id); const b = L.balance;
    const age = (k, status, v) => `<div class="stf-age"><span class="tel">${esc(t(`dues.${k}`))}</span><b class="num">${esc(inr(v, FULL))}</b>${v > 0 ? chip(status, t(`age.${status}`)) : ''}</div>`;
    host.querySelector('[data-body]').innerHTML = `<div class="stf-cols led">
      <section class="stf-card" aria-label="${esc(t('led.balance'))}" data-balance>
        <div class="led-owe"><span class="tel">${esc(t('led.owes'))}</span><b class="num stf-big" data-owes="${b.owes}">${esc(inr(b.owes, FULL))}</b></div>
        <div class="stf-prog" role="img" aria-label="${esc(t('led.used', { pct: b.usedPct }))}"><i class="${b.usedPct > 90 ? 'hot' : ''}" style="width:${Math.min(100, b.usedPct)}%"></i></div>
        <p class="stf-hint tel">${esc(t('led.credit', { used: inr(b.used, FULL), limit: inr(b.limit, FULL), left: inr(Math.max(0, b.headroom), FULL) }))}</p>
        <div class="ages">${age('d0_30', 'green', b.ageing.d0_30)}${age('d31_60', 'amber', b.ageing.d31_60)}${age('d60p', 'red', b.ageing.d60p)}</div>
        ${b.nextDue ? `<p class="tel">${esc(t('led.nextDue', { date: fmtDay(b.nextDue.date), amount: inr(b.nextDue.amount, FULL) }))}</p>` : ''}
        ${b.pendingCheques ? `<p class="tel">${chip('amber', t('led.cheques', { amount: inr(b.pendingCheques, FULL) }))}</p>` : ''}
        <div class="fm-actions"><button type="button" class="fm-btn primary" data-pay="${esc(id)}">${esc(t('q.pay'))}</button></div></section>
      <section class="stf-card wide" aria-labelledby="li-h"><h2 id="li-h" class="tel">${esc(t('led.invoices'))}</h2>
        <div class="tbl-wrap"><table class="fm-table" data-invoices><thead><tr><th class="tel">${esc(t('led.invoice'))}</th><th class="tel">${esc(t('led.date'))}</th><th class="tel">${esc(t('led.due'))}</th><th class="tel r">${esc(t('led.total'))}</th><th class="tel r">${esc(t('led.balanceCol'))}</th><th></th></tr></thead><tbody>
        ${L.invoices.slice(0, 14).map((i) => `<tr><td><a class="num" href="${invoiceHref(i.id)}">${esc(i.id)}</a></td><td class="tel">${esc(fmtDay(i.date))}</td><td class="tel">${esc(fmtDay(i.dueDate))}</td><td class="num r">${esc(inr(i.total, FULL))}</td><td class="num r">${esc(inr(i.balance, FULL))}</td><td>${chip(LABEL[i.label], t(`d.lbl.${i.label}`))}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="stf-card wide" aria-labelledby="lp-h"><h2 id="lp-h" class="tel">${esc(t('led.payments'))}</h2>
        <div class="tbl-wrap"><table class="fm-table" data-payments><thead><tr><th class="tel">${esc(t('led.receipt'))}</th><th class="tel">${esc(t('led.date'))}</th><th class="tel">${esc(t('led.mode'))}</th><th class="tel r">${esc(t('led.amount'))}</th><th></th></tr></thead><tbody>
        ${L.payments.slice(0, 10).map((p) => `<tr data-payment="${esc(p.id)}"><td class="num">${esc(p.id)}</td><td class="tel">${esc(fmtDay(p.date))}</td><td class="tel">${esc(t(`mode.${p.mode}`))}${p.ref ? ` · ${esc(p.ref)}` : ''}</td><td class="num r">${esc(inr(p.amount, FULL))}</td>
          <td class="acts">${p.status === 'pending' ? `<button type="button" class="fm-btn small" data-clear="${esc(p.id)}">${esc(t('led.clear'))}</button><button type="button" class="fm-btn small danger" data-bounce="${esc(p.id)}">${esc(t('led.bounce'))}</button>` : chip(p.status === 'cleared' ? 'green' : 'red', t(`pay.${p.status}`))}</td></tr>`).join('') || `<tr><td colspan="5" class="stf-empty tel">${esc(t('led.noPayments'))}</td></tr>`}</tbody></table></div></section></div>`;
  };
  sel.addEventListener('change', () => { setLedgerDealer(sel.value); draw(); });
  host.addEventListener('click', (e) => {
    const p = e.target.closest('[data-pay]');
    if (p) return openPaymentForm({ dealerId: p.dataset.pay, from: p });
    const c = e.target.closest('[data-clear]');
    if (c) return guarded(c, () => { setCheque(c.dataset.clear, 'cleared', me()); return true; });
    const b = e.target.closest('[data-bounce]');
    if (b) return guarded(b, () => { setCheque(b.dataset.bounce, 'bounced', me()); return true; });
    return undefined;
  });
  draw();
  return subscribe(draw);
}

// ---------- record payment, split across invoices ----------
export function openPaymentForm({ from, dealerId = null } = {}) {
  const pn = openPanel({ title: t('pay.form.title'), sub: t('pay.form.sub'), from });
  const s = getState();
  const key = `ui-${Math.random().toString(36).slice(2)}`; // a double submit comes back as the same payment
  const first = dealerId || getLedgerDealer();
  const owing = s.dealers.filter((d) => dealerOwes(s, d.id) > 0).sort((a, b) => (a.name < b.name ? -1 : 1));
  const money = (el) => { const v = Number(el.value); return Number.isFinite(v) ? r2(v) : NaN; };
  pn.innerHTML = `<label class="fm-l tel" for="pf-d">${esc(t('pay.form.dealer'))}</label>
    <select id="pf-d" class="fm-in" data-dealer>${owing.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} · ${esc(d.town)}</option>`).join('')}</select>
    <div class="fm-two"><div><label class="fm-l tel" for="pf-m">${esc(t('led.mode'))}</label><select id="pf-m" class="fm-in" data-mode><option value="upi">${esc(t('mode.upi'))}</option><option value="cash">${esc(t('mode.cash'))}</option><option value="cheque">${esc(t('mode.cheque'))}</option></select></div>
    <div><label class="fm-l tel" for="pf-a">${esc(t('pay.form.amount'))}</label><input id="pf-a" class="fm-in num" type="number" inputmode="decimal" min="0" step="0.01" data-amount></div></div>
    <label class="fm-l tel" for="pf-r">${esc(t('pay.form.ref'))}</label><input id="pf-r" class="fm-in" type="text" autocomplete="off" data-ref>
    <div class="fm-row-h"><p class="fm-l tel">${esc(t('pay.form.split'))}</p><button type="button" class="fm-btn small" data-fill>${esc(t('pay.form.fill'))}</button></div>
    <div data-alloc></div>
    <div class="fm-total" data-sum></div>
    <div class="fm-actions" data-actions><button type="button" class="fm-btn primary" data-save>${esc(t('pay.form.save'))}</button><button type="button" class="fm-btn ghost" data-close-panel>${esc(t('common.cancel'))}</button></div>`;
  const dsel = pn.querySelector('[data-dealer]'); const amt = pn.querySelector('[data-amount]');
  if (owing.some((d) => d.id === first)) dsel.value = first;
  const open = () => getState().invoices.filter((i) => i.dealerId === dsel.value && invoiceBalance(i) > 0).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const drawAlloc = () => {
    pn.querySelector('[data-alloc]').innerHTML = `<table class="fm-table"><thead><tr><th class="tel">${esc(t('led.invoice'))}</th><th class="tel">${esc(t('led.due'))}</th><th class="tel r">${esc(t('led.balanceCol'))}</th><th class="tel r">${esc(t('pay.form.pay'))}</th></tr></thead><tbody>
      ${open().map((i) => `<tr><td class="num">${esc(i.id)}</td><td class="tel">${esc(fmtDay(i.dueDate))}</td><td class="num r">${esc(inr(invoiceBalance(i), FULL))}</td><td><input class="fm-in num" type="number" inputmode="decimal" min="0" step="0.01" data-alloc-inv="${esc(i.id)}" data-bal="${invoiceBalance(i)}" aria-label="${esc(t('pay.form.pay'))}: ${esc(i.id)}"></td></tr>`).join('')}</tbody></table>`;
    sum();
  };
  const allocs = () => [...pn.querySelectorAll('[data-alloc-inv]')].map((el) => ({ invoiceId: el.dataset.allocInv, amount: money(el) })).filter((a) => a.amount > 0);
  function sum() {
    const total = r2(allocs().reduce((a, x) => a + x.amount, 0)); const a = money(amt) || 0;
    const ok = Math.abs(total - a) < 0.005 && a > 0;
    pn.querySelector('[data-sum]').innerHTML = `<span class="tel">${esc(t('pay.form.allocated', { done: inr(total, FULL), of: inr(a, FULL) }))}</span> ${a > 0 || total > 0 ? chip(ok ? 'green' : 'amber', t(ok ? 'pay.form.matches' : 'pay.form.differs')) : ''}`;
  }
  pn.querySelector('[data-fill]').addEventListener('click', () => { // oldest first
    clearError(pn);
    let left = money(amt) || 0;
    pn.querySelectorAll('[data-alloc-inv]').forEach((el) => { const x = Math.min(left, Number(el.dataset.bal)); el.value = x > 0 ? String(r2(x)) : ''; left = r2(left - x); });
    sum();
  });
  dsel.addEventListener('change', drawAlloc);
  pn.addEventListener('input', () => { clearError(pn); sum(); });
  pn.querySelector('[data-save]').addEventListener('click', (e) => guarded(e.currentTarget, () => {
    clearError(pn);
    const a = money(amt); const list = allocs();
    if (!(a > 0)) { showError(pn, t('err.amount')); return false; }
    if (Math.abs(list.reduce((x, y) => x + y.amount, 0) - a) > 0.005) { showError(pn, t('err.alloc')); return false; }
    try {
      const p = recordPayment(dsel.value, { mode: pn.querySelector('[data-mode]').value, amount: a, allocations: list, ref: pn.querySelector('[data-ref]').value.trim() || null, key }, me());
      const owes = dealerOwes(getState(), dsel.value);
      pn.innerHTML = `<div class="fm-done" data-result data-payment-id="${esc(p.id)}">${chip(p.status === 'pending' ? 'amber' : 'green', p.status === 'pending' ? t('pay.pending') : t('pay.cleared'))}<p class="tel"><b>${esc(t('pay.form.done', { id: p.id, amount: inr(p.amount, FULL) }))}</b></p><p class="tel">${esc(t('pay.form.left', { amount: inr(owes, FULL) }))}</p><div class="fm-actions"><a class="fm-btn primary" data-close-panel href="#/staff/ledger">${esc(t('common.done'))}</a></div></div>`;
      setLedgerDealer(p.dealerId);
      return true;
    } catch (err) { showError(pn, errText(err)); return false; }
  }));
  drawAlloc();
  amt.focus();
}
