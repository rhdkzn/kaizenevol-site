/* The consent gate and the Meta pixel.
 *
 * This file exists because script.js has NEVER EXECUTED. Its fifth statement is
 * `if (!PIXEL_ID) return;` and PIXEL_ID has been '' since 2026-07-31, so every line
 * below it — the banner, the consent store, the loader, the withdrawal path — is code
 * nobody has ever run. The day a pixel ID is pasted in is the day all of it runs for
 * the first time, on production, on every page. That is not a day to find out.
 *
 * The pixel ID is INJECTED at request time by rewriting the served script, so no fake
 * id is ever committed and the shipped file stays inert. Every facebook.net request is
 * intercepted and aborted, so the suite never touches Meta.
 *
 * The load-bearing assertion is the NEGATIVE one: nothing may reach connect.facebook.net
 * before the visitor says yes. Under UK PECR a tracking pixel is a non-essential cookie
 * and needs PRIOR consent; a banner that drops the pixel and then asks is the violation
 * plus the appearance of compliance. A test that only checks "does the pixel load" would
 * pass that.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8899';
const FAKE = '000000000000000';
const PIXEL_HOST = /connect\.facebook\.net/;

const PUBLIC = ['index.html','about.html','kaizen-loop.html','what-we-run.html','privacy.html',
                'tried-ads-before.html','can-i-do-this-myself.html','ads-for-musicians.html',
                'apply.html','f.html','booked.html','404.html'];
const INTERNAL = ['crm.html','dashboard.html','portal.html','onboard.html'];

let pass = 0; const fails = [];
const ok  = (n) => { pass++; };
const bad = (n, d) => fails.push(`${n} — ${d}`);
const is  = (n, got, want) => got === want ? ok(n) : bad(n, `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);

/* A context whose served script.js carries an id, and which can never reach Meta. */
async function armed(browser, { withId = true } = {}) {
  const ctx = await browser.newContext();
  const hits = [];
  await ctx.route('**/script.js', async (route) => {
    const res = await route.fetch();
    let body = await res.text();
    if (withId) {
      const before = body;
      body = body.replace("var PIXEL_ID = '';", `var PIXEL_ID = '${FAKE}';`);
      if (body === before) throw new Error('INJECTION FAILED — the PIXEL_ID line in script.js changed shape; this test can no longer arm the gate and is not checking anything');
    }
    await route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'application/javascript' } });
  });
  await ctx.route(PIXEL_HOST, (route) => { hits.push(route.request().url()); route.abort(); });
  return { ctx, hits };
}

const browser = await chromium.launch();

/* 1. AS SHIPPED: the file must do nothing at all. */
{
  const { ctx, hits } = await armed(browser, { withId: false });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  is('shipped: no banner', await p.locator('.ke-consent').count(), 0);
  is('shipped: no pixel request', hits.length, 0);
  is('shipped: nothing stored', await p.evaluate(() => localStorage.getItem('ke_consent')), null);
  await ctx.close();
}

/* 2. ARMED, FIRST VISIT: banner shows, and NOTHING has gone to Meta yet. */
{
  const { ctx, hits } = await armed(browser);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.ke-consent', { timeout: 4000 }).catch(() => {});
  is('armed: banner appears', await p.locator('.ke-consent').count(), 1);
  is('armed: NO pixel before a choice', hits.length, 0);
  is('armed: nothing stored before a choice', await p.evaluate(() => localStorage.getItem('ke_consent')), null);
  const btns = await p.locator('.ke-consent button').allTextContents();
  is('armed: both answers offered', btns.join('|'), 'Decline|Accept');
  await ctx.close();
}

/* 3. DECLINE: still nothing to Meta, the answer sticks, the banner does not return. */
{
  const { ctx, hits } = await armed(browser);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.ke-consent', { timeout: 4000 });
  await p.click('.ke-consent button[data-ke="no"]');
  await p.waitForTimeout(600);
  is('decline: NO pixel request', hits.length, 0);
  is('decline: stored', await p.evaluate(() => localStorage.getItem('ke_consent')), 'denied');
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  is('decline: banner does not return', await p.locator('.ke-consent').count(), 0);
  is('decline: still no pixel after reload', hits.length, 0);
  await ctx.close();
}

/* 4. ACCEPT: the pixel loads, and only now. */
{
  const { ctx, hits } = await armed(browser);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.ke-consent', { timeout: 4000 });
  is('accept: nothing before the click', hits.length, 0);
  await p.click('.ke-consent button[data-ke="yes"]');
  await p.waitForTimeout(900);
  is('accept: stored', await p.evaluate(() => localStorage.getItem('ke_consent')), 'granted');
  (hits.length >= 1 && /fbevents\.js/.test(hits[0])) ? ok('accept: pixel requested')
    : bad('accept: pixel requested', `expected a fbevents.js request, got ${JSON.stringify(hits)}`);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  is('accept: banner does not return', await p.locator('.ke-consent').count(), 0);
  await ctx.close();
}

/* 5. The banner is on the CURRENT palette, not the purple one it was written against. */
{
  const { ctx } = await armed(browser);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.ke-consent', { timeout: 4000 });
  const look = await p.evaluate(() => {
    const el = document.querySelector('.ke-consent');
    const yes = el.querySelector('button[data-ke="yes"]');
    const no  = el.querySelector('button[data-ke="no"]');
    const cs = getComputedStyle(el);
    return { ground: cs.backgroundColor, font: cs.fontFamily,
             yesW: yes.getBoundingClientRect().width, noW: no.getBoundingClientRect().width };
  });
  is('palette: ground is --text', look.ground, 'rgb(35, 33, 30)');
  /^Manrope/.test(look.font) ? ok('palette: Manrope') : bad('palette: Manrope', `font-family is ${look.font}`);
  /* ICO: refusing must be as easy as accepting. Same shape, comparable size. */
  (Math.abs(look.yesW - look.noW) < 26) ? ok('ICO: Decline is not a lesser button')
    : bad('ICO: Decline is not a lesser button', `Accept ${Math.round(look.yesW)}px vs Decline ${Math.round(look.noW)}px`);
  await ctx.close();
}

/* 6. Coverage: every public page loads it, no internal page does. */
{
  const ctx = await browser.newContext();
  for (const pg of PUBLIC) {
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${pg}`, { waitUntil: 'domcontentloaded' });
    const n = await p.evaluate(() => document.querySelectorAll('script[src="/script.js"]').length);
    is(`public: ${pg} loads script.js`, n, 1);
    await p.close();
  }
  for (const pg of INTERNAL) {
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${pg}`, { waitUntil: 'domcontentloaded' });
    const n = await p.evaluate(() => document.querySelectorAll('script[src="/script.js"]').length);
    is(`internal: ${pg} has no pixel`, n, 0);
    await p.close();
  }
  await ctx.close();
}

await browser.close();

if (fails.length) {
  console.log(`${pass} passed, ${fails.length} FAILED`);
  fails.forEach(f => console.log('   ✗ ' + f));
  process.exit(1);
}
console.log(`${pass} passed, 0 failed — the pixel cannot load before consent, and does after`);
