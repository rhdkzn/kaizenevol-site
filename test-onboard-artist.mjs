/* The creative onboarding link, read by a music artist (2026-09-26).
 *
 * The creative lane was written for clothing brands: drops, sell-through, a store platform,
 * product to shoot. An artist has releases, streams and listeners, shows and merch. The page
 * switches its words on segment === 'Artist' (the same test portal.html uses), and nothing
 * else changes: same structure, same fee from the row, same agreement.
 *
 * Two promises are pinned here:
 *   1. An artist row shows no brand word ("drop", "sell-through", "Shopify", "store platform")
 *      anywhere on the page OUTSIDE the agreement block. The agreement text is bound to a
 *      signed hash and is not touched by this change, so it is excluded on purpose.
 *   2. A brand row renders exactly as it did before artists existed. The visible text of every
 *      step was captured off main before the change into test-onboard-artist.brand.json and is
 *      compared character for character. (Re-capture only on purpose: CAPTURE=1.)
 *
 * The API is the real api/onboard.js publicView(), routed in, as test-ascent-onboard does.
 * Run: node test-onboard-artist.mjs   (needs a static server on BASE, default :8899)
 */
import { chromium, devices } from 'playwright'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:8899'
const SHOTS = process.env.SHOTS || ''
const CAPTURE = process.env.CAPTURE === '1'
const BASELINE = new URL('./test-onboard-artist.brand.json', import.meta.url)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }

const mod = await import('./api/onboard.js')
const ARTIST = { id: 'ArtistTokenArtistTokenArt1', status: 'sent', data: { business: 'FulaFalu', founder: 'Fula Falu', segment: 'Artist', founding: true, retainer: 1000, email: 'fula@example.com', issuedAt: '2026-09-26', startDate: '2026-10-01', proposalNotes: '' } }
const BRAND = { id: 'BrandTokenBrandTokenBrand1', status: 'sent', data: { business: 'Marauder', founder: 'Sam Okafor', founding: true, retainer: 1000, email: 'sam@marauder.co.uk', issuedAt: '2026-09-06', startDate: '2026-10-01', proposalNotes: 'Shoot day in the first month.' } }
const BRAND_SEG = { id: 'BrandSegTokenBrandSegToke1', status: 'sent', data: { business: 'Kiln & Co', founder: 'Priya Nair', segment: 'Brand', founding: false, retainer: 2000, email: 'p@kiln.co', issuedAt: '2026-09-06' } }
/* 'artist' in lower case is NOT the artist view: portal.html tests the exact string. */
const LOWER = { id: 'LowerTokenLowerTokenLower1', status: 'sent', data: { ...ARTIST.data, business: 'Lower Case', segment: 'artist' } }
const ROWS = Object.fromEntries([ARTIST, BRAND, BRAND_SEG, LOWER].map(r => [r.id, r]))

const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}), args: ['--ssl-version-max=tls1.2'] })

/* status: 'sent' → Proposal, 'signed' → Retainer, 'paid' → Live */
async function open(token, width, status = 'sent') {
  const phone = width < 600
  const ctx = await browser.newContext(phone
    ? { ...devices['iPhone 13'], viewport: { width, height: 844 }, isMobile: true, hasTouch: true }
    : { viewport: { width, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/api/onboard**', route => {
    const t = new URL(route.request().url()).searchParams.get('t'), row = ROWS[t]
    if (!row) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"This link is not valid any more."}' })
    const r = status === 'sent' ? row : { ...row, status, data: { ...row.data, signature: { name: row.data.founder, at: '2026-09-26T10:00:00Z', hash: 'x'.repeat(64) } } }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mod.publicView(r)) })
  })
  await page.goto(BASE + '/onboard.html?t=' + encodeURIComponent(token), { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.getElementById('loading').style.display === 'none', null, { timeout: 15000 })
  return { ctx, page, errors }
}
/* Every step's visible text. Steps are display:none until shown, so each is shown in turn
   (without the page's own go(), which gates step 3 on status). */
