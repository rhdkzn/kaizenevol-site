/* Every public page has exactly ONE <h1>, and every form control has an
 * accessible name.
 *
 * Written 2026-09-12 after an audit found apply.html and f.html each carrying
 * TEN <h1> elements — one per step, all nine steps living in the DOM at once —
 * and all six of their inputs relying on a placeholder alone. A placeholder is
 * not a name: it is announced as a value, it disappears the moment someone
 * types, and it leaves a screen reader saying "edit text, blank" on the two
 * pages that take our leads.
 *
 * Both defects are invisible to every other check we own. They break no layout,
 * throw no error and render identically, which is exactly why they sat there.
 *
 * The h1 rule is scoped to the DOCUMENT, not to what is visible: the eight
 * hidden steps are display:none and correctly out of the a11y tree, but a
 * crawler reads the markup, and ten h1s in one file is ten competing titles.
 */
import { chromium, devices } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8899';
const PAGES = ['index','about','what-we-run','kaizen-loop','apply','privacy',
               'tried-ads-before','can-i-do-this-myself','ads-for-musicians',
               'booked','f','404'];

/* BASE can point at the live site, which is the only way to check what a
   stranger actually gets. Chromium needs the egress proxy and TLS 1.2 to
   reach it from here; neither is used for localhost. Same pattern as
   test-contrast.mjs — pointing the proxy at localhost makes it answer for
   the local server and every assertion below reads a page that is not ours. */
const REMOTE = /^https?:\/\/(?!localhost|127\.)/.test(BASE);
const b = await chromium.launch({
  executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ...(REMOTE && process.env.HTTPS_PROXY
      ? { args: ['--ssl-version-max=tls1.2'], proxy: { server: process.env.HTTPS_PROXY } }
      : {})
});
const ctx = await b.newContext({ ...devices['iPhone 13'], ignoreHTTPSErrors: true });
let pass = 0; const fails = [];

for (const pg of PAGES) {
  const p = await ctx.newPage();
  const r = await p.goto(`${BASE}/${pg}.html`, { waitUntil: 'load' }).catch(() => null);
  if (!r) { console.log(`CANNOT RUN — ${pg}.html did not load from ${BASE}. This is the harness, not the page.`); await b.close(); process.exit(2); }
  await p.waitForTimeout(500);

  /* A page that answered is not necessarily OUR page. When the local server was
   * down, the proxy answered every request and this file reported "0 <h1>" on all
   * twelve pages — a harness failure wearing a site defect's clothes, which is the
   * exact shape verification.md bans. So prove it is ours before asserting on it. */
  const ours = await p.evaluate(() => /KaizenEvol/i.test(document.documentElement.outerHTML));
  if (!ours) { console.log(`CANNOT RUN — ${BASE}/${pg}.html served something that is not our page. Harness, not the site.`); await b.close(); process.exit(2); }

  const d = await p.evaluate(() => ({
    h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim().slice(0, 44)),
    nameless: [...document.querySelectorAll('input,textarea,select')]
      .filter(e => !['hidden','submit','button','reset'].includes(e.type))
      .filter(e => !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby'))
      .map(e => `${e.tagName.toLowerCase()}#${e.id || e.name || '(no id)'}`),
  }));

  if (d.h1.length === 1) pass++;
  else fails.push(`${pg}.html: ${d.h1.length} <h1> (want exactly 1) — ${d.h1.slice(0, 3).join(' | ')}${d.h1.length > 3 ? ' | …' : ''}`);

  if (d.nameless.length === 0) pass++;
  else fails.push(`${pg}.html: ${d.nameless.length} form control(s) with no accessible name — ${d.nameless.join(', ')}`);

  await p.close();
}
await b.close();

fails.forEach(f => console.log('FAIL ' + f));
console.log(`${pass} passed, ${fails.length} failed across ${PAGES.length} pages`);
process.exit(fails.length ? 1 : 0);
