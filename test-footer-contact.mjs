/* Every page with a footer must offer the same way to reach us.
 *
 * 2026-08-27, Rahaid: "have a look at the footer of the website, sometimes my email
 * doesn't appear." It didn't. index.html — the most-visited page on the site — was
 * still on an older one-line footer carrying diego@ only, no rahaid@ and no WhatsApp
 * button, while the other nine pages carried all three. booked.html, which people
 * land on straight after converting, carried no contact at all.
 *
 * The nav-parity guard compares nav links across pages and would have caught this
 * shape of drift instantly — it just wasn't looking at the contact block. Now it is.
 *
 * Run: node test-footer-contact.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'

const files = readdirSync('.').filter(f => f.endsWith('.html')).sort()
  .concat(existsSync('tools') ? readdirSync('tools').filter(f => f.endsWith('.html')).map(f => 'tools/' + f) : [])

const r = []
const check = (n, pass, d) => r.push([n, pass, d])
const shapes = new Map()

for (const f of files) {
  const html = readFileSync(f, 'utf8')
  /* Find the contact COLUMN by what it contains, not by a class one layout happens to
     use. Keying on `.footer-right` silently skipped index.html — the most-visited page
     on the site, and the very page this guard was written for — because its column is a
     bare <div> (audit 2026-09-12). Labelling index to match would have been adding a
     class with no rule behind it, which test-acq-render rightly refuses. */
  const fi = html.indexOf('<footer')
  if (fi < 0) continue                       // funnel and internal pages carry no footer by design
  const fj = html.indexOf('</footer>', fi)
  const foot = html.slice(fi, fj)
  /* The funnel and internal pages (apply, f, onboard, portal) carry a one-line footer
     with no contact column by design. The absence of the Contact heading is what says
     so — previously it was the absence of a `.footer-right` class, which excluded them
     correctly and index.html by accident. */
  const ci = foot.search(/>\s*Contact(\s+Us)?\s*</i)
  if (ci < 0) continue
  const block = foot.slice(ci)

  const mails = [...new Set([...block.matchAll(/mailto:([^"?]+)/g)].map(m => m[1]))].sort()
  const wa = /id="waOpen"/.test(block)

  /* 2026-09-11, Rahaid: "keep out my email from the website". The footer now
     carries diego@ only, and test-public-name.mjs fails if his address or his
     name reaches any reader-facing surface at all. */
  check(`${f}: footer does not carry rahaid@`, !mails.includes('rahaid@kaizenevol.com'), mails.join(', '))
  check(`${f}: footer offers diego@`, mails.includes('diego@kaizenevol.com'), mails.join(', ') || 'no email at all')
  /* brand/DESIGN.md: every public CTA opens the WhatsApp business line. */
  check(`${f}: footer offers the WhatsApp line`, wa)
  /* A button with no modal and no handler is a dead button that looks fine. Both
     were absent on index and booked when their footers were brought into line. */
  if (wa) {
    check(`${f}: the WhatsApp button has its modal`, /id="waModal"/.test(html))
    check(`${f}: the WhatsApp button has its handler`, /getElementById\('waOpen'\)/.test(html))
  }

  /* The SOCIAL block drifts the same way the contact block did (audit 2026-09-12):
     booked.html carried Instagram alone while the other eight carried Instagram and
     Facebook, and it was the one page whose icons were still an 18x18 tap target
     against 36x36 everywhere else. Same failure, one block over, so it joins the
     same parity comparison rather than getting its own test. */
  /* Socials are read from the WHOLE <footer>, not the footer-right slice: the layouts
     differ (booked.html keeps its icons in the nav list, the rest in the contact
     column) and the question is whether the page carries them, not where. */
  const socials = [...new Set([...foot.matchAll(/href="https:\/\/(?:www\.)?(instagram|facebook)\.com[^"]*"/g)]
    .map(m => m[1]))].sort()
  check(`${f}: footer carries the social links`, socials.length > 0, 'none')
  /* An 18px glyph is a fine mark and a poor thumb. The padding grows the TAP TARGET
     to 36x36 without moving the icon; WCAG 2.5.8 asks for 24. */
  const socialRule = (html.match(/\.footer-social a\{[^}]*\}/s) || [''])[0]
  check(`${f}: the social links are a real tap target`, /padding:\s*\d/.test(socialRule),
        socialRule ? 'rule present, no padding' : 'no .footer-social a rule')
  /* And the container rule, without which the two 36px targets overlap by 18px instead
     of clearing by 4. booked.html was missing it and the icons sat on top of each other
     (measured 2026-09-12) — the padding alone is not the whole guard. */
  const socialBox = (html.match(/\.footer-social\{[^}]*\}/s) || [''])[0]
  check(`${f}: the social targets are spaced apart`, /gap:\s*\d/.test(socialBox),
        socialBox ? 'rule present, no gap' : 'no .footer-social container rule')

  const key = mails.join(',') + (wa ? ' +wa' : '') + ' | ' + socials.join(',')
  if (!shapes.has(key)) shapes.set(key, [])
  shapes.get(key).push(f)
}

/* And the cross-page comparison, which is what actually catches drift. */
const variants = [...shapes.entries()].sort((a, b) => b[1].length - a[1].length)
check('every footer offers the same contacts', variants.length === 1,
  variants.map(([k, fs]) => `\n      [${fs.length}] ${fs.join(', ')}\n          ${k}`).join(''))

let failed = 0
for (const [n, pass, d] of r) { if (!pass) { failed++; console.log(`FAIL  ${n}   <- ${d || ''}`) } }
console.log(`\n${r.length - failed}/${r.length} checks passed across ${shapes.size ? [...shapes.values()].flat().length : 0} footers`)
process.exit(failed ? 1 : 0)
