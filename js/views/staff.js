// Staff desktop: a role picker, the five quick actions (always on screen), and five pages
// (inbound, outbound, orders, ledger, stock). Each page lives in its own file and is loaded on demand.
import { t } from '../i18n.js';
import { esc } from '../ui/common.js';

export const PAGES = ['inbound', 'outbound', 'orders', 'ledger', 'stock'];
export const ROLES = ['godown', 'sales', 'accounts', 'admin'];
// Sample staff behind each role; the audit trail shows these names.
const BY = { godown: { role: 'godown', name: 'Prasad' }, sales: { role: 'sales', name: 'Sandeep' }, accounts: { role: 'accounts', name: 'Lakshmi' }, admin: { role: 'admin', name: 'Ravi Kumar' } };
const ROLE_KEY = 'dm.staffRole';
const DISCOUNT = { sales: 2, admin: 5 }; // sample limits, % off the dealer rate

let roleNow = null; // used when storage is blocked
export function getRole() {
  try { const r = globalThis.localStorage?.getItem(ROLE_KEY); if (ROLES.includes(r)) return r; } catch { /* storage blocked */ }
  return roleNow || 'sales';
}
export function setRole(r) {
  if (!ROLES.includes(r)) return;
  roleNow = r;
  try { globalThis.localStorage?.setItem(ROLE_KEY, r); } catch { /* keep in memory */ }
}
export const me = () => BY[getRole()];
export const canSeeCost = () => getRole() !== 'godown'; // Godown never sees purchase rates or margins
export const discountLimit = () => DISCOUNT[getRole()] ?? 0;

// ---------- small helpers every staff form shares ----------
const ERR = {
  'insufficient stock': 'err.stock', 'eway bill needed': 'err.eway', 'allocations must equal amount': 'err.alloc',
  'more than balance': 'err.balance', 'not allowed': 'err.notAllowed',
};
export const errText = (e) => t(ERR[e?.message] || 'err.generic');
// Disables the button while the action runs. fn returns true when it worked (the button stays off, the form shows its result).
export function guarded(btn, fn) {
  if (btn.disabled) return;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  let kept = false;
  try { kept = fn() === true; } finally { if (!kept) { btn.disabled = false; btn.removeAttribute('aria-busy'); } }
}
export function showError(root, msg) {
  let box = root.querySelector('[data-error]');
  if (!box) { box = document.createElement('p'); box.className = 'fm-err tel'; box.setAttribute('role', 'alert'); box.dataset.error = ''; root.querySelector('[data-actions]')?.before(box); }
  box.textContent = msg;
  box.hidden = false;
}
export const clearError = (root) => { const b = root.querySelector('[data-error]'); if (b) b.hidden = true; };

const QUICK = [['po', 'q.po'], ['grn', 'q.grn'], ['order', 'q.order'], ['trip', 'q.trip'], ['pay', 'q.pay']];

async function openQuick(kind, from) {
  if (kind === 'po' || kind === 'grn') {
    const m = await import('./staff-inbound.js');
    return kind === 'po' ? m.openPOForm({ from }) : m.openReceiveForm({ from });
  }
  if (kind === 'order') return (await import('./staff-orders.js')).openOrderForm({ from });
  if (kind === 'trip') return (await import('./staff-outbound.js')).openTripForm({ from });
  return (await import('./staff-ledger.js')).openPaymentForm({ from });
}

const MOUNT = { inbound: './staff-inbound.js', outbound: './staff-outbound.js', orders: './staff-orders.js', ledger: './staff-ledger.js', stock: './staff-stock.js' };
const MOUNT_FN = { inbound: 'mountInbound', outbound: 'mountOutbound', orders: 'mountOrders', ledger: 'mountLedger', stock: 'mountStock' };

export function renderStaff(el, { page } = {}) {
  const current = PAGES.includes(page) ? page : 'inbound';
  let stop = null;
  let token = 0;
  el.innerHTML = `<div class="stf">
    <div class="stf-top"><div class="stf-in">
      <nav class="stf-tabs" aria-label="${esc(t('stf.pages'))}">${PAGES.map((p) => `<a class="tel" href="#/staff/${p}"${p === current ? ' aria-current="page"' : ''}>${esc(t(`stf.page.${p}`))}</a>`).join('')}</nav>
      <div class="stf-role" role="group" aria-label="${esc(t('stf.role'))}"><span class="stf-rl tel">${esc(t('stf.role'))}</span>${ROLES.map((r) => `<button type="button" data-role="${r}" aria-pressed="${r === getRole()}" class="tel">${esc(t(`stf.role.${r}`))}</button>`).join('')}</div>
      <div class="stf-quick" role="group" aria-label="${esc(t('stf.quick'))}">${QUICK.map(([k, key]) => `<button type="button" class="stf-q tel" data-quick="${k}">${esc(t(key))}</button>`).join('')}</div>
    </div></div>
    <div class="stf-page stf-in" data-page></div></div>`;
  const host = el.querySelector('[data-page]');
  const mount = async () => {
    const mine = ++token;
    if (stop) { stop(); stop = null; }
    host.replaceChildren();
    const mod = await import(MOUNT[current]);
    if (mine !== token) return;
    stop = mod[MOUNT_FN[current]](host);
  };
  const onClick = (e) => {
    const r = e.target.closest('[data-role]');
    if (r) {
      setRole(r.dataset.role);
      el.querySelectorAll('[data-role]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.role === getRole())));
      mount();
      return;
    }
    const q = e.target.closest('[data-quick]');
    if (q) openQuick(q.dataset.quick, q);
  };
  el.addEventListener('click', onClick);
  mount();
  return () => { token += 1; if (stop) stop(); el.removeEventListener('click', onClick); };
}
