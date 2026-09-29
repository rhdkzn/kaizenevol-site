/* The Owners Portal shows what clients put in their portal (2026-09-29).
 *
 * Rahaid: "make sure whatever they input comes on our owners portal." Until now access,
 * saved logins, setup answers, messages, files and the signed agreement were only on the
 * CRM client card. dashboard.html now has a "Client inputs" section: one row per client
 * with the counts, opened in place to show each input.
 *
 * What this guards:
 *   1. the row shows agreement signed + date, access n/N, logins saved, setup answered,
 *      unread messages and files from the client;
 *   2. opening the row shows each app's access state, the saved login, the setup answers
 *      under their question text, the messages (newest first) and the files;
 *   3. Reveal calls portal_login_reveal, shows the login for that click only, and the
 *      password is gone after a re-render and after 60 seconds, and never in localStorage;
 *   4. Delete calls portal_login_delete with the CRM's confirm wording;
 *   5. a file opens through a signed URL on the 'portal' bucket;
 *   6. a client with no inputs shows "Nothing from them yet".
 *
 * Supabase is stubbed (like test-portal-logins.mjs). The stub reports a signed-in session,
 * so the page runs its real sign-in path (checkSession -> showDashboard -> ciLoad).
 *
 * Run: node test-owners-client-inputs.mjs   (needs a static server on BASE, default :8899)
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
const SEED = {
  clients: [
    { id: 'c_art01', name: 'FulaFalu', status: 'active', segment: 'Artist', founding: true, retainerValue: 1000, liveDate: '2026-09-01',
      accessApps: ['spotify', 'instagram', 'tiktok', 'soundcloud', 'drive'] },
    { id: 'c_new02', name: 'Quiet Brand Ltd', status: 'active', segment: 'Brand', retainerValue: 2000 },
  ],
  clientAccess: { c_art01: { spotify: { state: 'done', at: '2026-09-27' }, instagram: { state: 'done', at: '2026-09-27' }, soundcloud: { state: 'na', at: '2026-09-27' } } },
  growth: { snapshots: [] }, tasks: [], results: [],
  settings: { goalRetainers: 10, retainerValue: 2000, foundingValue: 1000, stepValue: 1000, stepTrigger: 1.5 },
}
const TABLES = {
  ke_portal_logins: [{ client_id: 'c_art01', app: 'tiktok', saved_at: '2026-09-29T10:00:00Z' }],
  ke_portal_forms: [{ client_id: 'c_art01', submitted_at: '2026-09-28T09:00:00Z', submitted_by: USER,
    answers: { artist_name: 'FulaFalu', never: 'No politics, no family.', prs: '' } }],
  ke_portal_items: [
    { id: 1, client_id: 'c_art01', kind: 'message', author: 'client', title: '', body: 'Older message, already read', created_at: '2026-09-20T08:00:00Z', read_by_staff: true },
    { id: 2, client_id: 'c_art01', kind: 'message', author: 'client', title: '', body: 'Can we film Saturday?', created_at: '2026-09-29T08:00:00Z', read_by_staff: false },
  ],
  ke_portal_agreements: [{ client_id: 'c_art01', title: 'Services Agreement', particulars: [['Artist name', 'artist'], ['Date', 'date_signed']],
    signed_at: '2026-09-24T12:00:00Z', signed_name: 'Fula Falu', signed_particulars: { artist: 'FulaFalu', date_signed: '24 September 2026' } }],
}
const FILES = { 'c_art01/from-client': [{ id: 'f1', name: 'k3j9x-press-shot.jpg', created_at: '2026-09-28T10:00:00Z', metadata: { size: 1000 } }] }

const stub = `window.__calls = [];
window.supabase = { createClient: function(){
  var T = ${JSON.stringify(TABLES)}, F = ${JSON.stringify(FILES)};
  function q(t){ var filt = [], o = {
    select: function(){ return o; }, eq: function(k, v){ filt.push([k, v]); return o; }, gte: function(){ return o; }, in: function(){ return o; },
    order: function(){ return o; }, limit: function(){ return o; },
    single: function(){ return Promise.resolve({ data: null, error: { message: 'none' } }); }, maybeSingle: function(){ return Promise.resolve({ data: null }); },
    upsert: function(){ return Promise.resolve({}); }, insert: function(){ return Promise.resolve({}); }, update: function(){ return o; },
    then: function(f, r){ var rows = (T[t] || []).filter(function(x){ return filt.every(function(p){ return x[p[0]] === p[1]; }); });
      window.__calls.push(['from', t]); return Promise.resolve({ data: rows.slice(), error: null }).then(f, r); } }; return o; }
  return {
    auth: { getSession: function(){ return Promise.resolve({ data: { session: { user: { email: 'rahaid@kaizenevol.com' } } } }); },
      signInWithPassword: function(){ return Promise.resolve({}); }, signOut: function(){ return Promise.resolve(); }, onAuthStateChange: function(){} },
    from: q,
    rpc: function(n, a){ window.__calls.push(['rpc', n, a]);
      if (n === 'portal_login_reveal') return Promise.resolve({ data: { user: ${JSON.stringify(USER)}, pass: ${JSON.stringify(PASS)}, saved_at: '2026-09-29T10:00:00Z' } });
      if (n === 'portal_login_delete') { T.ke_portal_logins = T.ke_portal_logins.filter(function(l){ return !(l.client_id === a.p_client_id && l.app === a.p_app); }); return Promise.resolve({ data: true }); }
      return Promise.resolve({ data: null }); },
    channel: function(){ return { on: function(){ return this; }, subscribe: function(){ return this; } }; }, removeChannel: function(){},
    storage: { from: function(b){ return {
      list: function(p){ window.__calls.push(['list', b, p]); return Promise.resolve({ data: (F[p] || []).slice(), error: null }); },
      createSignedUrl: function(p, s, o){ window.__calls.push(['sign', b, p, s]); return Promise.resolve({ data: { signedUrl: 'javascript:void(0)' }, error: null }); } }; } }
  };
} };`

const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}) })

for (const vp of [{ width: 390, height: 844, isMobile: true, hasTouch: true, tag: '390' }, { width: 1280, height: 900, tag: '1280' }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.clock.install()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept() })
  await page.route('**/@supabase/supabase-js@2**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: stub }))
  await page.route('**/cdn.jsdelivr.net/npm/chart.js**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  await page.addInitScript(d => localStorage.setItem('ke_data', d), JSON.stringify(SEED))
  await page.goto(BASE + '/dashboard.html', { waitUntil: 'domcontentloaded' })
  const T = s => `[${vp.tag}] ${s}`
  try {
    await page.waitForSelector('#clientInputs .ci-item', { timeout: 8000 })
  } catch (e) { ok(T('the Client inputs section renders a row per client'), false, 'no #clientInputs .ci-item'); await ctx.close(); continue }
  await page.waitForTimeout(300)
  const row = page.locator('#clientInputs .ci-item[data-cid="c_art01"]')
  ok(T('one row per client'), await page.locator('#clientInputs .ci-item').count() === 2)
  const chip = async k => ((await row.locator(`[data-ci="${k}"]`).textContent().catch(() => '')) || '').trim()
  ok(T('row: agreement signed with its date'), /^Agreement signed 24 Sept? 2026$/.test(await chip('agreement')), await chip('agreement'))
  ok(T('row: access 3/5 (done and not relevant both count, as in the CRM)'), await chip('access') === 'Access 3/5', await chip('access'))
  ok(T('row: 1 login saved'), await chip('logins') === '1 login saved', await chip('logins'))
  ok(T('row: setup answered'), await chip('setup') === 'Setup answered', await chip('setup'))
  ok(T('row: 1 unread message'), await chip('unread') === '1 unread', await chip('unread'))
  ok(T('row: 1 file from the client'), await chip('files') === '1 file', await chip('files'))
  ok(T('row: collapsed, nothing expanded yet'), await page.locator('#clientInputs .ci-body').count() === 0)
  if (SHOTS) await page.locator('#clientInputsSection').screenshot({ path: `${SHOTS}/owners-client-inputs-collapsed-${vp.tag}.png` })

  await row.locator('.ci-row').click()
  await page.waitForTimeout(150)
  const body = row.locator('.ci-body')
  const txt = (await body.innerText().catch(() => '')) || ''
  ok(T('open: expands in place'), await body.count() === 1 && await row.locator('.ci-row').getAttribute('aria-expanded') === 'true')
  const app = async a => ((await body.locator(`[data-ci-app="${a}"]`).innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
  ok(T('open: each app\'s access state'), /^Spotify ?done/.test(await app('spotify')) && /^SoundCloud ?not relevant/.test(await app('soundcloud')) && /^TikTok ?not yet/.test(await app('tiktok')) && /^Drive ?not yet/.test(await app('drive')), [await app('spotify'), await app('soundcloud'), await app('tiktok')].join(' | '))
  ok(T('open: the saved TikTok login with Reveal and Delete'), await body.locator('[data-pl="reveal"][data-app="tiktok"]').count() === 1 && await body.locator('[data-pl="delete"][data-app="tiktok"]').count() === 1)
  ok(T('open: setup answers under the portal\'s question text'), txt.includes('Your artist name, exactly as you want it everywhere') && txt.includes('Anything you would never post?') && txt.includes('No politics, no family.'), txt.slice(0, 400))
  ok(T('open: an empty answer is not listed'), !txt.includes('Are you a member of PRS for Music or PPL?'))
  const mi = [txt.indexOf('Can we film Saturday?'), txt.indexOf('Older message, already read')]
  ok(T('open: messages, newest first'), mi[0] > -1 && mi[1] > -1 && mi[0] < mi[1], JSON.stringify(mi))
  ok(T('open: the file from the client, named without its upload prefix'), await body.locator('.ci-file', { hasText: 'press-shot.jpg' }).count() === 1)
  ok(T('open: the agreement signer'), txt.includes('Fula Falu'))
  ok(T('open: the password is not in the page before Reveal'), !(await page.content()).includes(PASS))

  try {
    await body.locator('[data-pl="reveal"][data-app="tiktok"]').click({ timeout: 3000 })
    await page.waitForTimeout(200)
    const rv = await page.evaluate(() => (window.__calls.find(c => c[1] === 'portal_login_reveal') || [])[2])
    ok(T('Reveal calls portal_login_reveal with client and app'), rv && rv.p_client_id === 'c_art01' && rv.p_app === 'tiktok', JSON.stringify(rv))
    const shown = await body.innerText()
    ok(T('Reveal shows user and password for that click'), shown.includes(PASS) && shown.includes(USER))
    if (SHOTS) await page.locator('#clientInputsSection').screenshot({ path: `${SHOTS}/owners-client-inputs-open-${vp.tag}.png` })
    const stored = await page.evaluate(pw => { try { return JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))).includes(pw) || JSON.stringify(Object.fromEntries(Object.keys(sessionStorage).map(k => [k, sessionStorage.getItem(k)]))).includes(pw) } catch (e) { return true } }, PASS)
    ok(T('the password is never written to localStorage or sessionStorage'), !stored)
    await page.clock.runFor(61000)
    ok(T('the password hides itself after 60 seconds'), !(await page.content()).includes(PASS))
    await body.locator('[data-pl="reveal"][data-app="tiktok"]').click({ timeout: 3000 })
    await page.waitForTimeout(200)
    ok(T('revealed again'), (await body.innerText()).includes(PASS))
    await page.evaluate(() => renderClientInputs(load()))
    ok(T('a re-render drops the password'), !(await page.content()).includes(PASS))
    ok(T('the row stays open across a re-render'), await row.locator('.ci-body').count() === 1)

    await body.locator('.ci-file', { hasText: 'press-shot.jpg' }).click({ timeout: 3000 })
    await page.waitForTimeout(200)
    const sg = await page.evaluate(() => window.__calls.find(c => c[0] === 'sign'))
    ok(T('a file opens through a signed URL on the portal bucket'), sg && sg[1] === 'portal' && sg[2] === 'c_art01/from-client/k3j9x-press-shot.jpg', JSON.stringify(sg))

    await body.locator('[data-pl="delete"][data-app="tiktok"]').click({ timeout: 3000 })
    await page.waitForTimeout(400)
    ok(T('Delete asks with the CRM\'s wording'), dialogs.some(m => m === 'Delete the saved TikTok password for good? Only do this when we stop working with them. It cannot be got back.'), JSON.stringify(dialogs))
    const del = await page.evaluate(() => (window.__calls.find(c => c[1] === 'portal_login_delete') || [])[2])
    ok(T('Delete calls portal_login_delete with client and app'), del && del.p_client_id === 'c_art01' && del.p_app === 'tiktok', JSON.stringify(del))
    ok(T('after Delete the login is gone and the count reads 0'), await row.locator('[data-pl="reveal"]').count() === 0 && await chip('logins') === '0 logins saved', await chip('logins'))
  } catch (e) { ok(T('Reveal, file and Delete can be clicked'), false, e.message.split('\n')[0]) }

  const quiet = page.locator('#clientInputs .ci-item[data-cid="c_new02"]')
  await quiet.locator('.ci-row').click()
  await page.waitForTimeout(150)
  ok(T('a client with no inputs shows "Nothing from them yet"'), ((await quiet.innerText()) || '').includes('Nothing from them yet'))
  ok(T('opening one row closes the other'), await row.locator('.ci-body').count() === 0)
  if (SHOTS) await page.locator('#clientInputsSection').screenshot({ path: `${SHOTS}/owners-client-inputs-empty-${vp.tag}.png` })

  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
  ok(T('no sideways scroll'), w.sw <= w.iw && w.iw === vp.width, JSON.stringify(w))
  ok(T('no script errors'), errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
