// Instagram comment-to-DM automation ("SITE" gate on the Forge spec reel).
// Meta webhook (object: instagram, field: comments) -> if a comment matches a
// gate word, send the commenter a private reply (one per comment, Meta-enforced)
// and log them to the CRM. Setup runbook: KaizenEvol/forge/video/forge-spec-reel/DM-AUTOMATION.md
//
// Env vars (Vercel):
//   IG_VERIFY_TOKEN   — any string you choose; pasted into Meta's webhook config (GET verify)
//   IG_WEBHOOK_SECRET — any string you choose; appended to the callback URL as ?secret=...
//                       so only Meta (who has the full URL) can POST here
//   IG_PAGE_TOKEN     — long-lived Page access token (instagram_manage_messages + instagram_manage_comments)
//   IG_SELF_ID        — our own IG user id, so our replies never re-trigger the loop
//   IG_GATE_WORDS     — comma-separated gate words (default: SITE)
//   IG_DM_TEXT        — override the DM copy (optional)
//   IG_PUBLIC_REPLY   — "off" to skip the public "check your DMs" reply (default: on)

const GRAPH = 'https://graph.facebook.com/v23.0';

const DEFAULT_DM =
  'Good shout. To build yours we just need three things: your business name, your trade, and your area. ' +
  'Reply here with those and we’ll put your page together and send you the link. ' +
  'No fee, no contract. It’s yours either way.';

const DEFAULT_PUBLIC_REPLY = 'Sent you a DM.';

export default async function handler(req, res) {
  // --- Meta webhook verification handshake ---
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token && token === process.env.IG_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only Meta has the full callback URL (with ?secret=...), so this gates POSTs.
  if (!process.env.IG_WEBHOOK_SECRET || req.query.secret !== process.env.IG_WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const body = req.body || {};
  // Always 200 quickly — Meta retries non-200s and disables flaky webhooks.
  // Work happens before the return; failures are logged, never re-thrown.
  try {
    if (body.object !== 'instagram') return res.status(200).json({ ok: true });

    const gateWords = (process.env.IG_GATE_WORDS || 'SITE')
      .split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'comments') continue;
        const c = change.value || {};
        const commentId = c.id;
        const text = (c.text || '').toLowerCase();
        const fromId = c.from && c.from.id;
        const fromUser = (c.from && c.from.username) || '';

        if (!commentId || !fromId) continue;
        if (process.env.IG_SELF_ID && fromId === process.env.IG_SELF_ID) continue; // our own comments/replies
        const matched = gateWords.some((w) => new RegExp(`(^|\\W)${w}($|\\W)`, 'i').test(text));
        if (!matched) continue;

        const token = process.env.IG_PAGE_TOKEN;
        if (!token) {
          console.error('ig-webhook: IG_PAGE_TOKEN not set — comment seen but no DM sent', commentId);
          continue;
        }

        // Private reply to the comment (Meta allows exactly one per comment, within 7 days —
        // duplicate webhook deliveries therefore can't double-DM).
        const dm = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { comment_id: commentId },
            message: { text: process.env.IG_DM_TEXT || DEFAULT_DM },
          }),
        });
        const dmBody = await dm.json().catch(() => ({}));
        if (!dm.ok) console.error('ig-webhook: DM failed', commentId, JSON.stringify(dmBody));

        // Public nudge under their comment (social proof for the next scroller).
        if ((process.env.IG_PUBLIC_REPLY || 'on') !== 'off') {
          const pr = await fetch(`${GRAPH}/${commentId}/replies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: DEFAULT_PUBLIC_REPLY, access_token: token }),
          });
          if (!pr.ok) console.error('ig-webhook: public reply failed', commentId);
        }

        await logToCrm(fromUser, fromId, c.media && c.media.id);
      }
    }
  } catch (e) {
    console.error('ig-webhook: handler error', e && e.message);
  }
  return res.status(200).json({ ok: true });
}

// Same ke_leads store submit-lead.js writes to; dedupe by IG username so
// repeat commenters don't stack duplicate leads.
async function logToCrm(username, igId, mediaId) {
  try {
    const SUPABASE_URL = 'https://otxinjuuflyfsoltodam.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90eGluanV1Zmx5ZnNvbHRvZGFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzczNDQsImV4cCI6MjA5NjM1MzM0NH0.SCe8QMGFe8TnjKMOOp7fHAMsCGUIsf5Sbdtjf0XyAA4';
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    const sbHeaders = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    let leads = [];
    const getRes = await fetch(`${SUPABASE_URL}/rest/v1/app_data?id=eq.ke_leads&select=data`, { headers: sbHeaders });
    const bodyJson = await getRes.json();
    if (Array.isArray(bodyJson) && bodyJson[0]?.data && Array.isArray(bodyJson[0].data)) {
      leads = bodyJson[0].data;
    }

    const handle = username ? `@${username}` : `ig:${igId}`;
    if (leads.some((l) => l.business === handle || (l.notes || '').includes(`ig:${igId}`))) return;

    leads.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      business: handle,
      contactName: '',
      email: '',
      website: username ? `https://instagram.com/${username}` : '',
      phone: '',
      owner: '',
      area: '',
      niche: '',
      source: 'Instagram',
      stage: 'new',
      score: 0,
      notes: `Commented a gate word${mediaId ? ` on media ${mediaId}` : ''} (ig:${igId}). DM sent, awaiting business/trade/area.`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await fetch(`${SUPABASE_URL}/rest/v1/app_data?on_conflict=id`, {
      method: 'POST',
      headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: 'ke_leads', data: leads, updated_at: new Date().toISOString() }),
    });

    // Fire-and-forget email ping, same convention as submit-lead.js
    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (RESEND_KEY) {
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'KaizenEvol Site <noreply@mail.kaizenevol.com>',
          to: ['rahaid@kaizenevol.com'],
          subject: `IG gate comment: ${handle}`,
          text: `${handle} commented a gate word on Instagram. DM sent automatically; they've been added to the CRM. Watch the IG inbox for their business/trade/area reply.`,
        }),
      }).catch(() => {});
    }
  } catch (e) {
    console.error('ig-webhook: CRM log failed', e && e.message);
  }
}
