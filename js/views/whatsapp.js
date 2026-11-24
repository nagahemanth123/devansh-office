// Messages as they arrive on a phone, drawn as a generic chat (no real app name or logo). Three kinds:
// the owner's 8 pm summary, the dealer's payment reminder (Telugu and English) and the delivery OTP.
// Nothing is sent from the demo.
import { t } from '../i18n.js';
import { getState, subscribe } from '../store.js';
import { summary8pm, dealerView } from '../selectors.js';
import { esc, inr, fmtDay, fmtTime } from '../ui/common.js';
import en from '../strings/en.js';

const DEALER = 'D-MYD-01'; // the dealer of the guided day
const KINDS = ['summary', 'reminder', 'otp'];
const TABLE = { en };
const say = (lang, key, vars = {}) => TABLE[lang][key].replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
const dayIn = (lang, iso) => { const p = Object.fromEntries(new Intl.DateTimeFormat(lang === 'te' ? 'te-IN' : 'en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(new Date(`${iso}T12:00:00Z`)).map((x) => [x.type, x.value])); return `${p.weekday} ${p.day} ${p.month}`; };

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

const bubble = (inner, time, lang) => `<div class="wa-msg"${lang ? ` lang="${lang}"` : ''}>${inner}<span class="wa-time">${esc(time)}</span></div>`;

function chat(kind, s) {
  if (kind === 'summary') {
    const m = summaryLines(s);
    return { title: t('wa.sum.title'), body: bubble(`<b class="tel">${esc(m.head)}</b><ul>${m.lines.map((l) => `<li class="tel">${esc(l)}</li>`).join('')}</ul><p class="tel"><b>${esc(t('home.q'))}</b><br>${esc(m.foot)}</p>`, '8:00 pm') };
  }
  const dv = dealerView(s, DEALER);
  if (kind === 'reminder') {
    const due = dv.nextDue;
    const vars = (lang) => ({ name: dv.dealer.name, owes: inr(dv.owes), amount: due ? inr(due.amount) : inr(dv.owes), invoice: due ? due.invoiceId : '', date: due ? dayIn(lang, due.date) : '' });
    const one = (lang) => bubble(`<p class="tel">${esc(say(lang, due ? 'wa.rem.body' : 'wa.rem.bodyNone', vars(lang)))}</p>`, '10:30 am', lang);
    return { title: t('wa.rem.title'), body: one('en') };
  }
  const o = dv.orders.find((x) => x.otp);
  const body = o
    ? bubble(`<p class="tel">${esc(t('wa.otp.body', { invoice: o.invoiceId || o.orderId, driver: o.driver || '', vehicle: o.vehicle || '' }))}</p><p class="wa-code num" data-otp-code>${esc(o.otp)}</p><p class="tel">${esc(t('wa.otp.note'))}</p>`, o.eta ? fmtTime(`2000-01-01T${o.eta}`) : '9:00 am')
    : bubble(`<p class="tel" data-otp-none>${esc(t('wa.otp.none'))}</p>`, '');
  return { title: t('wa.otp.title'), body: `<div class="wa-day">${esc(fmtDay(s.today))}</div>${body}` };
}

export function renderWhatsApp(el, { kind }) {
  const k = KINDS.includes(kind) ? kind : 'summary';
  const draw = () => {
    const s = getState();
    const c = chat(k, s);
    el.innerHTML = `<div class="wa-wrap">
      <a class="wa-back tel" href="#/owner">‹ ${esc(t('nav.home'))}</a>
      <nav class="wa-tabs" aria-label="${esc(t('wa.tabs'))}">${KINDS.map((x) => `<a class="tel" href="#/whatsapp/${x}"${x === k ? ' aria-current="page"' : ''}>${esc(t(`wa.tab.${x}`))}</a>`).join('')}</nav>
      <div class="wa-phone" role="group" aria-label="${esc(c.title)}">
        <div class="wa-bar"><span class="wa-av">DM</span><span><b>Devansh Marketing</b><span class="tel">${esc(c.title)}</span></span></div>
        <div class="wa-chat">${k === 'summary' ? `<div class="wa-day">${esc(fmtDay(s.today))}</div>` : ''}${c.body}</div>
      </div>
      <p class="wa-note tel" data-wa-note>${esc(t('wa.note'))}</p></div>`;
  };
  draw();
  return subscribe(draw);
}
