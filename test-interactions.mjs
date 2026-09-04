/* Guards interactions.css — the press behaviour and the cross-page transitions.
 *
 * Everything here fails SILENTLY and looks perfect in a screenshot, which is the whole
 * reason it is a test:
 *
 *   A DUPLICATE view-transition-name aborts the entire transition. No console error, no
 *   warning, no visual clue except that the page cuts instead of moving. Found live on
 *   index, about, contact and privacy: each carries the same logo mark in the FOOTER as
 *   well as the nav, so an unscoped `.nav-logo img` matched two elements and the
 *   transition never ran on the four pages that matter most.
 *
 *   -webkit-tap-highlight-color left at its default paints a grey box over whatever you
 *   touch on iOS, on top of and out of sync with the press animation. Invisible on desktop
 *   and invisible in any screenshot taken on desktop.
 *
 *   touch-action other than manipulation costs ~300ms on every mobile tap while the
 *   browser waits to see if a double-tap zoom is coming. The animation can be perfect and
 *   the button still feels broken.
 *
 * The press itself is checked by forcing :active through CDP, because Playwright's own
 * locators wait for actionability and the hero CTAs start at opacity 0 until the entrance
 * animation runs — which made a naive mouse.down() test hang rather than fail.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8899';
const PAGES = ['index.html', 'about.html', 'contact.html', 'privacy.html',
               'apply.html', 'local.html', 'kaizenforge.html', '404.html'];

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  (ok ? pass++ : fail++);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']
});

for (const name of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const failed = [];
  // /_vercel/* is injected by the platform and only exists on a deployment, so it 404s
  // against the local static server by design. Excluded rather than the check weakened.
  page.on('response', r => {
    const u = new URL(r.url());
    if (r.status() >= 400 && u.host === new URL(BASE).host && !u.pathname.startsWith('/_vercel/'))
      failed.push(`${r.url()} ${r.status()}`);
  });
  await page.goto(`${BASE}/${name}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(320);

  const info = await page.evaluate(() => {
    const names = {};
    document.querySelectorAll('*').forEach(el => {
      const v = getComputedStyle(el).viewTransitionName;
      if (v && v !== 'none') names[v] = (names[v] || 0) + 1;
    });
    const clickable = document.querySelector('.btn-solid, a, button');
    const cs = clickable ? getComputedStyle(clickable) : null;
    return {
      linked: [...document.styleSheets].some(s => (s.href || '').includes('interactions.css')),
      dups: Object.entries(names).filter(([, c]) => c > 1),
      named: Object.keys(names),
      tap: cs && cs.webkitTapHighlightColor,
      touch: cs && cs.touchAction
    };
  });

  check(`${name}: interactions.css is linked and parsed`, info.linked);
  check(`${name}: no duplicate view-transition-name (a duplicate aborts the transition)`,
        info.dups.length === 0, JSON.stringify(info.dups));
  check(`${name}: the page is named for a transition`,
        info.named.includes('root'), info.named.join(','));
  check(`${name}: tap highlight is transparent`,
        /rgba\(0, 0, 0, 0\)|transparent/.test(info.tap || ''), info.tap);
  check(`${name}: touch-action is manipulation, so taps are not delayed`,
        info.touch === 'manipulation', info.touch);
  check(`${name}: no failed same-origin requests`, failed.length === 0, failed.join(', '));

  // SMOOTHNESS OF THE PAGE TRANSITION. None of this is visible in a screenshot, and four
  // successive versions of this check passed while the transition was broken.
  //
  // The incoming page must be OPAQUE and must COVER the outgoing one. That single property
  // is what this asserts, because it is what makes both known failure modes impossible:
  //   - it cannot double-expose, because an opaque page has nothing showing through it
  //   - it cannot blink, because the outgoing page stays behind it until it is covered
  // Four earlier versions all animated opacity on the two full-page snapshots and all four
  // failed. ::view-transition-new paints ABOVE ::view-transition-old, so that mechanism has
  // exactly one slider on it: too much gap gives an empty screen (recorded: contrast 3.9%
  // of peak, four blank frames), too little gives two legible headlines at once (recorded
  // at +160ms). Tuning moved the bug along the slider and never off it.
  //
  // A timing is the wrong thing to assert here - any duration can be tuned back into a bug.
  // The absence of opacity in the incoming keyframes cannot.
  //
  // Also checked: speculation rules prerender the next page on hover or pointer-down.
  // Without them the transition cannot begin until the new document has been fetched, so
  // the press is followed by a dead pause no animation can cover.
  const smooth = await page.evaluate(() => {
    let inFades = null, inTravel = null, outMoves = null;
    for (const sheet of document.styleSheets) {
      try {
        for (const r of sheet.cssRules) {
          if (r.type !== CSSRule.KEYFRAMES_RULE) continue;
          if (r.name === 'ke-page-in') {
            inFades = [...r.cssRules].some(k => k.style.opacity !== '');
            for (const k of r.cssRules) {
              const m = /translateY\((-?[\d.]+)(%|px)\)/.exec(k.style.transform || '');
              if (m) inTravel = { n: Math.abs(parseFloat(m[1])), unit: m[2] };
            }
          }
          if (r.name === 'ke-page-out')
            outMoves = [...r.cssRules].some(k => /translate/.test(k.style.transform || ''));
        }
      } catch (e) { /* cross-origin sheet */ }
    }
    // The incoming snapshot only covers if the page ground behind it is opaque. A
    // transparent body would let the outgoing page read straight through the "opaque" page
    // and put the double exposure back with no CSS change to blame it on.
    const bg = getComputedStyle(document.body).backgroundColor;
    const opaqueGround = !/rgba\([^)]*,\s*0?\.?\d*\s*\)$/.test(bg) || /,\s*1\s*\)$/.test(bg);

    const s = document.querySelector('script[type="speculationrules"]');
    let spec = null;
    try { spec = s ? JSON.parse(s.textContent) : null; } catch (e) { spec = 'PARSE ERROR'; }
    return { inFades, inTravel, outMoves, bg, opaqueGround,
             eagerness: spec && spec !== 'PARSE ERROR' ? spec.prerender?.[0]?.eagerness : spec };
  });
  check(`${name}: the incoming page never animates opacity (this is what stops both bugs)`,
        smooth.inFades === false, `ke-page-in touches opacity: ${smooth.inFades}`);
  // It has to cross the whole viewport, or there is a strip at the top it never covers and
  // the outgoing page shows through it.
  check(`${name}: the incoming page travels a full viewport and covers the old one`,
        !!smooth.inTravel && smooth.inTravel.unit === '%' && smooth.inTravel.n >= 100,
        `translateY ${smooth.inTravel ? smooth.inTravel.n + smooth.inTravel.unit : 'none'}, needs >= 100%`);
  check(`${name}: the outgoing page moves behind it (or the slide reads as a flat cut)`,
        smooth.outMoves === true, String(smooth.outMoves));
  check(`${name}: the page ground is opaque, so the cover actually covers`,
        smooth.opaqueGround === true, smooth.bg);
  check(`${name}: speculation rules prerender the next page`,
        smooth.eagerness === 'moderate', String(smooth.eagerness));

  // The press. Forced via CDP rather than a real click: the hero CTAs are opacity:0 until
  // the entrance animation runs, so an actionability-based locator waits forever.
  const btn = await page.$('.btn-solid');
  if (btn) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.btn-solid' });
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['active'] });
    await page.waitForTimeout(220);
    const pressed = await page.evaluate(() => getComputedStyle(document.querySelector('.btn-solid')).transform);
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
    const m = /matrix\(([\d.]+)/.exec(pressed);
    check(`${name}: a button visibly presses`, !!m && Number(m[1]) < 0.995, pressed);
  }

  await page.close();
}

