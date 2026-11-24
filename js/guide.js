// "One day at Devansh": eight steps with a bar (phone) or a side rail (laptop). Each step switches role and screen,
// rings what to tap, and can do the step for the presenter with the scripted GUIDED records (the same store actions the screens use).
// The current step is at localStorage['dm.guide']; the small context (before numbers, ids made on the way) is at 'dm.guide.ctx'.
import { t, onLangChange } from './i18n.js';
import {
  getState, subscribe, resetDemo, advancePO, receivePO, createOrder, approveCredit,
  createTrip, markLoaded, markLeft, markDelivered, recordPayment,
} from './store.js';
import { cycleBar, dealerBalance } from './selectors.js';
import { GUIDED } from './seed.js';
import { setRole } from './views/staff.js';
import { inr, esc, invoiceHref } from './ui/common.js';

const KEY = 'dm.guide';
const CTX = 'dm.guide.ctx';
const OTHER_KEYS = ['dm.syncQueue', 'dm.offline'];
const FULL = { full: true };
const BY = GUIDED.by;

// ---------- saved step and context (memory is the fallback when storage is blocked) ----------
let mem = { step: null, ctx: {} };
const read = (k) => { try { return globalThis.localStorage?.getItem(k); } catch { return null; } };
const write = (k, v) => { try { if (v === null) globalThis.localStorage?.removeItem(k); else globalThis.localStorage?.setItem(k, v); } catch { /* keep going in memory */ } };
export function savedStep() {
  const n = Number(read(KEY));
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : mem.step;
}
function saveStep(n) { mem.step = n; write(KEY, n === null ? null : String(n)); }
function ctx() {
  try { const c = JSON.parse(read(CTX) || 'null'); if (c && typeof c === 'object') return c; } catch { /* use memory */ }
  return mem.ctx;
}
function saveCtx(patch) { mem.ctx = { ...ctx(), ...patch }; write(CTX, JSON.stringify(mem.ctx)); }
export const isGuideOn = () => savedStep() !== null;

// ---------- what the guided records are, read from the live state ----------
const po = () => getState().pos.find((p) => p.id === GUIDED.poId);
function guidedInvoice() {
  const s = getState(); const c = ctx();
  if (c.invoiceId) return s.invoices.find((i) => i.id === c.invoiceId) || null;
  const found = s.invoices.slice(c.inv0 ?? s.invoices.length).find((i) => i.dealerId === GUIDED.dealerId);
  if (found) { saveCtx({ invoiceId: found.id }); return found; }
  return null;
}
function guidedTrip() {
  const inv = guidedInvoice();
  return inv ? getState().trips.find((tr) => tr.drops.some((d) => d.invoiceId === inv.id)) || null : null;
}
const guidedDrop = () => { const tr = guidedTrip(); const inv = guidedInvoice(); return tr && inv ? tr.drops.find((d) => d.invoiceId === inv.id) : null; };
const paid = () => { const inv = guidedInvoice(); return !!inv && getState().payments.some((p) => p.allocations.some((a) => a.invoiceId === inv.id)); };
const fail = (m) => { throw new Error(m); };

