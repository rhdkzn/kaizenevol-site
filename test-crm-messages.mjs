/* The Messages tab (2026-10-12).
 * Rahaid: "marauders messages should live on a like messages page likes a chat style ting that you
 * can see all past conversations". Before this, the client card showed the last 5 client messages
 * and none of our replies.
 *
 * Drives crm.html with a stubbed Supabase and two clients: one with 12 mixed client/agency items
 * (2 unread), one with a single message. Checks the list, the full thread, read marking, the reply
 * insert, escaping, the card link, and the one-column phone layout. SHOTS=dir saves screenshots.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }
const SHOTS = process.env.SHOTS || ''
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const C = (id, name, extra) => ({ id, name, status: 'active', terms: 'Founding £1,000/mo', adSpend: 'per drop', retainerValue: 1000, founding: true, ...extra })
const SEED = { clients: [C('c1', 'Northside Records', { segment: 'Artist' }), C('c2', 'Lumen Candles', {})], clientTasks: {}, growth: { snapshots: [] }, settings: { retainerValue: 2000, foundingValue: 1000, stepValue: 1000, stepTrigger: 1.5 } }

/* newest first, as ptLoad() orders them. 12 for c1: client and agency messages plus our updates. */
const at = (d, h, m) => `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+00:00`
const c1 = [
  [1, 'client', 'message', at(1, 9, 12), 'Hey, quick one: when does the first ad go live?'],
  [2, 'agency', 'message', at(1, 10, 3), 'Monday. We are finishing the cut-downs this week.'],
  [3, 'agency', 'update', at(2, 16, 40), 'Week 1 numbers: 41 pre-saves, 3.1% click-through.', 'Weekly numbers'],
  [4, 'client', 'message', at(3, 11, 0), 'Love that. Can we push the TikTok one harder?'],
  [5, 'agency', 'message', at(3, 11, 45), 'Yes. Moving £40 from the Reels set to TikTok from tomorrow.'],
  [6, 'client', 'message', at(5, 20, 15), 'Sent the stems over in Files.'],
  [7, 'agency', 'file', at(6, 9, 30), 'New file in Files: cutdown-v2.mp4'],
  [8, 'agency', 'message', at(6, 9, 31), 'Got them, thanks. v2 of the cut-down is up for you to check.'],
  [9, 'client', 'message', at(8, 14, 2), 'v2 is the one. Ship it.'],
  [10, 'agency', 'update', at(9, 17, 0), 'Week 2: 118 pre-saves. Cost per pre-save down to £0.61.', 'Weekly numbers'],
  [11, 'client', 'message', at(11, 21, 40), 'Is the release date still the 24th? <b>not bold</b>'],
  [12, 'client', 'message', at(12, 8, 5), 'Also, the label wants a call this week if you can.\nThursday works best.'],
].map(([id, author, kind, created_at, body, title]) => ({ id, client_id: 'c1', kind, author, body, title: title || (author === 'client' ? 'Message' : null), created_at, read_by_staff: !(id === 11 || id === 12) })).reverse()
const c2 = [{ id: 20, client_id: 'c2', kind: 'message', author: 'client', title: 'Message', body: 'Thanks for the call today!', created_at: at(7, 13, 20), read_by_staff: true }]
const ROWS = [...c1, ...c2].sort((a, b) => b.created_at.localeCompare(a.created_at))

/* Supabase stub: serves ROWS for ke_portal_items and records every write in window.__writes. */
const STUB = `window.__rows=${JSON.stringify(ROWS)};window.__writes=[];window.supabase={createClient:function(){
  function q(t){var st={t:t,op:'select'};var o={select:()=>o,eq:(k,v)=>{st.eq=[k,v];return o},in:(k,v)=>{st.in=[k,v];return o},order:()=>o,limit:()=>o,
    single:()=>Promise.resolve({data:null}),maybeSingle:()=>Promise.resolve({data:null}),
    update:(v)=>{st.op='update';st.val=v;return o},insert:(v)=>{st.op='insert';st.val=v;window.__writes.push(st);if(t==='ke_portal_items'){window.__rows.unshift(Object.assign({id:100+window.__writes.length,created_at:new Date().toISOString(),read_by_staff:false},v));}return Promise.resolve({error:null})},
    upsert:()=>Promise.resolve({}),
    then:(f,r)=>{if(st.op==='update'){window.__writes.push(st);if(t==='ke_portal_items'&&st.in)window.__rows.forEach(x=>{if(st.in[1].includes(x.id))Object.assign(x,st.val)});return Promise.resolve({error:null}).then(f,r)}
      return Promise.resolve({data:t==='ke_portal_items'?JSON.parse(JSON.stringify(window.__rows)):[]}).then(f,r)}};return o}
  return{auth:{getSession:()=>Promise.resolve({data:{session:null}}),onAuthStateChange:()=>{},signInWithOtp:()=>Promise.resolve({})},from:q,rpc:()=>Promise.resolve({}),channel:()=>({on(){return this},subscribe(){return this}}),storage:{from:()=>({list:()=>Promise.resolve({data:[]})})}}}}`

