/* Sitemap hygiene, added 2026-08-27.
 *
 * Found during the title sweep: two entries (walk-reach.html, walk-desk.html)
 * pointed at URLs that 301 to walk.html, which was already listed separately.
 * They were NOT 404s — I called them that before reading vercel.json, and the
 * redirects had been there all along doing their job of preserving old inbound
 * links. But a sitemap is a list of canonical destinations, so a URL that
 * bounces is a page Google fetches only to be sent elsewhere; Search Console
 * files those under "Page with redirect" and drops them.
 *
 * The same pass found the mirror error: walk-free.html is index,follow and
 * self-canonical — a live page we simply never declared.
 *
 * So the rule this guards is both directions: everything listed must be a real,
 * final, indexable destination, and every indexable page must be listed.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const BASE = 'https://kaizenevol.com/';
const xml = readFileSync('sitemap.xml', 'utf8');
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const redirects = new Set((vercel.redirects || []).map(r => r.source.replace(/^\//, '')));

const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map(m => m[1].replace(BASE, ''))
  .map(u => (u === '' ? 'index.html' : u));

const meta = (html, name) => {
  const m = html.match(new RegExp(`name="${name}" content="([^"]*)"`));
  return m ? m[1] : null;
};
const canonical = (html) => {
  const m = html.match(/rel="canonical" href="([^"]*)"/);
  if (!m) return null;
  const c = m[1].replace(BASE, '');
  /* The homepage canonical is the bare domain, which strips to '' — the same
     normalisation the <loc> list gets, or index.html reads as self-inconsistent. */
  return c === '' ? 'index.html' : c;
};

const r = [];
const check = (n, pass, d) => r.push({ n, pass, d });

check('no duplicate entries', new Set(locs).size === locs.length,
  `${locs.length} entries, ${new Set(locs).size} unique`);

for (const f of locs) {
  check(`${f} exists`, existsSync(f), 'file not found');
  check(`${f} is not a redirect source`, !redirects.has(f),
    redirects.has(f) ? `301s to ${(vercel.redirects.find(x => x.source.replace(/^\//, '') === f) || {}).destination}` : '');
  if (!existsSync(f)) continue;
  const html = readFileSync(f, 'utf8');
  check(`${f} is indexable`, !(meta(html, 'robots') || '').includes('noindex'), meta(html, 'robots') || '');
  const c = canonical(html);
  check(`${f} is its own canonical`, c === null || c === f, `canonical=${c}`);
}

/* The other direction: a live indexable page missing from the sitemap is
   invisible by omission, which is the quieter half of the same defect. */
for (const f of readdirSync('.').filter(x => x.endsWith('.html')).sort()) {
  if (locs.includes(f)) continue;
  const html = readFileSync(f, 'utf8');
  if ((meta(html, 'robots') || '').includes('noindex')) continue;   /* deliberately hidden */
  const c = canonical(html);
  if (c && c !== f) continue;                                        /* canonical'd elsewhere: an ad LP */
  check(`${f} is listed in the sitemap`, false, 'indexable, self-canonical, not declared');
}

/* lastmod must be a real past date — a future one is ignored by crawlers. */
const today = new Date().toISOString().slice(0, 10);
for (const [, d] of xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
  check(`lastmod ${d} is a valid past date`, /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today, d);
}

const failed = r.filter(x => !x.pass);
for (const x of failed) console.log(`FAIL  ${x.n}  — ${x.d}`);
console.log(`\n${r.length - failed.length}/${r.length} sitemap checks passed`);
process.exit(failed.length ? 1 : 0);
