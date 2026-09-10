/* Guards the mono. Everything here fails silently and looks fine in a
 * screenshot: a woff2 that 404s falls back to the platform mono and only a
 * typographer notices; a rule that lands on the wrong pages leaves the estate
 * half-converted; and applying it to body or headings would be a redesign
 * nobody asked for. */
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8899';
const PAGES = ['index','about','contact','apply','privacy','can-i-do-this-myself',
               'tried-ads-before','ads-for-musicians','404'];
let pass = 0, fail = 0;
const serifHeads = [];
const check = (l, ok, d='') => { (ok?pass++:fail++); console.log(`${ok?'PASS':'FAIL'}  ${l}${d?' — '+d:''}`); };
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{width:1440,height:900} });

// The file itself must actually be served — a 404 here degrades to the
// platform mono and every other check still passes.
// Fetched, not navigated: a woff2 navigation triggers a download in Chromium
// and throws before any assertion runs.
await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
const served = await p.evaluate(async () => {
  const r = await fetch('/mono.woff2');
  return { status: r.status, bytes: (await r.arrayBuffer()).byteLength };
});
check('mono.woff2 is served', served.status === 200 && served.bytes > 5000,
  `HTTP ${served.status}, ${served.bytes} bytes`);

for (const pg of PAGES) {
  await p.goto(`${BASE}/${pg}.html`, { waitUntil:'networkidle' });
  const s = await p.evaluate(async () => {
    await document.fonts.ready;
    const fam = (el) => el ? getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g,'') : null;
    const eb = document.querySelector('.smallcaps');
    return {
      loaded: document.fonts.check('12px "JetBrains Mono"'),
      eyebrow: fam(eb),
      body: fam(document.body),
      h1: fam(document.querySelector('h1')),
      h2: fam(document.querySelector('h2')),
      hasEyebrow: !!eb,
    };
  });
  // Only assert the face LOADED where something on the page uses it. A page
  // with no label never requests the woff2, and document.fonts.check is
  // correctly false there — asserting otherwise fails a page that is fine.
  if (s.hasEyebrow) {
    check(`${pg}: the face is loaded`, s.loaded);
    check(`${pg}: eyebrow is mono`, s.eyebrow === 'JetBrains Mono', s.eyebrow);
  }

  // The risk of THIS change is the mono leaking out of its one job, so that is
  // what gets asserted. Whether a heading is Manrope or Newsreader is a
  // separate, pre-existing question — conflating the two made the guard fail
  // three pages for something the change never touched.
  check(`${pg}: body did not become mono`, s.body !== 'JetBrains Mono', s.body);
  if (s.h1) check(`${pg}: h1 did not become mono`, s.h1 !== 'JetBrains Mono', s.h1);
  if (s.h2) check(`${pg}: h2 did not become mono`, s.h2 !== 'JetBrains Mono', s.h2);
  serifHeads.push(...[['h1', s.h1], ['h2', s.h2]]
    .filter(([, f]) => f === 'Newsreader').map(([t]) => `${pg} ${t}`));
  const g = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  check(`${pg}: no overflow`, g.sw <= g.iw, `${g.sw} vs ${g.iw}`);
}
await b.close();
if (serifHeads.length) {
  console.log(`\nNOTE — headings running Newsreader rather than Manrope (pre-existing,`);
  console.log(`not caused by the mono, and against brand/DESIGN.md's one-family rule):`);
  console.log('  ' + serifHeads.join(', '));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
