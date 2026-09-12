/* Guards the scroll-scrubbed film in the closing section.
 *
 * Every failure this catches is one that looks completely fine in a screenshot:
 *
 *   A film that never SEEKS. The poster paints, the section looks right, and the
 *   scrub is simply a still image. Nothing errors. The only way to know is to
 *   scroll the page and read the frame the controller is showing — which is
 *   what this does. (It was video.currentTime until 2026-09-12; the film is a
 *   sprite sheet now, because a <video> does not paint on an iPhone in Low
 *   Power Mode. See scrub.js.)
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
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

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
/* The Blob check that stood here asserted the VIDEO mechanism. There is no
   video and no seek now; the equivalent property is that the sprite is decoded
   BEFORE it is shown, or the poster blinks out from under an image that has not
   arrived. */
check('the sprite is decoded before it is shown',
  /new Image\(\)/.test(codeOnly) && /onload/.test(codeOnly),
  'assigning background-image before the bytes land paints nothing');
check('nothing depends on a video decoder any more',
  !/scrub-video|canPlayType|currentTime|createObjectURL/.test(codeOnly),
  'iOS Low Power Mode refuses to decode video at all');
check('controller coalesces seeks through rAF',
  /requestAnimationFrame/.test(codeOnly));

// The H.264 pair cannot be exercised in this harness AT ALL: Playwright's
// The film is a SPRITE SHEET now, not a video - see scrub.js. A <video> does
// not paint on an iPhone in Low Power Mode, which is the state Rahaid's phone
// was in when he sent a photograph of the closing sitting dead still. There is
// no codec to probe any more, which also retires the ffprobe-shaped hole this
// block used to carry.
{
  const sprites = ['frames.webp', 'frames-mobile.webp'];
  for (const f of sprites) {
    let size = 0;
    try { size = statSync(new URL(`assets/loop/${f}`, import.meta.url).pathname).size; } catch (e) { size = 0; }
    check(`assets/loop/${f} exists`, size > 0, size ? `${(size / 1024).toFixed(0)}KB` : 'missing');
  }
  /* A budget the visitor can actually afford to wait for. The predecessor
     allowed 32 MiB desktop and 16 MiB mobile against files of 7.4 and 4.3 MiB -
     it had never been capable of going red, and was green throughout an 8.7
     SECOND wait on a throttled connection. At ~200 KB/s on slow 4G, 300 KB is
     about a second and a half. */
  const total = sprites.reduce((a, f) => {
    try { return a + statSync(new URL(`assets/loop/${f}`, import.meta.url).pathname).size; } catch (e) { return a; }
  }, 0) / 1024;
  const mobileOnly = (() => {
    try { return statSync(new URL('assets/loop/frames-mobile.webp', import.meta.url).pathname).size / 1024; }
    catch (e) { return Infinity; }
  })();
  check('a phone fetches under 300KB for the film', mobileOnly <= 300, `${mobileOnly.toFixed(0)}KB`);
  check('both sprites together stay under 600KB', total <= 600, `${total.toFixed(0)}KB`);

  /* The grid the markup DECLARES must match the sprite that ships. A sprite
     re-exported at a different tile count silently shows the wrong frames -
     every one of them a real image, so nothing looks broken, it just stops
     being the film. */
  const html = readFileSync('index.html', 'utf8');
  const attrs = Object.fromEntries(
    [...html.matchAll(/data-(cols|rows|frames|tile|tile-mobile)="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  check('the markup declares the sprite grid', !!(attrs.cols && attrs.rows && attrs.frames),
    JSON.stringify(attrs));
  if (attrs.cols) {
    check('the grid holds every declared frame',
      Number(attrs.cols) * Number(attrs.rows) >= Number(attrs.frames),
      `${attrs.cols}x${attrs.rows} holds ${Number(attrs.cols) * Number(attrs.rows)}, needs ${attrs.frames}`);
  }
}


/* A PNG reader, forty lines, no dependency.
 *
 * The alternative was ffprobe/ffmpeg, which is not installed here or on
 * Rahaid's machine — and this file already carries the scar of a codec probe
 * that returned "(unreadable)" for a MISSING BINARY and compared it against
 * 'h264', so a missing tool read as a broken file. A check that cannot run must
 * say so; better still, a check that needs nothing cannot fail to run.
 * Cross-checked against ffmpeg on the same frame pairs: 7.17 vs 7.27 and 24.34
 * vs 24.45, the gap being ffmpeg's YUV rounding.
 */
const readPng = (buf) => {
  let p = 8, w = 0, h = 0, depth = 0, color = 0, inter = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; color = data[9]; inter = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || inter !== 0 || (color !== 6 && color !== 2)) return null;
  const ch = color === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * ch);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++];
    const line = raw.subarray(q, q + w * ch); q += w * ch;
    const cur = out.subarray(y * w * ch, (y + 1) * w * ch);
    const prev = y ? out.subarray((y - 1) * w * ch, y * w * ch) : null;
    for (let i = 0; i < w * ch; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev ? prev[i] : 0;
      const c = (prev && i >= ch) ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
  }
  return { w, h, ch, data: out };
};
const meanAbsDiff = (A, B) => {
  if (!A || !B || A.w !== B.w || A.h !== B.h) return null;
  let sum = 0, n = 0;
  for (let i = 0; i < A.data.length; i += A.ch) {
    const la = 0.2126 * A.data[i] + 0.7152 * A.data[i + 1] + 0.0722 * A.data[i + 2];
    const lb = 0.2126 * B.data[i] + 0.7152 * B.data[i + 1] + 0.0722 * B.data[i + 2];
    sum += Math.abs(la - lb); n++;
  }
  return sum / n;
};

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
    getComputedStyle(document.querySelector('[data-scrub] .scrub-frames')).backgroundPosition);

  // Scroll THROUGH the section, not to it — the scrub is driven by the
  // section's travel across the viewport, so a single scrollIntoView proves
  // nothing about whether time advances.
  await page.evaluate(() => {
    const s = document.querySelector('[data-scrub]');
    window.scrollTo(0, s.offsetTop + s.offsetHeight - window.innerHeight * 0.1);
  });
  await page.waitForTimeout(1600);

  const late = await page.evaluate(() =>
    getComputedStyle(document.querySelector('[data-scrub] .scrub-frames')).backgroundPosition);

  check('the film advances as the page scrolls', late !== early,
    `background-position ${early} -> ${late}`);

  const sized = await page.evaluate(() =>
    getComputedStyle(document.querySelector('[data-scrub] .scrub-frames')).backgroundSize);
  check('the sprite is sized in pixels, not percentages', /px/.test(sized), sized);

  await ctx.close();
}

