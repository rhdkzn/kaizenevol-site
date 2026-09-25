/* The Kaizen Ascent onboarding link, walked in a real browser (OPS-ONB-006, 2026-09-25).
 *
 * One page, two lanes. A local business opening its link must see a local business's
 * proposal, not an artist's: the creative copy talks about drops, sell-through and a
 * growth step, none of which exist in the local agreement. And the creative link must
 * keep working exactly as it did.
 *
 * COLD OPEN: every context here is fresh — no cookies, no storage, no CRM session —
 * which is what a stranger tapping the link in a text has. The API is served from the
 * real api/onboard.js publicView(), so the page is tested against the same contract
 * production serves, not a hand-written fixture that can drift from it.
 *
 * Live mode: BASE=https://kaizenevol.com ONBOARD_TOKEN=<local row token> node test-ascent-onboard.mjs
 * skips the routing and cold-opens the real link.
 *
 * Run: node test-ascent-onboard.mjs   (needs a static server on BASE, default :8899)
 */
import { chromium, devices } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:8899'
const LIVE_TOKEN = process.env.ONBOARD_TOKEN || ''
const SHOTS = process.env.SHOTS || ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }

const mod = await import('./api/onboard.js')
if (typeof mod.publicView !== 'function') {
  console.log('FAIL publicView is not exported from api/onboard.js — the page contract cannot be served')
  console.log('\n0 passed, 1 failed'); process.exit(1)
}
const LOCAL = { id: 'LocalTokenLocalTokenLocal1', status: 'sent', data: { lane: 'local', business: 'Hollow Oak Barbers', founder: 'Dev Patel', founding: true, retainer: 500, email: 'dev@hollowoak.co.uk', issuedAt: '2026-09-25', proposalNotes: '' } }
const CREATIVE = { id: 'CreativeTokenCreativeTok1', status: 'sent', data: { business: 'Marauder', founder: 'Sam Okafor', founding: true, retainer: 1000, email: 'sam@marauder.co.uk', issuedAt: '2026-09-06' } }
const ROWS = { [LOCAL.id]: LOCAL, [CREATIVE.id]: CREATIVE }

const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}), args: ['--ssl-version-max=tls1.2'] })

