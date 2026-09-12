/* Every font we ship is small, and still carries every character we set in it.
 *
 * From the 2026-09-12 audit. Fonts were 118KB of a 134KB page — 88% of the weight —
 * and `newsreader-italic.woff2` alone was 63KB to set 40 distinct glyphs across the
 * whole site. Both heavy faces are now subset to printable ASCII plus the handful of
 * symbols we actually use.
 *
 * Subsetting has one failure mode and it is silent: someone writes a word containing a
 * character the subset dropped, the browser substitutes a fallback face, and the page
 * looks subtly wrong to everyone but the person who wrote it. So the budget check is
 * the cheap half — this file's real job is the SECOND assertion.
 *
 * It asks the browser, not a font library, and it asks in the one way that survives
 * both traps below: rasterise each character TWICE IN THE TARGET FAMILY, once with a
 * serif fallback behind it and once with a monospace one. If the family supplies the
 * glyph both draws are identical; if it does not, the two fallbacks draw differently.
 * No fonttools, no ffprobe, no binary that has to exist on whichever machine runs this.
 *
 * Two earlier versions were wrong, and both were wrong in the direction of passing:
 *  - Comparing advance WIDTHS against a Courier control reported all 56 mono glyphs
 *    missing. JetBrains Mono and Courier are both monospace, so their widths match by
 *    construction and the metric could only ever come back red.
 *  - Comparing rasterised pixels against that same control reported NOTHING missing,
 *    even with a font deliberately rebuilt without the letter g. A fallback glyph
 *    inherits the target's style, so Courier-rendered-as-synthetic-italic never matches
 *    upright Courier — different pixels, same width, no detection.
 * Both traps vanish once the two sides differ only in which fallback sits behind the
 * same family at the same style.
 *
 * Run: node test-font-budget.mjs
 *      BASE=https://kaizenevol.com node test-font-budget.mjs
 */
import { chromium, devices } from 'playwright'
import { readdirSync, statSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:8899'
const REMOTE = /^https?:\/\/(?!localhost|127\.)/.test(BASE)
const PAGES = ['index','what-we-run','kaizen-loop','apply','privacy','faq','tried-ads-before',
               'can-i-do-this-myself','ads-for-musicians','booked','f','404']

/* A face the site loads is worth its bytes only if it is doing a lot of work. Manrope
   sets nearly the whole body copy and earns 25KB; a display italic used for fifteen
   words does not earn 63. 45KB is the line, above which subset it. */
const BUDGET_KB = 45

const r = []
const check = (n, pass, d) => r.push([n, pass, d])

for (const f of readdirSync('.').filter(f => f.endsWith('.woff2'))) {
  const kb = Math.round(statSync(f).size / 1024)
  check(`${f} is within the ${BUDGET_KB}KB budget`, kb <= BUDGET_KB, `${kb}KB`)
}

const b = await chromium.launch({
  executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ...(REMOTE && process.env.HTTPS_PROXY
      ? { args: ['--ssl-version-max=tls1.2'], proxy: { server: process.env.HTTPS_PROXY } } : {})
})
const ctx = await b.newContext({ ...devices['iPhone 13'], ignoreHTTPSErrors: true })

/* Collect what each family is actually asked to render, with text-transform applied —
   the mono eyebrows are lowercase in the markup and uppercase on screen. */
const used = {}
for (const pg of PAGES) {
  const p = await ctx.newPage()
  const res = await p.goto(`${BASE}/${pg}.html`, { waitUntil: 'load' }).catch(() => null)
  if (!res) { console.log(`CANNOT RUN — ${pg}.html did not load from ${BASE}. Harness, not the site.`); await b.close(); process.exit(2) }
  await p.waitForTimeout(400)
  const ours = await p.evaluate(() => /KaizenEvol/i.test(document.documentElement.outerHTML))
  if (!ours) { console.log(`CANNOT RUN — ${BASE}/${pg}.html is not our page. Harness, not the site.`); await b.close(); process.exit(2) }

  const acc = await p.evaluate(() => {
    const out = {}
    const walk = n => { for (const c of n.childNodes) {
      if (c.nodeType === 3 && c.textContent.trim()) {
        const s = getComputedStyle(c.parentElement)
        const fam = s.fontFamily.split(',')[0].replace(/['"]/g, '').trim()
        let t = c.textContent
        if (s.textTransform === 'uppercase') t = t.toUpperCase()
        if (s.textTransform === 'lowercase') t = t.toLowerCase()
        out[fam] = (out[fam] || '') + t
      } else if (c.nodeType === 1) walk(c)
    } }
    walk(document.body); return out
  })
  for (const [fam, txt] of Object.entries(acc)) {
    used[fam] = used[fam] || new Set()
    for (const ch of txt) if (ch.trim()) used[fam].add(ch)
  }
  await p.close()
}

/* Now ask one loaded page whether each family really supplies each character. */
const probe = await ctx.newPage()
await probe.goto(`${BASE}/index.html`, { waitUntil: 'load' })
await probe.evaluate(() => document.fonts.ready)
await probe.waitForTimeout(400)

for (const [fam, set] of Object.entries(used)) {
  const chars = [...set].join('')
  const missing = await probe.evaluate(([fam, chars]) => {
    const draw = (ch, font) => {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64
      const c = cv.getContext('2d')
      c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64)
      c.fillStyle = '#000'; c.font = font; c.textBaseline = 'middle'
      c.fillText(ch, 4, 32)
      return cv.getContext('2d').getImageData(0, 0, 64, 64).data.join(',')
    }
    /* Same family, same style, two different fallbacks. Identical means the family
       drew it; different means both sides fell through to their own fallback. */
    return [...chars].filter(ch =>
      draw(ch, `40px "${fam}", "Courier New"`) !== draw(ch, `40px "${fam}", "Times New Roman"`))
  }, [fam, chars])
  /* A subset can only drop what its source carried, so the ASSERTION is scoped to the
     text a subset is responsible for: letters, digits and Latin punctuation. Arrows and
     box-drawing (→ ← ∞ ─) were already falling through to the system font before any of
     this — none of our faces ever carried them — so failing on those would be the guard
     crying wolf about ordinary, deliberate behaviour. They are reported, not failed. */
  const TEXT = /[A-Za-z0-9 .,;:!?'"()\[\]{}\-_/\\&@#%*+=<>$£’‘“”…–—]/
  const droppedText = missing.filter(ch => TEXT.test(ch))
  const symbols = missing.filter(ch => !TEXT.test(ch))
  check(`${fam} supplies every letter, digit and punctuation the site sets in it (${set.size} chars)`,
        droppedText.length === 0, droppedText.length ? `dropped by subsetting: ${droppedText.join(' ')}` : '')
  if (symbols.length) console.log(`NOTE  ${fam} falls back for ${symbols.join(' ')} — no face we ship carries these, and that predates subsetting.`)
}
await b.close()

let failed = 0
for (const [n, pass, d] of r) { if (!pass) { failed++; console.log(`FAIL  ${n}   <- ${d}`) } }
console.log(`\n${r.length - failed}/${r.length} checks passed`)
process.exit(failed ? 1 : 0)
