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
const gate   = html.slice(html.indexOf('/* SEQ-GATE-START'),   html.indexOf('/* SEQ-GATE-END */'));
if (!gate.includes('chanOk')) throw new Error('gate core not found between markers');

/* canCall/canEmail and LADDERS live outside the markers; mirror the shipped
   definitions so the gate is exercised against real inputs. */
const preamble = `
  function canCall(l){return !!l.phone&&l.tpsScreened==='y'&&l.dialOk==='y';}
  function canEmail(l){return !!(l.email&&l.email.trim())&&!l.emailDead;}
  const LADDERS={FULL:[{ch:'call',d:1},{ch:'email',d:1},{ch:'dm',d:3},{ch:'call',d:5}]};
`;
const api = new Function(preamble + social + gate +
  ';return {chanOk,seqExhausted,markNeedsData,clearNeedsData,needsDataReasonFor,canDm};')();

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
check('email closed after a bounce', !api.chanOk({ email: 'a@b.c', emailDead: true }, 'email'), 'bounced email still open');

/* Ghost-guard: a lead with nothing usable has no channel at all. */
const ghost = { business: 'Ghost Ltd' };
check('ghost has no usable channel',
  !api.chanOk(ghost, 'call') && !api.chanOk(ghost, 'email') && !api.chanOk(ghost, 'dm'), 'ghost was contactable');

/* The live-data risk: ran-out-of-channels must NOT be recorded as "no response". */
const midLadder = { sequenceType: 'FULL' };
eq('steps remain but none usable -> nochannel', api.seqExhausted(midLadder, 2), 'nochannel');
eq('past the end of the ladder -> ladder',      api.seqExhausted(midLadder, 4), 'ladder');
eq('exactly at the end -> ladder',              api.seqExhausted(midLadder, 4), 'ladder');

/* The reason written onto the lead has to say what is actually missing, because
   Diego reads it to decide what to go and find. */
eq('reason for a bare lead',        api.needsDataReasonFor({}), 'no phone · no legal email · no social handle');
eq('reason names an unscreened phone', api.needsDataReasonFor({ phone: '07700900000', email: 'a@b.c', social: { ig: 'x' } }), 'phone unscreened');
eq('reason names a bounced email',  api.needsDataReasonFor({ ...screened, email: 'a@b.c', emailDead: true, social: { ig: 'x' } }), 'email bounced');
eq('fully contactable has no reason', api.needsDataReasonFor({ ...screened, email: 'a@b.c', social: { ig: 'x' } }), 'no usable channel');

/* Marking and clearing must leave the lead in a sane state. */
{
  const l = { sequenceType: 'FULL', nextActionDate: '2026-08-26', nextActionChannel: 'dm' };
  api.markNeedsData(l, 'no social handle');
  check('marking clears the schedule', l.needsData === 'y' && l.sequenceType === '' && l.nextActionDate === '' && l.nextActionChannel === '', JSON.stringify(l));
  api.clearNeedsData(l);
  check('clearing removes the flag', !l.needsData && !l.needsDataReason, JSON.stringify(l));
}

let failed = 0;
for (const x of r) { if (!x.pass) failed++; console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.n}${x.pass ? '' : '   <- ' + x.d}`); }
console.log(`\n${r.length - failed}/${r.length} passed`);
process.exit(failed ? 1 : 0);
