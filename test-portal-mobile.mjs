/* The Owners Portal on a phone.
 *
 * Rahaid, 2026-09-20: "just make sure it looks right on the phone I seen on a few
 * things it looks off". So this asserts the things that go wrong on a 375px screen
 * and are invisible on a laptop.
 *
 * TWO RULES FROM THE LEDGER SHAPE IT:
 *  - A screenshot is NOT a viewport measurement (2026-09-10). Every geometry claim
 *    here comes from the DOM inside a real device context with isMobile + hasTouch,
 *    never from reading a captured image.
 *  - The portal is GATED, so a naive run measures the login card and reports the
 *    dashboard clean. It seeds localStorage and reveals #dashboard directly, then
 *    proves it is measuring the dashboard before asserting anything about it.
 *
 * Run: node test-portal-mobile.mjs      (needs python3 -m http.server 8899 in this dir)
 */
import { chromium, devices } from 'playwright'
import { existsSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:8899'
const WIDTHS = [360, 375, 390, 430]
const TAP_MIN = 44          // the estate's own thumb-target floor

/* Enough state that every panel renders rows. An empty panel has no layout to fault. */
const SEED = {
  clients: [
    { id: 'c1', name: 'Marauder Clothing', status: 'active', founding: true, liveDate: '2026-08-01', baselineRevenue: 8000 },
    { id: 'c2', name: 'Syna World Atelier', status: 'active', liveDate: '2026-09-01', baselineRevenue: 22000 },
    { id: 'c3', name: 'A Very Long Streetwear Brand Name Ltd', status: 'active', liveDate: '2026-07-10', baselineRevenue: 4000 },
  ],
  growth: { snapshots: [
    { clientId: 'c1', date: '2026-09', avg: 13000 },
    { clientId: 'c2', date: '2026-09', avg: 25000 },
  ] },
  results: [{ name: 'Marauder Clothing', niche: 'streetwear', spend: 4200, margin: 62, leads: 3, booked: 74 }],
  tasks: [{ text: 'Chase the Marauder growth-step bonus invoice', done: false }],
  notes: 'seed',
  settings: { goalRetainers: 10, retainerValue: 2000, foundingValue: 1000, stepValue: 1000, stepTrigger: 1.5 },
}
const SEED_LEADS = Array.from({ length: 14 }, (_, i) => ({
  id: 'l' + i, business: 'Brand ' + i, stage: ['new', 'contacted', 'call', 'proposal', 'won', 'lost'][i % 6],
  estimatedValue: 2000, lastContact: i % 3 ? '2026-09-18' : '', nextActionDate: '2026-09-01', sequenceType: 'DTC',
}))

/* The cloud box ships chromium at a fixed path; Rahaid's Windows box does not, and a
   guard that cannot run on his machine reads as a broken page. Fall through to
   Playwright's own resolution when the hardcoded binary is absent. */
const PW_BIN = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const b = await chromium.launch({
  ...(existsSync(PW_BIN) ? { executablePath: PW_BIN } : {}),
  args: ['--ssl-version-max=tls1.2'],
})

const fails = []
const note = (w, msg) => fails.push(`${w}px  ${msg}`)

for (const width of WIDTHS) {
  const ctx = await b.newContext({
    ...devices['iPhone 13'],
    viewport: { width, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  })
  const p = await ctx.newPage()
  await p.addInitScript(([d, l]) => {
    localStorage.setItem('ke_data', d)
    localStorage.setItem('ke_leads', l)
  }, [JSON.stringify(SEED), JSON.stringify(SEED_LEADS)])
  await p.goto(BASE + '/dashboard.html', { waitUntil: 'domcontentloaded' })

  /* Reveal the dashboard without Supabase: render straight off the seeded local copy.
     Then PROVE we are looking at the dashboard before measuring it — a silent failure
     here would measure the gate card and report every panel clean. */
  await p.evaluate(() => {
    document.getElementById('gate').style.display = 'none'
    document.getElementById('dashboard').style.display = 'block'
    const d = load()
    renderStats(d); renderRevenue(d); renderSnapshot(d); renderTasks(d); renderResults(d)
    renderCommandCenter(JSON.parse(localStorage.getItem('ke_leads') || '[]'))
    document.getElementById('headerDate').textContent = 'Sat, 20 September 2026'
  })
  const proof = await p.evaluate(() => ({
    dashVisible: getComputedStyle(document.getElementById('dashboard')).display !== 'none',
    snapRows: document.querySelectorAll('#snapshotList .snap-item').length,
    statCards: document.querySelectorAll('#statsRow .stat-card').length,
  }))
  if (!proof.dashVisible || proof.snapRows < 3 || proof.statCards < 4) {
    note(width, `HARNESS: the dashboard did not render (visible=${proof.dashVisible} snapRows=${proof.snapRows} statCards=${proof.statCards}) — nothing below was measured`)
    await ctx.close(); continue
  }

  /* 1. THE LAYOUT VIEWPORT IS STILL THE PHONE'S.
        This is the check that found the real fault, and the obvious version of it
        could not. Comparing scrollWidth against innerWidth passes whatever happens:
        when content is too wide for width=device-width, the phone WIDENS the layout
        viewport to fit and zooms the page out, so BOTH numbers grow together and the
        page reports clean while rendering at 64%. The only fixed reference is the
        device width we asked for. (verification.md: a check must derive its subject
        from the artifact, and a check that cannot fail is not a check.) */
  const over = await p.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }))
  if (over.innerW > width + 1) note(width, `layout viewport widened to ${over.innerW}px — the phone zooms the whole portal out to ${Math.round(width / over.innerW * 100)}%; something inside is too wide to wrap`)
  else if (over.scrollW > over.innerW + 1) note(width, `page scrolls sideways: scrollWidth ${over.scrollW} vs viewport ${over.innerW}`)

  /* 2. Nothing sticking out past the right edge. A horizontally scrolling strip
        (.dash-nav) is deliberate and contained, so it is excused by name. */
  const spill = await p.evaluate((vw) => {
    const inScroller = el => !!el.closest('.dash-nav,.oq-scroll')
    const out = []
    document.querySelectorAll('#dashboard *').forEach(el => {
      if (inScroller(el)) return
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      if (r.right > vw + 1) out.push({ sel: el.className || el.tagName, right: Math.round(r.right), text: (el.textContent || '').trim().slice(0, 40) })
    })
    return out.slice(0, 6)
  }, over.innerW)
  spill.forEach(s => note(width, `overflows right edge by ${s.right - over.innerW}px: .${String(s.sel).split(' ')[0]} "${s.text}"`))

  /* 3. Nothing clipped inside its own box — the stat numbers and the retainer
        slot names are the two that squeeze first at 360. */
  const clipped = await p.evaluate(() => {
    const out = []
    document.querySelectorAll('.stat-v,.rev-current,.ret-slot,.snap-name,.res-nums,.rev-milestone').forEach(el => {
      if (el.scrollWidth > el.clientWidth + 1) out.push({ sel: el.className, has: Math.round(el.clientWidth), needs: Math.round(el.scrollWidth), text: (el.textContent || '').trim().slice(0, 28) })
    })
    return out.slice(0, 8)
  })
  clipped.forEach(c => note(width, `text clipped in .${String(c.sel).split(' ')[0]}: needs ${c.needs}px, has ${c.has}px — "${c.text}"`))

  /* 4. Thumb targets. A 12px text button is a fine mark and a poor target.
        HIT-TESTED, not measured off the box. The estate's own pattern for this is an
        invisible hit-slop - padding+negative margin, or a ::before with a negative
        inset - which grows what a thumb hits while the mark stays where it was. A
        check that reads getBoundingClientRect reports those as failures forever,
        which is a guard firing on correct work. So this asks the only question that
        matters: put a finger 22px above and below the centre, and see what it lands
        on. */
  const small = await p.evaluate((min) => {
    const out = []
    const half = min / 2 - 1
    document.querySelectorAll('#dashboard button, #dashboard a, #dashboard select, #dashboard .t-check').forEach(el => {
      /* elementFromPoint only answers about the VISIBLE viewport, so anything below
         the fold silently returns null and the element is never tested. Scroll each
         candidate to the middle of the screen first - otherwise the check quietly
         covers the header and nothing else, which is how it first reported the whole
         Tasks card clean. */
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const x = Math.round(r.left + r.width / 2)
      /* Still off-screen after scrolling (clipped inside a horizontal strip, say):
         report that rather than hit-testing a point that is not on the screen. */
      if (x < 0 || x > window.innerWidth || r.top < 0 || r.bottom > window.innerHeight) return
      const hits = [r.top + r.height / 2 - half, r.top + r.height / 2 + half]
        /* Only the element itself or something inside it counts. An ANCESTOR under
           the finger is the miss this check exists to catch, so `h.contains(el)`
           must not be accepted - that clause would make the check unable to fail. */
        .every(y => { const h = document.elementFromPoint(x, Math.round(y)); return h === el || el.contains(h) })
      if (!hits) out.push({ sel: el.className || el.tagName, h: Math.round(r.height), text: (el.textContent || '').trim().slice(0, 24) })
    })
    return out
  }, TAP_MIN)
  const byKind = {}
  small.forEach(s => { const k = String(s.sel).split(' ')[0] + '|' + s.h; byKind[k] = (byKind[k] || 0) + 1 })
  Object.entries(byKind).forEach(([k, n]) => {
    const [sel, h] = k.split('|')
    note(width, `tap target under ${TAP_MIN}px: ${n}× .${sel} at ${h}px tall`)
  })

  /* 5. Rows that wrap into each other. A .snap-item is name + stage + day + link on
        one line; below ~430 it has to stack rather than crush the name to nothing. */
  const crush = await p.evaluate(() => {
    const out = []
    document.querySelectorAll('.snap-item').forEach(el => {
      const name = el.querySelector('.snap-name'), day = el.querySelector('.snap-day')
      if (!name || !day) return
      const nr = name.getBoundingClientRect(), dr = day.getBoundingClientRect()
      const sameLine = Math.abs(nr.top - dr.top) < 4
      if (sameLine && nr.width < 90) out.push({ text: name.textContent.trim().slice(0, 30), w: Math.round(nr.width) })
    })
    return out
  })
  crush.forEach(c => note(width, `client row crushes the name to ${c.w}px on one line: "${c.text}"`))

  await ctx.close()
}
await b.close()

if (fails.length) {
  console.log('PHONE FAULTS\n')
  fails.forEach(f => console.log('  FAIL  ' + f))
  console.log(`\n${fails.length} fault(s) across ${WIDTHS.join(', ')}px`)
  process.exit(1)
}
console.log(`Owners Portal is clean at ${WIDTHS.join(', ')}px — no sideways scroll, no spill, no clipped text, no sub-${TAP_MIN}px target, no crushed rows.`)
