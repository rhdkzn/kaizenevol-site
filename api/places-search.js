export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Places API not configured' });
  }

  const { niche, area } = req.body;
  if (!niche || !area) {
    return res.status(400).json({ error: 'Missing niche or area' });
  }

  try {
    const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount',
      },
      body: JSON.stringify({
        textQuery: niche + ' in ' + area + ' UK',
        regionCode: 'GB',
        languageCode: 'en-GB',
        maxResultCount: 20,
      }),
    });

    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      return res.status(resp.status).json({ error: e.error?.message || 'Places API error' });
    }

    const d = await resp.json();
    const places = (d.places || []).map(p => ({
      name: p.displayName?.text || '',
      phone: p.nationalPhoneNumber || '',
      website: p.websiteUri || '',
      address: p.formattedAddress || '',
      rating: parseFloat(p.rating) || 0,
      reviews: parseInt(p.userRatingCount) || 0,
    })).filter(p => p.name);

    return res.status(200).json({ places });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
