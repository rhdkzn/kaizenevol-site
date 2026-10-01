/* The seat ladder (Rahaid, 2026-09-30; two prices per lane from 2026-10-01). Replaces "£1,000/mo
 * founding for the first five clients, £2,000 standard".
 *
 *   Five artists and five brands at a time, priced per lane by seat:
 *     Brands   seats 1-5 £1,000 (founding) · standard £2,000
 *     Artists  seats 1-5 £500   (founding) · standard £1,000
 *   The seats 4-5 tier ('second', £1,500 / £750) is gone; a stored row carrying it reads as founding.
 *   The growth step is unchanged on top. Founding ends at the first step (clause 2.4).
 *
 * Part 1 (node) renders the creative agreement for every lane and tier and checks clause 2.1
 * and 2.4 state the right figure and the right words, and that every other line is the same
 * as the pre-ladder text. The local agreement and a pre-ladder row (the free pilots, anything
 * already issued) must render exactly what main rendered. No seat may borrow a Stripe link
 * for a different amount.
 * Part 2 drives the retainer helpers shipped in crm.html and portal.html.
 * Part 3 drives crm.html in a browser: the Edit details Price tier select fills the retainer
 * for an artist and for a brand, and a free pilot opened and saved is not repriced.
 *
 * Run: node test-seat-ladder.mjs   (Part 3 needs a static server on BASE, default :8899)
 * SHOTS=<dir> also saves the Edit details form at 390px for an artist and a brand.
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import * as api from './api/onboard.js'

const BASE = process.env.BASE || 'http://127.0.0.1:8899'
const SHOTS = process.env.SHOTS || ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }
const line = (t, n) => (t.split('\n').find(l => l.startsWith(n + ' ')) || '')

/* ── Part 1: the agreement ── */
const LADDER = {
  Brand:  { founding: 1000, standard: 2000 },
  Artist: { founding: 500,  standard: 1000 },
}
const TIERS = ['founding', 'standard']
/* the live links (Law, 2026-10-01); the retired £1,500 brand and £750 artist links must never appear */
const LINKS = {
  'Brand:founding': 'https://buy.stripe.com/aFa5kF78wgpncajbPV6AM0g', 'Brand:standard': 'https://buy.stripe.com/fZu00l64s8WV6PZaLR6AM0h',
  'Artist:founding': 'https://buy.stripe.com/eVqbJ3dwU4GF7U3cTZ6AM0i', 'Artist:standard': 'https://buy.stripe.com/8x25kFgJ6a0Z2zJ6vB6AM0k',
}
const gbp = n => '£' + n.toLocaleString('en-GB')
const row = (segment, tier, extra) => ({ business: 'Kiln & Co', founder: 'Priya Nair', segment, tier, founding: tier === 'founding', startDate: '2026-10-01', issuedAt: '2026-09-30', email: 'p@kiln.co', ...extra })
/* the pre-ladder text for the same particulars: every line but 2.1 and 2.4 must match it */
const legacy = api.agreementText({ business: 'Kiln & Co', founder: 'Priya Nair', founding: true, startDate: '2026-10-01', issuedAt: '2026-09-30', email: 'p@kiln.co' })
const rest = t => t.split('\n').filter(l => !/^2\.(1|4) /.test(l)).join('\n')

