/* Edit client details in the CRM, and Artist "release" vs Brand "drop" (2026-09-29).
 *
 * Rahaid and Diego: "We want to be able to edit details on the CRM directly, this is what a
 * client relationship manager would do." and "The release date and drop: make it
 * differentiated between brand and artist depending on the client."
 *
 * Part 1 drives crm.html: open a client, Edit details, change name, email, segment, terms and
 * access apps, Save, and check load() (the ke_data the save path writes), the card and the
 * open accordion. Cancel must discard. A bad email must be refused.
 * Part 2 checks the wording: an Artist client reads "release", a Brand client "drop", in the
 * next action, the default checklist and the date placeholder (crm.html), and in the portal's
 * dates heading, empty line and checklist (portal.html).
 *
 * Supabase is stubbed the same way as test-crm-clients-compact.mjs / test-portal-local.mjs.
 * Run: node test-crm-edit-details.mjs   (needs a static server on BASE, default :8899)
 */
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
const BASE = process.env.BASE || 'http://127.0.0.1:8899'
const SHOTS = process.env.SHOTS || ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }
const C = (id, name, extra) => ({ id, name, status: 'active', terms: 'Founding £1,000/mo', adSpend: 'per drop', retainerValue: 1000, founding: true, founder: 'Sam Okafor', email: 'sam@marauder.co', ...extra })
const SEED = {
  clients: [
    C('c1', 'Marauder Clothing', { segment: 'Brand', baselineRevenue: 8000, liveDate: '2026-08-01' }),
    C('c2', 'Northside Records', { segment: 'Artist' }),
    C('c3', 'Nova Ray', { segment: 'Artist', liveDate: '2026-08-10' }),
    C('c4', 'Hollow Oak Barbers', { lane: 'local', segment: 'Local', retainerValue: 500 }),
  ],
  clientTasks: {}, growth: { snapshots: [] },
  settings: { retainerValue: 2000, foundingValue: 1000, stepValue: 1000, stepTrigger: 1.5 },
}
const CRM_STUB = `window.supabase={createClient:function(){function q(){var o={select:()=>o,eq:()=>o,in:()=>o,order:()=>o,limit:()=>o,single:()=>Promise.resolve({data:null}),maybeSingle:()=>Promise.resolve({data:null}),update:()=>o,insert:()=>Promise.resolve({}),upsert:()=>Promise.resolve({}),then:(f)=>Promise.resolve({data:[]}).then(f)};return o}return{auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>{},signInWithOtp:()=>Promise.resolve({})},from:q,rpc:()=>Promise.resolve({}),channel:()=>({on(){return this},subscribe(){return this}}),storage:{from:()=>({list:()=>Promise.resolve({data:[]})})}}}}`

const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}) })

