/* The v3 board, driven in a REAL browser.
 *
 * test-crm-v3.mjs proves the engine's arithmetic. This proves the PAGE — that the
 * JavaScript survived the edit, that the board renders the cadence Diego is meant
 * to work, and that clicking the outcome buttons moves firms between the columns.
 * Those are different claims: a render can look perfect while load() never ran
 * (rahaid-os shipped exactly that on 2026-08-27, an offline page being
 * indistinguishable from a broken one). So this asserts on DATA that reached the
 * DOM, and fails on any console error rather than only on a missing element.
 *
 * Needs Playwright, which this repo does not depend on. Run it ad hoc:
 *   npm i playwright && node test-crm-v3-ui.mjs
 */
import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'

const PAGE = process.env.CRM_HTML || new URL('./crm.html', import.meta.url).pathname
const checks = []
const ok = (name, pass, detail) => checks.push([name, pass, detail])

const srv = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' }).end(fs.readFileSync(PAGE, 'utf8'))
})
await new Promise((r) => srv.listen(0, r))
const port = srv.address().port

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage()
page.on('dialog', (d) => d.dismiss().catch(() => {}))

/* Anything the page logs as an error is a failure here. The theme-IIFE incident
   threw at top level and every later function silently never existed. */
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.route('**/supabase-js@2**', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript',
  /* The gate asks SUPABASE whether there is a session, not our own localStorage
     - deliberately, so a self-minted token cannot open an app with no database
     behind it. So the stub has to answer getSession, or every assertion below
     runs against a hidden #app and innerText quietly degrades to textContent:
     the test would still pass while proving nothing was ever on screen. */
  body: 'window.supabase={createClient:()=>({from:()=>({select:()=>({eq:()=>({single:async()=>({data:null,error:null})})}),upsert:async()=>({error:null}),delete:()=>({in:async()=>({error:null})})}),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel(){},auth:{getSession:async()=>({data:{session:{user:{email:"rahaid@kaizenevol.com"}}},error:null}),signOut:async()=>{}}})};'
}))

const LEADS = [
  { id: 'screened', business: 'Baxter Kitchens Ltd', entityType: 'Ltd', area: 'Watford', niche: 'Kitchen',
    phone: '01923 000000', email: 'hi@baxter.co.uk', social: { ig: 'baxter' },
    tpsScreened: 'y', dialOk: 'y', stage: 'new', createdAt: 1 },
  { id: 'unscreened', business: 'Harrow Lofts Ltd', entityType: 'Ltd', area: 'Harrow', niche: 'Loft',
    phone: '020 8000 0000', email: 'hi@harrowlofts.co.uk', social: { ig: 'harrowlofts' },
    tpsScreened: 'n', dialOk: 'n', stage: 'new', createdAt: 2 },
  { id: 'soletrader', business: 'Dave The Fitter', entityType: 'Unknown', area: 'Luton', niche: 'Bathroom',
    phone: '01582 000000', email: 'dave@dave.co.uk', social: { ig: 'davefits' },
    tpsScreened: 'y', dialOk: 'y', stage: 'new', createdAt: 3 }
]

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' })
await page.evaluate((leads) => {
  localStorage.setItem('ke_leads', JSON.stringify(leads))
  localStorage.setItem('ke_session', JSON.stringify({ token: 'test', expires_at: Date.now() + 8.64e7 }))
  localStorage.setItem('crm_view', 'today')
}, LEADS)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)

/* The page survived at all. */
ok('the page script parsed and the engine is live',
  await page.evaluate(() => typeof applyOutcome === 'function' && typeof nextStepIdx === 'function'))
ok('the app is past the gate and visible',
  await page.evaluate(() => getComputedStyle(document.getElementById('app')).display !== 'none'))

await page.evaluate(() => { loadLeads().forEach(l => enrolLead(l.id, true)); renderSequence() })
await page.waitForTimeout(400)

const col = (id) => page.evaluate((i) => document.getElementById(i).innerText, id)

