/* Reduce Motion is ignored entirely. Rahaid, standing — 2026-07-07, and said again on
 * 2026-08-27 and 2026-09-07.
 *
 * His words the second time: "don't let reduce motion stop anything, I told you this."
 * The third time: "Don't let reduce motion affect anything I told you this."
 *
 * The earlier version of this file enforced a WEAKER rule — a block could not switch
 * motion off, but was allowed to shorten it. That was my invention, not his ruling, and
 * it is exactly the hole the fourth instance walked through: on 2026-09-07 I added five
 * blocks to index.html and one to about.html that halved drift and multiplied durations,
 * and this guard passed 9/9 while they shipped. A guard that permits the softer version
 * of the banned thing is a guard that licenses it.
 *
 * So the rule is now the whole rule, and it is mechanical: after comments are stripped,
 * the string must not appear in any html/css/js file. No @media block, no matchMedia
 * branch, no gsap.matchMedia condition, no ternary. Documenting the ABSENCE in a comment
 * is fine and encouraged — that is why comments are stripped before the scan.
 *
 * Run: node test-reduced-motion.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/* Comments are where the estate records that it deliberately has no override, so they
   must not trip the scan. Strip block comments and JS line comments; a CSS/HTML file
   has no // comments outside <script>, and stripping them there is harmless either way. */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/(^|[\s;{}()])\/\/[^\n]*/g, '$1 ')

const SETTING = /prefers-reduced-motion|reducedMotion/i

const walk = (d, out = []) => {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === '.git') continue
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(html|js|css|mjs)$/.test(e) && !e.startsWith('test-')) out.push(p)
  }
  return out
}

const r = []
const check = (n, pass, d) => r.push([n, pass, d])
const all = walk('.')
let mention = 0

for (const f of all) {
  const raw = readFileSync(f, 'utf8')
  if (!SETTING.test(raw)) continue
  mention++
  const code = stripComments(raw)
  if (!SETTING.test(code)) continue          // documented in a comment only — correct

  /* Report every offending line so one run names all of them, not just the first. */
  code.split('\n').forEach((ln, i) => {
    if (SETTING.test(ln))
      check(`${f}:${i + 1} must not branch on Reduce Motion`, false, ln.trim().slice(0, 96))
  })
}

console.log(`swept ${all.length} file(s); ${mention} mention the setting in prose`)
check('the estate carries no Reduce Motion branch at all', true)

let bad = 0
for (const [n, pass, d] of r) {
  if (!pass) { bad++; console.log(`FAIL  ${n}${d ? '  — ' + d : ''}`) }
}
console.log(`\n${r.length - bad}/${r.length} checks passed`)
process.exit(bad ? 1 : 0)
