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
  const i = html.indexOf('<div class="footer-right"')
  if (i < 0) continue                        // funnel and internal pages carry no footer by design
  const j = html.indexOf('</footer>', i)
  const block = html.slice(i, j)

  const mails = [...new Set([...block.matchAll(/mailto:([^"?]+)/g)].map(m => m[1]))].sort()
  const wa = /id="waOpen"/.test(block)

  check(`${f}: footer offers rahaid@`, mails.includes('rahaid@kaizenevol.com'), mails.join(', ') || 'no email at all')
  check(`${f}: footer offers diego@`, mails.includes('diego@kaizenevol.com'), mails.join(', ') || 'no email at all')
  /* brand/DESIGN.md: every public CTA opens the WhatsApp business line. */
  check(`${f}: footer offers the WhatsApp line`, wa)
  /* A button with no modal and no handler is a dead button that looks fine. Both
     were absent on index and booked when their footers were brought into line. */
  if (wa) {
    check(`${f}: the WhatsApp button has its modal`, /id="waModal"/.test(html))
    check(`${f}: the WhatsApp button has its handler`, /getElementById\('waOpen'\)/.test(html))
  }

  const key = mails.join(',') + (wa ? ' +wa' : '')
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
