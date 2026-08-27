/* The KaizenDesk hero chat must PLAY, not sit there.
 *
 * 2026-08-27: Rahaid photographed the live page on his iPhone — all four bubbles
 * showing at once, no conversation. Root cause was not a broken script. The page
 * carried an explicit `@media (prefers-reduced-motion:reduce)` branch pinning every
 * bubble to opacity:1, under a comment claiming the always-play rule was "a one-user
 * ruling that must never be copied to client-facing pages".
 *
 * It is not. brand/DESIGN.md, the brand file governing anything carrying our name,
 * says: "Don't let reduce-motion settings stop anything we make... Never build a
 * 'reduced' branch that shows less of the product" — and it was written after the
 * SHOWPIECE page, which is client-facing, served Rahaid a frozen poster for exactly
 * this reason. His iPhone has Reduce Motion on. This is that incident, twice.
 *
 * The chat replay IS the product demonstration: KaizenDesk answers in under a minute.
 * A frozen transcript demonstrates nothing. So the sequence always plays; what
 * reduce-motion drops is the decoration around it (the slide-and-scale, the bouncing
 * typing dots), never the content.
 *
 * Run: node test-desk-chat.mjs
 */
import { chromium } from 'playwright'

const r = []
const check = (n, pass, d) => r.push([n, pass, d])
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ssl-version-max=tls1.2'] })
const URL = process.env.URL || 'file:///home/user/kaizenevol-site/kaizendesk.html'

/* Two motion settings, and a short viewport where the chat is TALLER than the screen —
   the old observer wanted 45% of it in view at once, which a small phone may never give. */
const CASES = [
  ['motion on',      { reducedMotion: 'no-preference', viewport: { width: 390, height: 844 } }],
  ['reduce motion',  { reducedMotion: 'reduce',        viewport: { width: 390, height: 844 } }],
  ['short viewport', { reducedMotion: 'no-preference', viewport: { width: 375, height: 500 } }],
]

for (const [label, ctx] of CASES) {
  const page = await b.newPage(ctx)
  const errs = []
  page.on('pageerror', e => errs.push(e.message))
  await page.goto(URL, { waitUntil: 'networkidle' })
  /* Scroll the chat into view the way a visitor does, then judge it. */
  await page.evaluate(() => document.querySelector('.chat')?.scrollIntoView({ block: 'center' }))

  const shown = () => page.evaluate(() =>
    [...document.querySelectorAll('.chat .bub:not(.typing)')]
      .filter(x => getComputedStyle(x).opacity === '1').length)
  const total = await page.evaluate(() => document.querySelectorAll('.chat .bub:not(.typing)').length)

  check(`${label}: the chat has four bubbles`, total === 4, `found ${total}`)

  /* Early: it must NOT be a finished transcript the moment it appears. */
  await page.waitForTimeout(250)
  const early = await shown()
  check(`${label}: does not open fully revealed`, early < total, `${early}/${total} already up at 250ms`)

  /* Late: every bubble must arrive. A message stuck hidden is the demo lost. */
  await page.waitForTimeout(7000)
  const late = await shown()
  check(`${label}: every bubble arrives`, late === total, `${late}/${total} after 7s`)
  check(`${label}: no page errors`, errs.length === 0, errs.join(' | '))
  await page.close()
}

/* The decoration, and only the decoration, responds to the setting. */
for (const [label, reducedMotion, wantDots] of [['motion on', 'no-preference', true], ['reduce motion', 'reduce', false]]) {
  const page = await b.newPage({ reducedMotion, viewport: { width: 390, height: 844 } })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  const dotsAnimate = await page.evaluate(() => {
    const d = document.querySelector('.bub.typing i')
    return d ? getComputedStyle(d).animationName !== 'none' : null
  })
  if (dotsAnimate !== null)
    check(`${label}: typing dots ${wantDots ? 'bounce' : 'sit still'}`, dotsAnimate === wantDots, `animationName active: ${dotsAnimate}`)
  await page.close()
}

await b.close()
let failed = 0
for (const [n, pass, d] of r) { if (!pass) { failed++; console.log(`FAIL  ${n}   <- ${d || ''}`) } }
console.log(`\n${r.length - failed}/${r.length} checks passed`)
process.exit(failed ? 1 : 0)
