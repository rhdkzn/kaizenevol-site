/* Is this an online brand, and is it big enough to be worth a call?
 *
 * The Lead Finder used to answer that with a Google rating and a review count,
 * which are signals about a SHOPFRONT. A brand that sells online has neither, so
 * every DTC lead scored 1-2 and the finder was quietly pointed at the wrong kind
 * of business (Rahaid, 2026-09-20: make the finder default to brand owners).
 *
 * NO NEW SECRET, DELIBERATELY. The project's environment variables are not
 * readable from here, so a route that needed a new key could not be verified as
 * configured, only hoped at. Shopify's /products.json is PUBLIC on every store
 * that has not switched it off - no key, no auth, no quota - and it answers the
 * two questions the five ICP gates actually need:
 *   - SKU count        -> is there a real catalogue, or six tees and a dream
 *   - oldest published -> months trading, the 12-month gate, read off the data
 * Everything else falls back to reading the homepage for a platform fingerprint.
 *
 * WHAT IT DOES NOT CLAIM. It cannot see revenue, repeat buyers, capacity or ad
 * spend. Those stay UNKNOWN and the call fills them in - fitOf() already treats
 * unknown as unknown rather than as a fail, so a half-answer here never scores a
 * brand out. A check that cannot establish something says so (verification.md).
 */

const UA = 'Mozilla/5.0 (compatible; KaizenEvolLeadFinder/1.0; +https://kaizenevol.com)';
const TIMEOUT_MS = 8000;

async function get(url, accept) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: accept || '*/*' },
    });
  } finally {
    clearTimeout(t);
  }
}

/* Fingerprints read off the served HTML. Ordered: the first match wins, and
   Shopify is checked first because a Shopify store that has products.json turned
   off still serves its CDN on every image. */
const PLATFORMS = [
  ['shopify', /cdn\.shopify\.com|myshopify\.com|Shopify\.theme/i],
  ['woocommerce', /woocommerce|wp-content\/plugins\/woocommerce/i],
  ['squarespace', /squarespace\.com|static1\.squarespace/i],
  ['bigcartel', /bigcartel\.com/i],
  ['wix', /wix\.com|wixstatic\.com/i],
  ['etsy', /etsy\.com/i],
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Internal endpoint — same origin lock as places-search.
  const ALLOWED = (process.env.ALLOWED_ORIGINS || 'https://kaizenevol.com,https://www.kaizenevol.com')
    .split(',').map((s) => s.trim());
  const origin = req.headers.origin || '';
  if (!(ALLOWED.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { website } = req.body || {};
  if (!website) return res.status(400).json({ error: 'Missing website' });

  let origin2;
  try {
    const u = new URL(/^https?:\/\//i.test(website) ? website : 'https://' + website);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('scheme');
    origin2 = u.origin;
  } catch {
    return res.status(400).json({ error: 'Unparseable website' });
  }

  /* platform/skus/monthsTrading start as null and mean NOT ESTABLISHED, never
     "no" — the caller must be able to tell a brand with 4 SKUs from a store we
     could not read. */
  const out = { platform: null, skus: null, monthsTrading: null, reason: '' };

  // 1. The Shopify catalogue, which answers both gate questions at once.
  try {
    const r = await get(origin2 + '/products.json?limit=250', 'application/json');
    if (r.ok && /application\/json/i.test(r.headers.get('content-type') || '')) {
      const j = await r.json();
      if (j && Array.isArray(j.products)) {
        out.platform = 'shopify';
        out.skus = j.products.length;
        const dates = j.products.map((p) => Date.parse(p.published_at || p.created_at || ''))
          .filter((n) => Number.isFinite(n));
        if (dates.length) {
          out.monthsTrading = Math.max(0, Math.round((Date.now() - Math.min(...dates)) / 2629800000));
        }
        // 250 is the page cap, so a full page means "at least 250", not exactly.
        out.reason = out.skus >= 250 ? '250+ products (page cap)' : out.skus + ' products';
        return res.status(200).json(out);
      }
    }
  } catch (e) {
    out.reason = 'catalogue unreachable: ' + (e.name === 'AbortError' ? 'timed out' : e.message);
  }

  // 2. No catalogue to read — fall back to a platform fingerprint off the homepage.
  try {
    const r = await get(origin2, 'text/html');
    if (!r.ok) {
      out.reason = out.reason || ('site returned ' + r.status);
      return res.status(200).json(out);
    }
    const html = (await r.text()).slice(0, 400000);
    for (const [name, re] of PLATFORMS) {
      if (re.test(html)) { out.platform = name; break; }
    }
    out.reason = out.platform
      ? out.platform + ' detected, catalogue not readable — SKU count unknown'
      : 'no store platform detected on the homepage';
  } catch (e) {
    out.reason = out.reason || ('site unreachable: ' + (e.name === 'AbortError' ? 'timed out' : e.message));
  }

  return res.status(200).json(out);
}
