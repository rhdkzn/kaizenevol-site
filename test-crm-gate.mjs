/* Channel gating + the ghost-guard (v3 spec P0 #3).
 *
 * chanOk used to return a bare `true` for DM, so every lead looked contactable
 * and the "no usable channel" guard could never fire. Gating it correctly creates
 * a second risk on LIVE leads: a lead mid-sequence with no handle now runs out of
 * channels, and the old advance path would have parked it 90 days labelled
 * "No response" - a false reason written onto real data. These pin both.
 */
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./crm.html', import.meta.url), 'utf8');
const social = html.slice(html.indexOf('/* SEQ-SOCIAL-START'), html.indexOf('/* SEQ-SOCIAL-END */'));
const v3     = html.slice(html.indexOf('/* SEQ-V3-START'),     html.indexOf('/* SEQ-V3-END */'));
const gate   = html.slice(html.indexOf('/* SEQ-GATE-START'),   html.indexOf('/* SEQ-GATE-END */'));
if (!gate.includes('chanOk')) throw new Error('gate core not found between markers');

/* canCall / canEmail / entityGuess USED to be mirrored here as a preamble, which
   meant this test could pass against a definition the app no longer shipped. They
   now live inside the gate markers - the PECR corporate check moved in there when
   routing was unified - so the real ones are exercised and nothing is mirrored. */
const api = new Function(social + v3 + gate +
  ';return {chanOk,canCall,canEmail,isCorp,seqExhausted,markNeedsData,clearNeedsData,needsDataReasonFor,canDm};')();

const r = [];
const check = (n, pass, d) => r.push({ n, pass, d });
const eq = (n, got, want) => check(n, got === want, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

const screened = { phone: '07700900000', tpsScreened: 'y', dialOk: 'y' };

/* The bug itself: DM used to be unconditionally true. */
check('DM leg closed with no handle', !api.chanOk({}, 'dm'), 'a lead with no social was DM-able');
check('DM leg open with a handle', api.chanOk({ social: { ig: 'x' } }, 'dm'), 'a handled lead was not DM-able');

/* The other two gates must be untouched - the call one is the fine-category guard. */
check('call closed when unscreened', !api.chanOk({ phone: '07700900000' }, 'call'), 'unscreened number was dialable');
check('call open when screened', api.chanOk(screened, 'call'), 'screened number was not dialable');
check('email closed with no email', !api.chanOk({}, 'email'), 'no-email lead was emailable');
check('email closed after a bounce', !api.chanOk({ business: 'A Ltd', email: 'a@b.c', emailDead: true }, 'email'), 'bounced email still open');

/* PECR, and the reason unifying the ladders could have been a compliance
   regression: cold email is clean to a corporate subscriber and a breach to a
   sole trader. The old 3-way routing carried that guard; the gate carries it now. */
check('email open to a Ltd',        api.chanOk({ business: 'Baxter Kitchens Ltd', email: 'a@b.c' }, 'email'), 'Ltd was not emailable');
check('email open to an LLP',       api.chanOk({ business: 'Baxter LLP', email: 'a@b.c' }, 'email'), 'LLP was not emailable');
check('email CLOSED to a sole trader', !api.chanOk({ business: 'Dave The Fitter', email: 'a@b.c' }, 'email'), 'sole trader was cold-emailable — PECR breach');
check('explicit entityType beats the name guess',
  api.chanOk({ business: 'Dave The Fitter', entityType: 'Ltd', email: 'a@b.c' }, 'email'), 'typed-in Ltd was ignored');

/* The aggregate bounce guard rides the same gate: paused kills the email leg and
   leaves calls and DMs alone. */
check('paused email lane closes the email leg',
  !api.chanOk({ business: 'A Ltd', email: 'a@b.c' }, 'email', true), 'paused lane still emailed');
check('paused email lane leaves calls alone', api.chanOk(screened, 'call', true), 'pause killed the call leg');

/* Ghost-guard: a lead with nothing usable has no channel at all. */
const ghost = { business: 'Ghost Ltd' };
check('ghost has no usable channel',
  !api.chanOk(ghost, 'call') && !api.chanOk(ghost, 'email') && !api.chanOk(ghost, 'dm'), 'ghost was contactable');

/* The live-data risk: ran-out-of-channels must NOT be recorded as "no response".
   Exhaustion is now read off doneSteps rather than an index, because the ladder
   can be re-entered backwards when a call leg is injected. */
const ALL = [0, 1, 2, 3, 4, 5, 6, 7];
eq('steps remain but none usable -> nochannel', api.seqExhausted({ sequenceType: 'MASTER', doneSteps: [0, 1] }), 'nochannel');
eq('every step worked -> ladder',               api.seqExhausted({ sequenceType: 'MASTER', doneSteps: ALL }), 'ladder');
eq('one step still open -> nochannel',          api.seqExhausted({ sequenceType: 'MASTER', doneSteps: [0, 1, 2, 3, 4, 5, 6] }), 'nochannel');
eq('a warm ladder exhausts at two',             api.seqExhausted({ sequenceType: 'WARM', doneSteps: [0, 1] }), 'ladder');

/* The reason written onto the lead has to say what is actually missing, because
   Diego reads it to decide what to go and find. */
const ltd = { business: 'Baxter Kitchens Ltd' };
eq('reason for a bare lead',        api.needsDataReasonFor({}), 'no phone · sole trader — no cold email · no social handle');
eq('reason names an unscreened phone', api.needsDataReasonFor({ ...ltd, phone: '07700900000', email: 'a@b.c', social: { ig: 'x' } }), 'phone unscreened');
eq('reason names a bounced email',  api.needsDataReasonFor({ ...ltd, ...screened, email: 'a@b.c', emailDead: true, social: { ig: 'x' } }), 'email bounced');
/* Diego reads this line to decide what to go and find, so "no legal email" and
   "sole trader" are different jobs: one is find an address, the other is never. */
eq('reason names the sole-trader case', api.needsDataReasonFor({ business: 'Dave The Fitter', ...screened, email: 'a@b.c', social: { ig: 'x' } }), 'sole trader — no cold email');
eq('reason names a missing address', api.needsDataReasonFor({ ...ltd, ...screened, social: { ig: 'x' } }), 'no legal email');
eq('fully contactable has no reason', api.needsDataReasonFor({ ...ltd, ...screened, email: 'a@b.c', social: { ig: 'x' } }), 'no usable channel');

/* Marking and clearing must leave the lead in a sane state. */
{
  const l = { sequenceType: 'MASTER', nextActionDate: '2026-08-26', nextActionChannel: 'dm' };
  api.markNeedsData(l, 'no social handle');
  check('marking clears the schedule', l.needsData === 'y' && l.sequenceType === '' && l.nextActionDate === '' && l.nextActionChannel === '', JSON.stringify(l));
  api.clearNeedsData(l);
  check('clearing removes the flag', !l.needsData && !l.needsDataReason, JSON.stringify(l));
}

let failed = 0;
for (const x of r) { if (!x.pass) failed++; console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.n}${x.pass ? '' : '   <- ' + x.d}`); }
console.log(`\n${r.length - failed}/${r.length} passed`);
process.exit(failed ? 1 : 0);