async function crm(width) {
  const phone = width < 600
  const page = await browser.newPage(phone ? { viewport: { width, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width, height: 900 } })
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.route('**/@supabase/supabase-js@2**', r => r.fulfill({ contentType: 'application/javascript', body: CRM_STUB }))
  await page.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ke_data', d); localStorage.removeItem('crm_open_client'); sessionStorage.setItem('seeded', '1') } }, JSON.stringify(SEED))
  await page.goto(BASE + '/crm.html', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  await page.evaluate(() => { document.getElementById('app').style.display = 'block'; document.getElementById('gate').style.display = 'none'; showView('clients'); renderClients(load()) })
  return { page, errors }
}
const openRow = (page, id) => page.evaluate(id => { if (clOpenId() !== id) toggleClient(id) }, id)

/* ── Part 1: edit details ── */
{
  const { page, errors } = await crm(390)
  try {
  await openRow(page, 'c1')
  const hasBtn = await page.evaluate(() => [...document.querySelectorAll('#card_c1 button')].some(b => /^Edit details$/i.test(b.textContent.trim())))
  ok('open client card has an "Edit details" button', hasBtn)
  const clickEdit = () => page.evaluate(() => { const b = [...document.querySelectorAll('#card_c1 button')].find(b => /^Edit details$/i.test(b.textContent.trim())); if (b) b.click() })
  await clickEdit(); await page.waitForTimeout(100)
  const form = await page.evaluate(() => { const f = document.querySelector('#card_c1 form.ce-form'); if (!f) return null
    const v = n => { const e = f.querySelector('[name="' + n + '"]'); return e ? (e.type === 'checkbox' ? e.checked : e.value) : undefined }
    return { name: v('name'), founder: v('founder'), email: v('email'), segment: v('segment'), terms: v('terms'), retainerValue: v('retainerValue'), baselineRevenue: v('baselineRevenue'), liveDate: v('liveDate'), status: v('status'), founding: v('founding'), adSpend: v('adSpend'),
      apps: [...f.querySelectorAll('input[name="accessApps"]')].map(e => e.value + (e.checked ? '+' : '')), prompts: 0 } })
  ok('Edit turns the card into an inline form (not prompt dialogs)', !!form, JSON.stringify(form))
  if (SHOTS) { await page.locator('#card_c1').screenshot({ path: SHOTS + '/edit-form-390.png' }) }
  ok('form is filled from the client', form && form.name === 'Marauder Clothing' && form.email === 'sam@marauder.co' && form.segment === 'Brand' && form.terms === 'Founding £1,000/mo' && form.retainerValue === '1000' && form.baselineRevenue === '8000' && form.liveDate === '2026-08-01' && form.founding === true && form.adSpend === 'per drop', JSON.stringify(form))
  ok('access apps are checkboxes over every known app, current ones ticked', form && form.apps.length === 12 && form.apps.includes('meta+') && form.apps.includes('instagram'), form && form.apps.join(','))

  /* invalid email refused */
  await page.evaluate(() => { const f = document.querySelector('#card_c1 form.ce-form'); f.querySelector('[name=email]').value = 'not-an-email'; f.querySelector('[name=email]').dispatchEvent(new Event('input', { bubbles: true })) })
  await page.evaluate(() => document.querySelector('#card_c1 form.ce-form button[type=submit]').click()); await page.waitForTimeout(100)
  const bad = await page.evaluate(() => ({ stored: load().clients.find(c => c.id === 'c1').email, formStill: !!document.querySelector('#card_c1 form.ce-form'), err: (document.querySelector('#card_c1 .ce-err') || {}).textContent || '' }))
  ok('invalid email is refused: nothing saved, form stays open, says why', bad.stored === 'sam@marauder.co' && bad.formStill && /email/i.test(bad.err), JSON.stringify(bad))
  /* name required, retainer numeric */
  await page.evaluate(() => { const f = document.querySelector('#card_c1 form.ce-form'); f.querySelector('[name=email]').value = 'sam@marauder.co'; f.querySelector('[name=name]').value = '  '; f.querySelector('button[type=submit]').click() })
  ok('blank name is refused', await page.evaluate(() => load().clients.find(c => c.id === 'c1').name === 'Marauder Clothing' && !!document.querySelector('#card_c1 form.ce-form')))
  await page.evaluate(() => { const f = document.querySelector('#card_c1 form.ce-form'); f.querySelector('[name=name]').value = 'Marauder'; const r = f.querySelector('[name=retainerValue]'); r.type = 'text'; r.value = 'lots'; f.querySelector('button[type=submit]').click() })
  ok('non-numeric retainer is refused', await page.evaluate(() => load().clients.find(c => c.id === 'c1').retainerValue === 1000 && !!document.querySelector('#card_c1 form.ce-form')))

  /* a realtime re-render mid-edit keeps the form, the typing and the open row */
  await page.evaluate(() => { const f = document.querySelector('#card_c1 form.ce-form'); const r = f.querySelector('[name=retainerValue]'); r.type = 'number'; r.value = '1200'
    f.querySelector('[name=name]').value = 'Marauder Apparel'; f.querySelector('[name=name]').dispatchEvent(new Event('input', { bubbles: true })) })
  const mid = await page.evaluate(() => { const d = load(); renderClientPipeline(d); renderClientChecklist(d); renderClients(d); renderCommission(d); renderGrowth(d)
    const f = document.querySelector('#card_c1 form.ce-form'); return { form: !!f, name: f && f.querySelector('[name=name]').value, open: clOpenId() } })
  ok('a realtime re-render mid-edit keeps the form and what was typed', mid.form && mid.name === 'Marauder Apparel' && mid.open === 'c1', JSON.stringify(mid))

  /* change name, email, segment, terms, access apps; save */
  await page.evaluate(() => { const f = document.querySelector('#card_c1 form.ce-form')
    const set = (n, v) => { const e = f.querySelector('[name="' + n + '"]'); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })) }
    set('name', 'Marauder Apparel'); set('email', 'hello@marauder.co'); set('terms', 'Founding £1,200/mo from November'); set('phone', '07700 900123'); set('segment', 'Artist')
    f.querySelectorAll('input[name="accessApps"]').forEach(e => { e.checked = ['instagram', 'spotify', 'drive'].includes(e.value); e.dispatchEvent(new Event('change', { bubbles: true })) })
    f.querySelector('button[type=submit]').click() })
  await page.waitForTimeout(150)
  const after = await page.evaluate(() => { const c = load().clients.find(c => c.id === 'c1'); const card = document.getElementById('card_c1')
    return { c, pipe: document.getElementById('pipelineTrack')?.innerText || '', form: !!document.querySelector('#card_c1 form.ce-form'), card: card ? card.innerText : '', open: clOpenId(), aria: document.querySelector('.clr[data-id="c1"]')?.getAttribute('aria-expanded'), row: document.querySelector('.clr[data-id="c1"]')?.innerText || '', toast: document.getElementById('toast').textContent } })
  ok('save writes the new values through load()/save()', after.c.name === 'Marauder Apparel' && after.c.email === 'hello@marauder.co' && after.c.terms === 'Founding £1,200/mo from November' && after.c.segment === 'Artist' && after.c.retainerValue === 1200 && after.c.phone === '07700 900123', JSON.stringify(after.c))
  ok('save writes accessApps from the checkboxes', JSON.stringify(after.c.accessApps) === JSON.stringify(['instagram', 'spotify', 'drive']), JSON.stringify(after.c.accessApps))
  ok('untouched keys survive (founding, baseline, go-live, ad spend, id)', after.c.founding === true && after.c.baselineRevenue === 8000 && after.c.liveDate === '2026-08-01' && after.c.adSpend === 'per drop' && after.c.id === 'c1', JSON.stringify(after.c))
  ok('card shows the new values and the form is gone', !after.form && /Marauder Apparel/.test(after.card) && /£1,200/.test(after.card) && /hello@marauder\.co/.test(after.card) && /07700 900123/.test(after.card), after.card.slice(0, 300))
  ok('card shows the new access apps', /Access 0\/3/i.test(after.card) && /Spotify/.test(after.card), after.card.slice(0, 600))
  ok('accordion stays open on the edited client', after.open === 'c1' && after.aria === 'true' && /Marauder Apparel/.test(after.row))
  ok('a toast confirms the save', /saved/i.test(after.toast), after.toast)
  ok('segment now Artist: the next action speaks of releases', /Release one is measurement/.test(after.pipe), after.pipe.slice(0, 400))
  const still = await page.evaluate(() => { const d = load(); renderClientPipeline(d); renderClientChecklist(d); renderClients(d); renderCommission(d); renderGrowth(d); return { open: clOpenId(), card: !!document.getElementById('card_c1') } })
  ok('accordion stays open after a realtime re-render', still.open === 'c1' && still.card)

  /* cancel discards */
  await page.evaluate(() => { const b = [...document.querySelectorAll('#card_c1 button')].find(b => /^Edit details$/i.test(b.textContent.trim())); b.click() })
  await page.evaluate(() => { const f = document.querySelector('#card_c1 form.ce-form'); f.querySelector('[name=name]').value = 'Should Not Stick'; f.querySelector('[name=name]').dispatchEvent(new Event('input', { bubbles: true }))
    const x = [...f.querySelectorAll('button')].find(b => /^Cancel$/i.test(b.textContent.trim())); x.click() })
  await page.waitForTimeout(100)
  const cancel = await page.evaluate(() => ({ name: load().clients.find(c => c.id === 'c1').name, form: !!document.querySelector('#card_c1 form.ce-form'), card: (document.getElementById('card_c1') || {}).innerText || '', open: clOpenId() }))
  ok('Cancel discards the edit and closes the form', cancel.name === 'Marauder Apparel' && !cancel.form && !/Should Not Stick/.test(cancel.card) && cancel.open === 'c1', JSON.stringify(cancel).slice(0, 200))

  /* segment to Local and back keeps the lane and checklist rules */
  const lane = await page.evaluate(() => { clEditStart('c2'); const f = document.querySelector('#card_c2 form.ce-form'); f.querySelector('[name=segment]').value = 'Local'; f.querySelector('[name=segment]').dispatchEvent(new Event('change', { bubbles: true })); f.querySelector('button[type=submit]').click()
    const a = load().clients.find(c => c.id === 'c2'); const r1 = { lane: a.lane, local: isLocalClient(a), chk: (a.checklist || []).map(t => t.id).join(','), tasks: tasksFor(a).map(t => t.id)[0] }
    clEditStart('c2'); const g = document.querySelector('#card_c2 form.ce-form'); g.querySelector('[name=segment]').value = 'Brand'; g.querySelector('[name=segment]').dispatchEvent(new Event('change', { bubbles: true })); g.querySelector('button[type=submit]').click()
    const b = load().clients.find(c => c.id === 'c2'); return { r1, r2: { lane: b.lane, local: isLocalClient(b), chk: b.checklist, tasks: tasksFor(b).map(t => t.id)[0], seg: b.segment } } })
  ok('segment Local: lane local and the local checklist', lane.r1.lane === 'local' && lane.r1.local && lane.r1.tasks === 'la1', JSON.stringify(lane.r1))
  ok('segment back to Brand: lane cleared, creative checklist again', !lane.r2.lane && !lane.r2.local && lane.r2.tasks === 'ob1' && lane.r2.seg === 'Brand', JSON.stringify(lane.r2))
  } catch (e) { ok('edit details: the flow runs to the end', false, e.message.split('\n')[0]) }
  ok('CRM: no script errors', errors.length === 0, errors.join(' | '))
  await page.close()
}