// EVERY NAV CONTROL MUST PRESS, and buttons must press as buttons. The nav's Apply CTA
// matched both the button rule and the text-link rule at identical specificity, so source
// order decided it and the primary CTA in the header pressed like a link - 0.985 where it
// should be 0.965. Reported as "there is no animation with the navigation button". A tie
// on specificity is not something to leave to chance on the one button every page is
// trying to get clicked, so both the presence and the AMOUNT are asserted.
for (const [label, width, sels] of [
  ['desktop', 1280, [['nav .nav-links a.btn-solid', 0.965], ['nav .nav-links a:not(.btn-solid)', 0.985]]],
  ['mobile', 390, [['nav .burger', 0.965], ['nav .nav-cta', 0.965],
                   ['.mobile-menu a.btn-solid', 0.965], ['.mobile-menu a:not(.btn-solid)', 0.985]]]
]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  if (width < 860) {
    await page.evaluate(() => document.querySelector('.mobile-menu')?.classList.add('open'));
    // Wait out the staggered entrance before measuring a press. The rows animate in on a
    // .46s spring behind delays up to .22s, and the entrance and the press share the
    // transform property - so measuring at 190ms catches the last item still flying in and
    // reads its entrance rather than its press. Not a defect, a measurement taken too early.
    await page.waitForTimeout(900);
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  for (const [sel, want] of sels) {
    const q = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel }).catch(() => ({ nodeId: 0 }));
    if (!q.nodeId) { check(`${label} nav: ${sel} exists`, false); continue; }
    await cdp.send('CSS.forcePseudoState', { nodeId: q.nodeId, forcedPseudoClasses: ['active'] });
    await page.waitForTimeout(190);
    const tr = await page.evaluate(s => getComputedStyle(document.querySelector(s)).transform, sel);
    await cdp.send('CSS.forcePseudoState', { nodeId: q.nodeId, forcedPseudoClasses: [] });
    const got = Number((/matrix\(([\d.]+)/.exec(tr) || [])[1]);
    check(`${label} nav: ${sel} presses to ${want}`, Math.abs(got - want) < 0.003, tr);
  }
  await page.close();
}