for (const seg of ['Brand', 'Artist']) {
  const w = seg.toLowerCase()
  for (const tier of TIERS) {
    const fee = LADDER[seg][tier], t = api.agreementText(row(seg, tier, { retainer: fee }))
    const c21 = line(t, '2.1'), c24 = line(t, '2.4')
    const words = { founding: `(founding rate, one of the Agency's first five ${w} clients)`, standard: '(standard rate)' }[tier]
    ok(`${seg} ${tier}: 2.1 states ${gbp(fee)} per month`, c21.startsWith(`2.1 The retainer is ${gbp(fee)} per month `), c21)
    ok(`${seg} ${tier}: 2.1 names the tier in words`, c21.includes(`per month ${words}, covering all four services`), c21)
    ok(`${seg} ${tier}: the old "first five clients" rule is gone`, !/first five clients\b/.test(t) && !/first five clients/.test(c21))
    ok(`${seg} ${tier}: same figure with no retainer on the row`, line(api.agreementText(row(seg, tier)), '2.1') === c21)
    if (tier === 'founding') {
      ok(`${seg} founding: 2.4 ends the discount at the first step, into ${gbp(LADDER[seg].standard)}`,
        c24 === `2.4 The founding rate is a discount for one of the Agency's first five ${w} clients. It ends at the first growth step under clause 3, at which point the retainer becomes the standard rate of ${gbp(LADDER[seg].standard)} per month in place of the £1,000 increase in clause 3.2; any later step then applies from the standard rate.`, c24)
    } else {
      ok(`${seg} ${tier}: no clause 2.4 (the step in clause 3.2 applies from the tier price)`, !c24, c24)
    }
    ok(`${seg} ${tier}: every other line identical to the pre-ladder agreement`, rest(t) === rest(legacy))
    ok(`${seg} ${tier}: growth step unchanged (+50%, £1,000, one-off bonus)`, /at least 50% above/.test(t) && /rises by £1,000 per month permanently/.test(t) && /one-off bonus equal to one month at the new rate/.test(t))
    ok(`${seg} ${tier}: no em dash added to 2.1 or 2.4`, !/—/.test(c21 + c24))
    ok(`${seg} ${tier}: an edited retainer still wins`, line(api.agreementText(row(seg, tier, { retainer: 1234 })), '2.1').includes('£1,234 per month'))

    /* Stripe: every seat has its own live link for its own amount. Artist seats read their env
       link first (set on Vercel or not), falling back to the live link. */
    const envName = { 'Artist:founding': 'STRIPE_ARTIST_FOUNDING_LINK', 'Artist:standard': 'STRIPE_ARTIST_STANDARD_LINK' }[seg + ':' + tier]
    const r = { id: 'S'.repeat(24), data: row(seg, tier, { retainer: fee }) }
    const saved = envName && process.env[envName]; if (envName) delete process.env[envName]
    ok(`${seg} ${tier}: env unset → the live ${gbp(fee)} link`, api.payUrl(r).startsWith(LINKS[seg + ':' + tier] + '?client_reference_id=SSSS'), api.payUrl(r))
    if (envName) {
      process.env[envName] = 'https://buy.stripe.com/test_' + w + '_' + tier
      ok(`${seg} ${tier}: ${envName} wins when set`, api.payUrl(r).startsWith('https://buy.stripe.com/test_' + w + '_' + tier + '?client_reference_id=SSSS'), api.payUrl(r))
      if (saved === undefined || saved === false) delete process.env[envName]; else process.env[envName] = saved
    }

    const v = api.publicView(r)
    ok(`${seg} ${tier}: the page gets the seat (tier, word, fee)`, v.tier === tier && v.seatWord === w && v.retainer === fee && v.founding === (tier === 'founding'), JSON.stringify({ tier: v.tier, w: v.seatWord, r: v.retainer, f: v.founding }))
  }
}
/* A row stored with the retired 'second' tier must not crash and reads as founding (seats 1-5). */
for (const seg of ['Brand', 'Artist']) {
  const r2 = { id: 'Q'.repeat(24), data: row(seg, 'second') }
  let t2 = '', v2 = null, u2 = ''
  try { t2 = api.agreementText(r2.data); v2 = api.publicView(r2); u2 = api.payUrl(r2) } catch (e) { t2 = 'THREW ' + e.message }
  ok(`${seg} legacy 'second' row renders as founding`, line(t2, '2.1') === line(api.agreementText(row(seg, 'founding')), '2.1'), line(t2, '2.1') || t2)
  ok(`${seg} legacy 'second' row: view founding at ${gbp(LADDER[seg].founding)}, founding pay link`, v2 && v2.tier === 'founding' && v2.retainer === LADDER[seg].founding && u2.startsWith(LINKS[seg + ':founding']), JSON.stringify(v2 && { t: v2.tier, r: v2.retainer, u: u2 }))
}
const src = readFileSync(new URL('./api/onboard.js', import.meta.url), 'utf8')
ok('onboard.js: no seats 4-5 tier, env var or "first three" wording left', !/second:\s*\d|STRIPE_\w*SECOND|first three/.test(src))
ok('brand and artist founding texts differ', api.agreementText(row('Brand', 'founding')) !== api.agreementText(row('Artist', 'founding')))

