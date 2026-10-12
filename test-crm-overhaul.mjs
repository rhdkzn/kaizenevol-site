/* Diego's CRM overhaul (2026-10-12). Rahaid: "add in what Diego wants".
 *
 * Six stages replace Onboarding / Live / Inactive as what a card shows; each card carries a stage
 * spine with entry and exit rules, history, next action and blocker; the Clients tab opens on an
 * overview (who is waiting on whom, real money from invoices); a Monday report; a sales log read
 * from the terms; a Playbook tab. Every edit must go through save(d), the updated_at-guarded path.
 *
 * Stubbed ke_data: FulaFalu (Deliver), Marauder (Build, 20% of net sales, two logged months), SKN
 * (Onboard), and one card with none of the new fields. Portal invoices for the money.
 * SHOTS=dir saves screenshots at 390 and 1440.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }
const SHOTS = process.env.SHOTS || ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const today = new Date(); const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ago = n => iso(new Date(Date.now() - n * 86400000)), ahead = n => iso(new Date(Date.now() + n * 86400000))
const ym = iso(today).slice(0, 7), lastYm = iso(new Date(today.getFullYear(), today.getMonth() - 1, 15)).slice(0, 7)
const SEED = {
  clients: [
    { id: 'c_ff', name: 'FulaFalu', status: 'active', segment: 'Artist', terms: 'Free pilot', retainerValue: 0, liveDate: '2026-09-20',
      stage: 'Deliver', stageHistory: [{ stage: 'Build', date: '2026-09-25', by: 'Levi', why: 'templates started' }, { stage: 'Deliver', date: ago(2), by: 'Diego', why: 'first batch out' }],
      nextAction: { text: 'Shoot batch 2', owner: 'Diego', due: ago(1) }, blocker: 'not established',
      batches: [{ name: 'October week 1', steps: { shoot: ago(9), edit: ago(6) } }] },
    { id: 'c_mr', name: 'Marauder', status: 'active', segment: 'Brand', terms: '20% of net sales, from signing', retainerValue: 0,
      stage: 'Build', stageHistory: [{ stage: 'Build', date: '2026-10-01', by: 'Rahaid', why: 'signed' }],
      nextAction: { text: 'Finish statics', owner: 'Rahaid', due: ahead(3) }, blocker: '',
      salesLog: [{ month: lastYm, netSales: 4000, note: 'first month' }, { month: ym, netSales: 1500.5, note: '' }] },
    { id: 'c_skn', name: 'SKN', status: 'active', segment: 'Artist', terms: 'Free pilot', retainerValue: 0,
      stage: 'Onboard', stageHistory: [{ stage: 'Onboard', date: '2026-10-08', by: 'Diego', why: 'yes on the call' }],
      nextAction: { text: 'Chase Spotify access', owner: 'Levi', due: ahead(1) }, blocker: 'waiting on their manager' },
    { id: 'c_old', name: 'Plain Card Ltd', status: 'active', segment: 'Brand', terms: 'Founding £1,000/mo', retainerValue: 1000, liveDate: '2026-08-01' },
  ],
  clientTasks: {}, growth: { snapshots: [] }, settings: { retainerValue: 2000, foundingValue: 1000, stepValue: 1000, stepTrigger: 1.5 },
}
const inv = (id, cid, amount, status, on_date) => ({ id, client_id: cid, kind: 'invoice', author: 'agency', title: 'Invoice ' + id, amount, status, on_date, created_at: on_date + 'T09:00:00Z' })
const ROWS = [inv(1, 'c_mr', 800, 'paid', lastYm + '-05'), inv(2, 'c_mr', 300, 'paid', ym + '-02'), inv(3, 'c_mr', 300, 'due', ym + '-28'), inv(4, 'c_old', 1000, 'due', lastYm + '-01'),
  { id: 9, client_id: 'c_skn', kind: 'message', author: 'client', title: 'Message', body: 'old one', created_at: '2026-10-01T09:00:00Z', read_by_staff: false }]

const STUB = `window.__rows=${JSON.stringify(ROWS)};window.__app=[];window.supabase={createClient:function(){
  function q(t){var st={t:t,op:'select'};var o={select:()=>o,eq:()=>o,in:()=>o,order:()=>o,limit:()=>o,single:()=>Promise.resolve({data:null}),maybeSingle:()=>Promise.resolve({data:null}),
    update:(v)=>{st.op='update';if(t==='app_data')window.__app.push(v);return o},insert:(v)=>{if(t==='app_data')window.__app.push(v);return {select:()=>Promise.resolve({error:null,data:[{updated_at:'x'}]}),then:(f)=>Promise.resolve({error:null}).then(f)}},upsert:()=>Promise.resolve({}),
    then:(f,r)=>Promise.resolve({data:t==='ke_portal_items'?JSON.parse(JSON.stringify(window.__rows)):[]}).then(f,r)};return o}
  return{auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>{},signInWithOtp:()=>Promise.resolve({})},from:q,rpc:()=>Promise.resolve({}),channel:()=>({on(){return this},subscribe(){return this}}),storage:{from:()=>({list:()=>Promise.resolve({data:[]})})}}}}`

const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}) })
async function boot(viewport, mobile) {
  const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile })
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  const answers = []; page.on('dialog', d => { const a = answers.shift(); if (a === false) d.dismiss(); else d.accept(a === true || a == null ? undefined : a) })
  await page.route('**/@supabase/supabase-js@2**', r => r.fulfill({ contentType: 'application/javascript', body: STUB }))
  await page.addInitScript(d => { localStorage.setItem('ke_data', d); localStorage.removeItem('crm_open_client'); localStorage.removeItem('crm_me') }, JSON.stringify(SEED))
  await page.goto((process.env.BASE || 'http://127.0.0.1:8899') + '/crm.html', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await page.evaluate(async () => {
    document.getElementById('app').style.display = 'block'; document.getElementById('gate').style.display = 'none'
    window.__saves = 0; const orig = window.save; window.save = function (d) { window.__saves++; return orig(d) }
    await ptLoad(); showView('clients'); renderClients(load())
  })
  await page.waitForTimeout(150)
  return { page, errors, answers }
}
const card = (page, id) => page.evaluate(id => load().clients.find(c => c.id === id), id)