/* ── Part 2: Artist "release" vs Brand "drop", crm.html ── */
for (const width of [390, 1280]) {
  const { page, errors } = await crm(width)
  const read = async id => { await openRow(page, id); await page.waitForTimeout(80); return page.evaluate(id => ({ pipe: document.getElementById('pipelineTrack')?.innerText || '', chk: document.getElementById('checklistContainer')?.innerText || '', ph: document.getElementById('ptt_' + id)?.placeholder || '', next: clientNextAction(load().clients.find(c => c.id === id)).text }), id) }
  const brandOn = await read('c1'); if (SHOTS) await page.locator('.clr-item.open').screenshot({ path: `${SHOTS}/brand-card-${width}.png` })
  const artistLive = await read('c3'); if (SHOTS) await page.locator('.clr-item.open').screenshot({ path: `${SHOTS}/artist-card-${width}.png` })
  const artistOn = await read('c2')
  const w = width + 'px'
  ok(`${w} Brand next action says drop`, /Drop one is measurement/.test(brandOn.next) || /drop calendar/.test(brandOn.next), brandOn.next)
  ok(`${w} Artist next action (live) says release, never drop`, /Release one is measurement/.test(artistLive.next) && !/\bdrop/i.test(artistLive.next), artistLive.next)
  ok(`${w} Artist next action (onboarding) says release calendar`, /release calendar/.test(artistOn.next) && !/\bdrop/i.test(artistOn.next), artistOn.next)
  ok(`${w} Brand checklist default says drop`, /Drop calendar/.test(brandOn.chk) && /every drop opens/.test(brandOn.chk), brandOn.chk.slice(0, 200))
  ok(`${w} Artist checklist default says release`, /Release calendar/.test(artistOn.chk) && /every release opens/.test(artistLive.chk) && !/\bdrop/i.test(artistOn.chk), artistOn.chk.slice(0, 600))
  ok(`${w} Brand date placeholder says Drop`, /^Drop \/ date title/.test(brandOn.ph) && /October capsule/.test(brandOn.ph), brandOn.ph)
  ok(`${w} Artist date placeholder says Release`, /^Release \/ date title/.test(artistOn.ph) && !/capsule|drop/i.test(artistOn.ph), artistOn.ph)
  ok(`${w} Local client keeps its own wording`, await page.evaluate(() => { const c = load().clients.find(c => c.id === 'c4'); return !/drop|release/i.test(clientNextAction(c).text) && !tasksFor(c).some(t => /drop|release/i.test(t.text)) }))
  ok(`${w} stored checklist ids unchanged for an artist`, await page.evaluate(() => tasksFor(load().clients.find(c => c.id === 'c2')).map(t => t.id).join(',') === CLIENT_TASKS.map(t => t.id).join(',')))
  if (SHOTS && width === 1280) { await openRow(page, 'c1'); await page.evaluate(() => clEditStart('c1')); await page.waitForTimeout(80); await page.locator('#card_c1').screenshot({ path: SHOTS + '/edit-form-1280.png' }) }
  ok(`${w} no script errors`, errors.length === 0, errors.join(' | '))
  await page.close()
}

