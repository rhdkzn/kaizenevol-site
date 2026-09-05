/* brand/DESIGN.md, Voice on the page: "Sentence case. No Title Case Headings."
 *
 * Extended 2026-08-27 to BUTTONS and EYEBROWS on Rahaid's call. The rule names
 * headings, so the first pass left those alone — which left the site mixed: a
 * sentence-case heading with "Book Your Free Strategy Call" under it. One system
 * beats a defensible half.
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
  'uk','instagram','facebook','whatsapp','bristol','ico','british','ai',
  /* product names and the Desk agents */
  'forge','one','pro','care','swift','slate','kudos','revival','sentinel'])
/* 'house' is NOT here. It was, for "Companies House", and it capitalised the common
   noun in "If your website was a house" during the sweep. Phrases belong in prose,
   not in a word list. */

/* Multi-word product names, matched as WHOLE PHRASES and removed before the per-word
   scan. Added 2026-09-04 for "The Kaizen Acquisition System", renamed "The Kaizen Method" 2026-09-05. The tempting fix was to
   drop 'acquisition' and 'system' into PROPER, which is precisely the mistake the
   'house' note above records: a word list cannot tell "the Acquisition System" from
   "more Acquisition", so it would license Title Case on those two words anywhere on
   the site. A phrase list can. Keep this list to real product names. */
const PHRASES = [/The Kaizen Method/g, /Kaizen Method/g]

/* First pass only fired when 3+ significant words were capitalised, so short Title
   Case headings walked straight through: "We'd Rather Show You", "Meet the Team",
   "Questions, Answered". The correct test is per-word — ANY capitalised word that is
   not the first, not a proper noun, and not starting a new sentence after . ! ? is
   Title Case. */
const titleCase = (s0) => {
  let s = s0
  for (const p of PHRASES) s = s.replace(p, 'Kaizenreach')  // a known PROPER token, so the slot still parses
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
  const SPOTS = [
    ['heading',  /<h([12])[^>]*>([\s\S]*?)<\/h\1>/g,                                             2],
    ['button',   /class="[^"]*btn[^"]*"[^>]*>([^<]{3,60})</g,                                      1],
    ['eyebrow',  /class="[^"]*(?:smallcaps|eyebrow|work-kind|fbnd-tag)[^"]*"[^>]*>([^<]{3,60})</g, 1],
  ]
  for (const [kind, re, grp] of SPOTS) {
    for (const m of body.matchAll(re)) {
      const txt = m[grp].replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, ' ').split(/\s+/).join(' ').trim()
      if (!txt) continue
      /* Job titles are conventionally Title Case and are not brand voice copy. */
      if (/Co-Founder|Head of/.test(txt)) continue
      scanned++
      const bad = titleCase(txt)
      if (bad.length) r.push([`${f}: ${kind} is sentence case`, false, `${txt.slice(0, 46)}  [${bad.join(' ')}]`])
    }
  }
}

console.log(`scanned ${scanned} headings, buttons and eyebrows`)
let failed = 0
for (const [n, pass, d] of r) { if (!pass) { failed++; console.log(`FAIL  ${n}   <- ${d}`) } }
console.log(`\n${scanned - failed}/${scanned} are sentence case`)
process.exit(failed ? 1 : 0)
