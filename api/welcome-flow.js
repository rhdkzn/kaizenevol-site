// Welcome flow sender — advances inbound (source: Website) leads through the
// 5-email nurture sequence. Invoked by Vercel cron (see vercel.json).
// Suppression: any stage change past 'new' stops the flow; a reply lands at
// rahaid@kaizenevol.com and is handled by moving the lead's stage in the CRM.
import {
  buildWelcomeEmail,
  isWelcomeEligible,
  WELCOME_DELAYS,
  WELCOME_LAST_STEP,
  WELCOME_FROM,
  WELCOME_REPLY_TO,
} from './_welcome-emails.js';

const SUPABASE_URL = 'https://otxinjuuflyfsoltodam.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90eGluanV1Zmx5ZnNvbHRvZGFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzczNDQsImV4cCI6MjA5NjM1MzM0NH0.SCe8QMGFe8TnjKMOOp7fHAMsCGUIsf5Sbdtjf0XyAA4';
const MAX_SENDS_PER_RUN = 20;

function inSendWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'short', hour: 'numeric', hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const day = get('weekday');
  const hour = parseInt(get('hour'), 10);
  return day !== 'Sun' && hour >= 8 && hour < 19;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

  if (!inSendWindow()) {
    return res.status(200).json({ ok: true, skipped: 'outside send window (Mon-Sat 8am-7pm UK)' });
  }

  const sbHeaders = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  let leads = [];
  const getRes = await fetch(`${SUPABASE_URL}/rest/v1/app_data?id=eq.ke_leads&select=data`, { headers: sbHeaders });
  const body = await getRes.json();
  if (Array.isArray(body) && body[0]?.data && Array.isArray(body[0].data)) leads = body[0].data;
  if (!leads.length) return res.status(200).json({ ok: true, sent: 0, note: 'no leads' });

  const now = Date.now();
  let sent = 0;
  let changed = false;
  const results = [];

  for (const lead of leads) {
    if (lead.source !== 'Website' || !lead.welcome || lead.welcome.done) continue;

    // Booked, replied, or otherwise moved on — close the flow out.
    if (lead.stage !== 'new') {
      lead.welcome.done = true;
      lead.welcome.stoppedReason = `stage:${lead.stage}`;
      changed = true;
      continue;
    }

    if (!isWelcomeEligible(lead)) {
      lead.welcome.done = true;
      lead.welcome.stoppedReason = 'ineligible';
      changed = true;
      continue;
    }

    const step = lead.welcome.step || 0;
    if (step >= WELCOME_LAST_STEP) {
      lead.welcome.done = true;
      changed = true;
      continue;
    }

    const nextStep = step + 1;
    const delay = WELCOME_DELAYS[nextStep] ?? 0;
    const lastSentAt = lead.welcome.lastSentAt || lead.createdAt || 0;
    if (now - lastSentAt < delay) continue;
    if (sent >= MAX_SENDS_PER_RUN) break;

    const email = buildWelcomeEmail(nextStep, lead);
    if (!email) continue;

    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: WELCOME_FROM,
          reply_to: WELCOME_REPLY_TO,
          to: [lead.email.trim()],
          subject: email.subject,
          text: email.text,
        }),
      });
      if (!resp.ok) {
        results.push({ lead: lead.id, step: nextStep, error: resp.status });
        continue;
      }
      lead.welcome.step = nextStep;
      lead.welcome.lastSentAt = now;
      if (nextStep >= WELCOME_LAST_STEP) lead.welcome.done = true;
      lead.updatedAt = now;
      changed = true;
      sent++;
      results.push({ lead: lead.id, step: nextStep, ok: true });
    } catch (e) {
      results.push({ lead: lead.id, step: nextStep, error: 'send failed' });
    }
  }

  if (changed) {
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/app_data?on_conflict=id`, {
      method: 'POST',
      headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: 'ke_leads', data: leads, updated_at: new Date().toISOString() }),
    });
    if (!upsertRes.ok) {
      const errText = await upsertRes.text();
      console.error('Supabase upsert error:', upsertRes.status, errText);
      return res.status(500).json({ error: 'Sent emails but failed to save progress', sent, results });
    }
  }

  return res.status(200).json({ ok: true, sent, results });
}
