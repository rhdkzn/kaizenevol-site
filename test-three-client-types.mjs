/* Three client types on the onboarding link, the agreement and the CRM (Rahaid, 2026-09-27).
 *
 *   artist         creative retainer (FIN-PRI-004), segment 'Artist'
 *   brand owner    creative retainer (FIN-PRI-004), any other segment
 *   local business Kaizen Ascent: ads + socials, AI office, or both; the website free with either
 *
 * What must not move: every creative row's agreement, and every local row that does not take
 * ads + socials. A signed agreement is a hash of its words, so those are pinned byte for byte
 * against test-three-client-types.baseline.json, captured off main (180f98d) BEFORE this change,
 * together with the office-only page as main rendered it.
 *
 * Run: node test-three-client-types.mjs   (needs a static server on BASE, default :8899)
 *      SHOTS=dir node test-three-client-types.mjs   also saves the ads + socials screenshots
 */
import { chromium, devices } from 'playwright'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:8899'
const SHOTS = process.env.SHOTS || ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }
const has = (t, s) => t.includes(s)

const B = JSON.parse(readFileSync(new URL('./test-three-client-types.baseline.json', import.meta.url), 'utf8'))
const mod = await import('./api/onboard.js')
const { agreementText, agreementHash, publicView, payUrl } = mod

/* ── 1. nothing already out there moves ───────────────────────────────────── */
for (const [k, d] of Object.entries(B.rows)) {
  ok(`baseline ${k}: agreement byte-identical to main`, agreementHash(agreementText(d)) === B.agreements[k], agreementHash(agreementText(d)))
}
for (const k of ['officeFounding', 'officeStandard', 'officeBuyout']) {
  ok(`baseline ${k}: a new CRM row carrying parts:['office'] renders the same bytes`, agreementHash(agreementText({ ...B.rows[k], parts: ['office'] })) === B.agreements[k])
}

/* ── 2. artist and brand: the creative retainer, unchanged terms ──────────── */
const artistText = agreementText(B.rows.artist), brandText = agreementText(B.rows.brand)
const artistView = publicView({ id: 'A'.repeat(24), status: 'sent', data: B.rows.artist })
ok('artist: creative lane, segment Artist', artistView.lane === 'creative' && artistView.segment === 'Artist')
ok('artist: founding £1,000 fee line', has(artistText, '2.1 The retainer is £1,000 per month (founding rate, one of the first five clients)'))
ok('artist: three-month minimum', has(artistText, 'runs for an initial term of three months'))
ok('artist: no guarantee, the growth step instead', has(artistText, 'No outcome is guaranteed') && has(artistText, '3. THE GROWTH STEP'))
ok('artist: no website in the creative agreement', !/website/i.test(artistText))
ok('brand: standard £2,000 fee line', has(brandText, '2.1 The retainer is £2,000 per month (standard rate)'))
ok('brand: three-month minimum', has(brandText, 'runs for an initial term of three months'))
ok('brand: no guarantee, the growth step instead', has(brandText, 'No outcome is guaranteed') && has(brandText, '3. THE GROWTH STEP'))
ok('brand: creative lane', publicView({ id: 'B'.repeat(24), status: 'sent', data: B.rows.brand }).lane === 'creative')

