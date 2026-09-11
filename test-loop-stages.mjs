/* The Kaizen Loop's four stages say the same thing, in the same order, on every
 * surface that carries them.
 *
 * Written 2026-09-11, when the mechanism got its own page and the home page
 * dropped to a summary. Rahaid's own objection to keeping both was the right
 * one: two copies of an argument drift. This is the guard that makes that
 * objection cheap to satisfy instead of a reason not to build the page.
 *
 * It was red the moment it was written, on a file nobody had looked at in five
 * days: llms.txt - the file AI crawlers read - was still carrying the RETIRED
 * staging Rahaid replaced on 2026-09-06. "Find your real profit per sale, mark
 * where you already are, make the ads, run the ads to that number" was the
 * 2026-09-04 wording; applying Diego's copy re-staged it two days later and
 * llms.txt never got the sweep. So the machine-readable description of our own
 * method described a method we had stopped running. That is the exact failure
 * this file exists to prevent, and it had already happened before the second
 * surface existed.
 *
 * Canon: the 2026-09-06 handover, and MKT-LOC-001. If the stages change, they
 * change HERE first and then everywhere this test looks.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const BASE = process.env.BASE || 'http://localhost:8899';

/* Each stage: the canonical title, and the phrase that must appear in prose
   surfaces where the full title does not fit naturally. */
const STAGES = [
  { title: 'Learn the brand, set the numbers', prose: 'learn the brand and set the numbers' },
  { title: 'Make the content',                 prose: 'make the content' },
  { title: 'Get it in front of people',        prose: 'get it in front of people' },
  { title: 'Track it, then do more of what worked', prose: 'track it and do more of what worked' },
];

const REMOTE = /^https?:\/\/(?!localhost|127\.)/.test(BASE);
const b = await chromium.launch({
  executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ...(REMOTE && process.env.HTTPS_PROXY
      ? { args: ['--ssl-version-max=tls1.2'], proxy: { server: process.env.HTTPS_PROXY } }
      : {})
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
let pass = 0, fail = 0;
const norm = s => s.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').toLowerCase();

/* ---- 1. the page itself: the four stages as headings, in order ---- */
{
  const p = await ctx.newPage();
  await p.goto(`${BASE}/kaizen-loop.html`, { waitUntil: 'domcontentloaded' });
  const heads = await p.evaluate(() => [...document.querySelectorAll('main h3')].map(h => h.textContent.replace(/\s+/g,' ').trim()));
  await p.close();
  const want = STAGES.map(s => s.title);
  const got = heads.filter(h => want.some(w => norm(h) === norm(w)));
  if (got.length !== 4) { fail++; console.log(`FAIL  kaizen-loop.html — found ${got.length}/4 stage headings; got: ${heads.join(' | ')}`); }
  else if (got.map(norm).join('>') !== want.map(norm).join('>')) { fail++; console.log(`FAIL  kaizen-loop.html — stages out of order: ${got.join(' > ')}`); }
  else pass++;
}

/* ---- 2. the home page summary: names all four, in order, in prose ---- */
{
  const p = await ctx.newPage();
  await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const text = norm(await p.evaluate(() => document.body.innerText));
  await p.close();
  let at = -1, ok = true;
  for (const s of STAGES) {
    const i = text.indexOf(norm(s.prose));
    if (i === -1) { fail++; ok = false; console.log(`FAIL  index.html — summary never names "${s.prose}"`); }
    else if (i < at) { fail++; ok = false; console.log(`FAIL  index.html — "${s.prose}" appears out of order`); }
    else at = i;
  }
  if (ok) pass++;
  const linked = await (async () => {
    const q = await ctx.newPage();
    await q.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const r = await q.evaluate(() => !!document.querySelector('a[href$="kaizen-loop.html"]'));
    await q.close(); return r;
  })();
  if (linked) pass++; else { fail++; console.log('FAIL  index.html — summary does not link to the page'); }
}
await b.close();

/* ---- 3. llms.txt: the same four, in the same order ---- */
{
  const t = norm(readFileSync('llms.txt', 'utf8'));
  let at = -1, ok = true;
  for (const s of STAGES) {
    const i = t.indexOf(norm(s.title));
    if (i === -1) { fail++; ok = false; console.log(`FAIL  llms.txt — never names the stage "${s.title}"`); }
    else if (i < at) { fail++; ok = false; console.log(`FAIL  llms.txt — "${s.title}" appears out of order`); }
    else at = i;
  }
  if (ok) pass++;
}

console.log(`\n${pass} passed, ${fail} failed — the four stages agree across the page, the home summary and llms.txt`);
process.exit(fail ? 1 : 0);
