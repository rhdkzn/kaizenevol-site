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
ok('signed for the Agency at issue', /SIGNED for the Agency by Rahaid and Diego/.test(t1) && t1.includes('6 September 2026'));
ok('issue date is deterministic when issuedAt is set', agreementText(founding) === agreementText({ ...founding }));

/* The 2026-09-11 clause additions. These exist because the agreement had no way to stop
 * work on non-payment, nothing to save the rest of the contract if one clause failed, and
 * no offboarding terms. Pin them so a later edit cannot quietly drop them again. */
ok('6.4 termination for material breach, 30-day cure', /material breach/.test(t1) && /within 30 days of being asked/.test(t1));
ok('6.5 suspension for non-payment, with a good-faith dispute carve-out', /suspend the services until it is paid/.test(t1) && /disputing in good faith/.test(t1));
ok('6.6 offboarding: client keeps its assets, Agency removes access', /remove its own access within 14 days/.test(t1) && /keeps its own accounts/.test(t1));
ok('5.3 Agency warrants reasonable care and skill', /reasonable care and skill/.test(t1));
ok('5.4 client delay does not fall on the Agency', /not responsible for the delay/.test(t1) && /retainer continues to be payable/.test(t1));
ok('10.2 confidentiality survives 3 years + trade secrets', /three years after this Agreement ends/.test(t1) && /remains a trade secret/.test(t1));
ok('10.2 injunctive relief available', /inju(nction|nctive)/.test(t1));
ok('11.6 non-exclusive engagement', /is not engaged exclusively/.test(t1));
ok('11.7 no assignment without consent; subcontractors allowed', /Neither party may assign or transfer/.test(t1) && /remains responsible for their work/.test(t1));
ok('11.8 no waiver by delay', /is not a waiver of it/.test(t1));
ok('11.9 severability', /it is severed and the rest of this Agreement continues/.test(t1));
ok('11.10 force majeure', /beyond its reasonable control/.test(t1));
ok('version line bumped', /Version 2026-09-11/.test(t1));

for (const dead of ['2,500', '60 days', 'territory', 'AI front office', 'KaizenReach', 'KaizenDesk', 'renovation', 'guaranteed or your money back']) {
  ok('reno-era term absent: ' + dead, !t1.toLowerCase().includes(dead.toLowerCase()));
}

const tok = newToken();
ok('token is base64url, 32 chars', /^[A-Za-z0-9_-]{32}$/.test(tok), tok);
ok('tokens differ', newToken() !== tok);

/* A signed row must serve the SIGNED text, not a fresh render. Added 2026-09-11 after the
 * clause additions: the signature binds to a hash of that day's words, so re-rendering from
 * current canon would show a signed client a document their own hash does not match. */
{
  const mod = await import('./api/onboard.js');
  const src = await (await import('node:fs/promises')).readFile('./api/onboard.js', 'utf8');
  ok('publicView prefers the stored signature text',
     /d\.signature && d\.signature\.text\) \? d\.signature\.text : agreementText\(d\)/.test(src));
  ok('signing stores the text alongside the hash', /const signature = \{[^}]*hash, text \}/.test(src));
  void mod;
}

/* ── KAIZEN ASCENT — the local lane (OPS-ONB-006, 2026-09-25) ──────────────────
 * One onboarding row, two lanes. The creative text must not move by a single byte:
 * every signed creative agreement is a hash of those words, and a render that drifts
 * makes a signed client's fingerprint stop matching the document they signed. The two
 * hashes below were taken off main BEFORE the lane existed. */
const CREATIVE_FOUNDING_HASH = '080892daef453ea931e3d44c0249a832334a26dd78a280c091d5156acb663e3c';
const CREATIVE_STANDARD_HASH = '4a4491c13fa91d1e9f931847b3e3a3c6ae6dce031f8b2e22338ebf26ac86887d';
ok('creative founding text byte-identical to pre-lane main', agreementHash(t1) === CREATIVE_FOUNDING_HASH, agreementHash(t1));
ok('creative standard text byte-identical to pre-lane main', agreementHash(agreementText({ ...standard, issuedAt: '2026-09-06' })) === CREATIVE_STANDARD_HASH);
ok('lane:"creative" renders the same bytes as no lane', agreementText({ ...founding, lane: 'creative' }) === t1);