// ---------- the scripted actions: exactly what the screens' buttons do ----------
function doReceive() {
  let p = po();
  while (p && (p.step === 'ordered' || p.step === 'left')) { advancePO(p.id, p.step, BY.godown); p = po(); }
  if (p.step === 'onway') receivePO(GUIDED.poId, GUIDED.receiveLines, null, BY.godown);
}
function doOrder() {
  const out = createOrder(GUIDED.dealerId, GUIDED.orderLines, BY.sales);
  if (!out.invoice) approveCredit(out.order.id, BY.admin);
  guidedInvoice();
}
function doTrip() {
  const inv = guidedInvoice() || fail('no invoice yet');
  let tr = guidedTrip();
  if (!tr) tr = createTrip({ vehicleId: GUIDED.vehicleId, driverId: GUIDED.driverId, invoiceIds: [inv.id], ewayBill: GUIDED.ewayBill }, BY.dispatch);
  if (tr.status === 'planned') markLoaded(tr.id, BY.dispatch);
  tr = guidedTrip();
  if (tr.status === 'loaded') markLeft(tr.id, BY.dispatch);
}
function doDeliver() {
  const tr = guidedTrip() || fail('no trip yet'); const inv = guidedInvoice(); const d = guidedDrop();
  if (tr.status !== 'left' && tr.status !== 'done') doTrip();
  if (d.status === 'pending') markDelivered(tr.id, inv.id, { photo: 'drop-photo.jpg', otp: d.otp }, BY.driver);
}
function doPay() {
  const inv = guidedInvoice() || fail('no invoice yet');
  const amount = Math.round(inv.total / 2);
  recordPayment(GUIDED.dealerId, { mode: GUIDED.paymentMode, amount, allocations: [{ invoiceId: inv.id, amount }], ref: GUIDED.paymentRef, key: 'guided-pay' }, BY.accounts);
}

// ---------- the eight steps ----------
// targets: selectors tried in order (the first one on screen gets the ring). phases: extra stops inside one step.
const q = (a) => `[data-po="${GUIDED.poId}"] ${a}`;
const tripSel = (a) => { const tr = guidedTrip(); return tr ? `[data-trip="${tr.id}"] ${a}`.trim() : null; };
export const STEPS = [
  { role: 'owner', hash: '#/owner', targets: () => ['[data-bar]'], done: () => true },
  {
    role: 'staff', staff: 'godown', hash: '#/staff/inbound',
    targets: () => { const s = po()?.step; return s === 'onway' ? [q('[data-receive]')] : s === 'received' ? [q('')] : [q('[data-advance]')]; },
    done: () => po()?.step === 'received', run: doReceive,
    vars: () => ({ n: GUIDED.shortQty }),
  },
  {
    role: 'staff', staff: 'sales', hash: '#/staff/orders',
    targets: () => ['[data-quick="order"]'], done: () => !!guidedInvoice(), run: doOrder,
    vars: () => ({ dealer: getState().dealers.find((d) => d.id === GUIDED.dealerId).name, left: inr(ctx().credit ?? 0, FULL) }),
    phases: [{ hash: () => invoiceHref(guidedInvoice()?.id), targets: () => ['[data-grand]'] }],
  },
  {
    role: 'staff', staff: 'godown', hash: '#/staff/outbound',
    targets: () => { const tr = guidedTrip(); if (!tr) return ['[data-quick="trip"]']; return [tripSel(tr.status === 'planned' ? '[data-load]' : tr.status === 'loaded' ? '[data-left]' : ''), tripSel('')]; },
    done: () => { const tr = guidedTrip(); return !!tr && tr.status !== 'planned' && tr.status !== 'loaded'; }, run: doTrip,
    vars: () => { const s = getState(); return { plate: s.vehicles.find((v) => v.id === GUIDED.vehicleId).plate, driver: s.drivers.find((d) => d.id === GUIDED.driverId).name }; },
  },
  {
    role: 'driver', hash: `#/driver/${GUIDED.driverId}`,
    targets: () => { const d = guidedDrop(); const inv = guidedInvoice(); if (!d || !inv) return []; return d.status === 'pending' ? [`[data-drop="${inv.id}"] [data-delivered]`] : [`[data-drop="${inv.id}"]`]; },
    done: () => guidedDrop()?.status === 'delivered', run: doDeliver,
    vars: () => ({ driver: getState().drivers.find((d) => d.id === GUIDED.driverId).name }),
  },
  {
    role: 'dealer', hash: `#/dealer/${GUIDED.dealerId}`,
    targets: () => { const inv = guidedInvoice(); return [inv ? `[data-order="${inv.orderId}"]` : null, '[data-owes]']; }, done: () => true,
  },
  {
    role: 'staff', staff: 'accounts', hash: '#/staff/ledger', enter: async () => (await import('./views/staff-ledger.js')).setLedgerDealer(GUIDED.dealerId),
    targets: () => (paid() ? ['[data-payment]', '[data-balance]'] : ['[data-quick="pay"]']), done: paid, run: doPay,
  },
  {
    role: 'owner', hash: '#/owner', targets: () => ['.part[data-part="bank"]'], done: () => true,
    vars: () => ({ before: inr(ctx().before?.bank ?? 0), after: inr(cycleBar(getState()).bank) }),
    phases: [{ hash: () => '#/whatsapp/summary', targets: () => ['.wa-msg'] }],
  },
];
export const TOTAL = STEPS.length;
const phaseOf = (def, k) => (k > 0 ? def.phases[k - 1] : def);
const hashOf = (def, k) => { const p = phaseOf(def, k); return typeof p.hash === 'function' ? p.hash() : p.hash; };

