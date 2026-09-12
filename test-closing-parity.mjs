/* Every page must END THE SAME WAY — the parts AND the treatment.
 *
 * Round one. Rahaid, looking at the homepage next to About: "pattern this, it's
 * not constant, even the design is different." I patterned the PARTS — a
 * heading, a 16px sub, two routes out, a seats note — and wrote into this file
 * that the homepage KEEPS its dark anchor, because brand/DESIGN.md called that
 * anchor the homepage's. So this guard went green while six pages closed light
 * and one closed dark.
 *
 * Round two, 2026-09-12: "Wait I told you make it look like this on all pages
 * and u didn't." He was right both times, and the guard agreed with me both
 * times, which is the actual defect here: it asked about the parts because the
 * parts are what I had built. Same family as the three label-not-the-thing
 * checks found the day before.
 *
 * So it now asserts the TREATMENT, and it asserts it BY COMPARISON — index is
 * the reference and every other closing must compute the same. A hardcoded
 * value would drift the moment the homepage changed; this cannot, because
 * there is only one number and it is read off the page Rahaid points at.
 *
 * DESIGN.md's palette rule is ONE DARK ANCHOR PER SURFACE. A page is the
 * surface, so a dark closing on each page is the rule kept, and the SECOND
 * check below is what keeps it: no page may carry a second dark band.
 */
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'fs';

const BASE = process.env.BASE || 'http://localhost:8899';

/* Discovered, never hand-typed. Three separate guards were found on 2026-09-11
   carrying page lists that had silently stopped matching the site. */
const PAGES = readdirSync('.')
  .filter(f => f.endsWith('.html'))
  .filter(f => /<section[^>]*class="[^"]*\bclosing\b/.test(readFileSync(f, 'utf8')))
  .sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));

if (!PAGES.includes('index.html')) {
  console.log('CANNOT RUN — index.html has no closing section to compare against.');
  process.exit(2);
}

const b = await chromium.launch({executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx = await b.newContext({viewport:{width:1280,height:900}});
let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; } else { fail++; console.log(`FAIL  ${n}${d ? '   <- ' + d : ''}`); } };

