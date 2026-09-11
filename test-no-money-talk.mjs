/* The public site does not discuss what WE charge.
 *
 * Rahaid, 2026-09-11: "I hate that you say one monthly fee I don't like talking
 * about money or fees on the website", then "remove the money ones, keep the
 * ownership lines only."
 *
 * There was already a rule that no PRICE goes on the public site, and the site
 * obeyed it - there has never been a figure. "One monthly fee" carried no number
 * and appeared fifteen times across seven files anyway. That is the same mistake
 * as the costs page on 2026-09-08: the wording of a standing rule treated as the
 * boundary of the decision behind it. The decision is that our commercial terms
 * are a conversation, not a page.
 *
 * ONE EXEMPTION, added the same day (Rahaid): "only on the engagement section do I
 * want mentioned about the monthly fee". So what-we-run.html's engagement block may
 * say it, and nowhere else on the site may - including the rest of that same file.
 * The exemption is scoped to the SECTION rather than the file, and it is asserted
 * in both directions: the phrase must appear there exactly once, and must not
 * appear anywhere outside it. A one-way exemption would let the phrase quietly
 * spread back across the estate, which is the state this guard was written to end.
 * Still no figure, anywhere: that rule is older and was never relaxed.
 *
 * WHAT THIS DOES NOT BAN, deliberately. The client's own money is the whole
 * argument of the site: their ad spend, their margin, what a sale leaves them.
 * And the ownership lines he kept explicitly - "no cut of your ad spend", "your
 * ad money goes straight from your own account, never through us", "nothing we
 * recommend is ever because it pays us more" - mention money while saying they
 * keep control, which is a differentiator rather than a price. A guard that
 * flagged those would be a guard nobody could leave switched on.
 *
 * So it matches a short list of OUR-terms phrasings, plus any actual figure.
 */
import { readdirSync, readFileSync } from 'fs';

const SKIP = new Set(['crm.html','dashboard.html','portal.html','onboard.html','booked.html',
                      '404.html','hero-lab.html','motion-lab.html','lab-cta.html','showcase-home.html',
                      'apply.html']);   // apply is the gated form: it asks about THEIR margins
const files = [...readdirSync('.').filter(f => f.endsWith('.html') && !SKIP.has(f)), 'llms.txt'];

const BANNED = [
  [/\bmonthly fee\b/i,        'our fee'],
  [/\bone fee\b/i,            'our fee'],
  [/\bour fee\b/i,            'our fee'],
  [/\btake a fee\b/i,         'our fee'],
  [/\bmonthly payment\b/i,    'our fee'],
  [/\bwhat you pay\b/i,       'our price'],
  [/\bwhat we charge\b/i,     'our price'],
  [/\bour (price|pricing|rate|rates)\b/i, 'our price'],
  [/£\s?\d/,                  'a figure'],
  [/\b\d+\s?(?:per|a) month\b/i, 'a figure'],
];

/* Strip comments and script/style so a note ABOUT the rule cannot trip it. */
const visible = s => s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

/* The engagement block on what-we-run.html, cut out of the scan and checked on its
   own terms. Matched from its eyebrow to the end of its <section>. */
const ENGAGEMENT_FILE = 'what-we-run.html';
const ENGAGEMENT_RE = /<section class="lp-block tone">\s*<div class="container">\s*<p class="smallcaps lp-eyebrow">04 \/ Engagement<\/p>[\s\S]*?<\/section>/;
const ALLOWED_IN_ENGAGEMENT = /\bone monthly fee\b/;

let fail = 0, pass = 0;
for (const f of files) {
  let s;
  try { s = readFileSync(f, 'utf8'); } catch { continue; }

  if (f === ENGAGEMENT_FILE) {
    const m = s.match(ENGAGEMENT_RE);
    if (!m) {
      fail++;
      console.log(`FAIL  ${f} — the engagement block could not be found, so its exemption cannot be scoped`);
    } else {
      const inside = (visible(m[0]).match(new RegExp(ALLOWED_IN_ENGAGEMENT, 'g')) || []).length;
      if (inside === 1) pass++;
      else { fail++; console.log(`FAIL  ${f} — the engagement block mentions the fee ${inside} time(s); it must be exactly 1`); }
      if (/£\s?\d/.test(visible(m[0]))) { fail++; console.log(`FAIL  ${f} — the engagement block carries a figure; the exemption is the phrase, never a number`); }
      else pass++;
      s = s.replace(ENGAGEMENT_RE, ' ');   // scan the rest of the file normally
    }
  }

  const body = visible(s);
  let clean = true;
  for (const [re, kind] of BANNED) {
    const m = body.match(re);
    if (m) {
      clean = false; fail++;
      const i = body.indexOf(m[0]);
      console.log(`FAIL  ${f} — ${kind}: "...${body.slice(Math.max(0,i-46), i+46).replace(/\s+/g,' ').trim()}..."`);
    }
  }
  if (clean) pass++;
}
console.log(`\n${pass} file(s) clean, ${fail} match(es) — the public site does not discuss what we charge`);
process.exit(fail ? 1 : 0);
