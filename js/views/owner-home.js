// Owner home: the Godown board, live from the records. Phone first.
import { t, getLang } from '../i18n.js';
import { getState, subscribe } from '../store.js';
import { cycleBar, tiles, attention, comingIn, goingOut, districtWeekly, brandCards, recordsBehind, brandPaymentsWeek, topDealerDues, addDays, BRAND } from '../selectors.js';
import { esc, ST, inr, chip, chev, logo, say, fmtDay, fmtTime, fmtStamp, ownerNavHTML } from '../ui/common.js';
import { openRecords, openSheet, rowsBody } from '../ui/sheet.js';
import { getRange, setRange, onRangeChange, rangeKind, timeToggleHTML, bindTimeToggle } from '../ui/time-toggle.js';

let allBrands = false;
const PO_STEP = { ordered: 0, left: 1, onway: 2, received: 3 };
const TRIP = { planned: ['neutral', 'trip.planned'], loaded: ['amber', 'trip.loaded'], left: ['blue', 'trip.left'], done: ['green', 'trip.done'] };
const trimZ = (s) => s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
const BAND = { d0_30: 'green', d31_60: 'amber', d60p: 'red' };

function hero(s, bar) {
  const hr = Number(s.clock.slice(11, 13));
  const greet = hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening';
  return `<header class="ow-hero"><div class="ow-in">
    <p class="hello tel"><b>${esc(t(`home.hello.${greet}`))}</b><span>${esc(fmtStamp(s.clock))}</span></p>
    <h1 class="q tel">${esc(t('home.q'))}</h1>
    <div class="answer num" data-bank>${inr(bar.bank)}<small class="tel">${esc(t('home.isBack'))}</small></div>
    <p class="sub tel">${t('home.of', { total: esc(inr(bar.total)), out: `<b>${esc(inr(bar.total - bar.bank))}</b>` })}</p>
  </div></header>`;
}

function tray(bar) {
  const parts = [['bank', 'green'], ['unpaid', 'amber'], ['road', 'blue'], ['godown', 'neutral']];
  let acc = 0; let roadCentre = 0;
  const segs = parts.map(([k, st]) => {
    const w = (bar[k] / bar.total) * 100;
    if (k === 'road') roadCentre = acc + w / 2;
    acc += w;
    return `<button type="button" style="flex:${bar[k]} 1 0;background:${ST[st]}" data-part="${k}" aria-label="${esc(t(`bar.${k}`))}, ${esc(inr(bar[k]))}">${k !== 'road' ? `<span class="num">${esc(inr(bar[k]))}</span>` : ''}</button>`;
  }).join('');
  const diff = bar.vsLastMonth.bank;
  return `<div class="tray">
    <h3 class="tel">${esc(t('home.where', { total: inr(bar.total) }))}</h3>
    <div class="stack" data-bar>${segs}</div>
    <div class="under"><span class="num" style="left:${roadCentre}%;color:var(--blue)">${esc(inr(bar.road))}</span></div>
    <p class="cap tel">${esc(t('bar.caption'))} <b class="num">${esc(t('home.incoming', { amount: inr(bar.incoming) }))}</b></p>
    <div class="parts">${parts.map(([k, st]) => `
      <button type="button" class="part" data-part="${k}">
        <span class="sw" style="background:${ST[st]}"></span>
        <span class="lbl tel">${esc(t(`bar.${k}`))}</span>
        <span class="pc">${Math.round((bar[k] / bar.total) * 100)}%</span>
        <span class="amt num">${esc(inr(bar[k]))}</span>
        <span class="cv">${chev}</span>
      </button>`).join('')}</div>
    <div class="better${diff < 0 ? ' less' : ''}"><span class="num">${diff < 0 ? '−' : '+'}${esc(inr(Math.abs(diff)))}</span><span class="tel">${esc(t(diff < 0 ? 'home.less' : 'home.better'))}</span></div>
  </div>`;
}

