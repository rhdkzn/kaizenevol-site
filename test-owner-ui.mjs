// 2026-08-24: owner research, driven in a real browser.
//
// The reducer tests in rahaid-crm/test-owner.mts prove the ENGINE never returns a
// dialable number. This proves the CRM never RENDERS one as dialable, which is a
// different claim and the one a person actually acts on. A direct number is very
// often a personal mobile, and a personal mobile is exactly the kind of number that
// is TPS-registered — so a tel: link on one is the fine-category mistake, made with
// a thumb.
//
// Needs Playwright, which this repo does not depend on. Run it ad hoc:
//   npm i playwright && node test-owner-ui.mjs
import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'

const PAGE = new URL('./crm.html', import.meta.url).pathname
const checks = []
const ok = (name, pass) => checks.push([name, pass])

// What the engine returns for a lead whose owner was found on a mobile it rates 9/10
// — the best case, and therefore the hardest test of "never dialable".
const PATCH = {
  owner: 'John Coughlan', ownerSource: 'https://woodcobuild.co.uk/about',
  directNumber: '07700 900123', numberSource: 'https://woodcobuild.co.uk/about',
  numberType: 'mobile', confidence: 9,
  confidenceReason: 'Found in 3 independent places and it is not the switchboard.',
  opener: 'Hi John, I see Woodco Build was founded by you back in 2011.',
  tpsScreened: 'n', dialOk: 'n', dialReady: false
}

const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/api/owner-research')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, patch: PATCH }))
  }
  res.writeHead(200, { 'content-type': 'text/html' }).end(fs.readFileSync(PAGE, 'utf8'))
})
await new Promise((r) => srv.listen(0, r))
const port = srv.address().port

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage()
page.on('dialog', (d) => d.dismiss().catch(() => {}))

// The page loads supabase-js from jsdelivr and throws if it is missing, which aborts
// the rest of the script and leaves everything declared after that point
// uninitialised. Unreachable from a sandbox, and not what is under test — stubbed so
// the failure is the page's own logic rather than the network.
await page.route('**/supabase-js@2**', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript',
  body: 'window.supabase={createClient:()=>({from:()=>({select:async()=>({data:[],error:null}),upsert:async()=>({error:null}),delete:()=>({in:async()=>({error:null})})})})};'
}))
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(900)

// Seed one unresearched lead straight into the store the page reads.
await page.evaluate(() => {
  localStorage.setItem('ke_leads', JSON.stringify([{
    id: 'test1', business: 'Woodco Build', owner: '', area: 'Bristol', niche: 'renovation',
    phone: '0117 946 0000', email: '', website: '', source: 'Test', stage: 'new',
    tpsScreened: 'n', tpsScreenDate: '', dialOk: 'n', notes: '', lastContact: '', followUp: '',
    createdAt: Date.now()
  }]))
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(900)

const seeded = await page.evaluate(() => loadLeads().length)
ok('the test lead is in the store the page reads', seeded === 1)
ok('an unresearched lead shows no owner block', !(await page.evaluate(() => ownerHtml(loadLeads()[0]) !== '')))

await page.evaluate(() => researchOwner('test1'))
await page.waitForTimeout(700)
const lead = await page.evaluate(() => loadLeads()[0])

ok('the owner name is saved', lead.owner === 'John Coughlan')
ok('the direct number is saved', lead.directNumber === '07700 900123')
ok('the opener is saved', /founded by you back in 2011/.test(lead.opener))

// THE ONES THAT MATTER.
ok('a researched lead is still tpsScreened n', lead.tpsScreened === 'n')
ok('a researched lead is still dialOk n', lead.dialOk === 'n')
ok('canCall() refuses it however high the confidence', !(await page.evaluate(() => canCall(loadLeads()[0]))))

const html = await page.evaluate(() => ownerHtml(loadLeads()[0]))
ok('the direct number appears on the card', html.includes('07700 900123'))
ok('the direct number is NOT a tel: link', !/tel:\s*0?7700/.test(html) && !html.includes('tel:07700 900123'))
ok('no tel: link anywhere in the owner block', !html.includes('tel:'))
ok('the card says out loud that it is not dialable', /Not dialable yet/i.test(html))
ok('the confidence and its reason are both shown', html.includes('9/10') && /not the switchboard/i.test(html))

// Wrong Number: forget the line, but remember that it was wrong.
await page.evaluate(() => wrongNumber('test1'))
await page.waitForTimeout(400)
const after = await page.evaluate(() => loadLeads()[0])
ok('Wrong Number clears the number', after.directNumber === '')
ok('Wrong Number REMEMBERS the dead line for the next pass', (after.deadNumbers || []).includes('07700 900123'))
ok('Wrong Number keeps the owner name', after.owner === 'John Coughlan')
ok('the lead is still not dialable after Wrong Number', after.dialOk === 'n' && after.tpsScreened === 'n')

await browser.close(); srv.close()

let fail = 0
for (const [n, pass] of checks) { console.log((pass ? 'PASS' : 'FAIL') + ' — ' + n); if (!pass) fail++ }
console.log(`\n${checks.length - fail}/${checks.length}`)
process.exitCode = fail ? 1 : 0
