/* The routing table and the pages agree, and a tidy URL is not a 404.
 *
 * From the 2026-09-12 audit. Three findings, all invisible to every other check we
 * own because none of them breaks a render:
 *
 *  1. EXTENSIONLESS URLS 404. /about, /apply, /what-we-run and five more were dead —
 *     only /privacy, /onboard and /portal had rewrites. Nothing on the site links that
 *     way, so nothing caught it; but a URL typed from memory, read off a card, or
 *     trimmed by a chat client is exactly the traffic we cannot see losing.
 *  2. A REDIRECT CHAIN. /faq -> /contact.html -> /#contact, through a file that does not
 *     exist. Two hops where one would do, and the middle hop only works by accident.
 *  3. lang="en" ON booked.html where every other page declares en-GB.
 *
 * The redirect and lang arms read files and need no network. The extensionless arm
 * needs a server that applies vercel.json, which the local static server does not —
 * so it SKIPS loudly against localhost rather than reporting a pass it never earned.
 *
 * Run: node test-url-hygiene.mjs            (redirect + lang arms)
 *      BASE=https://kaizenevol.com node test-url-hygiene.mjs   (all three)
 */
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:8899'
const LIVE = /^https?:\/\/(?!localhost|127\.)/.test(BASE)

/* The pages a stranger can be sent to. booked, f and 404 are noindex and are not
   destinations anyone types, so they are out of the extensionless arm — but they
   still declare a language, so they stay in the lang arm below. */
const INDEXABLE = ['about','what-we-run','kaizen-loop','apply','privacy',
                   'tried-ads-before','can-i-do-this-myself','ads-for-musicians']
const ALL = [...INDEXABLE, 'index', 'booked', 'f', '404']

const r = []
const check = (n, pass, d) => r.push([n, pass, d])

const cfg = JSON.parse(readFileSync('vercel.json', 'utf8'))
const rewrites = cfg.rewrites || []
const redirects = cfg.redirects || []

/* ---- 1. every indexable page has an extensionless route ---- */
const rewritten = new Set(rewrites.map(x => x.source))
for (const p of INDEXABLE) {
  check(`/${p} is routed`, rewritten.has(`/${p}`) || redirects.some(x => x.source === `/${p}`),
        'no rewrite and no redirect in vercel.json')
}

/* ---- 2. no redirect points at another redirect's source ---- */
const redirectSources = new Set(redirects.map(x => x.source))
for (const x of redirects) {
  const dest = x.destination.split('#')[0].split('?')[0]
  check(`${x.source} does not redirect into another redirect`,
        !redirectSources.has(dest), `${x.source} -> ${x.destination} -> …`)
}

/* ---- 3. one language, declared the same way everywhere ---- */
for (const p of ALL) {
  const m = readFileSync(`${p}.html`, 'utf8').match(/<html[^>]*lang="([^"]*)"/)
  check(`${p}.html declares lang="en-GB"`, m && m[1] === 'en-GB', m ? m[1] : 'no lang attribute')
}

/* ---- 4. and the routes actually answer, which only a real server can say ---- */
if (!LIVE) {
  console.log(`SKIP  the extensionless URLs are not fetched — ${BASE} does not apply vercel.json.`)
  console.log('      Run with BASE=https://kaizenevol.com to check them for real.')
} else {
  for (const p of INDEXABLE) {
    const res = await fetch(`${BASE}/${p}?cb=${Math.random()}`, { redirect: 'follow' }).catch(() => null)
    if (!res) { check(`GET /${p}`, false, 'request failed — HARNESS or network, not the route'); continue }
    const body = res.ok ? await res.text() : ''
    check(`GET /${p} serves the page`, res.ok && /KaizenEvol/i.test(body),
          `${res.status}${res.ok ? ', body did not look like ours' : ''}`)
  }
}

let failed = 0
for (const [n, pass, d] of r) { if (!pass) { failed++; console.log(`FAIL  ${n}   <- ${d || ''}`) } }
console.log(`\n${r.length - failed}/${r.length} checks passed${LIVE ? ' (routes fetched live)' : ''}`)
process.exit(failed ? 1 : 0)
