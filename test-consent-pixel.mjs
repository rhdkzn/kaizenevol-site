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

const PUBLIC = ['index.html','kaizen-loop.html','what-we-run.html','privacy.html',
                'tried-ads-before.html','do-i-have-to-be-on-camera.html','ads-for-musicians.html',
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

/* ─────────────────────────────────────────────────────────────────────────────
 * 7. THE LEAD EVENT.
 *
 * window.keTrackLead existed from 2026-07-31 and NOTHING called it until
 * 2026-09-12, so with a pixel id the site would have reported PageView and never
 * a Lead — on a lead-generation site the only event that matters. Wired into the
 * two real conversion points: funnel-engine.js (f.html) and apply.html.
 *
 * The spy is fbq's own queue. With fbevents.js aborted, Meta's loader never sets
 * callMethod, so every fbq(...) lands in window.fbq.queue — real call site, real
 * arguments, no stubbing of our own code.
 *
 * Four assertions, and three of them are negative. A Lead fired for someone who
 * declined is precisely what they declined; a Lead fired on a submission that
 * FAILED is a number that will not reconcile against the inbox later.
 * ──────────────────────────────────────────────────────────────────────────── */

const leads = (p) => p.evaluate(() =>
  ((window.fbq && window.fbq.queue) ? Array.from(window.fbq.queue) : [])
    .map(a => Array.from(a)).filter(a => a[0] === 'track' && a[1] === 'Lead'));

/* Walks whatever steps the form currently has, so it does not go stale when the
   questions change: text steps get typed into, choice steps take the first option. */
async function driveApply(p) {
  for (let i = 0; i < 40; i++) {
    if (await p.locator('#done:not([hidden])').count()) return true;
    const step = p.locator('.step.on').first();
    if (!(await step.count())) break;
    const type = await step.getAttribute('data-type');
    if (type === 'choice') {
      await step.locator('button.opt').first().click();
    } else {
      /* EVERY input in the step, keyed by the input's own id — apply.html reads
         `data[field.id || step.dataset.key]`, and the last step carries TWO fields
         (contactName and email). Filling only the first left the email blank and the
         form sat on "We need somewhere to send the answer" forever. */
      const inputs = step.locator('input, textarea');
      for (let k = 0; k < await inputs.count(); k++) {
        const el = inputs.nth(k);
        const id = (await el.getAttribute('id')) || '';
        const t  = (await el.getAttribute('type')) || '';
        await el.fill(t === 'email' || /email/i.test(id) ? 'test@example.com'
                    : /url|site|web/i.test(id) ? 'example.com'
                    : 'Test ' + (id || 'answer'));
      }
    }
    const go = p.locator('#go');
    if (await go.count() && await go.isVisible()) await go.click();
    await p.waitForTimeout(120);
  }
  return !!(await p.locator('#done:not([hidden])').count());
}

async function applyRun(browser, { answer, apiOk = true, poison = false }) {
  const { ctx, hits } = await armed(browser);
  await ctx.route('**/api/submit-lead', r => r.fulfill({ status: apiOk ? 200 : 500, body: '{}' }));
  await ctx.route('**/api/funnel-event', r => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}/apply.html`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.ke-consent', { timeout: 4000 });
  await p.click(`.ke-consent button[data-ke="${answer}"]`);
  await p.waitForTimeout(700);
  if (poison) await p.evaluate(() => { window.keTrackLead = () => { throw new Error('tracking blew up'); }; });
  const finished = await driveApply(p);
  await p.waitForTimeout(500);
  const out = { finished, leads: await leads(p), pixel: hits.length };
  await ctx.close();
  return out;
}

{
  const r = await applyRun(browser, { answer: 'yes' });
  is('lead/apply: form completes', r.finished, true);
  is('lead/apply: exactly one Lead', r.leads.length, 1);
  is('lead/apply: labelled', JSON.stringify(r.leads[0] && r.leads[0][2]), '{"content_name":"apply"}');
  /* Nothing but the label may reach Meta — the form carries an email, a business
     name and a free-text message, and none of it is ours to send. */
  const keys = Object.keys((r.leads[0] && r.leads[0][2]) || {});
  is('lead/apply: no PII in the payload', keys.join(','), 'content_name');
}
{
  const r = await applyRun(browser, { answer: 'no' });
  is('lead/declined: form still completes', r.finished, true);
  is('lead/declined: NO Lead', r.leads.length, 0);
  is('lead/declined: NO pixel at all', r.pixel, 0);
}
{
  /* ISOLATES THE CONSENT CHECK. keTrackLead guards on `read() !== 'granted' || !window.fbq`,
     and after a decline fbq never exists — so the plain declined case above passes even if
     the CONSENT half is deleted. Red-green proved exactly that on 2026-09-12: removing
     `read() !== 'granted'` left the suite green. Here fbq is defined by hand after the
     decline, so only the consent check can stop the Lead. */
  const { ctx } = await armed(browser);
  await ctx.route('**/api/submit-lead', r => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}/apply.html`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.ke-consent', { timeout: 4000 });
  await p.click('.ke-consent button[data-ke="no"]');
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    window.fbq = function () { (window.fbq.queue = window.fbq.queue || []).push(arguments); };
  });
  const finished = await driveApply(p);
  await p.waitForTimeout(400);
  is('lead/declined-with-fbq-present: form completes', finished, true);
  is('lead/declined-with-fbq-present: consent check alone blocks the Lead', (await leads(p)).length, 0);
  await ctx.close();
}
{
  const r = await applyRun(browser, { answer: 'yes', apiOk: false });
  is('lead/failed submit: NO Lead', r.leads.length, 0);
  is('lead/failed submit: success panel stays hidden', r.finished, false);
}
{
  /* Tracking must never be able to take down a conversion that already succeeded. */
  const r = await applyRun(browser, { answer: 'yes', poison: true });
  is('lead/poisoned tracker: form still completes', r.finished, true);
}

/* The funnel's call site, checked in the file rather than by driving f.html, which
   loads its spec over the network and would make this test depend on a JSON fixture.
   Asserting the call sits in the SUCCESS branch is the part that matters. */
{
  const src = await (await fetch(`${BASE}/funnel-engine.js`)).text();
  const i = src.indexOf('keTrackLead');
  (i > 0) ? ok('lead/funnel: call site present') : bad('lead/funnel: call site present', 'not found in funnel-engine.js');
  const before = src.slice(Math.max(0, i - 600), i);
  /^[\s\S]*emit\(spec, 'complete'/.test(before)
    ? ok('lead/funnel: fires in the success branch')
    : bad('lead/funnel: fires in the success branch', 'not preceded by the complete emit');
  /catch/.test(src.slice(i, i + 260)) ? ok('lead/funnel: guarded by try/catch')
    : bad('lead/funnel: guarded by try/catch', 'no catch near the call');
}

await browser.close();

if (fails.length) {
  console.log(`${pass} passed, ${fails.length} FAILED`);
  fails.forEach(f => console.log('   ✗ ' + f));
  process.exit(1);
}
console.log(`${pass} passed, 0 failed — the pixel cannot load before consent, and does after`);
