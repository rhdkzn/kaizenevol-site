/* /api/onboard — the one-link onboarding funnel (2026-09-06).
 *
 *   proposal  →  agreement signed in the browser  →  Stripe  →  client space
 *
 * One row per prospect in public.ke_onboarding, keyed by an unguessable token
 * that IS the link. The CRM (authenticated) creates the row directly through
 * supabase-js; this function is what the PUBLIC page talks to, using the
 * service role behind the scenes, so the prospect never touches the database.
 *
 *   GET  /api/onboard?op=get&t=<token>       the funnel as the prospect may see it (marks viewed)
 *   POST /api/onboard?op=sign&t=<token>      { name, image, agreed } → signature stored, emails sent
 *   GET  /api/onboard?op=status&t=<token>    re-checks Stripe (when STRIPE_SECRET_KEY is set),
 *                                            flips the row to paid, writes the client into the CRM
 *   POST /api/onboard?op=send&t=<token>      (CRM only — bearer = the CRM session JWT) emails the link
 *
 * Shape borrowed from Flozy's onboarding funnel (MKT-MON-002); terms from FIN-PRI-004;
 * delivery from MKT-SOL-001. The agreement text is rendered HERE, once, so the page and
 * the hash the signature binds to can never disagree.
 */

import { createHash, randomBytes } from 'node:crypto';

const SUPABASE_URL = 'https://otxinjuuflyfsoltodam.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90eGluanV1Zmx5ZnNvbHRvZGFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzczNDQsImV4cCI6MjA5NjM1MzM0NH0.SCe8QMGFe8TnjKMOOp7fHAMsCGUIsf5Sbdtjf0XyAA4';
const SITE = 'https://kaizenevol.com';

/* The live Stripe links (FIN-PRI-004, swept 2026-09-04). The founding link is the one that
   exists; a standard-rate link is created in Stripe by Rahaid and its id/url put here (or
   per-funnel as data.payLink). client_reference_id carries the token back to us. */
const PAY_LINKS = {
  founding: 'https://buy.stripe.com/aFa5kF78wgpncajbPV6AM0g',
  standard: process.env.STRIPE_STANDARD_LINK || ''
};

const TERMS = { standard: 2000, founding: 1000, step: 1000, trigger: 1.5 };

/* ── helpers ─────────────────────────────────────────────────────────────── */
function serviceKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }
function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
}
async function rowByToken(token) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/ke_onboarding?id=eq.${encodeURIComponent(token)}&select=*`, { headers: sbHeaders(serviceKey()) });
  if (!r.ok) throw new Error('db read ' + r.status);
  const rows = await r.json();
  return rows[0] || null;
}
async function patchRow(token, patch) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/ke_onboarding?id=eq.${encodeURIComponent(token)}`, {
    method: 'PATCH', headers: sbHeaders(serviceKey()), body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  if (!r.ok) throw new Error('db write ' + r.status);
  return (await r.json())[0];
}
async function appRow(key) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_data?id=eq.${key}&select=data,updated_at`, { headers: sbHeaders(serviceKey()) });
  if (!r.ok) return null; const rows = await r.json(); return rows[0] || null;
}
async function appWrite(key, data) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_data?id=eq.${key}`, {
    method: 'PATCH', headers: sbHeaders(serviceKey()), body: JSON.stringify({ data, updated_at: new Date().toISOString() })
  });
  return r.ok;
}
function validToken(t) { return typeof t === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(t); }
function gbp(n) { return '£' + Math.round(Number(n) || 0).toLocaleString('en-GB'); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim(); }
function longDate(iso) { const d = iso ? new Date(iso) : new Date(); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }

/* ── the agreement, rendered from the row (canonical text → SHA-256) ──────── */
export function agreementText(d) {
  const tier = d.founding ? 'founding' : 'standard';
  const fee = Number(d.retainer) || TERMS[tier];
  const step = TERMS.step, trig = Math.round((TERMS.trigger - 1) * 100);
  const brand = d.business || 'the Client', founder = d.founder || 'the Client', start = d.startDate ? longDate(d.startDate) : 'the date this Agreement is signed';
  const L = [];
  L.push(`SERVICES AGREEMENT`);
  L.push(`Between KaizenEvol ("the Agency") and ${brand} ("the Client"), signed for the Client by ${founder}.`);
  L.push(`Version 2026-09-06 · Canon FIN-PRI-004, MKT-SOL-001`);
  L.push(``);
  L.push(`RECITALS`);
  L.push(`WHEREAS the Agency runs content, paid advertising, email and SMS, and growth measurement for creative brands and artists; and WHEREAS the Client wishes to engage the Agency for those services on the terms below; NOW THEREFORE the parties agree as follows.`);
  L.push(``);
  L.push(`1. SERVICES — THE FOUR THINGS`);
  L.push(`1.1 Content and creative social: planned against the Client's drop calendar and produced and published by the Agency. The Client's aesthetic and creative direction remain the Client's; the Agency supplies the volume and the schedule.`);
  L.push(`1.2 Paid advertising: run against the Client's gross profit, not platform-reported return. A budget ceiling is agreed off the Client's margin before any spend so the Client never spends past what the product supports.`);
  L.push(`1.3 Email and SMS: the owned list, so each drop opens to people who already want it.`);
  L.push(`1.4 Growth management: sell-through per drop, revenue per send and cost per purchase against margin, reported to the Client. The Client sees the same numbers the Agency does.`);
  L.push(`1.5 Drop one is measurement. From drop two the Agency scales against a sell-through target set with the Client in writing, off the Client's own baseline. No outcome is guaranteed and no refund attaches to any result.`);
  L.push(``);
  L.push(`2. FEES`);
  L.push(`2.1 The retainer is ${gbp(fee)} per month${d.founding ? ' (founding rate, one of the first five clients)' : ' (standard rate)'}, covering all four services in clause 1. It is billed monthly in advance by card through Stripe, starting on ${start}.`);
  L.push(`2.2 Advertising spend is paid by the Client directly to the advertising platforms and is not part of the retainer.`);
  L.push(`2.3 Fees are exclusive of VAT, which is added if and when the Agency is registered for it.`);
  L.push(``);
  L.push(`3. THE GROWTH STEP`);
  L.push(`3.1 Baseline: the Client's trailing three-month average monthly revenue at signing, agreed in writing before any spend. One number.`);
  L.push(`3.2 Each time the Client's trailing three-month average monthly revenue is at least ${trig}% above the level that set the previous step (the baseline for the first step), the retainer rises by ${gbp(step)} per month permanently and the Client pays a one-off bonus equal to one month at the new rate. Each subsequent step is measured from the level that triggered the previous one. There is no cap.`);
  L.push(`3.3 The step is measured on the Client's total revenue as shown by the Client's own store and payment records; there is no attribution argument.`);
  L.push(`3.4 Where the Client has fewer than three full trading months at signing, no baseline exists and clause 3 does not apply until three consecutive trading months are on record.`);
  L.push(``);
  L.push(`4. REVENUE ACCESS`);
  L.push(`4.1 Revenue access at signing is a precondition of clause 3: the Client gives the Agency read access to its store and payment records sufficient to agree the baseline and verify each step. Without it, the retainer applies and clause 3 does not.`);
  L.push(``);
  L.push(`5. WHAT THE CLIENT PROVIDES`);
  L.push(`5.1 Access to the Client's Meta Business Manager and pixel, store platform and email/SMS platform; product and footage the Agency can shoot or edit; timely approvals; and the drop calendar.`);
  L.push(`5.2 The Client warrants that it owns or is licensed to use everything it supplies and that its products, pricing and claims are lawful.`);
  L.push(``);
  L.push(`6. TERM AND ENDING`);
  L.push(`6.1 This Agreement runs month to month from ${start}.`);
  L.push(`6.2 Either party may end it by written notice before the next billing date; it ends at the end of the month already paid for.`);
  L.push(`6.3 Ending does not affect rights already accrued: fees already due remain payable, and any growth-step bonus earned before ending remains payable once verified.`);
  L.push(``);
  L.push(`7. OWNERSHIP`);
  L.push(`7.1 The Client's brand, marks, products and audience are the Client's. Content the Agency produces for the Client under this Agreement belongs to the Client once the month it was produced in has been paid for.`);
  L.push(`7.2 The Agency may describe the work and its results to prospective clients only with the Client's written permission to be named, and the Agency will never present its own brands as client results without saying they are its own.`);
  L.push(``);
  L.push(`8. DATA PROTECTION`);
  L.push(`8.1 Where the Agency processes personal data of the Client's customers (for example to send email or SMS), the Client is the controller and the Agency the processor under the UK GDPR and the Data Protection Act 2018. The Agency processes only on the Client's instructions, keeps it confidential and secure, and deletes or returns it when this Agreement ends.`);
  L.push(``);
  L.push(`9. LIABILITY`);
  L.push(`9.1 Neither party excludes liability for death, personal injury or fraud. Otherwise the Agency's total liability under this Agreement is limited to the fees paid by the Client in the three months before the claim arose, and neither party is liable to the other for loss of profit or indirect loss.`);
  L.push(``);
  L.push(`10. CONFIDENTIALITY`);
  L.push(`10.1 Each party keeps the other's non-public information confidential, uses it only for this Agreement, and returns or destroys it on request when this Agreement ends. Nothing prevents disclosure required by law.`);
  L.push(``);
  L.push(`11. GENERAL`);
  L.push(`11.1 This Agreement is governed by the law of England and Wales and its courts have exclusive jurisdiction. 11.2 It is the entire agreement between the parties on its subject. 11.3 It may be signed electronically, and an electronic signature has the same effect as a handwritten one.`);
  return L.join('\n');
}
export function agreementHash(text) { return createHash('sha256').update(text, 'utf8').digest('hex'); }