/* Pre-ladder rows and the local lane: byte for byte what main rendered. The hashes were taken
   off main (1f6fd3c) before the ladder existed. */
const PILOT = { business: 'Marauder', founder: 'Sam Okafor', founding: true, retainer: 1000, startDate: '2026-10-01', issuedAt: '2026-09-06', email: 'sam@marauder.co.uk' }
ok('pre-ladder founding row (no tier) unchanged', api.agreementHash(api.agreementText(PILOT)) === '080892daef453ea931e3d44c0249a832334a26dd78a280c091d5156acb663e3c')
ok('pre-ladder row with a segment but no tier unchanged', api.agreementText({ ...PILOT, segment: 'Artist' }) === api.agreementText(PILOT))
ok('a tier with a segment that is not Artist or Brand stays pre-ladder (never guesses a lane)', api.agreementText({ ...PILOT, segment: 'Streetwear', tier: 'second' }) === api.agreementText(PILOT))
ok('pre-ladder view: no tier, old founding flag', api.publicView({ id: 'P'.repeat(24), data: PILOT }).tier === '' && api.publicView({ id: 'P'.repeat(24), data: PILOT }).founding === true)
const lf = { lane: 'local', business: 'Hollow Oak Barbers', founder: 'Dev Patel', founding: true, retainer: 500, startDate: '2026-10-01', issuedAt: '2026-09-25', email: 'dev@hollowoak.co.uk' }
const ls = { ...lf, founding: false, retainer: 750, email: '' }
ok('local founding agreement byte-identical to main', api.agreementHash(api.agreementText(lf)) === '129faa90be322583d0ff45121825208871d0411bb962cbc10f72a41f6d0b949a', api.agreementHash(api.agreementText(lf)))
ok('local standard agreement byte-identical to main', api.agreementHash(api.agreementText(ls)) === '221ea7fb18e4e5167f94f331f0bf1d5c9cc3e97d92ab94ab7343aa5a7542c9ee', api.agreementHash(api.agreementText(ls)))
ok('local row ignores a tier and a segment (Kaizen Ascent is not on the ladder)', api.agreementText({ ...lf, tier: 'second', segment: 'Artist' }) === api.agreementText(lf))
ok('local view: no tier', api.publicView({ id: 'L'.repeat(24), data: { ...lf, tier: 'second', segment: 'Artist' } }).tier === '')