// ---------- moving between steps ----------
let viewEl = null;
let wantScroll = false;
const here = () => globalThis.location.hash || '#/';

async function show(n, phase = 0) {
  const def = STEPS[n - 1];
  saveStep(n); saveCtx({ phase });
  if (def.staff) setRole(def.staff);
  await def.enter?.();
  const h = hashOf(def, phase);
  wantScroll = true;
  if (here() === h) globalThis.dispatchEvent(new HashChangeEvent('hashchange')); // same page, but the staff role may have changed
  else globalThis.location.hash = h;
  render();
}
export const guideStep = (n) => show(n, 0);

export function resetAll() {
  resetDemo();
  saveStep(null); mem.ctx = {}; write(CTX, null);
  OTHER_KEYS.forEach((k) => write(k, null));
  render();
}
export async function startGuide() {
  resetAll();
  const s = getState();
  saveCtx({ phase: 0, before: cycleBar(s), inv0: s.invoices.length, credit: dealerBalance(s, GUIDED.dealerId).headroom });
  await show(1);
}
export function resumeGuide() { const n = savedStep(); if (n) show(n, ctx().phase || 0); }
export function exitGuide() { saveStep(null); write(CTX, null); mem.ctx = {}; render(); }

// ---------- the bar / rail ----------
let bar = null;
let targetEl = null;
let lastSel = '';
let pending = null;
let error = '';

function ensureBar() {
  if (bar) return bar;
  bar = document.createElement('aside');
  bar.className = 'guide'; bar.id = 'guide'; bar.hidden = true;
  bar.addEventListener('click', onClick);
  document.body.append(bar);
  if ('ResizeObserver' in globalThis) new ResizeObserver(() => sizeVar()).observe(bar);
  return bar;
}
function sizeVar() {
  const on = bar && !bar.hidden;
  document.body.classList.toggle('guide-on', !!on);
  document.documentElement.style.setProperty('--guide-h', on ? `${bar.offsetHeight}px` : '0px');
  const hdr = document.getElementById('hdr');
  document.documentElement.style.setProperty('--hdr-h', hdr ? `${hdr.offsetHeight}px` : '0px');
}

function state() {
  const n = savedStep(); const def = STEPS[n - 1];
  const phase = Math.min(ctx().phase || 0, def.phases?.length || 0);
  const drift = here() !== hashOf(def, phase);
  const done = def.done();
  return { n, def, phase, drift, done, more: phase < (def.phases?.length || 0) };
}