/* Enrolment routes each firm to the right FIRST channel, by gating alone. */
{
  const calls = await col('seqCalls'), emails = await col('seqEmails')
  ok('a screened Ltd opens on the call', calls.includes('Baxter Kitchens Ltd'), calls)
  ok('an unscreened Ltd opens on the email instead', emails.includes('Harrow Lofts Ltd'), emails)
  ok('a sole trader opens on the call, never the email',
    calls.includes('Dave The Fitter') && !emails.includes('Dave The Fitter'), calls + ' | ' + emails)
}

/* The cadence's instructions reach the card, which is the only place they matter. */
{
  const calls = await col('seqCalls'), emails = await col('seqEmails')
  /* Matched on the HINT's exact wording, not the word "voicemail" — the outcome
     button is also labelled Voicemail, so a loose regex passed with the hint line
     deleted. Caught by replaying that deletion before shipping. */
  ok('the call card tells him to leave a voicemail', /leave a 15-20s voicemail/i.test(calls), calls)
  ok('the call card carries the 16:45 slot', calls.includes('16:45'), calls)
  ok('the unscreened email card says STANDALONE opener', /standalone opener/i.test(emails), emails)
  ok('and never tells him to reference a call that did not happen',
    !/reference the voicemail/i.test(emails), emails)
}

/* The same-day pair, end to end through the real DOM. */
{
  await page.evaluate(() => logTouch('screened', 'no-answer'))
  await page.waitForTimeout(300)
  const lead = await page.evaluate(() => loadLeads().find(l => l.id === 'screened'))
  const today = await page.evaluate(() => todayStr())
  ok('logging call 1 schedules the paired email', lead.nextActionChannel === 'email', JSON.stringify(lead.nextActionChannel))
  ok('and it is due TODAY, not tomorrow', lead.nextActionDate === today, `${lead.nextActionDate} vs ${today}`)
  const emails = await col('seqEmails')
  ok('so the firm appears in Emails due immediately', emails.includes('Baxter Kitchens Ltd'), emails)
  ok('the paired email now references the voicemail', /reference the voicemail/i.test(emails), emails)
}

/* Bad data archives from the board rather than parking. */
{
  await page.evaluate(() => logTouch('soletrader', 'baddata'))
  await page.waitForTimeout(300)
  const lead = await page.evaluate(() => loadLeads().find(l => l.id === 'soletrader'))
  const calls = await col('seqCalls'), parked = await col('seqParked')
  ok('bad data archives the firm', lead.archived === 'y', JSON.stringify(lead.archived))
  ok('it leaves the due board', !calls.includes('Dave The Fitter'), calls)
  ok('and does not reappear in the parked queue', !parked.includes('Dave The Fitter'), parked)
}

/* Territory pause (P2 #13) — a real toggle that really empties a city. */
{
  const pills = await col('seqCities')
  ok('the territory strip lists the cities in play', /watford/i.test(pills), pills)
  await page.evaluate(() => toggleCityPause('watford'))
  await page.waitForTimeout(300)
  const emails = await col('seqEmails')
  ok('pausing a city clears its firms off the board', !emails.includes('Baxter Kitchens Ltd'), emails)
  await page.evaluate(() => toggleCityPause('watford'))
  await page.waitForTimeout(300)
  ok('and un-pausing brings them back', (await col('seqEmails')).includes('Baxter Kitchens Ltd'))
}

/* The bounce guard has to be LOUD — a silent pause looks like a quiet day. */
{
  await page.evaluate(() => {
    const arr = loadLeads()
    arr[0].touches = Array.from({ length: 30 }, (_, i) => ({ d: todayStr(), ch: 'email', o: i < 3 ? 'bounce' : 'sent' }))
    saveLeads(arr); renderSequence()
  })
  await page.waitForTimeout(300)
  const notice = await col('seqNotices')
  ok('a list over the bounce limit says so on the board', /email lane paused/i.test(notice), notice)
  ok('and states the rate it tripped on', /%/.test(notice), notice)
}

ok('no console errors anywhere in that run', errors.length === 0, errors.join(' | '))

await browser.close(); srv.close()
let failed = 0
for (const [n, pass, d] of checks) { if (!pass) failed++; console.log(`${pass ? 'PASS' : 'FAIL'} — ${n}${pass ? '' : '   <- ' + (d || '')}`) }
console.log(`\n${checks.length - failed}/${checks.length}`)
process.exit(failed ? 1 : 0)
