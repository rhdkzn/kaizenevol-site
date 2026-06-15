export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return res.status(200).json({ running_ads: false, ad_count: 0, ad_quality: 'unknown' });
  }

  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Missing name' });
  }

  try {
    const p = new URLSearchParams({
      search_terms: name,
      ad_type: 'ALL',
      fields: 'id,ad_creative_bodies,ad_creative_link_titles',
      limit: '5',
      access_token: token,
    });
    p.append('ad_reached_countries[]', 'GB');

    const resp = await fetch('https://graph.facebook.com/v19.0/ads_archive?' + p);
    const d = await resp.json();

    if (d.error || !d.data) {
      return res.status(200).json({ running_ads: false, ad_count: 0, ad_quality: 'unknown' });
    }

    const ads = d.data;
    if (!ads.length) {
      return res.status(200).json({ running_ads: false, ad_count: 0, ad_quality: 'none' });
    }

    const BAD = ['boost post', 'low quality', 'stock photo', 'blurry', 'no cta', 'call now', 'click here'];
    const GOOD = ['free quote', 'limited time', 'case study', 'before and after', 'guarantee', 'results'];

    let txt = '';
    for (const a of ads) {
      txt += ((a.ad_creative_bodies || []).join(' ') + ' ' + (a.ad_creative_link_titles || []).join(' ')).toLowerCase();
    }

    const bad = BAD.filter(s => txt.includes(s)).length;
    const good = GOOD.filter(s => txt.includes(s)).length;
    const quality = !txt ? 'low' : bad > good ? 'bad' : good > 0 ? 'decent' : 'low';

    return res.status(200).json({ running_ads: true, ad_count: ads.length, ad_quality: quality });
  } catch (e) {
    return res.status(200).json({ running_ads: false, ad_count: 0, ad_quality: 'unknown' });
  }
}
