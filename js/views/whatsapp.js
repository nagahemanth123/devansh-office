// WhatsApp messages as they arrive on the owner's phone. Task 3 builds the 8 pm summary; Task 6 adds the other kinds.
import { t } from '../i18n.js';
import { getState, subscribe } from '../store.js';
import { summary8pm } from '../selectors.js';
import { esc, inr, fmtDay } from '../ui/common.js';

function summaryLines(s) {
  const m = summary8pm(s);
  return {
    head: t('wa.sum.head', { date: fmtDay(m.date) }),
    lines: [
      t('wa.sum.sales', { amount: inr(m.sales), n: m.invoices }),
      t('wa.sum.collected', { amount: inr(m.collected) }),
      m.chequesPending ? t('wa.sum.cheques', { amount: inr(m.chequesPending) }) : '',
      t('wa.sum.deliveries', { done: m.deliveries.done, total: m.deliveries.total }),
      m.overdue ? t('wa.sum.overdue', { amount: inr(m.overdue), n: m.overdueDealers }) : '',
      m.claims ? t('wa.sum.claims', { n: m.claims }) : '',
    ].filter(Boolean),
    foot: t('wa.sum.bar', { bank: inr(m.bar.bank), total: inr(m.bar.total) }),
  };
}

export function renderWhatsApp(el, { kind }) {
  const draw = () => {
    if (kind !== 'summary') {
      el.innerHTML = `<div class="wa-wrap"><p class="stub">${esc(t('view.soon'))}</p></div>`;
      return;
    }
    const m = summaryLines(getState());
    el.innerHTML = `<div class="wa-wrap">
      <a class="wa-back tel" href="#/owner">‹ ${esc(t('nav.home'))}</a>
      <div class="wa-phone" role="group" aria-label="${esc(t('wa.sum.title'))}">
        <div class="wa-bar"><span class="wa-av">DM</span><span><b>Devansh Marketing</b><span class="tel">${esc(t('wa.sum.title'))}</span></span></div>
        <div class="wa-chat">
          <div class="wa-day">${esc(fmtDay(getState().today))}</div>
          <div class="wa-msg">
            <b class="tel">${esc(m.head)}</b>
            <ul>${m.lines.map((l) => `<li class="tel">${esc(l)}</li>`).join('')}</ul>
            <p class="tel"><b>${esc(t('home.q'))}</b><br>${esc(m.foot)}</p>
            <span class="wa-time">8:00 pm</span>
          </div>
        </div>
      </div></div>`;
  };
  draw();
  return subscribe(draw);
}
