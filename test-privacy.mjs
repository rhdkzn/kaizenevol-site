/* The privacy policy may be short. It may not be short of the five things that
 * carry actual ICO exposure.
 *
 * 2026-08-27: Rahaid asked for this page to read like lovellmarketing.com's — 298
 * words against our 533. Theirs is the better-looking page and most of our extra
 * length was genuinely doing nothing. But theirs also omits four things UK-GDPR
 * Articles 13/14 require, and one of them matters far more for us than for them:
 * WE RUN COLD OUTREACH. When you obtain someone's details without asking them,
 * Article 14 says you must tell them where the data came from and how to object.
 * Lovell's page has no equivalent section because Lovell does not do it.
 *
 * Rahaid's line is jail and fines, nothing decorative. ICO transparency breaches
 * are in the fine category, so these five stay however short the page gets. Each
 * is one sentence.
 *
 * Run: node test-privacy.mjs
 */
import { chromium } from 'playwright'

const URL = process.env.URL || 'file:///home/user/kaizenevol-site/privacy.html'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ssl-version-max=tls1.2'] })
const p = await b.newPage()
await p.goto(URL, { waitUntil: 'domcontentloaded' })
const text = (await p.evaluate(() => document.querySelector('main')?.innerText || document.body.innerText))
const t = text.toLowerCase()
const words = text.trim().split(/\s+/).length
const html = await p.content()
await b.close()

const r = []
const check = (n, pass, d) => r.push([n, pass, d])

/* Art. 13(1)(a)+(b) — who the controller is and how to reach them. */
check('names a contact for data questions', /rahaid@kaizenevol\.com/.test(html))
check('names KaizenEvol as the controller', /kaizenevol/.test(t))

/* Art. 13(1)(c) — the lawful basis, stated, not implied. */
check('states a lawful basis', /legitimate interest|lawful basis|consent/.test(t))

/* Art. 13(2)(a) — how long. "As long as necessary" is not a period. */
check('states a retention period', /\b\d+\s*(months?|years?)\b/.test(t))

/* Art. 13(2)(d) — the right to complain to the supervisory authority. */
check('names the ICO complaint route', /information commissioner|\bico\b/.test(t))

/* Art. 14 — data we obtained ourselves, which is what cold outreach is.
   The single largest exposure on this page, and the one the reference page
   we were pointed at does not carry. */
check('covers outreach we initiate', /contact your business first|contact local businesses|outreach/.test(t))
check('says where outreach data came from', /public|director(y|ies)|listings|companies house/.test(t))
check('gives an objection route for outreach', /reply "?stop"?|opt out|object/.test(t))

/* Art. 15-21 — the data subject rights themselves. */
check('lists access, correction and deletion', /access/.test(t) && /correct/.test(t) && /delet/.test(t))

/* And the point of the exercise: it has to actually be short. */
check(`reads short (${words} words, cap 340)`, words <= 340, `${words} words`)

let failed = 0
for (const [n, pass, d] of r) { if (!pass) { failed++; console.log(`FAIL  ${n}   <- ${d || ''}`) } }
console.log(`\n${r.length - failed}/${r.length} checks passed  (${words} words)`)
process.exit(failed ? 1 : 0)