function payUrl(row) {
  const d = row.data || {};
  const base = d.payLink || PAY_LINKS[d.founding ? 'founding' : 'standard'];
  if (!base) return '';
  const u = new URL(base);
  u.searchParams.set('client_reference_id', row.id);
  if (d.email) u.searchParams.set('prefilled_email', d.email);
  return u.toString();
}

function publicView(row) {
  const d = row.data || {};
  const text = agreementText(d);
  const sig = d.signature ? { name: d.signature.name, at: d.signature.at, hash: d.signature.hash } : null;
  const tier = d.founding ? 'founding' : 'standard';
  return {
    token: row.id, status: row.status,
    business: d.business || '', founder: d.founder || '', email: d.email || '', segment: d.segment || '',
    founding: !!d.founding, retainer: Number(d.retainer) || TERMS[tier], step: TERMS.step, trigger: TERMS.trigger,
    startDate: d.startDate || '', notes: d.proposalNotes || '', drops: d.drops || '',
    agreement: text, agreementHash: agreementHash(text), signature: sig,
    payUrl: payUrl(row), paidAt: row.paid_at || null, signedAt: row.signed_at || null
  };
}

/* ── Resend ──────────────────────────────────────────────────────────────── */
async function sendMail(to, subject, text) {
  const key = process.env.RESEND_API_KEY; if (!key) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'KaizenEvol <noreply@mail.kaizenevol.com>', to: Array.isArray(to) ? to : [to], reply_to: 'rahaid@kaizenevol.com', subject, text })
    });
    return r.ok;
  } catch (e) { return false; }
}

/* ── Stripe: has this token paid? (needs STRIPE_SECRET_KEY — a restricted key with read on
   Checkout Sessions is enough; no webhook to configure) ──────────────────── */
