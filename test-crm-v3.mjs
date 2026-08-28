/* Outreach Engine v3 — P1 (items 7-11) and P2 (items 12-13).
 * Spec: kaizenevol-diego-inbox submissions/2026-08-25-levi-to-law-crm-outreach-engine-v3-spec.md
 *
 * Every check below is one of Levi's Part 3 acceptance criteria or the mechanism
 * one of them depends on. Three of them exist because the OLD code made the
 * behaviour impossible rather than merely absent:
 *   · Math.max(1, …) floored every gap at a day, so same-day pairing could not
 *     be expressed at all.
 *   · seqNextIdx only ever scanned forward, so a call leg that became legal on
 *     day 6 could never be pulled back into the schedule.
 *   · canEmail did not know what a sole trader was — the PECR guard lived in the
 *     routing that P1 #9 retires, so unifying the ladders without moving it
 *     would have been a compliance regression, not a refactor.
 */
import { readFileSync } from 'node:fs';

const path = process.env.CRM_HTML || new URL('./crm.html', import.meta.url);
const html = readFileSync(path, 'utf8');
const cut = (a, b) => {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i < 0 || j < 0) throw new Error(`markers missing: ${a}`);
  return html.slice(i, j);
};
const api = new Function(
  cut('/* SEQ-SOCIAL-START', '/* SEQ-SOCIAL-END */') +
  cut('/* SEQ-V3-START', '/* SEQ-V3-END */') +
  cut('/* SEQ-GATE-START', '/* SEQ-GATE-END */') +
  cut('/* SEQ-OUTCOME-START', '/* SEQ-OUTCOME-END */') +
  ';return {MASTER_CADENCE,WARM_CADENCE,ladderFor,migrateSeq,stepDone,nextStepIdx,stepFlags,' +
  'trackFor,rollWeekend,bounceStats,emailLanePaused,BOUNCE_LIMIT,BOUNCE_MIN_SAMPLE,cityKey,cityOf,' +
  'cityPausedIn,chanOk,canCall,canEmail,isCorp,seqExhausted,applyOutcome,needsDataReasonFor};')();

/* A fixed clock. addDays(n) is the only date primitive applyOutcome is given, so
   stubbing it makes every scheduling assertion exact instead of relative-to-now. */
