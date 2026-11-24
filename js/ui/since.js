// "Since this morning": the guided day sets the morning's bar here at its last step, so the owner's bar can show what moved.
// Nothing else sets it, so the normal owner home never shows it.
let base = null;
const subs = new Set();
export const getSince = () => base;
export function setSince(bar) { base = bar; subs.forEach((fn) => fn()); }
export function onSince(fn) { subs.add(fn); return () => subs.delete(fn); }