async function stripePaid(token) {
  const key = process.env.STRIPE_SECRET_KEY; if (!key) return { checked: false };
  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions?limit=100&expand[]=data.subscription', { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) return { checked: false, error: 'stripe ' + r.status };
    const j = await r.json();
    const hit = (j.data || []).find(s => s.client_reference_id === token && (s.payment_status === 'paid' || s.status === 'complete'));
    if (!hit) return { checked: true, paid: false };
    return { checked: true, paid: true, session: hit.id, customer: hit.customer || '', subscription: (hit.subscription && hit.subscription.id) || hit.subscription || '', email: (hit.customer_details && hit.customer_details.email) || '' };
  } catch (e) { return { checked: false, error: e.message }; }
}

/* ── after payment: the client space. Writes the client into the CRM's ke_data and moves the
   lead to Won in ke_leads, both through the service role. The CRM's realtime subscription
   picks both up. ───────────────────────────────────────────────────────────── */
async function provisionClient(row, stripe) {
  const d = row.data || {};
  const dataRow = await appRow('ke_data');
  if (dataRow) {
    const data = dataRow.data || {};
    data.clients = Array.isArray(data.clients) ? data.clients : [];
    const exists = data.clients.find(c => (c.onboardingToken === row.id) || (c.name || '').toLowerCase() === (d.business || '').toLowerCase());
    if (!exists) {
      data.clients.push({
        id: 'c_' + row.id.slice(0, 8), name: d.business || 'New client', status: 'active',
        terms: d.founding ? 'Founding £1,000/mo' : 'Standard £2,000/mo', adSpend: 'per drop',
        retainerValue: Number(d.retainer) || TERMS[d.founding ? 'founding' : 'standard'], founding: !!d.founding,
        baselineRevenue: Number(d.baselineRevenue) || 0, liveDate: '', founder: d.founder || '', email: d.email || '', segment: d.segment || '',
        onboardingToken: row.id, stripeCustomer: stripe.customer || '', stripeSubscription: stripe.subscription || '', signedAt: row.signed_at || null, paidAt: new Date().toISOString()
      });
      data.clientTasks = data.clientTasks || {};
      data.clientTasks['c_' + row.id.slice(0, 8)] = { ob2: true, ob3: true, ob4: true };
      await appWrite('ke_data', data);
    }
  }
  if (row.lead_id) {
    const leadsRow = await appRow('ke_leads');
    if (leadsRow && Array.isArray(leadsRow.data)) {
      const arr = leadsRow.data; const l = arr.find(x => x.id === row.lead_id);
      if (l && l.stage !== 'won') { l.stage = 'won'; l.updatedAt = Date.now(); l.nextStep = 'Onboarding paid — set the go-live date'; await appWrite('ke_leads', arr); }
    }
  }
}

/* ── CRM auth for op=send: the bearer is the CRM's Supabase session JWT ─────── */
async function crmUser(req) {
  const auth = String(req.headers.authorization || ''); if (!auth.startsWith('Bearer ')) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth } });
    if (!r.ok) return null; const u = await r.json(); return u && u.id ? u : null;
  } catch (e) { return null; }
}

