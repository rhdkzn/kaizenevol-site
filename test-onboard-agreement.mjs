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
import { agreementText, agreementHash, newToken, payUrl } from './api/onboard.js';

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
/* The PAY LINK. Nothing checked this before, and a standard-rate row rendered an EMPTY
   payUrl in production on 2026-09-07 - a £2,000 client would have reached the last step of
   a real sale with no button. Proven live before it was fixed. */
const fRow = { id:'AAAAAAAAAAAAAAAAAAAAAAAA', data:{ ...founding } };
const sRow = { id:'BBBBBBBBBBBBBBBBBBBBBBBB', data:{ ...standard, email:'p@kiln.co' } };
ok('founding row gets a pay link', /^https:\/\/buy\.stripe\.com\/\S+/.test(payUrl(fRow)));
ok('STANDARD row gets a pay link (was empty until 2026-09-07)', /^https:\/\/buy\.stripe\.com\/\S+/.test(payUrl(sRow)), payUrl(sRow) || '(empty)');
ok('the two tiers use DIFFERENT links', payUrl(fRow) !== payUrl(sRow));
ok('pay link carries client_reference_id = the token', payUrl(sRow).includes('client_reference_id=BBBBBBBBBBBBBBBBBBBBBBBB'));
ok('pay link prefills the email when we have one', payUrl(sRow).includes('prefilled_email=p%40kiln.co'));

/* The founding rate has NO TIME CAP — it ends at the first growth step and nothing else
   (Rahaid, 2026-09-07). This was actively proposed and declined: the economics argue for a
   12-month cap (a founding client nets 41-47% of a standard one and holds one of five seats
   plus a shoot day), but clause 6.2 already lets either party end on 30 days' notice, so the
   seat can be reopened by hand without making the offer worse. This check exists because the
   argument is re-derivable and a future session would otherwise make it again. */
ok('founding rate ends at the growth step ONLY - no months-based cap', /2\.4 The founding rate[^\n]*ends at the first growth step/.test(t1) && !/2\.4 The founding rate[^\n]*(month|year)s? (of|from|after) (signing|the start)/.test(t1));
ok('standard agreement has no clause 2.4', !/2\.4 The founding rate/.test(agreementText(standard)));
ok('growth-step payment mechanic with 7-day dispute (3.5)', /3\.5 When a step is verified/.test(t1) && /within 7 days/.test(t1));
/* Term — three-month initial term then rolling (Rahaid, 2026-09-07, Mike Ross's recommendation
   in SAL-DOC-002 item 1; the rolling-from-day-one version that shipped was Law's default, never
   his ruling). The teeth are 6.3: without the initial-term fees surviving, a client could cancel
   the card in month one and the term would mean nothing. */
ok('6.1 three-month initial term', /initial term of three months/.test(t1));
ok('6.1 rolls monthly after the initial term', /continues month to month/.test(t1));
ok('6.2 notice cannot bite before the initial term ends', /no ending may take effect before the end of the initial term/.test(t1));
ok('6.3 initial-term retainer survives ending', /retainer for the initial term remains payable in full/.test(t1));
ok('the retired rolling-from-day-one wording is gone', !/runs month to month from/.test(t1));
ok('standard rows carry the same term', /initial term of three months/.test(agreementText(standard)));
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