/* ── Part 2: the retainer helpers shipped in crm.html and portal.html ── */
for (const f of ['crm.html', 'portal.html']) {
  const html = readFileSync(new URL('./' + f, import.meta.url), 'utf8')
  const a = html.indexOf('/* RETAINER-BASE-START'), b = html.indexOf('/* RETAINER-BASE-END */')
  let h = null
  try { h = new Function(html.slice(a, b) + '; return { retainerBase, steppedRetainer };')() } catch (e) { }
  ok(`${f}: retainerBase and steppedRetainer found`, !!(h && h.steppedRetainer), 'no steppedRetainer between the RETAINER-BASE markers')
  if (!h || !h.steppedRetainer) continue
  const S = { foundingValue: 1000, retainerValue: 2000, stepValue: 1000 }
  for (const seg of ['Brand', 'Artist']) for (const tier of TIERS)
    ok(`${f}: ${seg} ${tier} with no retainerValue → ${gbp(LADDER[seg][tier])}`, h.retainerBase({ segment: seg, tier }, S) === LADDER[seg][tier], h.retainerBase({ segment: seg, tier }, S))
  ok(`${f}: artist founding after one step is £1,000 (clause 2.4), not £1,500`, h.steppedRetainer({ segment: 'Artist', tier: 'founding', retainerValue: 500 }, S, 1) === 1000)
  ok(`${f}: artist founding after two steps is £2,000`, h.steppedRetainer({ segment: 'Artist', tier: 'founding', retainerValue: 500 }, S, 2) === 2000)
  ok(`${f}: brand standard after one step is £3,000 (step on the tier price)`, h.steppedRetainer({ segment: 'Brand', tier: 'standard', retainerValue: 2000 }, S, 1) === 3000)
  ok(`${f}: a legacy 'second' brand with no retainerValue prices as founding £1,000`, h.retainerBase({ segment: 'Brand', tier: 'second' }, S) === 1000)
  ok(`${f}: a legacy 'second' artist steps into £1,000 like founding`, h.steppedRetainer({ segment: 'Artist', tier: 'second' }, S, 1) === 1000)
  ok(`${f}: free pilot (founding, £0, no tier) stays £0`, h.retainerBase({ segment: 'Artist', founding: true, retainerValue: 0 }, S) === 0 && h.steppedRetainer({ segment: 'Artist', founding: true, retainerValue: 0 }, S, 0) === 0)
  ok(`${f}: pre-ladder founding client (no tier) still £1,000 then +£1,000 per step`, h.retainerBase({ founding: true }, S) === 1000 && h.steppedRetainer({ founding: true }, S, 1) === 2000)
  ok(`${f}: a local client is never priced off the ladder`, h.retainerBase({ lane: 'local', segment: 'Local', tier: 'founding', founding: true }, S) === 1000)
}
{
  const html = readFileSync(new URL('./portal.html', import.meta.url), 'utf8')
  const i = html.indexOf('function rateWords(c, g){'), j = i < 0 ? -1 : html.indexOf('\n  }\n', i)
  let rw = null; try { rw = new Function(html.slice(i, j + 4) + '; return rateWords;')() } catch (e) { }
  ok('portal: rateWords found', !!rw)
  if (rw) {
    ok('portal: artist founding reads "founding rate, one of our first five artists"', rw({ segment: 'Artist', tier: 'founding', founding: true }, { steps: 0 }) === 'founding rate, one of our first five artists')
    ok('portal: brand founding reads its seat', rw({ segment: 'Brand', tier: 'founding', founding: true }, { steps: 0 }) === 'founding rate, one of our first five brands')
    ok('portal: a legacy "second" row reads as founding', rw({ segment: 'Brand', tier: 'second' }, { steps: 0 }) === 'founding rate, one of our first five brands')
    ok('portal: founding reads standard rate once a step has fired', rw({ segment: 'Artist', tier: 'founding', founding: true }, { steps: 1 }) === 'standard rate')
    ok('portal: pre-ladder founding client reads as before', rw({ founding: true }, { steps: 0 }) === 'founding rate')
  }
  const crm = readFileSync(new URL('./crm.html', import.meta.url), 'utf8')
  ok('crm: default checklist no longer quotes the old rule', /Retainer agreement signed at the agreed seat price/.test(crm) && !/£1,000\/mo founding, first five/.test(crm))
  ok('crm: onboarding Rate select offers the two tiers', /id="obTier"[^>]*><option value="founding">[^<]*<\/option><option value="standard">[^<]*<\/option><\/select>/.test(crm))
  ok('crm: no Seats 4-5 tier left anywhere', !/Seats 4-5|second:\s*\d|'second',/.test(crm))
  const a = crm.indexOf('/* OB-LANE-START'), b = crm.indexOf('/* OB-LANE-END */')
  const { obRowData, obClientFromRow, obSeatsLeft } = new Function(crm.slice(a, b) + '\n;return {obRowData, obClientFromRow, obSeatsLeft};')()
  const lead = { id: 'L1', business: 'Nova Ray', niche: 'Music' }
  const base = { lane: 'creative', founder: 'Nova Ray', email: 'n@r.co', start: '', baseline: '', notes: '', entity: '', address: '', buyout: '' }
  for (const seg of ['Brand', 'Artist']) for (const tier of TIERS) {
    const d = obRowData({ ...base, segment: seg, tier }, lead, '2026-09-30'), c = obClientFromRow(d, lead, 'tok', 'now', 'c_1')
    ok(`crm onboarding row: ${seg} ${tier} → ${gbp(LADDER[seg][tier])}, tier and segment on the row`, d.retainer === LADDER[seg][tier] && d.tier === tier && d.segment === seg && d.founding === (tier === 'founding'), JSON.stringify(d))
    ok(`crm Mark paid: ${seg} ${tier} client carries the tier and price`, c.tier === tier && c.retainerValue === LADDER[seg][tier] && c.founding === (tier === 'founding'), JSON.stringify(c))
    ok(`crm onboarding row → agreement: ${seg} ${tier} states ${gbp(LADDER[seg][tier])}`, line(api.agreementText(d), '2.1').includes(gbp(LADDER[seg][tier]) + ' per month'))
  }
  const loc = obRowData({ ...base, lane: 'local', segment: '', tier: 'founding' }, lead, '2026-09-30')
  ok('crm onboarding row: local unchanged (£500, no tier, segment Local)', loc.retainer === 500 && !('tier' in loc) && loc.segment === 'Local' && loc.lane === 'local')
  ok('crm onboarding row: a stray "second" tier falls back to standard, never £1,500', obRowData({ ...base, segment: 'Brand', tier: 'second' }, lead, '2026-10-01').retainer === 2000)
  const rows = [{ status: 'paid', data: { founding: true, segment: 'Artist', tier: 'founding' } }, { status: 'signed', data: { founding: true, segment: 'Brand', tier: 'founding' } }, { status: 'live', data: { founding: true, segment: 'Artist', tier: 'founding' } }]
  ok('crm founding seats: counted per lane out of five', obSeatsLeft(rows, 'creative', 'Artist') === 3 && obSeatsLeft(rows, 'creative', 'Brand') === 4)
  ok('crm founding seats: local still out of five', obSeatsLeft([{ status: 'paid', data: { founding: true, lane: 'local' } }], 'local') === 4)
}

