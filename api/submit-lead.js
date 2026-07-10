export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { contactName, businessName, email, phone, businessUrl, trade, monthlyBudget } = req.body || {};

  if (!businessName || !email || !email.includes('@')) {
    return res.status(400).json({ error: 'Business name and a valid email are required.' });
  }

  const SUPABASE_URL = 'https://otxinjuuflyfsoltodam.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90eGluanV1Zmx5ZnNvbHRvZGFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzczNDQsImV4cCI6MjA5NjM1MzM0NH0.SCe8QMGFe8TnjKMOOp7fHAMsCGUIsf5Sbdtjf0XyAA4';
  // Use the SERVICE ROLE key when present (set it in Vercel env BEFORE enabling RLS on app_data).
  // This lets the public lead form keep writing after the table is locked to authenticated users.
  // Falls back to the anon key so nothing breaks before the migration.
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

  const sbHeaders = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Read current leads array
  let leads = [];
  try {
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/app_data?id=eq.ke_leads&select=data`,
      { headers: sbHeaders }
    );
    const body = await getRes.json();
    if (Array.isArray(body) && body[0]?.data && Array.isArray(body[0].data)) {
      leads = body[0].data;
    }
  } catch (_) {
    // Non-fatal — start with empty array, don't block the submission
  }

  // Build lead matching CRM data structure
  const newLead = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    business: businessName.trim(),
    contactName: (contactName || '').trim(),
    email: email.trim().toLowerCase(),
    website: (businessUrl || '').trim(),
    phone: (phone || '').trim(),
    owner: (contactName || '').trim(),
    area: '',
    niche: (trade || '').trim(),
    source: 'Website',
    stage: 'new',
    score: 0,
    notes: [
      trade ? `Trade: ${trade}` : '',
      monthlyBudget ? `Ad budget: ${monthlyBudget}` : '',
    ].filter(Boolean).join(' · '),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  leads.push(newLead);

  // Upsert back to Supabase — ?on_conflict=id required for REST API (SDK adds this automatically)
  const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/app_data?on_conflict=id`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id: 'ke_leads',
      data: leads,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!upsertRes.ok) {
    const errText = await upsertRes.text();
    console.error('Supabase upsert error:', upsertRes.status, errText);
    return res.status(500).json({ error: 'Failed to save. Please email us directly.', detail: errText });
  }

  // Fire-and-forget email notification via Resend
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (RESEND_KEY) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'KaizenEvol Site <noreply@mail.kaizenevol.com>',
        to: ['rahaid@kaizenevol.com'],
        subject: `New inbound lead: ${businessName.trim()}${(contactName || '').trim() ? ` (${contactName.trim()})` : ''}`,
        text: [
          `New lead from the website.`,
          ``,
          `Contact: ${contactName ? contactName.trim() : 'Not provided'}`,
          `Business: ${businessName.trim()}`,
          `Trade: ${trade || 'Not specified'}`,
          `Email: ${email.trim()}`,
          `Phone: ${phone || 'Not provided'}`,
          `Website: ${businessUrl || 'Not provided'}`,
          `Ad budget: ${monthlyBudget || 'Not specified'}`,
          ``,
          `View in CRM: https://kaizenevol.com/crm.html`,
        ].join('\n'),
      }),
    }).catch(() => {});
  }

  return res.status(200).json({ ok: true });
}