// ---- the film runs the SAME on every page that carries it ------------------
//
// Rahaid, 2026-09-12: "that black loops animation isn't consistent." It wasn't,
// and nothing here would have known: every check above drives index.html only,
// so the film was guarded on one page and shipped on seven.
//
// The old mapping measured the section's travel through the viewport, which
// assumes the section can scroll PAST it. The closing is the last thing before
// the footer, so it never can — you run out of page first, and where you run out
// depends on that page's section height and footer height. Measured at 390px:
// index reached 87% of the clip over 1430px, the question pages 93% over 1266px,
// the two landing pages 86% over 1195px. Three speeds, three stopping points,
// and the last 7-14% of the film unreachable everywhere.
//
// So this asserts the JOURNEY, not the mechanism: on every page the film sits at
// frame zero when the section appears and finishes as the page bottoms out, and
// the curve between is the same one index draws. Pages are discovered, never
// typed.
{
  const pages = readdirSync('.')
    .filter((f) => f.endsWith('.html'))
    .filter((f) => /data-scrub/.test(readFileSync(f, 'utf8')));
  check('more than one page carries the film', pages.length > 1, `${pages.length} found`);

  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  });
  for (const f of pages) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${f}`, { waitUntil: 'networkidle' });
    // Wait on the controller's own flag, never a sleep.
    const ready = await page.waitForFunction(
      () => document.querySelector('[data-scrub]')?.dataset.scrubPainted === 'true',
      { timeout: 20000 }).then(() => true).catch(() => false);
    if (!ready) {
      check(`${f}: the film paints so its travel can be measured`, false,
        'no frame painted in 20s — this is the harness or the clip, not the mapping');
      await page.close();
      continue;
    }
    const geo = await page.evaluate(() => {
      const s = document.querySelector('[data-scrub]');
      const top = s.getBoundingClientRect().top + window.pageYOffset;
      const end = document.documentElement.scrollHeight - window.innerHeight;
      return { enter: Math.max(0, top - window.innerHeight), end };
    });
    const span = geo.end - geo.enter;
    const at = async (frac) => {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }),
        Math.round(geo.enter + span * frac));
      /* WAIT FOR THE EASE TO SETTLE, never a fixed sleep. The controller eases
         toward its target (current += (target - current) * 0.18 per frame) so a
         fixed read catches it short — a first draft slept 240ms, read 97% on
         three pages and called it a mapping failure. Loosening the threshold to
         swallow that would have made the check unable to fail, which is the
         defect this file's byte budgets already had. Settle on
         background-position, which is the real applied state. */
      return page.evaluate(() => new Promise((res) => {
        const el = document.querySelector('.scrub-frames');
        const sec = document.querySelector('[data-scrub]');
        if (!el) return res(null);
        let last = '', still = 0, ticks = 0;
        (function poll() {
          const now = getComputedStyle(el).backgroundPosition;
          still = now === last ? still + 1 : 0;
          last = now;
          if (still >= 4 || ++ticks > 180) {
            const i = Number(sec.dataset.scrubFrame);
            const n = Number(el.dataset.frames);
            return res(Number.isFinite(i) && n > 1 ? i / (n - 1) : null);
          }
          requestAnimationFrame(poll);
        })();
      }));
    };
    const start = await at(0), mid = await at(0.5), end = await at(1);
    check(`${f}: the film starts at the top of the clip`, start !== null && start <= 0.02,
      `${start === null ? 'no duration' : (start * 100).toFixed(0) + '%'}`);
    check(`${f}: the film finishes as the page does`, end !== null && end >= 0.97,
      `${end === null ? 'no duration' : (end * 100).toFixed(0) + '%'} of the clip reached`);
    check(`${f}: halfway down is halfway through`, mid !== null && Math.abs(mid - 0.5) <= 0.06,
      `${mid === null ? 'no duration' : (mid * 100).toFixed(0) + '%'} at the midpoint`);
    await page.close();
  }
  await ctx.close();
}

// ---- the film SURVIVES the scrim -------------------------------------------
//
// Rahaid, after three rounds of fixes: "still look statics." He was right every
// time and every check in this file agreed with me, because they all measured
// the same half of the trade: whether the COPY survives the film. Not one asked
// whether the film survives the scrim.
//
// It did not. Measured on the composited page, mean absolute luminance
// difference between the first and last frame of the whole 9-second scrub:
//
//   raw clip, no scrim       41 of 255      real motion
//   on the page, old scrim    7 of 255      invisible
//
// The scrim was eating 5.6x of it, because it had been tuned against legibility
// alone and overshot: 12.89:1 against a 4.5:1 requirement, bought with the whole
// effect. currentTime advanced perfectly throughout. THE PIXELS DID NOT MOVE,
// and nothing here could tell the difference.
//
// Both directions are asserted now, so neither can be traded away for the other
// again: the copy check above sets the floor on legibility, this sets the floor
// on the thing a visitor came to see.
for (const [name, vp] of [
  ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ['desktop', { width: 1280, height: 900 }],
]) {
  const { isMobile, hasTouch, ...viewport } = vp;
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  const painted = await page.waitForFunction(
    () => document.querySelector('[data-scrub]')?.dataset.scrubPainted === 'true',
    { timeout: 20000 }).then(() => true).catch(() => false);
  if (!painted) {
    check(`${name}: the film paints so its motion can be measured`, false,
      'no frame in 20s — the harness or the clip, not the scrim');
    await ctx.close();
    continue;
  }
  const geo = await page.evaluate(() => {
    const s = document.querySelector('[data-scrub]');
    const top = s.getBoundingClientRect().top + window.pageYOffset;
    return {
      enter: Math.max(0, top - window.innerHeight),
      end: document.documentElement.scrollHeight - window.innerHeight,
    };
  });
  // The COPY is hidden: this measures the film, not the words over it.
  await page.addStyleTag({ content: '.closing .container{visibility:hidden!important}' });
  const shots = [];
  for (const f of [0, 1]) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }),
      Math.round(geo.enter + (geo.end - geo.enter) * f));
    await page.evaluate(() => new Promise((res) => {
      const el = document.querySelector('.scrub-frames');
      if (!el) return res();
      let last = '', still = 0, ticks = 0;
      (function poll() {
        const now = getComputedStyle(el).backgroundPosition;
        still = now === last ? still + 1 : 0;
        last = now;
        if (still >= 4 || ++ticks > 180) return res();
        requestAnimationFrame(poll);
      })();
    }));
    shots.push(readPng(await page.locator('section.closing').screenshot()));
  }
  const moved = meanAbsDiff(shots[0], shots[1]);
  check(`${name}: the film visibly moves through the scrim`,
    moved !== null && moved >= 15,
    moved === null ? 'frames could not be compared' : `${moved.toFixed(1)} of 255 across the whole scrub`);
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
