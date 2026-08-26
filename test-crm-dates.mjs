/* Local-date spine (v3 spec P0 #6).
 *
 * "Due today" drives Diego's entire daily motion and the daily-target reset keys
 * off the same clock. These were computed in UTC, so near midnight the CRM and the
 * human disagreed about what day it was. Extracted from crm.html between the
 * SEQ-DATE markers so this drives the shipped code, not a copy.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const html = readFileSync(new URL('./crm.html', import.meta.url), 'utf8');
const core = html.slice(html.indexOf('/* SEQ-DATE-START'), html.indexOf('/* SEQ-DATE-END */'));
if (!core.includes('todayStr')) throw new Error('date helpers not found between markers');

/* Run the extracted helpers in a child process with a real TZ and a frozen clock. */
function run(tz, iso, expr) {
  const script = `
    const FIXED = new Date(${JSON.stringify(iso)}).getTime();
    const RealDate = Date;
    globalThis.Date = class extends RealDate {
      constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
      static now() { return FIXED; }
    };
    ${core}
    process.stdout.write(String(${expr}));
  `;
  return execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: tz } }).toString();
}

const results = [];
const check = (n, pass, d) => results.push({ n, pass, d });

/* 23:30 UTC on the 26th is already the 27th in Auckland. UTC said the 26th. */
{
  const got = run('Pacific/Auckland', '2026-08-26T23:30:00Z', 'todayStr()');
  check('late evening east of UTC -> local day, not UTC day', got === '2026-08-27', `got ${got}`);
}
/* 02:30 UTC on the 26th is still the 25th in Los Angeles. */
{
  const got = run('America/Los_Angeles', '2026-08-26T02:30:00Z', 'todayStr()');
  check('early morning west of UTC -> local day, not UTC day', got === '2026-08-25', `got ${got}`);
}
/* The UK case Diego actually lives in: 23:30 BST is 22:30 UTC — same day either
   way — but 00:30 BST on the 27th is 23:30 UTC on the 26th, and UTC would call
   that yesterday. This is the one that bit. */
{
  const got = run('Europe/London', '2026-08-26T23:30:00Z', 'todayStr()');
  check('UK just after midnight -> today is the new day', got === '2026-08-27', `got ${got}`);
}
/* addDaysStr must step calendar days, not add 86400000ms — those differ across a
   DST boundary. UK clocks go back on 2026-10-25. */
{
  const got = run('Europe/London', '2026-10-24T12:00:00Z', 'addDaysStr(2)');
  check('addDaysStr crosses a DST boundary correctly', got === '2026-10-26', `got ${got}`);
}
{
  const got = run('Europe/London', '2026-08-26T12:00:00Z', 'addDaysStr(0)');
  check('addDaysStr(0) is today', got === '2026-08-26', `got ${got}`);
}
{
  const got = run('Europe/London', '2026-08-26T12:00:00Z', 'addDaysStr(-7)');
  check('addDaysStr(-7) looks back a week', got === '2026-08-19', `got ${got}`);
}
/* Month and year rollover, since the ladder schedules up to 17 days out. */
{
  const got = run('Europe/London', '2026-08-26T12:00:00Z', 'addDaysStr(17)');
  check('a full ladder from 26 Aug lands in September', got === '2026-09-12', `got ${got}`);
}
{
  const got = run('Europe/London', '2026-12-28T12:00:00Z', 'addDaysStr(8)');
  check('rolls over the year', got === '2027-01-05', `got ${got}`);
}

let failed = 0;
for (const r of results) { if (!r.pass) failed++; console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.n}${r.pass ? '' : '   <- ' + r.d}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