/* ── handler ─────────────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const op = String(req.query.op || '');
  const token = String(req.query.t || (req.body && req.body.t) || '');
  if (!serviceKey()) return res.status(500).json({ error: 'Server is not configured (SUPABASE_SERVICE_ROLE_KEY).' });
  if (!validToken(token)) return res.status(400).json({ error: 'Bad link.' });

  let row;
  try { row = await rowByToken(token); } catch (e) { return res.status(502).json({ error: 'Database unavailable.' }); }
  if (!row) return res.status(404).json({ error: 'This link is not valid any more.' });

  try {
    if (op === 'get' && req.method === 'GET') {
      if (!row.viewed_at) row = await patchRow(token, { viewed_at: new Date().toISOString(), status: row.status === 'sent' ? 'viewed' : row.status });
      return res.status(200).json(publicView(row));
    }

    if (op === 'sign' && req.method === 'POST') {
      if (row.status === 'signed' || row.status === 'paid' || row.status === 'live') return res.status(200).json(publicView(row));
      const b = req.body || {};
      const name = String(b.name || '').trim().slice(0, 120);
      const image = String(b.image || '');
      if (!name || name.length < 2) return res.status(400).json({ error: 'Type your full name.' });
      if (b.agreed !== true) return res.status(400).json({ error: 'Tick the box to confirm you have read the agreement.' });
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]{200,}$/.test(image) || image.length > 200000) return res.status(400).json({ error: 'Draw your signature.' });
      const text = agreementText(row.data || {});
      const hash = agreementHash(text);
      if (b.hash && b.hash !== hash) return res.status(409).json({ error: 'The agreement changed while you were reading it. Reload and read it again.' });
      const signature = { name, image, at: new Date().toISOString(), ip: clientIp(req), ua: String(req.headers['user-agent'] || '').slice(0, 300), hash, text };
      const data = { ...(row.data || {}), signature };
      row = await patchRow(token, { data, status: 'signed', signed_at: signature.at });
      const view = publicView(row);
      const link = `${SITE}/onboard?t=${token}`;
      await sendMail('rahaid@kaizenevol.com', `Signed: ${view.business} (${name})`, `${view.business} signed the services agreement.\n\nSigned by: ${name}\nAt: ${signature.at}\nIP: ${signature.ip}\nAgreement hash: ${hash}\n\nFunnel: ${link}\nNext: they are on the payment step. Check the CRM lead for status.`);
      if (view.email) await sendMail(view.email, `Your signed agreement with KaizenEvol`, `Hi ${view.founder || name},\n\nThank you — the services agreement for ${view.business} is signed (${signature.at}). A copy is below and your link stays live: ${link}\n\nThe last step is setting up the monthly retainer, which the same link takes you to.\n\nRahaid\nKaizenEvol\n\n----------------\n\n${text}\n\nSigned by ${name} on ${signature.at}. Agreement hash (SHA-256): ${hash}`);
      return res.status(200).json(view);
    }

    if (op === 'status' && req.method === 'GET') {
      if (row.status === 'signed') {
        const s = await stripePaid(token);
        if (s.paid) {
          const data = { ...(row.data || {}), stripe: { session: s.session, customer: s.customer, subscription: s.subscription, email: s.email } };
          row = await patchRow(token, { data, status: 'paid', paid_at: new Date().toISOString() });
          await provisionClient(row, s);
          const view = publicView(row);
          await sendMail('rahaid@kaizenevol.com', `Paid: ${view.business} — client space created`, `${view.business} has paid the first month. They are now a client in the CRM (Clients tab) and the lead is Won.\n\nNext: set the go-live date, agree the baseline in writing, grant access.`);
          return res.status(200).json({ ...view, stripeChecked: true });
        }
        return res.status(200).json({ ...publicView(row), stripeChecked: !!s.checked, stripeError: s.error || null });
      }
      return res.status(200).json(publicView(row));
    }

    if (op === 'send' && req.method === 'POST') {
      const user = await crmUser(req); if (!user) return res.status(401).json({ error: 'Sign in to the CRM first.' });
      const view = publicView(row); if (!view.email) return res.status(400).json({ error: 'No email on this funnel.' });
      const link = `${SITE}/onboard?t=${token}`;
      const ok = await sendMail(view.email, `${view.business} × KaizenEvol — your proposal`, `Hi ${view.founder || 'there'},\n\nHere is your proposal, the agreement to sign, and the retainer set-up, all on one link:\n\n${link}\n\nIt takes about ten minutes. Reply to this email with any question.\n\nRahaid\nKaizenEvol`);
      if (ok && row.status === 'draft') row = await patchRow(token, { status: 'sent' });
      return res.status(ok ? 200 : 502).json(ok ? { sent: true, link } : { error: 'Email did not send (RESEND_API_KEY?). Copy the link and send it yourself.', link });
    }

    return res.status(400).json({ error: 'Unknown op.' });
  } catch (e) {
    console.error('onboard:', e);
    return res.status(500).json({ error: 'Something went wrong on our side. Try again in a minute.' });
  }
}

export function newToken() { return randomBytes(24).toString('base64url'); }