/* ── Part 3: the Edit details form, in a browser ── */
const SEED = {
  clients: [
    { id: 'c_art', name: 'Nova Ray', founder: 'Nova Ray', email: 'nova@ray.co', segment: 'Artist', status: 'active', terms: '', adSpend: 'per drop' },
    { id: 'c_brand', name: 'Kiln & Co', founder: 'Priya Nair', email: 'p@kiln.co', segment: 'Brand', status: 'active', terms: '', adSpend: 'per drop' },
    { id: 'c_pilot', name: 'FulaFalu', founder: 'Fula Falu', email: 'f@f.co', segment: 'Artist', status: 'active', terms: 'Free pilot', retainerValue: 0, founding: true, feeAfter: 'Agreed later' },
  ],
  clientTasks: {}, growth: { snapshots: [] },
  settings: { retainerValue: 2000, foundingValue: 1000, stepValue: 1000, stepTrigger: 1.5 },
}
const CRM_STUB = `window.supabase={createClient:function(){function q(){var o={select:()=>o,eq:()=>o,in:()=>o,order:()=>o,limit:()=>o,single:()=>Promise.resolve({data:null}),maybeSingle:()=>Promise.resolve({data:null}),update:()=>o,insert:()=>Promise.resolve({}),upsert:()=>Promise.resolve({}),then:(f)=>Promise.resolve({data:[]}).then(f)};return o}return{auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>{},signInWithOtp:()=>Promise.resolve({})},from:q,rpc:()=>Promise.resolve({}),channel:()=>({on(){return this},subscribe(){return this}}),storage:{from:()=>({list:()=>Promise.resolve({data:[]})})}}}}`
const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
let browser = null
try { browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}) }) } catch (e) { console.log('CANNOT RUN Part 3: no browser (' + e.message.split('\n')[0] + ')'); fails++ }
if (browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.route('**/@supabase/supabase-js@2**', r => r.fulfill({ contentType: 'application/javascript', body: CRM_STUB }))
  await page.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ke_data', d); localStorage.removeItem('crm_open_client'); sessionStorage.setItem('seeded', '1') } }, JSON.stringify(SEED))
  try {
    await page.goto(BASE + '/crm.html', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(600)
    await page.evaluate(() => { document.getElementById('app').style.display = 'block'; document.getElementById('gate').style.display = 'none'; showView('clients'); renderClients(load()) })
    const edit = id => page.evaluate(id => { if (clOpenId() !== id) toggleClient(id); clEditStart(id) }, id)
    const pick = (id, tier) => page.evaluate(([id, tier]) => { const s = document.querySelector('#card_' + id + ' select[name=tier]'); if (!s) return null; s.value = tier; s.dispatchEvent(new Event('change', { bubbles: true })); const f = s.form; return { r: f.elements.retainerValue.value, f: f.elements.founding.checked, hint: (f.querySelector('.ce-tier-price') || {}).textContent || '' } }, [id, tier])
    for (const [id, seg] of [['c_art', 'Artist'], ['c_brand', 'Brand']]) {
      await edit(id); await page.waitForTimeout(100)
      ok(`${seg}: Edit details has a Price tier select (Not set / Founding / Standard)`, await page.evaluate(id => { const s = document.querySelector('#card_' + id + ' select[name=tier]'); return !!s && [...s.options].map(o => o.value).join() === ',founding,standard' }, id))
      for (const tier of ['standard', 'founding']) {
        const got = await pick(id, tier)
        ok(`${seg}: tier ${tier} fills retainer ${LADDER[seg][tier]}`, got && got.r === String(LADDER[seg][tier]) && got.f === (tier === 'founding'), JSON.stringify(got))
      }
      if (SHOTS) await page.locator('#card_' + id + ' form.ce-form').screenshot({ path: `${SHOTS}/crm-edit-tier-${seg.toLowerCase()}-390.png` })
      ok(`${seg}: the retainer stays editable after the tier fills it`, await page.evaluate(id => { const f = document.querySelector('#card_' + id + ' form.ce-form'); f.elements.retainerValue.value = '1234'; f.elements.retainerValue.dispatchEvent(new Event('input', { bubbles: true })); f.querySelector('button[type=submit]').click(); const c = load().clients.find(x => x.id === id); return c.retainerValue === 1234 && c.tier === 'founding' && c.founding === true }, id))
    }
    /* changing the segment with a tier set re-prices for the new lane */
    await edit('c_brand'); await page.waitForTimeout(100)
    await pick('c_brand', 'standard')
    const reseg = await page.evaluate(() => { const f = document.querySelector('#card_c_brand form.ce-form'); f.elements.segment.value = 'Artist'; f.elements.segment.dispatchEvent(new Event('change', { bubbles: true })); return f.elements.retainerValue.value })
    ok('segment Brand → Artist with tier Standard re-fills £1,000', reseg === '1000', reseg)
    const loc = await page.evaluate(() => { const f = document.querySelector('#card_c_brand form.ce-form'); f.elements.segment.value = 'Local'; f.elements.segment.dispatchEvent(new Event('change', { bubbles: true })); const tr = f.querySelector('.ce-tier-row'); return tr ? tr.style.display : 'missing' })
    ok('segment Local hides the tier (local is not on the ladder)', loc === 'none', loc)
    await page.evaluate(() => clEditCancel())
    /* the free pilot: open, save untouched → still £0, still founding, no tier */
    await edit('c_pilot'); await page.waitForTimeout(100)
    const pv = await page.evaluate(() => { const f = document.querySelector('#card_c_pilot form.ce-form'); return { tier: f.elements.tier.value, r: f.elements.retainerValue.value } })
    ok('free pilot: tier reads Not set and retainer £0', pv.tier === '' && pv.r === '0', JSON.stringify(pv))
    const pc = await page.evaluate(() => { document.querySelector('#card_c_pilot form.ce-form button[type=submit]').click(); return load().clients.find(x => x.id === 'c_pilot') })
    ok('free pilot: saving untouched keeps £0, founding and no tier', pc.retainerValue === 0 && pc.founding === true && !('tier' in pc) && pc.terms === 'Free pilot', JSON.stringify(pc))
    ok('no page errors', !errors.length, errors.join(' | '))
  } catch (e) { ok('Part 3 ran to the end', false, e.message.split('\n')[0]) } finally { await browser.close() }
}

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