function tileHTML(tl, rk) {
  const label = ['sales', 'collected'].includes(tl.key) ? t(`tile.${tl.key}.${rk}`) : t(`tile.${tl.key}`);
  let val;
  if (tl.of != null) val = `${tl.value}<small>${esc(t('tile.of'))} ${tl.of}</small>`;
  else if (tl.key === 'lorries') val = `${tl.value}<small class="tel">${esc(t('tile.lorriesUnit'))}</small>`;
  else val = esc(inr(tl.value));
  const cmp = esc(say(tl.compare.key, tl.compare.vars));
  const arrow = (d, c) => `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style="margin-right:4px;color:${c}"><path d="${d}" fill="currentColor"/></svg>`;
  let cmpHtml;
  if (tl.status) cmpHtml = `<div class="tc flag tel" style="background:${ST[tl.status]}">${cmp}</div>`;
  else if (tl.trend === 'up') cmpHtml = `<div class="tc up tel">${arrow('M6 1l5 8H1z', 'var(--green)')}${cmp}</div>`;
  else if (tl.trend === 'down') cmpHtml = `<div class="tc down tel">${arrow('M6 11L1 3h10z', 'var(--amber)')}${cmp}</div>`;
  else cmpHtml = `<div class="tc tel">${cmp}</div>`;
  return `<button type="button" class="tile" data-tile="${tl.key}" data-label="${esc(label)}" aria-label="${esc(label)}">
    <span class="tl tel">${esc(label)}</span><span class="chev">${chev}</span>
    <span class="tv num">${val}</span>${cmpHtml}</button>`;
}

function attentionHTML(list) {
  return list.map((a, k) => `<button type="button" class="att" data-att="${k}">
    <span class="stripe" style="background:${ST[a.status]}"></span>
    <span class="body"><span class="top1">${chip(a.status, t(`ak.${a.kind}`))}${a.amount != null ? `<span class="money num">${esc(inr(a.amount))}</span>` : ''}</span><span class="txt tel">${esc(say(a.key, a.vars))}</span></span>
  </button>`).join('');
}

function comingHTML(rows) {
  const steps = ['ordered', 'left', 'onway', 'received'];
  const note = (x) => (x.step === 'ordered' ? t('po.placed', { date: fmtDay(x.at) }) : x.step === 'received' ? t('po.receivedAt', { time: fmtTime(x.at) }) : x.eta ? t('po.eta', { date: fmtDay(x.eta) }) : '');
  return `<div class="key tel">${steps.map((k) => `<span>${esc(t(`po.step.${k}`))}</span>`).join('')}</div><div class="list">${rows.map((x) => {
    const i = PO_STEP[x.step]; const col = i === 3 ? 'green' : 'blue';
    const b = BRAND.get(x.brand);
    return `<a class="bcard" href="#/owner/reports/company/${x.brand}">
      <div class="band" style="background:${b.colour}"></div>
      <div class="inb">
        <div class="row1">${logo(x.brand, b.name)}<span class="val num">${esc(inr(x.value))}</span></div>
        <div class="meta">${esc(x.poId)}${note(x) ? ` · ${esc(note(x))}` : ''}</div>
        <div class="steps">${[0, 1, 2, 3].map((n) => `<i style="${n <= i ? `background:${ST[col]}` : ''}"></i>`).join('')}</div>
        <div class="now">${chip(col, t(`po.step.${steps[i]}`))}${x.short ? chip('red', t('po.short', { n: x.short })) : ''}</div>
      </div></a>`;
  }).join('')}</div>`;
}

function goingHTML(rows) {
  return `<div class="list">${rows.map((v) => {
    const [st, word] = TRIP[v.status] || TRIP.planned;
    const dot = st === 'amber' ? 'blue' : st;
    return `<button type="button" class="card outb" data-trip="${esc(v.tripId)}">
      <div class="row1"><span class="plate-no">${esc(v.plate)}</span>${chip(st, t(word))}</div>
      <div class="who">${esc(v.driver)} · ${esc(v.towns.join(' · '))}</div>
      <div class="drops">${Array.from({ length: v.drops }, (_, n) => `<i style="${n < v.done ? `background:${ST[dot]}` : ''}"></i>`).join('')}</div>
      <div class="row3"><b class="tel">${esc(t('drops.of', { done: v.done, total: v.drops }))}</b><span class="num">${esc(inr(v.value))}</span></div>
    </button>`;
  }).join('')}</div>`;
}

