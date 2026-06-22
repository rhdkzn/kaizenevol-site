export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.HUNTER_API_KEY;
  if (!key) {
    return res.status(200).json({ email: '' });
  }

  const { website } = req.body;
  if (!website) {
    return res.status(200).json({ email: '' });
  }

  let domain;
  try {
    domain = new URL(website.startsWith('http') ? website : 'https://' + website).hostname.replace(/^www\./, '');
  } catch {
    return res.status(200).json({ email: '' });
  }

  try {
    const resp = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${key}&limit=5`
    );
    if (!resp.ok) return res.status(200).json({ email: '' });

    const d = await resp.json();
    const emails = (d.data?.emails || []).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    const best = emails[0]?.value || '';

    return res.status(200).json({ email: best });
  } catch (e) {
    return res.status(200).json({ email: '' });
  }
}
