// The driver's phone: today's drops in order, one big Delivered button (photo, then the dealer's 4-digit code),
// Not delivered (shop closed, rejected, or partial), and an offline switch. Reads only driverView.
import { t } from '../i18n.js';
import { getState, subscribe, markDelivered, markNotDelivered } from '../store.js';
import { driverView } from '../selectors.js';
import { esc, chip, inr } from '../ui/common.js';

const FULL = { full: true };
export const DEFAULT_DRIVER = 'DR2';
const OFFLINE_KEY = 'dm.offline';
const QUEUE_KEY = 'dm.syncQueue';

// ---------- offline switch and the queue of deliveries waiting to sync ----------
let offlineMem = false; let queueMem = [];
const read = (k) => { try { return globalThis.localStorage?.getItem(k); } catch { return null; } };
const write = (k, v) => { try { globalThis.localStorage?.setItem(k, v); } catch { /* keep in memory */ } };
const isOffline = () => (read(OFFLINE_KEY) ?? (offlineMem ? '1' : '0')) === '1';
const setOffline = (on) => { offlineMem = on; write(OFFLINE_KEY, on ? '1' : '0'); };
const getQueue = () => { try { const q = JSON.parse(read(QUEUE_KEY) || 'null'); return Array.isArray(q) ? q : queueMem; } catch { return queueMem; } };
const setQueue = (q) => { queueMem = q; write(QUEUE_KEY, JSON.stringify(q)); };
const queued = (d) => getQueue().find((x) => x.invoiceId === d.invoiceId && x.tripId === d.tripId);

const flow = { kind: null, drop: null, step: '', photo: '', reason: '', lines: {}, error: '' };
const notice = { text: '' };
const resetFlow = () => Object.assign(flow, { kind: null, drop: null, step: '', photo: '', reason: '', lines: {}, error: '' });

function sync(by) {
  const left = [];
  for (const q of getQueue()) {
    try {
      if (q.kind === 'delivered') {
        const r = markDelivered(q.tripId, q.invoiceId, { photo: q.photo, otp: q.otp }, by);
        if (r === 'bad-otp') notice.text = t('dr.syncBad', { dealer: q.dealer });
      } else markNotDelivered(q.tripId, q.invoiceId, q.reason, q.lines, by);
    } catch { left.push(q); }
  }
  setQueue(left);
}

const STATUS = { pending: ['neutral', 'dr.st.pending'], delivered: ['green', 'dr.st.delivered'], partial: ['amber', 'dr.st.partial'], 'not-delivered': ['red', 'dr.st.not'] };

function dropCard(d) {
  const q = queued(d);
  const ready = d.status === 'pending' && d.tripStatus !== 'planned' && !q;
  let state = '';
  if (q) state = chip('amber', t('dr.sync'));
  else if (d.status === 'pending' && d.tripStatus === 'planned') state = chip('neutral', t('dr.waitLoad'));
  else { const [c, k] = STATUS[d.status]; state = chip(c, t(k)); }
  return `<article class="dr-card" data-drop="${esc(d.invoiceId)}" data-status="${q ? 'queued' : d.status}">
    <header><span class="dr-seq num" aria-label="${esc(t('dr.stop', { n: d.seq }))}">${d.seq}</span><div><b class="dr-name tel">${esc(d.dealerName)}</b><span class="dr-sub tel">${esc(d.town)} · ${esc(d.address)}</span></div></header>
    <div class="dr-meta"><b class="num dr-amt">${esc(inr(d.amount, FULL))}</b><span class="dr-state">${state}${d.reason ? `<small class="tel">${esc(t(`out.reason.${d.reason}`))}</small>` : ''}</span></div>
    <a class="pbtn ghost dr-call" href="tel:${esc(d.phone.replace(/\s/g, ''))}">${esc(t('dr.call'))} · <span class="num">${esc(d.phone)}</span></a>
    ${ready ? `<div class="dr-acts"><button type="button" class="pbtn" data-delivered="${esc(d.invoiceId)}">${esc(t('dr.delivered'))}</button><button type="button" class="pbtn alt" data-not="${esc(d.invoiceId)}">${esc(t('dr.notDelivered'))}</button></div>` : ''}</article>`;
}

