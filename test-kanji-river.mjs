/* Guards the 改善 ribbon (kanji.js).
 *
 * Two of its properties are load-bearing and neither is visible in a screenshot, which is
 * exactly why they get a test:
 *
 *   mix-blend-mode:multiply is the ONLY thing keeping the ribbon off the body copy. It
 *   paints on top of every content block — it has to, because .band carries an opaque
 *   background and anything behind that is simply gone. Multiply can only move a pixel
 *   toward the darker of the two inputs, so text already darker than the glyph comes out
 *   unchanged. Drop the blend mode and the site still LOOKS fine in a thumbnail while
 *   every paragraph it crosses picks up a grey wash.
 *
 *   Binding to scroll POSITION rather than velocity is what makes it reverse cleanly on
 *   the way back up, which is what Rahaid asked for. A velocity- or timer-driven version
 *   drifts: the same scroll position gives a different frame each visit. That is invisible
 *   in any single screenshot and obvious to anyone actually scrolling.
 *
 * Note for anyone extending this: the page sets html{scroll-behavior:smooth}, so
 * window.scrollTo ANIMATES. Sampling too early reads a frame mid-flight and the
 * reversibility check fails for a reason that has nothing to do with the ribbon — it cost
 * one false alarm already. Every scroll here is behavior:'instant'.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8899';
let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  (ok ? pass++ : fail++);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
});

for (const [label, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });

  const at = async y => {
    await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), y);
    await page.waitForTimeout(320);
    return page.evaluate(() => ({
      t: document.querySelector('.kz-river svg')?.style.transform ?? null,
      y: window.scrollY
    }));
  };

  const info = await page.evaluate(() => {
    const r = document.querySelector('.kz-river');
    if (!r) return null;
    const cs = getComputedStyle(r);
    return {
      tiles: r.querySelectorAll('svg').length,
      blend: cs.mixBlendMode,
      position: cs.position,
      pointer: cs.pointerEvents,
      zIndex: cs.zIndex,
      aria: r.getAttribute('aria-hidden'),
      navZ: getComputedStyle(document.querySelector('nav')).zIndex,
      horiz: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });

  check(`${label}: the ribbon is present`, !!info);
  if (info) {
    check(`${label}: it has tiles`, info.tiles > 0, `${info.tiles}`);
    check(`${label}: mix-blend-mode is multiply — this is what protects body text`,
          info.blend === 'multiply', info.blend);
    check(`${label}: fixed, so it is on screen at all times`,
          info.position === 'fixed', info.position);
    check(`${label}: pointer-events:none — scenery never eats a click`,
          info.pointer === 'none', info.pointer);
    check(`${label}: it sits under the sticky nav`,
          Number(info.zIndex) < Number(info.navZ), `${info.zIndex} < ${info.navZ}`);
    check(`${label}: aria-hidden, so a screen reader is not read decoration`,
          info.aria === 'true', String(info.aria));
    check(`${label}: no horizontal page scroll`, info.horiz === false);
  }

  const a = await at(600);
  const b = await at(1400);
  const c = await at(600);
  check(`${label}: it moves with scroll`, a.t !== b.t, `${a.t} -> ${b.t}`);
  check(`${label}: the same scroll position gives the same frame (reversible, not drifting)`,
        a.t === c.t, `${a.t} vs ${c.t}`);

  check(`${label}: no JS errors`, errors.length === 0, errors.join(' | '));
  await page.close();
}

await browser.close();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
