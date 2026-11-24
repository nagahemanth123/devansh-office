// Bottom sheet that lists the records behind a number, with a total line that equals the number.
import { t } from '../i18n.js';
import { getState } from '../store.js';
import { recordsBehind, cycleBar } from '../selectors.js';
import { esc, ST, inr, chip, invoiceHref, fmtDay, ageStatus, logo } from './common.js';
import { getRange } from './time-toggle.js';

const BAR_STATUS = { 'bar.bank': 'green', 'bar.unpaid': 'amber', 'bar.road': 'blue', 'bar.godown': 'neutral', 'bar.total': 'neutral', 'bar.incoming': 'neutral' };
let opener = null;
let scrim = null;

function ensure() {
  if (scrim) return scrim;
  scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.hidden = true;
  scrim.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle"></div>';
  document.body.append(scrim);
  scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close-sheet]')) closeSheet(); });
  document.addEventListener('keydown', (e) => {
    if (scrim.hidden) return;
    if (e.key === 'Escape') closeSheet();
    if (e.key === 'Tab') { // keep focus inside the sheet
      const f = [...scrim.querySelectorAll('button,a[href],input')].filter((x) => !x.disabled);
      if (!f.length) return;
      const first = f[0]; const last = f.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener('hashchange', closeSheet);
  return scrim;
}

export function closeSheet() {
  if (!scrim || scrim.hidden) return;
  scrim.classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => { scrim.hidden = true; }, 160);
  if (opener && document.body.contains(opener)) opener.focus();
}

// head: {title, status, big}, body: html string
export function openSheet({ title, status = 'sapphire', big, body, foot = '' }, from) {
  ensure();
  opener = from || document.activeElement;
  const colour = ST[status] || 'var(--sapphire)';
  scrim.firstElementChild.innerHTML = `
    <div class="sheet-head" style="background:${colour}">
      <div class="r1"><h2 id="sheetTitle" class="tel">${esc(title)}</h2>
        <button class="closer" type="button" data-close-sheet aria-label="${esc(t('sheet.close'))}"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4l12 12M16 4L4 16" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg></button>
      </div>
      <div class="big num" data-sheet-big>${esc(big)}</div>
    </div>
    <div class="sheet-body">${body}${foot ? `<p class="sheet-foot tel">${esc(foot)}</p>` : ''}</div>`;
  scrim.hidden = false;
  requestAnimationFrame(() => scrim.classList.add('open'));
  document.body.style.overflow = 'hidden';
  scrim.querySelector('[data-close-sheet]').focus();
}

const MODE = (m) => t(`mode.${m}`);
const INV_STATUS = (s) => t(`inv.status.${s}`);

export function rowHtml(r) {
  const money = typeof r.amount === 'number' && r.kind !== 'staff';
  let main = esc(r.label); let sub = ''; let side = ''; let chipHtml = '';
  switch (r.kind) {
    case 'invoice':
      sub = `${esc(r.id)} · ${r.days != null ? esc(t('sheet.days', { n: r.days })) : esc(fmtDay(r.date))}`;
      chipHtml = r.days != null ? chip(ageStatus(r.days), t(`age.${ageStatus(r.days)}`)) : chip(r.status === 'delivered' ? 'green' : r.status === 'cancelled' ? 'red' : 'blue', INV_STATUS(r.status));
      break;
    case 'payment': sub = `${esc(MODE(r.mode))} · ${esc(fmtDay(r.date))}`; break;
    case 'bill': {
      const late = r.due < getState().today;
      sub = esc(t('sheet.due', { date: fmtDay(r.due) })); chipHtml = chip(late ? 'red' : 'amber', t(late ? 'age.red' : 'sheet.dueSoon'));
      break;
    }
    case 'stock': sub = esc(t('sheet.pcs', { n: r.qty })); break;
    case 'grn': sub = `${esc(r.id)} · ${esc(fmtDay(r.date))}`; break;
    case 'po': sub = `${esc(r.id)}`; chipHtml = chip(r.step === 'received' ? 'green' : 'blue', t(`po.step.${r.step}`)); main = `${logo(r.brand, r.label)}`; break;
    case 'trip': sub = `${esc(r.driver)} · ${esc(fmtDay(r.date))}`; break;
    case 'staff': sub = esc(r.role); break;
    default: break;
  }
  const href = r.kind === 'invoice' ? invoiceHref(r.id) : r.kind === 'payment' && r.invoiceId ? invoiceHref(r.invoiceId) : null;
  const inner = `<div><div class="dn">${main}</div><div class="no">${sub}</div></div>
    <div class="amt num">${money ? inr(r.amount, { full: true }) : ''}${side}</div>${chipHtml ? `<div>${chipHtml}</div>` : ''}`;
  const attrs = `class="inv${href ? ' link' : ''}" data-amount="${money ? r.amount : 0}"`;
  return href ? `<a ${attrs} href="${href}">${inner}</a>` : `<div ${attrs}>${inner}</div>`;
}

export function rowsBody(rows) {
  return rows.length ? rows.map(rowHtml).join('') : `<div class="ph tel">${esc(t('sheet.empty'))}</div>`;
}

// Sheet for one number: the rows add up to the number. key = 'bar.unpaid', 'tile.sales', 'dues.d60p', 'dealer.<id>'.
export function openRecords(key, title, { status, from } = {}) {
  const s = getState();
  const rows = recordsBehind(s, key, { range: getRange() });
  rows.sort((a, b) => (b.days ?? -1) - (a.days ?? -1) || (b.amount || 0) - (a.amount || 0));
  const isCount = rows.length > 0 && rows.every((r) => r.kind === 'staff');
  let total;
  if (key.startsWith('bar.') && key !== 'bar.incoming' && cycleBar(s)[key.slice(4)] != null) total = cycleBar(s)[key.slice(4)];
  else total = rows.reduce((a, r) => a + (r.amount || 0), 0);
  openSheet({
    title,
    status: status || BAR_STATUS[key] || 'sapphire',
    big: isCount ? String(rows.length) : inr(total),
    body: `<div data-rows data-total="${Math.round(total)}">${rowsBody(rows)}</div>`,
    foot: rows.length ? (isCount ? '' : t('sheet.total', { n: rows.length, amount: inr(total, { full: true }) })) : '',
  }, from);
}
