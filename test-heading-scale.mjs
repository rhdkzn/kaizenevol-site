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
/* The page title must not merely be larger than its sections, it must read as
   a different rank. 1.3 sits below the 1.42 the narrowest phone produces. */
const MIN_RATIO = 1.3;

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
    if (r.h1 <= r.h2) { fail++; console.log(`FAIL  ${f} @ ${w}px — h1 is ${r.h1}px, "${r.which}" is ${r.h2}px`); continue; }
    /* Leading is not enough — it has to LEAD. Added 2026-09-11: index.html ran
       h1 68px against seven h2s at 58px, a ratio of 1.17, so every section
       shouted at the same volume as the page title and a prospect reported not
       knowing what to look at. The old assertion passed that page happily,
       because 68 is greater than 58. A page with no dominant size is the defect
       this file exists to catch and it could not see it. */
    const ratio = r.h1 / r.h2;
    if (ratio < MIN_RATIO) { fail++; console.log(`FAIL  ${f} @ ${w}px — h1 ${r.h1}px vs "${r.which}" ${r.h2}px is only ${ratio.toFixed(2)}x, needs ${MIN_RATIO}x`); }
    else pass++;
  }
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed — the h1 leads on every page at ${WIDTHS.join('/')}px`);
process.exit(fail ? 1 : 0);
