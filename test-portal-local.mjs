/* The client portal's LOCAL view (Kaizen Ascent, OPS-ONB-006, 2026-09-25).
 *
 * One portal for everyone. A local business signs in to the same page as an artist or
 * a brand, and must see its own world: Desk numbers instead of revenue and growth
 * steps, upcoming bookings instead of a drop calendar, and the Desk's setup questions
 * (opening hours first, because the guarantee is measured against them).
 *
 * The rule this guards hardest: UNTIL THE DESK IS LIVE THE PANEL SAYS SO. Zeros in a
 * numbers panel read as a dead month to a client who is paying for the month; a
 * "switches on when your front office goes live" line reads as the truth.
 *
 * The portal is gated behind a Supabase magic link, so a naive run measures the login
 * card and reports the portal clean. The supabase-js CDN script is replaced with a stub
 * that answers portal_me with a seeded client, and each check first PROVES the portal
 * section is the one on screen.
 *
 * Run: node test-portal-local.mjs   (needs a static server on BASE, default :8899)
 */
import { chromium, devices } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:8899'
const SHOTS = process.env.SHOTS || ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }

const LOCAL_CLIENT = { id: 'c_local01', name: 'Hollow Oak Barbers', founder: 'Dev Patel', lane: 'local', segment: 'Local', founding: true, retainerValue: 500, terms: 'Founding £500/mo', liveDate: '' }
const CREATIVE_CLIENT = { id: 'c_brand01', name: 'Marauder', founder: 'Sam Okafor', segment: 'Streetwear', founding: true, retainerValue: 1000, baselineRevenue: 8000, liveDate: '2026-08-01' }

/* A stand-in for supabase-js: enough of the surface portal.html touches. Every call is
   recorded on window.__calls so the test can see what the page tried to save. */
function stub(client, extra = {}) {
  return `window.__calls = [];
  window.supabase = { createClient: function(){
    var me = ${JSON.stringify({ email: 'owner@example.com', client, settings: {}, snapshots: [], tasks: {}, access: {}, boards: [] })};
    var form = ${JSON.stringify(extra.form || null)};
    function q(table){ var o = { select: function(){ return o; }, eq: function(){ return o; }, order: function(){ return o; }, limit: function(){ return Promise.resolve({ data: ${JSON.stringify(extra.items || [])} }); },
      maybeSingle: function(){ return Promise.resolve({ data: table === 'ke_portal_forms' ? form : null }); }, insert: function(r){ window.__calls.push(['insert', table, r]); return Promise.resolve({}); } }; return o; }
    return {
      auth: { getSession: function(){ return Promise.resolve({ data: { session: { user: { email: 'owner@example.com' } } } }); }, onAuthStateChange: function(){}, signOut: function(){ return Promise.resolve(); } },
      rpc: function(name, args){ window.__calls.push(['rpc', name, args]);
        if (name === 'portal_me') return Promise.resolve({ data: me });
        if (name === 'portal_form_submit') { form = { answers: args.p_answers, submitted_at: '2026-09-25T10:00:00Z' }; return Promise.resolve({ data: { saved: true } }); }
        return Promise.resolve({ data: null }); },
      from: q,
      storage: { from: function(){ return { list: function(){ return Promise.resolve({ data: [] }); } }; } }
    };
  } };`
}

const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}), args: ['--ssl-version-max=tls1.2'] })

async function open(client, width, extra = {}) {
  const phone = width < 600
  const ctx = await browser.newContext(phone ? { ...devices['iPhone 13'], viewport: { width, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/@supabase/supabase-js@2**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: stub(client, extra) }))
  const deskHits = []
  await page.route('**/api/portal/**', r => { deskHits.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(extra.desk || {}) }) })
  await page.goto(BASE + '/portal.html', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#s-portal.on', { timeout: 15000 })
  await page.waitForTimeout(300)
  return { ctx, page, errors, deskHits }
}

