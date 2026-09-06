/* Page-title convention, swept 2026-08-27 on Rahaid's word.
 *
 * The site had FOUR separators in play across 24 pages (comma, em dash, pipe,
 * middot), the brand on the left of some titles and the right of others, one
 * title at 75 characters that Google truncates, and Title Case everywhere —
 * the last place it survived after the sentence-case sweep put 247 headings the
 * other way. None of it was broken; all of it was drift, which is exactly what
 * a guard is for.
 *
 * The convention: distinctive part first, comma, brand last, sentence case,
 * 60 characters or fewer, and title == og:title == twitter:title.
 *
 * DELIBERATELY OUT OF SCOPE: demos/ are client-persona pages pretending to be
 * the client's own site — a KaizenEvol brand rule applied there would be a bug,
 * not consistency. _saved-snippets/ are fragments with no <head>.
 */
import { readFileSync, existsSync } from 'node:fs';

const PAGES = [
  'index.html',       'about.html', 'contact.html', 'privacy.html',     'booked.html', '404.html', ];

const MAX = 60;
const BRANDS = ['KaizenEvol', 'KaizenReach', 'KaizenDesk', 'KaizenForge'];
/* Proper nouns that keep their capital in sentence case. */
const PROPER = new Set([...BRANDS, 'Meta', 'UK', 'AI', 'Google', 'Instagram',
  'Facebook', 'WhatsApp', 'I', "I'm"]);

const grab = (html, re) => { const m = html.match(re); return m ? m[1].trim() : null; };

const r = [];
const check = (n, pass, d) => r.push({ n, pass, d });

for (const p of PAGES) {
  if (!existsSync(p)) { check(`${p} exists`, false, 'file missing'); continue; }
  const html = readFileSync(p, 'utf8');
  const title = grab(html, /<title>([^<]*)<\/title>/);
  if (!title) { check(`${p} has a title`, false, 'no <title>'); continue; }

  check(`${p} ≤${MAX} chars`, title.length <= MAX, `${title.length}: "${title}"`);
  check(`${p} names a brand`, BRANDS.some(b => title.includes(b)), title);
  /* The roi.html exception (a title ending in "?" where the question mark IS the
     separator) died with the page on 2026-09-05. Every surviving title uses the comma. */
  const sepOk = title.includes(',') && !/[—|·]/.test(title);
  check(`${p} uses the comma separator`, sepOk, title);

  /* Sentence case: only proper nouns and the first word may be capitalised.
     Catches Title Case without needing a dictionary. */
  /* A capital is legitimate at the start of the title and after a full stop,
     question mark or bang — "Pay once, own it." is a second sentence, not Title
     Case. Anything else capitalised must be a proper noun. */
  const toks = title.split(/\s+/).filter(Boolean);
  const stray = toks.filter((w, i) => {
    if (i === 0) return false;
    if (/[.?!]$/.test(toks[i - 1])) return false;
    return /^[A-Z]/.test(w) && !PROPER.has(w.replace(/[.,?!]$/, ''));
  }).map(w => w.replace(/[.,?!]$/, ''));
  check(`${p} is sentence case`, stray.length === 0, stray.length ? `capitalised: ${stray.join(' ')}` : title);

  /* A title that disagrees with its own share tags gives the tab, the search
     result and the link preview three different names for one page. */
  for (const [label, re] of [['og:title', /property="og:title" content="([^"]*)"/],
                             ['twitter:title', /name="twitter:title" content="([^"]*)"/]]) {
    const v = grab(html, re);
    if (v !== null) check(`${p} ${label} matches`, v === title, `${label}="${v}" vs title="${title}"`);
  }
}

const failed = r.filter(x => !x.pass);
for (const x of failed) console.log(`FAIL  ${x.n}  — ${x.d}`);
console.log(`\n${r.length - failed.length}/${r.length} title checks passed`);
process.exit(failed.length ? 1 : 0);
