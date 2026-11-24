// Indian money. Short form: ₹1.38 Cr, ₹44.3 L, ₹86,000. Full form: ₹1,38,00,000.
// A no-break space keeps the figure and "L" / "Cr" on one line. Never M or K.
const NBSP = ' ';
const LAKH = 1e5;
const CRORE = 1e7;

function groupIndian(whole) {
  const s = String(whole);
  if (s.length <= 3) return s;
  return s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3);
}

export function formatINR(n, opts = {}) {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new TypeError(`formatINR needs a finite number, got ${n}`);
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  const rupees = Math.round(abs);
  if (opts.full || rupees < LAKH) return `${sign}₹${groupIndian(rupees)}`;
  // 99,99,999 would round to "100.0 L", so a lakh figure that rounds up to 100 becomes crore.
  if (rupees < CRORE && (rupees / LAKH).toFixed(1) !== '100.0') return `${sign}₹${(rupees / LAKH).toFixed(1)}${NBSP}L`;
  return `${sign}₹${(rupees / CRORE).toFixed(2)}${NBSP}Cr`;
}