function flowHTML() {
  const d = flow.drop;
  if (!flow.kind || !d) return '';
  const head = (title) => `<header class="dr-fh"><h2 class="tel">${esc(title)}</h2><p class="dr-sub tel">${esc(d.dealerName)} · ${esc(inr(d.amount, FULL))}</p></header>`;
  const close = `<button type="button" class="pbtn ghost" data-flow-close>${esc(t('common.cancel'))}</button>`;
  let body = '';
  if (flow.kind === 'delivered') {
    if (flow.step === 'photo') body = `${head(t('dr.photoTitle'))}<p class="tel">${esc(t('dr.photoHelp'))}</p>
      <label class="pbtn alt dr-photo" for="dr-file">${esc(t(flow.photo ? 'dr.photoRetake' : 'dr.photoTake'))}</label>
      <input id="dr-file" class="dr-file" type="file" accept="image/*" capture="environment" data-photo>
      ${flow.photo ? `<p class="dr-ok tel" data-photo-ok>${chip('green', t('dr.photoAdded'))} <span>${esc(flow.photo)}</span></p>` : ''}
      <div class="dr-acts"><button type="button" class="pbtn" data-photo-next${flow.photo ? '' : ' disabled'}>${esc(t('dr.next'))}</button>${close}</div>`;
    else if (flow.step === 'otp') body = `${head(t('dr.otpTitle'))}<label class="tel" for="dr-otp">${esc(t('dr.otpHelp'))}</label>
      <input id="dr-otp" class="dr-otp" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" data-otp>
      ${flow.error ? `<p class="dr-err tel" role="alert" data-error>${esc(flow.error)}</p>` : ''}
      <div class="dr-acts"><button type="button" class="pbtn" data-otp-go>${esc(t('dr.confirm'))}</button>${close}</div>`;
    else body = `<div class="dr-done" data-done>${head(t(flow.step === 'saved' ? 'dr.savedTitle' : 'dr.doneTitle'))}<p class="dr-big tel">${esc(t(flow.step === 'saved' ? 'dr.sync' : 'dr.st.delivered'))}</p><p class="tel">${esc(t(flow.step === 'saved' ? 'dr.savedHelp' : 'dr.doneHelp'))}</p><div class="dr-acts"><button type="button" class="pbtn" data-flow-close>${esc(t('common.done'))}</button></div></div>`;
  } else if (flow.step === 'reason') {
    body = `${head(t('dr.whyTitle'))}<div class="dr-acts stack">${['closed', 'rejected', 'partial'].map((r) => `<button type="button" class="pbtn alt" data-reason="${r}">${esc(t(`out.reason.${r}`))}</button>`).join('')}${close}</div>`;
  } else if (flow.step === 'confirm') {
    body = `${head(t(`out.reason.${flow.reason}`))}<p class="tel">${esc(t('dr.confirmNot'))}</p><div class="dr-acts"><button type="button" class="pbtn" data-not-go>${esc(t('dr.confirm'))}</button><button type="button" class="pbtn ghost" data-flow-back>${esc(t('dr.back'))}</button></div>`;
  } else if (flow.step === 'lines') {
    body = `${head(t('dr.partialTitle'))}<p class="tel">${esc(t('dr.partialHelp'))}</p><ul class="dr-lines">${d.lines.map((l) => { const v = flow.lines[l.productId] ?? l.qty; return `<li data-line="${esc(l.productId)}"><span class="tel">${esc(l.name)}</span><span class="dr-step"><button type="button" class="stp" data-dec="${esc(l.productId)}" aria-label="${esc(t('dr.less'))}">−</button><b class="num" data-qty>${v}</b><span class="dr-of tel">${esc(t('dr.of', { n: l.qty }))}</span><button type="button" class="stp" data-inc="${esc(l.productId)}" aria-label="${esc(t('dr.more'))}">+</button></span></li>`; }).join('')}</ul>
      ${flow.error ? `<p class="dr-err tel" role="alert" data-error>${esc(flow.error)}</p>` : ''}
      <div class="dr-acts"><button type="button" class="pbtn" data-not-go>${esc(t('dr.confirm'))}</button><button type="button" class="pbtn ghost" data-flow-back>${esc(t('dr.back'))}</button></div>`;
  }
  return `<div class="dr-ov" role="dialog" aria-modal="true" aria-label="${esc(t(flow.kind === 'delivered' ? 'dr.delivered' : 'dr.notDelivered'))}"><div class="dr-sheet">${body}</div></div>`;
}

