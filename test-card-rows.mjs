/* A row in a card list is a phrase, not a paragraph.
 *
 * Written 2026-09-11. The engagement block's three criteria were 15, 20 and 25
 * words, two sentences each, sitting inside a numbered checklist. The FORM said
 * scan me; the CONTENT was prose, and the two fought. The reference's equivalent
 * rows run four to eight words - "Already have product-market fit" - and that is
 * the entire reason theirs reads faster, not the type size and not the colour.
 *
 * So the fix was never to enlarge anything. It was to cut the sentences: the rows
 * are now 8, 11 and 8 words and the explanation that used to be inside each one
 * sits once, underneath, where it does not have to be re-read three times.
 *
 * The limit is 16 words and one sentence. Measured across the estate the real
 * rows sit at 8-15, so 16 leaves room to write naturally and still fails a
 * paragraph that has wandered into a list.
 */
import { chromium } from 'playwright';
import { readdirSync } from 'fs';

const BASE = process.env.BASE || 'http://localhost:8899';
const MAX_WORDS = 16;
const SELECTORS = '.wr-crit li, .wr-do li, .lp-do li';
const SKIP = new Set(['crm.html','dashboard.html','portal.html','onboard.html','booked.html',
                      '404.html','hero-lab.html','motion-lab.html','lab-cta.html','showcase-home.html']);
const pages = readdirSync('.').filter(f => f.endsWith('.html') && !SKIP.has(f));

const REMOTE = /^https?:\/\/(?!localhost|127\.)/.test(BASE);
const b = await chromium.launch({
  executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ...(REMOTE && process.env.HTTPS_PROXY
      ? { args: ['--ssl-version-max=tls1.2'], proxy: { server: process.env.HTTPS_PROXY } }
      : {})
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
let pass = 0, fail = 0, rows = 0;

for (const f of pages) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${f}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  const bad = await p.evaluate(([sel, max]) => {
    const out = [];
    let n = 0;
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      n++;
      /* Strip a leading mono numeral - it is a label, not part of the sentence. */
      const t = el.textContent.trim().replace(/^\d{2}\s*/, '');
      const words = t.split(/\s+/).filter(Boolean).length;
      const sentences = (t.match(/[.!?](\s|$)/g) || []).length;
      if (words > max) out.push({ why: `${words} words`, t: t.slice(0, 60) });
      else if (sentences > 1) out.push({ why: `${sentences} sentences`, t: t.slice(0, 60) });
    }
    return { out, n };
  }, [SELECTORS, MAX_WORDS]);
  await p.close();
  rows += bad.n;
  if (bad.out.length) {
    for (const x of bad.out) { fail++; console.log(`FAIL  ${f} — card row is ${x.why}: "${x.t}..."`); }
  } else pass++;
}
await b.close();
console.log(`\n${rows} card row(s) checked on ${pass} page(s), ${fail} too long — a row is a phrase, not a paragraph`);
process.exit(fail ? 1 : 0);
