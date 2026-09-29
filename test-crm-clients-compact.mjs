/* The Clients tab, one compact row per client (2026-09-29).
 * Rahaid: "the more clients we get the page will get longer, sort that out."
 * Before this the tab repeated every client in four sections (pipeline, checklist, card, growth):
 * 14,439px tall at 390px wide with six clients, growing four blocks per client.
 * Now: one row per client; tapping it opens pipeline, checklist, card (portal block included)
 * and growth step for that client only, in place.
 */
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }
const C = (id, name, extra) => ({ id, name, status: 'active', terms: 'Founding £1,000/mo', adSpend: 'per drop', retainerValue: 1000, founding: true, ...extra })
const SEED = {
  clients: [
    C('c1', 'Marauder Clothing', { baselineRevenue: 8000, liveDate: '2026-08-01' }),
    C('c2', 'Northside Records', { segment: 'Artist' }),
    C('c3', 'Hollow Oak Barbers', { lane: 'local', retainerValue: 500 }),
    C('c4', 'Paveny Co', { liveDate: '2026-09-01', baselineRevenue: 3000 }),
    C('c5', 'Lumen Candles', {}),
    C('c6', 'Old Client Ltd', { status: 'inactive' }),
  ],
  clientTasks: { c1: { ob1: true, ob2: true } }, growth: { snapshots: [{ clientId: 'c1', date: '2026-09', avg: 12500 }] },
  settings: { retainerValue: 2000, foundingValue: 1000, stepValue: 1000, stepTrigger: 1.5 },
  clientAccess: { c2: { instagram: { state: 'done' } } },
}
const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}) })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const errors = []; page.on('pageerror', e => errors.push(e.message))
await page.route('**/@supabase/supabase-js@2**', r => r.fulfill({ contentType: 'application/javascript', body: `window.supabase={createClient:function(){function q(){var o={select:()=>o,eq:()=>o,in:()=>o,order:()=>o,limit:()=>o,single:()=>Promise.resolve({data:null}),maybeSingle:()=>Promise.resolve({data:null}),update:()=>o,insert:()=>Promise.resolve({}),upsert:()=>Promise.resolve({}),then:(f)=>Promise.resolve({data:[]}).then(f)};return o}return{auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>{},signInWithOtp:()=>Promise.resolve({})},from:q,rpc:()=>Promise.resolve({}),channel:()=>({on(){return this},subscribe(){return this}}),storage:{from:()=>({list:()=>Promise.resolve({data:[]})})}}}}` }))
await page.addInitScript(d => { localStorage.setItem('ke_data', d); localStorage.removeItem('crm_open_client') }, JSON.stringify(SEED))
await page.goto((process.env.BASE || 'http://127.0.0.1:8899') + '/crm.html', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(600)

const tap = async sel => { try { await page.tap(sel, { timeout: 3000 }) } catch (e) { console.log('     (could not tap ' + sel + ')') } }
const viewHeight = () => page.evaluate(() => [...document.querySelectorAll('#app section[data-view="clients"]')].reduce((s, e) => s + e.getBoundingClientRect().height, 0))
await page.evaluate(() => {
  document.getElementById('app').style.display = 'block'; document.getElementById('gate').style.display = 'none'; showView('clients')
  /* one unread client message on Northside, the way ptLoad() would store it */
  _ptItems = { c2: [{ id: 1, client_id: 'c2', kind: 'message', author: 'client', body: 'hi', read_by_staff: false, created_at: '2026-09-28' }] }
  const d = load(); renderClientPipeline(d); renderClientChecklist(d); renderClients(d); renderCommission(d); renderGrowth(d)
})
const h = await viewHeight()
ok('all collapsed: Clients view is under 2,500px tall at 390px with 6 clients', h > 0 && h < 2500, Math.round(h) + 'px')

const rows = await page.evaluate(() => [...document.querySelectorAll('#clientsContainer .clr')].map(r => ({ id: r.dataset.id, h: r.getBoundingClientRect().height, t: r.innerText })))
ok('one row per client (6)', rows.length === 6, JSON.stringify(rows.map(r => r.id)))
ok('rows are compact on a phone (each under 100px)', rows.length && rows.every(r => r.h < 100), rows.map(r => Math.round(r.h)).join(','))
const r1 = rows.find(r => r.id === 'c1')?.t || '', r2 = rows.find(r => r.id === 'c2')?.t || ''
ok('row shows stage label and checklist progress', /Live/.test(r1) && /2\s*\/\s*15/.test(r1), r1)
ok('row shows Access n/N and unread messages', /Access 1\/7/.test(r2) && /1 new/.test(r2), r2)
const r4 = rows.find(r => r.id === 'c4')?.t || ''
/* c1: baseline £8,000, logged £12,500 → one step fired, bonus = one month at the new rate (£1,000 + £1,000) */
ok('row shows a growth-step bonus due without opening the client', /£2,000 bonus due/.test(r1), r1)
ok('no bonus badge when no step has fired', !/bonus due/.test(r4) && !/bonus due/.test(rows.find(r => r.id === 'c3')?.t || ''), r4)
ok('nothing expanded: no card, checklist or portal block rendered', await page.evaluate(() => !document.querySelector('#clientsContainer .card, .checklist-client, .pt-wrap')))

/* (b) tap a row: that client's pipeline, checklist, card and portal block — nobody else's */
await tap('#clientsContainer .clr[data-id="c1"]')
await page.waitForTimeout(200)
const open = await page.evaluate(() => {
  const txt = s => [...document.querySelectorAll(s)].map(e => e.innerText)
  return { cards: txt('#clientsContainer .card[id^="card_"]'), chk: txt('#checklistContainer .checklist-client'), pipe: txt('#pipelineTrack .pipe-client'), pt: document.querySelectorAll('#card_c1 .pt-wrap').length, allPt: document.querySelectorAll('.pt-wrap').length, growth: document.getElementById('growthContainer')?.innerText || '', aria: document.querySelector('.clr[data-id="c1"]')?.getAttribute('aria-expanded') }
})
ok('tap opens that client card only', open.cards.length === 1 && /Marauder/.test(open.cards[0]), JSON.stringify(open.cards.map(c => c.slice(0, 40))))
ok('tap opens that client checklist only', open.chk.length === 1 && /Marauder/.test(open.chk[0]), open.chk.length)
ok('tap opens that client pipeline stage only', open.pipe.length === 1 && /Marauder/.test(open.pipe[0]))
ok('portal block is inside the open card, and only there', open.pt === 1 && open.allPt === 1, JSON.stringify(open))
ok('growth step shows for the open (creative) client only', /Marauder/.test(open.growth) && !/Paveny/.test(open.growth), open.growth.slice(0, 200))
ok('row reports aria-expanded', open.aria === 'true')
ok('expanded client is no taller than the four sections were for one client', (await viewHeight()) < 6000)

/* (c) ticking a box inside the expanded client still toggles clientTasks */
const tick = await page.evaluate(async () => {
  const item = [...document.querySelectorAll('#checklistContainer .cl-item')].find(e => !e.classList.contains('checked'))
  if (!item) return {}; item.click(); await new Promise(r => setTimeout(r, 50))
  return { c1: load().clientTasks.c1, still: !!document.getElementById('card_c1'), row: document.querySelector('.clr[data-id="c1"]')?.innerText || '' }
})
ok('tick writes clientTasks for that client', tick.c1 && Object.values(tick.c1).filter(Boolean).length === 3, JSON.stringify(tick.c1))
ok('tick keeps the client open', tick.still)
ok('tick updates the row progress', /3\s*\/\s*15/.test(tick.row || ''), tick.row)

/* re-render (a realtime save) keeps the open client open */
const kept = await page.evaluate(() => { const d = load(); renderClientPipeline(d); renderClientChecklist(d); renderClients(d); renderCommission(d); renderGrowth(d); return !!document.getElementById('card_c1') })
ok('full re-render keeps the open client open', kept)
/* tapping again closes; one open at a time */
await tap('#clientsContainer .clr[data-id="c3"]'); await page.waitForTimeout(100)
const swap = await page.evaluate(() => ({ c1: !!document.getElementById('card_c1'), c3: !!document.getElementById('card_c3'), growth: (document.getElementById('growthContainer')?.innerText || '').trim() }))
ok('opening another client closes the first', !swap.c1 && swap.c3)
ok('local client has no growth-step block', swap.growth === '', swap.growth.slice(0, 100))
await tap('#clientsContainer .clr[data-id="c3"]'); await page.waitForTimeout(100)
ok('tapping the open row closes it', await page.evaluate(() => !document.getElementById('card_c3')))
/* openClientCard opens the accordion */
ok('openClientCard(id) opens that client', await page.evaluate(() => { openClientCard('c4'); return !!document.getElementById('card_c4') && document.querySelectorAll('#clientsContainer .card[id^="card_"]').length === 1 }))

/* (d) search and status filter */
const f = await page.evaluate(() => {
  const s = document.getElementById('clientSearch'), st = document.getElementById('clientStatusFilter')
  if (!s || !st) return { a: 'no search box', b: 'no status filter', c: '', l: '', all: '' }
  const vis = () => [...document.querySelectorAll('#clientsContainer .clr')].map(r => r.dataset.id).join(',')
  s.value = 'pav'; s.dispatchEvent(new Event('input', { bubbles: true })); const a = vis()
  s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true }))
  st.value = 'inactive'; st.dispatchEvent(new Event('change', { bubbles: true })); const b = vis()
  st.value = 'onboarding'; st.dispatchEvent(new Event('change', { bubbles: true })); const c = vis()
  st.value = 'live'; st.dispatchEvent(new Event('change', { bubbles: true })); const l = vis()
  st.value = 'all'; st.dispatchEvent(new Event('change', { bubbles: true })); const all = vis()
  return { a, b, c, l, all }
})
ok('search by name filters rows', f.a === 'c4', f.a)
ok('status filter: Inactive', f.b === 'c6', f.b)
ok('status filter: Onboarding', f.c === 'c2,c3,c5', f.c)
ok('status filter: Live', f.l === 'c1,c4', f.l)
ok('status filter: All brings every row back', f.all.split(',').length === 6, f.all)

ok('no script errors', errors.length === 0, errors.join(' | '))
await browser.close()
console.log(`\n${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0)
