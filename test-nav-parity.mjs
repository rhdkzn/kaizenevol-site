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

/* UPDATED 2026-09-04 (Rahaid): KaizenDesk and KaizenForge came OUT of the nav.
 * They target local businesses and are now a separate, parked business model, so
 * kaizenevol.com no longer offers them in its navigation. The pages stay live and
 * reachable; they are simply not services this site sells any more.
 * This guard exists to stop a service going missing by ACCIDENT - so the list is
 * narrowed deliberately here rather than the guard being skipped. */
/* NARROWED AGAIN 2026-09-04 (Rahaid): KaizenReach came out of the nav too, after
 * KaizenDesk and KaizenForge. The site no longer advertises named services in its
 * navigation at all, so a service list has nothing left to assert and would sit here
 * as an empty array passing forever - a guard that cannot fail is worse than no guard,
 * because it reads as coverage.
 *
 * The invariant that actually survives is the WAY IN: a nav or footer with no route to
 * contact is the same class of bug this file was written for. Pages are lane-tuned -
 * the creative lane sends people to the application, the local lane to WhatsApp - so
 * either satisfies it. */
const ENTRY = ['apply.html', 'wa.me', '#contact']
/* '#contact' counts: kaizendesk and kaizenforge point their nav CTA at their own
 * on-page contact section, and both sections carry a form, the WhatsApp line and an
 * email. Verified before widening this, because the two previous versions of this
 * check reported false failures by looking for the wrong marker. */
const offersEntry = (block) => ENTRY.some(x => block.includes(x))
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
  check(`${f}: desktop nav offers a way in`, offersEntry(desktop), 'no apply link and no WhatsApp link')
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
    /* No way-in check here on purpose. The footer's contact route is owned end to end by
     * test-footer-contact - emails, the WhatsApp button, its modal AND its handler - and
     * that guard reads the whole <footer>. This file only ever grabs the <ul class="footer-nav">,
     * where the WhatsApp button does not live, so a check here reported two false failures
     * before it was removed. One guard per fact. */
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

/* THE LOGO, added 2026-08-27. This file compared nav LINKS and never looked at
 * the wordmark, so it passed 69/69 while kaizenreach.html read "KaizenReach",
 * kaizenforge.html read "KaizenForge" and every other page read "KaizenEvol" —
 * three brand names across three product pages, spotted by Rahaid on his phone.
 *
 * KaizenEvol is the correct text on the evidence, not by preference: the img
 * alt said "KaizenEvol" on all 21 pages INCLUDING the two showing a product
 * name, so a screen reader heard one brand while the eye read another; the href
 * goes to index.html everywhere regardless of the text; and no chunk in canon
 * ever declared a product-branded nav. Copy-paste drift where the visible text
 * was edited and the alt and the destination were not. */
{
  const marks = {}
  for (const f of readdirSync('.').filter(x => x.endsWith('.html')).sort()) {
    const html = readFileSync(f, 'utf8')
    const m = html.match(/<a[^>]*class="nav-logo"[^>]*>([\s\S]*?)<\/a>/)
    if (!m) continue                                   /* pages with no nav */
    const text = m[1].replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).join(' ')
    const alt = (m[1].match(/alt="([^"]*)"/) || [])[1] || null
    marks[f] = text || alt
    /* UPDATED 2026-09-04 (Rahaid): the nav now carries the MARK ALONE, no visible
     * wordmark. That does not retire this check, it moves the burden: the img alt
     * is now the only brand name anyone gets, sighted or not, so it has to be
     * right on every page and it has to be the same one. A page that still shows
     * text must still show "KaizenEvol" — the three-brand-names drift this block
     * was written for is just as possible with a wordmark as without. */
    check(`${f} nav names KaizenEvol`, (text || alt) === 'KaizenEvol',
      `visible "${text}", alt "${alt}"`)
    check(`${f} nav mark carries an alt`, alt !== null && alt.trim() !== '',
      `alt is ${alt === null ? 'absent' : 'empty'} and no visible wordmark`)
    check(`${f} wordmark agrees with its img alt`, text === '' || alt === null || alt === text,
      `visible "${text}" vs alt "${alt}"`)
  }
  const distinct = [...new Set(Object.values(marks))]
  check('one wordmark across the whole site', distinct.length === 1, distinct.join(' | '))
}

let failed = 0
for (const [n, pass, d] of r) { if (!pass) { failed++; console.log(`FAIL  ${n}   <- ${d || ''}`) } }
console.log(`\n${r.length - failed}/${r.length} checks passed across the site`)
process.exit(failed ? 1 : 0)
