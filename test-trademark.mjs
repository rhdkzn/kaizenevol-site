/* The mechanism name carries TM, and nothing on this site ever carries R.
 *
 * Written 2026-09-11 when Rahaid asked for the mark on the Kaizen Loop. Two
 * assertions, and the second is the one that matters.
 *
 * TM is a claim to an unregistered mark and anyone may use it. R asserts a
 * REGISTERED mark, and under section 95 of the Trade Marks Act 1994 falsely
 * representing a mark as registered is a criminal offence carrying a fine. We
 * hold no registration: checked on the day against TMview across GB and EU
 * registers, all classes, with NIKE (99) and ADIDAS (11) run first as controls
 * so the zero could be trusted. "Kaizen Loop" returns nothing anywhere. Bare
 * "KAIZEN" returns 56 in class 35 held by other people, which is why the mark
 * we claim is the phrase and never the word.
 *
 * So R is the one character on this site that could cost money, and the only
 * thing standing between here and there is somebody typing the wrong entity.
 * That is exactly the kind of thing a guard is for.
 */
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'fs';

const BASE = process.env.BASE || 'http://localhost:8899';
const SKIP = new Set(['crm.html','dashboard.html','portal.html','onboard.html','booked.html',
                      '404.html','hero-lab.html','motion-lab.html','lab-cta.html','showcase-home.html']);
const pages = readdirSync('.').filter(f => f.endsWith('.html') && !SKIP.has(f));
const TEXT_FILES = ['llms.txt', 'robots.txt', 'sitemap.xml'];
const NAME = 'The Kaizen Loop';

const REMOTE = /^https?:\/\/(?!localhost|127\.)/.test(BASE);
const b = await chromium.launch({
  executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ...(REMOTE && process.env.HTTPS_PROXY
      ? { args: ['--ssl-version-max=tls1.2'], proxy: { server: process.env.HTTPS_PROXY } }
      : {})
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
let pass = 0, fail = 0;

for (const f of pages) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${f}`, { waitUntil: 'domcontentloaded' });
  const r = await p.evaluate(name => {
    const text = document.body.innerText;
    const heads = [...document.querySelectorAll('h1,h2,h3')].map(h => h.textContent.replace(/\s+/g,' ').trim());
    return { hasName: text.includes(name), registered: /®|&reg;/.test(text),
             named: heads.filter(h => h.includes(name)) };
  }, NAME);
  await p.close();

  if (r.registered) { fail++; console.log(`FAIL  ${f} — carries the REGISTERED symbol; we hold no registration (Trade Marks Act 1994 s.95)`); }
  else pass++;

  if (!r.hasName) { pass++; continue; }           // page simply does not use the name
  /* Where the name appears as a HEADING it must carry the mark. Body prose may
     repeat the name bare, which is the normal convention - the claim is made at
     the prominent use, not at every mention. */
  for (const h of r.named) {
    if (h.includes('™')) pass++;
    else { fail++; console.log(`FAIL  ${f} — heading "${h}" uses the name without the mark`); }
  }
}
await b.close();

for (const f of TEXT_FILES) {
  let s;
  try { s = readFileSync(f, 'utf8'); } catch { continue; }
  if (/®/.test(s)) { fail++; console.log(`FAIL  ${f} — carries the REGISTERED symbol`); } else pass++;
  if (s.includes(NAME) && !s.includes(NAME + '™')) {
    fail++; console.log(`FAIL  ${f} — uses "${NAME}" but never with the mark`);
  } else pass++;
}

console.log(`\n${pass} passed, ${fail} failed — the mechanism is marked TM and nothing claims registration`);
process.exit(fail ? 1 : 0);
