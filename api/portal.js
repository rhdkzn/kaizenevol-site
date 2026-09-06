/* /api/portal — the client portal's one server-side job: the invitation email (2026-09-06).
 *
 *   POST /api/portal?op=invite   (CRM only — bearer = the CRM's Supabase session JWT)
 *        { email, clientName }  → emails the portal link. The CRM has already written the
 *        ke_portal_users row (staff policy), so this only sends mail.
 *
 * Sign-in itself is Supabase's magic link, requested by the client on /portal — nothing
 * here touches auth. No service-role key.
 */
const SUPABASE_URL = 'https://otxinjuuflyfsoltodam.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90eGluanV1Zmx5ZnNvbHRvZGFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzczNDQsImV4cCI6MjA5NjM1MzM0NH0.SCe8QMGFe8TnjKMOOp7fHAMsCGUIsf5Sbdtjf0XyAA4';
const SITE = 'https://kaizenevol.com';

async function crmUser(req) {
  const auth = String(req.headers.authorization || ''); if (!auth.startsWith('Bearer ')) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth } });
    if (!r.ok) return null; const u = await r.json(); return u && u.id ? u : null;
  } catch (e) { return null; }
}
async function sendMail(to, subject, text) {
  const key = process.env.RESEND_API_KEY; if (!key) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'KaizenEvol <noreply@mail.kaizenevol.com>', to: [to], reply_to: 'rahaid@kaizenevol.com', subject, text })
    });
    return r.ok;
  } catch (e) { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const op = String(req.query.op || '');
  if (op !== 'invite' || req.method !== 'POST') return res.status(400).json({ error: 'Unknown op.' });
  const user = await crmUser(req); if (!user) return res.status(401).json({ error: 'Sign in to the CRM first.' });
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const clientName = String(b.clientName || '').trim().slice(0, 120);
  const founder = String(b.founder || '').trim().split(' ')[0];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'A real email is needed.' });
  const link = `${SITE}/portal`;
  const ok = await sendMail(email, `Your ${clientName || 'KaizenEvol'} client space`, `Hi ${founder || 'there'},\n\nYour client space with KaizenEvol is ready. It has your numbers, the drop calendar, where we are on the checklist, and updates from us.\n\n${link}\n\nSign in with this email address — we send a link, no password. Anything you write in there lands with us and we reply by email.\n\nRahaid\nKaizenEvol`);
  return res.status(ok ? 200 : 502).json(ok ? { sent: true, link } : { error: 'Email did not send (RESEND_API_KEY?). Send them the link yourself: ' + link, link });
}
