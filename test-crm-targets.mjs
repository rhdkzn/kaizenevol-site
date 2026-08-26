/* Daily targets board (v3 spec P0 #1).
 *
 * Acceptance checks quoted from Levi's spec, Part 3:
 *   "Daily target (floor): calls target 3, log 3 -> '3/3 ✓ — keep going'; a 4th
 *    due lead still visible + loggable."
 *   "DM cap: DM target 15, log 15 -> further DMs warn / soft-block, do NOT
 *    invite 'keep going'."
 *   "Conversations metric: log a real reply -> the weekly-conversations number
 *    increments and is the top-line stat, above the touch meters."
 *
 * The floor/cap distinction is the whole point and is NOT cosmetic: calls and
 * emails are things Diego should push PAST during warmup, DMs are a ceiling that
 * risks a Facebook/Instagram spam-ban and loses the channel outright.
 */
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./crm.html', import.meta.url), 'utf8');
const core = html.slice(html.indexOf('/* SEQ-TARGETS-START'), html.indexOf('/* SEQ-TARGETS-END */'));
if (!core.includes('targetState')) throw new Error('targets core not found between markers');
const { TARGET_DEFAULTS, DM_CEILING, mergeTargets, todayTouchCounts, targetState, weekConvos } =
  new Function(core + ';return {TARGET_DEFAULTS,DM_CEILING,mergeTargets,todayTouchCounts,targetState,weekConvos};')();

const TODAY = '2026-08-26';
const r = []; const check = (n, p, d) => r.push({ n, pass: !!p, d });

/* ---- floors: calls and emails ---- */
let s = targetState('call', 3, 3);
check('call floor hit says keep going', /keep going/i.test(s.status), `status was "${s.status}"`);
check('call floor hit reads 3/3',       /\b3\s*\/\s*3\b/.test(s.status), `status was "${s.status}"`);
check('call floor hit never blocks',    s.block === false, 'floor blocked at target');
check('call floor OVER target ok',      targetState('call', 7, 3).block === false, '4th+ dial blocked');
check('call floor over target still keep going',
      /keep going/i.test(targetState('call', 7, 3).status), 'stopped inviting more');
check('call under target not hit',      targetState('call', 1, 3).hit === false, 'hit at 1/3');
check('email is a floor too',           targetState('email', 20, 15).block === false, 'email blocked');
check('floors are marked as floors',    targetState('call', 0, 3).mode === 'floor', 'wrong mode');

/* ---- cap: DMs ---- */
s = targetState('dm', 15, 15);
check('dm at target does NOT say keep going', !/keep going/i.test(s.status), `status was "${s.status}"`);
check('dm at target warns',             s.warn === true, 'no warning at cap');
check('dm is marked as a cap',          s.mode === 'cap', 'wrong mode');
check('dm under target does not warn',  targetState('dm', 5, 15).warn === false, 'warned early');
check('dm under target does not block', targetState('dm', 5, 15).block === false, 'blocked early');
check('dm at ceiling soft-blocks',      targetState('dm', DM_CEILING, 15).block === true, 'no block at ceiling');
check('dm past ceiling soft-blocks',    targetState('dm', DM_CEILING + 4, 15).block === true, 'no block past ceiling');
check('dm between target and ceiling warns but does not block', (() => {
  const m = targetState('dm', 20, 15); return m.warn === true && m.block === false;
})(), 'wrong state between cap and ceiling');
check('ceiling is 25 per spec',         DM_CEILING === 25, `ceiling was ${DM_CEILING}`);

