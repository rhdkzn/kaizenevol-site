/* /api/funnel-event — where people give up.
 *
 * One row per step reached, written by funnel-engine.js. It holds NO answer content and
 * no contact details: which funnel, which step, an anonymous per-visit id, and the ad
 * that brought them. Lead content already has a home (/api/submit-lead → ke_inbound) and
 * duplicating it here would widen our processor surface for nothing.
 *
 * Fire-and-forget by design. If this endpoint is down, the funnel still works — telemetry
 * must never be able to cost us a lead.
 */
const SUPABASE_URL = 'https://otxinjuuflyfsoltodam.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90eGluanV1Zmx5ZnNvbHRvZGFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzczNDQsImV4cCI6MjA5NjM1MzM0NH0.SCe8QMGFe8TnjKMOOp7fHAMsCGUIsf5Sbdtjf0XyAA4';

const EVENTS = ['view', 'advance', 'back', 'submit', 'complete'];
const ATTR_KEYS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content',
                   'gclid','fbclid','ttclid','msclkid','landing','referrer'];

const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const b = req.body || {};
  const funnel = str(b.funnel, 40);
  const event = str(b.event, 12);
  const session = str(b.session, 40);

  /* Validate rather than trust: this is a public endpoint whose whole job is to accept
     writes, so the shape is whitelisted and anything unexpected is dropped quietly. */
  if (!funnel || !/^[a-z0-9-]{1,40}$/.test(funnel)) return res.status(400).json({ error: 'bad funnel' });
  if (!EVENTS.includes(event)) return res.status(400).json({ error: 'bad event' });
  if (!session || !/^[A-Za-z0-9_-]{6,40}$/.test(session)) return res.status(400).json({ error: 'bad session' });

  let attribution = null;
  const raw = (b.attribution && typeof b.attribution === 'object') ? b.attribution : null;
  if (raw) {
    attribution = {};
    for (const k of ATTR_KEYS) if (typeof raw[k] === 'string' && raw[k]) attribution[k] = raw[k].slice(0, 300);
    if (!Object.keys(attribution).length) attribution = null;
  }

  const row = {
    funnel,
    event,
    step_key: str(b.stepKey, 40) || null,
    step_index: Number.isInteger(b.stepIndex) ? b.stepIndex : null,
    total_steps: Number.isInteger(b.totalSteps) ? b.totalSteps : null,
    session,
    attribution,
  };

  /* Anon may INSERT and may not SELECT (RLS, ke_funnel_events). The service-role key is
     used when present for consistency with the other routes, but is NOT required here —
     which is the point: telemetry should not depend on an env var being set. */
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ke_funnel_events`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return res.status(502).json({ error: 'store failed', detail: t.slice(0, 200) });
    }
  } catch (e) {
    return res.status(502).json({ error: 'store failed' });
  }
  return res.status(204).end();
}
