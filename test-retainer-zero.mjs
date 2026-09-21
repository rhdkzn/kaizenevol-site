/* An explicit £0 retainer must survive to the numbers people read.
 *
 * `Number(c.retainerValue)||(c.founding?1000:2000)` treats 0 as absent, so a client
 * signed but not yet billing claimed a retainer nobody pays — and that figure drives
 * MRR, the goal progress bar and the growth-step bonus on three separate surfaces.
 * Found 2026-09-21 when the Owners Portal held one fabricated client and no real ones.
 *
 * The helper is extracted from each shipped file between its RETAINER-BASE markers, so
 * this drives the served code and not a copy of it.
 */
import { readFileSync } from 'node:fs';

const FILES = ['crm.html', 'dashboard.html', 'portal.html'];
const results = [];
const check = (n, pass, d) => results.push({ n, pass, d });

for (const f of FILES) {
  const html = readFileSync(new URL('./' + f, import.meta.url), 'utf8');

  /* The defect itself: `||` on retainerValue anywhere in the file. */
  const swallows = /Number\(\s*c\.retainerValue\s*\)\s*\|\|/.test(html);
  check(`${f}: no \`Number(c.retainerValue)||\` fallback left`, !swallows,
        swallows ? 'the || form swallows an explicit 0' : '');

  const a = html.indexOf('/* RETAINER-BASE-START'), b = html.indexOf('/* RETAINER-BASE-END */');
  if (a === -1 || b === -1) { check(`${f}: helper markers present`, false, 'markers not found'); continue; }
  const core = html.slice(a, b);
  if (!core.includes('function retainerBase')) { check(`${f}: helper found`, false, 'no retainerBase'); continue; }

  const retainerBase = new Function(core + '; return retainerBase;')();
  const S = { foundingValue: 1000, retainerValue: 2000 };

  check(`${f}: explicit 0 stays 0`,            retainerBase({ retainerValue: 0 }, S) === 0,    `got ${retainerBase({ retainerValue: 0 }, S)}`);
  check(`${f}: explicit 0 stays 0 (founding)`, retainerBase({ retainerValue: 0, founding: true }, S) === 0, `got ${retainerBase({ retainerValue: 0, founding: true }, S)}`);
  check(`${f}: "0" stays 0`,                   retainerBase({ retainerValue: '0' }, S) === 0,  `got ${retainerBase({ retainerValue: '0' }, S)}`);
  /* The other direction — a guard that broke the fallback would be just as wrong. */
  check(`${f}: absent -> standard`,            retainerBase({}, S) === 2000,                   `got ${retainerBase({}, S)}`);
  check(`${f}: absent -> founding`,            retainerBase({ founding: true }, S) === 1000,   `got ${retainerBase({ founding: true }, S)}`);
  check(`${f}: null -> standard`,              retainerBase({ retainerValue: null }, S) === 2000, `got ${retainerBase({ retainerValue: null }, S)}`);
  check(`${f}: '' -> standard`,                retainerBase({ retainerValue: '' }, S) === 2000, `got ${retainerBase({ retainerValue: '' }, S)}`);
  check(`${f}: junk -> standard`,              retainerBase({ retainerValue: 'n/a' }, S) === 2000, `got ${retainerBase({ retainerValue: 'n/a' }, S)}`);
  check(`${f}: real value respected`,          retainerBase({ retainerValue: 1500 }, S) === 1500, `got ${retainerBase({ retainerValue: 1500 }, S)}`);
}

const failed = results.filter(r => !r.pass);
results.forEach(r => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.n}${r.d ? '  — ' + r.d : ''}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
