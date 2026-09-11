/* The serif appears more than once on a real page, and never more than the mono.
 *
 * Rahaid, 2026-09-11, looking at the reference beside ours: "I just want it to
 * appear more but less than the mono." That is the rule, and it replaces
 * DESIGN.md's older "one phrase per page".
 *
 * The old rule was not wrong when it was written - it was aimed at the serif
 * becoming decoration - but measured across the estate it had reduced the third
 * face to a single word on six of nine pages, while the mono ran to twenty uses
 * on one of them. A voice used once per page is not a voice, it is a typo.
 *
 * His phrasing is better than a fixed cap because it is RELATIVE: it scales with
 * how instrumented a page is. A dense page earns more of it; a two-label page
 * does not. So this checks a band rather than a number.
 *
 *   always            serif < mono
 *   where mono >= 4   serif >= 2
 *
 * Form pages are exempt BY SHAPE, not by name. A page showing no h2 and no h3 has
 * no headings for an accent to sit in - that is what a one-question form looks
 * like. The first version listed apply.html by hand, and f.html shipped hours
 * later from another session and landed red on main: a guard scoped by a list is
 * a guard somebody has to remember to update. Measured on the estate the split is
 * clean - forms show 0 h2 and 0 h3, every content page shows at least one.
 *
 * Placement is not mechanised on purpose. DESIGN.md says headings only, on the
 * last words of a line; a guard that counted would happily pass an italic dropped
 * into the middle of a paragraph, which is exactly the decoration the old rule
 * was written against. The count is checkable, the judgement is not.
 */
import { chromium } from 'playwright';
import { readdirSync } from 'fs';

const BASE = process.env.BASE || 'http://localhost:8899';
const SKIP = new Set(['crm.html','dashboard.html','portal.html','onboard.html','booked.html',
                      '404.html','hero-lab.html','motion-lab.html','lab-cta.html','showcase-home.html']);
const pages = readdirSync('.').filter(f => f.endsWith('.html') && !SKIP.has(f));

const REMOTE = /^https?:\/\/(?!localhost|127\.)/.test(BASE);
const b = await chromium.launch({
  executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ...(REMOTE && process.env.HTTPS_PROXY
      ? { args: ['--ssl-version-max=tls1.2'], proxy: { server: process.env.HTTPS_PROXY } }
      : {})
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
let pass = 0, fail = 0;

for (const f of pages) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${f}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
    const headings = [...document.querySelectorAll('h2,h3')].filter(vis).length;
    let mono = 0, serif = 0;
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length || !el.textContent.trim()) continue;
      const rc = el.getBoundingClientRect();
      if (rc.width < 2 || rc.height < 2) continue;
      const s = getComputedStyle(el);
      const fam = s.fontFamily.split(',')[0].replace(/["']/g, '');
      if (/Mono/i.test(fam)) mono++;
      else if (/Newsreader/i.test(fam) && s.fontStyle === 'italic') serif++;
    }
    /* Every accent must sit inside a heading. */
    const stray = [...document.querySelectorAll('em')]
      .filter(e => !e.closest('h1,h2,h3'))
      .map(e => e.textContent.trim().slice(0, 30));
    return { mono, serif, stray, headings };
  });
  await p.close();

  if (r.headings === 0) { pass++; continue; }   /* a form: nothing to carry an accent */
  if (r.serif >= r.mono) { fail++; console.log(`FAIL  ${f} — serif ${r.serif} is not fewer than mono ${r.mono}`); }
  else pass++;
  if (r.mono >= 4 && r.serif < 2) { fail++; console.log(`FAIL  ${f} — serif used ${r.serif}x on a page running ${r.mono} mono labels; it needs at least 2`); }
  else pass++;
  if (r.stray.length) { fail++; console.log(`FAIL  ${f} — serif accent outside a heading: ${r.stray.join(' | ')}`); }
  else pass++;
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed — the serif appears more than once and always less than the mono`);
process.exit(fail ? 1 : 0);
