/* Page hygiene: the five checks nothing else in this suite was guarding.
 *
 * Written 2026-09-05. Rahaid sent a TikTok listing 20 things to fix on a
 * vibecoded site (swipe #132). Every item was audited against this repo and the
 * public pages PASSED almost all of it — so this file is not fixing a defect,
 * it is closing the gap between "correct today" and "guarded tomorrow", which
 * is the shape of every incident in .claude/rules/verification.md.
 *
 * The suite already covers 404s, titles, alt text, tel: and mailto:. It had NO
 * check for favicon, meta description, viewport, horizontal overflow, or the
 * copyright year. Two real defects were sitting in that gap when this was
 * written: 404.html had no meta description, and kaizendesk/compare.html had no
 * favicon. Both are fixed in the same commit; this file is why they cannot
 * come back silently.
 *
 * THE COPYRIGHT-YEAR CHECK IS THE ONE THAT EARNS ITS KEEP. Every page is correct
 * today and every page goes wrong at midnight on 1 January, at once, with nothing
 * watching. It is the only check here that fails on a date rather than on an edit.
 *
 * Overflow is served over HTTP, never file://. A page whose stylesheet failed to
 * load cannot overflow, so a file:// pass is indistinguishable from a page with no
 * CSS at all — the check would be decorative. The server below is why the result
 * means something.
 *
 * Needs Playwright:  npm i playwright && node test-page-hygiene.mjs
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

/* PUBLIC MARKETING pages only. Labs, demos, snippets and the app surfaces
 * (crm.html, dashboard.html) are deliberately out: they are tools and workbenches,
 * not pages a prospect lands on, and holding them to marketing hygiene would make
 * this suite noisy enough to start being skipped. */
const PAGES = (process.env.PAGES || [
  'index.html','about.html','contact.html','apply.html','booked.html','privacy.html','404.html',
  'kaizenreach.html','kaizendesk.html','kaizenforge.html','kaizendesk/compare.html',
  'kitchen.html','bathroom.html','loft.html','local.html',
  'kitchen-jobs.html','bathroom-jobs.html','loft-jobs.html',
].join(',')).split(',')

/* Widths that actually matter. 375 is the narrowest phone still in real use;
 * 390 is the modern default. Desktop is included because an overflow there is
 * rarer and therefore likelier to ship unnoticed. */
const VIEWPORTS = [{ n: '375', w: 375, h: 667 }, { n: '390', w: 390, h: 844 }, { n: '1440', w: 1440, h: 900 }]
const YEAR = String(new Date().getFullYear())

for (const p of PAGES) {
  const html = readFileSync(`${DIR}/${p}`, 'utf8')

  check(`${p}: has a favicon`, /rel=["'][^"']*icon/i.test(html), 'no <link rel="...icon">')

  check(`${p}: has a meta description`,
    /<meta[^>]+name=["']description["'][^>]*content=["'][^"']{20,}/i.test(html),
    'missing, or shorter than 20 chars')

  check(`${p}: declares a viewport`, /name=["']viewport["']/i.test(html), 'no viewport meta')

  /* Only assert on pages that actually carry a copyright line. A page without one
     has nothing to rot, and asserting on it would be a check that cannot fail. */
  const years = [...html.matchAll(/(?:©|&copy;|&#169;)[^<]{0,20}?(\d{4})/g)].map(m => m[1])
  if (years.length) {
    check(`${p}: copyright year is current`, years.includes(YEAR),
      `shows ${[...new Set(years)].join(',')}, expected ${YEAR}`)
  }

  for (const v of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h } })
    const page = await ctx.newPage()
    await page.goto(`http://127.0.0.1:${port}/${p}`, { waitUntil: 'load' })
    await page.waitForTimeout(500)
    const o = await page.evaluate(() => {
      const de = document.documentElement
      const over = de.scrollWidth - de.clientWidth
      /* Prove the stylesheet actually applied. Without this the whole check is
         worthless: an unstyled page never overflows, so it would pass loudest
         exactly when something is most broken. */
      const styled = getComputedStyle(document.body).backgroundColor
      const culprits = []
      if (over > 0) {
        for (const el of document.querySelectorAll('body *')) {
          const b = el.getBoundingClientRect()
          if (b.width === 0 && b.height === 0) continue
          if (b.right > de.clientWidth + 1) culprits.push(`<${el.tagName.toLowerCase()} class="${(el.className||'').toString().slice(0,30)}"> right=${Math.round(b.right)}`)
        }
      }
      return { over, styled, culprits: culprits.slice(0, 3) }
    })
    check(`${p} @${v.n}px: stylesheet applied`,
      o.styled !== 'rgba(0, 0, 0, 0)' && o.styled !== 'transparent',
      `body background is ${o.styled} — page may be unstyled, overflow result would be meaningless`)
    check(`${p} @${v.n}px: no horizontal overflow`, o.over <= 0,
      `scrollWidth exceeds clientWidth by ${o.over}px — ${o.culprits.join(' | ')}`)
    await ctx.close()
  }
}

await browser.close(); srv.close()
let failed = 0
for (const [n, pass, d] of r) { if (!pass) failed++; if (!pass || process.env.VERBOSE) console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${pass ? '' : '   <- ' + (d || '')}`) }
console.log(`\n${r.length - failed}/${r.length} passed`)
process.exit(failed ? 1 : 0)
