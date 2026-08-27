/* The terms page, same deal as the privacy one: basic, but not basic enough to
 * create a problem.
 *
 * Written 2026-08-27. Rahaid asked to "do the same to the terms page" — there was
 * no terms page. Not in the repo, not live, not linked from any footer; the only
 * hits for "terms" on the site were prose. So this is a new page in the privacy
 * page's shape and voice.
 *
 * What it must never do is contradict canon or leak a private price. Reach and Desk
 * retainers are NOT public (brand/DESIGN.md, FIN-PRI-001); Forge's £499 is. And the
 * facts a services site has to state — who contracts with you, that the site itself
 * is not an offer, who owns what, whose law applies — each cost a sentence.
 *
 * This page is NOT the client service agreement. The Foundation-site clauses
 * (domain ownership, buy-out, wind-down, the UK-GDPR processing terms) belong in
 * the signed agreement Mike Ross drafts, and CRITICAL_FACTS tracks that separately.
 *
 * Run: node test-terms.mjs
 */
import { chromium } from 'playwright'

const URL = process.env.URL || 'file:///home/user/kaizenevol-site/terms.html'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ssl-version-max=tls1.2'] })
const p = await b.newPage()
await p.goto(URL, { waitUntil: 'domcontentloaded' })
const text = await p.evaluate(() => document.querySelector('main')?.innerText || document.body.innerText)
const t = text.toLowerCase()
const html = await p.content()
await b.close()

const r = []
const check = (n, pass, d) => r.push([n, pass, d])
const words = text.trim().split(/\s+/).length

check('names KaizenEvol as the contracting party', /kaizenevol/.test(t))
check('gives a contact', /rahaid@kaizenevol\.com/.test(html))
/* Same lesson as the privacy guard: match the FACT, not one phrasing of it.
   "Nothing on this site is an offer or forms a contract" says exactly what
   "nothing on this site forms a contract" says. */
check('says the site itself is not an offer or a contract',
  /nothing on this (site|page)[^.]*\b(offer|contract)\b|not an offer|does not form a contract/.test(t))
check('points service terms at the signed agreement',
  /your agreement|written agreement|signed agreement|the agreement we/.test(t))
check('states who owns a site we build', /own/.test(t))
check('names the governing law', /england|wales|english law/.test(t))
check('claims our own content', /copyright|our (own )?(content|material)|belongs to us|©/.test(t))

/* Canon: Forge's price is public, the retainers are not. A per-month figure next
   to one of our fees is the breach — the same rule test-acq-render enforces. */
check('leaks no private retainer price',
  !/£\s?(2,?500|1,?500|500|750|3,?500|5,?000)\s*(\/\s*mo|per month|a month|pm\b)/i.test(t))

check(`reads short (${words} words, cap 260)`, words <= 260, `${words} words`)

let failed = 0
for (const [n, pass, d] of r) { if (!pass) { failed++; console.log(`FAIL  ${n}   <- ${d || ''}`) } }
console.log(`\n${r.length - failed}/${r.length} checks passed  (${words} words)`)
process.exit(failed ? 1 : 0)