/* ── Part 2: portal.html ── */
function portalStub(client) {
  return `window.supabase = { createClient: function(){
    var me = ${JSON.stringify({ email: 'owner@example.com', client, settings: {}, snapshots: [], tasks: {}, access: {}, boards: [] })};
    function q(){ var o = { select: function(){ return o; }, eq: function(){ return o; }, order: function(){ return o; }, limit: function(){ return Promise.resolve({ data: [] }); }, maybeSingle: function(){ return Promise.resolve({ data: null }); }, insert: function(){ return Promise.resolve({}); } }; return o; }
    return { auth: { getSession: function(){ return Promise.resolve({ data: { session: { user: { email: 'owner@example.com' } } } }); }, onAuthStateChange: function(){}, signOut: function(){ return Promise.resolve(); } },
      rpc: function(name){ return Promise.resolve({ data: name === 'portal_me' ? me : null }); }, from: q,
      storage: { from: function(){ return { list: function(){ return Promise.resolve({ data: [] }); } }; } } };
  } };`
}
for (const [label, client, word] of [['Artist', { id: 'c_a', name: 'Nova Ray', founder: 'Nova Ray', segment: 'Artist', founding: true, retainerValue: 1000 }, 'Release'], ['Brand', { id: 'c_b', name: 'Marauder', founder: 'Sam Okafor', segment: 'Brand', founding: true, retainerValue: 1000 }, 'Drop']]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.route('**/@supabase/supabase-js@2**', r => r.fulfill({ contentType: 'application/javascript', body: portalStub(client) }))
  await page.route('**/api/portal/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.goto(BASE + '/portal.html', { waitUntil: 'domcontentloaded' })
  let on = true; try { await page.waitForSelector('#s-portal.on', { timeout: 15000 }) } catch (e) { on = false }
  await page.waitForTimeout(200)
  const got = await page.evaluate(() => ({ h: document.getElementById('p-events-h')?.textContent || '', ev: document.getElementById('p-events')?.innerText || '', tasks: document.getElementById('p-tasks')?.innerText || '' }))
  const other = word === 'Release' ? /\bdrop/i : /\brelease/i
  ok(`portal ${label}: the portal section is on screen`, on)
  ok(`portal ${label}: dates heading says ${word}`, new RegExp('^' + word + ' calendar$').test(got.h), got.h)
  ok(`portal ${label}: empty dates line uses its word`, !other.test(got.ev) && new RegExp(word, 'i').test(got.ev), got.ev)
  ok(`portal ${label}: checklist default says ${word}`, new RegExp(word + ' calendar and content plan agreed').test(got.tasks) && !other.test(got.tasks), got.tasks.slice(0, 400))
  ok(`portal ${label}: no script errors`, errors.length === 0, errors.join(' | '))
  await page.close()
}

await browser.close()
console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
