/* The site's public pages, driven in a real browser.
 *
 * The mechanism page (acquisition-system.html) was folded into index.html on
 * 2026-08-27 and its URL retired to a 308. The system now lives at
 * index.html#the-system.
 *
 * The first build shipped a `.btn-ghost` class that does not exist in this
 * site's stylesheet, so the secondary CTA rendered as a raw blue underlined
 * browser default — on brand/DESIGN.md's own terms, the single most obvious
 * possible violation, and invisible to any check that only reads the markup.
 * So this asserts on COMPUTED style: every link must carry a colour from our
 * palette, never the user-agent default.
 *
 * Needs Playwright:  npm i playwright && node test-acq-render.mjs
 */
import { chromium } from 'playwright'
import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'

const DIR = new URL('.', import.meta.url).pathname.replace(/\/$/, '')
const srv = http.createServer((q, s) => {
  const path = q.url.split('?')[0]
  const f = DIR + (path === '/' ? '/index.html' : path)
  if (!existsSync(f)) { s.writeHead(404); return s.end('') }
  const ext = path.split('.').pop()
  const type = { html:'text/html', css:'text/css', js:'text/javascript', woff2:'font/woff2',
                 png:'image/png', ico:'image/x-icon', svg:'image/svg+xml', jpg:'image/jpeg' }[ext] || 'text/plain'
  s.writeHead(200, { 'Content-Type': type }); s.end(readFileSync(f))
})
await new Promise(r => srv.listen(0, r))
const port = srv.address().port
const pw = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch(existsSync(pw) ? { executablePath: pw } : {})

const r = []
const check = (n, pass, d) => r.push([n, pass, d])

const PAGES = (process.env.PAGES || 'index.html,kaizenreach.html,kaizendesk.html,kaizenforge.html').split(',')

