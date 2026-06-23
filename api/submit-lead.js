export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { businessName, email, businessUrl, monthlyBudget } = req.body || {};

  if (!businessName || !email || !email.includes('@')) {
    return res.status(400).json({ error: 'Business name and a valid email are required.' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'CRM not configured.' });
  }

  const sbHeaders = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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
    name: businessName.trim(),
    email: email.trim().toLowerCase(),
    website: (businessUrl || '').trim(),
    phone: '',
    owner: '',
    area: '',
    source: 'Website',
    stage: 'new',
    score: 0,
    notes: monthlyBudget ? `Ad budget: ${monthlyBudget}` : '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  leads.push(newLead);

  // Upsert back to Supabase
  const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/app_data`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id: 'ke_leads',
      data: leads,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!upsertRes.ok) {
    const errText = await upsertRes.text();
    console.error('Supabase upsert error:', errText);
    return res.status(500).json({ error: 'Failed to save. Please email us directly.' });
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
        subject: `New inbound lead: ${businessName.trim()}`,
        text: [
          `New lead from the website.`,
          ``,
          `Business: ${businessName.trim()}`,
          `Email: ${email.trim()}`,
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
