/* The site stays short and stays readable.
 *
 * Rahaid, 2026-09-12: "there is a bit too much text ... make it simple enough that a
 * teen could understand." Both halves were measured before anything was cut, and the
 * measurement changed the job: the reading grade was ALREADY 4.3-7.0, which is a nine
 * to twelve year old. Nothing needed simplifying. What needed cutting was volume.
 *
 * So this guard holds both lines. The grade ceiling stops anyone writing their way back
 * up into agency prose; the word ceiling stops the pages quietly refilling, which is how
 * they got here - every section was worth its words on the day it was written.
 *
 * Flesch-Kincaid is computed here rather than pulled from a library. textstat needs an
 * NLTK corpus this container cannot fetch, and a check that only runs on one machine is
 * not a check (verification.md). The syllable count is the standard vowel-group
 * heuristic: it is a few percent off in absolute terms and consistent across runs, which
 * is all a ceiling needs.
 *
 * Run: node test-copy-weight.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE || 'http://localhost:8899'
const REMOTE = /^https?:\/\/(?!localhost|127\.)/.test(BASE)

/* Ceilings sit a little above where each page landed on 2026-09-12, so ordinary editing
   has room and a section arriving whole does not. */
const LIMIT = {
  'index':                1000,
  'what-we-run':           780,
  'kaizen-loop':           820,
  'faq':                   640,
  'tried-ads-before':      510,
  'can-i-do-this-myself':  480,
  'ads-for-musicians':     470,
}
const GRADE_MAX = 8          // a 13-year-old reads grade 8 comfortably

const syllables = w => {
  w = w.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  return Math.max(1, (w.match(/[aeiouy]{1,2}/g) || []).length)
}

const b = await chromium.launch({
  executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ...(REMOTE && process.env.HTTPS_PROXY
      ? { args: ['--ssl-version-max=tls1.2'], proxy: { server: process.env.HTTPS_PROXY } } : {})
})
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const r = []

for (const [pg, cap] of Object.entries(LIMIT)) {
  const p = await ctx.newPage()
  const res = await p.goto(`${BASE}/${pg}.html`, { waitUntil: 'load' }).catch(() => null)
  if (!res) { console.log(`CANNOT RUN — ${pg}.html did not load from ${BASE}. Harness, not the site.`); await b.close(); process.exit(2) }
  const H = await p.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < H; y += 800) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(70) }
  await p.waitForTimeout(300)

  const text = await p.evaluate(() => {
    const main = document.querySelector('main') || document.body
    const c = main.cloneNode(true)
    /* nav, footer and the eyebrows repeat on every page; the table is a grid, not prose. */
    c.querySelectorAll('nav,footer,script,style,.smallcaps,table').forEach(e => e.remove())
    return c.innerText.replace(/\s+/g, ' ').trim()
  })
  await p.close()

  const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) || []
  const sents = text.split(/(?<=[.!?])\s+/).filter(s => s.split(/\s+/).length > 2)
  const grade = 0.39 * (words.length / sents.length)
              + 11.8 * (words.reduce((a, w) => a + syllables(w), 0) / words.length) - 15.59

  r.push([`${pg}: under ${cap} words`, words.length <= cap, `${words.length} words`])
  r.push([`${pg}: reads at grade ${GRADE_MAX} or below`, grade <= GRADE_MAX, `grade ${grade.toFixed(1)}`])
}
await b.close()

let failed = 0
for (const [n, pass, d] of r) { if (!pass) { failed++; console.log(`FAIL  ${n}   <- ${d}`) } }
console.log(`\n${r.length - failed}/${r.length} checks passed across ${Object.keys(LIMIT).length} pages`)
process.exit(failed ? 1 : 0)
