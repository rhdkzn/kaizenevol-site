/* The six stages in the Owners Portal snapshot (2026-10-12, Rahaid: "just add it to the owners portal").
 * Same rule as the CRM: the card's stage, else the old status labelled "(old status)"; next action
 * and blocker under it. SHOTS=dir saves screenshots at 1440 and 390.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }
const SHOTS = process.env.SHOTS || ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const SEED = { clients: [
  { id: 'c_ff', name: 'FulaFalu', status: 'active', segment: 'Artist', terms: 'Free pilot', retainerValue: 0, liveDate: '2026-09-20', stage: 'Deliver', nextAction: { text: 'Shoot batch 2', owner: 'Diego', due: '2026-01-01' }, blocker: 'not established' },
  { id: 'c_mr', name: 'Marauder', status: 'active', segment: 'Brand', terms: '20% of net sales, from signing', retainerValue: 0, stage: 'Build', nextAction: { text: 'Finish statics <b>', owner: 'Rahaid', due: '2099-01-01' } },
  { id: 'c_old', name: 'Plain Card Ltd', status: 'active', terms: 'Founding £1,000/mo', retainerValue: 1000, liveDate: '2026-08-01' },
], growth: { snapshots: [] }, settings: { retainerValue: 2000, foundingValue: 1000, stepValue: 1000, stepTrigger: 1.5, goalRetainers: 10 } }
const STUB = 'window.supabase={createClient(){const o={select:()=>o,eq:()=>o,in:()=>o,order:()=>o,limit:()=>o,update:()=>o,single:()=>Promise.resolve({data:null}),then:f=>Promise.resolve({data:[]}).then(f)};return{auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange(){}},from:()=>o,rpc:()=>Promise.resolve({}),channel:()=>({on(){return this},subscribe(){return this}}),storage:{from:()=>({list:()=>Promise.resolve({data:[]})})}}}}'
const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}) })
for (const [w, h, mob] of [[1440, 900, false], [390, 844, true]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: mob })
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.route('**/@supabase/supabase-js@2**', r => r.fulfill({ contentType: 'application/javascript', body: STUB }))
  await page.route('**/cdn.jsdelivr.net/npm/chart.js**', r => r.fulfill({ contentType: 'application/javascript', body: '' }))
  await page.addInitScript(d => localStorage.setItem('ke_data', d), JSON.stringify(SEED))
  await page.goto((process.env.BASE || 'http://127.0.0.1:8899') + '/dashboard.html', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)
  await page.evaluate(() => { document.getElementById('gate').style.display = 'none'; document.getElementById('dashboard').style.display = 'block'; renderSnapshot(load()) })
  const items = await page.$$eval('#snapshotList .snap-item', els => Object.fromEntries(els.map(e => [e.querySelector('.snap-name').innerText, { t: e.innerText, html: e.innerHTML, right: Math.max(...[...e.querySelectorAll('*')].map(x => x.getBoundingClientRect().right)) }])))
  ok(w + ': stage shown as the status', /Deliver/.test(items.FulaFalu?.t) && /Build/.test(items.Marauder?.t), JSON.stringify(Object.keys(items)))
  ok(w + ': no stage falls back to the old status, labelled', /Live \(old status\)/.test(items['Plain Card Ltd']?.t), items['Plain Card Ltd']?.t)
  ok(w + ': next action with owner and due, overdue flagged, blocker shown as-is', /Next Shoot batch 2 \(Diego, overdue, due 2026-01-01\)/.test(items.FulaFalu?.t) && /Blocker not established/.test(items.FulaFalu?.t) && /class="late"/.test(items.FulaFalu?.html), items.FulaFalu?.t)
  ok(w + ': text is escaped', /Finish statics &lt;b&gt;/.test(items.Marauder?.html))
  ok(w + ': card with none of the new fields has no next line', !/snap-next/.test(items['Plain Card Ltd']?.html))
  ok(w + ': CRM link opens the Clients tab', /href="crm.html#clients"/.test(items.FulaFalu?.html))
  ok(w + ': snapshot fits the width', Object.values(items).every(i => i.right <= w + 0.5), JSON.stringify(Object.values(items).map(i => Math.round(i.right))))
  if (SHOTS) await page.locator('#snapshotList').screenshot({ path: `${SHOTS}/owners-stages-${w}.png` })
  ok(w + ': no page errors', errors.length === 0, errors.join(' | '))
  await page.close()
}
await browser.close()
console.log(`\n${passes}/${passes + fails} owners-portal stage checks passed`)
process.exit(fails ? 1 : 0)
