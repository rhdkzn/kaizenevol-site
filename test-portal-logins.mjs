/* Logins for the apps with no team invite (2026-09-29).
 *
 * Rahaid: TikTok, SoundCloud, the distributor and X need the client's own login, and the
 * portal used to say "tell us the password on FaceTime". Now the client types it into the
 * portal. It is saved to Supabase Vault through portal_login_set (db/portal-logins.sql) and
 * is WRITE-ONLY for the client: after saving, the portal shows the date and a replace
 * button, never the password. Staff see it in the CRM one click at a time.
 *
 * What this guards:
 *   1. the form appears for those four apps only;
 *   2. saving calls portal_login_set with the right arguments;
 *   3. after saving, the password is nowhere in the portal DOM, input values or storage;
 *   4. the CRM Reveal calls portal_login_reveal and shows it for that click only, never
 *      after a re-render and never in localStorage;
 *   5. the CRM delete button calls portal_login_delete.
 *
 * Supabase is stubbed (like test-portal-local.mjs and test-crm-access.mjs). It checks the
 * pages, not the database: the SQL is reviewed and applied by Law.
 *
 * Run: node test-portal-logins.mjs   (needs a static server on BASE, default :8899)
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:8899'
const SHOTS = process.env.SHOTS || ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }

const PASS = 'Zq9-velvet-harbour-7731'
const USER = 'fula@example.com'
const CLIENT = { id: 'c_art01', name: 'FulaFalu', founder: 'Fula Falu', segment: 'Artist', founding: true, retainerValue: 1000, liveDate: '',
  accessApps: ['spotify', 'instagram', 'tiktok', 'soundcloud', 'distributor', 'x', 'drive'] }

const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}) })
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

/* ── 0. FulaFalu's real state, 2026-09-29 ──
   He ticked all five apps done on 27 Sep, before the password box existed, and the Access item
   was ticked with it. The access section then hid entirely, so he could not reach the box.
   A done login app with no saved login must keep the section open and show its box. */
{
  const me0 = { email: 'fula@example.com', client: { ...CLIENT, accessApps: ['spotify', 'instagram', 'tiktok', 'soundcloud', 'distributor'], checklist: [{ id: 'a7', phase: 'onboarding', text: 'Access granted' }] }, settings: {}, snapshots: [], tasks: { a7: true },
    access: { spotify: { state: 'done' }, instagram: { state: 'done' }, tiktok: { state: 'done' }, soundcloud: { state: 'done' }, distributor: { state: 'done' } }, boards: [] }
  const stub0 = `window.supabase = { createClient: function(){
    var me = ${JSON.stringify(me0)};
    function q(){ var o = { select: function(){ return o; }, eq: function(){ return o; }, order: function(){ return o; }, limit: function(){ return Promise.resolve({ data: [] }); }, maybeSingle: function(){ return Promise.resolve({ data: null }); }, insert: function(){ return Promise.resolve({}); }, then: function(f, r){ return Promise.resolve({ data: [] }).then(f, r); } }; return o; }
    return { auth: { getSession: function(){ return Promise.resolve({ data: { session: { user: { email: 'fula@example.com' } } } }); }, onAuthStateChange: function(){}, signOut: function(){ return Promise.resolve(); } },
      rpc: function(n){ return Promise.resolve({ data: n === 'portal_me' ? me : null }); }, from: q,
      storage: { from: function(){ return { list: function(){ return Promise.resolve({ data: [] }); } }; } } };
  } };`
  const ctx0 = await browser.newContext(phone)
  const p0 = await ctx0.newPage()
  await p0.route('**/@supabase/supabase-js@2**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: stub0 }))
  await p0.goto(BASE + '/portal.html', { waitUntil: 'domcontentloaded' })
  await p0.waitForSelector('#s-portal.on', { timeout: 15000 }); await p0.waitForTimeout(300)
  ok('all-done client with no saved logins: access section still shows', await p0.isVisible('#p-access-wrap'))
  const vis = await p0.$$eval('#p-access form.login[data-app]', fs => fs.filter(f => f.offsetParent !== null).map(f => f.dataset.app).sort())
  ok('all-done client: the three login boxes are visible without tapping', JSON.stringify(vis) === JSON.stringify(['distributor', 'soundcloud', 'tiktok']), JSON.stringify(vis))
  await ctx0.close()
}

/* ── 1. the portal ── */
{
  const stub = `window.__calls = [];
  window.supabase = { createClient: function(){
    var me = ${JSON.stringify({ email: 'fula@example.com', client: CLIENT, settings: {}, snapshots: [], tasks: {}, access: {}, boards: [] })};
    var logins = [];
    function q(table){ var o = { select: function(){ return o; }, eq: function(){ return o; }, order: function(){ return o; },
      limit: function(){ return Promise.resolve({ data: [] }); }, maybeSingle: function(){ return Promise.resolve({ data: null }); },
      insert: function(){ return Promise.resolve({}); },
      then: function(f, r){ return Promise.resolve({ data: table === 'ke_portal_logins' ? logins.slice() : [] }).then(f, r); } }; return o; }
    return {
      auth: { getSession: function(){ return Promise.resolve({ data: { session: { user: { email: 'fula@example.com' } } } }); }, onAuthStateChange: function(){}, signOut: function(){ return Promise.resolve(); } },
      rpc: function(name, args){ window.__calls.push(['rpc', name, args]);
        if (name === 'portal_me') return Promise.resolve({ data: me });
        if (name === 'portal_login_set') { logins = logins.filter(function(l){ return l.app !== args.p_app; }).concat([{ app: args.p_app, saved_at: '2026-09-29T10:00:00Z' }]); return Promise.resolve({ data: { app: args.p_app, saved_at: '2026-09-29T10:00:00Z' } }); }
        return Promise.resolve({ data: null }); },
      from: q,
      storage: { from: function(){ return { list: function(){ return Promise.resolve({ data: [] }); } }; } }
    };
  } };`
  const ctx = await browser.newContext(phone)
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.route('**/@supabase/supabase-js@2**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: stub }))
  await page.goto(BASE + '/portal.html', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#s-portal.on', { timeout: 15000 })
  await page.waitForTimeout(300)
  ok('portal: the portal section is on screen', await page.isVisible('#s-portal') && await page.isVisible('#p-access-wrap'))

  const forms = await page.$$eval('#p-access form.login[data-app]', fs => fs.map(f => f.dataset.app).sort())
  ok('portal: login form on exactly tiktok, soundcloud, distributor, x', JSON.stringify(forms) === JSON.stringify(['distributor', 'soundcloud', 'tiktok', 'x']), JSON.stringify(forms))
  const txt = await page.innerText('#p-access')
  ok('portal: no step still says "tell us the password"', !/tell us the password/i.test(await page.innerHTML('#p-access')))
  ok('portal: tells the client to keep two-step verification on', /keep two-step verification on/i.test(await page.innerHTML('#p-access')))
  ok('portal: FaceTime kept as the fallback', /FaceTime/.test(await page.innerHTML('#p-access')))
  ok('portal: no em dashes in the access copy', !/—/.test(await page.innerHTML('#p-access')))

  // Open TikTok and save. Wrapped so old code reports every check red instead of crashing.
  try {
  await page.click('#p-access details:has(form.login[data-app="tiktok"]) summary', { timeout: 3000 })
  await page.fill('form.login[data-app="tiktok"] input[name="user"]', USER)
  await page.fill('form.login[data-app="tiktok"] input[name="pass"]', PASS)
  if (SHOTS) await page.locator('#p-access details:has(form.login[data-app="tiktok"])').screenshot({ path: `${SHOTS}/portal-login-form-390.png` })
  await page.click('form.login[data-app="tiktok"] button[type="submit"]')
  await page.waitForTimeout(500)
  const call = await page.evaluate(() => (window.__calls.find(c => c[1] === 'portal_login_set') || [])[2])
  ok('portal: save calls portal_login_set with app, user and password', call && call.p_app === 'tiktok' && call.p_user === USER && call.p_pass === PASS, JSON.stringify(call))

  const after = await page.evaluate(pw => {
    const inputs = [...document.querySelectorAll('input,textarea')].map(i => i.value).join('\n')
    const store = s => { try { return JSON.stringify(Object.fromEntries(Object.keys(s).map(k => [k, s.getItem(k)]))) } catch (e) { return '' } }
    return { html: document.documentElement.outerHTML.includes(pw), text: document.body.innerText.includes(pw), inputs: inputs.includes(pw),
      local: store(localStorage).includes(pw), session: store(sessionStorage).includes(pw),
      tik: (document.querySelector('#p-access details:has([data-app="tiktok"]) .login-wrap') || {}).innerText || '' }
  }, PASS)
  ok('portal: after save the password is not in the DOM', !after.html && !after.text)
  ok('portal: after save the password is not in any input value', !after.inputs)
  ok('portal: after save the password is not in localStorage or sessionStorage', !after.local && !after.session)
  ok('portal: after save it shows the saved date and a replace button', /Saved 29 Sept? 2026/.test(after.tik) && /replace/i.test(after.tik), after.tik)
  ok('portal: no password field shown once saved', !(await page.$('form.login[data-app="tiktok"] input[name="pass"]')))
  if (SHOTS) await page.locator('#p-access details:has([data-app="tiktok"])').screenshot({ path: `${SHOTS}/portal-login-saved-390.png` })
  } catch (e) { ok('portal: the TikTok login form can be filled and saved', false, e.message.split('\n')[0]) }
  ok('portal: no horizontal scroll at 390px', (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0)
  ok('portal: no script errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

/* ── 2. the CRM ── */
{
  const SEED = {
    clients: [{ id: 'c_art01', name: 'FulaFalu', status: 'active', segment: 'Artist', accessApps: CLIENT.accessApps, terms: 'x', retainerValue: 1000 }],
    clientTasks: {}, growth: { snapshots: [] }, settings: { retainerValue: 2000, foundingValue: 1000, stepValue: 1000, stepTrigger: 1.5 },
    clientAccess: { c_art01: { tiktok: { state: 'done', at: '2026-09-29' } } },
  }
  const LOGINS = [{ client_id: 'c_art01', app: 'tiktok', saved_at: '2026-09-29T10:00:00Z' }]
  const stub = `window.__calls=[];window.supabase={createClient:function(){var logins=${JSON.stringify(LOGINS)};function q(t){var o={select:()=>o,eq:()=>o,in:()=>o,order:()=>o,limit:()=>o,single:()=>Promise.resolve({data:null}),maybeSingle:()=>Promise.resolve({data:null}),update:()=>o,insert:()=>Promise.resolve({}),upsert:()=>Promise.resolve({}),then:(f,r)=>Promise.resolve({data:t==='ke_portal_logins'?logins.slice():[]}).then(f,r)};return o}
    return{auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>{},signInWithOtp:()=>Promise.resolve({})},from:q,
      rpc:(n,a)=>{window.__calls.push([n,a]);if(n==='portal_login_reveal')return Promise.resolve({data:{user:${JSON.stringify(USER)},pass:${JSON.stringify(PASS)},saved_at:'2026-09-29T10:00:00Z'}});if(n==='portal_login_delete'){logins=logins.filter(l=>!(l.client_id===a.p_client_id&&l.app===a.p_app));return Promise.resolve({data:true});}return Promise.resolve({})},
      channel:()=>({on(){return this},subscribe(){return this}}),storage:{from:()=>({list:()=>Promise.resolve({data:[]})})}}}}`
  const page = await browser.newPage(phone)
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  page.on('dialog', d => d.accept())
  await page.route('**/@supabase/supabase-js@2**', r => r.fulfill({ contentType: 'application/javascript', body: stub }))
  await page.addInitScript(d => localStorage.setItem('ke_data', d), JSON.stringify(SEED))
  await page.goto(BASE + '/crm.html', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  await page.evaluate(async () => {
    document.getElementById('app').style.display = 'block'; document.getElementById('gate').style.display = 'none'; showView('clients')
    await ptLoad(); renderClients(load())
    openClientCard('c_art01') // the compact Clients tab (PR #104) renders a card only when its row is open
  })
  const card = () => page.locator('#card_c_art01')
  ok('crm: the card has a Reveal button for the saved TikTok login', await card().locator('[data-pl="reveal"][data-app="tiktok"]').count() === 1)
  ok('crm: no Reveal button for apps with nothing saved', await card().locator('[data-pl="reveal"]').count() === 1)
  ok('crm: the password is not in the card before Reveal', !(await card().innerHTML()).includes(PASS))
  try {
  await card().locator('[data-pl="reveal"][data-app="tiktok"]').click({ timeout: 3000 })
  await page.waitForTimeout(300)
  const rv = await page.evaluate(() => (window.__calls.find(c => c[0] === 'portal_login_reveal') || [])[1])
  ok('crm: Reveal calls portal_login_reveal with client and app', rv && rv.p_client_id === 'c_art01' && rv.p_app === 'tiktok', JSON.stringify(rv))
  const shown = await card().innerText()
  ok('crm: Reveal shows the login for that click', shown.includes(PASS) && shown.includes(USER), shown.slice(0, 600))
  if (SHOTS) await card().locator('.pl-wrap').screenshot({ path: `${SHOTS}/crm-login-revealed-390.png` })
  const stored = await page.evaluate(pw => { try { return JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))).includes(pw) } catch (e) { return true } }, PASS)
  ok('crm: the password is never written to localStorage', !stored)
  await page.evaluate(() => renderClients(load()))
  ok('crm: a re-render does not bring the password back', !(await card().innerHTML()).includes(PASS))
  if (SHOTS) await card().screenshot({ path: `${SHOTS}/crm-card-390.png` })
  await card().locator('[data-pl="delete"][data-app="tiktok"]').click({ timeout: 3000 })
  await page.waitForTimeout(400)
  const del = await page.evaluate(() => (window.__calls.find(c => c[0] === 'portal_login_delete') || [])[1])
  ok('crm: the delete button calls portal_login_delete with client and app', del && del.p_client_id === 'c_art01' && del.p_app === 'tiktok', JSON.stringify(del))
  ok('crm: after delete the Reveal button is gone', await card().locator('[data-pl="reveal"]').count() === 0)
  } catch (e) { ok('crm: Reveal and delete can be clicked', false, e.message.split('\n')[0]) }
  ok('crm: no script errors', errors.length === 0, errors.join(' | '))
}

await browser.close()
console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
