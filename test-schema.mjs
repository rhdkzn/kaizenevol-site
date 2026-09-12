/* Structured data must parse, and must not claim anything the page does not say.
 *
 * Written 2026-09-11. The homepage carried no JSON-LD at all and the three
 * question pages — the one page type here that can win an AI answer or a rich
 * result — carried none either, while about.html and contact.html did. Nobody
 * had noticed because invalid or absent schema fails silently: the page looks
 * identical either way.
 *
 * The drift check is the point of this file. A FAQPage block is a second copy
 * of the page's own words, and a second copy is a thing that goes stale the
 * first time the copy is edited. So every Question name and every answer here
 * is asserted to still appear in the page's visible text. Edit the copy without
 * regenerating (tools/gen-faq-schema.mjs) and this goes red instead of
 * publishing an answer we no longer give.
 *
 * The Organization block is asserted identical wherever it appears: two pages
 * describing the same @id differently is the machine-readable version of the
 * split-brain document problem.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8899';
const FAQ = ['faq.html', 'tried-ads-before.html', 'ads-for-musicians.html', 'can-i-do-this-myself.html'];
const ORG_PAGES = ['index.html', 'what-we-run.html'];
const NEED_ORG = ['index.html'];

/* BASE can point at the live site, which is the only way to check what a
   stranger actually gets. Chromium needs the egress proxy and TLS 1.2 to
   reach it from here; neither is used for localhost. */
const REMOTE = /^https?:\/\/(?!localhost|127\.)/.test(BASE);
const b = await chromium.launch({
  executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ...(REMOTE && process.env.HTTPS_PROXY
      ? { args: ['--ssl-version-max=tls1.2'], proxy: { server: process.env.HTTPS_PROXY } }
      : {})
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
let fail = 0, pass = 0;
const orgSeen = {};

const load = async f => {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${f}`, { waitUntil: 'domcontentloaded' });
  const r = await p.evaluate(() => ({
    raw: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent),
    text: document.body.innerText.replace(/\s+/g, ' ')
  }));
  await p.close();
  return r;
};
const norm = s => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

for (const f of [...new Set([...FAQ, ...ORG_PAGES])]) {
  const { raw, text } = await load(f);
  const blocks = [];
  for (const r of raw) {
    try { blocks.push(JSON.parse(r)); pass++; }
    catch (e) { fail++; console.log(`FAIL  ${f} — JSON-LD does not parse: ${e.message.slice(0,70)}`); }
  }
  const types = blocks.map(x => x['@type']);

  if (NEED_ORG.includes(f) && !types.includes('Organization')) { fail++; console.log(`FAIL  ${f} — no Organization block`); }

  for (const org of blocks.filter(x => x['@type'] === 'Organization')) {
    const key = org['@id'];
    const s = JSON.stringify(org);
    if (orgSeen[key] && orgSeen[key].json !== s) {
      fail++; console.log(`FAIL  ${f} — Organization ${key} differs from the copy on ${orgSeen[key].page}`);
    } else if (!orgSeen[key]) orgSeen[key] = { json: s, page: f };
  }

  if (FAQ.includes(f)) {
    const faq = blocks.find(x => x['@type'] === 'FAQPage');
    if (!faq) { fail++; console.log(`FAIL  ${f} — no FAQPage block`); continue; }
    if (!Array.isArray(faq.mainEntity) || faq.mainEntity.length < 2) {
      fail++; console.log(`FAIL  ${f} — FAQPage has ${faq.mainEntity?.length ?? 0} question(s), needs 2+`); continue;
    }
    const body = norm(text);
    for (const q of faq.mainEntity) {
      if (!body.includes(norm(q.name))) { fail++; console.log(`FAIL  ${f} — question not on the page: "${q.name.slice(0,50)}"`); }
      else pass++;
      const a = norm(q.acceptedAnswer?.text || '');
      if (!a) { fail++; console.log(`FAIL  ${f} — empty answer for "${q.name.slice(0,40)}"`); continue; }
      /* Answers are joined from several nodes, so check the opening clause
         rather than the whole string — enough to catch a rewrite, tolerant of
         the join. */
      const head = a.split(' ').slice(0, 9).join(' ');
      if (!body.includes(head)) { fail++; console.log(`FAIL  ${f} — answer text not on the page: "${head.slice(0,60)}"`); }
      else pass++;
    }
  }
}
await b.close();
console.log(`\n${pass} assertion(s) passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