function render() {
  if (!bar) return;
  const n = savedStep();
  const onLanding = here() === '#/' || here() === '';
  if (!n || onLanding) { bar.hidden = true; clearTarget(); sizeVar(); return; }
  const { def, phase, drift, done, more } = state();
  const vars = def.vars ? def.vars() : {};
  const key = phase > 0 ? `g.s${n}.p2` : `g.s${n}`;
  const title = t(`${key}.title`);
  const text = t(`${key}.text`, vars);
  const mode = drift ? 'back' : !done ? 'do' : more ? 'phase' : n < TOTAL ? 'next' : 'finish';
  const label = { back: t('g.backToStep'), do: t('g.do'), phase: more ? t(`g.s${n}.p2.btn`) : '', next: t('g.next'), finish: t('g.finish') }[mode];
  const focused = document.activeElement?.dataset?.gb;
  bar.hidden = false;
  bar.setAttribute('aria-label', t('g.region'));
  bar.innerHTML = `<div class="g-top"><span class="g-step tel">${esc(t('g.step', { n, total: TOTAL }))}</span>
      <ol class="g-dots" aria-hidden="true">${STEPS.map((_, i) => `<li class="${i + 1 < n ? 'done' : i + 1 === n ? 'now' : ''}"></li>`).join('')}</ol>
      <button type="button" class="g-x tel" data-gb="exit">${esc(t('g.exit'))}</button></div>
    <div class="g-body" aria-live="polite"><p class="g-who tel">${esc(t(`g.s${n}.who`))}${done && def.run && phase === 0 && !drift ? `<span class="g-done tel">${esc(t('g.done'))}</span>` : ''}</p>
      <h2 class="g-title tel">${esc(title)}</h2><p class="g-text tel">${esc(text)}</p>${error ? `<p class="g-err tel" role="alert">${esc(error)}</p>` : ''}</div>
    <div class="g-btns"><button type="button" class="g-back tel" data-gb="back"${n === 1 && phase === 0 ? ' disabled' : ''}>${esc(t('g.back'))}</button>
      <button type="button" class="g-main tel" data-gb="primary" data-mode="${mode}">${esc(label)}</button></div>`;
  if (focused) bar.querySelector(`[data-gb="${focused}"]`)?.focus();
  sizeVar();
  applyTarget();
}

function onClick(e) {
  const b = e.target.closest('[data-gb]');
  if (!b || b.disabled) return;
  const kind = b.dataset.gb;
  if (kind === 'exit') { exitGuide(); return; }
  const { n, def, phase, done, more } = state();
  if (kind === 'back') { if (phase > 0) show(n, phase - 1); else if (n > 1) show(n - 1, 0); return; }
  const mode = b.dataset.mode;
  error = '';
  if (mode === 'back') { show(n, phase); return; }
  if (mode === 'do') {
    b.disabled = true;
    try { def.run(); } catch { error = t('err.generic'); }
    b.disabled = false; render();
    return;
  }
  if (mode === 'phase' && more && done) { show(n, phase + 1); return; }
  if (mode === 'next') { show(n + 1, 0); return; }
  if (mode === 'finish') { exitGuide(); globalThis.location.hash = '#/'; }
}

// ---------- the ring: a class on the target; it is put back after every redraw of the screen ----------
function clearTarget() { targetEl?.classList.remove('guide-target'); targetEl = null; lastSel = ''; }
function applyTarget() {
  pending = null;
  if (!bar || bar.hidden || !viewEl) { clearTarget(); return; }
  const { def, phase, drift } = state();
  if (drift) { clearTarget(); return; }
  const list = (phaseOf(def, phase).targets() || []).filter(Boolean);
  let el = null; let sel = '';
  for (const s of list) { const c = viewEl.querySelector(s); if (c) { el = c; sel = s; break; } }
  if (el !== targetEl) { targetEl?.classList.remove('guide-target'); targetEl = el; el?.classList.add('guide-target'); }
  if (el && (wantScroll || sel !== lastSel)) { el.scrollIntoView({ block: 'center', inline: 'nearest' }); wantScroll = false; }
  lastSel = sel;
}
const later = () => { if (!pending) pending = requestAnimationFrame(applyTarget); };

let inited = false;
export function initGuide(view) {
  viewEl = view;
  ensureBar();
  if (!inited) {
    inited = true;
    new MutationObserver(later).observe(view, { childList: true, subtree: true });
    subscribe(() => { render(); });
    onLangChange(() => render());
    globalThis.addEventListener('hashchange', () => { error = ''; render(); });
  }
  render();
}