// THE MOBILE MENU MUST OPEN, NOT APPEAR. Reported as "the animation for the nav is non
// existent" - it toggled display:none to display:flex, a hard cut with nothing between,
// and on a phone that is the main navigation control on the site. A height that goes
// straight from 0 to its final value is the failure; intermediate values are the fix.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  const r = await page.evaluate(async () => {
    const m = document.querySelector('.mobile-menu');
    const below = document.querySelector('header.hero');
    const beforeTop = below.getBoundingClientRect().top;
    const clips = [];
    document.getElementById('burgerBtn').click();
    for (let i = 0; i < 9; i++) {
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 45)));
      clips.push(getComputedStyle(m).clipPath);
    }
    return {
      shift: Math.round(below.getBoundingClientRect().top - beforeTop),
      clips,
      bar: getComputedStyle(document.querySelector('.burger span')).transform
    };
  });
  // Intermediate clip values mean it is revealing rather than appearing. A run of
  // identical values would be a hard cut.
  const pct = r.clips.map(c => { const m = /([\d.]+)%/.exec(c); return m ? Number(m[1]) : 0; });
  const moving = new Set(pct).size;
  check('the mobile menu animates open rather than cutting', moving >= 3, r.clips.join(' -> '));

  // THE SMOOTHNESS PROPERTY, and the reason this is a test rather than a screenshot.
  // The first version animated height 0 -> auto with the panel in normal flow, so every
  // frame reflowed the whole document and everything below the nav moved. It animated and
  // it stuttered - "the animation isn't the smoothest". Overlaying it means no layout is
  // recalculated at all. If content below the nav ever moves again, the jank is back.
  check('opening the menu does not move the page below it', r.shift === 0, `${r.shift}px`);

  check('the burger morphs when the menu is open',
        r.bar !== 'none' && r.bar !== 'matrix(1, 0, 0, 1, 0, 0)', r.bar);
  await page.close();
}

// A real navigation must actually run a transition, not just declare one.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    addEventListener('pageswap', e => sessionStorage.setItem('vt', e.viewTransition ? 'yes' : 'no'));
  });
  await page.evaluate(() => document.querySelector('nav a[href*="about"]').click());
  await page.waitForTimeout(1400);
  const r = await page.evaluate(() => ({ path: location.pathname, vt: sessionStorage.getItem('vt') }));
  check('index -> about runs a real cross-document view transition',
        r.vt === 'yes' && r.path.includes('about'), JSON.stringify(r));
  await page.close();
}

await browser.close();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
