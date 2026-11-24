// Inbound tracker (one row per purchase order, one button to move it on), the goods-received check, and the new-PO form.
import { t } from '../i18n.js';
import { getState, subscribe, advancePO, receivePO, createPO } from '../store.js';
import { BRAND, PRODUCT, r2 } from '../selectors.js';
import { purchaseRate } from '../seed.js';
import { esc, chip, inr, logo, fmtDay } from '../ui/common.js';
import { openPanel } from '../ui/panel.js';
import { mountPicker } from '../ui/product-picker.js';
import { me, canSeeCost, guarded, showError, clearError, errText } from './staff.js';

const STEPS = ['ordered', 'left', 'onway', 'received'];
const FULL = { full: true };
const locks = new Set(); // a double tap lands on the freshly drawn button, so each PO ignores taps for a moment after a move

function stepTracker(po) {
  const i = STEPS.indexOf(po.step);
  return `<ol class="stf-steps">${STEPS.map((s, k) => `<li class="${k < i ? 'is-done' : k === i ? 'is-now' : ''}"${k === i ? ' aria-current="step"' : ''}><span class="tel">${esc(t(`po.step.${s}`))}</span><small class="tel">${po.at[s] ? esc(fmtDay(po.at[s])) : ''}</small></li>`).join('')}</ol>`;
}

function rowHTML(po, s, cost) {
  const b = BRAND.get(po.brand);
  const grn = po.grnId ? s.grns.find((g) => g.id === po.grnId) : null;
  const claim = grn && grn.claimId ? s.claims.find((c) => c.id === grn.claimId) : null;
  const short = grn ? grn.lines.reduce((a, l) => a + l.short, 0) : 0;
  const damaged = grn ? grn.lines.reduce((a, l) => a + l.damaged, 0) : 0;
  let act = '';
  if (po.step === 'ordered' || po.step === 'left') act = `<button type="button" class="fm-btn" data-advance="${esc(po.id)}" data-step="${po.step}">${esc(t('in.next'))}</button><span class="stf-hint tel">${esc(t('in.nextTo', { step: t(`po.step.${STEPS[STEPS.indexOf(po.step) + 1]}`) }))}</span>`;
  else if (po.step === 'onway') act = `<button type="button" class="fm-btn primary" data-receive="${esc(po.id)}">${esc(t('in.receive'))}</button>`;
  else act = `${chip('green', t('po.step.received'))}${short ? chip('red', t('po.short', { n: short })) : ''}${damaged ? chip('amber', t('in.damaged', { n: damaged })) : ''}${claim ? `<span class="stf-hint tel">${esc(t('in.claim', { id: claim.id }))}</span>` : ''}`;
  return `<article class="stf-row stf-inb" data-po="${esc(po.id)}" data-step="${po.step}">
    <div class="r-id">${logo(po.brand, b.name)}<b class="num">${esc(po.id)}</b><span class="stf-hint tel">${esc(t('po.placed', { date: fmtDay(po.at.ordered) }))}</span>${po.step !== 'received' ? `<span class="stf-hint tel">${esc(t('po.eta', { date: fmtDay(po.eta) }))}</span>` : ''}</div>
    ${stepTracker(po)}
    <div class="r-val">${cost ? `<b class="num" data-field="purchaseRate">${esc(inr(po.value, FULL))}</b>` : ''}<span class="stf-hint tel">${esc(t('in.items', { n: po.lines.length }))}</span></div>
    <div class="r-act">${act}</div></article>`;
}