const TODAY = '2026-08-27';                       /* a Thursday */
const addDays = (n) => {
  const d = new Date(TODAY + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const r = [];
const check = (n, pass, d) => r.push({ n, pass, d });
const eq = (n, got, want) => check(n, got === want, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const LTD = { business: 'Baxter Kitchens Ltd', entityType: 'Ltd', email: 'a@b.c', social: { ig: 'baxter' } };
const SCREENED = { phone: '07700900000', tpsScreened: 'y', dialOk: 'y' };
const enrolled = (over) => Object.assign({ sequenceType: 'MASTER', doneSteps: [], sequenceStep: 0 }, LTD, over);

/* ── item 7: the master cadence itself ───────────────────────────────────── */
const M = api.MASTER_CADENCE;
eq('master cadence is 8 touches', M.length, 8);
eq('cadence ends on D17', M[7].d, 17);
check('touches 1 and 2 are BOTH D1 (the same-day pair)', M[0].d === 1 && M[1].d === 1, `${M[0].d}/${M[1].d}`);
check('call 1 carries the voicemail flag', M[0].ch === 'call' && M[0].vm === true, JSON.stringify(M[0]));
check('email 1 references the voicemail', M[1].ch === 'email' && M[1].refVm === true, JSON.stringify(M[1]));
check('call 2 is weekend-preferred (P2 #12)', M[3].ch === 'call' && M[3].weekend === true, JSON.stringify(M[3]));
check('call 3 carries voicemail + same-day pair', M[5].vm === true && M[5].pair === true, JSON.stringify(M[5]));
check('DM 2 is the booking ask', M[6].ch === 'dm' && M[6].ask === true, JSON.stringify(M[6]));
check('call 4 is the break-up', M[7].ch === 'call' && M[7].breakup === true, JSON.stringify(M[7]));
eq('the warm re-entry ladder is two light touches', api.WARM_CADENCE.length, 2);

/* ── item 7: same-day pairing actually schedules on the same day ─────────── */
{
  const l = enrolled({ ...SCREENED });
  const msg = api.applyOutcome(l, 'no-answer', { addDays });
  eq('after call 1 the next step is the paired email', l.nextActionChannel, 'email');
  eq('and it falls due the SAME day', l.nextActionDate, TODAY);
  check('the message says to pair it', /same day/.test(msg), msg);
}

/* ── item 8: screening-aware enrolment ───────────────────────────────────── */
{
  const cold = enrolled({ phone: '07700900000', tpsScreened: 'n', dialOk: 'n' });
  eq('an unscreened Ltd is email/DM-led', api.trackFor(cold), 'email-led');
  eq('its first usable step is the email, not the call', api.nextStepIdx(cold, false), 1);
  const f = api.stepFlags(cold, 1);
  check('and that email is a STANDALONE opener', f.standalone === true && !f.refVm, JSON.stringify(f));

  /* PREMISE CORRECTED 2026-08-27. This originally asserted that a DONE call
     step alone licenses "reference the voicemail", with no touches on the lead
     at all. That is the phantom-voicemail defect Levi reported from Diego's
     first real dial session: he logged no-answer, left no message, and the
     paired email told him to reference one. A worked call is not a voicemail.
     The check keeps its intent — a real voicemail IS still referenced — and
     drops the premise that any call implies one. See
     test-crm-voicemail-claim.mjs for the full guard. */
  const warmLead = enrolled({ ...SCREENED, doneSteps: [0],
    touches: [{ d: TODAY, ch: 'call', o: 'voicemail' }] });
  eq('a screened firm is call-led', api.trackFor(warmLead), 'call-led');
  const f2 = api.stepFlags(warmLead, 1);
  check('once a VOICEMAIL is left, the email references it', f2.refVm === true && !f2.standalone, JSON.stringify(f2));

  const noAns = enrolled({ ...SCREENED, doneSteps: [0],
    touches: [{ d: TODAY, ch: 'call', o: 'no-answer' }] });
  const f3 = api.stepFlags(noAns, 1);
  check('but a no-answer does NOT — it opens standalone', f3.refVm !== true && f3.standalone === true, JSON.stringify(f3));
}

/* ── item 8: the call leg is INJECTED when dialOk flips ──────────────────── */
{
  const l = enrolled({ phone: '07700900000', tpsScreened: 'n', dialOk: 'n', doneSteps: [1, 2], sequenceStep: 2 });
  eq('while unscreened the next step is the D5 call... which is skipped', api.nextStepIdx(l, false), 4);
  l.tpsScreened = 'y'; l.dialOk = 'y';
  eq('the moment it is screened, the SKIPPED call is pulled back in', api.nextStepIdx(l, false), 0);
  const l2 = enrolled({ ...SCREENED, doneSteps: [1, 2], sequenceStep: 2 });
  api.applyOutcome(l2, 'sent', { addDays });
  eq('and an injected call is due today, never in the past', l2.nextActionDate, TODAY);
  eq('the injected step is the call', l2.nextActionChannel, 'call');
}

/* ── item 9: one ladder, legs skipped by gating, PECR guard intact ───────── */
{
  const sole = enrolled({ business: 'Dave The Fitter', entityType: 'Unknown', ...SCREENED });
  eq('a sole trader still runs the master cadence', api.ladderFor(sole).length, 8);
  const steps = [];
  const walk = Object.assign({}, sole);
  for (let i = 0; i < 8; i++) { const n = api.nextStepIdx(walk, false); if (n < 0) break; steps.push(api.MASTER_CADENCE[n].ch); walk.doneSteps = walk.doneSteps.concat([n]); }
  check('and never gets a cold email leg (PECR)', !steps.includes('email'), steps.join(','));
  check('but keeps its calls and DMs', steps.includes('call') && steps.includes('dm'), steps.join(','));
}

/* ── item 10: warm re-entry and the two-cycle cap ────────────────────────── */
{
  const l = enrolled({ ...SCREENED });
  const m1 = api.applyOutcome(l, 'pickup-no', { addDays });
  eq('first soft no parks 30 days', l.parkUntil, addDays(30));
  eq('and counts one cycle', l.softNoCount, 1);
  check('message offers to edit the date', /edit the date/.test(m1), m1);
  const m2 = api.applyOutcome(l, 'pickup-no', { addDays });
  eq('SECOND soft no parks 90, not another 30', l.parkUntil, addDays(90));
  eq('two cycles counted', l.softNoCount, 2);
  check('and it becomes an ask-to-close, not another warm loop', /ask to close/.test(l.parkReason), l.parkReason);
  check('message says so', /90 days/.test(m2), m2);
}

/* ── item 11: any reply on any channel exits cold ────────────────────────── */
for (const ch of ['call', 'email', 'dm']) {
  const l = enrolled({ ...SCREENED, nextActionChannel: ch, sequenceStep: 2, doneSteps: [0, 1] });
  api.applyOutcome(l, 'reply', { addDays });
  check(`a ${ch} reply exits to the pipeline`, l.stage === 'contacted' && l.sequenceType === 'NONE' && !l.nextActionDate, JSON.stringify({ s: l.stage, t: l.sequenceType, d: l.nextActionDate }));
}

/* ── item 11: bad data archives instead of burning eight touches ─────────── */
{
  const l = enrolled({ ...SCREENED });
  api.applyOutcome(l, 'baddata', { addDays });
  check('bad data archives the firm', l.archived === 'y' && l.sequenceType === 'NONE', JSON.stringify(l));
  check('and does NOT park it into a queue', !l.parkUntil, l.parkUntil);
}

/* ── item 11: the aggregate bounce guard ─────────────────────────────────── */
{
  const list = (sends, bounces) => [{ touches: Array.from({ length: sends }, (_, i) => ({ ch: 'email', o: i < bounces ? 'bounce' : 'sent' })) }];
  eq('bounce rate is counted over email touches', api.bounceStats(list(25, 2)).bounced, 2);
  check('2 bounces in 24 sends does not pause (too small a sample)', !api.emailLanePaused(list(24, 2)), 'paused early');
  check('2 bounces in 25 sends (8%) pauses the lane', api.emailLanePaused(list(25, 2)), 'did not pause');
  check('1 in 25 is exactly 4% and does NOT pause (limit is >4%)', !api.emailLanePaused(list(25, 1)), 'paused at the limit');
  const l = enrolled({ ...SCREENED, doneSteps: [0] });
  eq('with the lane open the paired email is next', api.nextStepIdx(l, false), 1);
  eq('with the lane paused the engine skips to the DM', api.nextStepIdx(l, true), 2);
  check('calls are untouched by an email pause', api.chanOk(l, 'call', true), 'pause killed the call leg');
}

/* ── P2 #12: weekend-preferred call scheduling ───────────────────────────── */
eq('a Wednesday rolls to the Saturday', api.rollWeekend('2026-08-26'), '2026-08-29');
eq('a Thursday rolls to the Saturday',  api.rollWeekend('2026-08-27'), '2026-08-29');
eq('a Saturday stays put',              api.rollWeekend('2026-08-29'), '2026-08-29');
eq('a Sunday stays put',                api.rollWeekend('2026-08-30'), '2026-08-30');
{
  /* Deliberately anchored to a MONDAY. Off the Thursday clock the D3->D5 gap
     lands on a Saturday by accident, so this assertion passed with the roll
     removed — caught by replaying the regression before shipping it. The whole
     point of a fixture is that it fails when the thing it guards is gone. */
  const monday = (n) => { const d = new Date('2026-08-24T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  eq('the clock anchor really is a Monday', new Date(monday(0) + 'T12:00:00').getDay(), 1);
  eq('and the unrolled D3->D5 gap really is a weekday', monday(2), '2026-08-26');
  const l = enrolled({ ...SCREENED, sequenceStep: 2, doneSteps: [0, 1] });
  api.applyOutcome(l, 'sent', { addDays: monday });   /* D3 DM done -> D5 call, weekend-flagged */
  eq('the D5 call is rolled off the Wednesday onto the Saturday', l.nextActionDate, '2026-08-29');
}

/* ── P2 #13: territory pause ─────────────────────────────────────────────── */
eq('city keys normalise case and space', api.cityKey('  Watford '), 'watford');
check('a paused city matches however it was typed', api.cityPausedIn('Watford', ['watford']), 'did not match');
check('an unpaused city is not paused', !api.cityPausedIn('Luton', ['watford']), 'false positive');
check('a blank city is never paused', !api.cityPausedIn('', ['']), 'blank city matched');

/* ── migration: leads enrolled on the retired ladders ────────────────────── */
{
  const legacy = { sequenceType: 'FULL', touchCount: 3 };
  api.migrateSeq(legacy);
  eq('a legacy FULL lead moves to the master cadence', legacy.sequenceType, 'MASTER');
  eq('and its worked touches are marked done', legacy.doneSteps.join(','), '0,1,2');
  const fresh = { sequenceType: 'MASTER', doneSteps: [4] };
  api.migrateSeq(fresh);
  eq('an already-migrated lead is left alone', fresh.doneSteps.join(','), '4');
}

/* ── the end of the road ─────────────────────────────────────────────────── */
{
  const l = enrolled({ ...SCREENED, doneSteps: [0, 1, 2, 3, 4, 5, 6], sequenceStep: 7 });
  const msg = api.applyOutcome(l, 'no-answer', { addDays });
  eq('working every touch parks 90 days', l.parkUntil, addDays(90));
  check('with the honest reason', /No response/.test(l.parkReason), l.parkReason);
  check('and says so', /parked 90/.test(msg), msg);
}

let failed = 0;
for (const x of r) { if (!x.pass) failed++; console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.n}${x.pass ? '' : '   <- ' + x.d}`); }
console.log(`\n${r.length - failed}/${r.length} passed`);
process.exit(failed ? 1 : 0);