function chartHTML(w) {
  const W = 340; const H = 220; const l = 44; const r = 6; const tp = 26; const b = 40;
  const pw = W - l - r; const ph = H - tp - b; const n = w.weeks.length; const gw = pw / n; const bw = 21;
  const top = Math.max(...w.Kadapa, ...w.Anantapur, 1);
  const step = [1e5, 2e5, 5e5, 1e6, 2e6, 5e6].find((x) => top / x <= 4) || 5e6;
  const max = Math.ceil(top / step) * step;
  const y = (v) => tp + ph - (v / max) * ph;
  const ticks = []; for (let v = 0; v <= max; v += step) ticks.push(v);
  const lab = getLang() === 'te' ? 'ఇప్పటివరకు' : t('dist.soFar');
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(t('dist.aria'))}">
  <defs>
    <pattern id="hk" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff"/><rect width="3.2" height="6" fill="#0F52BA"/></pattern>
    <pattern id="ha" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff"/><rect width="3.2" height="6" fill="#5B8BD8"/></pattern>
  </defs>`;
  ticks.forEach((v) => {
    s += `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" stroke="${v ? '#E6E4DD' : '#0E1A2B'}" stroke-width="${v ? 1 : 1.5}"/>`;
    s += `<text x="${l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#5A6372">${v ? `₹${trimZ((v / 1e5).toFixed(1))} L` : '0'}</text>`;
  });
  w.weeks.forEach((wk, i) => {
    const cx = l + gw * i + gw / 2; const part = w.partialLast && i === n - 1; const last = i >= n - 2;
    const k = w.Kadapa[i]; const a = w.Anantapur[i];
    const x1 = cx - bw - 1.5; const x2 = cx + 1.5;
    s += `<rect x="${x1}" y="${y(k)}" width="${bw}" height="${y(0) - y(k)}" fill="${part ? 'url(#hk)' : '#0F52BA'}" ${part ? 'stroke="#0F52BA" stroke-width="1.5"' : ''}/>`;
    s += `<rect x="${x2}" y="${y(a)}" width="${bw}" height="${y(0) - y(a)}" fill="${part ? 'url(#ha)' : '#5B8BD8'}" ${part ? 'stroke="#5B8BD8" stroke-width="1.5"' : ''}/>`;
    if (last) {
      s += `<text x="${x1 + bw / 2}" y="${y(k) - 6}" text-anchor="middle" font-size="12" font-weight="800" fill="#0E1A2B">${trimZ((k / 1e5).toFixed(1))}</text>`;
      s += `<text x="${x2 + bw / 2}" y="${y(a) - 6}" text-anchor="middle" font-size="12" font-weight="800" fill="#0E1A2B">${trimZ((a / 1e5).toFixed(1))}</text>`;
    }
    s += `<text x="${cx}" y="${H - b + 18}" text-anchor="middle" font-size="13" font-weight="${part ? 700 : 500}" fill="${part ? '#0E1A2B' : '#5A6372'}">${esc(fmtDay(wk, { weekday: false }))}</text>`;
    if (part) s += `<text x="${cx}" y="${H - b + 34}" text-anchor="middle" font-size="12" font-weight="700" fill="#0E1A2B">${esc(lab)}</text>`;
  });
  return `${s}</svg>`;
}

function districtHTML(w) {
  const tot = (a) => a.reduce((x, y) => x + y, 0);
  return `<div class="card dist">
    <div class="totals">
      <div style="border-color:var(--sapphire)"><span class="tel">${esc(t('dist.Kadapa'))}</span><b class="num">${esc(inr(tot(w.Kadapa)))}</b></div>
      <div style="border-color:#5B8BD8"><span class="tel">${esc(t('dist.Anantapur'))}</span><b class="num">${esc(inr(tot(w.Anantapur)))}</b></div>
    </div>${chartHTML(w)}
    ${w.partialLast ? `<p class="note tel">${esc(t('dist.partial', { days: w.daysInLast }))}</p>` : ''}</div>`;
}

