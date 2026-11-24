// The invoice as a GST tax invoice (sample GSTINs and HSN codes). Opened from owner drill-downs and, later, staff screens.
import { t } from '../i18n.js';
import { getState, subscribe } from '../store.js';
import { invoiceDoc } from '../selectors.js';
import { esc, inr, chip, fmtDate, fmtDay, ownerNavHTML } from '../ui/common.js';

const FULL = { full: true };
const money = (n) => esc(inr(n, FULL));
const money2 = (n) => esc(`${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const STATUS_COLOUR = { delivered: 'green', ontheway: 'blue', loaded: 'blue', waiting: 'neutral', planned: 'neutral', cancelled: 'red' };

export function invoiceHTML(doc) {
  if (!doc) return `<p class="stub">${esc(t('inv.notFound'))}</p>`;
  const paidState = doc.balance <= 0 ? ['green', 'inv.paid'] : doc.paid > 0 ? ['amber', 'inv.partPaid'] : ['amber', 'inv.unpaid'];
  const row = (k, v, cls = '') => `<div class="tr ${cls}"><dt class="tel">${esc(t(k))}</dt><dd class="num">${v}</dd></div>`;
  return `<article class="invdoc" aria-label="${esc(t('inv.title'))} ${esc(doc.id)}">
    <header class="id-head">
      <div><p class="id-kicker tel">${esc(t('inv.title'))}</p><h2 class="id-no num">${esc(doc.id)}</h2></div>
      <div class="id-chips">${chip(STATUS_COLOUR[doc.status] || 'neutral', t(`inv.status.${doc.status}`))}${chip(paidState[0], t(paidState[1]))}</div>
    </header>
    <div class="id-parties">
      <div><p class="k tel">${esc(t('inv.from'))}</p><p><b>${esc(doc.seller.name)}</b><br>${esc(doc.seller.town)}<br><span class="gst">GSTIN ${esc(doc.seller.gstin)}</span></p></div>
      <div><p class="k tel">${esc(t('inv.billTo'))}</p><p><b>${esc(doc.buyer.name)}</b><br>${esc(doc.buyer.address)}<br><span class="gst">GSTIN ${esc(doc.buyer.gstin)}</span></p></div>
    </div>
    <dl class="id-meta">
      <div><dt class="tel">${esc(t('inv.date'))}</dt><dd>${esc(fmtDate(doc.date))}</dd></div>
      <div><dt class="tel">${esc(t('inv.due'))}</dt><dd>${esc(fmtDate(doc.dueDate))}</dd></div>
      <div><dt class="tel">${esc(t('inv.order'))}</dt><dd>${esc(doc.orderId)}</dd></div>
      ${doc.trip ? `<div><dt class="tel">${esc(t('inv.vehicle'))}</dt><dd>${esc(doc.trip.plate)} · ${esc(doc.trip.driver)}</dd></div>` : ''}
      ${doc.trip?.ewayBill ? `<div><dt class="tel">${esc(t('inv.eway'))}</dt><dd>${esc(doc.trip.ewayBill)}</dd></div>` : ''}
    </dl>
    <ol class="id-lines">${doc.lines.map((l) => `<li>
      <div class="l1"><b>${esc(l.name)}</b><span class="num">${money2(l.taxable + l.cgst + l.sgst)}</span></div>
      <div class="l2 tel">HSN ${esc(l.hsn)} · GST ${l.gstPct}% · ${l.qty} × ${esc(inr(l.rate, FULL))} = ${money2(l.taxable)}</div>
      <div class="l3 tel">CGST ${l.gstPct / 2}% ${money2(l.cgst)} · SGST ${l.gstPct / 2}% ${money2(l.sgst)}</div>
    </li>`).join('')}</ol>
    <dl class="id-totals">
      ${row('inv.taxable', money2(doc.taxable))}${row('inv.cgst', money2(doc.cgst))}${row('inv.sgst', money2(doc.sgst))}${row('inv.roundOff', money2(doc.roundOff))}
      <div class="tr grand"><dt class="tel">${esc(t('inv.grand'))}</dt><dd class="num" data-grand="${doc.total}">${money(doc.total)}</dd></div>
      ${row('inv.paidSoFar', money(doc.paid))}${row('inv.balance', money(doc.balance), doc.balance > 0 ? 'owe' : '')}
    </dl>
    ${doc.payments.length ? `<div class="id-pays"><p class="k tel">${esc(t('inv.payments'))}</p><ul>${doc.payments.map((p) => `<li><span>${esc(t(`mode.${p.mode}`))} · ${esc(fmtDay(p.date))}${p.status !== 'cleared' ? ` · ${esc(t(`pay.${p.status}`))}` : ''}</span><b class="num">${money(p.amount)}</b></li>`).join('')}</ul></div>` : ''}
    <div class="irn" role="note"><b class="tel">${esc(t('inv.irn'))}</b><span class="tel">${esc(t('inv.irnNote'))}</span></div>
  </article>`;
}

// Standalone page (#/owner/invoice/:id).
export function renderInvoice(el, invoiceId) {
  const draw = () => {
    el.innerHTML = `<div class="ow">${ownerNavHTML('reports')}<div class="ow-in rep">
      <p class="back"><button type="button" class="linkbtn tel" data-back>‹ ${esc(t('inv.back'))}</button></p>${invoiceHTML(invoiceDoc(getState(), invoiceId))}</div></div>`;
  };
  const onClick = (e) => { if (e.target.closest('[data-back]')) history.back(); };
  el.addEventListener('click', onClick);
  draw();
  const off = subscribe(draw);
  return () => { off(); el.removeEventListener('click', onClick); };
}