export function mountInbound(host) {
  const draw = () => {
    const s = getState();
    const cost = canSeeCost();
    const open = s.pos.filter((p) => p.step !== 'received').sort((a, b) => (a.eta < b.eta ? -1 : a.eta > b.eta ? 1 : a.id < b.id ? -1 : 1));
    const done = s.pos.filter((p) => p.step === 'received').sort((a, b) => (a.at.received < b.at.received ? 1 : -1)).slice(0, 6);
    host.innerHTML = `<section aria-labelledby="inb-h"><div class="stf-sh"><h1 id="inb-h" class="tel">${esc(t('in.title'))}</h1><span class="stf-hint tel">${esc(t('in.count', { n: open.length }))}</span></div>
      <div class="stf-list">${open.map((p) => rowHTML(p, s, cost)).join('') || `<p class="stf-empty tel">${esc(t('in.none'))}</p>`}</div></section>
      <section aria-labelledby="inb-h2"><div class="stf-sh"><h2 id="inb-h2" class="tel">${esc(t('in.recent'))}</h2></div>
      <div class="stf-list">${done.map((p) => rowHTML(p, s, cost)).join('')}</div></section>`;
  };
  host.addEventListener('click', (e) => {
    const a = e.target.closest('[data-advance]');
    if (a) {
      const id = a.dataset.advance;
      if (locks.has(id)) return;
      locks.add(id); setTimeout(() => locks.delete(id), 400);
      guarded(a, () => { advancePO(id, a.dataset.step, me()); return true; });
      return;
    }
    const r = e.target.closest('[data-receive]');
    if (r && locks.has(r.dataset.receive)) return;
    if (r) openReceiveForm({ poId: r.dataset.receive, from: r });
  });
  draw();
  return subscribe(draw);
}

