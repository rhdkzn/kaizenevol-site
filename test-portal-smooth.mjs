/* The portal, start to finish, on a phone (2026-09-29).
 *
 * Rahaid: "I want the whole process to be smooth for everything we need for the client."
 * A 390px walk-through as an artist, a brand and a local client found: the first invoice
 * ~8,600px down as a small "Pay" link; login apps needing a save AND an "I've done this";
 * "message us" fourteen times and no message box; no sense of how far along you are; artists
 * shown the ecom checklist; and local clients typing opening hours twice, with
 * "Mon-Fri 9am-6pm" refused.
 *
 * What this guards:
 *   1. an unpaid invoice with a pay link is a full-width "Pay £X" button near the top;
 *   2. saving a login marks that app done (portal_access_set) and updates the count;
 *   3. a message box that inserts a client message, a thread in order, and every
 *      "message us" in the page linking to it;
 *   4. an "n of N done" strip at the top, and a "You're all set" state when it is all done;
 *   5. an artist with no custom checklist sees the artist list (a1.. ids), not the ecom one;
 *   7. one opening-hours box that takes plain wording and still saves the structured value.
 *
 * Supabase is stubbed like test-portal-logins.mjs. It checks the page, not the database.
 * Run: node test-portal-smooth.mjs   (needs a static server on BASE, default :8899)
 *      SHOTS=dir node test-portal-smooth.mjs   also writes 390px screenshots
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:8899'
const SHOTS = process.env.SHOTS || ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }

const PAY_URL = 'https://buy.stripe.com/test_abc123'
const ARTIST = { id: 'c_art01', name: 'FulaFalu', founder: 'Fula Falu', segment: 'Artist', founding: true, retainerValue: 1000, liveDate: '' }
const BRAND = { id: 'c_brand01', name: 'Marauder', founder: 'Sam Okafor', segment: 'Streetwear', founding: true, retainerValue: 1000, liveDate: '', driveUrl: 'https://drive.google.com/drive/folders/abc' }
const LOCAL = { id: 'c_local01', name: 'Hollow Oak Barbers', founder: 'Dev Patel', lane: 'local', segment: 'Local', founding: true, retainerValue: 500, liveDate: '' }
const UNSIGNED = { title: 'Services Agreement', body: 'The agreement text.', body_hash: 'abc', particulars: [['Your name', 'name', '']], signed_at: null }
const SIGNED = { ...UNSIGNED, signed_at: '2026-09-20T10:00:00Z', signed_name: 'Fula Falu', signed_email: 'fula@example.com' }
const ITEMS = [
  { id: 3, kind: 'message', author: 'agency', body: 'Welcome aboard. Shout if anything is unclear.', created_at: '2026-09-22T09:00:00Z' },
  { id: 2, kind: 'message', author: 'client', title: 'Message', body: 'Hi both, quick question about the shoot.', created_at: '2026-09-21T09:00:00Z' },
  { id: 1, kind: 'invoice', title: 'October retainer', amount: 1000, status: 'due', on_date: '2026-10-01', url: PAY_URL, created_at: '2026-09-20T09:00:00Z' },
]

function stub({ client, items = ITEMS, agreement = null, form = null, access = {}, tasks = {}, files = [] }) {
  return `window.__calls = [];
  window.supabase = { createClient: function(){
    var me = ${JSON.stringify({ email: 'client@example.com', client, settings: {}, snapshots: [], tasks, access, boards: [] })};
    var items = ${JSON.stringify(items)}, agreement = ${JSON.stringify(agreement)}, form = ${JSON.stringify(form)}, files = ${JSON.stringify(files)}, logins = [], nextId = 100;
    function q(table){ var o = { select: function(){ return o; }, eq: function(){ return o; }, order: function(){ return o; },
      limit: function(){ return Promise.resolve({ data: table === 'ke_portal_items' ? items.slice() : [] }); },
      maybeSingle: function(){ return Promise.resolve({ data: table === 'ke_portal_agreements' ? agreement : table === 'ke_portal_forms' ? form : null }); },
      insert: function(r){ window.__calls.push(['insert', table, r]); if (table === 'ke_portal_items') items.unshift(Object.assign({ id: nextId++, created_at: '2026-09-29T12:00:00Z' }, r)); return Promise.resolve({ data: null, error: null }); },
      then: function(f, r){ return Promise.resolve({ data: table === 'ke_portal_logins' ? logins.slice() : [] }).then(f, r); } }; return o; }
    return {
      auth: { getSession: function(){ return Promise.resolve({ data: { session: { user: { email: 'client@example.com' } } } }); }, onAuthStateChange: function(){}, signOut: function(){ return Promise.resolve(); } },
      rpc: function(name, args){ window.__calls.push(['rpc', name, args]);
        if (name === 'portal_me') return Promise.resolve({ data: JSON.parse(JSON.stringify(me)) });
        if (name === 'portal_access_set') { if (args.p_state) me.access[args.p_app] = { state: args.p_state, at: '2026-09-29' }; else delete me.access[args.p_app]; return Promise.resolve({ data: JSON.parse(JSON.stringify(me.access)) }); }
        if (name === 'portal_login_set') { logins = logins.filter(function(l){ return l.app !== args.p_app; }).concat([{ app: args.p_app, saved_at: '2026-09-29T10:00:00Z' }]); return Promise.resolve({ data: { app: args.p_app } }); }
        if (name === 'portal_form_submit') { form = { answers: args.p_answers, submitted_at: '2026-09-29T10:00:00Z' }; return Promise.resolve({ data: { saved: true } }); }
        return Promise.resolve({ data: null }); },
      from: q,
      storage: { from: function(){ return { list: function(path){ return Promise.resolve({ data: /from-client$/.test(path) ? files : [] }); } }; } }
    };
  } };`
}

const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}) })
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

async function open(opts) {
  const ctx = await browser.newContext(phone)
  const page = await ctx.newPage()
  page.setDefaultTimeout(3000)
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.route('**/@supabase/supabase-js@2**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: stub(opts) }))
  await page.goto(BASE + '/portal.html', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#s-portal.on', { timeout: 15000 })
  await page.waitForTimeout(300)
  return { ctx, page, errors }
}
const top = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e && e.offsetParent !== null ? e.getBoundingClientRect().top + scrollY : null }, sel)
// Old code has no strip, box or pay card: read them as '' so every check reports red instead of crashing.
const text = (page, sel) => page.innerText(sel).catch(() => '')
const payBottom = page => page.evaluate(() => { const e = document.querySelector('#p-pay-wrap'); return Math.ceil((e && e.offsetParent ? e.getBoundingClientRect().bottom + scrollY : 844) + 24) })
const guard = async (name, fn) => { try { await fn() } catch (e) { ok(name, false, e.message.split('\n')[0]) } }

