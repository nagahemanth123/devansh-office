// Outbound tracker (one row per trip, a progress bar and per-drop status) and the new-trip form.
import { t } from '../i18n.js';
import { getState, subscribe, createTrip, markLoaded, markLeft } from '../store.js';
import { esc, chip, inr, fmtDay, fmtTime, invoiceHref } from '../ui/common.js';
import { openPanel } from '../ui/panel.js';
import { me, guarded, showError, clearError, errText } from './staff.js';

const FULL = { full: true };
const EWAY_LIMIT = 50000;
const TRIP_CHIP = { planned: 'neutral', loaded: 'amber', left: 'blue', done: 'green' };
const DROP_CHIP = { pending: ['neutral', 'out.drop.pending'], delivered: ['green', 'out.drop.delivered'], partial: ['amber', 'out.drop.partial'], 'not-delivered': ['red', 'out.drop.not'] };

function tripHTML(tr, s) {
  const veh = s.vehicles.find((v) => v.id === tr.vehicleId);
  const driver = s.drivers.find((d) => d.id === tr.driverId);
  const got = tr.drops.filter((d) => d.status === 'delivered' || d.status === 'partial').length;
  const pct = Math.round((got / tr.drops.length) * 100);
  const act = tr.status === 'planned' ? `<button type="button" class="fm-btn" data-load="${esc(tr.id)}">${esc(t('out.markLoaded'))}</button>`
    : tr.status === 'loaded' ? `<button type="button" class="fm-btn" data-left="${esc(tr.id)}">${esc(t('out.markLeft'))}</button>` : '';
  return `<article class="stf-row trip" data-trip="${esc(tr.id)}">
    <div class="r-id"><span class="plate-no">${esc(veh.plate)}</span><b class="num">${esc(tr.id)}</b><span class="stf-hint tel">${esc(driver.name)} · ${esc(veh.kind)}</span></div>
    <div class="trip-mid"><div class="stf-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${tr.drops.length}" aria-valuenow="${got}" aria-label="${esc(t('out.progress', { n: got, of: tr.drops.length }))}"><i style="width:${pct}%"></i></div>
      <p class="trip-pc tel"><b>${esc(t('out.progress', { n: got, of: tr.drops.length }))}</b></p>
      <ol class="trip-drops">${tr.drops.map((d) => {
    const dealer = s.dealers.find((x) => x.id === d.dealerId); const inv = s.invoices.find((x) => x.id === d.invoiceId);
    const [c, k] = DROP_CHIP[d.status];
    return `<li><span class="d-seq num">${d.seq}</span><span class="d-n tel"><b>${esc(dealer.name)}</b> · ${esc(dealer.town)}<br><a class="num" href="${invoiceHref(inv.id)}">${esc(inv.id)}</a> · <span class="num">${esc(inr(inv.total, FULL))}</span></span><span class="d-c">${chip(c, t(k))}${d.reason ? `<small class="tel">${esc(t(`out.reason.${d.reason}`))}</small>` : ''}</span></li>`;
  }).join('')}</ol></div>
    <div class="r-act">${chip(TRIP_CHIP[tr.status], t(`trip.${tr.status}`))}<span class="stf-hint num">${esc(inr(tr.value, FULL))}</span>${tr.ewayBill ? `<span class="stf-hint tel">${esc(t('inv.eway'))} ${esc(tr.ewayBill)}</span>` : ''}${tr.leftAt ? `<span class="stf-hint tel">${esc(t('out.left', { time: fmtTime(tr.leftAt) }))}</span>` : ''}${act}</div></article>`;
}

export function mountOutbound(host) {
  const draw = () => {
    const s = getState();
    const rank = { loaded: 0, left: 1, planned: 2, done: 3 };
    const trips = s.trips.filter((x) => x.date === s.today || x.status !== 'done').sort((a, b) => rank[a.status] - rank[b.status] || (a.at < b.at ? 1 : -1));
    host.innerHTML = `<section aria-labelledby="out-h"><div class="stf-sh"><h1 id="out-h" class="tel">${esc(t('out.title'))}</h1><span class="stf-hint tel">${esc(t('out.count', { n: trips.length, date: fmtDay(s.today) }))}</span></div>
      <div class="stf-list">${trips.map((x) => tripHTML(x, s)).join('') || `<p class="stf-empty tel">${esc(t('out.none'))}</p>`}</div></section>`;
  };
  host.addEventListener('click', (e) => {
    const a = e.target.closest('[data-load]');
    if (a) return guarded(a, () => { markLoaded(a.dataset.load, me()); return true; });
    const b = e.target.closest('[data-left]');
    if (b) return guarded(b, () => { markLeft(b.dataset.left, me()); return true; });
    return undefined;
  });
  draw();
  return subscribe(draw);
}

