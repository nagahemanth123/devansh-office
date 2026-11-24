// Hash routes: #/ , #/owner , #/owner/reports/:lens , #/staff/:page ,
// #/owner/reports/:lens/...drill , #/owner/activity , #/owner/invoice/:id , #/dealer/:dealerId , #/driver/:driverId , #/whatsapp/:kind
// route(hash) is pure. onRoute(fn) calls fn with the current route now and on every change.
const SIMPLE = {
  owner: { name: 'owner' },
  staff: { name: 'staff', param: 'page', optional: true },
  dealer: { name: 'dealer', param: 'dealerId' },
  driver: { name: 'driver', param: 'driverId' },
  whatsapp: { name: 'whatsapp', param: 'kind' },
};

export function route(hash = '') {
  const hashText = String(hash).replace(/^#/, '');
  const parts = hashText.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  const make = (name, params = {}) => ({ name, params, hash: hashText ? `#${hashText}` : '#/' });
  if (parts.length === 0) return make('landing');
  const [head, a, b] = parts;
  if (head === 'owner') {
    if (parts.length === 1) return make('owner');
    if (a === 'reports' && b) return make('owner-report', { lens: b, rest: parts.slice(3) }); // rest = drill path after the lens
    if (a === 'activity' && parts.length === 2) return make('owner-activity');
    if (a === 'invoice' && b && parts.length === 3) return make('owner-invoice', { invoiceId: b });
    return make('unknown');
  }
  const def = SIMPLE[head];
  if (!def) return make('unknown');
  if (parts.length === 1) return def.optional ? make(def.name) : make('unknown');
  if (parts.length === 2) return make(def.name, { [def.param]: a });
  return make('unknown');
}

export function onRoute(fn) {
  const handler = () => fn(route(globalThis.location.hash));
  globalThis.addEventListener('hashchange', handler);
  handler();
  return () => globalThis.removeEventListener('hashchange', handler);
}
