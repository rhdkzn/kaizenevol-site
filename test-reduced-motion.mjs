/* Reduce Motion must not stop anything we make. Rahaid, standing, twice.
 *
 * brand/DESIGN.md has carried this ruling since 2026-08-15. It has now failed three
 * times, each time because someone (me, latterly) decided their case was the
 * exception: the showpiece page served him a frozen poster, kaizendesk.html served
 * him a finished chat transcript, and demos/aldermere-lofts.html — a Forge SHOWCASE,
 * the page we point prospects at — disabled its hero parallax outright, in a comment
 * that said so proudly. That parallax is driven by the visitor's own scroll, which is
 * the exact case DESIGN.md names as must-always-ship.
 *
 * Judgement kept producing a new exemption, so this is mechanical. A
 * prefers-reduced-motion block may not kill motion. If you want to soften something
 * for that audience, change a DURATION or use `revert`. You may not switch it off.
 *
 * Run: node test-reduced-motion.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const KILLS = [
  [/animation\s*:\s*none/i,        'animation:none'],
  [/transition\s*:\s*none/i,       'transition:none'],
  [/transform\s*:\s*none\s*!/i,    'transform:none!important'],
  [/display\s*:\s*none/i,          'display:none'],
  [/animation-duration\s*:\s*0/i,  'animation-duration:0'],
  [/transition-duration\s*:\s*0(m?s)?\b/i, 'transition-duration:0'],
]
/* Gating BEHAVIOUR on the setting is the worst form: the feature never runs at all. */
const JS_GATE = /if\s*\([^)]*reduce[A-Za-z]*\.matches[^)]*\)\s*return|reduce[A-Za-z]*\.matches\s*\)\s*return/i

const walk = (d, out = []) => {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === '.git') continue
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(html|js|css)$/.test(e) && !e.startsWith('test-')) out.push(p)
  }
  return out
}

const r = []
const check = (n, pass, d) => r.push([n, pass, d])

for (const f of walk('.')) {
  const src = readFileSync(f, 'utf8')
  if (!/prefers-reduced-motion|reducedMotion/i.test(src)) continue

  /* Every @media (prefers-reduced-motion: reduce){ ... } body on the page. */
  const blocks = []
  const re = /@media[^{]*prefers-reduced-motion[^{]*\{/gi
  let m
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, depth = 1
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') depth--
      i++
    }
    blocks.push({ body: src.slice(m.index + m[0].length, i - 1), line: src.slice(0, m.index).split('\n').length })
  }

  for (const { body, line } of blocks) {
    const hits = KILLS.filter(([rx]) => rx.test(body)).map(([, name]) => name)
    check(`${f}:${line} reduce-motion block does not switch motion off`, hits.length === 0, hits.join(', '))
  }

  if (JS_GATE.test(src))
    check(`${f} does not gate a feature behind the setting`, false, 'early return on reduce.matches')
}

let failed = 0
for (const [n, pass, d] of r) { if (!pass) { failed++; console.log(`FAIL  ${n}   <- ${d || ''}`) } }
console.log(`\n${r.length - failed}/${r.length} checks passed`)
process.exit(failed ? 1 : 0)
