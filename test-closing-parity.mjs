/* Every page must end the same way.
 *
 * Rahaid, looking at the homepage next to About: "pattern this, it's not
 * constant, even the design is different." It was not. Five pages carried a
 * heading, a 16px sub, two routes out and a seats note; the homepage carried an
 * eyebrow, three 20px .lede paragraphs, one inline field and no note. Nothing
 * enforced the shape, so the moment one page was edited the set drifted.
 *
 * The homepage KEEPS its dark anchor and its own heading — brand/DESIGN.md
 * calls for exactly one dark anchor at the foot of the homepage, and it is the
 * answer to the "you don't know what to look at" feedback. What this guard
 * checks is the PARTS, not the palette.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8899';
/* kaizen-loop.html added 2026-09-11. It carries its own heading and eyebrow -
   Rahaid's exception, after the reference's [04 / NEXT STEP] - so it is exactly
   the page most likely to drift out of the pattern, which is the argument for
   guarding it rather than against. What this file checks is the PARTS. */
const PAGES = ['index.html','ads-for-musicians.html',
               'tried-ads-before.html','can-i-do-this-myself.html','kaizen-loop.html'];

const b = await chromium.launch({executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx = await b.newContext({viewport:{width:1280,height:900}});
let pass = 0, fail = 0;
const check = (n, ok, d) => { if (ok) { pass++; } else { fail++; console.log(`FAIL  ${n}${d ? '   <- ' + d : ''}`); } };

for (const f of PAGES) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${f}`, {waitUntil:'networkidle'});
  await p.evaluate(() => document.querySelector('section.closing')?.scrollIntoView({block:'center'}));
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const s = document.querySelector('section.closing');
    if (!s) return null;
    const sub = s.querySelector('.closing-sub');
    const note = s.querySelector('.closing-note');
    return {
      h2: !!s.querySelector('h2'),
      subs: s.querySelectorAll('.closing-sub').length,
      subSize: sub ? Math.round(parseFloat(getComputedStyle(sub).fontSize)) : null,
      apply: !!s.querySelector('a[href*="apply"], form[action*="apply"]'),
      email: !!s.querySelector('a[href^="mailto:"]'),
      note: note ? note.textContent.trim().replace(/^\s*/, '') : null,
      seats: s.querySelectorAll('.closing-note .seats i').length,
    };
  });
  await p.close();
  if (!r) { check(`${f}: has a closing section`, false); continue; }
  check(`${f}: closing has a heading`, r.h2);
  check(`${f}: closing uses .closing-sub`, r.subs > 0, `${r.subs} found`);
  check(`${f}: sub is 16px`, r.subSize === 16, `${r.subSize}px`);
  check(`${f}: offers the application`, r.apply);
  check(`${f}: offers email as the second route`, r.email);
  check(`${f}: carries the seats note`, r.seats === 5, `${r.seats} marks`);
  check(`${f}: the note reads the same as everywhere else`,
        /Every seat gets both of us, start to finish\./.test(r.note || ''), r.note);
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed across ${PAGES.length} closings`);
process.exit(fail ? 1 : 0);