async function stepTexts(page) {
  const out = {}
  for (const i of [1, 2, 3, 4]) {
    out['s' + i] = await page.evaluate(n => {
      [1, 2, 3, 4].forEach(k => document.getElementById('s' + k).classList.toggle('on', k === n))
      return document.getElementById('s' + n).innerText
    }, i)
  }
  return out
}
/* The page copy outside the agreement: every step, minus the agreement text itself. */
async function copyOutsideAgreement(page) {
  const t = await stepTexts(page)
  const agreement = await page.innerText('#a-text').catch(() => '')
  return Object.values(t).join('\n').split(agreement).join('\n') + '\n' + await page.innerText('#steps')
}
const BRAND_WORDS = ['drop', 'sell-through', 'sell through', 'shopify', 'store platform', 'product']

/* ── 1. brand rows: exactly as before ── */
const captured = {}
for (const row of [BRAND, BRAND_SEG]) {
  for (const width of [390, 1440]) {
    for (const status of ['sent', 'signed', 'paid']) {
      const { ctx, page, errors } = await open(row.id, width, status)
      const key = `${row.data.business}@${width}/${status}`
      captured[key] = await stepTexts(page)
      if (!CAPTURE) ok(`brand ${key}: no script errors`, errors.length === 0, errors.join(' | '))
      await ctx.close()
    }
  }
}
if (CAPTURE) {
  writeFileSync(BASELINE, JSON.stringify(captured, null, 1) + '\n')
  console.log('captured brand baseline → ' + BASELINE.pathname)
} else {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'))
  for (const key of Object.keys(base)) {
    for (const s of ['s1', 's2', 's3', 's4']) {
      const a = base[key][s], b = (captured[key] || {})[s]
      let at = 0; while (at < a.length && a[at] === b?.[at]) at++
      ok(`brand ${key} ${s}: text identical to pre-artist main`, a === b, `first difference at char ${at}: was "${a.slice(at, at + 60)}" now "${(b || '').slice(at, at + 60)}"`)
    }
  }
}

/* ── 2. the artist row: artist words, no brand words, outside the agreement ── */
if (!CAPTURE) {
  for (const width of [390, 1440]) {
    for (const status of ['sent', 'signed', 'paid']) {
      const { ctx, page, errors } = await open(ARTIST.id, width, status)
      const w = `artist@${width}/${status}`
      ok(`${w}: no script errors`, errors.length === 0, errors.join(' | '))
      const copy = (await copyOutsideAgreement(page)).toLowerCase()
      for (const word of BRAND_WORDS) {
        ok(`${w}: no "${word}" outside the agreement`, !copy.includes(word), (copy.match(new RegExp('.{0,50}' + word + '.{0,50}')) || [''])[0])
      }
      const t = await stepTexts(page)
      ok(`${w}: proposal names the artist`, t.s1.includes('FulaFalu'))
      ok(`${w}: proposal speaks of the release calendar`, /release calendar/i.test(t.s1))
      ok(`${w}: "How the first release works"`, /How the first release works/.test(t.s1))
      ok(`${w}: growth management is streams and listeners`, /streams/i.test(t.s1) && /listeners/i.test(t.s1))
      ok(`${w}: what we need names the distributor and merch store`, /distributor/i.test(t.s1) && /merch/i.test(t.s1))
      ok(`${w}: what we need asks for footage and shows`, /footage/i.test(t.s1) && /shows/i.test(t.s1))
      ok(`${w}: fee still comes from the row`, /£1,000\/mo · founding rate/.test(t.s1), t.s1.match(/£[^\n]*/)?.[0])
      ok(`${w}: done screen builds the release calendar`, /release calendar/i.test(t.s4) && /Release one is measurement/.test(t.s4))
      ok(`${w}: agreement shown is the unchanged creative text`, (await page.evaluate(() => document.getElementById('a-text').textContent)) === mod.agreementText(ARTIST.data))
      ok(`${w}: no horizontal scroll`, (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0)
      await ctx.close()
    }
  }

  /* anything but the exact string keeps the brand copy */
  const { ctx, page } = await open(LOWER.id, 390)
  const t = await stepTexts(page)
  ok('segment "artist" (lower case) keeps the brand copy', /How the first drop works/.test(t.s1))
  await ctx.close()
}

await browser.close()
console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
