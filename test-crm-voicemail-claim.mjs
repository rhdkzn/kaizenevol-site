/* The phantom voicemail — the paired email must never claim a voicemail that
 * was not left.
 *
 * Reported by Levi from Diego's first real dial session (2026-08-27, inbox
 * submissions/2026-08-27-levi-to-law-crm-four-defects-first-real-dial-session.md).
 * Diego dialled, the owner was out, he logged `no-answer`. The step counted as
 * done, so the guard in stepFlags saw "a call step was worked" and left refVm
 * true — and the paired email card told him to reference a voicemail nobody had
 * left. That is an untrue claim going outward to a stranger, which is worse than
 * any internal bug on this board.
 *
 * The comment above stepFlags already stated the correct rule: the flag is
 * "derived from what was actually WORKED". A no-answer IS a worked call, so the
 * doneSteps test satisfied the letter of that and missed its point. The outcome
 * is what makes the claim true or false, and logTouch has stored it per touch
 * all along ({d,ch,o}).
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
  ';return {MASTER_CADENCE,stepFlags};')();

const { MASTER_CADENCE, stepFlags } = api;

/* Step 1 is the day-1 paired email, the only step carrying refVm. Assert that
   rather than hardcode the index, so a cadence reorder fails loudly here
   instead of silently testing the wrong step. */
const VM_STEP = MASTER_CADENCE.findIndex(s => s.refVm);

const r = [];
const check = (n, pass, d) => r.push({ n, pass, d });

const lead = (touches, doneSteps = [0]) => ({
  id: 'L1', business: 'Newcastle Plumbing Ltd', entityType: 'Ltd',
  phone: '0191 000 0000', email: 'a@b.co.uk', tpsScreened: 'y', dialOk: 'y',
  sequenceType: 'MASTER', doneSteps, touches
});

check('the refVm step is still in the cadence', VM_STEP > -1, `index ${VM_STEP}`);

/* THE DEFECT. Diego's exact session: one call worked, outcome no-answer. */
const noAnswer = stepFlags(lead([{ d: '2026-08-27', ch: 'call', o: 'no-answer' }]), VM_STEP);
check('no-answer does NOT claim a voicemail', noAnswer.refVm !== true,
  `refVm=${noAnswer.refVm}`);
check('no-answer falls back to the standalone opener', noAnswer.standalone === true,
  `standalone=${noAnswer.standalone}`);

/* The other half: a real voicemail must still be referenced, or the fix has
   just deleted the feature instead of correcting it. */
const leftVm = stepFlags(lead([{ d: '2026-08-27', ch: 'call', o: 'voicemail' }]), VM_STEP);
check('a real voicemail IS still referenced', leftVm.refVm === true, `refVm=${leftVm.refVm}`);
check('a real voicemail is not marked standalone', leftVm.standalone !== true,
  `standalone=${leftVm.standalone}`);

/* Pre-existing behaviour that must not regress: no call worked at all. */
const noCall = stepFlags(lead([], []), VM_STEP);
check('an unworked lead still gets the standalone opener', noCall.refVm !== true && noCall.standalone === true,
  `refVm=${noCall.refVm} standalone=${noCall.standalone}`);

/* A voicemail on some OTHER channel is not a voicemail. Guards against a fix
   that checks the outcome but forgets the channel. */
const dmOdd = stepFlags(lead([{ d: '2026-08-27', ch: 'dm', o: 'voicemail' }]), VM_STEP);
check('a non-call touch cannot license the voicemail claim', dmOdd.refVm !== true,
  `refVm=${dmOdd.refVm}`);

const failed = r.filter(x => !x.pass);
for (const x of r) console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.n}  — ${x.d}`);
console.log(`\n${r.length - failed.length}/${r.length} passed`);
process.exit(failed.length ? 1 : 0);
