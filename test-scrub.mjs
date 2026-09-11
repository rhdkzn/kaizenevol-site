/* Guards the scroll-scrubbed film in the closing section.
 *
 * Every failure this catches is one that looks completely fine in a screenshot:
 *
 *   A film that never SEEKS. The poster paints, the section looks right, and the
 *   scrub is simply a still image. Nothing errors. The only way to know is to
 *   scroll the page and read video.currentTime — which is what this does.
 *
 *   A film served without the Blob fetch. It "works" on a fast desktop and stalls
 *   on every scroll tick over a real connection, because seeking a range-served
 *   mp4 re-requests bytes. Checked structurally: the controller must fetch to a
 *   Blob rather than assign the URL straight to src.
 *
 *   A prefers-reduced-motion branch. brand/DESIGN.md: a visitor with the setting
 *   on gets EXACTLY the same motion as everyone else, and this beat is
 *   gesture-driven, so it is the case the file names as must-always-ship.
 *   test-reduced-motion.mjs scans the estate; this asserts it locally too, since
 *   a branch here is the single most likely place for one to reappear.
 *
 *   Copy that crosses the film's lit band. The scrim is what keeps the closing
 *   lede readable; measured, not eyeballed. Contrast is sampled from the
 *   rendered pixels behind the text, not assumed from the token.
 */
import { chromium, devices } from 'playwright';
import { readFileSync, statSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8899';
let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  (ok ? pass++ : fail++);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
};

// ---- static checks on the controller itself -------------------------------
const src = readFileSync(new URL('./scrub.js', import.meta.url), 'utf8');
const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

check('controller has no prefers-reduced-motion branch',
  !/prefers-reduced-motion/.test(codeOnly),
  'DESIGN.md: same motion for everyone');
// Bans the BEHAVIOUR, not the mechanism: a viewport-width matchMedia picking
// the mobile encode is legitimate and this must not fail on it. Only a motion
// preference is forbidden.
check('controller queries no motion preference',
  !/matchMedia\s*\(\s*['"`][^'"`]*reduced-motion/.test(codeOnly),
  'DESIGN.md: reduce-motion visitors get the same motion');
check('controller seeks a Blob, not a range-served URL',
  /createObjectURL/.test(codeOnly) && /\.blob\(\)/.test(codeOnly),
  'range-served seeking stalls on every scroll tick');
check('controller coalesces seeks through rAF',
  /requestAnimationFrame/.test(codeOnly));

// The H.264 pair cannot be exercised in this harness AT ALL: Playwright's
// bundled Chromium ships without proprietary codecs, so loop.mp4 returns
// DEMUXER_ERROR_NO_SUPPORTED_STREAMS while being a perfectly valid file.
// Proven with a control (a VP9 transcode of the same source played fine), so
// the browser checks below run on WebM and the mp4 is verified mechanically
// instead. Deleting this leaves the Safari and iOS path completely untested.
{
  // Reads the codec out of the CONTAINER rather than shelling out to ffprobe.
  // ffprobe is not installed here and is not installed on Rahaid's machine either,
  // and the old `catch { return '(unreadable)' }` turned that into four FAIL lines
  // saying the videos had the wrong codec — a guard reporting a defect that did not
  // exist, which is how all four sat red and ignored. The files were correct the
  // whole time. A byte read has no external dependency, so it gives the same answer
  // on every machine.
  //   mp4  : the sample-description box names the codec, 'avc1' for H.264
  //   webm : Matroska stores a CodecID string, 'V_VP9'
  // Only the header region is scanned, so a chance match inside compressed frame
  // data cannot vote.
  const probe = (f) => {
    const head = readFileSync(f).subarray(0, 400000);
    if (head.includes('avc1')) return 'h264';
    if (head.includes('V_VP9')) return 'vp9';
    if (head.includes('V_VP8')) return 'vp8';
    if (head.includes('hvc1') || head.includes('hev1')) return 'hevc';
    if (head.includes('av01') || head.includes('V_AV1')) return 'av1';
    return '(no codec marker in the header)';
  };
  for (const f of ['assets/loop/loop.mp4', 'assets/loop/loop-mobile.mp4']) {
    const codec = probe(new URL(f, import.meta.url).pathname);
    check(`${f} is H.264 for Safari and iOS`, codec === 'h264', `codec ${codec}`);
  }
  for (const f of ['assets/loop/loop.webm', 'assets/loop/loop-mobile.webm']) {
    const codec = probe(new URL(f, import.meta.url).pathname);
    check(`${f} is VP9`, codec === 'vp9', `codec ${codec}`);
  }
  const sizes = ['loop.webm', 'loop.mp4', 'loop-mobile.webm', 'loop-mobile.mp4']
    .map((f) => statSync(new URL(`assets/loop/${f}`, import.meta.url).pathname).size);
  const desktop = (sizes[0] + sizes[1]) / 1048576;
  const mobile = (sizes[2] + sizes[3]) / 1048576;
  check('desktop clips inside the 32 MiB budget', desktop <= 32, `${desktop.toFixed(2)} MiB`);
  check('mobile clips inside the 16 MiB budget', mobile <= 16, `${mobile.toFixed(2)} MiB`);
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
});

// ---- the film actually scrubs ---------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });

  const hasSection = await page.locator('[data-scrub]').count();
  check('closing section carries the scrub', hasSection === 1, `found ${hasSection}`);

  const poster = await page.locator('[data-scrub] .scrub-media img').count();
  check('a poster holds the frame before the film loads', poster === 1);

  // Scroll to the section and let the controller settle.
  await page.locator('[data-scrub]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);

  const early = await page.evaluate(() =>
    document.querySelector('[data-scrub] .scrub-video')?.currentTime ?? -1);

  // Scroll THROUGH the section, not to it — the scrub is driven by the
  // section's travel across the viewport, so a single scrollIntoView proves
  // nothing about whether time advances.
  await page.evaluate(() => {
    const s = document.querySelector('[data-scrub]');
    window.scrollTo(0, s.offsetTop + s.offsetHeight - window.innerHeight * 0.1);
  });
  await page.waitForTimeout(1600);

  const late = await page.evaluate(() =>
    document.querySelector('[data-scrub] .scrub-video')?.currentTime ?? -1);

  check('the film seeks as the page scrolls', late > early + 0.5,
    `currentTime ${early.toFixed(2)}s -> ${late.toFixed(2)}s`);

  const dur = await page.evaluate(() =>
    document.querySelector('[data-scrub] .scrub-video')?.duration ?? 0);
  check('the clip loaded its metadata', dur > 1, `${dur.toFixed(1)}s`);

  await ctx.close();
}

// ---- geometry, from the DOM and never from a screenshot -------------------
for (const w of [360, 390, 430, 768, 1440]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 844 },
    isMobile: w <= 430, hasTouch: w <= 430,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  const g = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }));
  check(`no horizontal overflow at ${w}px`, g.scrollW <= g.innerW,
    `scrollWidth ${g.scrollW} vs innerWidth ${g.innerW}`);
  await ctx.close();
}