const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}) })

async function boot(viewport, mobile) {
  const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile })
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.route('**/@supabase/supabase-js@2**', r => r.fulfill({ contentType: 'application/javascript', body: STUB }))
  await page.addInitScript(d => { localStorage.setItem('ke_data', d); localStorage.removeItem('crm_open_client') }, JSON.stringify(SEED))
  await page.goto((process.env.BASE || 'http://127.0.0.1:8899') + '/crm.html', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await page.evaluate(async () => { document.getElementById('app').style.display = 'block'; document.getElementById('gate').style.display = 'none'; await ptLoad(); renderClients(load()); showView('messages', true) })
  await page.waitForTimeout(150)
  return { page, errors }
}

/* ── desktop 1440 ── */
{
  const { page, errors } = await boot({ width: 1440, height: 900 }, false)
  ok('tab badge counts unread client messages (2)', (await page.textContent('#msgTabCount')) === '2')
  const list = await page.$$eval('#msgList .msg-conv', els => els.map(e => ({ cid: e.dataset.cid, unread: e.classList.contains('unread'), t: e.innerText })))
  ok('one conversation per client with messages, newest first', list.length === 2 && list[0].cid === 'c1' && list[1].cid === 'c2', JSON.stringify(list.map(l => l.cid)))
  ok('list row: name, preview of the last message, unread dot', /Northside Records/.test(list[0].t) && /label wants a call/.test(list[0].t) && list[0].unread && !list[1].unread, list[0].t)
  ok('nothing open: placeholder, no reply box', await page.evaluate(() => document.getElementById('msgForm').offsetParent === null && /Pick a conversation/.test(document.getElementById('msgThread').innerText)))
  if (SHOTS) await page.screenshot({ path: SHOTS + '/messages-1440-list.png' })

  await page.click('#msgList .msg-conv[data-cid="c1"]'); await page.waitForTimeout(200)
  const th = await page.$$eval('#msgThread .msg-bub', els => els.map(e => ({ us: e.classList.contains('us'), t: e.innerText, html: e.innerHTML, x: e.getBoundingClientRect().left })))
  ok('full thread: all 12 items, not the last 5', th.length === 12, th.length)
  ok('oldest to newest', /first ad go live/.test(th[0].t) && /label wants a call/.test(th[11].t))
  ok('client on the left, us on the right', !th[0].us && th[1].us && th[1].x > th[0].x, th.slice(0, 2).map(b => Math.round(b.x)).join(','))
  ok('updates and files show as our bubbles', th[2].us && /Weekly numbers/.test(th[2].t) && /update/.test(th[2].t) && th[6].us && /file/.test(th[6].t))
  ok('date and time on every bubble', th.every(b => /\d{1,2} Oct, \d{2}:\d{2}/.test(b.t)), th.find(b => !/\d{1,2} Oct, \d{2}:\d{2}/.test(b.t))?.t)
  ok('client text is escaped, never HTML', th[10].html.includes('&lt;b&gt;not bold&lt;/b&gt;') && !(await page.$('#msgThread .msg-bub b:not(:first-of-type)')) && !/<b>not bold/.test(th[10].html))
  const writes = await page.evaluate(() => window.__writes)
  const upd = writes.find(w => w.op === 'update')
  ok('opening marks that client\'s unread messages read (one update, ids 11 and 12)', upd && upd.val.read_by_staff === true && JSON.stringify([...upd.in[1]].sort()) === '[11,12]', JSON.stringify(upd))
  ok('badge and dot clear after opening', (await page.textContent('#msgTabCount')) === '' && !(await page.$('#msgList .msg-conv.unread')))
  const scrolled = await page.evaluate(() => { const t = document.getElementById('msgThread'); return t.scrollHeight - t.scrollTop - t.clientHeight })
  ok('thread opens scrolled to the newest message', scrolled < 5, scrolled)
  if (SHOTS) await page.screenshot({ path: SHOTS + '/messages-1440-thread.png' })

  await page.fill('#msgReply', 'Thursday 2pm works. Sending an invite now.')
  await page.click('#msgSendBtn'); await page.waitForTimeout(250)
  const ins = (await page.evaluate(() => window.__writes)).find(w => w.op === 'insert')
  ok('reply inserts kind message, author agency, for that client', ins && ins.t === 'ke_portal_items' && ins.val.kind === 'message' && ins.val.author === 'agency' && ins.val.client_id === 'c1' && /Thursday 2pm/.test(ins.val.body), JSON.stringify(ins))
  const after = await page.$$eval('#msgThread .msg-bub', els => ({ n: els.length, last: els[els.length - 1].className + ' ' + els[els.length - 1].innerText }))
  ok('reply shows at the bottom as ours, box cleared', after.n === 13 && /us/.test(after.last) && /Thursday 2pm/.test(after.last) && (await page.inputValue('#msgReply')) === '', JSON.stringify(after))

  /* the card link jumps to the thread */
  await page.evaluate(() => { showView('clients', true); clSetOpen('c2'); renderClients(load()) })
  await page.waitForTimeout(150)
  const link = await page.$('#card_c2 .pt-wrap a[onclick^="msgGo"]')
  ok('client card has "Open in Messages"', !!link && /Open in Messages/.test(await link.innerText()))
  if (link) { await link.click(); await page.waitForTimeout(200) }
  ok('the link opens that client\'s thread on the Messages tab', await page.evaluate(() => document.querySelector('#app section[data-view="messages"]').style.display === '' && _msgOpen === 'c2' && /Thanks for the call/.test(document.getElementById('msgThread').innerText)))
  ok('no page errors (desktop)', errors.length === 0, errors.join(' | '))
  await page.close()
}

