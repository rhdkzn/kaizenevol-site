/* Today-board ordering (v3 spec P0 #5).
 * "An owed callback must outrank any cold touch, regardless of channel target -
 *  never let a cold dial bury the warmest action."
 */
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./crm.html', import.meta.url), 'utf8');
const core = html.slice(html.indexOf('/* SEQ-SORT-START'), html.indexOf('/* SEQ-SORT-END */'));
if (!core.includes('seqDueSort')) throw new Error('sort core not found between markers');
const { seqDueSort, owedCallback } = new Function(core + ';return {seqDueSort,owedCallback};')();

const TODAY = '2026-08-26';
const r = []; const check = (n, p, d) => r.push({ n, pass: p, d });
const order = (leads) => leads.slice().sort(seqDueSort(TODAY)).map(l => l.id).join(',');

check('followUp today is owed',      owedCallback({ followUp: TODAY }, TODAY), 'not owed');
check('followUp overdue is owed',    owedCallback({ followUp: '2026-08-20' }, TODAY), 'not owed');
check('followUp in future not owed', !owedCallback({ followUp: '2026-09-01' }, TODAY), 'counted as owed');
check('no followUp not owed',        !owedCallback({}, TODAY), 'counted as owed');

/* The headline case: a warm callback with ZERO touches must beat a heavily
   touched cold lead. Under the old touchCount sort it lost. */
{
  const got = order([
    { id: 'cold-8-touches', touchCount: 8, nextActionDate: '2026-08-20' },
    { id: 'warm-callback',  touchCount: 0, nextActionDate: '2026-08-26', followUp: TODAY },
  ]);
  check('a 0-touch owed callback outranks an 8-touch cold lead', got.startsWith('warm-callback'), got);
}
/* Two owed callbacks fall back to the existing warmth then date ordering. */
{
  const got = order([
    { id: 'owed-newer', touchCount: 1, nextActionDate: '2026-08-26', followUp: TODAY },
    { id: 'owed-older', touchCount: 1, nextActionDate: '2026-08-20', followUp: TODAY },
  ]);
  check('among owed callbacks the older due date leads', got === 'owed-older,owed-newer', got);
}
/* Cold ordering must be unchanged for everything below the warm block. */
{
  const got = order([
    { id: 'c1', touchCount: 1, nextActionDate: '2026-08-25' },
    { id: 'c3', touchCount: 3, nextActionDate: '2026-08-26' },
    { id: 'c2', touchCount: 2, nextActionDate: '2026-08-24' },
  ]);
  check('cold leads still rank by touches then date', got === 'c3,c2,c1', got);
}
/* A future follow-up is not owed yet and must not jump the queue. */
{
  const got = order([
    { id: 'cold', touchCount: 5, nextActionDate: '2026-08-20' },
    { id: 'future-fu', touchCount: 0, nextActionDate: '2026-08-26', followUp: '2026-09-10' },
  ]);
  check('a future follow-up does not jump the queue', got === 'cold,future-fu', got);
}
/* Channel is irrelevant to the ranking - Levi's "regardless of channel target". */
{
  const got = order([
    { id: 'cold-call', touchCount: 4, nextActionChannel: 'call', nextActionDate: '2026-08-20' },
    { id: 'warm-dm',   touchCount: 0, nextActionChannel: 'dm',   nextActionDate: '2026-08-26', followUp: TODAY },
  ]);
  check('a warm DM outranks a cold call', got.startsWith('warm-dm'), got);
}
let failed = 0;
for (const x of r) { if (!x.pass) failed++; console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.n}${x.pass ? '' : '   <- ' + x.d}`); }
console.log(`\n${r.length - failed}/${r.length} passed`);
process.exit(failed ? 1 : 0);