const PICK = ['DR1', 'DR2', 'DR3', 'DR4', 'DR5'];

export function renderDriver(el, { driverId } = {}) {
  const id = !driverId || driverId === 'demo' ? DEFAULT_DRIVER : driverId;
  el.innerHTML = '<div class="dr"><div data-main></div><div data-flow></div></div>';
  const main = el.querySelector('[data-main]'); const ov = el.querySelector('[data-flow]');
  const view = () => driverView(getState(), id);
  const by = () => ({ role: 'driver', name: view()?.driver.name || 'Driver' });
  const drawFlow = () => { ov.innerHTML = flowHTML(); document.body.classList.toggle('sp-lock', !!flow.kind); (ov.querySelector('[data-otp]') || ov.querySelector('.pbtn'))?.focus(); };
  const drawMain = () => {
    const v = view();
    if (!v) { main.innerHTML = `<div class="dr-pad"><p class="dr-card tel">${esc(t('dr.notFound'))}</p></div>`; return; }
    const off = isOffline(); const waiting = getQueue().length;
    main.innerHTML = `<div class="dr-top"><div><p class="dr-hi tel">${esc(t('dr.hello', { name: v.driver.name }))}</p>${v.vehicle ? `<span class="plate-no">${esc(v.vehicle.plate)}</span>` : ''}</div>
      <button type="button" class="dr-off" role="switch" aria-checked="${off}" data-offline><span class="tel">${esc(t('dr.offline'))}</span><b class="tel">${esc(t(off ? 'dr.offOn' : 'dr.offOff'))}</b></button></div>
      <div class="dr-pad">${off ? `<p class="dr-banner tel" role="status">${esc(t('dr.offBanner'))}</p>` : ''}${waiting ? `<p class="dr-banner wait tel" role="status" data-waiting>${esc(t('dr.waiting', { n: waiting }))}</p>` : ''}${notice.text ? `<p class="dr-banner bad tel" role="alert">${esc(notice.text)}</p>` : ''}
      <h1 class="tel">${esc(t('dr.title'))}</h1>
      ${v.drops.length ? `<div class="dr-list">${v.drops.map(dropCard).join('')}</div>` : `<p class="dr-card tel" data-empty>${esc(t('dr.none'))}</p>`}
      <div class="dl-presenter"><label class="tel" for="dr-sw">${esc(t('dr.presenter'))}</label><select id="dr-sw" data-switch>${PICK.map((c, k) => `<option value="${c}"${c === id ? ' selected' : ''}>${esc(t('dr.driverN', { n: k + 1 }))}${c === DEFAULT_DRIVER ? ` · ${esc(t('d.guided'))}` : ''}</option>`).join('')}</select></div></div>`;
  };
  const draw = () => { drawMain(); };
  const find = (invoiceId) => view().drops.find((d) => d.invoiceId === invoiceId);
  const finish = (r, kind) => { // after a delivery attempt
    if (r === 'bad-otp') { flow.error = t('dr.wrongOtp'); drawFlow(); ov.querySelector('[data-otp]')?.focus(); return; }
    flow.step = kind; drawFlow();
  };
  const click = (e) => {
    const b = (s) => e.target.closest(s);
    if (b('[data-offline]')) {
      const next = !isOffline(); setOffline(next); notice.text = '';
      if (!next) sync(by());
      return drawMain();
    }
    const dl = b('[data-delivered]');
    if (dl) { Object.assign(flow, { kind: 'delivered', drop: find(dl.dataset.delivered), step: 'photo', photo: '', error: '' }); return drawFlow(); }
    const nd = b('[data-not]');
    if (nd) { Object.assign(flow, { kind: 'not', drop: find(nd.dataset.not), step: 'reason', reason: '', lines: {}, error: '' }); return drawFlow(); }
    if (b('[data-flow-close]')) { resetFlow(); return drawFlow(); }
    if (b('[data-flow-back]')) { flow.step = 'reason'; flow.error = ''; return drawFlow(); }
    if (b('[data-photo-next]')) { flow.step = 'otp'; flow.error = ''; return drawFlow(); }
    if (b('[data-otp-go]')) {
      const btn = b('[data-otp-go]'); const otp = ov.querySelector('[data-otp]').value.trim();
      if (!/^\d{4}$/.test(otp)) { flow.error = t('dr.otpShort'); return drawFlow(); }
      btn.disabled = true;
      const d = flow.drop;
      if (isOffline()) { setQueue([...getQueue(), { kind: 'delivered', tripId: d.tripId, invoiceId: d.invoiceId, photo: flow.photo, otp, dealer: d.dealerName }]); finish('ok', 'saved'); return drawMain(); }
      try { finish(markDelivered(d.tripId, d.invoiceId, { photo: flow.photo, otp }, by()), 'done'); } catch { btn.disabled = false; flow.error = t('dr.fail'); drawFlow(); }
      return undefined;
    }
    const rs = b('[data-reason]');
    if (rs) { flow.reason = rs.dataset.reason; flow.step = flow.reason === 'partial' ? 'lines' : 'confirm'; flow.lines = {}; flow.error = ''; return drawFlow(); }
    const step = b('[data-inc],[data-dec]');
    if (step) {
      const pid = step.dataset.inc || step.dataset.dec; const l = flow.drop.lines.find((x) => x.productId === pid);
      const cur = flow.lines[pid] ?? l.qty;
      flow.lines[pid] = Math.max(0, Math.min(l.qty, cur + (step.dataset.inc ? 1 : -1))); flow.error = ''; return drawFlow();
    }
    if (b('[data-not-go]')) {
      const d = flow.drop;
      if (flow.reason === 'partial' && !d.lines.some((l) => (flow.lines[l.productId] ?? l.qty) < l.qty)) { flow.error = t('dr.partialNone'); return drawFlow(); }
      b('[data-not-go]').disabled = true;
      const lines = flow.reason === 'partial' ? d.lines.map((l) => ({ productId: l.productId, delivered: flow.lines[l.productId] ?? l.qty })) : [];
      try {
        if (isOffline()) { setQueue([...getQueue(), { kind: 'not', tripId: d.tripId, invoiceId: d.invoiceId, reason: flow.reason, lines, dealer: d.dealerName }]); resetFlow(); drawFlow(); return drawMain(); }
        markNotDelivered(d.tripId, d.invoiceId, flow.reason, lines, by());
      } catch { flow.error = t('dr.fail'); return drawFlow(); }
      resetFlow(); return drawFlow();
    }
    return undefined;
  };
  const change = (e) => {
    if (e.target.matches('[data-switch]')) location.hash = `#/driver/${e.target.value}`;
    if (e.target.matches('[data-photo]')) { const f = e.target.files[0]; flow.photo = f ? f.name : ''; drawFlow(); }
  };
  el.addEventListener('click', click); el.addEventListener('change', change);
  notice.text = '';
  resetFlow(); draw();
  const off = subscribe(draw);
  return () => { off(); resetFlow(); document.body.classList.remove('sp-lock'); el.removeEventListener('click', click); el.removeEventListener('change', change); };
}
