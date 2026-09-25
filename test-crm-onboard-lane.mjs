/* The CRM's onboarding modal, two lanes (Kaizen Ascent, OPS-ONB-006, 2026-09-25).
 *
 * The modal writes the ke_onboarding row the agreement is rendered from. Get the row wrong
 * and the wrong agreement goes out: a local business sent a creative £1,000 retainer, or a
 * creative row that suddenly carries a lane key. So the row builder, the client-card builder
 * and the founding-seat count are pinned here.
 *
 * Driven off the shipped code between the OB-LANE markers in crm.html. A copied-out version
 * would drift and pass forever.
 */
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('./crm.html', import.meta.url), 'utf8')
const a = html.indexOf('/* OB-LANE-START'), b = html.indexOf('/* OB-LANE-END */')
let fails = 0, passes = 0
const ok = (name, cond, detail) => { if (cond) { passes++; console.log('  ok   ' + name) } else { fails++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) } }
if (a < 0 || b < 0) { console.log('FAIL OB-LANE markers not found in crm.html'); console.log(`\n0 passed, 1 failed`); process.exit(1) }
const { obRowData, obClientFromRow, obSeatsLeft } = new Function(html.slice(a, b) + '\n;return {obRowData, obClientFromRow, obSeatsLeft};')()

const lead = { id: 'L1', business: 'Hollow Oak Barbers', niche: 'Barbers' }
const base = { founder: 'Dev Patel', email: 'dev@hollowoak.co.uk', segment: '', tier: 'founding', start: '', baseline: '', notes: '', entity: '', address: '', buyout: '' }

/* creative: the exact keys the modal wrote before lanes existed */
const c = obRowData({ ...base, lane: 'creative', baseline: '8000' }, lead, '2026-09-25')
ok('creative row: no lane key (old rows and new creative rows look the same)', !('lane' in c))
ok('creative row: founding £1,000', c.founding === true && c.retainer === 1000)
ok('creative row: standard £2,000', obRowData({ ...base, lane: 'creative', tier: 'standard' }, lead, '2026-09-25').retainer === 2000)
ok('creative row: baseline kept', c.baselineRevenue === 8000)
ok('creative row: no buy-out key', !('buyout' in c))
ok('creative row: same key set as before lanes', JSON.stringify(Object.keys(c)) === JSON.stringify(['business','founder','email','segment','founding','retainer','startDate','baselineRevenue','proposalNotes','clientEntity','clientAddress','issuedAt','createdBy']), Object.keys(c).join(','))

/* local */
const l = obRowData({ ...base, lane: 'local', baseline: '8000' }, lead, '2026-09-25')
ok('local row: lane "local"', l.lane === 'local')
ok('local row: founding £500', l.founding === true && l.retainer === 500)
ok('local row: standard £750', obRowData({ ...base, lane: 'local', tier: 'standard' }, lead, '2026-09-25').retainer === 750)
ok('local row: no baseline revenue, even if one was typed', !l.baselineRevenue)
ok('local row: buy-out empty stays off the row (the agreement applies the £1,200 default)', !l.buyout)
ok('local row: buy-out typed is stored as a number', obRowData({ ...base, lane: 'local', buyout: '1450' }, lead, '2026-09-25').buyout === 1450)
ok('local row: segment defaults to Local', l.segment === 'Local')

/* client card on Mark paid */
const cc = obClientFromRow(c, lead, 'tok', '2026-09-25T00:00:00Z', 'c_x')
ok('creative client card: terms and ad spend as before', cc.terms === 'Founding £1,000/mo' && cc.adSpend === 'per drop' && !('lane' in cc))
const lc = obClientFromRow(l, lead, 'tok', '2026-09-25T00:00:00Z', 'c_y')
ok('local client card: lane local, £500 terms, no ad-spend line', lc.lane === 'local' && lc.terms === 'Founding £500/mo' && !lc.adSpend && lc.retainerValue === 500, JSON.stringify(lc))
ok('local client card: standard terms £750', obClientFromRow(obRowData({ ...base, lane: 'local', tier: 'standard' }, lead, '2026-09-25'), lead, 't', 'x', 'c').terms === 'Standard £750/mo')

/* founding seats, per lane */
const rows = [
  { status: 'paid', data: { founding: true } }, { status: 'signed', data: { founding: true } }, { status: 'sent', data: { founding: true } },
  { status: 'live', data: { lane: 'local', founding: true } }, { status: 'viewed', data: { lane: 'local', founding: true } }, { status: 'paid', data: { lane: 'local', founding: false } },
]
ok('creative seats left: 5 minus signed/paid/live founding creative rows', obSeatsLeft(rows, 'creative') === 3, obSeatsLeft(rows, 'creative'))
ok('local seats left: counted separately', obSeatsLeft(rows, 'local') === 4, obSeatsLeft(rows, 'local'))
ok('seats never go below zero', obSeatsLeft(Array(9).fill({ status: 'paid', data: { lane: 'local', founding: true } }), 'local') === 0)

/* the modal itself carries the lane select and the buy-out field */
ok('modal has a Lane select (Creative / Local)', /id="obLane"[\s\S]{0,300}value="creative"[\s\S]{0,200}value="local"/.test(html))
ok('modal has a buy-out field, blank meaning the £1,200 default', /id="obBuyout"[^>]*placeholder="blank = £1,200"/.test(html))
ok('modal shows founding seats left', /id="obSeats"/.test(html))

console.log(`\n${passes} passed, ${fails} failed`)
process.exit(fails ? 1 : 0)
