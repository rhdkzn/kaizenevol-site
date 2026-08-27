/* Every page's three navigations must offer the same destinations.
 *
 * Written 2026-08-27 after adding "The System" to the site. The desktop nav and
 * the footer use <li><a>; the MOBILE MENU uses a bare <a>. A sweep written for
 * the first shape silently skipped the second, so the new page was unreachable
 * on a phone — which is most of a tradesman's traffic — while every desktop
 * check passed. Nothing in the markup looked wrong, because nothing was wrong;
 * something was simply absent.
 *
 * Then the fix for that ran as a SECOND sweep, matched inside the <li> the first
 * had just created, and produced a nested duplicate link. Both failures are the
 * same shape: a nav edited in one place and not the others.
 *
 * 2026-08-27: the mechanism page was folded into index.html, so the shared
 * destination is now an ANCHOR (index.html#the-system). The href regex demanded a
 * trailing .html and would have gone quietly blind to it.
 *
 * Run: node test-nav-parity.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'

const EXPECT = ['kaizenreach.html', 'kaizendesk.html', 'kaizenforge.html']
const r = []
const check = (n, pass, d) => r.push([n, pass, d])

const grab = (html, start, end) => {
  const i = html.indexOf(start)
  if (i < 0) return null
  const j = html.indexOf(end, i)
  return html.slice(i, j < 0 ? undefined : j)
}
const hrefs = (block) => [...block.matchAll(/href="([^"]+\.html(?:#[\w-]+)?)"/g)].map(m => m[1])

const NAVS = { 'desktop nav': {}, 'mobile menu': {}, 'footer nav': {} }

for (const f of readdirSync('.').filter(x => x.endsWith('.html')).sort()) {
  const html = readFileSync(f, 'utf8')
  const desktop = grab(html, '<ul class="nav-links">', '</ul>')
  if (!desktop) continue                     // funnel pages carry no nav by design
  const mobile = grab(html, '<div class="mobile-menu"', '</div>')
  const footer = grab(html, '<ul class="footer-nav">', '</ul>')

  const items = (block) => [...block.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)]
    .map(m => `${m[2].trim()}>${m[1]}`).filter(x => !x.startsWith('>'))
  NAVS['desktop nav'][f] = items(desktop)
  if (mobile) NAVS['mobile menu'][f] = items(mobile)
  if (footer) NAVS['footer nav'][f] = items(footer)

  const d = hrefs(desktop)
  check(`${f}: desktop nav offers every service`, EXPECT.every(x => d.includes(x)),
    EXPECT.filter(x => !d.includes(x)).join(', '))
  check(`${f}: desktop nav has no duplicate link`, new Set(d).size === d.length,
    d.filter((x, i) => d.indexOf(x) !== i).join(', '))

  if (mobile) {
    const m = hrefs(mobile)
    /* A page may legitimately omit a link to ITSELF; everything else must match. */
    const want = d.filter(x => x !== f)
    check(`${f}: mobile menu matches the desktop nav`,
      want.every(x => m.includes(x)), 'missing on phone: ' + want.filter(x => !m.includes(x)).join(', '))
    check(`${f}: mobile menu has no duplicate link`, new Set(m).size === m.length,
      m.filter((x, i) => m.indexOf(x) !== i).join(', '))
  }
  if (footer) {
    const ft = hrefs(footer)
    check(`${f}: footer offers every service`, EXPECT.every(x => ft.includes(x)),
      EXPECT.filter(x => !ft.includes(x)).join(', '))
    check(`${f}: footer has no duplicate link`, new Set(ft).size === ft.length,
      ft.filter((x, i) => ft.indexOf(x) !== i).join(', '))
  }
}


/* Presence was never the whole test. On 2026-08-27 Rahaid read the site and said the
 * nav "shows different things at different pages" — and every check above was green,
 * because each page DID offer every service. What differed was the rest of the list:
 * "Home" sat in the desktop nav of three pages and no others, and the mobile menu ran
 * two vocabularies (bare "KaizenReach" on six pages, descriptive "KaizenReach, Ads,
 * Social + Front Office" on five). A per-page check cannot see that. Only a cross-page
 * comparison can.
 *
 * The trailing CTA is deliberately page-tuned (Forge asks for a website, Reach names
 * itself in the WhatsApp prefill), so it is excluded by position rather than by
 * pretending it matches. */
const shape = (items) => items.slice(0, -1).join('  |  ')
for (const [zone, map] of Object.entries(NAVS)) {
  const forms = new Map()
  for (const [file, items] of Object.entries(map)) {
    const k = shape(items)
    if (!forms.has(k)) forms.set(k, [])
    forms.get(k).push(file)
  }
  const variants = [...forms.entries()].sort((a, b) => b[1].length - a[1].length)
  check(`${zone}: every page offers the same items in the same order`, variants.length === 1,
    variants.length === 1 ? '' :
      variants.map(([k, fs]) => `\n      [${fs.length} page(s)] ${fs.join(', ')}\n         ${k}`).join(''))
}

let failed = 0
for (const [n, pass, d] of r) { if (!pass) { failed++; console.log(`FAIL  ${n}   <- ${d || ''}`) } }
console.log(`\n${r.length - failed}/${r.length} checks passed across the site`)
process.exit(failed ? 1 : 0)
