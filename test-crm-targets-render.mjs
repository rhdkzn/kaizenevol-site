/* The daily targets board, checked at the RENDER layer (v3 spec P0 #1).
 *
 * test-crm-targets.mjs covers the pure functions. This covers what Diego
 * actually sees, because the two can disagree: targetState() can be perfect
 * while the renderer drops the hero, orders it below the meters, or loses a
 * class that carries the colour. It also caught a real one — the edit path
 * called toast() where this file defines showToast(), which no unit test
 * touching only the marker block would ever have run.
 */
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./crm.html', import.meta.url), 'utf8');
const core = html.slice(html.indexOf('/* SEQ-TARGETS-START'), html.indexOf('function seqWeekStats(arr){'));
if (!core.includes('renderTargets')) throw new Error('renderTargets not found before seqWeekStats');

const TODAY = '2026-08-26';
let out = '', SAVED = {};
const scope = {
  esc: (x) => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  load: () => ({ targets: SAVED }),
  addDaysStr: () => '2026-08-19',
  document: { getElementById: () => ({ set innerHTML(v) { out = v; } }) },
};
const renderTargets = new Function(...Object.keys(scope),
  core + ';return renderTargets;')(...Object.values(scope));

const mk = (ch, n, o) => Array.from({ length: n }, () => ({ touches: [{ d: TODAY, ch, o: o || 'sent' }] }));
const r = []; const check = (n, p, d) => r.push({ n, pass: !!p, d });
const render = (leads, targets) => {
  SAVED = targets || {}; out = '';
  renderTargets(leads, TODAY);
  return { html: out, text: out.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
};

/* "calls target 3, log 3 -> '3/3 ✓ — keep going'; a 4th due lead still
    visible + loggable" */
let s = render(mk('call', 3), { call: 3 });
check('floor at target reads 3/3 ✓ — keep going', /3\/3 ✓ — keep going/.test(s.text), s.text);
s = render(mk('call', 4), { call: 3 });
check('a 4th dial still counts',                  /4\/3/.test(s.text), s.text);
check('past the floor it still invites more',     /keep going/.test(s.text), s.text);

/* "DM target 15, log 15 -> further DMs warn / soft-block, do NOT invite
    'keep going'" */
s = render(mk('dm', 15), { dm: 15 });
check('DM cap does NOT say keep going',           !/keep going/.test(s.text), s.text);
check('DM cap warns',                             /cap reached/.test(s.text), s.text);
check('DM meter carries the warn class',          /tgt-m dm warn/.test(s.html), 'class missing');
s = render(mk('dm', 25), { dm: 15 });
check('DM ceiling says stop',                     /stop, ceiling 25/.test(s.text), s.text);
check('DM meter carries the block class',         /tgt-m dm[^"]*block/.test(s.html), 'class missing');

/* "log a real reply -> the weekly-conversations number increments and is the
    top-line stat, ABOVE the touch meters" */
s = render(mk('call', 2).concat(mk('dm', 3, 'reply')), {});
check('a reply counts as a conversation',         /\b3\b[\s\S]*conversations this week/.test(s.text), s.text);
check('hero renders ABOVE the meters', (() => {
  const h = s.html.indexOf('tgt-hero'), m = s.html.indexOf('tgt-meters');
  return h > -1 && m > h;
})(), 'hero missing or below the meters');
check('hero shows the weekly target',             /target 38/.test(s.text), s.text);

/* an empty day must read honestly and not congratulate */
s = render([], {});
check('empty day reads 0 against target',         /0\/3/.test(s.text), s.text);
check('empty day does not congratulate',          !/keep going/.test(s.text), s.text);
check('empty day hero is 0',                      /\b0\b[\s\S]*conversations this week/.test(s.text), s.text);

/* the edit path must call a function this file actually defines */
/* The edit path is never exercised by a unit test, so resolve its calls against
   what crm.html actually defines. This is how the toast()/showToast() bug was
   found: a ReferenceError that only fires the first time Diego saves a target. */
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function']);
const BUILTINS = new Set(['prompt', 'alert', 'confirm', 'Number', 'String', 'Boolean', 'trim',
  'parseInt', 'parseFloat', 'isFinite', 'indexOf', 'includes', 'push', 'map', 'filter', 'forEach',
  'join', 'split', 'replace', 'slice', 'concat', 'toFixed']);
const DEFINED = new Set([
  ...[...html.matchAll(/function\s+([A-Za-z_]\w*)/g)].map(m => m[1]),
  ...[...html.matchAll(/(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:\(|function|async)/g)].map(m => m[1]),
]);
const undefinedCalls = (fnName) => {
  const from = html.slice(html.indexOf('function ' + fnName + '('));
  const body = from.slice(0, from.indexOf('\n}'));
  // (?<![.\w$]) so document.getElementById and Math.min are not read as bare calls
  return [...new Set([...body.matchAll(/(?<![.\w$])([A-Za-z_]\w*)\s*\(/g)].map(m => m[1]))]
    .filter(c => !KEYWORDS.has(c) && !BUILTINS.has(c) && !DEFINED.has(c));
};
let badCalls = undefinedCalls('editTargets');
check('editTargets calls only defined helpers', badCalls.length === 0, 'undefined: ' + badCalls.join(', '));
badCalls = undefinedCalls('renderTargets');
check('renderTargets calls only defined helpers', badCalls.length === 0, 'undefined: ' + badCalls.join(', '));

const bad = r.filter(x => !x.pass);
r.forEach(x => console.log(`${x.pass ? 'ok  ' : 'FAIL'}  ${x.n}${x.pass ? '' : ' — ' + x.d}`));
console.log(`\n${r.length - bad.length}/${r.length} passed`);
process.exit(bad.length ? 1 : 0);