async function open(token, width, { signed = false } = {}) {
  const phone = width < 600
  const ctx = await browser.newContext(phone
    ? { ...devices['iPhone 13'], viewport: { width, height: 844 }, isMobile: true, hasTouch: true }
    : { viewport: { width, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  if (!LIVE_TOKEN) {
    await page.route('**/api/onboard**', route => {
      const u = new URL(route.request().url()), t = u.searchParams.get('t')
      const row = ROWS[t]
      if (!row) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"This link is not valid any more."}' })
      const r = signed ? { ...row, status: 'signed', data: { ...row.data, signature: { name: row.data.founder, at: '2026-09-25T10:00:00Z', hash: 'x'.repeat(64) } } } : row
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mod.publicView(r)) })
    })
  }
  await page.goto(BASE + '/onboard?t=' + encodeURIComponent(token), { waitUntil: 'domcontentloaded' })
  // The /onboard clean URL is a Vercel rewrite; a local static server only knows onboard.html.
  if (!LIVE_TOKEN && !(await page.$('#s1'))) await page.goto(BASE + '/onboard.html?t=' + encodeURIComponent(token), { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.getElementById('loading').style.display === 'none' || document.getElementById('dead').classList.contains('on'), null, { timeout: 15000 })
  return { ctx, page, errors }
}
const visibleText = page => page.evaluate(() => document.body.innerText)
const horizScroll = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/* ── 1. the LOCAL link, cold, at phone and desktop width ── */
for (const width of [375, 1280]) {
  const token = LIVE_TOKEN || LOCAL.id
  const { ctx, page, errors } = await open(token, width)
  const w = width + 'px'
  ok(`${w} cold open: the local link opens (not the dead-link page)`, await page.isVisible('#s1'), await page.evaluate(() => document.body.innerText.slice(0, 160)))
  ok(`${w} no script errors on load`, errors.length === 0, errors.join(' | '))
  const txt = await visibleText(page)
  ok(`${w} proposal names the business`, txt.includes(LIVE_TOKEN ? '' : 'Hollow Oak Barbers'))
  ok(`${w} steps read Proposal · Agreement · Payment · Setup`, /Proposal[\s\S]*Agreement[\s\S]*Payment[\s\S]*Setup/.test(await page.innerText('#steps')), await page.innerText('#steps'))
  for (const w0 of ['drop', 'sell-through', 'growth step', 'baseline', 'drop calendar', 'store and payment records']) {
    ok(`${w} local proposal has no creative word: "${w0}"`, !txt.toLowerCase().includes(w0), (txt.toLowerCase().match(new RegExp('.{0,40}' + w0 + '.{0,40}')) || [''])[0])
  }
  ok(`${w} local proposal speaks about the website and the front office`, /website/i.test(txt) && /front office/i.test(txt))
  ok(`${w} local proposal states the guarantee as a credit`, /next month free/i.test(txt) && /credit/i.test(txt))
  ok(`${w} no horizontal scroll`, (await horizScroll(page)) <= 0)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/local-proposal-${width}.png`, fullPage: true })

  await page.click('#s1 .btn-solid')
  await page.waitForSelector('#s2.on')
  const agreeTxt = await page.innerText('#s2')
  ok(`${w} agreement step shows the LOCAL agreement`, /Twilio/.test(agreeTxt) && !/GROWTH STEP/.test(agreeTxt))
  const box = await page.innerText('label.check')
  ok(`${w} signing checkbox has no growth-step line`, !/growth step/i.test(box) && !/clause 3/i.test(box), box)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/local-agreement-${width}.png`, fullPage: false })
  await ctx.close()
}

/* ── 2. the local PAY step, signed row, pay link unset → the honest fallback ── */
if (!LIVE_TOKEN) {
  for (const width of [375, 1280]) {
    const { ctx, page } = await open(LOCAL.id, width, { signed: true })
    const w = width + 'px'
    await page.waitForSelector('#s3.on')
    const t = await page.innerText('#s3')
    ok(`${w} pay step heading is not "retainer"-creative copy`, !/ad spend/i.test(t), t.slice(0, 200))
    ok(`${w} pay link unset → no dead button`, !(await page.isVisible('#pay-btn')))
    ok(`${w} pay link unset → "we'll send your payment link"`, /send you your payment link|send your payment link/i.test(t), t)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/local-pay-${width}.png`, fullPage: false })
    await ctx.close()
  }
}

/* ── 3. the CREATIVE link keeps its copy exactly ── */
if (!LIVE_TOKEN) {
  const { ctx, page, errors } = await open(CREATIVE.id, 375)
  const txt = await visibleText(page)
  ok('creative link still opens', await page.isVisible('#s1'))
  ok('creative: no script errors', errors.length === 0, errors.join(' | '))
  ok('creative: the four things list intact', /The four things we run for Marauder/.test(txt) && /Growth management\./.test(txt))
  ok('creative: "How the first drop works" intact', /How the first drop works/.test(txt))
  ok('creative: growth-step cell intact', /Growth step/i.test(txt))
  ok('creative: steps read Proposal · Agreement · Retainer · Live', /Proposal[\s\S]*Agreement[\s\S]*Retainer[\s\S]*Live/.test(await page.innerText('#steps')))
  await page.click('#s1 .btn-solid'); await page.waitForSelector('#s2.on')
  ok('creative: checkbox keeps the clause-3 growth-step line', /growth step applies as set out in clause 3/.test(await page.innerText('label.check')))
  ok('creative: agreement is the creative text', /THE GROWTH STEP/.test(await page.innerText('#a-text')))
  await ctx.close()
}

await browser.close()
console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
