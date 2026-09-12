/* Guards the mono. Everything here fails silently and looks fine in a
 * screenshot: a woff2 that 404s falls back to the platform mono and only a
 * typographer notices; a rule that lands on the wrong pages leaves the estate
 * half-converted; and applying it to body or headings would be a redesign
 * nobody asked for. */
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8899';
const PAGES = ['index','contact','apply','privacy','do-i-have-to-be-on-camera',
               'tried-ads-before','ads-for-musicians','404'];
let pass = 0, fail = 0;
const check = (l, ok, d='') => { (ok?pass++:fail++); console.log(`${ok?'PASS':'FAIL'}  ${l}${d?' — '+d:''}`); };
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{width:1440,height:900} });

// The file itself must actually be served — a 404 here degrades to the
// platform mono and every other check still passes.
// Fetched, not navigated: a woff2 navigation triggers a download in Chromium
// and throws before any assertion runs.
await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
// Read the URL out of the @font-face rule rather than hardcoding the filename: the
// mono was subset and content-hashed on 2026-09-12, and a literal '/mono.woff2' here
// went 404 while the face itself was serving perfectly. Ask whether the FONT loads,
// never whether a name still matches.
const served = await p.evaluate(async () => {
  let url = null
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules } catch { continue }
    for (const rule of rules || []) {
      if (rule.constructor.name === 'CSSFontFaceRule' && /mono/i.test(rule.style.fontFamily)) {
        const m = rule.style.src.match(/url\(["']?([^"')]+)/); if (m) url = m[1]
      }
    }
  }
  if (!url) return { status: 0, bytes: 0, url: '(no mono @font-face found)' }
  const r = await fetch(url)
  return { status: r.status, bytes: (await r.arrayBuffer()).byteLength, url }
});
check('the mono face is served', served.status === 200 && served.bytes > 5000,
  `${served.url} -> HTTP ${served.status}, ${served.bytes} bytes`);

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
  const g = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  check(`${pg}: no overflow`, g.sw <= g.iw, `${g.sw} vs ${g.iw}`);
}
// ---- what the browser ACTUALLY PAINTS, not what the CSS declares ----------
//
// Added after a real wrong report. Reading font-family off computed style said
// six public pages ran every heading in Newsreader, and that went to Rahaid as
// a brand inconsistency. It was false: an @font-face aliased upright
// "Newsreader" to manrope.woff2, so the CSS named one face and the browser
// painted another. Declared style and painted glyphs are different questions,
// and only the second is what a visitor sees.
//
// CSS.getPlatformFontsForNode is the only thing that answers it.
{
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  for (const pg of PAGES) {
    await p.goto(`${BASE}/${pg}.html`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(700);
    const { root } = await cdp.send('DOM.getDocument');
    for (const sel of ['h1', 'h2']) {
      const q = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
      if (!q.nodeId) continue;
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: q.nodeId });
      const names = fonts.map((f) => f.familyName);
      if (!names.length) continue;
      // Headings paint Manrope. A Newsreader run is expected wherever the
      // heading carries its one <em> accent; a heading painted ENTIRELY in the
      // serif is off-brand.
      const hasManrope = names.some((n) => n.startsWith('Manrope'));
      check(`${pg}: ${sel} paints Manrope`, hasManrope, names.join(', '));
      check(`${pg}: ${sel} does not paint the mono`,
        !names.some((n) => n.startsWith('JetBrains')), names.join(', '));
    }
  }
}

await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
