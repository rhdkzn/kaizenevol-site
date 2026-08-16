/* Funnel measurement endpoint — step-level drop-off on the multi-step lead forms.
   Written 2026-08-16 for MKT-FUN-002: nine pages were converted to
   one-question-at-a-time and none of it was instrumented, so "did it work?" had
   no answer. Submissions alone cannot tell you where people leave.

   Stores AGGREGATE COUNTERS, not an event log. A log of every step view would
   grow without bound and this row is read-modify-written on each hit; counters
   keyed by date and page stay small forever and answer the only question we
   actually have — of the people who saw step 1, how many reached step 2?

   Shape:
     ke_funnel_stats = {
       "2026-08-16": {
         "contact": { view: 12, step1: 12, step2: 5, step3: 3, submit: 2,
                      chips: { "KaizenReach (Ads)": 7 } }
       }
     }

   No personal data, no identifier, nothing stored on the device — see the
   matching note in script.js for why this is deliberately not consent-gated.

   Known and accepted: concurrent requests read-modify-write one row, so a
   simultaneous hit can drop a count. At our traffic that is noise, and the
   alternative (a counter table with atomic increments) is not worth the
   migration until the numbers are big enough for the loss to matter. */

const ALLOWED_EVENTS = new Set(['view', 'step', 'chip', 'submit']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // sendBeacon posts a Blob; depending on runtime this may arrive unparsed.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = null; }
  }
  const { page, event, value } = body || {};

  if (!page || !event || !ALLOWED_EVENTS.has(event)) {
    return res.status(400).json({ error: 'Bad event' });
  }

  // Bound everything that reaches storage — this endpoint is public.
  const safePage = String(page).replace(/[^a-z0-9._-]/gi, '').slice(0, 40) || 'unknown';
  const safeValue = String(value || '').slice(0, 60);

  const SUPABASE_URL = 'https://otxinjuuflyfsoltodam.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90eGluanV1Zmx5ZnNvbHRvZGFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzczNDQsImV4cCI6MjA5NjM1MzM0NH0.SCe8QMGFe8TnjKMOOp7fHAMsCGUIsf5Sbdtjf0XyAA4';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

  const sbHeaders = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  let stats = {};
  try {
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/app_data?id=eq.ke_funnel_stats&select=data`,
      { headers: sbHeaders }
    );
    const rows = await getRes.json();
    if (Array.isArray(rows) && rows[0]?.data && typeof rows[0].data === 'object') {
      stats = rows[0].data;
    }
  } catch (_) {
    // Non-fatal — start fresh rather than dropping the hit.
  }

  const day = new Date().toISOString().slice(0, 10);
  if (!stats[day]) stats[day] = {};
  if (!stats[day][safePage]) stats[day][safePage] = { view: 0, submit: 0, chips: {} };
  const bucket = stats[day][safePage];

  if (event === 'chip') {
    if (!bucket.chips) bucket.chips = {};
    if (safeValue) bucket.chips[safeValue] = (bucket.chips[safeValue] || 0) + 1;
  } else if (event === 'step') {
    const k = 'step' + (safeValue.replace(/\D/g, '').slice(0, 2) || '1');
    bucket[k] = (bucket[k] || 0) + 1;
  } else {
    bucket[event] = (bucket[event] || 0) + 1;
  }

  const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/app_data?on_conflict=id`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id: 'ke_funnel_stats',
      data: stats,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!upsertRes.ok) {
    const detail = await upsertRes.text();
    console.error('track-funnel upsert error:', upsertRes.status, detail);
    return res.status(500).json({ error: 'Failed to record' });
  }

  return res.status(204).end();
}