/* ── 3. local: ads + socials only, and both ───────────────────────────────── */
const local = (parts, founding) => ({ lane: 'local', parts, business: 'Hollow Oak Barbers', founder: 'Dev Patel', founding, email: 'dev@hollowoak.co.uk', issuedAt: '2026-09-27', segment: 'Local' })
const PLACEHOLDER = /\[PLACEHOLDER, NOT RULED[^\]]*\]/
function adsCommon(t, label) {
  ok(`${label}: three-month minimum`, has(t, 'runs for an initial term of three months'))
  ok(`${label}: the website is free while the agreement runs`, has(t, 'at no charge for as long as this Agreement runs'))
  ok(`${label}: website buy-out £1,200 and £20/mo hosting after`, has(t, 'buy the website for £1,200') && has(t, '£20 per month, hosting only'))
  ok(`${label}: ad spend paid by the client to Meta, separate from the fee`, /paid by the Client directly to Meta/.test(t) && /not part of the Agency's fees/.test(t))
  ok(`${label}: ads guarantee: zero enquiries → next month's ads + socials fee free`, /no enquiries at all/.test(t) && /next month's ads and socials fee is free/.test(t))
  ok(`${label}: ads guarantee is a credit, never a refund`, /credit against the next month's ads and socials fee, never a refund/.test(t))
  ok(`${label}: ads guarantee only while the agreed ad budget keeps running`, /only while the Client keeps running the Agreed Ad Budget/.test(t))
  ok(`${label}: what counts as an enquiry is a MARKED placeholder, not a decision`, PLACEHOLDER.test(t), (t.match(/3\.\d+ [^\n]*enquir[^\n]*/g) || []).join(' | ').slice(0, 300))
  ok(`${label}: carries the 2026-09-27 version line`, has(t, 'Version 2026-09-27'))
}
const adsF = agreementText(local(['ads'], true)), adsS = agreementText(local(['ads'], false))
ok('ads only, founding: £750 locked-for-life fee line', has(adsF, '2.1 The fee for ads and socials is £750 per month (founding rate, one of the first five clients, locked for life: it does not rise for as long as this Agreement runs)'))
ok('ads only, standard: £1,000 fee line', has(adsS, '2.1 The fee for ads and socials is £1,000 per month (standard rate)'))
ok('ads only: no front office fee, no front office guarantee', !has(adsF, '£500') && !/front office catches nothing/.test(adsF))
ok('ads only: front office stated as not included', /front office is not part of this Agreement/.test(adsF))
ok('ads only: no front-office sub-processors (Twilio)', !has(adsF, 'Twilio'))
adsCommon(adsF, 'ads only')

const bothF = agreementText(local(['ads', 'office'], true)), bothS = agreementText(local(['office', 'ads'], false))
ok('both, founding: £750 + £500 = £1,250 fee line', has(bothF, '2.1 The fees are £750 per month for ads and socials and £500 per month for the front office, £1,250 per month in total (founding rates, one of the first five clients, locked for life: they do not rise for as long as this Agreement runs)'))
ok('both, standard: £1,000 + £750 = £1,750 fee line', has(bothS, '2.1 The fees are £1,000 per month for ads and socials and £750 per month for the front office, £1,750 per month in total (standard rates)'))
ok('both: the front office guarantee is kept', /front office catches nothing the Client would have missed/.test(bothF) && /opening hours/.test(bothF))
ok('both: the front office credit is the front office fee', /next month's front office fee free/.test(bothF))
ok('both: parts order does not change the text', agreementText(local(['office', 'ads'], true)) === bothF)
adsCommon(bothF, 'both')

/* ── 4. the page contract: fees, pay links ────────────────────────────────── */
const ENV = ['STRIPE_LOCAL_FOUNDING_LINK', 'STRIPE_LOCAL_STANDARD_LINK', 'STRIPE_LOCAL_ADS_FOUNDING_LINK', 'STRIPE_LOCAL_ADS_STANDARD_LINK']
const saved = Object.fromEntries(ENV.map(k => [k, process.env[k]]))
ENV.forEach(k => delete process.env[k])
const row = (id, data, status = 'sent') => ({ id, status, data })
const vAds = publicView(row('C'.repeat(24), local(['ads'], true)))
ok('publicView ads only: parts ["ads"], £750 total', JSON.stringify(vAds.parts) === '["ads"]' && vAds.retainer === 750, JSON.stringify([vAds.parts, vAds.retainer]))
ok('publicView ads only: fees broken down', vAds.fees && vAds.fees.ads === 750 && !vAds.fees.office, JSON.stringify(vAds.fees))
const vBoth = publicView(row('D'.repeat(24), local(['ads', 'office'], false)))
ok('publicView both, standard: £1,750 total, £1,000 + £750', vBoth.retainer === 1750 && vBoth.fees.ads === 1000 && vBoth.fees.office === 750, JSON.stringify(vBoth.fees))
const vOffice = publicView(row('E'.repeat(24), B.rows.officeFounding))
ok('publicView office only (no parts key): parts ["office"], £500', JSON.stringify(vOffice.parts) === '["office"]' && vOffice.retainer === 500)
ok('publicView creative: no parts', artistView.parts === null)
ok('ads links unset → ads-only row has no pay url (page says we will send it)', vAds.payUrl === '' && vAds.payUrlAds === '')
process.env.STRIPE_LOCAL_ADS_FOUNDING_LINK = 'https://buy.stripe.com/test_ads750'
process.env.STRIPE_LOCAL_ADS_STANDARD_LINK = 'https://buy.stripe.com/test_ads1000'
process.env.STRIPE_LOCAL_FOUNDING_LINK = 'https://buy.stripe.com/test_office500'
process.env.STRIPE_LOCAL_STANDARD_LINK = 'https://buy.stripe.com/test_office750'
ok('ads only, founding → the £750 ads link', payUrl(row('F'.repeat(24), local(['ads'], true))).startsWith('https://buy.stripe.com/test_ads750?'))
ok('ads only, standard → the £1,000 ads link', payUrl(row('F'.repeat(24), local(['ads'], false))).startsWith('https://buy.stripe.com/test_ads1000?'))
const pb = publicView(row('G'.repeat(24), local(['ads', 'office'], true)))
ok('both → office link AND ads link, each carrying the token', pb.payUrl.startsWith('https://buy.stripe.com/test_office500?client_reference_id=' + 'G'.repeat(24)) && pb.payUrlAds.startsWith('https://buy.stripe.com/test_ads750?client_reference_id=' + 'G'.repeat(24)), pb.payUrl + ' ' + pb.payUrlAds)
ok('office only → never an ads link, even when set', publicView(row('H'.repeat(24), B.rows.officeFounding)).payUrlAds === '')
ok('creative → never an ads link', publicView(row('I'.repeat(24), B.rows.brand)).payUrlAds === '')

/* ── 5. a real client cannot sign a placeholder ──────────────────────────── */
{
  const realFetch = globalThis.fetch
  const calls = []
  const hold = { id: 'J'.repeat(24), status: 'viewed', data: local(['ads'], true) }
  globalThis.fetch = async (url) => { calls.push(String(url)); return { ok: true, json: async () => (String(url).includes('onboard_peek') ? hold : null), text: async () => '' } }
  const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }
  const img = 'data:image/png;base64,' + 'A'.repeat(400)
  await mod.default({ method: 'POST', query: { op: 'sign', t: hold.id }, body: { name: 'Dev Patel', image: img, agreed: true }, headers: {}, socket: {} }, res)
  ok('sign: a real ads row is refused while the enquiry definition is a placeholder', res.code === 409 && !calls.some(u => u.includes('onboard_sign')), res.code + ' ' + JSON.stringify(res.body))
  calls.length = 0; hold.data = { ...hold.data, demo: true }
  await mod.default({ method: 'POST', query: { op: 'sign', t: hold.id }, body: { name: 'Dev Patel', image: img, agreed: true }, headers: {}, socket: {} }, res)
  ok('sign: a demo ads row may still be walked through', calls.some(u => u.includes('onboard_sign')), calls.join(' '))
  globalThis.fetch = realFetch
}

/* ── 6. the CRM writes the three types ───────────────────────────────────── */
const html = readFileSync(new URL('./crm.html', import.meta.url), 'utf8')
const a = html.indexOf('/* OB-LANE-START'), b = html.indexOf('/* OB-LANE-END */')
const { obRowData, obClientFromRow, obSeatsLeft } = new Function(html.slice(a, b) + '\n;return {obRowData, obClientFromRow, obSeatsLeft};')()
const lead = { id: 'L1', business: 'Hollow Oak Barbers', niche: 'Barbers' }
const f0 = { founder: 'Dev Patel', email: 'dev@hollowoak.co.uk', segment: '', tier: 'founding', start: '', baseline: '', notes: '', entity: '', address: '', buyout: '', parts: 'office' }
const KEYS = 'business,founder,email,segment,founding,retainer,startDate,baselineRevenue,proposalNotes,clientEntity,clientAddress,issuedAt,createdBy'
const ra = obRowData({ ...f0, lane: 'artist', segment: 'Rap' }, lead, '2026-09-27')
ok('CRM artist: creative row (no lane key), segment Artist, £1,000', !('lane' in ra) && ra.segment === 'Artist' && ra.retainer === 1000, JSON.stringify(ra))
ok('CRM artist: same key set as a creative row always had', Object.keys(ra).join(',') === KEYS, Object.keys(ra).join(','))
const rb = obRowData({ ...f0, lane: 'brand', tier: 'standard', segment: 'Streetwear' }, lead, '2026-09-27')
ok('CRM brand: creative row, typed segment, £2,000', !('lane' in rb) && rb.segment === 'Streetwear' && rb.retainer === 2000 && Object.keys(rb).join(',') === KEYS)
ok('CRM brand: a brand is never keyed Artist', obRowData({ ...f0, lane: 'brand', segment: 'Artist' }, lead, '2026-09-27').segment !== 'Artist')
const ro = obRowData({ ...f0, lane: 'local' }, lead, '2026-09-27')
ok('CRM local AI office: parts ["office"], £500 founding', ro.lane === 'local' && JSON.stringify(ro.parts) === '["office"]' && ro.retainer === 500)
const rads = obRowData({ ...f0, lane: 'local', parts: 'ads' }, lead, '2026-09-27')
ok('CRM local ads + socials: parts ["ads"], £750 founding / £1,000 standard', JSON.stringify(rads.parts) === '["ads"]' && rads.retainer === 750 && obRowData({ ...f0, lane: 'local', parts: 'ads', tier: 'standard' }, lead, 'x').retainer === 1000)
const rboth = obRowData({ ...f0, lane: 'local', parts: 'both' }, lead, '2026-09-27')
ok('CRM local both: parts ["ads","office"], £1,250 founding / £1,750 standard', JSON.stringify(rboth.parts) === '["ads","office"]' && rboth.retainer === 1250 && obRowData({ ...f0, lane: 'local', parts: 'both', tier: 'standard' }, lead, 'x').retainer === 1750)
ok('CRM row → agreement: the CRM ads row renders the ads agreement', /ads and socials is £750 per month/.test(agreementText(rads)))
ok('CRM row → agreement: the CRM office row renders the baseline office text', agreementText({ ...ro, issuedAt: '2026-09-25', business: 'Hollow Oak Barbers' }).startsWith('SERVICES AGREEMENT: KAIZEN ASCENT') && !/ads and socials/.test(agreementText(ro)))
const cBoth = obClientFromRow(rboth, lead, 'tok', 'now', 'c1')
ok('CRM client card, both: £1,250 terms naming both parts', cBoth.retainerValue === 1250 && /£1,250/.test(cBoth.terms) && /ads \+ socials/i.test(cBoth.terms) && /AI office/i.test(cBoth.terms), cBoth.terms)
ok('CRM client card, AI office only: terms unchanged', obClientFromRow(ro, lead, 't', 'n', 'c').terms === 'Founding £500/mo')
ok('CRM client card, ads only: £750 ads + socials', /£750/.test(obClientFromRow(rads, lead, 't', 'n', 'c').terms) && /ads \+ socials/i.test(obClientFromRow(rads, lead, 't', 'n', 'c').terms))
ok('CRM seats: artists and brands share the creative five', obSeatsLeft([{ status: 'paid', data: { founding: true, segment: 'Artist' } }, { status: 'paid', data: { founding: true, segment: 'Streetwear' } }], 'creative') === 3)
ok('CRM modal: a Client type select with Artist / Brand owner / Local business', /id="obLane"[\s\S]{0,400}value="artist"[\s\S]{0,200}value="brand"[\s\S]{0,200}value="local"/.test(html))
ok('CRM modal: a Parts select (AI office / ads + socials / both)', /id="obParts"[\s\S]{0,400}value="office"[\s\S]{0,200}value="ads"[\s\S]{0,200}value="both"/.test(html))

/* ── 7. the page, in a browser ───────────────────────────────────────────── */
const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}) })
async function open(data, width, status = 'sent') {
  const phone = width < 600
  const ctx = await browser.newContext(phone ? { ...devices['iPhone 13'], viewport: { width, height: 844 } } : { viewport: { width, height: 900 } })
  const page = await ctx.newPage(); const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const r = { id: 'PageTokenPageTokenPageTok1', status, data: status === 'sent' ? data : { ...data, signature: { name: data.founder, at: '2026-09-27T10:00:00Z', hash: 'x'.repeat(64) } } }
  await page.route('**/api/onboard**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(publicView(r)) }))
  await page.goto(BASE + '/onboard.html?t=' + r.id, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.getElementById('loading').style.display === 'none', null, { timeout: 15000 })
  return { ctx, page, errors }
}
ENV.forEach(k => delete process.env[k])
/* office only: the page main rendered, word for word */
for (const k of ['officeFounding', 'officeStandard']) {
  for (const [st, sel, key] of [['sent', '#s1', 'proposal'], ['signed', '#s3', 'payment'], ['paid', '#s4', 'done']]) {
    const { ctx, page } = await open(B.rows[k], 1280, st)
    await page.waitForSelector(sel + '.on')
    const t = await page.innerText(sel)
    ok(`page ${k} ${key}: identical to main`, t === B.pages[k][key], firstDiff(t, B.pages[k][key]))
    await ctx.close()
  }
}
function firstDiff(x, y) { let i = 0; while (i < x.length && x[i] === y[i]) i++; return `at ${i}: now "${x.slice(i, i + 80)}" / main "${y.slice(i, i + 80)}"` }

/* artist and brand still get their own words */
{
  const { ctx, page } = await open(B.rows.artist, 1280); const t = await page.innerText('#s1')
  ok('page artist: release calendar, not drop calendar', /release calendar/.test(t) && !/drop calendar/.test(t)); await ctx.close()
}
{
  const { ctx, page } = await open(B.rows.brand, 1280); const t = await page.innerText('#s1')
  ok('page brand: drop calendar, not release calendar', /drop calendar/.test(t) && !/release calendar/.test(t)); await ctx.close()
}

/* ads + socials only, the demo row, at phone and desktop */
const adsDemo = { ...local(['ads'], true), business: 'Demo Barbers', demo: true }
for (const width of [390, 1440]) {
  const w = width + 'px'
  const { ctx, page, errors } = await open(adsDemo, width)
  const t = await page.innerText('#s1')
  ok(`${w} ads only: no script errors`, errors.length === 0, errors.join(' | '))
  ok(`${w} ads only: fee £750/mo, locked for life`, /£750\/mo/.test(t) && /locked for life/i.test(t), (t.match(/.{0,40}£\d.{0,60}/g) || []).join(' | '))
  ok(`${w} ads only: never shows the £500 office fee`, !/£500/.test(t))
  ok(`${w} ads only: speaks about ads and socials`, /ads and socials/i.test(t))
  ok(`${w} ads only: the website, free`, /website/i.test(t) && /free|no charge/i.test(t))
  ok(`${w} ads only: no front office promises`, !/front office/i.test(t), (t.match(/.{0,50}front office.{0,50}/i) || [''])[0])
  ok(`${w} ads only: guarantee is a credit on the ads + socials fee, while the ad budget runs`, /no enquiries/i.test(t) && /credit/i.test(t) && /ad budget/i.test(t))
  ok(`${w} ads only: ad spend is theirs, paid to Meta`, /Meta/.test(t))
  ok(`${w} ads only: three months minimum`, /Three months/i.test(t))
  ok(`${w} ads only: no horizontal scroll`, (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0)
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ads-proposal-${width}.png`, fullPage: true })
  await page.click('#s1 .btn-solid'); await page.waitForSelector('#s2.on')
  ok(`${w} ads only: agreement step shows the ads agreement`, /THE GUARANTEE/.test(await page.innerText('#a-text')) && /ads and socials is £750/.test(await page.innerText('#a-text')))
  ok(`${w} ads only: the page warns the enquiry definition is not settled`, await page.isVisible('#a-unruled'))
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ads-agreement-${width}.png`, fullPage: false })
  await ctx.close()
}
/* both parts, and the pay step with both links set */
process.env.STRIPE_LOCAL_ADS_FOUNDING_LINK = 'https://buy.stripe.com/test_ads750'
process.env.STRIPE_LOCAL_FOUNDING_LINK = 'https://buy.stripe.com/test_office500'
for (const width of [390, 1440]) {
  const w = width + 'px'
  const bothRow = local(['ads', 'office'], true)
  let { ctx, page, errors } = await open(bothRow, width)
  const t = await page.innerText('#s1')
  ok(`${w} both: £750 ads + £500 office, £1,250 a month`, /£750/.test(t) && /£500/.test(t) && /£1,250/.test(t), (t.match(/.{0,40}£\d.{0,60}/g) || []).join(' | '))
  ok(`${w} both: front office and ads and socials both described`, /front office/i.test(t) && /ads and socials/i.test(t))
  ok(`${w} both: both guarantees`, /would have missed/i.test(t) && /no enquiries/i.test(t))
  ok(`${w} both: no script errors`, errors.length === 0, errors.join(' | '))
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/both-proposal-${width}.png`, fullPage: true })
  await ctx.close();
  ({ ctx, page } = await open(bothRow, width, 'signed'))
  await page.waitForSelector('#s3.on')
  ok(`${w} both, pay step: two pay buttons, office and ads`, await page.isVisible('#pay-btn') && await page.isVisible('#pay-btn-ads'))
  ok(`${w} both, pay step: ads button goes to the ads link`, (await page.getAttribute('#pay-btn-ads', 'href')).startsWith('https://buy.stripe.com/test_ads750'))
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/both-pay-${width}.png`, fullPage: false })
  await ctx.close()
}
delete process.env.STRIPE_LOCAL_ADS_FOUNDING_LINK
{
  const { ctx, page } = await open(local(['ads', 'office'], true), 390, 'signed')
  await page.waitForSelector('#s3.on')
  ok('both, ads link unset: no half-set pay buttons, "we will send your payment link"', !(await page.isVisible('#pay-btn')) && !(await page.isVisible('#pay-btn-ads')) && await page.isVisible('#r-nolink-l'))
  await ctx.close()
}
await browser.close()
ENV.forEach(k => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] })

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
