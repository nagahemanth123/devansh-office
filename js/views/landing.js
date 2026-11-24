// The start page: four role cards, the guided day, and Reset demo.
import { addStrings, t } from '../i18n.js';
import { esc, chev } from '../ui/common.js';
import guideStrings from '../strings/en-guide.js';
addStrings(guideStrings);

const ROLES = [['owner', '#/owner'], ['staff', '#/staff'], ['dealer', '#/dealer/D-MYD-01'], ['driver', '#/driver/demo']];

// hooks: { savedStep() -> number|null, total, onStart(), onContinue(), onReset() }
export function renderLanding(el, hooks) {
  const saved = hooks.savedStep();
  el.innerHTML = `<div class="lp">
    <section class="lp-head"><h1 class="tel">${esc(t('landing.title'))}</h1><p class="lede tel">${esc(t('landing.intro'))}</p></section>
    <section class="lp-guide" aria-labelledby="lp-g">
      <div><h2 id="lp-g" class="tel">${esc(t('landing.guide.title'))}</h2><p class="tel">${esc(t('landing.guide.sub'))}</p></div>
      <div class="lp-gbtns"><button type="button" class="lp-go" data-start-guide>${esc(t('landing.guide.go'))}</button>
      ${saved ? `<button type="button" class="lp-cont" data-continue-guide>${esc(t('landing.guide.cont', { n: saved, total: hooks.total }))}</button>` : ''}</div>
    </section>
    <ul class="roles lp-roles">${ROLES.map(([k, href]) => `<li><a class="role-link" href="${href}" data-role-card="${k}">
      <b class="tel">${esc(t(`landing.${k}`))}</b><span class="tel">${esc(t(`landing.${k}.desc`))}</span>
      <em class="lp-open tel">${esc(t('landing.open', { role: t(`landing.${k}`) }))}${chev}</em></a></li>`).join('')}</ul>
    <section class="lp-reset"><button type="button" class="lp-rbtn" data-reset>${esc(t('landing.reset'))}</button><span class="tel">${esc(t('landing.reset.sub'))}</span><p class="lp-ok tel" role="status" data-reset-note></p></section>
  </div>`;
  const click = (e) => {
    if (e.target.closest('[data-start-guide]')) hooks.onStart();
    else if (e.target.closest('[data-continue-guide]')) hooks.onContinue();
    else if (e.target.closest('[data-reset]')) {
      hooks.onReset();
      el.querySelector('[data-reset-note]').textContent = t('landing.reset.done');
      el.querySelector('[data-continue-guide]')?.remove();
    }
  };
  el.addEventListener('click', click);
  return () => el.removeEventListener('click', click);
}