/* ── 1440 ── */
{
  const { page, errors, answers } = await boot({ width: 1440, height: 1000 }, false)
  const rows = await page.$$eval('#clientsContainer .clr', els => Object.fromEntries(els.map(e => [e.dataset.id, e.innerText])))
  ok('row status is the stage', /Deliver/.test(rows.c_ff) && /Build/.test(rows.c_mr) && /Onboard/.test(rows.c_skn), JSON.stringify(rows))
  ok('card with no stage falls back to the old status, labelled', /Live \(old status\)/.test(rows.c_old), rows.c_old)
  ok('row shows the card next action and owner', /Shoot batch 2 \(Diego/.test(rows.c_ff), rows.c_ff)
  const ov = await page.innerText('#ovDash')
  ok('overview: a row per active client with stage, blocker and next action', ['FulaFalu', 'Marauder', 'SKN', 'Plain Card Ltd'].every(n => ov.includes(n)) && /not established/.test(ov) && /Finish statics \(Rahaid/.test(ov))
  const waits = await page.$$eval('.ov-wait', els => els.map(e => e.innerText))
  ok('waiting on Diego, then Rahaid, then others by owner', /^Waiting on Diego/.test(waits[0]) && /Shoot batch 2/.test(waits[0]) && /^Waiting on Rahaid/.test(waits[1]) && /Finish statics/.test(waits[1]) && waits.some(w => /^Waiting on Levi/.test(w) && /Spotify/.test(w)), JSON.stringify(waits))
  ok('overdue is flagged', /overdue/.test(waits[0]) && !!(await page.$('.ov-w.late')))
  const money = await page.$$eval('.ov-m', els => els.map(e => [...e.children].map(x => x.innerText.trim())))
  const mr = money.find(r => r[0] === 'Marauder'), tot = money.find(r => r[0] === 'Total'), ff = money.find(r => r[0] === 'FulaFalu'), old = money.find(r => r[0] === 'Plain Card Ltd')
  ok('money from invoices: Marauder paid this month, owed this month, paid to date, owed to date', mr && mr.slice(1, 5).join('|') === '£300|£300|£1,100|£300', JSON.stringify(mr))
  ok('money is never computed from retainerValue', ff && ff.slice(1, 5).join('|') === '£0|£0|£0|£0' && old && old[2] === '£0' && old[4] === '£1,000', JSON.stringify([ff, old]))
  ok('sales-log fees: 20% read from the terms, £1,100 to date', mr && mr[5] === '£1,100', JSON.stringify(mr))
  ok('totals', tot && tot.slice(1, 6).join('|') === '£300|£300|£1,100|£1,300|£1,100', JSON.stringify(tot))
  if (SHOTS) await page.screenshot({ path: SHOTS + '/overhaul-1440-overview.png', fullPage: false })

  /* the spine on Marauder's card */
  await page.click('.clr[data-id="c_mr"]'); await page.waitForTimeout(150)
  const spine = await page.$$eval('#card_c_mr .sp-step', els => els.map(e => e.className))
  ok('spine: six steps, Build current, earlier done', spine.length === 6 && /on/.test(spine[3]) && /done/.test(spine[0]) && !/done|on/.test(spine[4]), spine.join(','))
  const cardTxt = await page.innerText('#card_c_mr')
  ok('entry and exit rules shown', /Entry\s+Onboard exit done/i.test(cardTxt) && /Month-one template system made/.test(cardTxt))
  ok('history: date · by · why', /2026-10-01 · Rahaid · signed/.test(cardTxt))
  ok('sales log: rate from the terms, fee per month', /fee rate 20% of net sales/i.test(cardTxt) && /Net £4,000/.test(cardTxt) && /Fee £800/.test(cardTxt) && /Fee £300/.test(cardTxt), cardTxt.slice(cardTxt.indexOf('Sales log'), cardTxt.indexOf('Sales log') + 200))
  ok('old two-step track is not shown for a staged card', (await page.$$eval('#pipelineTrack .pipe-client', e => e.length)) === 0)
  if (SHOTS) await page.locator('#card_c_mr').screenshot({ path: SHOTS + '/overhaul-1440-marauder-card.png' })

  /* sales log add */
  await page.fill('#sl_m_c_mr', ym); await page.fill('#sl_n_c_mr', '1000'); await page.click('#card_c_mr .sp-sub button:has-text("+ Month")'); await page.waitForTimeout(100)
  ok('sales month added through save(d)', (await card(page, 'c_mr')).salesLog.length === 3 && (await page.evaluate(() => window.__saves)) === 1)

  /* exit tick, then a forward move that the exit gates */
  await page.click('#card_c_mr .sp-rule button.sp-tick'); await page.waitForTimeout(100)
  ok('exit tick stored as stageChecks.Build[0]', (await card(page, 'c_mr')).stageChecks?.Build?.[0] === true)
  await page.click('#card_c_mr .sp-rule button.sp-tick'); await page.waitForTimeout(100)
  await page.evaluate(() => { localStorage.setItem('crm_me', 'Diego') })
  answers.push(true, '')  // confirm "move anyway", then an empty why
  await page.selectOption('#card_c_mr .sp-top select', 'Deliver'); await page.waitForTimeout(150)
  ok('move anyway with no reason is refused', (await card(page, 'c_mr')).stage === 'Build')
  answers.push(true, 'Diego wants the batch out early')
  await page.selectOption('#card_c_mr .sp-top select', 'Deliver'); await page.waitForTimeout(150)
  const mrc = await card(page, 'c_mr'); const last = mrc.stageHistory[mrc.stageHistory.length - 1]
  ok('move anyway with a reason: stage set, history appended with today, by, why, override', mrc.stage === 'Deliver' && last.stage === 'Deliver' && last.date === iso(new Date()) && last.by === 'Diego' && last.why === 'Diego wants the batch out early' && last.override === true, JSON.stringify(last))
  answers.push('')
  await page.selectOption('#card_c_mr .sp-top select', 'Build'); await page.waitForTimeout(150)
  ok('moving back needs no override', (await card(page, 'c_mr')).stage === 'Build')

  /* next action, blocker, pay step, todoist, results */
  await page.fill('#card_c_mr input[placeholder="What happens next"]', 'Send the motion set'); await page.press('#card_c_mr input[placeholder="What happens next"]', 'Tab'); await page.waitForTimeout(100)
  await page.fill('#card_c_mr input[placeholder="Nothing blocking"]', 'Shopify invite pending'); await page.press('#card_c_mr input[placeholder="Nothing blocking"]', 'Tab'); await page.waitForTimeout(100)
  await page.fill('#card_c_mr input[placeholder="Next step"]', 'paid retainer'); await page.press('#card_c_mr input[placeholder="Next step"]', 'Tab'); await page.waitForTimeout(100)
  await page.fill('#card_c_mr input[placeholder="https://todoist.com/…"]', 'javascript:alert(1)'); await page.press('#card_c_mr input[placeholder="https://todoist.com/…"]', 'Tab'); await page.waitForTimeout(100)
  let m2 = await card(page, 'c_mr')
  ok('next action text, blocker and pay step saved', m2.nextAction.text === 'Send the motion set' && m2.nextAction.owner === 'Rahaid' && m2.blocker === 'Shopify invite pending' && m2.payStep?.next === 'paid retainer', JSON.stringify([m2.nextAction, m2.blocker, m2.payStep]))
  ok('pay step never pre-filled', !m2.payStep.current)
  ok('a non-https Todoist link is refused', !m2.todoistUrl)
  await page.fill('#card_c_mr input[placeholder="https://todoist.com/…"]', 'https://todoist.com/app/project/123'); await page.press('#card_c_mr input[placeholder="https://todoist.com/…"]', 'Tab'); await page.waitForTimeout(100)
  ok('Todoist link shown', (await page.getAttribute('#card_c_mr .sp-link', 'href')) === 'https://todoist.com/app/project/123')
  ok('every edit went through save(d) and pushed to app_data', (await page.evaluate(() => window.__saves)) >= 8 && (await page.evaluate(() => window.__app.length)) >= 8, String(await page.evaluate(() => [window.__saves, window.__app.length])))

  /* access verified tick on FulaFalu, delivery batches */
  await page.click('.clr[data-id="c_ff"]'); await page.waitForTimeout(150)
  await page.click('#card_c_ff button[data-verify="instagram"]'); await page.waitForTimeout(100)
  const ff2 = await card(page, 'c_ff'); const ca = await page.evaluate(() => load().clientAccess)
  ok('verified by Rahaid stored apart from clientAccess', ff2.accessVerified?.instagram?.by === 'Rahaid' && ff2.accessVerified.instagram.at === iso(new Date()) && !ca, JSON.stringify([ff2.accessVerified, ca]))
  ok('verify shows on the card', /verified by Rahaid/.test(await page.innerText('#card_c_ff')))
  const ffTxt = await page.innerText('#card_c_ff')
  ok('Deliver shows the delivery loop and paid ads with owner Rahaid', /Delivery loop/.test(ffTxt) && /Client approves batch/.test(ffTxt) && /Pick what gets paid spend/.test(ffTxt) && /Paid ads/.test(ffTxt) && (await page.inputValue('#card_c_ff input[aria-label="Paid ads owner"]')) === 'Rahaid')
  await page.click('#card_c_ff .sp-batch button:has-text("Client approves batch")'); await page.waitForTimeout(100)
  ok('approval ticked on the card with its date', (await card(page, 'c_ff')).batches[0].steps.approve === iso(new Date()))
  answers.push('October week 2'); await page.click('#card_c_ff button:has-text("+ Batch")'); await page.waitForTimeout(100)
  ok('batch added', (await card(page, 'c_ff')).batches.length === 2)
  ok('blocker "not established" shown as-is', (await page.inputValue('#card_c_ff input[placeholder="Nothing blocking"]')) === 'not established')
  if (SHOTS) await page.locator('#card_c_ff').screenshot({ path: SHOTS + '/overhaul-1440-fulafalu-card.png' })

  /* the card with none of the new fields */
  await page.click('.clr[data-id="c_old"]'); await page.waitForTimeout(150)
  const oldTxt = await page.innerText('#card_c_old')
  ok('bare card: no stage, old status shown, nothing breaks', /No stage yet\. Showing the old status: Live \(old status\)/.test(oldTxt) && !/Sales log/.test(oldTxt))

  /* filter by stage, and by old status */
  await page.selectOption('#clientStatusFilter', 'st-deliver'); await page.waitForTimeout(80)
  const f1 = await page.$$eval('#clientsContainer .clr', e => e.map(x => x.dataset.id).join(','))
  await page.selectOption('#clientStatusFilter', 'live'); await page.waitForTimeout(80)
  const f2 = await page.$$eval('#clientsContainer .clr', e => e.map(x => x.dataset.id).join(','))
  await page.selectOption('#clientStatusFilter', 'all')
  ok('stage filter', f1 === 'c_ff', f1); ok('old status filter still works', f2 === 'c_old', f2)

  /* Monday report */
  await page.click('#ovDash button:has-text("Monday report")'); await page.waitForTimeout(100)
  const rep = await page.inputValue('#mrText')
  ok('report: each client stage, what moved this week, next with owner and due, blocker', /FULAFALU: Deliver/.test(rep) && /Moved this week: Deliver on .* by Diego \(first batch out\)/.test(rep) && /Next: Shoot batch 2 \(Diego, due .*\) OVERDUE/.test(rep) && /Blocker: not established/.test(rep), rep.slice(0, 400))
  ok('report: money and sales log and unread messages', /MARAUDER: Build/.test(rep) && /Money: paid £300 this month \(£1,100 to date\), owed £300/.test(rep) && /Sales log: 3 months, fees £1,300 to date/.test(rep) && /SKN[\s\S]*Unread portal messages: 1/.test(rep), rep)
  ok('report: old moves not counted as this week', /MARAUDER: Build\n  Moved this week: Deliver on .*; Build on/.test(rep) && !/2026-10-01/.test(rep.split('MARAUDER')[1].split('\n')[1]))
  if (SHOTS) await page.screenshot({ path: SHOTS + '/overhaul-1440-report.png' })
  await page.click('#mrModal .btn-cancel')

  /* Playbook */
  await page.evaluate(() => showView('playbook')); await page.waitForTimeout(80)
  const pb = await page.$$eval('#pbList .pb-item', els => els.map(e => e.innerText))
  ok('playbook ships with the five titles, not written yet', pb.length === 5 && /Onboarding/.test(pb[0]) && /Creative refresh/.test(pb[4]) && pb.every(x => /not written yet/.test(x)), JSON.stringify(pb))
  ok('nothing written to ke_data.playbook until an edit', !(await page.evaluate(() => load().playbook)))
  await page.click('#pbList .pb-item:nth-child(2) button'); await page.fill('#pbB', 'Step one <b>bold?</b>'); await page.click('#pbModal .btn-save'); await page.waitForTimeout(100)
  const pbd = await page.evaluate(() => load().playbook)
  ok('editing one SOP saves all five through save(d)', pbd.length === 5 && pbd[1].title === 'Launch' && pbd[1].body.startsWith('Step one') && pbd[0].body === 'not written yet')
  ok('SOP body is escaped', /&lt;b&gt;bold\?&lt;\/b&gt;/.test(await page.innerHTML('#pbList .pb-item:nth-child(2) .pb-b')))
  if (SHOTS) await page.screenshot({ path: SHOTS + '/overhaul-1440-playbook.png' })
  ok('no page errors (1440)', errors.length === 0, errors.join(' | '))
  await page.close()
}

/* ── 390 ── */
{
  const { page, errors } = await boot({ width: 390, height: 844 }, true)
  /* the header's Log out button and the growth-step table (#growthContainer) overflow 390px on main
     already; this checks everything else in the Clients view */
  const over = () => page.evaluate(() => [...document.querySelectorAll('section[data-view="clients"] *')].filter(e => e.offsetParent !== null && !e.closest('.ov-money') && !e.closest('#growthContainer') && e.getBoundingClientRect().right > 390.5).map(e => e.className).slice(0, 5))
  ok('390: overview fits (money table scrolls in its own box)', (await over()).length === 0, (await over()).join(','))
  if (SHOTS) await page.screenshot({ path: SHOTS + '/overhaul-390-overview.png', fullPage: true })
  await page.tap('.clr[data-id="c_mr"]'); await page.waitForTimeout(150)
  ok('390: open card fits', (await over()).length === 0, (await over()).join(','))
  ok('390: spine steps all visible in one row', await page.$$eval('#card_c_mr .sp-step', els => { const t = els.map(e => Math.round(e.getBoundingClientRect().top)); return els.length === 6 && new Set(t).size === 1 && els.every(e => e.getBoundingClientRect().right <= 390) }))
  if (SHOTS) await page.locator('#card_c_mr').screenshot({ path: SHOTS + '/overhaul-390-marauder-card.png' })
  await page.tap('.clr[data-id="c_ff"]'); await page.waitForTimeout(150)
  ok('390: Deliver card fits', (await over()).length === 0, (await over()).join(','))
  if (SHOTS) await page.locator('#card_c_ff').screenshot({ path: SHOTS + '/overhaul-390-fulafalu-card.png' })
  ok('no page errors (390)', errors.length === 0, errors.join(' | '))
  await page.close()
}
await browser.close()
console.log(`\n${passes}/${passes + fails} overhaul checks passed`)
process.exit(fails ? 1 : 0)
