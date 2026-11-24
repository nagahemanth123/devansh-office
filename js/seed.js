// The starting day, built the same way every reset. Brands and products are real; dealers, staff,
// vehicles, prices and money are sample. About 2½ months of history are played through the store's own
// rules (mulberry32(20261124)), so every total is computed from records, never typed in.
// The history is scripted around the guided day (spec §6): see GUIDED at the bottom.
import { CATALOG } from './data/catalog.js';
import { rules } from './store.js';
import { PRODUCT, orderTotals, invoiceBalance, dealerOwes, addDays, weekdayOf, daysBetween, r2 } from './selectors.js';

export function mulberry32(a) {
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sample trade terms per brand (owner only). Purchase and dealer rates are discounts off MRP.
export const BRAND_TERMS = {
  parryware: { purchaseDiscPct: 40, dealerDiscPct: 33, creditDays: 15, leadDays: 3, rebatePct: 1.5, scheme: 'Quarterly volume rebate', weight: 22.9 },
  finolex: { purchaseDiscPct: 46, dealerDiscPct: 40, creditDays: 10, leadDays: 4, rebatePct: 1.0, scheme: 'Monthly target incentive', weight: 19.1 },
  ultravolt: { purchaseDiscPct: 44, dealerDiscPct: 38, creditDays: 14, leadDays: 2, rebatePct: 1.25, scheme: 'Coil volume discount', weight: 16.2 },
  goldmedal: { purchaseDiscPct: 38, dealerDiscPct: 31, creditDays: 12, leadDays: 5, rebatePct: 2.0, scheme: 'Festive season scheme', weight: 11.6 },
  kenstar: { purchaseDiscPct: 30, dealerDiscPct: 24, creditDays: 12, leadDays: 4, rebatePct: 1.0, scheme: 'Pre-season booking rebate', weight: 8.6 },
  'sparsh-pearl': { purchaseDiscPct: 42, dealerDiscPct: 35, creditDays: 15, leadDays: 2, rebatePct: 1.5, scheme: 'Quarterly volume rebate', weight: 6.3 },
  poddar: { purchaseDiscPct: 45, dealerDiscPct: 39, creditDays: 10, leadDays: 2, rebatePct: 1.0, scheme: 'Truck-load discount', weight: 5.4 },
  sentini: { purchaseDiscPct: 45, dealerDiscPct: 39, creditDays: 10, leadDays: 2, rebatePct: 1.0, scheme: 'Truck-load discount', weight: 4.5 },
  victura: { purchaseDiscPct: 36, dealerDiscPct: 29, creditDays: 21, leadDays: 3, rebatePct: 2.5, scheme: 'New-dealer launch rebate', weight: 3.2 },
  acebond: { purchaseDiscPct: 40, dealerDiscPct: 32, creditDays: 15, leadDays: 3, rebatePct: 1.5, scheme: 'Quarterly volume rebate', weight: 2.2 },
};

export function purchaseRate(productId) {
  const p = PRODUCT.get(productId);
  return Math.max(1, Math.round(p.mrp * (1 - BRAND_TERMS[p.brand].purchaseDiscPct / 100)));
}
export function dealerRate(productId) {
  const p = PRODUCT.get(productId);
  return Math.max(1, Math.round(p.mrp * (1 - BRAND_TERMS[p.brand].dealerDiscPct / 100)));
}

// ---------- people and vehicles (sample) ----------
const STAFF = [
  ['S01', 'Ravi Kumar', 'admin'],
  ['S02', 'Prasad', 'godown'], ['S03', 'Naveen', 'godown'], ['S04', 'Hari', 'godown'], ['S05', 'Gopal', 'godown'], ['S06', 'Chinna', 'godown'],
  ['S07', 'Kiran', 'sales'], ['S08', 'Sandeep', 'sales'], ['S09', 'Lokesh', 'sales'], ['S10', 'Anil', 'sales'], ['S11', 'Vamsi', 'sales'], ['S12', 'Bhaskar', 'sales'],
  ['S13', 'Lakshmi', 'accounts'], ['S14', 'Padma', 'accounts'], ['S15', 'Swathi', 'accounts'], ['S16', 'Raghu', 'accounts'],
];
const ON_LEAVE = new Set(['S06', 'S14']);

const DRIVERS = [['DR1', 'Ramesh'], ['DR2', 'Suresh'], ['DR3', 'Naresh'], ['DR4', 'Mahesh'], ['DR5', 'Venkatesh']];
// Each vehicle runs one route: A Proddatur, B Kadapa side, C Jammalamadugu–Mydukur–Badvel, D Pulivendula, E Anantapur district.
const VEHICLES = [
  ['V1', 'AP 04 TU 5521', 'Tata 407', 'DR1', 'B'], ['V2', 'AP 04 TV 1187', 'Ashok Leyland Dost', 'DR2', 'C'],
  ['V3', 'AP 39 U 2204', 'Eicher Pro 2049', 'DR3', 'E'], ['V4', 'AP 04 TS 9032', 'Mahindra Bolero Pik-Up', 'DR4', 'D'],
  ['V5', 'AP 39 T 7716', 'Tata Ace', 'DR5', 'A'],
];

const TOWNS = {
  PDT: ['Proddatur', 'Kadapa', 'A', 'S09'], KDP: ['Kadapa', 'Kadapa', 'B', 'S07'], KML: ['Kamalapuram', 'Kadapa', 'B', 'S08'],
  YGL: ['Yerraguntla', 'Kadapa', 'B', 'S08'], JMD: ['Jammalamadugu', 'Kadapa', 'C', 'S10'], MYD: ['Mydukur', 'Kadapa', 'C', 'S08'],
  BDV: ['Badvel', 'Kadapa', 'C', 'S08'], PUL: ['Pulivendula', 'Kadapa', 'D', 'S10'],
  ATP: ['Anantapur', 'Anantapur', 'E', 'S11'], TDP: ['Tadipatri', 'Anantapur', 'E', 'S11'], GTL: ['Guntakal', 'Anantapur', 'E', 'S12'],
  GTY: ['Gooty', 'Anantapur', 'E', 'S12'], KDG: ['Kalyandurg', 'Anantapur', 'E', 'S12'], RYD: ['Rayadurg', 'Anantapur', 'E', 'S12'],
  URV: ['Uravakonda', 'Anantapur', 'E', 'S12'],
};
const STREETS = ['Main Bazaar', 'Gandhi Road', 'Station Road', 'Bus Stand Road', 'Market Street', 'Court Road', 'Old Town Road'];
const MIX = { P: 'parryware', F: 'finolex', U: 'ultravolt', G: 'goldmedal', K: 'kenstar', S: 'sparsh-pearl', D: 'poddar', N: 'sentini', V: 'victura', A: 'acebond' };

const LIMIT_SCALE = 2; // the table's limits, doubled to suit the sample order sizes
// id | name | payment habit | size | credit limit (₹ lakh) | credit days | brand mix
const DEALERS = `
D-PDT-01|Sri Venkata Sai Electricals|prompt|2.0|8|30|UGKV
D-PDT-02|Lakshmi Narasimha Hardware|cash|1.5|5|21|FDNA
D-PDT-03|Sri Rama Sanitary & Tiles|regular|1.8|7|30|PSA
D-PDT-04|Srinivasa Pipes Centre|prompt|1.2|4|21|FDN
D-PDT-05|Annapurna Electricals|cash|1.0|3|15|UGV
D-KDP-01|Venkateswara Hardware|slow|2.2|8|30|PFSA
D-KDP-02|Sri Kanaka Durga Traders|regular|1.6|6|30|UGK
D-KDP-03|Mahalakshmi Sanitary House|prompt|1.8|6|30|PS
D-KDP-04|Sri Balaji Electricals|cash|1.3|4|21|UGV
D-KDP-05|Kadapa Pipe House|regular|1.5|5|30|FDN
D-PUL-01|Sri Lakshmi Electricals|late|2.0|6|30|UGKP
D-PUL-02|Sri Chakra Hardware|prompt|1.1|4|21|FNA
D-PUL-03|Vijaya Sanitary|cash|0.9|3|15|PS
D-JMD-01|Sri Sai Electricals|prompt|1.5|5|30|UGK
D-JMD-02|Gandikota Hardware|regular|1.2|4|30|FDA
D-JMD-03|Sri Krishna Pipes|cash|0.9|3|15|FN
D-BDV-01|Sri Anjaneya Traders|regular|1.0|4|30|PFU
D-BDV-02|Badvel Electricals|cash|0.8|3|15|UG
D-MYD-01|Sri Durga Electricals|scripted|1.4|6|30|PUGF
D-MYD-02|Mydukur Hardware Stores|prompt|1.0|4|21|FDN
D-MYD-03|Sri Vinayaka Sanitary|regular|0.9|3|30|PS
D-YGL-01|Sri Ramakrishna Electricals|cash|1.0|3|15|UGK
D-YGL-02|Yerraguntla Pipe Centre|regular|1.0|4|30|FN
D-KML-01|Sri Siddhi Vinayaka Hardware|prompt|1.0|4|21|PFA
D-KML-02|Kamalapuram Electricals|cash|0.8|3|15|UGV
D-ATP-01|Sri Sai Krishna Hardware|regular|2.0|8|30|PFDA
D-ATP-02|Anantha Sanitary World|prompt|2.0|8|30|PSK
D-ATP-03|Sri Venkateswara Pipes|cash|1.5|5|21|FDN
D-ATP-04|Sri Lakshmi Ganapathi Electricals|prompt|1.6|6|30|UGVK
D-TDP-01|Sai Ram Sanitary|slow|1.6|6|30|PSD
D-TDP-02|Tadipatri Hardware Mart|regular|1.2|4|30|FNA
D-TDP-03|Sri Bhavani Electricals|cash|1.0|3|15|UGK
D-GTL-01|Balaji Pipes & Fittings|regular|2.0|7|30|FDNS
D-GTL-02|Guntakal Electricals|prompt|1.2|4|21|UGV
D-GTL-03|Sri Manjunatha Hardware|slow|1.0|4|30|PFA
D-GTY-01|Gooty Fort Traders|cash|0.9|3|15|FUG
D-GTY-02|Sri Ranganatha Sanitary|regular|0.9|3|30|PS
D-KDG-01|Sri Hanuman Hardware|prompt|0.8|3|21|FDA
D-RYD-01|Rayadurg Electricals|cash|0.8|3|15|UGK
D-URV-01|Sri Gavisiddeswara Traders|regular|0.8|3|30|PFN`.trim().split('\n').map((row, k) => {
  const [id, name, habit, size, limitL, days, mix] = row.split('|');
  const [town, district, route, sp] = TOWNS[id.slice(2, 5)];
  return {
    id, name, town, district, route, address: `${STREETS[k % STREETS.length]}, ${town}`, phone: `+91 00000 ${String(10101 + k).padStart(5, '0')}`,
    creditLimit: id === 'D-MYD-01' ? 600000 : Number(limitL) * 100000 * LIMIT_SCALE, creditDays: Number(days), salespersonId: sp, habit, size: Number(size), brandMix: [...mix].map((c) => MIX[c]),
  };
});

// ---------- the guided day (spec §6). Later tasks drive exactly these records. ----------
const gLines = (rows, rate) => rows.map(([productId, qty]) => ({ productId, qty, rate: rate(productId) }));
const G_PO_LINES = gLines([
  ['goldmedal-gifa-mini-10ax-switch', 200], ['goldmedal-hush-flo-bldc-ceiling-fan', 60], ['goldmedal-gati-400-neo-ceiling-fan', 50],
  ['goldmedal-grace-15w-cob-downlight', 80], ['goldmedal-quadro-15w-panel-light', 150], ['goldmedal-airfy-neo-exhaust-fan', 40],
], purchaseRate);
const G_ORDER_LINES = gLines([
  ['parryware-casa-coupled-closet', 6], ['parryware-elite-ewc', 10], ['parryware-agate-pro-basin-mixer', 8],
  ['ultravolt-greencore-hr-fr-lf-house-wire', 18], ['ultravolt-safeplus-fr-lsh-lf-house-wire', 10],
], dealerRate);
const G_TOTAL = orderTotals(G_ORDER_LINES).total;

export const GUIDED = Object.freeze({
  poId: 'PO-2611-041', brand: 'goldmedal', poLines: G_PO_LINES,
  shortProductId: 'goldmedal-gifa-mini-10ax-switch', shortQty: 10,
  receiveLines: G_PO_LINES.map((l) => (l.productId === 'goldmedal-gifa-mini-10ax-switch'
    ? { productId: l.productId, received: l.qty - 10, short: 10, damaged: 0 }
    : { productId: l.productId, received: l.qty, short: 0, damaged: 0 })),
  dealerId: 'D-MYD-01', orderLines: G_ORDER_LINES, orderTotal: G_TOTAL,
  vehicleId: 'V2', driverId: 'DR2', otp: '4721', ewayBill: '3412 7781 9025',
  paymentMode: 'upi', paymentAmount: Math.round(G_TOTAL / 2), paymentRef: 'UPI 432918876512',
  by: {
    owner: { role: 'owner', name: 'Owner' }, godown: { role: 'godown', name: 'Prasad' }, sales: { role: 'sales', name: 'Sandeep' },
    dispatch: { role: 'godown', name: 'Hari' }, driver: { role: 'driver', name: 'Suresh' }, accounts: { role: 'accounts', name: 'Lakshmi' },
    admin: { role: 'admin', name: 'Ravi Kumar' },
  },
});
const GUIDED_ORDER_IDS = new Set(G_ORDER_LINES.map((l) => l.productId));

// ---------- history tuning (sample business size: about ₹1.4 Cr of goods a month) ----------
const HISTORY_DAYS = 75;
const ORDER_CHANCE = 0.24;   // per dealer per working day
const ORDER_BASE = 128000;    // ₹ before GST, times the dealer's size
const GROWTH = 0.004;        // orders grow about 0.4% a day: a business that is growing
const CADENCE = 3;           // days between POs to one brand
const SAFETY = 1;            // days of extra stock kept for movers
const MONDAY_RUSH = 0.5;     // yesterday: dealers restocked after Sunday, so today's lorries are full
const MAX_LINE_QTY = 400;    // fittings are cheap; nobody orders 3,000 end caps at once
const CLOCK = '08:10';

const at = (day, hhmm) => `${day}T${hhmm}`;
const hm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

function emptyState(today) {
  return {
    v: 1, today, clock: at(today, CLOCK), rev: 0, seq: {},
    brandTerms: Object.fromEntries(Object.entries(BRAND_TERMS).map(([k, { weight, ...t }]) => [k, t])),
    // D-MYD-01's payments are scripted below; on its card it is a "regular" payer.
    dealers: DEALERS.map(({ route, size, ...d }) => ({ ...d, habit: d.habit === 'scripted' ? 'regular' : d.habit })),
    vehicles: VEHICLES.map(([id, plate, kind, driverId, route]) => ({ id, plate, kind, driverId, route })),
    drivers: DRIVERS.map(([id, name], k) => ({ id, name, phone: `+91 00000 ${String(20101 + k).padStart(5, '0')}` })),
    staff: STAFF.map(([id, name, role]) => ({ id, name, role, present: !ON_LEAVE.has(id) })),
    pos: [], bills: [], grns: [], lots: [], claims: [], brandPayments: [], orders: [], invoices: [], trips: [], payments: [], queries: [], audit: [],
    damagedStock: {}, scriptedOtps: {},
  };
}

export function seed(today = '2026-11-24') {
  // One seed, split into streams, so each part of the history keeps its own random sequence.
  const root = mulberry32(20261124);
  const stream = () => mulberry32(Math.floor(root() * 4294967296));
  const rW = stream(); const rR = stream(); const rP = stream(); const rM = stream();
  const rD = new Map(DEALERS.map((d) => [d.id, stream()]));
  const pick = (list, r = rM) => list[Math.floor(r() * list.length)];
  const weighted = (r, items, w) => { let x = r() * items.reduce((a, i) => a + w(i), 0); for (const i of items) { x -= w(i); if (x <= 0) return i; } return items.at(-1); };
  const s = emptyState(today);
  const start = addDays(today, -HISTORY_DAYS);
  const logFrom = addDays(today, -1);
  const staffBy = (id) => { const x = s.staff.find((m) => m.id === id); return { role: x.role, name: x.name }; };
  const ADMIN = staffBy('S01'); const GODOWN = [staffBy('S02'), staffBy('S03')]; const DISPATCH = staffBy('S04'); const ACCOUNTS = [staffBy('S13'), staffBy('S15')];
  const driverBy = (id) => ({ role: 'driver', name: s.drivers.find((d) => d.id === id).name });
  const ctx = (moment, by, extra) => ({ at: moment, by, log: moment.slice(0, 10) >= logFrom, ...extra });
  const dealerById = new Map(DEALERS.map((d) => [d.id, d]));

  // Demand: per brand, half the products move (a few fast), a fifth move slowly, the rest sit as dead stock.
  const weight = new Map();
  for (const b of CATALOG.brands) {
    const list = CATALOG.products.filter((p) => p.brand === b.key && !GUIDED_ORDER_IDS.has(p.id));
    for (let k = list.length - 1; k > 0; k -= 1) { const j = Math.floor(rW() * (k + 1)); [list[k], list[j]] = [list[j], list[k]]; }
    const movers = Math.ceil(list.length * 0.5); const slow = Math.ceil(list.length * 0.2);
    list.forEach((p, k) => weight.set(p.id, k < 4 ? 3 + rW() * 2 : k < movers ? 0.5 + rW() * 1.5 : k < movers + slow ? 0.06 : 0));
  }
  const brandProducts = new Map(CATALOG.brands.map((b) => [b.key, CATALOG.products.filter((p) => weight.get(p.id) > 0 && p.brand === b.key).map((p) => p.id)]));
  // Expected units a day per product, cut the same way orders are cut (about 4 lines, capped quantities).
  const dailyQty = new Map();
  for (const d of DEALERS) {
    const linesPerDay = ORDER_CHANCE * 4 * (6 / 7);
    const lineValue = (ORDER_BASE * d.size) / 4;
    const wsum = d.brandMix.reduce((a, b) => a + BRAND_TERMS[b].weight, 0);
    for (const b of d.brandMix) {
      const ids = brandProducts.get(b); const psum = ids.reduce((a, id) => a + weight.get(id), 0);
      for (const id of ids) {
        const qty = Math.min(MAX_LINE_QTY, Math.max(1, Math.round(lineValue / dealerRate(id))));
        dailyQty.set(id, (dailyQty.get(id) || 0) + linesPerDay * (BRAND_TERMS[b].weight / wsum) * (weight.get(id) / psum) * qty);
      }
    }
  }

  // Opening stock on the first day.
  for (const p of CATALOG.products) {
    if (GUIDED_ORDER_IDS.has(p.id)) continue;
    const e = dailyQty.get(p.id) || 0;
    const w = weight.get(p.id);
    const qty = w >= 0.5 ? Math.ceil(e * (CADENCE + BRAND_TERMS[p.brand].leadDays + SAFETY + 2)) : w > 0 ? Math.ceil(e * 75) + 1 : 2 + Math.floor(rW() * 9);
    if (qty > 0) s.lots.push({ id: `L-OPEN-${s.lots.length + 1}`, grnId: null, productId: p.id, brand: p.brand, date: start, at: at(start, '08:00'), qty, cost: purchaseRate(p.id), left: qty });
  }

  // Events by day: [time, order, fn]. The day loop also adds orders, trips and POs.
  const queue = new Map();
  let n = 0;
  const later = (day, time, fn) => { if (day > today) return; if (!queue.has(day)) queue.set(day, []); queue.get(day).push([time, n += 1, fn]); };
  const workday = (day) => (weekdayOf(day) === 0 ? addDays(day, 1) : day);
  const onOrder = new Map();
  const stockOf = (pid) => s.lots.reduce((a, l) => a + (l.productId === pid ? l.left : 0), 0);

  // ----- brands: POs, the lorry's steps, receipt (sometimes short), the bill paid on its due date -----
  const guidedStocked = new Set();
  function placePO(day, brand) {
    const t = BRAND_TERMS[brand];
    const lines = [];
    const grow = 1 + GROWTH * (daysBetween(start, day) - HISTORY_DAYS / 2);
    for (const pid of brandProducts.get(brand)) {
      const e = (dailyQty.get(pid) || 0) * grow;
      if (weight.get(pid) < 0.5 || e === 0) continue;
      const target = e * (CADENCE + t.leadDays + SAFETY);
      const position = stockOf(pid) + (onOrder.get(pid) || 0);
      if (position < target - e * CADENCE * 0.5) lines.push({ productId: pid, qty: Math.ceil(target - position) });
    }
    if (!guidedStocked.has(brand) && day >= addDays(today, -15) && (brand === 'parryware' || brand === 'ultravolt')) {
      guidedStocked.add(brand);
      for (const g of G_ORDER_LINES) if (PRODUCT.get(g.productId).brand === brand) lines.push({ productId: g.productId, qty: Math.ceil(g.qty * 2.4) });
    }
    if (!lines.length) return;
    const po = rules.createPO(s, brand, lines, ctx(at(day, '11:00'), pick(GODOWN)));
    for (const l of po.lines) onOrder.set(l.productId, (onOrder.get(l.productId) || 0) + l.qty);
    schedulePO(po, day, t.leadDays);
  }
  function schedulePO(po, day, lead) {
    later(addDays(day, 1), '09:30', () => { rules.advancePO(s, po.id, null, ctx(at(addDays(day, 1), '09:30'), pick(GODOWN))); scheduleBill(po); });
    const onway = lead >= 2 ? addDays(day, lead) : addDays(day, 1);
    later(onway, lead >= 2 ? '07:00' : '15:00', () => rules.advancePO(s, po.id, null, ctx(at(onway, lead >= 2 ? '07:00' : '15:00'), pick(GODOWN))));
    const recv = workday(addDays(day, lead + 1));
    later(recv, '11:30', () => {
      const lines = po.lines.map((l) => {
        if (GUIDED_ORDER_IDS.has(l.productId)) return { productId: l.productId, received: l.qty, short: 0, damaged: 0 };
        const short = rR() < 0.025 ? 1 + Math.floor(rR() * Math.min(5, Math.max(1, l.qty / 4))) : 0;
        const damaged = !short && rR() < 0.012 ? Math.min(l.qty, 1 + Math.floor(rR() * 2)) : 0;
        return { productId: l.productId, received: l.qty - short, short, damaged };
      });
      const grn = rules.receivePO(s, po.id, lines, 'lorry-photo.jpg', ctx(at(recv, '11:30'), pick(GODOWN)));
      for (const l of po.lines) onOrder.set(l.productId, onOrder.get(l.productId) - l.qty);
      if (grn.claimId) { const settle = addDays(recv, 20); later(settle, '16:00', () => { const c = s.claims.find((x) => x.id === grn.claimId); c.status = 'settled'; c.settledAt = at(settle, '16:00'); }); }
    });
  }
  function scheduleBill(po) {
    const bill = s.bills.find((b) => b.poId === po.id);
    const due = workday(bill.due);
    later(due, '12:00', () => {
      const claims = s.claims.filter((c) => c.poId === po.id).reduce((a, c) => a + c.amount, 0);
      rules.payBrand(s, po.brand, r2(bill.amount - claims), ctx(at(due, '12:00'), pick(ACCOUNTS)));
    });
  }

  // ----- dealers: orders, and payments planned by habit -----
  const PLANS = {
    cash: () => [[1 + Math.floor(rP() * 2), 1]],
    prompt: () => [[3 + Math.floor(rP() * 6), 1]],
    regular: () => [[20 + Math.floor(rP() * 16), 1]],
    slow: () => [[30 + Math.floor(rP() * 16), 0.5], [55 + Math.floor(rP() * 21), 1]],
    late: () => [[60 + Math.floor(rP() * 21), 0.6], [110, 1]],
  };
  const MODES = { cash: ['cash', 'upi'], prompt: ['upi'], regular: ['cheque', 'cheque', 'upi'], slow: ['cheque', 'cash'], late: ['cash', 'cheque'] };
  const habitOf = (d, day) => (d.id === 'D-JMD-01' && day >= addDays(today, -55) ? 'regular' : d.habit); // started paying slower
  const dropped = (d, brand, day) => d.id === 'D-KDP-01' && brand === 'parryware' && day >= addDays(today, -47); // stopped buying Parryware
  const plans = new Map(); // day -> dealerId -> [{invoiceId, frac}]

  function planPayments(d, inv) {
    const habit = habitOf(d, inv.date);
    if (habit === 'scripted') return;
    for (const [days, frac] of PLANS[habit]()) {
      const day = workday(addDays(inv.date, days));
      if (day >= today) continue;
      if (!plans.has(day)) plans.set(day, new Map());
      const m = plans.get(day);
      if (!m.has(d.id)) { m.set(d.id, []); later(day, hm(660 + Math.floor(rP() * 360)), () => payDealer(d, day, m.get(d.id))); }
      m.get(d.id).push({ invoiceId: inv.id, frac });
    }
  }
  function pay(d, day, time, mode, allocations, ref) {
    if (!allocations.length) return null;
    const amount = r2(allocations.reduce((a, x) => a + x.amount, 0));
    const p = rules.recordPayment(s, d.id, { mode, amount, allocations, ref }, ctx(at(day, time), pick(ACCOUNTS)));
    if (mode === 'cheque') { const clear = workday(addDays(day, 2)); later(clear, '15:00', () => { if (p.status === 'pending') rules.setCheque(s, p.id, 'cleared', ctx(at(clear, '15:00'), pick(ACCOUNTS))); }); }
    return p;
  }
  function payDealer(d, day, entries) {
    const allocations = [];
    for (const e of entries) {
      const inv = s.invoices.find((x) => x.id === e.invoiceId);
      const bal = invoiceBalance(inv);
      const amt = e.frac >= 1 ? bal : Math.min(bal, Math.round(inv.total * e.frac));
      if (amt > 0) allocations.push({ invoiceId: inv.id, amount: amt });
    }
    const mode = pick(MODES[habitOf(d, day)], rP);
    pay(d, day, '13:00', mode, allocations, mode === 'cheque' ? `CHQ ${100000 + Math.floor(rP() * 900000)}` : mode === 'upi' ? `UPI ${Math.floor(rP() * 1e12)}` : null);
  }

  function placeOrder(d, day, time, value, lineCount) {
    const lines = [];
    const r = rD.get(d.id);
    const mix = d.brandMix.filter((b) => !dropped(d, b, day));
    for (let k = 0; k < lineCount; k += 1) {
      const brand = weighted(r, mix, (b) => BRAND_TERMS[b].weight);
      const pid = weighted(r, brandProducts.get(brand), (id) => weight.get(id));
      if (lines.some((l) => l.productId === pid)) continue;
      const qty = Math.min(stockOf(pid), MAX_LINE_QTY, Math.max(1, Math.round(value / lineCount / dealerRate(pid))));
      if (qty > 0) lines.push({ productId: pid, qty, rate: dealerRate(pid) });
    }
    if (!lines.length) return null;
    const by = staffBy(d.salespersonId);
    const res = rules.createOrder(s, d.id, lines, ctx(at(day, time), by));
    const inv = res.invoice || rules.approveCredit(s, res.order.id, ctx(at(day, time), ADMIN));
    planPayments(d, inv);
    return inv;
  }

  // ----- dispatch: yesterday's invoices go out by route each morning -----
  const ROUTE_VEHICLE = Object.fromEntries(VEHICLES.map(([id, , , driverId, route]) => [route, { vehicleId: id, driverId }]));
  function dispatch(day, script) {
    const waiting = s.invoices.filter((i) => i.status === 'waiting' && i.date < day);
    for (const route of ['A', 'B', 'C', 'D', 'E']) {
      const invs = waiting.filter((i) => dealerById.get(i.dealerId).route === route);
      const plan = script ? script[route] : { load: '07:30', left: '08:00', deliver: invs.length };
      if (!invs.length || !plan) continue;
      const { vehicleId, driverId } = ROUTE_VEHICLE[route];
      const value = invs.reduce((a, i) => a + i.total, 0);
      const ewayBill = value > 50000 ? `${3400 + Math.floor(rM() * 500)} ${1000 + Math.floor(rM() * 9000)} ${1000 + Math.floor(rM() * 9000)}` : null;
      const trip = rules.createTrip(s, { vehicleId, driverId, invoiceIds: invs.map((i) => i.id), ewayBill }, ctx(at(day, plan.load), DISPATCH));
      rules.markLoaded(s, trip.id, ctx(at(day, plan.load), DISPATCH));
      if (!plan.left) continue;
      rules.markLeft(s, trip.id, ctx(at(day, plan.left), driverBy(driverId)));
      const deliver = Math.min(invs.length, typeof plan.deliver === 'number' ? plan.deliver : Math.ceil(invs.length * plan.deliver));
      let mins = Number(plan.left.slice(0, 2)) * 60 + Number(plan.left.slice(3)) + 25;
      for (const d of trip.drops.slice(0, deliver)) {
        mins += script ? 18 : 35 + Math.floor(rM() * 30);
        rules.markDelivered(s, trip.id, d.invoiceId, { photo: 'delivery-photo.jpg', otp: d.otp }, ctx(at(day, hm(mins)), driverBy(driverId)));
      }
    }
  }

  // ----- the scripted dealers around the guided day -----
  const MYD = dealerById.get('D-MYD-01');
  const mydOrderDays = new Set([2, 8, 15, 21, 27, 33, 40, 46, 52, 57, 63, 69].map((k) => workday(addDays(start, k))));
  const payOldest = (dealerId, upTo, amount) => {
    const out = []; let left = amount;
    for (const inv of s.invoices.filter((i) => i.dealerId === dealerId && i.date <= upTo && invoiceBalance(i) > 0)) {
      if (left <= 0) break;
      const a = Math.min(left, invoiceBalance(inv)); out.push({ invoiceId: inv.id, amount: a }); left = r2(left - a);
    }
    return out;
  };
  const mydPayAll = (day, upTo, mode, ref) => later(day, '12:30', () => {
    const amt = s.invoices.filter((i) => i.dealerId === MYD.id && i.date <= upTo).reduce((a, i) => a + invoiceBalance(i), 0);
    pay(MYD, day, '12:30', mode, payOldest(MYD.id, upTo, amt), ref);
  });
  mydPayAll(addDays(start, 32), addDays(start, 20), 'cheque', 'CHQ 204417');
  mydPayAll(addDays(start, 54), addDays(start, 33), 'upi', 'UPI 318820045126');
  const mydSettle = addDays(today, -4);
  later(mydSettle, '12:40', () => {
    const owes = dealerOwes(s, MYD.id);
    if (owes < 210000) throw new Error(`seed: D-MYD-01 owes only ${owes}`);
    pay(MYD, mydSettle, '12:40', 'upi', payOldest(MYD.id, today, r2(owes - 210000)), 'UPI 377105562819');
  });

  const SAIRAM = dealerById.get('D-TDP-01');
  const chequeDay = addDays(today, -6);
  let bounced = null;
  later(chequeDay, '15:10', () => {
    const allocations = payOldest(SAIRAM.id, today, 86000);
    if (r2(allocations.reduce((a, x) => a + x.amount, 0)) !== 86000) throw new Error('seed: Sai Ram Sanitary owes under ₹86,000');
    bounced = rules.recordPayment(s, SAIRAM.id, { mode: 'cheque', amount: 86000, allocations, ref: 'CHQ 552190' }, ctx(at(chequeDay, '15:10'), ACCOUNTS[0]));
  });
  later(addDays(today, -3), '11:20', () => rules.setCheque(s, bounced.id, 'bounced', ctx(at(addDays(today, -3), '11:20'), ACCOUNTS[0])));

  // The guided PO: Goldmedal, ordered four days ago, left the brand's godown yesterday.
  later(addDays(today, -4), '10:40', () => {
    const po = rules.createPO(s, GUIDED.brand, G_PO_LINES, ctx(at(addDays(today, -4), '10:40'), GODOWN[0], { id: GUIDED.poId }));
    later(addDays(today, -1), '16:20', () => { rules.advancePO(s, po.id, null, ctx(at(addDays(today, -1), '16:20'), GODOWN[0])); });
  });

  // Sri Lakshmi Electricals, Pulivendula: a new order waits, ₹1.9 L over the credit limit.
  const LAKSHMI = s.dealers.find((d) => d.id === 'D-PUL-01');
  later(addDays(today, -1), '17:40', () => {
    // One line per brand he buys: the product with the most stock, about ₹30,000 each.
    const lines = LAKSHMI.brandMix.map((b) => brandProducts.get(b).filter((id) => weight.get(id) >= 0.5).sort((x, y) => stockOf(y) * dealerRate(y) - stockOf(x) * dealerRate(x))[0])
      .map((productId) => ({ productId, qty: Math.min(stockOf(productId), Math.ceil(30000 / dealerRate(productId))), rate: dealerRate(productId) })).filter((l) => l.qty > 0);
    const total = orderTotals(lines).total;
    LAKSHMI.creditLimit = Math.round((dealerOwes(s, LAKSHMI.id) + total - 190000) / 10000) * 10000;
    const res = rules.createOrder(s, LAKSHMI.id, lines, ctx(at(addDays(today, -1), '17:40'), staffBy(LAKSHMI.salespersonId)));
    if (!res.needsApproval) throw new Error('seed: Sri Lakshmi order should wait for approval');
  });

  // ----- play the days -----
  for (let day = start; day < today; day = addDays(day, 1)) {
    const sunday = weekdayOf(day) === 0;
    const k = daysBetween(start, day);
    if (!sunday && day > start) later(day, '07:30', () => dispatch(day));
    if (!sunday) {
      CATALOG.brands.forEach((b, j) => { if ((k + j) % CADENCE === 0) later(day, '11:00', () => placePO(day, b.key)); });
      for (const d of DEALERS) {
        if (d.id === MYD.id) {
          if (mydOrderDays.has(day)) later(day, '11:15', () => placeOrder(d, day, '11:15', 90000, 4));
          continue;
        }
        if (d.id === 'D-PUL-01' && day === addDays(today, -1)) continue;
        const r = rD.get(d.id);
        if (r() < (day === addDays(today, -1) ? MONDAY_RUSH : ORDER_CHANCE)) {
          const time = hm(600 + Math.floor(r() * 480));
          const value = ORDER_BASE * d.size * (0.6 + r() * 0.8) * (1 + GROWTH * (k - HISTORY_DAYS / 2));
          const count = 2 + Math.floor(r() * 5);
          later(day, time, () => placeOrder(d, day, time, value, count));
        }
      }
    }
    for (const [, , fn] of (queue.get(day) || []).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]))) fn();
    queue.delete(day);
  }

  // ----- this morning, up to 8:10 am -----
  for (const [, , fn] of (queue.get(today) || []).filter((e) => e[0] <= CLOCK).sort((a, b) => (a[0] < b[0] ? -1 : 1))) fn();
  dispatch(today, {
    A: { load: '06:30', left: '06:45', deliver: 0.5 },    // Proddatur: under way
    B: { load: '06:05', left: null },                     // Kadapa side: loaded, has not left
    D: { load: '06:20', left: '06:35', deliver: 1 },      // Pulivendula: under way
    E: { load: '05:40', left: '06:00', deliver: 0.4 },    // Anantapur district: under way
    // C waits for V2, which takes the guided order later today.
  });

  s.scriptedOtps = { [GUIDED.dealerId]: GUIDED.otp };
  return s;
}