// ---------- goods received: ordered vs arrived, short, damaged, photo, claim ----------
export function openReceiveForm({ poId = null, from } = {}) {
  const pn = openPanel({ title: t('rc.title'), sub: t('rc.sub'), from });
  const pick = () => {
    const open = getState().pos.filter((p) => p.step === 'left' || p.step === 'onway');
    pn.innerHTML = open.length
      ? `<p class="fm-note tel">${esc(t('rc.pick'))}</p><ul class="fm-pick">${open.map((p) => `<li><button type="button" class="fm-choice" data-pick-po="${esc(p.id)}">${logo(p.brand, BRAND.get(p.brand).name)}<b class="num">${esc(p.id)}</b><span class="tel">${esc(t(`po.step.${p.step}`))} · ${esc(t('po.eta', { date: fmtDay(p.eta) }))}</span></button></li>`).join('')}</ul>`
      : `<p class="fm-note tel">${esc(t('rc.nothing'))}</p>`;
  };
  pn.addEventListener('click', (e) => { const b = e.target.closest('[data-pick-po]'); if (b) form(b.dataset.pickPo); });
  const form = (id) => {
    const s = getState();
    const po = s.pos.find((p) => p.id === id);
    const cost = canSeeCost();
    pn.innerHTML = `<div class="fm-head">${logo(po.brand, BRAND.get(po.brand).name)}<b class="num">${esc(po.id)}</b></div>
      <table class="fm-table"><thead><tr><th class="tel">${esc(t('rc.item'))}</th><th class="tel">${esc(t('rc.ordered'))}</th><th class="tel">${esc(t('rc.arrived'))}</th><th class="tel">${esc(t('rc.short'))}</th><th class="tel">${esc(t('rc.damaged'))}</th>${cost ? `<th data-field="purchaseRate" class="tel">${esc(t('rc.rate'))}</th>` : ''}</tr></thead><tbody>
      ${po.lines.map((l) => `<tr data-line="${esc(l.productId)}" data-ordered="${l.qty}"><td class="tel"><b>${esc(PRODUCT.get(l.productId).name)}</b></td><td class="num">${l.qty}</td>
        <td><input class="fm-in num" type="number" inputmode="numeric" min="0" max="${l.qty}" step="1" value="${l.qty}" data-arrived aria-label="${esc(t('rc.arrived'))}: ${esc(PRODUCT.get(l.productId).name)}"></td>
        <td class="num" data-short>0</td>
        <td><input class="fm-in num" type="number" inputmode="numeric" min="0" step="1" value="0" data-damaged aria-label="${esc(t('rc.damaged'))}: ${esc(PRODUCT.get(l.productId).name)}"></td>
        ${cost ? `<td class="num" data-field="purchaseRate">${esc(inr(l.rate, FULL))}</td>` : ''}</tr>`).join('')}</tbody></table>
      <label class="fm-l tel" for="rc-photo">${esc(t('rc.photo'))}</label>
      <input id="rc-photo" class="fm-file" type="file" accept="image/*" capture="environment" data-photo>
      <p class="fm-note tel">${esc(t('rc.claimNote'))}</p>
      <div class="fm-actions" data-actions><button type="button" class="fm-btn primary" data-save>${esc(t('rc.save'))}</button><button type="button" class="fm-btn ghost" data-close-panel>${esc(t('common.cancel'))}</button></div>`;
    const recalc = () => pn.querySelectorAll('[data-line]').forEach((tr) => {
      const arrived = Number(tr.querySelector('[data-arrived]').value);
      tr.querySelector('[data-short]').textContent = Number.isFinite(arrived) ? Math.max(0, Number(tr.dataset.ordered) - arrived) : 0;
    });
    pn.addEventListener('input', recalc);
    pn.querySelector('[data-save]').addEventListener('click', (e) => guarded(e.currentTarget, () => {
      clearError(pn);
      const lines = [];
      for (const tr of pn.querySelectorAll('[data-line]')) {
        const ordered = Number(tr.dataset.ordered);
        const received = Number(tr.querySelector('[data-arrived]').value);
        const damaged = Number(tr.querySelector('[data-damaged]').value);
        if (![received, damaged].every((n) => Number.isInteger(n) && n >= 0) || received > ordered || damaged > received) { showError(pn, t('err.qty')); return false; }
        lines.push({ productId: tr.dataset.line, received, short: ordered - received, damaged });
      }
      const file = pn.querySelector('[data-photo]').files[0];
      try {
        const grn = receivePO(po.id, lines, file ? file.name : null, me());
        const claim = grn.claimId ? getState().claims.find((c) => c.id === grn.claimId) : null;
        const n = claim ? claim.lines.reduce((a, l) => a + l.short + l.damaged, 0) : 0;
        pn.innerHTML = `<div class="fm-done" data-result>${chip('green', t('po.step.received'))}<p class="tel"><b>${esc(t('rc.done', { po: po.id }))}</b></p>
          ${claim ? `<p class="fm-claim tel" data-claim>${chip('red', t('rc.claim'))} ${esc(canSeeCost() ? t('rc.claimMade', { id: claim.id, brand: BRAND.get(claim.brand).name, n, amount: inr(claim.amount, FULL) }) : t('rc.claimMadeNoAmt', { id: claim.id, brand: BRAND.get(claim.brand).name, n }))}</p>` : `<p class="tel">${esc(t('rc.allGood'))}</p>`}
          <div class="fm-actions"><button type="button" class="fm-btn primary" data-close-panel>${esc(t('common.done'))}</button></div></div>`;
        return true;
      } catch (err) { showError(pn, errText(err)); return false; }
    }));
    pn.querySelector('[data-arrived]')?.focus();
  };
  const po = poId ? getState().pos.find((p) => p.id === poId) : null;
  if (po && (po.step === 'left' || po.step === 'onway')) form(poId); else pick();
}

