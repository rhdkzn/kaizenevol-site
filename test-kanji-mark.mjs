/* Guards the static 改善 mark on the homepage.
 *
 * Replaces test-kanji-river.mjs, which guarded a scrolling ribbon that no longer exists.
 * Rahaid: "instead of it being an animated scroll down just have it in the background."
 * That deletion is worth recording: every defect the ribbon collected - tiles popping in
 * at partial opacity, a passthrough seam stepping at section boundaries, and a wrap that
 * swapped 改 and 善 across the whole column in one frame - was a failure of MOTION. A
 * still mark cannot have any of them.
 *
 * What is checked here, and why each one needs a machine:
 *
 *   IT MUST NOT SIT ON THE COPY. The single most repeated complaint across this whole
 *   piece of work - "it overlaps with certain text and that just don't look good". The
 *   mark is placed in a clear band made for it at the section break, and a future padding
 *   or type change could quietly close that band. Asserted geometrically.
 *
 *   IT MUST NOT ANIMATE. The brief is explicitly a still mark now.
 *
 *   overscroll-behavior-y:none. The "extra page at the bottom" was iOS rubber-band
 *   over-scroll, not document height - the document measured exactly as tall as its
 *   footer. Colouring that area only changed what the phantom looked like; killing the
 *   bounce is what removes it. Invisible in every desktop screenshot.
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
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  const r = await page.evaluate(() => {
    const m = document.querySelector('#method');
    const cs = getComputedStyle(m, '::before');
    const mRect = m.getBoundingClientRect();
    // The pseudo-element's own box, derived from the rules that place it.
    // Derived from the placement rules rather than re-stating them: absolute inside
    // #method, offset from its top by `top`, centred on that by translateY(-50%), and
    // inset from #method's right edge by `right`.
    const h = parseFloat(cs.height);
    const w = parseFloat(cs.width);
    const top = mRect.top + window.scrollY + parseFloat(cs.top) - h / 2;
    const right = mRect.right - parseFloat(cs.right);
    const box = { top, bottom: top + h, left: right - w, right };

    // Every block of running copy on the page, in document coordinates.
    const texts = [...document.querySelectorAll('p, h1, h2, h3, .smallcaps, .lede')]
      .map(e => {
        const b = e.getBoundingClientRect();
        return { top: b.top + window.scrollY, bottom: b.bottom + window.scrollY,
                 left: b.left, right: b.right, tag: e.tagName, txt: (e.textContent || '').slice(0, 28) };
      })
      .filter(b => b.bottom > b.top);

    const hits = texts.filter(b =>
      box.top < b.bottom && box.bottom > b.top && box.left < b.right && box.right > b.left);

    return {
      hasImage: /url\(/.test(cs.backgroundImage),
      isMincho: /svg/.test(cs.backgroundImage),
      animation: cs.animationName,
      transition: cs.transitionProperty,
      riverGone: !document.querySelector('.kz-river'),
      containerZ: getComputedStyle(document.querySelector('#method > .container')).zIndex,
      overscroll: getComputedStyle(document.documentElement).overscrollBehaviorY,
      docTall: document.documentElement.scrollHeight,
      footerBottom: Math.round(document.querySelector('footer').getBoundingClientRect().bottom + window.scrollY),
      hits: hits.map(h => `${h.tag} "${h.txt}"`)
    };
  });

  check(`${label}: the mark is present`, r.hasImage && r.isMincho);
  check(`${label}: it does not sit on any body copy`, r.hits.length === 0, r.hits.join(' | '));
  check(`${label}: it is static — no animation`, r.animation === 'none', r.animation);
  check(`${label}: content sits above it`, r.containerZ === '1', r.containerZ);
  check(`${label}: the scrolling ribbon is gone`, r.riverGone);
  check(`${label}: over-scroll bounce is off, so there is no phantom page`,
        r.overscroll === 'none', r.overscroll);
  check(`${label}: the document is exactly as tall as its footer`,
        r.docTall === r.footerBottom, `${r.docTall} vs ${r.footerBottom}`);
  check(`${label}: no JS errors`, errors.length === 0, errors.join(' | '));
  await page.close();
}

await browser.close();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
