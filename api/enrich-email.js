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
    return res.status(200).json({ email: '', social: { ig: '', fb: '', x: '' } });
  }

  let url;
  try {
    url = new URL(website.startsWith('http') ? website : 'https://' + website).href;
  } catch {
    return res.status(200).json({ email: '', social: { ig: '', fb: '', x: '' } });
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
  let social = { ig: '', fb: '', x: '' };

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

      // Socials come out of the SAME bytes — no extra request, no extra latency.
      // Merged across pages because a trade site often puts the Instagram link in
      // the footer of /contact but not the homepage.
      const found = extractSocials(html);
      social = { ig: social.ig || found.ig, fb: social.fb || found.fb, x: social.x || found.x };

      // mailto: links first — highest confidence
      const mailtoMatches = [...html.matchAll(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g)]
        .map(m => m[1])
        .filter(e => !SKIP.test(e));

      if (mailtoMatches.length) {
        return res.status(200).json({ email: mailtoMatches[0], quality, qualityReason, social });
      }

      // Fallback: raw email pattern in HTML
      const rawMatches = [...html.matchAll(EMAIL_RE)]
        .map(m => m[0])
        .filter(e => !SKIP.test(e));

      if (rawMatches.length) {
        return res.status(200).json({ email: rawMatches[0], quality, qualityReason, social });
      }
    } catch {
      continue;
    }
  }

  return res.status(200).json({ email: '', quality, qualityReason, social });
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

/**
 * Pull Instagram / Facebook / X profile links out of a page's markup.
 *
 * Named export so tests can drive the real thing; Vercel only reads the default.
 *
 * Most trade sites put these in the header or footer, which is why this is worth
 * doing at all — Diego's DM leg had no data and ran empty. The work is almost
 * entirely in REJECTING things: a share button, a tracking pixel and a hashtag
 * link all live on the same hosts as a profile, and a bad handle is worse than
 * none because it sends him to a dead page mid-sequence.
 */
export function extractSocials(html) {
  const out = { ig: '', fb: '', x: '' };
  if (!html) return out;

  // ANCHORED. Unanchored, these match any hostname CONTAINING the platform
  // domain — l.facebook.com (Facebook's link shim) captured as a profile, and
  // worse, facebook.com.somephishingsite.net would too.
  const HOSTS = {
    ig: /^(?:www\.)?instagram\.com$/i,
    fb: /^(?:www\.|m\.|business\.)?facebook\.com$/i,
    x:  /^(?:www\.)?(?:twitter|x)\.com$/i,
  };
  // Share widgets, dialogs, pixels and link-shims — never a profile.
  const NOT_PROFILE = /\/(sharer|share|intent|dialog|plugins|tr\?|hashtag|explore|search|login|signup|help|privacy|policies|terms)\b/i;
  // Instagram /p/ and /reel/ are POSTS; X /i/ and /home are app routes.
  const NOT_PROFILE_PATH = /^\/(p|reel|reels|tv|stories|i|home|about|events)(\/|$)/i;

  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    let raw = m[1].trim();
    if (raw.startsWith('//')) raw = 'https:' + raw;
    if (!/^https?:\/\//i.test(raw)) continue;

    let u;
    try { u = new URL(raw); } catch { continue; }

    for (const key of ['ig', 'fb', 'x']) {
      if (out[key]) continue;                          // first plausible wins
      if (!HOSTS[key].test(u.hostname)) continue;
      if (NOT_PROFILE.test(u.pathname + u.search)) continue;

      const path = u.pathname.replace(/\/+$/, '');
      if (!path || path === '/') continue;             // bare platform link
      if (NOT_PROFILE_PATH.test(path)) continue;

      const handle = path.split('/').filter(Boolean)[0];
      if (!handle || handle.length < 2) continue;

      out[key] = 'https://' + u.hostname.replace(/^www\./, '') + '/' + handle;
    }
  }
  return out;
}
