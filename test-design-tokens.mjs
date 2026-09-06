/* Design tokens: every public page resolves the SAME tokens to the SAME values.
 *
 * Written 2026-09-06. The daily-note carry called this "About/Contact/Privacy
 * still on the old palette". It was not a palette drift — the COLOURS were
 * already right. The real defect was typography and it had been shipping:
 *
 *   about / contact / privacy / booked all set  --serif: 'Manrope', ...
 *
 * a SANS stack. Each of those pages loads Newsreader from Google Fonts and then
 * never uses it, so every h1/h2/h3 and every italic display numeral rendered in
 * the sans while index.html and apply.html rendered in the serif. The font was
 * downloaded on every visit and thrown away.
 *
 * It survived because nothing compared pages to each other. A page is internally
 * consistent with a wrong token, and looks fine on its own. This file is the
 * comparison.
 *
 * Tokens are read as RESOLVED values off the live document, not grepped out of
 * the source: a page can declare a token correctly in one block and override it
 * three rules later, and only the computed value says what actually rendered.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT ASSERT, and it is the more useful half:
 * "headings are serif" is FALSE here. index.html sets headings in Manrope and
 * uses the serif ONLY for the italic accent inside a heading (<em>growing</em>)
 * and for the big step numerals. The first draft of this file asserted serif
 * headings and failed the homepage — a guard that condemns correct work is worse
 * than no guard, because it trains you to skip the run. The assertion below is
 * therefore scoped to elements that ASK for var(--serif): whatever a page points
 * at the serif token must actually come out in the serif.
 *
 * Needs Playwright:  npm i playwright && node test-design-tokens.mjs
 */
import { chromium } from 'playwright'
import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'

const DIR = new URL('.', import.meta.url).pathname.replace(/\/$/, '')
const srv = http.createServer((q, s) => {
  const path = decodeURIComponent(q.url.split('?')[0])
  const f = DIR + (path === '/' ? '/index.html' : path)
  if (!existsSync(f)) { s.writeHead(404); return s.end('') }
  const ext = path.split('.').pop()
  const type = { html:'text/html', css:'text/css', js:'text/javascript', woff2:'font/woff2',
                 png:'image/png', ico:'image/x-icon', svg:'image/svg+xml', jpg:'image/jpeg',
                 webp:'image/webp', json:'application/json' }[ext] || 'text/plain'
  s.writeHead(200, { 'Content-Type': type }); s.end(readFileSync(f))
})
await new Promise(r => srv.listen(0, r))
const port = srv.address().port
const pw = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch(existsSync(pw) ? { executablePath: pw } : {})

const r = []
const check = (n, pass, d) => r.push([n, pass, d])

/* Same public set as test-page-hygiene.mjs. Labs, demos and the app surfaces are
 * deliberately out — they are workbenches, not pages a prospect lands on. */
const PAGES = (process.env.PAGES || [
  'index.html','about.html','contact.html','apply.html','booked.html','privacy.html','404.html',
].join(',')).split(',')

/* brand/DESIGN.md v3.0, "Palette — mixed neutrals". Values, not names: a page is
 * free to alias --ink as --text, and several do. What it is not free to do is
 * resolve the house serif to a sans. */
const COLOURS = {
  '--page': '#f7f6f4', '--recess': '#efede9', '--cool': '#e8e9ea',
  '--hairline': '#d8d4cc', '--stone': '#8a857c', '--muted': '#6e6a63', '--ink': '#23211e',
}

for (const p of PAGES) {
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${port}/${p}`, { waitUntil: 'load' })
  const tok = await page.evaluate((names) => {
    const cs = getComputedStyle(document.documentElement)
    const out = {}
    for (const n of names) out[n] = cs.getPropertyValue(n).trim()
    // Named cross-page elements: the SAME design element on different pages must
    // resolve to the same family. Selecting elements by "what font are they in" is
    // circular — it finds them BECAUSE they are in the wrong font — so the probe
    // names the classes the design actually uses for the serif italic numeral.
    const NUMERALS = ['.step .n', '.commit-num', '.svc-num']
    out.__numerals = NUMERALS.flatMap((sel) =>
      [...document.querySelectorAll(sel)].slice(0, 1).map((el) => {
        const cs = getComputedStyle(el)
        return { sel, family: cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim(), style: cs.fontStyle }
      }))
    return out
  }, [...Object.keys(COLOURS), '--serif', '--sans'])

  /* The bug this file exists for. A page may legitimately not declare --serif;
     it may not point the SERIF token at a SANS family. Note that the upright
     Newsreader @font-face in this repo is deliberately aliased to manrope.woff2
     (there is no upright Newsreader file — only newsreader-italic.woff2), so a
     wrong --serif is invisible on headings and shows up ONLY in italics. That is
     exactly why it survived: the page looks right until something asks for the
     serif italic. */
  if (tok['--serif']) {
    check(`${p}: --serif is a serif`,
      /newsreader/i.test(tok['--serif']) && !/manrope/i.test(tok['--serif']),
      `--serif resolves to "${tok['--serif']}"`)
  }

  /* The visible consequence. The big italic step numeral is the same design element
     on every page that has one; on 2026-09-06 it rendered as Newsreader italic on
     index.html and as slanted Manrope on about.html, because --serif was a sans
     stack there. Two different marks for one element, live. */
  for (const n of tok.__numerals || []) {
    check(`${p}: ${n.sel} numeral is Newsreader italic`,
      /newsreader/i.test(n.family) && n.style === 'italic',
      `renders "${n.family}" ${n.style}`)
  }

  /* Only assert on tokens the page DECLARES. A page is free to carry a subset —
     404.html needs three colours, not seven. What it is not free to do is
     declare one of these names and give it a value the brand does not use. */
  for (const [name, want] of Object.entries(COLOURS)) {
    const got = (tok[name] || '').toLowerCase()
    if (!got) continue
    check(`${p}: ${name} is ${want}`, got === want, `resolves to "${got}"`)
  }
  await page.close()
}

await browser.close(); srv.close()
const bad = r.filter(([, ok]) => !ok)
for (const [n, ok, d] of r) if (!ok) console.log(`FAIL  ${n} — ${d}`)
console.log(`\n${r.length - bad.length}/${r.length} passed`)
process.exit(bad.length ? 1 : 0)