// ---------- new trip ----------
export function openTripForm({ from, invoiceId = null } = {}) {
  const s = getState();
  const pn = openPanel({ title: t('trip.form.title'), sub: t('trip.form.sub'), from });
  const waiting = s.invoices.filter((i) => i.status === 'waiting').sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 40);
  if (invoiceId && !waiting.some((i) => i.id === invoiceId)) { const x = s.invoices.find((i) => i.id === invoiceId); if (x && x.status === 'waiting') waiting.unshift(x); }
  const dealerOf = (id) => s.dealers.find((d) => d.id === id);
  pn.innerHTML = `<div class="fm-two"><div><label class="fm-l tel" for="tr-veh">${esc(t('trip.form.vehicle'))}</label>
      <select id="tr-veh" class="fm-in" data-vehicle>${s.vehicles.map((v) => `<option value="${esc(v.id)}">${esc(v.plate)} · ${esc(v.kind)}</option>`).join('')}</select></div>
    <div><label class="fm-l tel" for="tr-drv">${esc(t('trip.form.driver'))}</label>
      <select id="tr-drv" class="fm-in" data-driver>${s.drivers.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select></div></div>
    <p class="fm-l tel" id="tr-inv-l">${esc(t('trip.form.invoices'))}</p>
    <ul class="fm-checks" aria-labelledby="tr-inv-l">${waiting.map((i) => { const d = dealerOf(i.dealerId); return `<li><label class="fm-check"><input type="checkbox" data-inv="${esc(i.id)}" data-amount="${i.total}"${i.id === invoiceId ? ' checked' : ''}><span class="tel"><b>${esc(d.name)}</b> · ${esc(d.town)}<br><span class="num">${esc(i.id)}</span> · <span class="num">${esc(inr(i.total, FULL))}</span></span></label></li>`; }).join('') || `<li class="fm-note tel">${esc(t('trip.form.none'))}</li>`}</ul>
    <div class="fm-total" data-sum></div>
    <div data-eway-box hidden><label class="fm-l tel" for="tr-eway">${esc(t('trip.form.eway'))}</label><input id="tr-eway" class="fm-in" type="text" autocomplete="off" data-eway placeholder="${esc(t('trip.form.ewayHint'))}"><p class="fm-note tel">${esc(t('trip.form.ewayNote', { limit: inr(EWAY_LIMIT, FULL) }))}</p></div>
    <div class="fm-actions" data-actions><button type="button" class="fm-btn primary" data-save>${esc(t('trip.form.save'))}</button><button type="button" class="fm-btn ghost" data-close-panel>${esc(t('common.cancel'))}</button></div>`;
  const veh = pn.querySelector('[data-vehicle]'); const drv = pn.querySelector('[data-driver]');
  const syncDriver = () => { drv.value = s.vehicles.find((v) => v.id === veh.value).driverId; };
  const picked = () => [...pn.querySelectorAll('[data-inv]:checked')];
  const sync = () => {
    const sel = picked(); const total = sel.reduce((a, c) => a + Number(c.dataset.amount), 0);
    pn.querySelector('[data-sum]').innerHTML = sel.length ? `<span class="tel">${esc(t('trip.form.sum', { n: sel.length }))}</span> <b class="num">${esc(inr(total, FULL))}</b>` : '';
    pn.querySelector('[data-eway-box]').hidden = total <= EWAY_LIMIT;
  };
  veh.addEventListener('change', syncDriver); syncDriver();
  pn.addEventListener('change', (e) => { if (e.target.matches('[data-inv]')) { clearError(pn); sync(); } });
  sync();
  pn.querySelector('[data-save]').addEventListener('click', (e) => guarded(e.currentTarget, () => {
    clearError(pn);
    const ids = picked().map((c) => c.dataset.inv);
    if (!ids.length) { showError(pn, t('trip.form.pickOne')); return false; }
    const eway = pn.querySelector('[data-eway]').value.trim();
    const total = picked().reduce((a, c) => a + Number(c.dataset.amount), 0);
    if (total > EWAY_LIMIT && !eway) { showError(pn, t('err.eway')); pn.querySelector('[data-eway]').focus(); return false; }
    try {
      const trip = createTrip({ vehicleId: veh.value, driverId: drv.value, invoiceIds: ids, ewayBill: eway }, me());
      pn.innerHTML = `<div class="fm-done" data-result data-trip-id="${esc(trip.id)}">${chip('green', t('trip.planned'))}<p class="tel"><b>${esc(t('trip.form.done', { id: trip.id, n: trip.drops.length }))}</b></p><div class="fm-actions"><a class="fm-btn primary" href="#/staff/outbound" data-close-panel>${esc(t('trip.form.see'))}</a></div></div>`;
      return true;
    } catch (err) { showError(pn, errText(err)); return false; }
  }));
}
