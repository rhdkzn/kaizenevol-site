/* test-onboard-agreement.mjs — the onboarding funnel's pure parts.
 *
 * The signature binds to a SHA-256 of the agreement text rendered from the row. If the
 * render is not deterministic, or drifts from the terms in FIN-PRI-004, a signed hash stops
 * matching the document it was signed against. These checks pin the contract:
 *   - same row → same text → same hash, every time
 *   - founding and standard rates, the step and the trigger read correctly
 *   - the token is 32 chars of base64url and passes the validator the API uses
 *   - the reno-era terms (2,500 / 60 days / territory / AI front office) never appear
 */
import { agreementText, agreementHash, newToken } from './api/onboard.js';

let fails = 0;
const ok = (name, cond, detail) => { if (cond) console.log('  ok   ' + name); else { fails++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); } };

const founding = { business: 'Marauder', founder: 'Sam Okafor', founding: true, retainer: 1000, startDate: '2026-10-01', issuedAt: '2026-09-06', email: 'sam@marauder.co.uk' };
const standard = { business: 'Kiln & Co', founder: 'Priya Nair', founding: false, retainer: 2000 };

const t1 = agreementText(founding), t2 = agreementText(founding);
ok('render is deterministic', t1 === t2);
ok('hash is deterministic', agreementHash(t1) === agreementHash(t2));
ok('hash is sha256 hex', /^[a-f0-9]{64}$/.test(agreementHash(t1)));
ok('different rows hash differently', agreementHash(t1) !== agreementHash(agreementText(standard)));

ok('founding fee is £1,000', /£1,000 per month \(founding rate/.test(t1), t1.match(/£[\d,]+ per month[^\n]*/)?.[0]);
ok('standard fee is £2,000', /£2,000 per month \(standard rate\)/.test(agreementText(standard)));
ok('start date rendered', t1.includes('1 October 2026'));
ok('no start date → on signing', agreementText(standard).includes('the date this Agreement is signed'));
ok('growth step: +50% trigger and £1,000 step', /at least 50% above/.test(t1) && /rises by £1,000 per month permanently/.test(t1));
ok('growth step: no cap', /There is no cap/.test(t1));
ok('growth step: under three months → no baseline', /fewer than three full trading months/.test(t1));
ok('revenue access is a precondition', /Revenue access at signing is a precondition/.test(t1));
ok('drop one is measurement, no guarantee', /Drop one is measurement/.test(t1) && /No outcome is guaranteed/.test(t1));
ok('own-brand disclosure clause present', /never present its own brands as client results/.test(t1));
ok('E&W law + e-signature', /England and Wales/.test(t1) && /signed electronically/.test(t1));
ok('parties named', t1.includes('Marauder') && t1.includes('Sam Okafor'));
ok('agency is a trading name, not a company', /trading together as KaizenEvol/.test(t1) && !/KaizenEvol Ltd/.test(t1));
ok('signer confirms authority', /authorised to sign for the Client/.test(t1));
ok('founding rate graduates at the first step to £2,000 (FIN-PRI-004)', /2\.4 The founding rate.*ends at the first growth step.*£2,000 per month/.test(t1));
ok('standard agreement has no clause 2.4', !/2\.4 The founding rate/.test(agreementText(standard)));
ok('growth-step payment mechanic with 7-day dispute (3.5)', /3\.5 When a step is verified/.test(t1) && /within 7 days/.test(t1));
ok('30 days notice to the notice addresses, Stripe cancelled', /not less than 30 days' written notice/.test(t1) && /cancels the recurring charge/.test(t1));
ok('copyright assigned with full title guarantee (CDPA s.90)', /assigns to the Client, with full title guarantee/.test(t1));
ok('Art 28 processor terms present', /documented instructions/.test(t1) && /sub-processors/.test(t1) && /without undue delay/.test(t1) && /delete or return/.test(t1));
ok('PECR consent warranty', /Privacy and Electronic Communications Regulations 2003/.test(t1));
ok('sub-processors named', /Meta, Klaviyo, Shopify, Stripe, Resend and Supabase/.test(t1));
ok('platform matters outside control excluded', /platform outages/.test(t1));
ok('notices clause carries the client email', /11\.4 Notices go by email/.test(t1) && t1.includes('sam@marauder.co.uk'));
ok('third-party rights excluded', /Contracts \(Rights of Third Parties\) Act 1999/.test(t1));
ok('signed for the Agency at issue', /SIGNED for the Agency by Rahaid/.test(t1) && t1.includes('6 September 2026'));
ok('issue date is deterministic when issuedAt is set', agreementText(founding) === agreementText({ ...founding }));

for (const dead of ['2,500', '60 days', 'territory', 'AI front office', 'KaizenReach', 'KaizenDesk', 'renovation', 'guaranteed or your money back']) {
  ok('reno-era term absent: ' + dead, !t1.toLowerCase().includes(dead.toLowerCase()));
}

const tok = newToken();
ok('token is base64url, 32 chars', /^[A-Za-z0-9_-]{32}$/.test(tok), tok);
ok('tokens differ', newToken() !== tok);

console.log(fails ? `\n${fails} check(s) failed` : '\nall onboarding agreement checks passed');
process.exit(fails ? 1 : 0);
