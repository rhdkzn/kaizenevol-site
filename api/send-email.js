export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Origin allowlist: internal endpoint, only our own site may call it.
  // Stops this being used as an open email relay. Add preview origins via ALLOWED_ORIGINS env.
  const ALLOWED = (process.env.ALLOWED_ORIGINS || 'https://kaizenevol.com,https://www.kaizenevol.com')
    .split(',').map((s) => s.trim());
  const origin = req.headers.origin || '';
  if (!(ALLOWED.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const { to, subject, text, from, reply_to } = req.body;
  if (!to || !subject || !text) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, text' });
  }

  // --- Lock the sender to our own domain. Never let a caller spoof an arbitrary From.
  const onOurDomain = (v) => typeof v === 'string' && /@([a-z0-9-]+\.)*kaizenevol\.com>?\s*$/i.test(v);
  const safeFrom = onOurDomain(from) ? from : 'KaizenEvol <noreply@mail.kaizenevol.com>';
  const safeReplyTo = onOurDomain(reply_to) ? reply_to : undefined;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: safeFrom, to: [to], subject, text, ...(safeReplyTo ? { reply_to: safeReplyTo } : {}) }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: data.message || 'Resend error' });
    }

    return res.status(200).json({ id: data.id });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
