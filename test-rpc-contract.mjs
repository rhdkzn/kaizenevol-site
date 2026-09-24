/* Every rpc() the front end calls must exist in the database we ship.
 *
 * 2026-09-22. portal.html has called `sb.rpc('portal_touch')` since it was built.
 * That function had never been created in Supabase. The call is not awaited and
 * its error is never read, so it failed in silence: ke_portal_users.last_seen
 * stayed null, and the CRM — which renders that column — reported "not yet
 * signed in" for an account that had signed in on 2026-09-08, thirteen seconds
 * after it was created. Two weeks later that badge was read as evidence nobody
 * had ever used the portal.
 *
 * The defect was invisible because the schema, the policies and the functions
 * lived ONLY in the Supabase project. Nothing in the repo could notice a page
 * calling a function the database did not have. db/portal.sql is now the record;
 * this asserts the front end and that record agree.
 *
 * WHAT IT DOES NOT DO, stated because a guard that overclaims is worse than none:
 * it compares our HTML against a FILE, not against the live database. It cannot
 * tell you the migration was applied. It does catch the thing that actually
 * happened — a call to a function nobody ever wrote down — and it makes writing
 * it down the only way to go green.
 *
 * Run: node test-rpc-contract.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'

const SQL = 'db/portal.sql'
const r = []
const check = (n, pass, d) => r.push([n, pass, d])

check(`${SQL} exists`, existsSync(SQL), 'the database layer is not recorded in the repo at all')
/* The record is split across db/*.sql (portal_sign lives in db/portal-agreements.sql,
   portal_access_set in db/portal-access.sql), so read every file. Reading portal.sql
   alone left this red on main for portal_sign from 2026-09-23 (fixed 2026-09-24). */
const sql = existsSync('db') ? readdirSync('db').filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync('db/' + f, 'utf8')).join('\n') : ''

/* Functions the file DEFINES — matched on the create statement, never on a bare
   mention, so a name that appears only in a comment cannot satisfy the contract. */
const defined = new Set(
  [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi)]
    .map(m => m[1].toLowerCase())
)

const files = readdirSync('.').filter(f => f.endsWith('.html')).sort()
  .concat(existsSync('tools') ? readdirSync('tools').filter(f => f.endsWith('.html')).map(f => 'tools/' + f) : [])

const called = new Map()   // name -> files that call it
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\.rpc\(\s*['"]([a-z0-9_]+)['"]/gi)) {
    const n = m[1].toLowerCase()
    if (!called.has(n)) called.set(n, [])
    if (!called.get(n).includes(f)) called.get(n).push(f)
  }
}

check('the front end calls at least one rpc', called.size > 0,
  'found none — either the pages changed shape or this regex stopped matching, and a ' +
  'guard that silently checks nothing is the failure mode it exists to prevent')

for (const [name, where] of [...called].sort())
  check(`rpc ${name} is defined in db/*.sql`, defined.has(name),
    `called from ${where.join(', ')} — add the CREATE FUNCTION to a db/*.sql file and apply it to Supabase`)

let failed = 0
for (const [n, pass, d] of r) { if (!pass) { failed++; console.log(`FAIL  ${n}   <- ${d || ''}`) } }
console.log(`\n${r.length - failed}/${r.length} checks passed — ${called.size} rpc call(s), ${defined.size} function(s) recorded`)
process.exit(failed ? 1 : 0)
