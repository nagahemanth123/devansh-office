// Small helpers shared by the owner screens: escaping, status chips, brand logos, money, dates, and
// turning a selector's {key, vars} into a sentence in the current language.
import { t } from '../i18n.js';
import { formatINR } from '../money.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ST = { green: 'var(--green)', blue: 'var(--blue)', amber: 'var(--amber)', red: 'var(--red)', neutral: 'var(--neutral)' };
export const inr = (n, opts) => formatINR(n, opts);
export const chev = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const chip = (status, word) => `<span class="st" style="background:${ST[status] || ST.neutral}">${esc(word)}</span>`;
export const invoiceHref = (id) => `#/owner/invoice/${encodeURIComponent(id)}`;

// ---------- dates (ISO strings, shown in English) ----------
function parts(iso, opts) {
  const f = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', ...opts });
  return Object.fromEntries(f.formatToParts(new Date(`${iso.slice(0, 10)}T12:00:00Z`)).map((p) => [p.type, p.value]));
}
export function fmtDay(iso, { weekday = true } = {}) {
  const p = parts(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${weekday ? `${p.weekday} ` : ''}${p.day} ${p.month}`;
}
export function fmtDate(iso) { const p = parts(iso, { day: 'numeric', month: 'short', year: 'numeric' }); return `${p.day} ${p.month} ${p.year}`; }
export function fmtTime(at) {
  const [h, m] = at.slice(11, 16).split(':').map(Number);
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
export function fmtStamp(clock) {
  const p = parts(clock, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return `${p.weekday} ${p.day} ${p.month} ${p.year}, ${fmtTime(clock)}`;
}

// ---------- selector keys -> sentences ----------
export function say(key, vars) {
  if (!vars) return t(key);
  const v = { ...vars };
  if (typeof v.amount === 'number') v.amount = inr(v.amount);
  if (typeof v.due === 'string') v.due = fmtDay(v.due);
  if (typeof v.loadedAt === 'string') v.time = fmtTime(v.loadedAt);
  if (v.period) v.period = t(`cmp.prev.${v.period}`);
  if (key === 'cmp.vsPrev' && typeof v.pct === 'number') v.pct = `${v.pct > 0 ? '+' : ''}${v.pct}`;
  if (key === 'cmp.daysCover' && v.days == null) return t('cmp.noCover');
  if (key === 'att.claim') {
    v.what = [v.short ? t('att.nShort', { n: v.short }) : '', v.damaged ? t('att.nDamaged', { n: v.damaged }) : ''].filter(Boolean).join(', ');
  }
  return t(key, v);
}

// ---------- brands ----------
const PLATE = { sentini: '#26384B' }; // a white logo needs a dark plate
export function logo(brandKey, brandName) {
  const alt = esc(brandName || brandKey);
  const src = `assets/brands/${brandKey}.webp`;
  if (PLATE[brandKey]) return `<span class="logo plate" style="background:${PLATE[brandKey]}"><img src="${src}" alt="${alt}" loading="lazy" decoding="async"></span>`;
  return `<span class="logo${brandKey === 'sparsh-pearl' ? ' sq' : ''}"><img src="${src}" alt="${alt}" loading="lazy" decoding="async"></span>`;
}

// age of an open bill -> status word
export const ageStatus = (days) => (days > 60 ? 'red' : days > 30 ? 'amber' : 'green');

// ---------- the owner's three tabs, shared by home, reports and activity ----------
export function ownerNavHTML(active) {
  const tab = (k, href) => `<a href="${href}"${active === k ? ' aria-current="page"' : ''} class="tel">${esc(t(`nav.${k}`))}</a>`;
  return `<nav class="ow-nav" aria-label="${esc(t('nav.label'))}"><div class="ow-in">${tab('home', '#/owner')}${tab('reports', '#/owner/reports/company')}${tab('activity', '#/owner/activity')}</div></nav>`;
}
