export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Internal endpoint — only our own site may call it (protects your paid Places quota).
  const ALLOWED = (process.env.ALLOWED_ORIGINS || 'https://kaizenevol.com,https://www.kaizenevol.com')
    .split(',').map((s) => s.trim());
  const origin = req.headers.origin || '';
  if (!(ALLOWED.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Places API not configured' });
  }

  const { niche, area } = req.body;
  if (!niche || !area) {
    return res.status(400).json({ error: 'Missing niche or area' });
  }

  // Places returns up to 20 results per page. Without pagination the scanner
  // only ever sees the same top 20 per area, so re-scans are all duplicates and
  // add 0 new leads. Walk up to MAX_PAGES via nextPageToken to reach the tail.
  const MAX_PAGES = 3;

  try {
    const out = [];
    const seen = new Set();
    let pageToken = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      const body = {
        textQuery: niche + ' in ' + area + ' UK',
        regionCode: 'GB',
        languageCode: 'en-GB',
        maxResultCount: 20,
      };
      // Subsequent pages must repeat the same query params plus the token.
      if (pageToken) body.pageToken = pageToken;

      const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          // nextPageToken must be in the field mask to be returned.
          'X-Goog-FieldMask': 'nextPageToken,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount',
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        // If earlier pages already returned results, hand those back rather than
        // failing the whole scan on a later-page hiccup.
        if (out.length) break;
        return res.status(resp.status).json({ error: e.error?.message || 'Places API error' });
      }

      const d = await resp.json();
      for (const p of (d.places || [])) {
        const name = p.displayName?.text || '';
        if (!name) continue;
        const dupeKey = name.toLowerCase();
        if (seen.has(dupeKey)) continue;
        seen.add(dupeKey);
        out.push({
          name,
          phone: p.nationalPhoneNumber || '',
          website: p.websiteUri || '',
          address: p.formattedAddress || '',
          rating: parseFloat(p.rating) || 0,
          reviews: parseInt(p.userRatingCount) || 0,
        });
      }

      pageToken = d.nextPageToken || null;
      if (!pageToken) break;
    }

    return res.status(200).json({ places: out });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
