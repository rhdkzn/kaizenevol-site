/* Access, app by app, on the CRM card (2026-09-29).
 * Diego: "When a client does the access thru the link u sent, how do we see what they put down".
 * The portal stored each app's state in data.clientAccess but the CRM only showed the rolled-up
 * "Access" checklist tick. This renders a card and reads the per-app line.
 */
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }
const SEED = {
  clients: [
    { id: 'c_a', name: 'Test Artist', status: 'active', segment: 'Artist', terms: 'x', retainerValue: 1000 },
    { id: 'c_f', name: 'Custom Artist', status: 'active', segment: 'Artist', accessApps: ['spotify', 'soundcloud', 'bogus'], terms: 'x', retainerValue: 1000 },
  ],
  clientTasks: {}, growth: { snapshots: [] }, settings: { retainerValue: 2000, foundingValue: 1000, stepValue: 1000, stepTrigger: 1.5 },
  clientAccess: { c_a: { instagram: { state: 'done', at: '2026-09-28' }, apple: { state: 'na', at: '2026-09-28' } }, c_f: { spotify: { state: 'done' } } },
}
const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}) })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const errors = []; page.on('pageerror', e => errors.push(e.message))
await page.route('**/@supabase/supabase-js@2**', r => r.fulfill({ contentType: 'application/javascript', body: `window.supabase={createClient:function(){function q(){var o={select:()=>o,eq:()=>o,in:()=>o,order:()=>o,limit:()=>o,single:()=>Promise.resolve({data:null}),maybeSingle:()=>Promise.resolve({data:null}),update:()=>o,insert:()=>Promise.resolve({}),upsert:()=>Promise.resolve({}),then:(f)=>Promise.resolve({data:[]}).then(f)};return o}return{auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>{},signInWithOtp:()=>Promise.resolve({})},from:q,rpc:()=>Promise.resolve({}),channel:()=>({on(){return this},subscribe(){return this}}),storage:{from:()=>({list:()=>Promise.resolve({data:[]})})}}}}` }))
await page.addInitScript(d => localStorage.setItem('ke_data', d), JSON.stringify(SEED))
await page.goto((process.env.BASE || 'http://127.0.0.1:8899') + '/crm.html', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(600)
const got = await page.evaluate(() => {
  renderClients(load())
  const card = n => [...document.querySelectorAll('#clientsContainer .card')].find(c => c.innerText.includes(n))?.innerText || ''
  return { a: card('Test Artist'), f: card('Custom Artist') }
})
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true })
ok('CRM renders with no script errors', errors.length === 0, errors.join(' | '))
ok('artist card: count is 2 of 7 (done + not relevant both count)', /Access 2\/7/i.test(got.a), got.a.slice(0, 400))
ok('artist card: Instagram done', /Instagram · done/.test(got.a))
ok('artist card: Apple Music not relevant', /Apple Music · not relevant/.test(got.a))
ok('artist card: YouTube not yet', /YouTube · not yet/.test(got.a))
ok('custom list: uses the client own apps, drops unknown ids', /Access 1\/2/i.test(got.f) && /SoundCloud · not yet/.test(got.f) && !/bogus|YouTube/i.test(got.f), got.f.slice(0, 400))
await browser.close()
console.log(`\n${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0)
