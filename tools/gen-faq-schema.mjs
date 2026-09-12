/* Generate the FAQPage JSON-LD for the three question pages from their own
 * rendered text, so the schema cannot say something the page does not.
 *
 * Written 2026-09-11. The three pages are literally a question and an answer
 * and carried no structured data at all, which is the one page type on this
 * site that can win an AI answer or a rich result today.
 *
 * Hand-transcribing the answers into JSON would create a second copy that
 * drifts the first time the copy is edited. This reads the live DOM instead,
 * and test-schema.mjs then asserts every question and answer in the block
 * still appears on the page — so an edit to the copy turns the guard red
 * rather than silently publishing a stale claim.
 *
 * Run: node tools/gen-faq-schema.mjs   (with the site served on :8899)
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const BASE = process.env.BASE || 'http://localhost:8899';
const PAGES = ['tried-ads-before.html', 'ads-for-musicians.html', 'do-i-have-to-be-on-camera.html', 'faq.html'];
const SITE = 'https://kaizenevol.com';
const MARK_OPEN = '<!-- faq-schema:start -->';
const MARK_CLOSE = '<!-- faq-schema:end -->';

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });

for (const f of PAGES) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${f}`, { waitUntil: 'domcontentloaded' });
  const qa = await p.evaluate(() => {
    const clean = s => s.replace(/\s+/g, ' ').trim();
    const out = [];
    const h1 = document.querySelector('main h1');
    /* The page's own title is the primary question; its answer is the
       unheaded block of paragraphs directly beneath it. */
    const lead = h1.closest('.legal-measure').querySelector('section.legal-block');
    if (lead && !lead.querySelector('h2')) {
      out.push({ q: clean(h1.textContent), a: [...lead.querySelectorAll('p')].map(x => clean(x.textContent)).join(' ') });
    }
    for (const sec of document.querySelectorAll('main section.legal-block')) {
      const h2 = sec.querySelector('h2');
      if (!h2) continue;
      const q = clean(h2.textContent);
      if (!q.includes('?')) continue;           // "What we would actually do" is a list, not a question
      const body = [...sec.querySelectorAll('p, li')].map(x => clean(x.textContent)).join(' ');
      if (body) out.push({ q, a: body });
    }
    return out;
  });
  await p.close();

  if (qa.length < 2) { console.log(`SKIP ${f} — only ${qa.length} question(s) found`); continue; }

  const block = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${SITE}/${f}#faq`,
    mainEntity: qa.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a }
    }))
  };
  const json = JSON.stringify(block, null, 2).replace(/<\/script/gi, '<\\/script');
  const tag = `${MARK_OPEN}\n<script type="application/ld+json">\n${json}\n</script>\n${MARK_CLOSE}`;

  let html = readFileSync(f, 'utf8');
  if (html.includes(MARK_OPEN)) {
    html = html.replace(new RegExp(`${MARK_OPEN}[\\s\\S]*?${MARK_CLOSE}`), tag);
  } else {
    html = html.replace('</head>', `${tag}\n</head>`);
  }
  writeFileSync(f, html);
  console.log(`${f}: ${qa.length} question(s) written`);
  qa.forEach(x => console.log(`   - ${x.q}`));
}
await b.close();