// ---- the closing copy survives the film behind it -------------------------
//
// Measures the BACKGROUND, by hiding the copy and reading the pixels where the
// words were. Three earlier attempts read percentiles of a crop containing the
// text itself, which mixes glyph and ground and moves with the font as much as
// with the scrim — it reported an identical 5.10:1 with the scrim at full
// strength and at 5% opacity, i.e. a check the work could not fail.
//
// The worst case is the BRIGHTEST pixel behind the words, not the average: one
// blown highlight crossing a letter is what makes a line hard to read. Sampled
// at three points through the scrub, because the film moves and the first
// frame is the darkest one.
const TEXT_LUM = 0.906; // --page #F7F6F4, relative luminance
const srgb = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

for (const [name, opts] of [
  ['desktop', { viewport: { width: 1440, height: 900 } }],
  ['phone', { ...devices['iPhone 13'] }],
]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });

  const geom = await page.evaluate(() => {
    const el = document.querySelector('[data-scrub]');
    return { top: el.offsetTop, h: el.offsetHeight, vh: window.innerHeight };
  });

  let worst = Infinity;
  let sampled = 0;

  for (const f of [0.2, 0.5, 0.85]) {
    await page.evaluate(
      (y) => window.scrollTo(0, y),
      geom.top - geom.vh * (1 - f) + geom.h * f * 0.5
    );
    await page.waitForTimeout(1400);

    // The sample region is the INTERSECTION of three rects: the copy column,
    // the dark section, and the viewport. Clamping instead of intersecting is
    // what made an earlier version report 1.08:1 — with the section scrolled
    // past, a clamped crop started at y=0 and sampled the light nav bar and
    // the footer rather than the film.
    const rects = await page.evaluate(() => {
      const el = document.querySelector('[data-scrub] .container');
      // Union of the TEXT boxes, not the whole column. Contrast matters where
      // the glyphs are; sampling the empty margins as well makes the check
      // strict about pixels no word ever sits on, which would force a heavier
      // scrim than the design needs and kill the film.
      const nodes = [...el.querySelectorAll('h2, .lede, .smallcaps')];
      const boxes = nodes.map((n) => n.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      const c = boxes.length
        ? {
            left: Math.min(...boxes.map((b) => b.left)),
            right: Math.max(...boxes.map((b) => b.right)),
            top: Math.min(...boxes.map((b) => b.top)),
            bottom: Math.max(...boxes.map((b) => b.bottom)),
          }
        : el.getBoundingClientRect();
      const s = document.querySelector('[data-scrub]').getBoundingClientRect();
      // The sticky nav paints OVER the section, so its band is light pixels
      // sitting inside the section's rect. Excluding it is not cosmetic: it is
      // 255-white and it alone drove the measurement to 1.00:1.
      const nav = document.querySelector('header, nav, .nav, .site-nav');
      const navBottom = nav && ['fixed', 'sticky'].includes(getComputedStyle(nav).position)
        ? nav.getBoundingClientRect().bottom
        : 0;
      const x0 = Math.max(c.left, s.left, 0);
      const y0 = Math.max(c.top, s.top, 0, navBottom);
      const x1 = Math.min(c.right, s.right, window.innerWidth);
      const y1 = Math.min(c.bottom, s.bottom, window.innerHeight);
      el.style.visibility = 'hidden';
      // Scale to DEVICE pixels. getBoundingClientRect is CSS pixels; a
      // screenshot is device pixels, and iPhone 13 runs at 3x. Cropping with
      // unscaled coordinates put the sample in the top-left corner — on the
      // light nav — and reported 1.00:1. Same family as the repo's own
      // "a screenshot is not a viewport measurement" rule.
      const d = window.devicePixelRatio || 1;
      return { x: Math.round(x0 * d), y: Math.round(y0 * d),
               w: Math.round((x1 - x0) * d), h: Math.round((y1 - y0) * d) };
    });

    // A sliver tells you nothing; require a real area before trusting it.
    const rect = rects;
    const onScreen = rect.w > 40 && rect.h > 40; // device px, so this is a low bar by design
    if (onScreen) {
      const buf = await page.screenshot();
      const peak = await page.evaluate(async ({ b64, rect }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const x = rect.x, y = rect.y;
        const w = Math.min(rect.w, img.width - x), h = Math.min(rect.h, img.height - y);
        if (w <= 0 || h <= 0) return null;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.drawImage(img, x, y, w, h, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h).data;
        const vals = [];
        for (let i = 0; i < d.length; i += 4) {
          vals.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
        }
        vals.sort((a, b) => a - b);
        // 99.5th percentile rather than the single max, so one stray pixel
        // from JPEG ringing does not decide the verdict.
        return vals[Math.floor(vals.length * 0.995)];
      }, { b64: buf.toString('base64'), rect });

      if (peak !== null) {
        sampled++;
        const ratio = (TEXT_LUM + 0.05) / (srgb(peak) + 0.05);
        if (ratio < worst) worst = ratio;
      }
    }

    await page.evaluate(() => {
      document.querySelector('[data-scrub] .container').style.visibility = '';
    });
  }

  check(`${name}: sampled the background at more than one scroll point`,
    sampled >= 2, `${sampled} of 3 on screen`);
  check(`${name}: closing copy clears 4.5:1 over the brightest film frame`,
    worst >= 4.5, `worst ${worst === Infinity ? 'not measured' : worst.toFixed(2) + ':1'}`);

  /* AND THERE HAS TO BE SOMETHING TO SEE (added 2026-09-11).
   *
   * Everything above measured whether the COPY survives the film. Nothing asked
   * whether the film survives. It did not: the clip opens on black and its form
   * only emerges 39.9% in, so the first half of the scroll was a black
   * rectangle and the poster behind it was blacker still at mean 4.4 of 255.
   * Every check on this page was green and Rahaid said "I believe the black
   * page doesn't even work". He was right for a reason none of these guards
   * could see, because they all measured legibility rather than presence.
   *
   * The floor is a p95, not a mean: a dark frame with a lit form in it is the
   * whole point, an evenly black one is the defect. Measured 39 on the frame
   * the scrub now starts from, 8 on the one it used to. */
  {
    const lit = await page.evaluate(async () => {
      const src = getComputedStyle(document.querySelector('.scrub-media img')).content.match(/url\("([^"]+)"\)/)?.[1]
        || document.querySelector('.scrub-media img').currentSrc;
      const im = new Image(); im.crossOrigin = 'anonymous'; im.src = src;
      await im.decode();
      const c = document.createElement('canvas'); c.width = 160; c.height = 90;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0, 160, 90);
      const d = g.getImageData(0, 0, 160, 90).data, lum = [];
      for (let i = 0; i < d.length; i += 4) lum.push(0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]);
      lum.sort((a, b) => a - b);
      return Math.round(lum[Math.floor(lum.length * 0.95)]);
    });
    check(`${name}: the poster has a visible form in it, not just black`,
      lit >= 25, `p95 luminance ${lit} of 255`);
  }
  // Asserts the ELEMENT and that it actually carries a gradient. The previous
  // version asked whether the section had a ::before with content — which the
  // kanji watermark satisfied, so it passed for three rounds while the scrim
  // was not applying at all. A check that a DIFFERENT element can satisfy is
  // not a check.
  const scrim = await page.evaluate(() => {
    const el = document.querySelector('[data-scrub] .scrub-scrim');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundImage, z: cs.zIndex, pos: cs.position };
  });
  check(`${name}: the scrim is a real element carrying a gradient`,
    !!scrim && /gradient/.test(scrim.bg) && scrim.pos === 'absolute',
    scrim ? `z-index ${scrim.z}` : 'element missing');

  // The watermark must SURVIVE — the scrim was moved off ::before precisely so
  // it would, and a regression here is silent.
  check(`${name}: the band watermark still renders`, await page.evaluate(() =>
    getComputedStyle(document.querySelector('[data-scrub]'), '::before').backgroundImage
      .includes('url(')),
    'section.band::before carries it');

  await ctx.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
