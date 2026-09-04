/* Guard: no element may CLIP ITS OWN TEXT.
 *
 * Written 2026-09-04 after Rahaid caught it on the phone hero — "some of the letters
 * look like they're cut off". The homepage splits its headline into per-word .ln
 * masks carrying overflow:hidden, and at line-height 1.08 each box was ~5px shorter
 * than the text needed, so every descender was sliced: the g in "go", the y in "buy".
 *
 * It survived a 48-screenshot audit because a clipped descender is invisible unless
 * the word happens to HAVE one — 15 of the 18 words looked perfect. That is exactly
 * the kind of defect a human sweep misses and a measurement catches every time.
 *
 * Checks the rendered box against the text's own scrollHeight, so it is independent
 * of which font loaded, which is the variable that actually moves this number.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'

const DIR = process.cwd()
const TYPES = { html:'text/html', css:'text/css', js:'text/javascript', png:'image/png',
  jpg:'image/jpeg', jpeg:'image/jpeg', svg:'image/svg+xml', woff2:'font/woff2',
  ico:'image/x-icon', json:'application/json', webp:'image/webp', mp4:'video/mp4' }
const srv = createServer((q, s) => {
  const f = DIR + decodeURIComponent(q.url.split('?')[0])
  if (!existsSync(f) || f.endsWith('/')) { s.writeHead(404); return s.end() }
  s.writeHead(200, { 'Content-Type': TYPES[f.split('.').pop()] || 'application/octet-stream' })
  s.end(readFileSync(f))
}).listen(0)
const port = srv.address().port

const PAGES = (process.env.PAGES || 'index.html,about.html,contact.html,privacy.html').split(',')
const VIEWS = [[390, 844], [1280, 900]]
const TOL = 1.5   /* sub-pixel rounding only */

let pass = 0, fail = 0
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
for (const PAGE of PAGES) {
  for (const [w, h] of VIEWS) {
    const p = await b.newPage({ viewport: { width: w, height: h } })
    await p.goto(`http://127.0.0.1:${port}/${PAGE}`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(1500)
    const bad = await p.evaluate((TOL) => {
      const out = []
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el)
        if (cs.overflow !== 'hidden' && cs.overflowY !== 'hidden') continue
        /* only elements that directly hold text — a scroller full of cards is not this bug */
        const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
        if (!own && !(el.children.length === 1 && el.children[0].tagName === 'SPAN')) continue
        const r = el.getBoundingClientRect()
        if (r.height < 4) continue
        if (el.scrollHeight - r.height > TOL)
          out.push(`${el.tagName.toLowerCase()}.${el.className || '-'} "${el.innerText.trim().slice(0, 18)}" box ${r.height.toFixed(1)} needs ${el.scrollHeight}`)
      }
      return out.slice(0, 6)
    }, TOL)
    const label = `${PAGE} @${w}`
    if (bad.length) { fail++; console.log(`FAIL  ${label}: text clipped by its own box`); bad.forEach(x => console.log(`        ${x}`)) }
    else { pass++; console.log(`PASS  ${label}: no element clips its own text`) }
    await p.close()
  }
}
await b.close(); srv.close()
console.log(`\n${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