/* ── phone 390 ── */
{
  const { page, errors } = await boot({ width: 390, height: 844 }, true)
  const vis = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && e.offsetParent !== null && e.getBoundingClientRect().width > 0 }, sel)
  /* the page header's Log out button already overflows 390px on main (every tab); this checks the Messages view itself */
  const noOverflow = () => page.evaluate(() => [...document.querySelectorAll('section[data-view="messages"], section[data-view="messages"] *')].filter(e => e.offsetParent !== null && e.getBoundingClientRect().right > 390.5).map(e => e.className))
  ok('phone: list shows, thread hidden', (await vis('#msgList')) && !(await vis('#msgThread')))
  { const o = await noOverflow(); ok('phone: nothing in the list view is wider than 390px', o.length === 0, o.join(',')) }
  if (SHOTS) await page.screenshot({ path: SHOTS + '/messages-390-list.png' })
  await page.tap('#msgList .msg-conv[data-cid="c1"]'); await page.waitForTimeout(200)
  ok('phone: tap opens the thread full width, list hidden', (await vis('#msgThread')) && !(await vis('#msgList')))
  ok('phone: back button and reply box visible', (await vis('.msg-back')) && (await vis('#msgReply')))
  const box = await page.evaluate(() => { const s = document.getElementById('msgShell').getBoundingClientRect(); return { b: s.bottom, w: s.width } })
  ok('phone: thread fits the screen (reply box above the fold)', box.b <= 844 && box.w <= 390, JSON.stringify(box))
  ok('phone: reply box is 16px (no iOS zoom)', (await page.$eval('#msgReply', e => getComputedStyle(e).fontSize)) === '16px')
  { const o = await noOverflow(); ok('phone: nothing in the thread is wider than 390px', o.length === 0, o.join(',')) }
  if (SHOTS) await page.screenshot({ path: SHOTS + '/messages-390-thread.png' })
  await page.tap('.msg-back'); await page.waitForTimeout(150)
  ok('phone: back returns to the list', (await vis('#msgList')) && !(await vis('#msgThread')))
  ok('no page errors (phone)', errors.length === 0, errors.join(' | '))
  await page.close()
}

await browser.close()
console.log(`\n${passes}/${passes + fails} messages checks passed`)
process.exit(fails ? 1 : 0)
