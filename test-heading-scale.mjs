/* The page title must be the largest text on the page, at every width.
 *
 * about.html failed this on every phone and nobody saw it, because it looks
 * fine on a desktop and the two rules involved are 180 lines apart. The phone
 * media query DID carry `h2 { font-size: clamp(26px, 8vw, 36px) }` — it just
 * could not reach `.sect-head h2` or `.closing h2`, which outrank a bare tag
 * selector, so both kept their desktop floors of 32px and 34px against an h1
 * scaled down to 31px. At 360px the closing heading was 4px larger than the
 * title of the page.
 *
 * A specificity loss is invisible: no error, no warning, and the rule sits
 * right there in the file looking like it works. That is why this is measured
 * off computed styles rather than read.
 */
import { chromium } from 'playwright';
import { readdirSync } from 'fs';

const BASE = process.env.BASE || 'http://localhost:8899';
/* Gated or internal surfaces have their own layouts and no marketing h1. */
const SKIP = new Set(['crm.html','dashboard.html','portal.html','onboard.html',
                      'hero-lab.html','motion-lab.html','lab-cta.html','showcase-home.html']);
const pages = readdirSync('.').filter(f => f.endsWith('.html') && !SKIP.has(f));
const WIDTHS = [360, 390, 430, 768, 1440];

const b = await chromium.launch({executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
let pass = 0, fail = 0;
for (const w of WIDTHS) {
  const ctx = await b.newContext({viewport:{width:w,height:844}, ...(w < 500 ? {isMobile:true,hasTouch:true} : {})});
  for (const f of pages) {
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${f}`, {waitUntil:'domcontentloaded'});
    const r = await p.evaluate(() => {
      const sz = e => e ? Math.round(parseFloat(getComputedStyle(e).fontSize)) : null;
      const h1 = document.querySelector('h1');
      const h2 = [...document.querySelectorAll('main h2')].map(e => ({ s: sz(e), t: e.textContent.trim().slice(0,30) }));
      const top = h2.sort((a,b) => b.s - a.s)[0];
      return { h1: sz(h1), h2: top ? top.s : null, which: top ? top.t : null };
    });
    await p.close();
    if (!r.h1 || r.h2 === null) continue;
    if (r.h1 > r.h2) { pass++; }
    else { fail++; console.log(`FAIL  ${f} @ ${w}px — h1 is ${r.h1}px, "${r.which}" is ${r.h2}px`); }
  }
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed — the h1 leads on every page at ${WIDTHS.join('/')}px`);
process.exit(fail ? 1 : 0);
