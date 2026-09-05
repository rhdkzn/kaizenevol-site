export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let { contactName, businessName, email, phone, businessUrl, trade, monthlyBudget, message } = req.body || {};

  /* Which ad produced this lead. Sent by utm.js; absent on a direct visit.
     Whitelisted rather than spread, because this object arrives from a public
     endpoint and lands in the CRM's stored record. */
  const ATTR_KEYS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content',
                     'gclid','fbclid','ttclid','msclkid','landing','referrer'];
  const rawAttr = (req.body && typeof req.body.attribution === 'object' && req.body.attribution) || null;
  let attribution = null;
  if (rawAttr) {
    attribution = {};
    for (const k of ATTR_KEYS) {
      if (typeof rawAttr[k] === 'string' && rawAttr[k]) attribution[k] = rawAttr[k].slice(0, 300);
    }
    if (!Object.keys(attribution).length) attribution = null;
  }

  // Homepage one-pager posts { name, trade, contact, message } — contact is a phone OR an email.
  const { name, contact } = req.body || {};
  if (name && !businessName) {
    contactName = contactName || name;
    businessName = name;
    if (contact && contact.includes('@')) email = email || contact;
    else if (contact) phone = phone || contact;
  }

  if (!businessName || !((email && email.includes('@')) || phone)) {
    return res.status(400).json({ error: 'A name and a valid email or phone number are required.' });
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
    email: (email || '').trim().toLowerCase(),
    website: (businessUrl || '').trim(),
    phone: (phone || '').trim(),
    owner: (contactName || '').trim(),
    area: '',
    niche: (trade || '').trim(),
    source: 'Website',
    /* Additive: `source` keeps its existing value so nothing in the CRM changes
       behaviour. Campaign detail rides alongside it. */
    attribution,
    stage: 'new',
    score: 0,
    notes: [
      trade ? `Service: ${trade}` : '',
      monthlyBudget ? `Ad budget: ${monthlyBudget}` : '',
      message ? `Message: ${message.trim()}` : '',
      /* Also written into notes so it is readable wherever a lead is read,
         without the CRM needing to know the new field exists. */
      attribution && attribution.utm_source
        ? `Ad: ${[attribution.utm_source, attribution.utm_medium, attribution.utm_campaign].filter(Boolean).join(' / ')}`
        : '',
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
          `Email: ${(email || '').trim() || 'Not provided'}`,
          `Phone: ${phone || 'Not provided'}`,
          `Website: ${businessUrl || 'Not provided'}`,
          `Ad budget: ${monthlyBudget || 'Not specified'}`,
          message ? `\nMessage:\n${message.trim()}` : '',
          ``,
          `View in CRM: https://kaizenevol.com/crm.html`,
        ].join('\n'),
      }),
    }).catch(() => {});
  }

  return res.status(200).json({ ok: true });
}