const mod = await import('./api/onboard.js');
ok('local agreement renderer exported', typeof mod.agreementTextLocal === 'function');
ok('publicView exported (so the page contract is testable)', typeof mod.publicView === 'function');
if (typeof mod.agreementTextLocal === 'function' && typeof mod.publicView === 'function') {
  const { agreementTextLocal, publicView } = mod;
  const lf = { lane: 'local', business: 'Hollow Oak Barbers', founder: 'Dev Patel', founding: true, retainer: 500, startDate: '2026-10-01', issuedAt: '2026-09-25', email: 'dev@hollowoak.co.uk' };
  const ls = { ...lf, founding: false, retainer: 750, email: '' };
  const L1 = agreementTextLocal(lf), L2 = agreementTextLocal(ls);
  ok('agreementText routes lane:"local" to the local text', agreementText(lf) === L1);
  ok('local render is deterministic', agreementTextLocal({ ...lf }) === L1);
  ok('local founding fee £500, locked for life', /£500 per month/.test(L1) && /locked for life/i.test(L1));
  ok('local standard fee £750', /£750 per month/.test(L2) && !/£500 per month/.test(L2));
  ok('local: no setup fee', /no setup fee/i.test(L1));
  ok('local: 3-month minimum then month to month', /initial term of three months/.test(L1) && /continues month to month/.test(L1));
  ok('local: 30 days notice, not before the initial term ends', /not less than 30 days' written notice/.test(L1) && /no ending may take effect before the end of the initial term/.test(L1));
  ok('local: website free, built hosted maintained', /website/i.test(L1) && /no charge/i.test(L1) && /hosted/i.test(L1));
  ok('local: AI front office named (texts, calls, emails, chat)', /texts/.test(L1) && /calls/.test(L1) && /emails/.test(L1) && /chat/.test(L1));
  /* Buy-out: £1,200 flat (CRITICAL_FACTS Kaizen Ascent block, OPS-ONB-006; Rahaid 2026-09-25:
     "it's in the vault for a reason"). A figure typed on the row overrides it for that client. */
  ok('local: buy-out offered on leaving', /buy the website/i.test(L1));
  ok('local: buy-out defaults to £1,200 flat', /buy the website for £1,200/i.test(L1), (L1.match(/[^\n]*buy the website[^\n]*/i) || [''])[0].slice(0, 200));
  ok('local: buy-out figure on the row overrides the default', /buy the website for £1,450/i.test(agreementTextLocal({ ...lf, buyout: 1450 })) && !/£1,200/.test(agreementTextLocal({ ...lf, buyout: 1450 })));
  ok('local: hosting after buy-out £20/mo', /£20 per month/.test(L1));
  ok('local: site taken down 30 days after last paid month if not bought', /taken down 30 days after/i.test(L1));
  ok('local: content and logo stay theirs', /content and logo/i.test(L1));
  ok('local: guarantee is a CREDIT, never a refund', /next month free/i.test(L1) && /credit/i.test(L1) && /never a refund/i.test(L1));
  ok('local: guarantee needs opening hours on record', /opening hours/i.test(L1) && /does not apply until/i.test(L1));
  /* Mike Ross review, 2026-09-25: two ways the guarantee gave months away. */
  ok('local: guarantee starts the first full month after the front office goes live', /first full calendar month after the front office goes live/i.test(L1));
  ok('local: guarantee hours are the hours actually open to customers; changes count from next month', /actually open to customers/i.test(L1) && /from the next calendar month/i.test(L1));
  ok('local: Art 28 processor terms kept verbatim from creative', /documented instructions/.test(L1) && /without undue delay/.test(L1) && /delete or return/.test(L1));
  ok('local: Twilio and Anthropic named as sub-processors', /Twilio/.test(L1) && /Anthropic/.test(L1));
  ok('local: PECR warranty for marketing messages', /Privacy and Electronic Communications Regulations 2003/.test(L1) && /reactivation/i.test(L1));
  ok('local: calls may be answered by an AI assistant, privacy notice says so', /AI assistant/.test(L1) && /privacy notice/i.test(L1));
  ok('local: deposits to the client\'s own account, never held by us', /own account/i.test(L1) && /never holds client money/i.test(L1));
  ok('local: liability, confidentiality, general carried over', /three months before the claim arose/.test(L1) && /three years after this Agreement ends/.test(L1) && /England and Wales/.test(L1) && /force majeure|beyond its reasonable control/.test(L1));
  for (const dead of ['growth step', 'revenue access', 'drop', 'sell-through', 'baseline', '£1,000', '£2,000', 'Klaviyo', 'Shopify']) {
    ok('local: creative-only term absent: ' + dead, !L1.toLowerCase().includes(dead.toLowerCase()));
  }
  ok('local and creative texts differ', L1 !== t1);

  /* The pay link. The creative lane shipped a standard row with payUrl '' (OPS-WEB-009).
     The local lane must never borrow a CREATIVE Stripe link (a £1,000 link on a £500 client),
     and with its env var unset it serves '' so the page shows the honest fallback. */
  const lRow = { id: 'CCCCCCCCCCCCCCCCCCCCCCCC', status: 'sent', data: lf };
  const saved = { a: process.env.STRIPE_LOCAL_FOUNDING_LINK, b: process.env.STRIPE_LOCAL_STANDARD_LINK };
  delete process.env.STRIPE_LOCAL_FOUNDING_LINK; delete process.env.STRIPE_LOCAL_STANDARD_LINK;
  ok('local pay link: env unset → empty, never a creative link', payUrl(lRow) === '', payUrl(lRow));
  process.env.STRIPE_LOCAL_FOUNDING_LINK = 'https://buy.stripe.com/test_local_founding';
  process.env.STRIPE_LOCAL_STANDARD_LINK = 'https://buy.stripe.com/test_local_standard';
  ok('local founding pay link from STRIPE_LOCAL_FOUNDING_LINK, token attached', /^https:\/\/buy\.stripe\.com\/test_local_founding\?client_reference_id=CCCC/.test(payUrl(lRow)), payUrl(lRow));
  ok('local standard pay link from STRIPE_LOCAL_STANDARD_LINK', payUrl({ id: 'D'.repeat(24), data: ls }).startsWith('https://buy.stripe.com/test_local_standard'));
  if (saved.a === undefined) delete process.env.STRIPE_LOCAL_FOUNDING_LINK; else process.env.STRIPE_LOCAL_FOUNDING_LINK = saved.a;
  if (saved.b === undefined) delete process.env.STRIPE_LOCAL_STANDARD_LINK; else process.env.STRIPE_LOCAL_STANDARD_LINK = saved.b;
  ok('creative pay links untouched by the local env vars', /^https:\/\/buy\.stripe\.com\/aFa5kF78wgpncajbPV6AM0g/.test(payUrl(fRow)));

  const v = publicView(lRow), vc = publicView(fRow);
  ok('publicView carries lane "local"', v.lane === 'local');
  ok('publicView: creative row lane defaults to "creative"', vc.lane === 'creative');
  ok('publicView: local retainer 500 founding', v.retainer === 500);
  ok('publicView: local standard retainer defaults to 750 when unset', publicView({ id: 'E'.repeat(24), data: { ...ls, retainer: undefined } }).retainer === 750);
  ok('publicView: local hash binds the local text', v.agreementHash === agreementHash(L1));
  ok('publicView: local buy-out defaults to 1200', v.buyout === 1200);
  /* The demo switch (Rahaid, 2026-09-25): a row flagged demo:true may walk past the payment
     step without paying. It is read from the ROW only, never the URL, and it must not touch
     the agreement text or its hash. */
  const dRow = { id: 'F'.repeat(24), status: 'signed', data: { ...lf, demo: true } };
  ok('publicView: demo row says demo', publicView(dRow).demo === true);
  ok('publicView: normal rows are never demo', publicView(lRow).demo === false && publicView(fRow).demo === false);
  ok('publicView: only a literal true counts as demo', publicView({ id: 'G'.repeat(24), data: { ...lf, demo: 'yes' } }).demo === false);
  ok('demo flag does not change the agreement or its hash', agreementText({ ...lf, demo: true }) === L1);
  ok('publicView: creative view has no lane-only fields leaking', !('buyout' in vc) || vc.buyout === null);
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall onboarding agreement checks passed');
process.exit(fails ? 1 : 0);
