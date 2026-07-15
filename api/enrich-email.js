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

  // Homepage HTML is fetched anyway for the email — assess site quality from the
  // same bytes (no extra request). Static heuristic only: it reads the markup a
  // browser downloads, so it can't judge a JS-rendered look — but 90s markup and
  // a missing mobile viewport are the two things that actually mark a trade site
  // as a revamp candidate, and both are visible in raw HTML. Buckets match the
  // CRM's Website Quality dropdown: ugly / ok / modern.
  let quality = '';
  let qualityReason = '';

  for (let i = 0; i < pagesToTry.length; i++) {
    const page = pagesToTry[i];
    try {
      const resp = await fetch(page, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; emailfinder/1.0)' },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) continue;

      const html = await resp.text();

      // Assess quality from the homepage (first page) only, once.
      if (i === 0 && !quality) {
        const q = assessQuality(html);
        quality = q.quality;
        qualityReason = q.reason;
      }

      // mailto: links first — highest confidence
      const mailtoMatches = [...html.matchAll(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g)]
        .map(m => m[1])
        .filter(e => !SKIP.test(e));

      if (mailtoMatches.length) {
        return res.status(200).json({ email: mailtoMatches[0], quality, qualityReason });
      }

      // Fallback: raw email pattern in HTML
      const rawMatches = [...html.matchAll(EMAIL_RE)]
        .map(m => m[0])
        .filter(e => !SKIP.test(e));

      if (rawMatches.length) {
        return res.status(200).json({ email: rawMatches[0], quality, qualityReason });
      }
    } catch {
      continue;
    }
  }

  return res.status(200).json({ email: '', quality, qualityReason });
}

/**
 * Static site-quality heuristic from raw homepage HTML — no browser, no JS render.
 * Returns { quality: 'ugly'|'ok'|'modern'|'', reason }. Honest by design: it only
 * flags what raw markup can prove. Missing mobile viewport + legacy markup are the
 * real revamp tells for a tradesperson's site; template builders (Wix/GoDaddy) are
 * mobile-friendly and functional, so they land 'ok', not 'ugly'.
 */
function assessQuality(html) {
  if (!html || html.length < 400) {
    return { quality: '', reason: 'too little HTML to judge' };
  }
  const h = html.toLowerCase();

  // Hard "ugly" tells — 90s/2000s markup or an unfinished site.
  const legacy = [];
  if (/<font[\s>]/.test(h)) legacy.push('<font> tags');
  if (/<center[\s>]/.test(h)) legacy.push('<center>');
  if (/<marquee/.test(h)) legacy.push('<marquee>');
  if (/\bbgcolor\s*=/.test(h)) legacy.push('bgcolor attributes');
  if (/name=["']generator["'][^>]*frontpage|microsoft frontpage/.test(h)) legacy.push('FrontPage');
  const underConstruction = /under construction|coming soon|site is being (built|updated)/.test(h);

  const hasViewport = /<meta[^>]+name=["']viewport["']/.test(h);

  // "Modern" positive signals.
  let modern = 0;
  const modernBits = [];
  if (hasViewport) { modern++; }
  if (/react|__next|vue|svelte|nuxt|gatsby/.test(h)) { modern++; modernBits.push('JS framework'); }
  if (/tailwind|bootstrap|font-awesome/.test(h)) { modern++; modernBits.push('modern CSS'); }
  if (/property=["']og:/.test(h)) { modern++; modernBits.push('Open Graph'); }
  if (/application\/ld\+json/.test(h)) { modern++; modernBits.push('structured data'); }
  if (/@media|min-width|max-width/.test(h)) { modern++; modernBits.push('responsive CSS'); }
  if (/wix\.com|squarespace|godaddy|weebly|wordpress|elementor/.test(h)) { modernBits.push('site builder'); }

  // Decide, worst signal wins.
  if (legacy.length || underConstruction || !hasViewport) {
    const reasons = [];
    if (!hasViewport) reasons.push('no mobile viewport');
    if (underConstruction) reasons.push('under construction');
    if (legacy.length) reasons.push('legacy markup: ' + legacy.join(', '));
    return { quality: 'ugly', reason: reasons.join('; ') };
  }
  if (modern >= 3) {
    return { quality: 'modern', reason: 'responsive + ' + (modernBits.join(', ') || 'modern markup') };
  }
  return { quality: 'ok', reason: 'mobile-friendly' + (modernBits.length ? ', ' + modernBits.join(', ') : ', basic markup') };
}