/* ---- today's counts, per channel, local date ---- */
const leads = [
  { touches: [{ d: TODAY, ch: 'call', o: 'noanswer' }, { d: TODAY, ch: 'call', o: 'noanswer' }] },
  { touches: [{ d: TODAY, ch: 'dm', o: 'sent' }, { d: '2026-08-25', ch: 'call', o: 'noanswer' }] },
  { touches: [{ d: TODAY, ch: 'email', o: 'sent' }] },
];
let c = todayTouchCounts(leads, TODAY);
check('counts calls logged today',   c.call === 2,  `got ${c.call}`);
check('counts dms logged today',     c.dm === 1,    `got ${c.dm}`);
check('counts emails logged today',  c.email === 1, `got ${c.email}`);
check('excludes yesterday',          c.call === 2,  'yesterday leaked into today');
check('empty board is all zeroes', (() => {
  const z = todayTouchCounts([], TODAY); return z.call === 0 && z.email === 0 && z.dm === 0;
})(), 'non-zero on empty');
check('lead with no touches array is safe',
      todayTouchCounts([{}], TODAY).call === 0, 'threw or miscounted');

/* ---- conversations: the hero number ---- */
const convoLeads = [
  { touches: [{ d: TODAY, ch: 'call', o: 'pickup-interest' }] },
  { touches: [{ d: TODAY, ch: 'dm', o: 'reply' }] },
  { touches: [{ d: TODAY, ch: 'call', o: 'pickup-no' }] },
  { touches: [{ d: TODAY, ch: 'call', o: 'noanswer' }] },
  { touches: [{ d: TODAY, ch: 'email', o: 'sent' }] },
];
check('a reply counts as a conversation',   weekConvos(convoLeads, '2026-08-19') === 3, 'wrong convo count');
check('noanswer is not a conversation', (() => {
  return weekConvos([{ touches: [{ d: TODAY, ch: 'call', o: 'noanswer' }] }], '2026-08-19') === 0;
})(), 'noanswer counted');
check('sent is not a conversation', (() => {
  return weekConvos([{ touches: [{ d: TODAY, ch: 'email', o: 'sent' }] }], '2026-08-19') === 0;
})(), 'sent counted');
check('conversations outside the window are excluded', (() => {
  return weekConvos([{ touches: [{ d: '2026-08-01', ch: 'dm', o: 'reply' }] }], '2026-08-19') === 0;
})(), 'old conversation counted');
check('logging a reply increments it', (() => {
  const before = weekConvos(convoLeads, '2026-08-19');
  const after = weekConvos(convoLeads.concat([{ touches: [{ d: TODAY, ch: 'dm', o: 'reply' }] }]), '2026-08-19');
  return after === before + 1;
})(), 'did not increment');

/* ---- targets are editable, with sane defaults ---- */
check('defaults exist for all three channels',
      TARGET_DEFAULTS.call > 0 && TARGET_DEFAULTS.email > 0 && TARGET_DEFAULTS.dm > 0, 'missing default');
check('dm default is the ~15 cap',   TARGET_DEFAULTS.dm === 15, `was ${TARGET_DEFAULTS.dm}`);
check('convos target is 38',         TARGET_DEFAULTS.convos === 38, `was ${TARGET_DEFAULTS.convos}`);
check('saved targets override defaults',
      mergeTargets({ call: 9 }).call === 9, 'override ignored');
check('unsaved channels keep defaults',
      mergeTargets({ call: 9 }).dm === TARGET_DEFAULTS.dm, 'default lost');
check('garbage target falls back to default',
      mergeTargets({ call: 'x' }).call === TARGET_DEFAULTS.call, 'garbage accepted');
check('zero target is honoured, not treated as unset',
      mergeTargets({ call: 0 }).call === 0, 'zero coerced away');
check('negative target falls back',
      mergeTargets({ call: -4 }).call === TARGET_DEFAULTS.call, 'negative accepted');
check('null saved targets is safe',
      mergeTargets(null).call === TARGET_DEFAULTS.call, 'threw on null');

const bad = r.filter(x => !x.pass);
r.forEach(x => console.log(`${x.pass ? 'ok  ' : 'FAIL'}  ${x.n}${x.pass ? '' : ' — ' + x.d}`));
console.log(`\n${r.length - bad.length}/${r.length} passed`);
process.exit(bad.length ? 1 : 0);
