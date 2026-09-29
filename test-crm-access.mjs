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
/* The Clients tab shows one row per client and one open client at a time (2026-09-29), so open each
   client in turn and read its card. */
const got = await page.evaluate(() => {
  const card = (id, n) => { openClientCard(id); return [...document.querySelectorAll('#clientsContainer .card')].find(c => c.innerText.includes(n))?.innerText || '' }
  return { a: card('c_a', 'Test Artist'), f: card('c_f', 'Custom Artist') }
})
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true })
ok('CRM renders with no script errors', errors.length === 0, errors.join(' | '))
ok('artist card: count is 2 of 7 (done + not relevant both count)', /Access 2\/7/i.test(got.a), got.a.slice(0, 400))
ok('artist card: Instagram done', /Instagram · done/.test(got.a))
ok('artist card: Apple Music not relevant', /Apple Music · not relevant/.test(got.a))
ok('artist card: YouTube not yet', /YouTube · not yet/.test(got.a))
ok('custom list: uses the client own apps, drops unknown ids', /Access 1\/2/i.test(got.f) && /SoundCloud · not yet/.test(got.f) && !/bogus|YouTube/i.test(got.f), got.f.slice(0, 400))
/* Diego, 2026-09-29: "I can't open them, clicking them does nothing". The Clients tab is now one row per
   client (pipeline cards folded into it); tapping a row must open that client's full card on screen. */
const tap = await page.evaluate(async () => {
  document.getElementById('app').style.display = 'block'; document.getElementById('gate').style.display = 'none'; showView('clients')
  localStorage.removeItem('crm_open_client'); renderClients(load()); window.scrollTo(0, 0)
  if (document.getElementById('card_c_f')) return { err: 'card open before the tap' }
  const row = document.querySelector('#clientsContainer .clr[data-id="c_f"]')
  if (!row) return { err: 'no client row' }
  row.click(); await new Promise(r => setTimeout(r, 1200))
  const card = document.getElementById('card_c_f'); if (!card) return { err: 'no card id' }
  const row2 = document.querySelector('#clientsContainer .clr[data-id="c_f"]'), r = card.getBoundingClientRect(), rr = row2.getBoundingClientRect()
  return { rowTop: rr.top, rowBottom: rr.bottom, cardTop: r.top, h: innerHeight, rh: r.height, inRow: row2.parentElement.contains(card), app: getComputedStyle(document.getElementById('app')).display }
})
/* The card opens in place under its row (after that client's stage and checklist), so the row stays on
   screen and the card sits in the same block, below it. */
ok('tapping a client row opens that client card in place under the row', !tap.err && tap.rh > 0 && tap.inRow && tap.rowTop >= 0 && tap.rowTop < tap.h && tap.cardTop > tap.rowBottom, JSON.stringify(tap))
/* With a client above it open, tapping a lower row must not leave that row off screen after the upper one closes. */
const jumpBack = await page.evaluate(async () => {
  openClientCard('c_a'); await new Promise(r => setTimeout(r, 800))
  const row = document.querySelector('.clr[data-id="c_f"]'); if (!row) return { err: 'no client row' }; row.scrollIntoView({ block: 'center', behavior: 'instant' }); await new Promise(r => setTimeout(r, 300))
  row.click(); await new Promise(r => setTimeout(r, 1200))
  const r = document.querySelector('.clr[data-id="c_f"]').getBoundingClientRect(); return { top: r.top, h: innerHeight, open: !!document.getElementById('card_c_f'), other: !!document.getElementById('card_c_a') }
})
ok('opening a lower client while an upper one is open keeps the tapped row on screen', !jumpBack.err && jumpBack.open && !jumpBack.other && jumpBack.top >= 0 && jumpBack.top < jumpBack.h, JSON.stringify(jumpBack))
/* openClientCard(id), the same entry point from elsewhere, opens the client and scrolls it into view. */
const jump = await page.evaluate(async () => {
  localStorage.removeItem('crm_open_client'); renderClients(load()); window.scrollTo({ top: 0, behavior: 'instant' }); await new Promise(r => setTimeout(r, 300))
  openClientCard('c_f'); await new Promise(r => setTimeout(r, 1200))
  const row = document.querySelector('.clr[data-id="c_f"]'), card = document.getElementById('card_c_f')
  if (!row || !card) return { err: 'not opened' }
  const r = row.getBoundingClientRect(); return { top: r.top, h: innerHeight, scrolled: scrollY }
})
ok('openClientCard opens that client and brings it into view', !jump.err && jump.scrolled > 0 && jump.top >= 0 && jump.top < jump.h, JSON.stringify(jump))
await browser.close()
console.log(`\n${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0)
