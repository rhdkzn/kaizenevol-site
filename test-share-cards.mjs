/* Share cards, added 2026-09-04 after the ecom→"brands and artists" pass.
 *
 * The homepage — the one URL anyone actually pastes into a DM — had no
 * og:image and no twitter card at all, and apply.html and privacy.html had no
 * share tags whatsoever. The image that about.html and contact.html did point
 * at was still the v2 violet gradient, months after the brand moved to the
 * light neutral system. Nothing was broken; the previews were just wrong or
 * absent, which is exactly the kind of drift nobody sees from inside the repo.
 *
 * The convention: every page a stranger can land on carries the full block —
 * og:type/url/site_name/title/description/image + declared dimensions, and the
 * matching twitter:card/title/description/image — the image is the one shared
 * card at the repo root, and the declared dimensions are the real ones.
 *
 * DELIBERATELY OUT OF SCOPE: 404.html (nobody shares a 404), the noindex
 * estate pages kept alive but unlinked, and demos/ (client-persona pages that
 * must not carry KaizenEvol's card).
 */
import { readFileSync, existsSync } from 'node:fs';

const PAGES = ['index.html', 'apply.html', 'about.html', 'contact.html', 'privacy.html'];
const CARD = 'og-image.png';
const CARD_URL = 'https://kaizenevol.com/og-image.png';
const W = 1200, H = 630;

const grab = (html, re) => { const m = html.match(re); return m ? m[1].trim() : null; };

const r = [];
const check = (n, pass, d) => r.push({ n, pass, d });

/* The card itself: it must exist, and the dimensions every page declares must
   be the dimensions the file actually has. A PNG's width and height live at
   byte 16 and 20 of the IHDR chunk. */
if (!existsSync(CARD)) {
  check('the share card exists', false, `${CARD} missing`);
} else {
  const b = readFileSync(CARD);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  check('the share card is the declared size', w === W && h === H, `${w}x${h}, declared ${W}x${H}`);
}

for (const p of PAGES) {
  if (!existsSync(p)) { check(`${p} exists`, false, 'file missing'); continue; }
  const html = readFileSync(p, 'utf8');

  for (const [label, re] of [
    ['og:type',        /property="og:type" content="([^"]*)"/],
    ['og:url',         /property="og:url" content="([^"]*)"/],
    ['og:site_name',   /property="og:site_name" content="([^"]*)"/],
    ['og:title',       /property="og:title" content="([^"]*)"/],
    ['og:description', /property="og:description" content="([^"]*)"/],
    ['og:image',       /property="og:image" content="([^"]*)"/],
    ['twitter:card',   /name="twitter:card" content="([^"]*)"/],
    ['twitter:title',  /name="twitter:title" content="([^"]*)"/],
    ['twitter:image',  /name="twitter:image" content="([^"]*)"/],
  ]) check(`${p} has ${label}`, grab(html, re) !== null, 'missing');

  /* One card, absolute, so a preview scraper resolves it from anywhere. */
  for (const [label, re] of [['og:image', /property="og:image" content="([^"]*)"/],
                             ['twitter:image', /name="twitter:image" content="([^"]*)"/]]) {
    const v = grab(html, re);
    if (v !== null) check(`${p} ${label} points at the card`, v === CARD_URL, v);
  }

  const dw = grab(html, /property="og:image:width" content="([^"]*)"/);
  const dh = grab(html, /property="og:image:height" content="([^"]*)"/);
  check(`${p} declares the card size`, dw === String(W) && dh === String(H), `${dw}x${dh}`);

  check(`${p} twitter:card is summary_large_image`,
    grab(html, /name="twitter:card" content="([^"]*)"/) === 'summary_large_image',
    grab(html, /name="twitter:card" content="([^"]*)"/));

  /* The two share surfaces must agree with each other. They are allowed to be
     shorter and punchier than the meta description — a link preview is not a
     search result — but Facebook and X must not quote the page differently. */
  const od = grab(html, /property="og:description" content="([^"]*)"/);
  const td = grab(html, /name="twitter:description" content="([^"]*)"/);
  if (od && td) check(`${p} twitter:description matches og:description`, od === td,
    `og="${od}" vs twitter="${td}"`);
}

const failed = r.filter(x => !x.pass);
for (const x of failed) console.log(`FAIL  ${x.n}  — ${x.d}`);
console.log(`\n${r.length - failed.length}/${r.length} share-card checks passed`);
process.exit(failed.length ? 1 : 0);
