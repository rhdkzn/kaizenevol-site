/* WHO WE LOOK FOR — the Lead Finder's target spec.
 *
 * Rahaid, 2026-09-20: "make the lead scraper and owners portal default are brand
 * owners and that we can specify what... just focus on who we look for."
 *
 * The audit's finding was not that we had no ICP. fitOf() has carried the five
 * gates since 2026-09-05 and NOTHING UPSTREAM USED THEM: the finder searched a
 * free-text trade in Google Places and scored on star rating and review count,
 * which are signals about a shopfront. So this asserts the wiring, not the idea.
 *
 * It runs the real page in a browser rather than regexing the source, because
 * the thing being checked is what the functions DO with a saved spec.
 *
 * Run: node test-lead-target.mjs      (needs python3 -m http.server 8899 here)
 */
import { chromium } from 'playwright'
import { readFileSync } from 'fs'

const BASE = process.env.BASE || 'http://127.0.0.1:8899'
const r = []
const check = (n, pass, d) => r.push([n, pass, d])

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ssl-version-max=tls1.2'] })
const p = await b.newPage()
p.on('pageerror', e => check('the CRM script parses and runs', false, e.message))
await p.goto(BASE + '/crm.html', { waitUntil: 'domcontentloaded' })

/* 1. A BLANK SPEC MEANS BRAND OWNERS. This is the default he asked for, and the
      case that matters is the untouched one — localStorage empty. */
const blank = await p.evaluate(() => { localStorage.removeItem('ke_scraper'); return scraperSpec() })
check('a blank spec defaults to brand owners', blank.mode === 'brand', 'mode=' + blank.mode)
check('a blank spec ships real segments', blank.segments.length >= 3, blank.segments.join(','))
check('a blank spec carries a catalogue floor', blank.minSkus >= 8, 'minSkus=' + blank.minSkus)

/* 2. The spec is SPECIFIABLE and the queries follow it. A spec nothing reads is
      the state this whole change exists to end. */
const driven = await p.evaluate(() => {
  localStorage.setItem('ke_scraper', JSON.stringify({ mode: 'brand', segments: ['jewellery'], areas: 'Manchester', minSkus: 15 }))
  const spec = scraperSpec()
  return { spec, q: scraperQueries(spec) }
})
check('segments drive the searches', driven.q.length > 0 && driven.q.every(x => x.segment === 'jewellery'),
  driven.q.map(x => x.query).join(' | '))
check('areas drive the searches', driven.q.every(x => x.area === 'Manchester'))
check('the catalogue floor is read back', driven.spec.minSkus === 15)

/* 3. Brand queries ask for the OWNER, not for a shop that stocks the thing. The
      whole point of the expansion: "streetwear" returns retailers. */
const words = await p.evaluate(() => {
  const out = {}
  Object.keys(BRAND_QUERIES).forEach(k => { out[k] = BRAND_QUERIES[k] })
  return { out, segs: SEGMENTS.map(s => s.key) }
})
const OWNERISH = /\b(brand|label|studio|jeweller|management)\b/i
words.segs.forEach(k => {
  const qs = words.out[k]
  check(`"${k}" has brand-owner queries`, !!qs && qs.length > 0 && qs.every(q => OWNERISH.test(q)),
    qs ? qs.join(' | ') : 'MISSING')
})

/* 4. A brand is national. Local mode is a place search and still needs areas;
      brand mode must not refuse to run without them. */
const noAreas = await p.evaluate(() => {
  localStorage.setItem('ke_scraper', JSON.stringify({ mode: 'brand', segments: ['streetwear'], areas: '' }))
  return scraperQueries(scraperSpec())
})
check('brand mode runs with no areas set', noAreas.length > 0 && noAreas.every(x => x.area === 'UK'))

/* 5. THE RETIRED MODEL IS NOT STAMPED ON NEW LEADS. nicheKey forced anything
      containing loft/bathroom/kitchen onto those three labels — the reno model,
      still labelling every CSV import a fortnight after canon moved. */
const niches = await p.evaluate(() => ({
  loft: nicheKey('loft conversion'),
  kitchen: nicheKey('kitchen fitters'),
  streetwear: nicheKey('streetwear'),
  label: nicheKey('clothing label'),
  unknown: nicheKey('candle maker'),
}))
check('reno labels are no longer forced onto leads',
  niches.loft !== 'Loft' && niches.kitchen !== 'Kitchen', JSON.stringify(niches))
check('our own segments normalise', niches.streetwear === 'Streetwear' && niches.label === 'Clothing')
check('an unrecognised segment is kept, not flattened', niches.unknown === 'Candle maker', niches.unknown)

await p.close()

/* 6. The portal MIRRORS the spec and never writes it. Two editors for one setting
      is how the two pages start disagreeing about the target. */
const dash = readFileSync('dashboard.html', 'utf8')
check('the portal shows the target', /id="targetLine"/.test(dash) && /renderTarget\(\)/.test(dash))
check('the portal defaults to brand owners', /PORTAL_TARGET_DEFAULTS\s*=\s*\{\s*mode:\s*'brand'/.test(dash))
check('the portal never writes the spec',
  !/upsert\([^)]*SCRAPER_KEY|_cloudPush\(SCRAPER_KEY/.test(dash))

/* 7. The store check claims nothing it cannot establish. null must mean NOT
      ESTABLISHED, never "no" — otherwise an unreadable site scores a brand out. */
const api = readFileSync('api/brand-check.js', 'utf8')
check('the store check needs no new secret', !/process\.env\.(?!ALLOWED_ORIGINS)[A-Z_]+/.test(api),
  (api.match(/process\.env\.[A-Z_]+/g) || []).join(','))
check('the store check is origin-locked', /ALLOWED_ORIGINS/.test(api) && /403/.test(api))
check('unestablished stays null, not zero',
  /platform:\s*null,\s*skus:\s*null,\s*monthsTrading:\s*null/.test(api))

await b.close()
let failed = 0
for (const [n, pass, d] of r) { if (!pass) { failed++; console.log(`FAIL  ${n}   <- ${d || ''}`) } }
console.log(`\n${r.length - failed}/${r.length} checks passed — the finder looks for brand owners, and the spec is the thing that decides`)
process.exit(failed ? 1 : 0)
