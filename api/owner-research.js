// Owner research — thin server-side proxy to the engine.
//
// The engine lives once (rahaid-crm /api/owner) so there is a single set of prompts
// and a single place where the confidence rubric is decided. This forwards to it from
// the server, which keeps the browser same-origin (no CORS) and keeps the shared PIN
// out of any page a visitor can read.
//
// It deliberately does nothing clever. Every decision that matters — what to search,
// what to refuse, how to score, and the fact that nothing it returns is ever dialable
// — belongs to the engine, and duplicating any of it here is how the two halves drift.

const ENGINE = process.env.OWNER_ENGINE_URL || 'https://rahaid-crm.vercel.app/api/owner';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Internal endpoint — only our own site may call it. Same gate as enrich-email.js:
  // this spends Serper and Groq quota, so an open door is a bill.
  const ALLOWED = (process.env.ALLOWED_ORIGINS || 'https://kaizenevol.com,https://www.kaizenevol.com')
    .split(',').map((s) => s.trim());
  const origin = req.headers.origin || '';
  if (!(ALLOWED.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin))) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  const pin = process.env.LAW_WEB_PIN || process.env.LAW_PASSCODE;
  if (!pin) {
    return res.status(200).json({
      ok: false, error: 'no-pin',
      detail: 'Set LAW_WEB_PIN in this project’s env so the CRM can reach the research engine.'
    });
  }

  const { business, city, niche, publicPhone, deadNumbers } = req.body || {};
  if (!business) return res.status(200).json({ ok: false, error: 'no-business' });

  try {
    const r = await fetch(ENGINE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-law-pin': pin },
      body: JSON.stringify({ business, city, niche, publicPhone, deadNumbers })
    });
    if (!r.ok) {
      return res.status(200).json({ ok: false, error: 'engine', detail: `Research engine returned ${r.status}` });
    }
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'engine-unreachable', detail: String(e && e.message ? e.message : e) });
  }
}
