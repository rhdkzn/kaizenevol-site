/* Artist, brand or local business on the CRM Clients tab (2026-09-30).
 * Rahaid: "on the CRM it should be able to distinguish between artist/brand/local business".
 * Each compact row carries a type tag, and a type filter narrows the list.
 */
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }
const SEED = {
  clients: [
    { id: 'c_art', name: 'Nova Ray', status: 'active', segment: 'Artist', terms: 'x', retainerValue: 0 },
    { id: 'c_brd', name: 'Stone Label', status: 'active', segment: 'Brand', terms: 'x', retainerValue: 1000 },
    { id: 'c_loc', name: 'Hollow Oak Barbers', status: 'active', lane: 'local', terms: 'x', retainerValue: 500 },
  ],
  clientTasks: {}, growth: { snapshots: [] }, settings: { retainerValue: 2000, foundingValue: 1000, stepValue: 1000, stepTrigger: 1.5 },
}
const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}) })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const errors = []; page.on('pageerror', e => errors.push(e.message))
await page.route('**/@supabase/supabase-js@2**', r => r.fulfill({ contentType: 'application/javascript', body: `window.supabase={createClient:function(){function q(){var o={select:()=>o,eq:()=>o,in:()=>o,order:()=>o,limit:()=>o,single:()=>Promise.resolve({data:null}),maybeSingle:()=>Promise.resolve({data:null}),update:()=>o,insert:()=>Promise.resolve({}),upsert:()=>Promise.resolve({}),then:(f)=>Promise.resolve({data:[]}).then(f)};return o}return{auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>{},signInWithOtp:()=>Promise.resolve({})},from:q,rpc:()=>Promise.resolve({}),channel:()=>({on(){return this},subscribe(){return this}}),storage:{from:()=>({list:()=>Promise.resolve({data:[]})})}}}}` }))
await page.addInitScript(d => localStorage.setItem('ke_data', d), JSON.stringify(SEED))
await page.goto((process.env.BASE || 'http://127.0.0.1:8899') + '/crm.html', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(600)
await page.evaluate(() => { document.getElementById('app').style.display = 'block'; document.getElementById('gate').style.display = 'none'; showView('clients'); renderClients(load()) })
const rows = () => page.evaluate(() => [...document.querySelectorAll('#clientsContainer .clr')].map(r => r.innerText.replace(/\s+/g, ' ')))
const all = await rows()
const row = n => all.find(t => t.includes(n)) || ''
ok('no script errors', errors.length === 0, errors.join(' | '))
ok('artist row is tagged Artist', /Nova Ray Artist/.test(row('Nova Ray')), row('Nova Ray'))
ok('brand row is tagged Brand', /Stone Label Brand/.test(row('Stone Label')), row('Stone Label'))
ok('local row is tagged Local, name not cut short', /Hollow Oak Barbers Local/.test(row('Hollow Oak')), row('Hollow Oak'))
const pick = async v => { await page.selectOption('#clientKindFilter', v); await page.waitForTimeout(100); return (await rows()).map(t => t.split(' ').slice(0, 2).join(' ')) }
let r
try {
  r = await pick('artist'); ok('filter Artists shows only the artist', r.length === 1 && /Nova Ray/.test(r[0]), JSON.stringify(r))
  r = await pick('brand'); ok('filter Brands shows only the brand', r.length === 1 && /Stone Label/.test(r[0]), JSON.stringify(r))
  r = await pick('local'); ok('filter Local shows only the local business', r.length === 1 && /Hollow Oak/.test(r[0]), JSON.stringify(r))
  r = await pick('all'); ok('All types shows all three', r.length === 3, JSON.stringify(r))
} catch (e) { ok('type filter exists and can be used', false, e.message.split('\n')[0]) }
if (process.env.SHOT) { await page.selectOption('#clientKindFilter', 'all').catch(() => {}); await page.screenshot({ path: process.env.SHOT }) }
await browser.close()
console.log(`\n${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0)