// ---------- new purchase order ----------
export function openPOForm({ from } = {}) {
  const pn = openPanel({ title: t('po.form.title'), sub: t('po.form.sub'), from });
  const cost = canSeeCost();
  let brand = null;
  const lines = []; // {p, qty}
  pn.innerHTML = `<label class="fm-l tel" for="po-brand">${esc(t('po.form.brand'))}</label>
    <select id="po-brand" class="fm-in" data-brand><option value="">${esc(t('po.form.pickBrand'))}</option>${[...BRAND.values()].map((b) => `<option value="${esc(b.key)}">${esc(b.name)}</option>`).join('')}</select>
    <div data-picker hidden></div>
    <div data-lines></div>
    <div data-total class="fm-total"></div>
    <div class="fm-actions" data-actions><button type="button" class="fm-btn primary" data-save disabled>${esc(t('po.form.save'))}</button><button type="button" class="fm-btn ghost" data-close-panel>${esc(t('common.cancel'))}</button></div>`;
  const save = pn.querySelector('[data-save]');
  const rate = (p) => purchaseRate(p.id);
  const drawLines = () => {
    pn.querySelector('[data-lines]').innerHTML = lines.length ? `<table class="fm-table"><thead><tr><th class="tel">${esc(t('rc.item'))}</th><th class="tel">${esc(t('ord.qty'))}</th>${cost ? `<th data-field="purchaseRate" class="tel">${esc(t('rc.rate'))}</th><th data-field="purchaseRate" class="tel">${esc(t('ord.line'))}</th>` : ''}<th></th></tr></thead><tbody>
      ${lines.map((l, k) => `<tr data-k="${k}"><td class="tel"><b>${esc(l.p.name)}</b></td><td><input class="fm-in num" type="number" inputmode="numeric" min="1" step="1" value="${l.qty}" data-qty aria-label="${esc(t('ord.qty'))}: ${esc(l.p.name)}"></td>
      ${cost ? `<td class="num" data-field="purchaseRate">${esc(inr(rate(l.p), FULL))}</td><td class="num" data-field="purchaseRate" data-linetotal>${esc(inr(rate(l.p) * l.qty, FULL))}</td>` : ''}<td><button type="button" class="fm-btn ghost small" data-remove="${k}" aria-label="${esc(t('common.remove'))}">${esc(t('common.remove'))}</button></td></tr>`).join('')}</tbody></table>` : '';
    drawTotal();
  };
  const drawTotal = () => {
    const sum = r2(lines.reduce((a, l) => a + rate(l.p) * l.qty, 0));
    pn.querySelector('[data-total]').innerHTML = lines.length && cost ? `<span class="tel" data-field="purchaseRate">${esc(t('po.form.value'))}</span> <b class="num" data-field="purchaseRate">${esc(inr(sum, FULL))}</b>` : '';
    save.disabled = !lines.length || save.getAttribute('aria-busy') === 'true';
  };
  pn.querySelector('[data-brand]').addEventListener('change', (e) => {
    brand = e.target.value || null; lines.length = 0; drawLines();
    const host = pn.querySelector('[data-picker]');
    host.hidden = !brand;
    if (brand) mountPicker(host, { mode: 'purchase', brand, showCost: cost, onPick: (p) => { const ex = lines.find((l) => l.p.id === p.id); if (ex) ex.qty += 1; else lines.push({ p, qty: 1 }); drawLines(); } });
  });
  pn.addEventListener('input', (e) => {
    const q = e.target.closest('[data-qty]');
    if (!q) return;
    const row = q.closest('[data-k]'); const n = Math.floor(Number(q.value));
    if (n >= 1) { lines[Number(row.dataset.k)].qty = n; const c = row.querySelector('[data-linetotal]'); if (c) c.textContent = inr(rate(lines[Number(row.dataset.k)].p) * n, FULL); drawTotal(); }
  });
  pn.addEventListener('click', (e) => { const r = e.target.closest('[data-remove]'); if (r) { lines.splice(Number(r.dataset.remove), 1); drawLines(); } });
  save.addEventListener('click', () => guarded(save, () => {
    clearError(pn);
    try {
      const po = createPO(brand, lines.map((l) => ({ productId: l.p.id, qty: l.qty })), me());
      pn.innerHTML = `<div class="fm-done" data-result>${chip('green', t('po.step.ordered'))}<p class="tel"><b>${esc(t('po.form.done', { po: po.id, brand: BRAND.get(po.brand).name }))}</b></p><div class="fm-actions"><a class="fm-btn primary" href="#/staff/inbound" data-close-panel>${esc(t('po.form.see'))}</a></div></div>`;
      return true;
    } catch (err) { showError(pn, errText(err)); return false; }
  }));
  pn.querySelector('[data-brand]').focus();
}
