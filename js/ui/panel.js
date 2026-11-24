// Side panel for the five staff forms: slides in from the right on a desktop, fills the screen on a tablet or phone.
// openPanel({title, sub}) returns the empty content element; the caller fills it and attaches its own listeners.
import { t } from '../i18n.js';
import { esc } from './common.js';

let scrim = null;
let opener = null;

function ensure() {
  if (scrim) return scrim;
  scrim = document.createElement('div');
  scrim.className = 'sp-scrim';
  scrim.hidden = true;
  scrim.innerHTML = '<aside class="sp" role="dialog" aria-modal="true" aria-labelledby="pnTitle"><header class="sp-head"><div><h2 id="pnTitle" class="tel"></h2><p class="sp-sub tel" hidden></p></div><button type="button" class="sp-x" data-close-panel></button></header><div class="sp-body"></div></aside>';
  document.body.append(scrim);
  scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close-panel]')) closePanel(); });
  document.addEventListener('keydown', (e) => {
    if (scrim.hidden) return;
    if (e.key === 'Escape') closePanel();
    if (e.key === 'Tab') { // keep focus inside the panel
      const f = [...scrim.querySelectorAll('button,a[href],input,select,textarea')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0]; const last = f.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener('hashchange', closePanel);
  return scrim;
}

export function closePanel() {
  if (!scrim || scrim.hidden) return;
  scrim.classList.remove('open');
  document.body.classList.remove('sp-lock');
  const back = opener;
  setTimeout(() => { if (!scrim.classList.contains('open')) scrim.hidden = true; }, 180);
  if (back && document.body.contains(back)) back.focus();
}

export function panelOpen() { return !!scrim && !scrim.hidden && scrim.classList.contains('open'); }

export function openPanel({ title, sub = '', from } = {}) {
  ensure();
  opener = from || document.activeElement;
  scrim.querySelector('#pnTitle').textContent = title;
  const subEl = scrim.querySelector('.sp-sub');
  subEl.textContent = sub; subEl.hidden = !sub;
  const x = scrim.querySelector('.sp-x');
  x.setAttribute('aria-label', t('pn.close'));
  x.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4l12 12M16 4L4 16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>';
  const body = scrim.querySelector('.sp-body');
  const inner = document.createElement('div'); // a fresh element each time, so the last form's listeners are gone
  inner.className = 'sp-in';
  body.replaceChildren(inner);
  body.scrollTop = 0;
  scrim.hidden = false;
  document.body.classList.add('sp-lock');
  requestAnimationFrame(() => { scrim.classList.add('open'); });
  return inner;
}

// A small, shared look for form results and errors.
export const errorHTML = (msg) => `<p class="fm-err tel" role="alert" data-error>${esc(msg)}</p>`;
