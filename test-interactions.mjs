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
// Cross-page: every <main> name must be unique across the site, or two pages pair into a morph.
const mainNamesSeen = new Set();
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

  // THE PAGE TRANSITION. None of this is visible in a screenshot, and five versions of
  // this block passed while the transition was wrong. The structure now is Apple's
  // (apple.com/shop/buy-iphone/iphone-16, read on 2026-09-04: no page transition at all,
  // 240-320ms and 4-20px of travel on everything inside the page) plus the one thing a
  // hard cut cannot do - the incoming content ARRIVES. The frame is static; only the
  // content moves. What follows asserts that structure, not a timing, because a timing
  // can always be tuned back into one of the two old bugs (a blank screen, or two pages
  // legible at once) and a structural property cannot.
  const smooth = await page.evaluate(() => {
    const times = s => [...String(s).matchAll(/(-?[\d.]+)(ms|s)\b/g)]
      .map(m => m[2] === 'ms' ? parseFloat(m[1]) / 1000 : parseFloat(m[1]));
    const out = { rootStatic: null, contentOut: null, contentIn: null, inTravel: null, inDuration: null };
    for (const sheet of document.styleSheets) {
      try {
        for (const r of sheet.cssRules) {
          if (r.type === CSSRule.KEYFRAMES_RULE && r.name === 'ke-content-in') {
            for (const k of r.cssRules) {
              const m = /translateY\((-?[\d.]+)px\)/.exec(k.style.transform || '');
              if (m) out.inTravel = Math.abs(parseFloat(m[1]));
            }
          }
          if (!r.selectorText) continue;
          // The ROOT snapshot is the ground. If it animates at all, the ground can go
          // transparent, and that is the blank frame of v3 coming back.
          // Read the LONGHAND. Chrome serialises `animation: none` as
          // "auto ease 0s 1 normal none running none" - the name sits last, so a regex on
          // the shorthand's head reads a static rule as animated.
          if (/::view-transition-(old|new)\(root\)/.test(r.selectorText))
            out.rootStatic = (out.rootStatic ?? true) && r.style.animationName === 'none';
          if (r.selectorText === '::view-transition-old(*)') out.contentOut = /ke-content-out/.test(r.style.animation);
          // The arrival is on <main> itself so a plain load gets it too; the incoming
          // pseudo must then be none, or a navigation rises twice.
          if (r.selectorText === 'main' && /ke-content-in/.test(r.style.animation)) {
            out.contentIn = true;
            out.inDuration = times(r.style.animation)[0];
            out.inFill = r.style.animationFillMode;
          }
          if (r.selectorText === '::view-transition-new(*)') out.newPseudoStatic = r.style.animationName === 'none';
        }
      } catch (e) { /* cross-origin sheet */ }
    }
    // Each page's <main> must carry its OWN name. A shared name pairs the two contents
    // into a morph that stretches one page's height into the other's on the way through;
    // no name at all leaves the content inside root, where it hard-cuts.
    const main = document.querySelector('main');
    out.mainName = main ? getComputedStyle(main).viewTransitionName : null;
    // The mobile menu lives inside <nav>. Unnamed, it is captured into the nav's snapshot
    // and hangs over the whole transition (recorded: visible to +441ms). Named, it leaves
    // with the content.
    const menu = document.querySelector('.mobile-menu');
    out.menuName = menu ? getComputedStyle(menu).viewTransitionName : 'n/a';

    const s = document.querySelector('script[type="speculationrules"]');
    let spec = null;
    try { spec = s ? JSON.parse(s.textContent) : null; } catch (e) { spec = 'PARSE ERROR'; }
    out.eagerness = spec && spec !== 'PARSE ERROR' ? spec.prerender?.[0]?.eagerness : spec;
    return out;
  });
  check(`${name}: the root snapshot (the ground) never animates`,
        smooth.rootStatic === true, `root rules found: ${smooth.rootStatic !== null}, static: ${smooth.rootStatic}`);
  check(`${name}: the content leaves and arrives via its own keyframes`,
        smooth.contentOut === true && smooth.contentIn === true, `out ${smooth.contentOut} in ${smooth.contentIn}`);
  check(`${name}: the arrival runs once (main animates, the incoming pseudo does not)`,
        smooth.newPseudoStatic === true, `::view-transition-new(*) static: ${smooth.newPseudoStatic}`);
  // `both`/`forwards` would pin opacity:1 at animation level after the entrance and
  // outrank the html.leaving transition - the exit-on-tap would stop working, silently.
  check(`${name}: the arrival's fill-mode releases main afterwards (backwards)`,
        smooth.inFill === 'backwards', String(smooth.inFill));
  // Apple's range. 10px was imperceptible on a phone; a full viewport was rejected on sight.
  check(`${name}: the incoming content rises a perceptible, restrained distance (8-24px)`,
        typeof smooth.inTravel === 'number' && smooth.inTravel >= 8 && smooth.inTravel <= 24,
        `translateY ${smooth.inTravel}px`);
  check(`${name}: the arrival takes 240-360ms`,
        typeof smooth.inDuration === 'number' && smooth.inDuration >= 0.24 && smooth.inDuration <= 0.36,
        `${smooth.inDuration}s`);
  check(`${name}: <main> carries a page-unique view-transition-name`,
        typeof smooth.mainName === 'string' && /^ke-main-/.test(smooth.mainName) && !mainNamesSeen.has(smooth.mainName),
        `${smooth.mainName}${mainNamesSeen.has(smooth.mainName) ? ' (already used by another page)' : ''}`);
  if (smooth.mainName) mainNamesSeen.add(smooth.mainName);
  check(`${name}: the mobile menu is pulled out of the nav snapshot`,
        smooth.menuName === 'n/a' || smooth.menuName === 'ke-menu', smooth.menuName);

  // THE EXIT ON THE TAP (transitions.js). A cross-document view transition cannot start
  // until the next page is ready; on a throttled phone profile that was +524ms of frozen
  // page after the tap, then a swap. The script starts the content's exit synchronously
  // on the click, so the first visible change is the tap itself. Everything below is
  // evaluated in-page so "synchronously" is literal: the class must be present on the
  // very same tick the click was dispatched, before any timer or network.
  const exit = await page.evaluate(() => {
    const out = { linked: !!document.querySelector('script[src*="transitions.js"]') };
    const a = document.querySelector('main a[href$=".html"], nav a[href$=".html"], a[href="index.html"], a[href="/"]');
    if (!a) return { ...out, noLink: true };
    const html = document.documentElement;
    const fire = (init) => {
      html.classList.remove('leaving');
      const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
      a.dispatchEvent(e);
      const leaving = html.classList.contains('leaving');
      html.classList.remove('leaving');
      return { leaving, prevented: e.defaultPrevented };
    };
    out.plain = fire({});
    out.meta = fire({ metaKey: true });     // "open in new tab" must stay the browser's
    // A foreign link must never be intercepted.
    const ext = document.createElement('a'); ext.href = 'https://example.com/x'; document.body.appendChild(ext);
    html.classList.remove('leaving');
    const ee = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    ext.dispatchEvent(ee); out.external = { leaving: html.classList.contains('leaving'), prevented: ee.defaultPrevented };
    html.classList.remove('leaving'); ext.remove();
    // Back from the bfcache restores the page mid-exit; pageshow(persisted) must clear it.
    html.classList.add('leaving');
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    out.restored = !html.classList.contains('leaving');
    return out;
  });
  check(`${name}: transitions.js is linked`, exit.linked);
  if (!exit.noLink) {
    check(`${name}: a same-page click starts the exit on the same tick`,
          exit.plain.leaving === true && exit.plain.prevented === true, JSON.stringify(exit.plain));
    check(`${name}: a modified click (new tab) is left to the browser`,
          exit.meta.leaving === false && exit.meta.prevented === false, JSON.stringify(exit.meta));
    check(`${name}: an external link is left to the browser`,
          exit.external.leaving === false && exit.external.prevented === false, JSON.stringify(exit.external));
    check(`${name}: a bfcache restore clears the exit state`, exit.restored === true);
    // The dispatched click was real: the script has a navigation queued 160ms out. Let it
    // land, then come back to the page under test, or every check after this one runs in
    // a destroyed execution context. (First run of this block crashed the whole suite on
    // index.html for exactly that reason - the script working is what broke the test.)
    await page.waitForTimeout(260);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.goto(`${BASE}/${name}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(320);
  }
  // Behavioural twin of the fill-mode check: after the load entrance has finished, does
  // the exit state actually MOVE main? A pinned animation value would leave it at 1 and
  // every structural check above would still pass. Runs AFTER the click block above has
  // been absorbed - its first placement sat 600ms inside a page that was navigating away.
  const exitMoves = await page.evaluate(async () => {
    const m = document.querySelector('main'); if (!m) return 'no main';
    await new Promise(r => setTimeout(r, 600)); // let the entrance finish
    document.documentElement.classList.add('leaving');
    await new Promise(r => setTimeout(r, 120));
    const op = parseFloat(getComputedStyle(m).opacity);
    document.documentElement.classList.remove('leaving');
    return op;
  });
  check(`${name}: after the entrance, the exit state still fades main`,
        exitMoves === 'no main' || exitMoves < 0.9, `opacity ${exitMoves} at +120ms`);
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
  // The ARRIVING side, armed before the new document exists. At pagereveal the new
  // page's <main> must be at opacity 0 - the entrance's `from` state held by the
  // backwards fill - or the content is about to pop rather than rise. No route handler
  // anywhere in this file: a route.fulfill()ed document does not qualify for a
  // cross-document transition, and a routed version of this check reported none.
  await page.addInitScript(() => {
    addEventListener('pagereveal', e => {
      const m = document.querySelector('main');
      sessionStorage.setItem('reveal', (e.viewTransition ? 'vt' : 'none') + '|main=' + (m ? getComputedStyle(m).opacity : 'absent'));
    });
  });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    addEventListener('pageswap', e => sessionStorage.setItem('vt', e.viewTransition ? 'yes' : 'no'));
  });
  await page.evaluate(() => document.querySelector('nav a[href*="about"]').click());
  await page.waitForTimeout(1400);
  const r = await page.evaluate(() => ({ path: location.pathname, vt: sessionStorage.getItem('vt'), reveal: sessionStorage.getItem('reveal') }));
  check('index -> about runs a real cross-document view transition',
        r.vt === 'yes' && r.path.includes('about'), JSON.stringify(r));
  check('the arriving page reveals with the transition and its content armed to rise',
        r.reveal === 'vt|main=0', String(r.reveal));
  await page.close();
}

await browser.close();
console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