/* The growth step is CALL-ONLY (FIN-PRI-004, Rahaid 2026-09-04): the site reads as one
   monthly fee, price on the first call, and Diego explains the step. About kept a "Paid
   when you grow" panel spelling out the 50% trigger and the three-month baseline for a
   day after that ruling, because the ruling was applied to the homepage in view and
   never grepped across the site (OPS-LRN-001c, 2026-09-05). This reads every
   prospect-facing page from disk, so it runs whatever PAGES is set to. */
{
  const { readFileSync } = await import('node:fs')
  const STEP = /steps? up when|three[- ]month average|up by half|trailing three|trailing 3/i
  for (const f of ['index.html','about.html','apply.html','contact.html','booked.html']) {
    const m = readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').match(STEP)
    check(`${f}: growth step not disclosed on the site`, !m, m && m[0])
  }
}
for (const PAGE of PAGES)
for (const [label0, w, h] of [['desktop', 1280, 1000], ['phone', 390, 844]]) {
  const label = `${PAGE.replace('.html','')} ${label0}`
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  const errs = []
  page.on('pageerror', e => errs.push(String(e).slice(0, 140)))
  /* A failed-resource console error carries no URL in its TEXT — the url is on
     m.location(). Filtering on the text alone let the production-only Vercel
     analytics 404 through as a page error. */
  page.on('console', m => {
    if (m.type() !== 'error') return
    const from = (m.location() && m.location().url) || ''
    if (from.includes('/_vercel/')) return
    errs.push(m.text().slice(0, 140))
  })
  const bad = []
  /* /_vercel/insights only exists in production; a 404 for it locally is the
     test environment, not the page. */
  page.on('response', res => { if (res.status() >= 400 && !res.url().includes('/_vercel/')) bad.push(`${res.status()} ${res.url().split('/').pop()}`) })

  await page.goto(`http://127.0.0.1:${port}/${PAGE}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)

  check(`${label}: no console or page errors`, errs.length === 0, errs[0] || '')
  check(`${label}: nothing 404s`, bad.length === 0, [...new Set(bad)].join(','))
  /* documentElement.scrollWidth stays CLAMPED to the viewport, so it reports 390 on a
     page whose body is 433 wide. On 2026-08-27 this check passed while the homepage's
     proof cards ran 43px off the right of a phone — Rahaid photographed it. Measure the
     body, and name the element, so a green result cannot mean "I looked at the wrong
     box". */
  const overflow = await page.evaluate(() => {
    const vw = window.innerWidth
    const out = []
    for (const e of document.querySelectorAll('body *')) {
      const r = e.getBoundingClientRect()
      if (r.width > 0 && r.right > vw + 1)
        out.push(`${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ')[0]} right:${Math.round(r.right)}`)
    }
    return { body: document.body.scrollWidth, vw, els: [...new Set(out)].slice(0, 5) }
  })
  check(`${label}: no horizontal overflow`,
    overflow.body <= overflow.vw + 1 && overflow.els.length === 0,
    `body ${overflow.body} vs viewport ${overflow.vw}${overflow.els.length ? ' | ' + overflow.els.join(', ') : ''}`)

  /* The defect that actually shipped. A browser-default link is rgb(0,0,238)
     or the visited purple; ours are always palette values. */
  const rogue = await page.evaluate(() => {
    const DEFAULTS = ['rgb(0, 0, 238)', 'rgb(0, 0, 255)', 'rgb(85, 26, 139)']
    return [...document.querySelectorAll('a')]
      .filter(a => a.offsetParent !== null)
      .filter(a => DEFAULTS.includes(getComputedStyle(a).color))
      .map(a => (a.className || a.textContent || '').trim().slice(0, 40))
  })
  check(`${label}: no link falls back to the browser default colour`, rogue.length === 0, rogue.join(' | '))

  /* A class that does not exist in the stylesheet is invisible in the markup.
     Every class the page uses must actually resolve to a rule somewhere. */
  /* Compare against the SERVED SOURCE, not the live DOM. Decorative elements
     the page's own script builds (the particle layer) are styled inline and
     legitimately carry no rule; flagging those is a false positive. */
  const src = readFileSync(DIR + '/' + PAGE, 'utf8')
  const unstyled = (await page.evaluate(() => {
    const declared = new Set()
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules } catch { continue }
      for (const rule of rules) {
        const grab = (t) => (t.match(/\.[-\w]+/g) || []).forEach(c => declared.add(c.slice(1)))
        if (rule.selectorText) grab(rule.selectorText)
        else if (rule.cssRules) for (const inner of rule.cssRules) if (inner.selectorText) grab(inner.selectorText)
      }
    }
    const used = new Set()
    document.querySelectorAll('[class]').forEach(el => el.classList.forEach(c => used.add(c)))
    return [...used].filter(c => !declared.has(c))
  })).filter(c => new RegExp('class="[^"]*\\b' + c + '\\b').test(src))
  /* Grandfathered: classes already unstyled before this rebuild. Named rather
     than silently skipped, so they stay visible as debt instead of vanishing. */
  const LEGACY_UNSTYLED = ['lead-form']
  const fresh = unstyled.filter(c => !LEGACY_UNSTYLED.includes(c))
  check(`${label}: every class used resolves to a real rule`, fresh.length === 0, fresh.join(', '))

  /* NOT document.fonts.check(): that returns true when NO declared face matches the
     request, so for months it asserted Fraunces and Plus Jakarta Sans - both retired -
     and passed on a page that loaded neither. A face has to be DECLARED and LOADED. */
  const faces = await page.evaluate(() => [...document.fonts].map(f => [f.family.replace(/["']/g, ''), f.status]))
  for (const fam of ['Manrope', 'Newsreader'])
    check(`${label}: ${fam} face is declared and loaded`,
      faces.some(([f, s]) => f === fam && s === 'loaded'), JSON.stringify(faces))

  /* Content that must be on the page, not just in the file. */
  /* innerText returns TEXT-TRANSFORMED output, so a `.smallcaps` eyebrow reads
     back as FOUNDATION, not Foundation. Compare case-insensitively, or this
     fails because the page is styled correctly. */
  const text = (await page.evaluate(() => document.body.innerText)).toLowerCase()
  /* The method's steps and the mechanism name belong on the pages that TEACH the
     system. Forge sells a one-off website and is not obliged to recite it.
     Foundation / Demand / Capture left with the reno model when the creative page
     became the homepage (7a34826, 2026-09-04); this went red that morning and stayed
     red because nothing told it the system had changed. The steps are asserted by
     their live headings so the next repositioning fails here loudly, on day one. */
  const TEACHES = ['index.html']
  if (TEACHES.includes(PAGE)) {
    const STEPS = ['find your real profit per sale', 'mark where you already are', 'make the ads']
    const missing = STEPS.filter(x => !text.includes(x))
    check(`${label}: the method's steps render`, missing.length === 0, missing.join(', '))
    check(`${label}: the mechanism is named`, text.includes('kaizen loop'))
  }
  /* "The System" left the nav on 2026-08-27 (it pointed at the page it sat on), so a
     site-wide link check no longer means anything. What must hold is that each service
     page still routes back to the mechanism from the section that explains its stage. */
  const ROUTES_BACK = ['kaizenreach.html', 'kaizendesk.html', 'kaizenforge.html']
  if (ROUTES_BACK.includes(PAGE))
    check(`${label}: routes back to the system`, /index\.html#the-system/.test(await page.content()))
  check(`${label}: the retired mechanism URL is gone`, !/acquisition-system\.html/.test(await page.content()))
  /* Scoped 2026-09-04. This asserted site-wide that every page names KaizenReach,
     which was true under the three-product architecture and is a REVERSED decision
     now: the v3 pass took Reach, Desk and Forge out of the nav, promoted the creative
     page to index.html, and named the method the Kaizen Loop (renamed 2026-09-05). index.html
     carries zero mentions and does not link kaizenreach.html at all. A guard asserting
     a decision we deliberately reversed is worse than no guard - it trains you to skip
     red. What must still hold is that the product's OWN page never stops naming it. */
  const SELLS_REACH = ['kaizenreach.html']
  if (SELLS_REACH.includes(PAGE))
    check(`${label}: KaizenReach is named as the product`, text.includes('kaizenreach'))
  /* Reach and Desk retainer prices are NOT public (brand/DESIGN.md, FIN-PRI-001).
     Forge's £499 is. A price leaking onto this page is a canon breach. */
  /* A canon figure is only a breach when it is quoted AS OUR PRICE. Forge names
     what other agencies charge for a rebuild (£1,500 to £5,000) and runs an ROI
     calculator with a £2,000 default job value — neither is our retainer. What
     must never appear is one of our monthly fees next to a per-month marker. */
  check(`${label}: no private retainer price leaked`,
    !/£\s?(2,?500|1,?500|500|750|3,?500|5,?000)\s*(\/\s*mo|per month|a month|pm\b)/i.test(text),
    (text.match(/£[\d,]+\s*(\/\s*mo|per month|a month)/gi) || []).join(','))

  await page.screenshot({ path: `/tmp/acq-${label.replace(/[^a-z0-9]+/gi,'-')}-full.png`, fullPage: true })
  await page.close()
}
await browser.close(); srv.close()
let failed = 0
for (const [n, pass, d] of r) { if (!pass) failed++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${pass ? '' : '   <- ' + (d || '')}`) }
console.log(`\n${r.length - failed}/${r.length} passed`)
process.exit(failed ? 1 : 0)
