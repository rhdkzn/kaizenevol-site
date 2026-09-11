/* Guards the scroll-scrubbed reveals on the section pages (kaizen-loop, what-we-run).
 *
 * Both defects this exists for shipped, passed every render inspection, and were
 * invisible in a screenshot — a page at rest looks identical whether its motion is
 * a 200px scrub or a 4px snap:
 *
 *   1. body { overflow-x: hidden } makes BODY the scroll container. A clip on one
 *      axis forces the other to compute to auto — index.html carries a comment
 *      about exactly this and uses `clip`; these pages inherited `hidden` from
 *      about.html. With body scrolling, every view() timeline resolved against a
 *      degenerate range and finished instantly: opacity pinned at 1, forever, on
 *      elements that were supposed to fade in.
 *
 *   2. animation-range: entry N% is measured against the SUBJECT's own height. An
 *      eyebrow is ~20px tall, so `entry 4% entry 26%` gave it 4px of scroll and it
 *      snapped 0 -> 1 in a single wheel notch. The fix is one named timeline per
 *      .lp-block (309-803px tall) with offsets in px, so every section scrubs over
 *      the same real distance.
 *
 * So the assertions are: the document scrolls (not the body), and a sampled element
 * shows INTERMEDIATE values across a fine scroll sweep. "It animates" is not enough
 * — a snap animates too. Only a partial value proves a scrub.
 *
 * Also asserts no prefers-reduced-motion branch, per brand/DESIGN.md: a visitor with
 * the setting on gets exactly the same motion as everyone else.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8899';
const PAGES = ['kaizen-loop.html', 'what-we-run.html', 'about.html'];

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  (ok ? pass++ : fail++);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
};

// ---- static: the reveal system itself --------------------------------------
const css = readFileSync(new URL('./interactions.css', import.meta.url), 'utf8');
check('reveals declare no motion preference',
  !/prefers-reduced-motion/.test(css.slice(css.indexOf('.lp-block'))),
  'DESIGN.md: reduce-motion visitors get the same motion');
check('blocks and closers publish a named view timeline',
  /\.lp-block,\s*\n?\s*\.motion \.lp-next \{ view-timeline-name: --lp/.test(css),
  'per-element view() gives a 20px eyebrow a 20px range');
check('block children ride --lp, not their own subject',
  !/\.motion \.lp-block [^{]*\{[^}]*animation-timeline:\s*view\(\)/.test(css));
check('an IntersectionObserver track exists for browsers without view timelines',
  /@supports not \(animation-timeline: view\(\)\)/.test(css));

// A remote BASE has to go through the agent proxy, and this Chromium negotiates a
// TLS version the proxy rejects unless it is capped - the symptom is
// ERR_CONNECTION_RESET from the browser while curl on the same URL returns 200.
const remote = !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: remote ? ['--no-sandbox', '--ssl-version-max=tls1.2'] : ['--no-sandbox'],
  ...(remote && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {})
});

for (const name of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${BASE}/${name}`, { waitUntil: 'networkidle' });
  console.log(`\n-- ${name}`);

  check(`${name}: no page errors`, errs.length === 0, errs[0] || '');

  const env = await page.evaluate(() => ({
    motion: document.documentElement.classList.contains('motion'),
    blocks: document.querySelectorAll('.lp-block').length,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    supportsView: CSS.supports('animation-timeline: view()')
  }));

  check(`${name}: motion gate is set`, env.motion,
    'transitions.js must add html.motion or nothing animates');
  check(`${name}: has reveal blocks`, env.blocks > 0, `${env.blocks} blocks`);
  // The root cause of defect 1, asserted directly so it cannot come back quietly.
  check(`${name}: body is not a scroll container`, env.bodyOverflowY !== 'auto',
    `body overflow-y computes to ${env.bodyOverflowY} — use overflow-x:clip, never hidden`);

  // The document must actually scroll. If body were the scroller this returns ~0
  // and every timeline below is meaningless.
  const reach = await page.evaluate(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: max, behavior: 'instant' });
    const got = window.scrollY;
    window.scrollTo({ top: 0, behavior: 'instant' });
    return { max, got };
  });
  check(`${name}: document scrolls to its full height`, reach.got >= reach.max - 2,
    `reached ${reach.got} of ${reach.max}`);

  if (!env.supportsView) { await page.close(); continue; }

  // ---- the actual proof: intermediate values across a fine sweep -----------
  // scroll-behavior is smooth on these pages, so every seek is explicitly instant
  // or the sample lands mid-flight and reads as a value the page never holds.
  // Sampling ONE element is not enough: the first block is above the fold and is
  // already past its range at y=0, which reads exactly like a snap. Sweep every
  // instance and require that at least one genuinely scrubs. The sweep covers the
  // page's REAL height — a hardcoded ceiling silently stops testing a longer page.
  const sweep = async (sel, prop) => {
    const max = await page.evaluate(() =>
      document.documentElement.scrollHeight - window.innerHeight);
    const step = Math.max(30, Math.round(max / 60));
    const seen = [];
    for (let y = 0; y <= max; y += step) {
      await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), y);
      await page.waitForTimeout(35);
      seen.push(await page.evaluate(([s, p]) =>
        [...document.querySelectorAll(s)].map(el => getComputedStyle(el)[p]), [sel, prop]));
    }
    if (!seen.length || !seen[0].length) return [];
    return seen[0].map((_, i) => seen.map(row => row[i]));  // one track per element
  };

  const REVEALED = ':is(.lp-block, .lp-next)';

  // about.html carries no eyebrows, so this reports n/a rather than passing quietly
  // on an empty set — a check that can be satisfied by finding nothing is not a check.
  const ebs = await sweep(`${REVEALED} .lp-eyebrow`, 'opacity');
  if (!ebs.length) {
    console.log(`  n/a   ${name}: no eyebrows on this page — headings carry the proof below`);
  } else {
    const partials = ebs.map(t => t.filter(v => Number(v) > 0.02 && Number(v) < 0.98).length);
    check(`${name}: eyebrows SCRUB rather than snap`, partials.filter(n => n >= 2).length >= 2,
      `intermediate opacity counts per eyebrow: [${partials}] (a snap gives 0)`);
    check(`${name}: eyebrows reach both ends`,
      ebs.some(t => t.some(v => Number(v) < 0.02) && t.some(v => Number(v) > 0.98)));
  }

  // Always required, on every page: the headings must genuinely scrub.
  const heads = await sweep(`${REVEALED} h2, .lp-block h3`, 'clipPath');
  const clipStates = heads.map(t => new Set(t).size);
  check(`${name}: headings are MASKED across the scroll`,
    heads.length >= 2 && clipStates.filter(n => n >= 3).length >= 2,
    `distinct clip-path states per heading: [${clipStates}] — DESIGN.md: masked, never faded`);

  // The closer is the page's most important block and had .lp-next on it with
  // nothing reading the class, so it was the one section that never moved.
  const closer = await sweep(`${REVEALED} .closing-sub`, 'opacity');
  const closerOk = closer.length === 1 && closer[0].some(v => Number(v) > 0.02 && Number(v) < 0.98);
  check(`${name}: the closing section reveals`, closerOk,
    closerOk ? '' : (closer.length === 1 ? 'closing-sub holds no intermediate opacity'
                                         : `expected 1 .closing-sub, found ${closer.length}`));

  await page.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