function brandsHTML(cards) {
  const list = allBrands ? cards : cards.slice(0, 6);
  const max = cards[0]?.sold || 1;
  return `<div class="bgrid">${list.map((b) => `
    <a class="bcard" href="#/owner/reports/company/${b.key}">
      <div class="band" style="background:${b.colour}"></div>
      <div class="bg-in">${logo(b.key, b.name)}
        <div class="amt num">${esc(inr(b.sold))}</div>
        <div class="share"><i style="width:${((b.sold / max) * 100).toFixed(1)}%;background:${b.colour}"></i></div>
        ${chip(b.health, t(`health.${b.health}`))}
      </div></a>`).join('')}</div>
    <button type="button" class="more" id="moreBrands" aria-expanded="${allBrands}"><span class="tel">${esc(allBrands ? t('brands.fewer') : t('brands.all', { n: cards.length }))}</span></button>`;
}

function moneyHTML(s) {
  const bands = ['d0_30', 'd31_60', 'd60p'].map((k) => ({ k, amount: recordsBehind(s, `dues.${k}`, {}).reduce((a, r) => a + r.amount, 0) }));
  const tot = bands.reduce((a, b) => a + b.amount, 0);
  const pays = brandPaymentsWeek(s);
  return `<div class="list">
    <div class="card money-card">
      <h3 class="tel">${esc(t('dues.title'))} · <span class="num">${esc(inr(tot))}</span></h3>
      <div class="stack" style="height:52px">${bands.map((d) => `<button type="button" data-dues="${d.k}" style="flex:${Math.max(d.amount, 1)} 1 0;background:${ST[BAND[d.k]]}" class="num" aria-label="${esc(t(`dues.${d.k}`))}">${esc(inr(d.amount))}</button>`).join('')}</div>
      <div class="bands">${bands.map((d) => `<button type="button" data-dues="${d.k}"><span>${esc(t(`dues.${d.k}`))}</span>${chip(BAND[d.k], t(`age.${BAND[d.k]}`))}</button>`).join('')}</div>
    </div>
    <div class="card money-card">
      <h3 class="tel">${esc(t('dues.top'))}</h3>
      ${topDealerDues(s).map((d) => `<button type="button" class="dealer" data-dealer="${esc(d.dealerId)}" data-name="${esc(d.name)}">
        <span><span class="dn">${esc(d.name)}</span><br><span class="dt">${esc(d.town)} · <span class="tel">${esc(t('dues.oldest', { n: d.oldestDays }))}</span></span></span>
        <span><span class="da num" style="display:block">${esc(inr(d.owes))}</span><span class="dc" style="display:block;margin-top:5px">${chip(d.status, t(`age.${d.status}`))}</span></span>
      </button>`).join('')}
    </div>
    <div class="sh" style="margin-top:14px;margin-bottom:2px"><h3 class="tel" style="margin:0;font-size:17px;font-weight:700">${esc(t('brandPay.title'))}</h3><span class="side num">${esc(inr(pays.reduce((a, p) => a + p.amount, 0)))}</span></div>
    ${pays.map((p) => `<a class="bcard pay" href="#/owner/reports/company/${p.brand}">
      <span class="vb" style="background:${BRAND.get(p.brand).colour}"></span>${logo(p.brand, p.name)}
      <span><span class="pa num" style="display:block">${esc(inr(p.amount))}</span><span class="pd" style="display:block">${chip(p.late ? 'red' : 'amber', t(p.late ? 'brandPay.late' : 'brandPay.due', { date: fmtDay(p.due) }))}</span></span>
    </a>`).join('')}
  </div>`;
}