async function read(f) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${f}`, {waitUntil:'networkidle'});
  await p.evaluate(() => document.querySelector('section.closing')?.scrollIntoView({block:'center'}));
  /* Wait on the OUTCOME, not on a clock. A fixed 500ms sleep failed two of seven
     pages on one run and passed the same two on the next - a guard that is red
     half the time is a guard everyone learns to re-run. The blob fetch and first
     seek take as long as they take; the only thing worth waiting for is the flag
     scrub.js sets either way. */
  await p.waitForFunction(() => {
    const s = document.querySelector('section.closing');
    if (!s || !s.hasAttribute('data-scrub')) return true;
    return s.dataset.scrubPainted === 'true' || s.dataset.scrubFailed === 'true';
  }, {timeout: 15000}).catch(() => {});
  const r = await p.evaluate(() => {
    const s = document.querySelector('section.closing');
    if (!s) return null;
    const cs = getComputedStyle(s);
    const sub = s.querySelector('.closing-sub');
    const note = s.querySelector('.closing-note');
    const h2 = s.querySelector('h2');
    const input = s.querySelector('.ke-start input');
    const go = s.querySelector('.ke-start-go');
    const quiet = s.querySelector('.btn-quiet');
    const px = v => Math.round(parseFloat(v));
    /* Every dark band ON THE PAGE, not just this one. DESIGN.md allows exactly
       one per surface and nothing else measured it. */
    const dark = [...document.querySelectorAll('section, footer, header')].filter(el => {
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (!m || (m[3] !== undefined && Number(m[3]) < 0.9)) return false;
      const [r, g, bl] = m.map(Number);
      return (0.2126*r + 0.7152*g + 0.0722*bl) < 60;
    }).length;
    return {
      bg: cs.backgroundColor,
      padTop: px(cs.paddingTop), padBottom: px(cs.paddingBottom),
      darkBands: dark,
      media: !!s.querySelector('.scrub-media'),
      poster: !!s.querySelector('.scrub-media img'),
      video: !!s.querySelector('.scrub-video'),
      scrim: !!s.querySelector('.scrub-scrim'),
      scrubJs: !!document.querySelector('script[src*="scrub.js"]'),
      dataScrub: s.hasAttribute('data-scrub'),
      painted: s.dataset.scrubPainted === 'true',
      failed: s.dataset.scrubFailed === 'true',
      h2: !!h2, h2Size: h2 ? px(getComputedStyle(h2).fontSize) : null,
      eyebrow: !!s.querySelector('.smallcaps'),
      subs: s.querySelectorAll('.closing-sub').length,
      subSize: sub ? px(getComputedStyle(sub).fontSize) : null,
      subColor: sub ? getComputedStyle(sub).color : null,
      apply: !!s.querySelector('a[href*="apply"], form[action*="apply"]'),
      field: !!input,
      inputColor: input ? getComputedStyle(input).color : null,
      goBg: go ? getComputedStyle(go).backgroundColor : null,
      quietRadius: quiet ? px(getComputedStyle(quiet).borderTopLeftRadius) : null,
      email: !!s.querySelector('a[href^="mailto:"]'),
      note: note ? note.textContent.trim() : null,
      seats: s.querySelectorAll('.closing-note .seats i').length,
    };
  });
  await p.close();
  return r;
}

const ref = await read('index.html');
if (!ref) { console.log('CANNOT RUN — index.html served no closing section.'); process.exit(2); }

/* Contrast is computed against the section ground with the ALPHA COMPOSITED.
   Reading rgba(247,246,244,.6) as opaque white reports 18:1 for every colour in
   the section, which is how a dark-ground field shipped at 1.2:1 unnoticed. */
const parse = s => { const n = (s.match(/[\d.]+/g) || []).map(Number); return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1]; };
const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*r + 0.7152*g + 0.0722*b; };
const contrast = (fg, bg) => {
  const f = parse(fg), k = parse(bg);
  const over = [0,1,2].map(i => f[i]*f[3] + k[i]*(1-f[3]));
  const [x, y] = [lum(k.slice(0,3)), lum(over)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

for (const f of PAGES) {
  const r = f === 'index.html' ? ref : await read(f);
  if (!r) { check(`${f}: has a closing section`, false); continue; }

  // --- the treatment, measured against index rather than against a literal
  check(`${f}: closes on the same ground as the homepage`, r.bg === ref.bg, `${r.bg} vs ${ref.bg}`);
  check(`${f}: same padding as the homepage`, r.padTop === ref.padTop && r.padBottom === ref.padBottom,
        `${r.padTop}/${r.padBottom} vs ${ref.padTop}/${ref.padBottom}`);
  check(`${f}: carries the film`, r.media && r.poster && r.video && r.scrim && r.dataScrub);
  check(`${f}: loads scrub.js`, r.scrubJs);
  check(`${f}: the film actually paints`, r.painted && !r.failed, r.failed ? 'clip fetch failed' : 'no frame painted');
  check(`${f}: ONE dark band on the page, per DESIGN.md`, r.darkBands === 1, `${r.darkBands} found`);

  // --- the parts
  check(`${f}: closing has a heading`, r.h2);
  /* Deliberately NOT asserting the heading SIZE against index. Tried it; it forces
     the question pages to 31px against their own 37px h1 and test-heading-scale.mjs
     goes red - the closing must stay subordinate to the page's own headline, which
     means it scales with that page, not with the homepage. */
  check(`${f}: carries the eyebrow`, r.eyebrow);
  check(`${f}: closing uses .closing-sub`, r.subs > 0, `${r.subs} found`);
  check(`${f}: sub is 16px`, r.subSize === 16, `${r.subSize}px`);
  check(`${f}: offers the application`, r.apply);
  check(`${f}: offers the start field, not a button`, r.field);
  check(`${f}: offers email as the second route`, r.email);
  check(`${f}: the quiet link is a link, not a pill`, r.quietRadius === ref.quietRadius,
        `radius ${r.quietRadius}px vs ${ref.quietRadius}px`);
  check(`${f}: carries the seats note`, r.seats === 5, `${r.seats} marks`);
  check(`${f}: the note reads the same as everywhere else`,
        /Every seat gets both of us, start to finish\./.test(r.note || ''), r.note);

  // --- legibility ON that ground. The homepage shipped --ink on #0D0D0F here.
  for (const [name, colour, min] of [['typed text', r.inputColor, 4.5],
                                     ['the sub', r.subColor, 4.5],
                                     ['the submit disc', r.goBg, 3]]) {
    if (!colour) { check(`${f}: ${name} exists to measure`, false); continue; }
    const c = contrast(colour, r.bg);
    check(`${f}: ${name} reads on the dark ground`, c >= min, `${c.toFixed(2)}:1, need ${min}`);
  }
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed across ${PAGES.length} closings`);
process.exit(fail ? 1 : 0);