/* ── 1. local client, Desk not live ── */
for (const width of [375, 1280]) {
  const w = width + 'px'
  const { ctx, page, errors, deskHits } = await open(LOCAL_CLIENT, width)
  ok(`${w} the portal section is on screen (not the login card)`, await page.isVisible('#s-portal') && !(await page.isVisible('#s-login')))
  ok(`${w} no script errors`, errors.length === 0, errors.join(' | '))
  const txt = await page.innerText('#s-portal')
  ok(`${w} "Desk numbers" replaces "The numbers"`, /Desk numbers/.test(txt) && !/^The numbers$/m.test(txt))
  ok(`${w} "Upcoming bookings" replaces the drop calendar`, /Upcoming bookings/.test(txt))
  ok(`${w} not-live state: "switches on when your front office goes live"`, /switches on when your front office goes live/i.test(txt))
  const nums = await page.innerText('#p-numbers').catch(() => '')
  ok(`${w} not-live state shows NO zeros that look like a dead month`, !/(^|\s)0(\s|$)/.test(nums) && !/£0/.test(nums), nums)
  ok(`${w} no Desk API call when the Desk is not connected`, deskHits.length === 0, deskHits.join(' '))
  for (const bad of ['drop', 'sell-through', 'growth step', 'baseline', 'release calendar']) {
    ok(`${w} local portal has no creative word: "${bad}"`, !txt.toLowerCase().includes(bad), (txt.toLowerCase().match(new RegExp('.{0,40}' + bad + '.{0,40}')) || [''])[0])
  }
  ok(`${w} setup questions are shown to a local client`, await page.isVisible('#p-setup-wrap'))
  ok(`${w} setup asks for opening hours in the parseable shape`, /opening hours/i.test(txt) && /mon-fri 09:00-18:00/.test(txt))
  ok(`${w} setup asks deposit amount + their own payment link`, /deposit/i.test(txt) && /own payment link/i.test(txt))
  ok(`${w} setup asks services, booking link, alert WhatsApp and email`, /services/i.test(txt) && /booking link/i.test(txt) && /WhatsApp/.test(txt) && /alert/i.test(txt))
  ok(`${w} no horizontal scroll`, (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/portal-local-${width}.png`, fullPage: true })

  if (width === 375) {
    // Opening hours that the Desk cannot parse must be refused here, not discovered at go-live.
    await page.fill('#q-open_hours', 'monday to friday 9 till 6')
    await page.click('#p-setup-send')
    await page.waitForTimeout(200)
    const msg = await page.innerText('#p-setup-msg')
    ok('unparseable opening hours are refused with a plain message', /opening hours/i.test(msg) && !(await page.evaluate(() => window.__calls.some(c => c[1] === 'portal_form_submit'))), msg)
    await page.fill('#q-open_hours', 'mon-fri 09:00-18:00, sat 09:00-16:00')
    await page.fill('#q-services', 'Skin fade, Beard trim')
    await page.click('#p-setup-send')
    await page.waitForTimeout(400)
    const sent = await page.evaluate(() => (window.__calls.find(c => c[1] === 'portal_form_submit') || [])[2])
    ok('valid hours save through portal_form_submit', !!sent)
    ok('saved answers carry open_hours in the Desk tenant shape', sent && sent.p_answers.open_hours && sent.p_answers.open_hours.mon === '09:00-18:00' && sent.p_answers.open_hours.sat === '09:00-16:00' && !sent.p_answers.open_hours.sun && sent.p_answers.open_hours.timezone === 'Europe/London', JSON.stringify(sent && sent.p_answers.open_hours))
    ok('saved answers carry services as a list (tenant shape)', sent && Array.isArray(sent.p_answers.services) && sent.p_answers.services[1] === 'Beard trim', JSON.stringify(sent && sent.p_answers.services))
  }
  await ctx.close()
}

/* ── 2. local client, Desk connected → its numbers and bookings render ── */
{
  const live = { ...LOCAL_CLIENT, liveDate: '2026-10-01', deskUrl: 'https://desk.example.com', deskTenant: 'hollow-oak', deskKey: 'k3y' }
  const desk = { view: 'desk', stats: [{ label: 'Conversations (30 days)', value: 41 }, { label: 'Hot leads', value: 6 }, { label: 'Jobs booked', value: 3 }], appointments: [{ when: 'Tue 7 Oct, 10:00', contact: 'Sam R.' }], leads: [{ channel: 'sms', contact: '+447700900123', reason: 'Wants a quote for a group booking', when: '2h ago' }] }
  const { ctx, page, errors, deskHits } = await open(live, 375, { desk })
  await page.waitForTimeout(400)
  ok('connected: the Desk API is called with tenant and key', deskHits.some(u => u.includes('/api/portal/hollow-oak') && u.includes('key=k3y')), deskHits.join(' '))
  const nums = await page.innerText('#p-numbers')
  ok('connected: Desk stats render', /conversations/i.test(nums) && /41/.test(nums), await page.innerHTML('#p-numbers'))
  ok('connected: upcoming bookings render', /Sam R\./.test(await page.innerText('#p-events')))
  ok('connected: "what needs you" lists hot leads', /group booking/.test(await page.innerText('#s-portal')))
  ok('connected: no script errors', errors.length === 0, errors.join(' | '))
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/portal-local-live-375.png`, fullPage: true })
  await ctx.close()
}

/* ── 3. creative client unchanged ── */
{
  const { ctx, page, errors, deskHits } = await open(CREATIVE_CLIENT, 375)
  const txt = await page.innerText('#s-portal')
  ok('creative: "The numbers" with baseline and growth step', /The numbers/.test(txt) && /Baseline/i.test(txt) && /Next growth step/i.test(txt))
  ok('creative: "Drop calendar" heading', /Drop calendar/.test(txt))
  ok('creative: no Desk wording', !/Desk numbers|front office/i.test(txt))
  ok('creative: brand client still gets no setup questions', !(await page.isVisible('#p-setup-wrap')))
  ok('creative: no Desk API call', deskHits.length === 0)
  ok('creative: no script errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
