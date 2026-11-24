// Activity: the audit log, newest first. Read-only on purpose: nothing here can be edited or deleted.
import { t } from '../i18n.js';
import { getState, subscribe } from '../store.js';
import { activity } from '../selectors.js';
import { esc, fmtDay, fmtTime, ownerNavHTML } from '../ui/common.js';

export function renderOwnerActivity(el) {
  function draw() {
    const rows = activity(getState(), { limit: 200 });
    let day = '';
    const items = rows.map((a) => {
      const d = a.at.slice(0, 10);
      const head = d !== day ? `<h2 class="act-day tel">${esc(fmtDay(d))}</h2>` : '';
      day = d;
      return `${head}<li class="act"><span class="at num">${esc(fmtTime(a.at))}</span>
        <span class="ab"><span class="aw tel"><b>${esc(a.by.name)}</b> · ${esc(t(`actor.${a.by.role}`))}</span><span class="as">${esc(a.summary)}</span></span>
        <span class="ak tel">${esc(t(`act.${a.action.split('.')[0]}`))}</span></li>`;
    }).join('');
    el.innerHTML = `<div class="ow">${ownerNavHTML('activity')}<div class="ow-in rep">
      <h1 class="rep-h tel">${esc(t('act.title'))}</h1>
      <p class="rep-note tel">${esc(t('act.note', { n: rows.length }))}</p>
      <ol class="actlist" data-activity>${items}</ol></div></div>`;
  }
  draw();
  return subscribe(draw);
}
