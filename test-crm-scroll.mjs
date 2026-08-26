/* Nested scroll panes on touch (found by Diego's hand-test, 2026-08-26).
 *
 * He could see his leads and could not scroll them. .leads-scroll caps at 600px
 * with its own overflow-y; a phone viewport is barely taller, so the browser
 * gives the gesture to the page and the inner list is stuck.
 *
 * This is a CLASS of bug, not one instance - any pane with a fixed max-height
 * and its own overflow-y will do the same. So the test does not check one
 * selector: it finds EVERY such pane and demands a coarse-pointer override for
 * each. A third pane added later without one fails this.
 */
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./crm.html', import.meta.url), 'utf8');
/* Scope to the <style> block. Brace-matching the whole HTML runs into the JS
   below, where braces inside strings and template literals never balance. */
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
if (!css) throw new Error('no <style> block found');

const NEST = /\.([a-zA-Z0-9_-]+)\s*\{[^}]*max-height:\s*\d+px[^}]*overflow-y:\s*auto[^}]*\}/g;
const panes = [...css.matchAll(NEST)].map(m => m[1]);

/* Take the coarse block as the text from its marker to the next @media.
   No brace matching: this stylesheet has single-line nested rules that make
   naive counting unreliable, and the test does not need that precision. */
const coarse = (() => {
  const i = css.indexOf('@media(pointer:coarse){');
  if (i < 0) return '';
  const next = css.indexOf('@media', i + 10);
  return css.slice(i, next > -1 ? next : css.length);
})();

const r = [];
const check = (n, pass, d) => r.push({ n, pass, d });

check('found the nested scroll panes', panes.length > 0, 'none matched — has the pattern changed?');
console.log(`   panes with a fixed max-height + own overflow-y: ${panes.join(', ') || '(none)'}`);
check('a coarse-pointer block exists', coarse.length > 0, 'no @media(pointer:coarse) found');

for (const p of panes) {
  const rule = new RegExp(`\\.${p}\\b[^{}]*\\{[^}]*max-height:\\s*none[^}]*\\}`);
  check(`.${p} is unnested on touch`, rule.test(coarse),
        `no max-height:none for .${p} inside @media(pointer:coarse)`);
}
/* And the override must actually release the scroll, not just the height. */
check('the override releases overflow too', /overflow-y:\s*visible/.test(coarse),
      'max-height was lifted but overflow-y still traps the gesture');

let failed = 0;
for (const x of r) { if (!x.pass) failed++; console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.n}${x.pass ? '' : '   <- ' + x.d}`); }
console.log(`\n${r.length - failed}/${r.length} passed`);
process.exit(failed ? 1 : 0);