export function renderOwnerHome(el) {
  let atts = [];
  const section = (title, side, body, cls = '') => `<section class="${cls}"><div class="sh"><h2 class="tel">${esc(title)}</h2>${side ? `<span class="side tel">${side}</span>` : ''}</div>${body}</section>`;

  function html() {
    const s = getState();
    const range = getRange(); const rk = rangeKind(range);
    const bar = cycleBar(s);
    atts = attention(s);
    const inc = comingIn(s); const out = goingOut(s);
    const incTotal = inc.filter((x) => x.step !== 'received').reduce((a, x) => a + x.value, 0);
    const done = out.reduce((a, v) => a + v.done, 0); const drops = out.reduce((a, v) => a + v.drops, 0);
    return `<div class="ow">${ownerNavHTML('home')}${hero(s, bar)}
    <div class="ow-in">${tray(bar)}
      <div class="ow-main">
        <section class="full ttsec"><div data-tt>${timeToggleHTML()}</div>
          <div class="tiles">${tiles(s, { range }).map((x) => tileHTML(x, rk)).join('')}</div></section>
        ${section(t('att.title'), esc(t('att.sub')), `<div class="card" style="overflow:hidden">${attentionHTML(atts)}</div>`)}
        ${section(t('in.title'), `<span class="num">${esc(inr(incTotal))}</span>`, comingHTML(inc))}
        ${section(t('out.title'), esc(t('drops.of', { done, total: drops })), goingHTML(out))}
        ${section(t('dist.title'), esc(t('dist.weeks')), districtHTML(districtWeekly(s, {})))}
        ${section(t('brands.title'), esc(t(`range.${rk}`)), brandsHTML(brandCards(s, { range })))}
        ${section(t('money.title'), '', moneyHTML(s), 'full')}
        <section class="full"><a class="card sumlink" href="#/whatsapp/summary"><span><b class="tel">${esc(t('home.summaryLink'))}</b><span class="tel">${esc(t('home.summarySub'))}</span></span>${chev}</a></section>
      </div></div></div>`;
  }

  function render(keepFocus) {
    const y = window.scrollY;
    el.innerHTML = html();
    window.scrollTo(0, y);
    if (keepFocus) el.querySelector('[data-range][aria-checked="true"]')?.focus();
  }

  function tripSheet(tripId, from) {
    const s = getState();
    const trip = s.trips.find((x) => x.id === tripId);
    const v = s.vehicles.find((x) => x.id === trip.vehicleId);
    const rows = trip.drops.map((d) => {
      const inv = s.invoices.find((x) => x.id === d.invoiceId); const dl = s.dealers.find((x) => x.id === d.dealerId);
      return { kind: 'invoice', id: inv.id, label: `${dl.name}, ${dl.town}`, date: inv.date, status: inv.status, amount: inv.total };
    });
    openSheet({ title: v.plate, status: TRIP[trip.status]?.[0] || 'blue', big: inr(trip.value), body: `<div data-rows>${rowsBody(rows)}</div>` }, from);
  }

  function onClick(e) {
    const q = (sel) => e.target.closest(sel);
    let b;
    if ((b = q('[data-part]'))) { openRecords(`bar.${b.dataset.part}`, t(`bar.${b.dataset.part}`), { from: b }); return; }
    if ((b = q('[data-tile]'))) { openRecords(`tile.${b.dataset.tile}`, b.dataset.label, { from: b }); return; }
    if ((b = q('[data-dues]'))) { openRecords(`dues.${b.dataset.dues}`, t(`dues.${b.dataset.dues}`), { from: b, status: BAND[b.dataset.dues] }); return; }
    if ((b = q('[data-dealer]'))) { openRecords(`dealer.${b.dataset.dealer}`, b.dataset.name, { from: b, status: 'amber' }); return; }
    if ((b = q('[data-trip]'))) { tripSheet(b.dataset.trip, b); return; }
    if ((b = q('[data-att]'))) { attentionTap(atts[Number(b.dataset.att)], b); return; }
    if (q('#moreBrands')) { allBrands = !allBrands; render(); el.querySelector('#moreBrands').focus(); }
  }

  function attentionTap(a, from) {
    const s = getState();
    const go = (h) => { location.hash = h; };
    if (a.dealerId) openRecords(`dealer.${a.dealerId}`, s.dealers.find((d) => d.id === a.dealerId).name, { from, status: a.status });
    else if (a.kind === 'short') go(`#/owner/reports/company/${s.claims.find((c) => c.id === a.ref).brand}`);
    else if (a.kind === 'brand-payment') go(`#/owner/reports/company/${a.ref}`);
    else if (a.kind === 'vehicle') tripSheet(a.ref, from);
    else if (a.kind === 'stock') go(`#/owner/reports/product/${encodeURIComponent(a.ref)}`);
  }

  el.addEventListener('click', onClick);
  const offs = [bindTimeToggle(el), subscribe(() => render()), onRangeChange(() => render(true))];
  render();
  return () => { el.removeEventListener('click', onClick); offs.forEach((f) => f()); };
}
