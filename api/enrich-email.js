export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Internal endpoint — only our own site may call it (prevents SSRF/quota abuse).
  const ALLOWED = (process.env.ALLOWED_ORIGINS || 'https://kaizenevol.com,https://www.kaizenevol.com')
    .split(',').map((s) => s.trim());
  const origin = req.headers.origin || '';
  if (!(ALLOWED.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { website } = req.body;
  if (!website) {
    return res.status(200).json({ email: '' });
  }

  let url;
  try {
    url = new URL(website.startsWith('http') ? website : 'https://' + website).href;
  } catch {
    return res.status(200).json({ email: '' });
  }

  // Pages most likely to have a visible email
  const pagesToTry = [url, url.replace(/\/$/, '') + '/contact', url.replace(/\/$/, '') + '/contact-us'];

  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  // Skip obviously non-contact addresses
  const SKIP = /noreply|no-reply|donotreply|example\.|sentry\.|privacy@|unsubscribe/i;

  for (const page of pagesToTry) {
    try {
      const resp = await fetch(page, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; emailfinder/1.0)' },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) continue;

      const html = await resp.text();

      // mailto: links first — highest confidence
      const mailtoMatches = [...html.matchAll(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g)]
        .map(m => m[1])
        .filter(e => !SKIP.test(e));

      if (mailtoMatches.length) {
        return res.status(200).json({ email: mailtoMatches[0] });
      }

      // Fallback: raw email pattern in HTML
      const rawMatches = [...html.matchAll(EMAIL_RE)]
        .map(m => m[0])
        .filter(e => !SKIP.test(e));

      if (rawMatches.length) {
        return res.status(200).json({ email: rawMatches[0] });
      }
    } catch {
      continue;
    }
  }

  return res.status(200).json({ email: '' });
}
