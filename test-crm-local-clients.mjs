/* Local (Kaizen Ascent) clients in the CRM, day to day (2026-09-25).
 *
 * Rahaid: "So will the CRM also be usable for local business clients". Before this it
 * could sign one up but not run one: there was no way to connect the client to the
 * Desk (so the portal panel stayed "not live" forever), the checklist the CRM ticked
 * was the creative one while the client's portal showed the local one, and a barber's
 * card showed Baseline, Growth steps and ad spend.
 *
 * Part 1 drives the pure helpers between the CLIENT-LANE markers in crm.html as shipped.
 * Part 2 renders the real CRM panels in a browser with one creative and one local
 * client, and reads what is on screen.
 */
import { readFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright'

const html = readFileSync(new URL('./crm.html', import.meta.url), 'utf8')
const portal = readFileSync(new URL('./portal.html', import.meta.url), 'utf8')
let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }
const done = () => { console.log(`\n${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0) }

/* ── 1. pure helpers ── */
const a = html.indexOf('/* CLIENT-LANE-START'), b = html.indexOf('/* CLIENT-LANE-END */')
if (a < 0 || b < 0) { ok('CLIENT-LANE markers present in crm.html', false); done() }
const H = new Function(html.slice(a, b) + '\n;return {isLocalClient, LOCAL_CLIENT_TASKS, tasksForLane, localNextAction, deskConnection};')()
const CREATIVE = [{ id: 'ob1', phase: 'onboarding', text: 'creative' }]
const local = { id: 'c_l', name: 'Hollow Oak Barbers', lane: 'local' }, brand = { id: 'c_b', name: 'Marauder' }

ok('isLocalClient: lane local (or segment Local, same rule as the portal); brands are not', H.isLocalClient(local) && H.isLocalClient({ segment: 'Local' }) && !H.isLocalClient(brand))
ok('local client with no checklist gets the LOCAL tasks', H.tasksForLane(local, CREATIVE) === H.LOCAL_CLIENT_TASKS)
ok('creative client still gets the creative tasks', H.tasksForLane(brand, CREATIVE) === CREATIVE)
ok('a custom checklist on the client still wins', H.tasksForLane({ ...local, checklist: [{ id: 'x', phase: 'onboarding', text: 'x' }] }, CREATIVE)[0].id === 'x')
const ids = H.LOCAL_CLIENT_TASKS.map(t => t.id)
ok('local tasks have both phases', H.LOCAL_CLIENT_TASKS.some(t => t.phase === 'onboarding') && H.LOCAL_CLIENT_TASKS.some(t => t.phase === 'live'))
ok('local tasks include the setup form, worded so portal_form_submit ticks it', H.LOCAL_CLIENT_TASKS.some(t => /^onboarding form/i.test(t.text)))
const portalIds = (portal.match(/var LOCAL_TASKS = \[([^\n]*)\];/) || ['', ''])[1].match(/'la\d+'/g) || []
ok('portal default local list uses the SAME ids as the CRM (one checklist, both sides)', JSON.stringify(portalIds.map(s => s.slice(1, -1))) === JSON.stringify(ids), portalIds.join(',') + ' vs ' + ids.join(','))
for (const bad of ['drop', 'baseline', 'sell-through', 'growth step', 'ad account', 'shopify', 'klaviyo']) {
  ok('local tasks carry no creative word: ' + bad, !H.LOCAL_CLIENT_TASKS.some(t => t.text.toLowerCase().includes(bad)))
}
const on = H.localNextAction('onboarding', 'Hollow Oak Barbers').text, lv = H.localNextAction('live', 'Hollow Oak Barbers').text
ok('onboarding next step: setup questions, site, Desk', /setup questions/i.test(on) && /website/i.test(on) && /front office|desk/i.test(on), on)
ok('live next step: monthly report and the guarantee check', /monthly report/i.test(lv) && /guarantee/i.test(lv), lv)
ok('next steps carry no creative word', !/drop|baseline|sell-through|growth step|ad account/i.test(on + lv))

const good = H.deskConnection('https://desk.kaizenevol.com/', 'hollow-oak', 'Abc_123-xyz')
ok('desk connection: valid → trimmed url, tenant, key', good && good.deskUrl === 'https://desk.kaizenevol.com' && good.deskTenant === 'hollow-oak' && good.deskKey === 'Abc_123-xyz', JSON.stringify(good))
ok('desk connection: http is refused (the key would travel in the clear)', H.deskConnection('http://desk.x.com', 't', 'k').error)
ok('desk connection: a tenant that is not a slug is refused', H.deskConnection('https://d.x.com', 'Hollow Oak!', 'k').error)
ok('desk connection: missing key refused', H.deskConnection('https://d.x.com', 't', '').error)
ok('desk connection: blank url means disconnect', H.deskConnection('', '', '') === null)

ok('Mark paid writes the local checklist onto a new local client (so portal_form_submit can tick the form item)', /if\(isLocalClient\(nc\)\)nc\.checklist=LOCAL_CLIENT_TASKS\.map/.test(html))

/* ── 2. the CRM panels, rendered ── */
const SEED = {
  clients: [
    { id: 'c_b', name: 'Marauder', status: 'active', terms: 'Founding £1,000/mo', adSpend: 'per drop', retainerValue: 1000, founding: true, baselineRevenue: 8000, liveDate: '2026-08-01' },
    { id: 'c_l', name: 'Hollow Oak Barbers', status: 'active', lane: 'local', terms: 'Founding £500/mo', retainerValue: 500, founding: true, liveDate: '' },
  ],
  clientTasks: {}, growth: { snapshots: [] }, settings: { retainerValue: 2000, foundingValue: 1000, stepValue: 1000, stepTrigger: 1.5 },
}
const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}) })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []; page.on('pageerror', e => errors.push(e.message))
await page.route('**/@supabase/supabase-js@2**', r => r.fulfill({ contentType: 'application/javascript', body: `window.supabase={createClient:function(){function q(){var o={select:()=>o,eq:()=>o,in:()=>o,order:()=>o,limit:()=>o,single:()=>Promise.resolve({data:null}),maybeSingle:()=>Promise.resolve({data:null}),update:()=>o,insert:()=>Promise.resolve({}),upsert:()=>Promise.resolve({}),then:(f)=>Promise.resolve({data:[]}).then(f)};return o}return{auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>{},signInWithOtp:()=>Promise.resolve({})},from:q,rpc:()=>Promise.resolve({}),channel:()=>({on(){return this},subscribe(){return this}}),storage:{from:()=>({list:()=>Promise.resolve({data:[]})})}}}}` }))
await page.addInitScript(d => localStorage.setItem('ke_data', d), JSON.stringify(SEED))
await page.goto((process.env.BASE || 'http://127.0.0.1:8899') + '/crm.html', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(600)
const got = await page.evaluate(() => {
  const d = load(); renderClients(d); renderGrowth(d); renderClientChecklist(d); renderClientPipeline(d)
  const card = name => [...document.querySelectorAll('#clientsContainer .card')].find(c => c.innerText.includes(name))?.innerText || ''
  const chk = name => [...document.querySelectorAll('#checklistContainer .checklist-client')].find(c => c.innerText.includes(name))?.innerText || ''
  const pipe = name => [...document.querySelectorAll('#pipelineTrack .pipe-client')].find(c => c.textContent.includes(name))?.textContent || ''
  const ph = name => [...(([...document.querySelectorAll('#clientsContainer .card')].find(c => c.innerText.includes(name)) || document.createElement('div')).querySelectorAll('[placeholder]'))].map(e => e.placeholder).join(' | ')
  return { lph: ph('Hollow Oak'), bph: ph('Marauder'), lcard: card('Hollow Oak'), bcard: card('Marauder'), growth: document.getElementById('growthContainer')?.innerText || '', lchk: chk('Hollow Oak'), bchk: chk('Marauder'), lpipe: pipe('Hollow Oak'), bpipe: pipe('Marauder') }
})
ok('CRM renders with no script errors', errors.length === 0, errors.join(' | '))
ok('local card: no Baseline, Growth steps or Ad Spend', got.lcard && !/baseline|growth steps|ad spend/i.test(got.lcard), got.lcard.slice(0, 300))
ok('local card: shows the monthly fee', /£500\/mo/.test(got.lcard))
ok('local card: admin placeholders carry no creative words', !/drop|capsule|growth-step|ad spend/i.test(got.lph), got.lph)
ok('creative card: admin placeholders unchanged', /October capsule/.test(got.bph) && /growth-step bonus/.test(got.bph))
ok('local card: go-live date and portal rows sit INSIDE the card (markup nesting)', /Go-live date/.test(got.lcard) && /Client portal/i.test(got.lcard), got.lcard.slice(-200))
ok('local card: Desk shows "not connected" with a way to connect it', /not connected/i.test(got.lcard) && /connect/i.test(got.lcard))
ok('creative card unchanged: Baseline, Growth steps, Ad Spend still there', /baseline/i.test(got.bcard) && /growth steps/i.test(got.bcard) && /ad spend/i.test(got.bcard))
ok('growth panel: creative client listed, local client not', /Marauder/.test(got.growth) && !/Hollow Oak/.test(got.growth), got.growth.slice(0, 300))
ok('checklist: local client gets the local list', /website/i.test(got.lchk) && /front office/i.test(got.lchk) && !/drop calendar|baseline/i.test(got.lchk), got.lchk.slice(0, 300))
ok('checklist: creative client keeps its list', /drop calendar/i.test(got.bchk) && /baseline/i.test(got.bchk))
ok('checklist: local phase label is not "the four things"', !/the four things/i.test(got.lchk))
ok('pipeline: local next step is the local one', /setup questions/i.test(got.lpipe) && !/drop|baseline|ad account/i.test(got.lpipe), got.lpipe)
ok('pipeline: creative next step unchanged', /Drop one is measurement/.test(got.bpipe))

/* connecting the Desk from the card writes the three fields onto the client */
page.on('dialog', d => { const m = d.message(); d.accept(/address/i.test(m) ? 'https://desk.kaizenevol.com' : /key/i.test(m) ? 'k3y-abc' : /tenant|account/i.test(m) ? 'hollow-oak' : '') })
const after = await page.evaluate(() => { deskConnect('c_l'); const c = load().clients.find(x => x.id === 'c_l'); return { c, card: [...document.querySelectorAll('#clientsContainer .card')].find(x => x.innerText.includes('Hollow Oak'))?.innerText || '' } })
ok('Connect Desk stores deskUrl, deskTenant, deskKey on the client', after.c.deskUrl === 'https://desk.kaizenevol.com' && after.c.deskTenant === 'hollow-oak' && after.c.deskKey === 'k3y-abc', JSON.stringify(after.c))
ok('card then shows the Desk as connected', /connected/i.test(after.card) && !/not connected/i.test(after.card), after.card.slice(0, 300))
await browser.close()
done()