/* ── artist, just signed, invoice due ── */
{
  const { ctx, page, errors } = await open({ client: ARTIST, agreement: SIGNED, tasks: { a4: true } })
  ok('artist: the portal section is on screen', await page.isVisible('#s-portal') && !(await page.isVisible('#s-login')))

  // 4. progress strip
  const strip = await page.$('#p-progress')
  const stripTxt = strip && await strip.isVisible() ? await strip.innerText() : ''
  ok('4 artist: a progress strip is on screen', !!stripTxt, stripTxt)
  ok('4 artist: it says "n of N done"', /\b1 of 5 done\b/.test(stripTxt), stripTxt)
  for (const step of [/sign your agreement/i, /pay your first invoice/i, /setup questions/i, /give us access/i, /send us your files/i]) ok('4 artist: strip lists ' + step.source, step.test(stripTxt))
  const tStrip = await top(page, '#p-progress'), tAgree = await top(page, '#p-agree-wrap')
  ok('4 artist: the strip sits above the agreement, under the greeting', tStrip !== null && tAgree !== null && tStrip < tAgree && tStrip < 600, `${tStrip} / ${tAgree}`)

  // 1. pay button near the top
  const pay = page.locator('#p-pay a.btn-solid')
  ok('1 artist: one pay button for the unpaid invoice', await pay.count() === 1)
  await guard('1 artist: the pay button can be read', async () => {
    ok('1 artist: it says "Pay £1,000"', (await pay.innerText()).trim() === 'Pay £1,000', await pay.innerText())
    ok('1 artist: it goes to the invoice\'s pay link', await pay.getAttribute('href') === PAY_URL)
    const box = await pay.boundingBox()
    ok('1 artist: it is full width (at least 300px of 390)', box && box.width >= 300, JSON.stringify(box))
    ok('1 artist: it is at least 44px tall', box && box.height >= 44, JSON.stringify(box))
    const tPay = await top(page, '#p-pay a.btn-solid'), tInv = await top(page, '#p-invoices'), tSetup = await top(page, '#p-setup-wrap')
    ok('1 artist: it is above the setup questions and the invoice list', tPay < tSetup && tPay < tInv, `${tPay} ${tSetup} ${tInv}`)
    ok('1 artist: it is within the first two screens on a phone', tPay < 1688, String(tPay))
  })
  ok('1 artist: the invoice list stays at the bottom as history', /October retainer/.test(await page.innerText('#p-invoices')))

  // 5. artist checklist
  const tasks = await page.innerText('#p-tasks')
  ok('5 artist: "Where we are" is the artist list', /Onboarding form returned/.test(tasks) && /Release date and drop plan agreed/.test(tasks), tasks)
  ok('5 artist: no ecom items (Meta, store, drop calendar, email/SMS)', !/Meta|store|Drop calendar|Email\/SMS/i.test(tasks), tasks)
  const ticked = await page.$$eval('#p-tasks li.done', ls => ls.map(l => l.innerText.trim()))
  ok('5 artist: a CRM tick on a4 ticks "Onboarding form returned" (same ids as the CRM)', ticked.length === 1 && /Onboarding form returned/.test(ticked[0]), JSON.stringify(ticked))

  // 2. login apps: one save does it
  const tikHtml = await page.innerHTML('#p-access')
  ok('2 artist: no "Mark this done once you have saved your login" note', !/Mark this done once/i.test(tikHtml))
  ok('2 artist: login apps have no "I\'ve done this" button, only the FaceTime route', await page.locator('#p-access details:has(form.login[data-app="tiktok"]) button[data-st="done"]').textContent().then(t => /FaceTime/i.test(t)).catch(() => false))
  ok('2 artist: invite apps keep "I\'ve done this"', await page.locator('#p-access details:has([data-app="youtube"]) button[data-st="done"]').textContent().then(t => /I've done this/.test(t)).catch(() => false))
  const before = (await page.innerText('#p-access-intro')).match(/(\d+) of (\d+) done/)
  await guard('2 artist: the TikTok login can be saved', async () => {
    await page.click('#p-access details:has(form.login[data-app="tiktok"]) summary', { timeout: 3000 })
    await page.fill('form.login[data-app="tiktok"] input[name="user"]', 'fula@example.com')
    await page.fill('form.login[data-app="tiktok"] input[name="pass"]', 'Zq9-velvet-harbour-7731')
    await page.click('form.login[data-app="tiktok"] button[type="submit"]')
    await page.waitForTimeout(600)
    const set = await page.evaluate(() => window.__calls.filter(c => c[1] === 'portal_access_set').map(c => c[2]))
    ok('2 artist: saving the login calls portal_access_set(tiktok, done)', set.some(a => a.p_app === 'tiktok' && a.p_state === 'done'), JSON.stringify(set))
    const st = await page.innerText('#p-access details:has([data-app="tiktok"]) summary .st')
    ok('2 artist: TikTok now reads Done', /done/i.test(st), st)
    const after = (await page.innerText('#p-access-intro')).match(/(\d+) of (\d+) done/)
    ok('2 artist: the count went up by one', before && after && +after[1] === +before[1] + 1, `${before && before[0]} -> ${after && after[0]}`)
  })

  // 6. code wording
  const acc = await page.innerHTML('#p-access')
  ok('6 artist: no "code from us by text"', !/code from us/i.test(acc))
  ok('6 artist: step and note both say the app sends you the code and we text to ask', (acc.match(/sends you a code\. We text you to ask for it/g) || []).length >= 2)

  // 3. message box
  ok('3 artist: a message box is on the page', await page.isVisible('#msg-body') && await page.isVisible('#msg-send'))
  const thread = await page.innerText('#p-updates').catch(() => '')
  ok('3 artist: the thread shows our reply and the client message, oldest first', thread.indexOf('quick question') > -1 && thread.indexOf('Welcome aboard') > thread.indexOf('quick question'), thread)
  const unlinked = await page.evaluate(() => {
    const out = [], w = document.createTreeWalker(document.getElementById('s-portal'), NodeFilter.SHOW_TEXT)
    while (w.nextNode()) { const n = w.currentNode; if (/message us|in a message/i.test(n.nodeValue) && !(n.parentElement.closest('a[href="#p-msg"],label[for="msg-body"]'))) out.push(n.nodeValue.trim().slice(0, 60)) }
    return out
  })
  ok('3 artist: every "message us" in the page links to the box', unlinked.length === 0, unlinked.join(' | '))
  const links = await page.locator('#s-portal a[href="#p-msg"]').count()
  ok('3 artist: there are "message us" links to follow', links >= 2, String(links))
  if (SHOTS) {
    await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}/smooth-artist-top-390.png` })
    await page.screenshot({ path: `${SHOTS}/smooth-artist-top-to-pay-390.png`, fullPage: true, clip: { x: 0, y: 0, width: 390, height: await payBottom(page) } })
  }
  await guard('3 artist: a message can be sent', async () => {
    await page.locator('#s-portal a[href="#p-msg"]:visible').first().click({ timeout: 3000 })
    await page.waitForTimeout(200)
    ok('3 artist: following "message us" focuses the box', await page.evaluate(() => document.activeElement && document.activeElement.id === 'msg-body'))
    await page.fill('#msg-body', 'Can we move the shoot to Friday?')
    await page.click('#msg-send')
    await page.waitForTimeout(400)
    const ins = await page.evaluate(() => (window.__calls.find(c => c[0] === 'insert' && c[1] === 'ke_portal_items') || [])[2])
    ok('3 artist: Send inserts a client message', ins && ins.client_id === 'c_art01' && ins.kind === 'message' && ins.author === 'client' && ins.title === 'Message' && ins.body === 'Can we move the shoot to Friday?', JSON.stringify(ins))
    const th = await page.innerText('#p-updates')
    ok('3 artist: the new message shows at the end of the thread', th.trim().endsWith('Can we move the shoot to Friday?'), th.slice(-120))
    ok('3 artist: the box is cleared after sending', (await page.inputValue('#msg-body')) === '')
    if (SHOTS) await page.locator('#p-msg-wrap').screenshot({ path: `${SHOTS}/smooth-artist-messages-390.png` })
  })
  ok('artist: no em dashes in the new sections', !/—/.test(await text(page, '#p-progress') + await text(page, '#p-pay-wrap') + await text(page, '#p-msg-wrap')))
  ok('artist: no horizontal scroll at 390px', (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0)
  ok('artist: no script errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

/* ── artist, everything done ── */
{
  const ALL = { instagram: { state: 'done' }, youtube: { state: 'done' }, spotify: { state: 'done' }, apple: { state: 'na' }, drive: { state: 'done' }, tiktok: { state: 'done' }, x: { state: 'na' } }
  const paid = ITEMS.map(i => i.kind === 'invoice' ? { ...i, status: 'paid' } : i)
  const { ctx, page, errors } = await open({ client: ARTIST, agreement: SIGNED, items: paid, access: ALL, form: { answers: { artist_name: 'FulaFalu' }, submitted_at: '2026-09-24T10:00:00Z' }, files: [{ id: 'f1', name: 'k2x-cover.png', created_at: '2026-09-25T10:00:00Z', metadata: { size: 1000 } }] })
  const txt = await page.isVisible('#p-progress') ? await page.innerText('#p-progress') : ''
  ok('4 finished: "You\'re all set" shows when every step is done', /You're all set/.test(txt), txt)
  ok('4 finished: it says what happens next', /what happens next/i.test(txt) && /We start work/.test(txt), txt)
  ok('1 finished: no pay button once the invoice is paid', await page.locator('#p-pay a.btn-solid').count() === 0)
  if (SHOTS) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}/smooth-artist-finished-390.png` }) }
  ok('finished: no script errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

/* ── brand, agreement to sign, invoice due ── */
{
  const { ctx, page, errors } = await open({ client: BRAND, agreement: UNSIGNED })
  const txt = await page.isVisible('#p-progress') ? await page.innerText('#p-progress') : ''
  ok('4 brand: strip counts sign, pay, access, files (no setup questions)', /0 of 4 done/.test(txt) && !/setup questions/i.test(txt), txt)
  ok('1 brand: pay button "Pay £1,000" on screen', await page.locator('#p-pay a.btn-solid').count() === 1)
  ok('5 brand: brand keeps the standard list', /Access granted: Meta/.test(await page.innerText('#p-tasks')))
  ok('9 brand: Meta partner ID has a Copy ID button with the plain value', await page.locator('#p-access button[data-copy="25727662930249979"]').count() === 1)
  ok('9 brand: the Drive step links to the client\'s folder', await page.locator('#p-access a[href="https://drive.google.com/drive/folders/abc"]').count() >= 1)
  if (SHOTS) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}/smooth-brand-top-390.png` }); await page.screenshot({ path: `${SHOTS}/smooth-brand-top-to-pay-390.png`, fullPage: true, clip: { x: 0, y: 0, width: 390, height: await payBottom(page) } }); await page.locator('#p-msg-wrap').screenshot({ path: `${SHOTS}/smooth-brand-messages-390.png` }) }
  ok('brand: no horizontal scroll at 390px', (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0)
  ok('brand: no script errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}
{
  const { ctx, page } = await open({ client: { ...BRAND, id: 'c_brand02', driveUrl: '' }, agreement: SIGNED, items: [] })
  ok('9 brand: no Drive link yet says the folder is on its way', /share your folder shortly/i.test(await page.innerHTML('#p-access')) && !/Open the Drive folder we have shared/.test(await page.innerHTML('#p-access')))
  await ctx.close()
}

/* ── local: one opening-hours box ── */
{
  const { ctx, page, errors } = await open({ client: LOCAL, items: [] })
  ok('7 local: one opening-hours box, not two', await page.locator('#q-hours').count() === 0 && await page.locator('#q-open_hours').count() === 1)
  await guard('7 local: plain opening hours are accepted', async () => {
    await page.fill('#q-open_hours', 'Mon-Fri 9am-6pm, Sat 10am-4pm')
    const read = await page.innerText('#q-open_hours-read').catch(() => '')
    ok('7 local: it reads the hours back before sending', /Mon-Fri 09:00-18:00, Sat 10:00-16:00/.test(read), read)
    await page.click('#p-setup-send')
    await page.waitForTimeout(400)
    const sent = await page.evaluate(() => (window.__calls.find(c => c[1] === 'portal_form_submit') || [])[2])
    const oh = sent && sent.p_answers.open_hours
    ok('7 local: "Mon-Fri 9am-6pm" is saved, not refused', !!sent, await page.innerText('#p-setup-msg'))
    ok('7 local: saved as the structured value (mon 09:00-18:00, sat 10:00-16:00, no sun)', oh && oh.mon === '09:00-18:00' && oh.fri === '09:00-18:00' && oh.sat === '10:00-16:00' && !oh.sun && oh.timezone === 'Europe/London', JSON.stringify(oh))
    ok('7 local: the wording they typed is kept as hours', sent && sent.p_answers.hours === 'Mon-Fri 9am-6pm, Sat 10am-4pm')
  })
  ok('local: no script errors', errors.length === 0, errors.join(' | '))
  await ctx.close()
}

await browser.close()
console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
