// Breadcrumb for the drill path. crumbs: [{label, href}] ; the last one is the current page.
import { t } from '../i18n.js';
import { esc } from './common.js';

export function breadcrumbHTML(crumbs) {
  if (!crumbs.length) return '';
  return `<nav class="crumbs" aria-label="${esc(t('crumb.label'))}"><ol>${crumbs.map((c, i) => (i === crumbs.length - 1
    ? `<li><span aria-current="page">${esc(c.label)}</span></li>`
    : `<li><a href="${esc(c.href)}">${esc(c.label)}</a></li>`)).join('')}</ol></nav>`;
}
