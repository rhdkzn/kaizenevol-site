/* Guards the 改善 ribbon (kanji.js).
 *
 * Two of its properties are load-bearing and neither is visible in a screenshot, which is
 * exactly why they get a test:
 *
 *   The ribbon paints BEHIND content at z-index:-1, which only works because body forms a
 *   stacking context. Without that it escapes to the ROOT stacking context and body's own
 *   opaque background paints straight over it — the layer still exists, still renders, and
 *   is completely invisible. Nothing else in this file would catch that.
 *
 *   Tile opacity must reach zero before a tile is on screen. Any non-zero floor and tiles
 *   appear at partial strength the instant they enter — reported as the ribbon "changing
 *   abruptly" on scroll.
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
      bodyPos: getComputedStyle(document.body).position,
      bodyZ: getComputedStyle(document.body).zIndex,
      opacities: [...r.querySelectorAll('svg')].map(s => +s.style.opacity),
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
    // The ribbon paints BEHIND content (z-index:-1). That only works because body forms a
    // stacking context - without it the layer escapes to the ROOT context and body's own
    // opaque background paints over it. The layer still exists and still renders; it is
    // simply invisible, which no other check here would catch.
    check(`${label}: it sits behind the content, not on top of it`,
          Number(info.zIndex) < 0, info.zIndex);
    check(`${label}: body forms a stacking context, or the layer is painted out entirely`,
          info.bodyPos !== 'static' && info.bodyZ !== 'auto',
          `position:${info.bodyPos} z-index:${info.bodyZ}`);
    // A tile must reach ZERO before it is on screen. Any non-zero floor and tiles appear at
    // partial strength the moment they enter, which reads as the ribbon jumping.
    check(`${label}: tiles fade to zero at the edges, so nothing pops in`,
          Math.min(...info.opacities) === 0,
          `min opacity ${Math.min(...info.opacities)}`);
    check(`${label}: fixed, so it is on screen at all times`,
          info.position === 'fixed', info.position);
    check(`${label}: pointer-events:none — scenery never eats a click`,
          info.pointer === 'none', info.pointer);
    check(`${label}: aria-hidden, so a screen reader is not read decoration`,
          info.aria === 'true', String(info.aria));
    check(`${label}: no horizontal page scroll`, info.horiz === false);
  }

  // Measured off Diego's mockup: glyph height 349px in an 858px viewport = 41% of viewport
  // width, ink reaching x=1074 of 1075 so it runs OFF THE RIGHT. Three builds were tuned by
  // eye against that image and all three missed one or both — 2.3x oversized, and clipped on
  // the wrong side so the character sat inside the page with clear air at the screen edge.
  // Eyeballing a reference has failed enough times to earn an assertion.
  const geom = await page.evaluate(() => {
    const s = document.querySelector('.kz-river svg').getBoundingClientRect();
    return { w: s.width, right: s.right, vw: window.innerWidth };
  });
  check(`${label}: the character bleeds off the RIGHT edge, not into the page`,
        geom.right > geom.vw + 1,
        `glyph right ${Math.round(geom.right)} vs viewport ${geom.vw}`);
  check(`${label}: glyph is at the reference scale, not oversized`,
        geom.w / geom.vw <= 0.45,
        `${Math.round(geom.w / geom.vw * 100)}% of viewport width (reference 41%)`);

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
