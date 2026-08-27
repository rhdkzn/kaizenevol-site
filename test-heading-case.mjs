/* brand/DESIGN.md, Voice on the page: "Sentence case. No Title Case Headings."
 *
 * 2026-08-27: audited on Rahaid's copy-upgrade pass. 42 h1/h2 headings across 8
 * pages were in Title Case, against our own brand file — "More Kitchen Jobs,
 * Booked Straight Into Your Diary", "Pricing Is Discussed on the Call". The rule
 * had been written down and never enforced anywhere, so drift was free.
 *
 * Proper nouns stay capitalised. The check only fires when most of the
 * non-small words after the first are capitalised, which is Title Case and not
 * a heading that happens to name KaizenReach.
 *
 * Run: node test-heading-case.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'

const SMALL = new Set(['a','an','and','the','or','of','to','in','on','for','with','at','by',
  'from','as','is','it','your','you','we','our','not','that','into','up','off','out','no',
  'but','so','if','per','&','are','was','be','can','do','does'])
/* Names that are capitalised because they are names, not because of Title Case. */
const PROPER = new Set(['kaizenevol','kaizenreach','kaizendesk','kaizenforge','meta','google',
  'uk','instagram','facebook','whatsapp','bristol','ico','british','ai'])
/* 'house' is NOT here. It was, for "Companies House", and it capitalised the common
   noun in "If your website was a house" during the sweep. Phrases belong in prose,
   not in a word list. */

/* First pass only fired when 3+ significant words were capitalised, so short Title
   Case headings walked straight through: "We'd Rather Show You", "Meet the Team",
   "Questions, Answered". The correct test is per-word — ANY capitalised word that is
   not the first, not a proper noun, and not starting a new sentence after . ! ? is
   Title Case. */
const titleCase = (s) => {
  let first = true, capNext = true
  const offenders = []
  const re = /[A-Za-z][A-Za-z'\u2019]*|[.!?]/g
  let m
  while ((m = re.exec(s))) {
    const w = m[0]
    if (/^[.!?]$/.test(w)) { capNext = true; continue }
    const lw = w.toLowerCase()
    const isCap = w[0] === w[0].toUpperCase() && /[a-z]/.test(w + 'x')
    if (capNext || first) { capNext = false; first = false; continue }
    if (PROPER.has(lw)) continue
    if (w.toUpperCase() === w && w.length > 1) continue     // acronym
    if (isCap) offenders.push(w)
  }
  return offenders
}

const r = []
let scanned = 0
/* Internal surfaces are not brand copy — the rule is about what a prospect reads. */
const INTERNAL = new Set(['dashboard.html','crm.html','diagnostic.html','reports.html','spec.html'])
for (const f of readdirSync('.').filter(x => x.endsWith('.html') && !INTERNAL.has(x)).sort()) {
  const html = readFileSync(f, 'utf8')
  const body = html.slice(html.indexOf('</style>'))
  for (const m of body.matchAll(/<h([12])[^>]*>([\s\S]*?)<\/h\1>/g)) {
    const txt = m[2].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').split(/\s+/).join(' ').trim()
    if (!txt) continue
    scanned++
    const bad = titleCase(txt)
    if (bad.length) r.push([`${f}: heading is sentence case`, false, `${txt.slice(0, 52)}  [${bad.join(' ')}]`])
  }
}

console.log(`scanned ${scanned} h1/h2 headings`)
let failed = 0
for (const [n, pass, d] of r) { if (!pass) { failed++; console.log(`FAIL  ${n}   <- ${d}`) } }
console.log(`\n${scanned - failed}/${scanned} headings are sentence case`)
process.exit(failed ? 1 : 0)
