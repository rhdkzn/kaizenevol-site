/* Scraper social capture (Levi's build request, 2026-08-26).
 *
 * Diego: "that's needed for this to work" — the DM leg had no data and ran empty.
 * Socials are pulled from the SAME bytes enrich-email already fetches, so no
 * extra request. Nearly all the work is REJECTION: a share button, a tracking
 * pixel and a hashtag link sit on the same hosts as a profile, and a wrong handle
 * is worse than none — it sends Diego to a dead page mid-sequence.
 */
import { extractSocials } from './api/enrich-email.js';

const r = [];
const check = (n, pass, d) => r.push({ n, pass, d });
const eq = (n, got, want) => check(n, got === want, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

/* A realistic trade-site footer — the actual target. */
{
  const html = `<footer><div class="social">
    <a href="https://www.facebook.com/SmithRenovationsBristol/"><img src="fb.png"></a>
    <a href="https://www.instagram.com/smithreno_bristol/">Instagram</a>
    <a href="https://twitter.com/smithreno">Twitter</a>
    <a href="mailto:info@smithreno.co.uk">Email us</a>
  </div></footer>`;
  const s = extractSocials(html);
  eq('footer -> facebook page',  s.fb, 'https://facebook.com/SmithRenovationsBristol');
  eq('footer -> instagram',      s.ig, 'https://instagram.com/smithreno_bristol');
  eq('footer -> twitter as x',   s.x,  'https://twitter.com/smithreno');
}

/* Share buttons live on the same hosts. Capturing one would put "sharer" in the
   CRM as a handle and send Diego to a dead page. */
{
  const html = `
    <a href="https://www.facebook.com/sharer/sharer.php?u=https://smithreno.co.uk">Share</a>
    <a href="https://twitter.com/intent/tweet?url=https://smithreno.co.uk">Tweet</a>
    <a href="https://www.facebook.com/dialog/share?app_id=1">Share</a>`;
  const s = extractSocials(html);
  eq('share links ignored (fb)', s.fb, '');
  eq('intent links ignored (x)', s.x,  '');
}

/* Tracking pixels and link shims. */
{
  const s = extractSocials(`
    <a href="https://www.facebook.com/tr?id=123&ev=PageView">px</a>
    <a href="https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com">shim</a>`);
  eq('pixel and shim ignored', s.fb, '');
}
/* Unanchored host matching would accept a lookalike domain as a profile. */
{
  const s = extractSocials(`<a href="https://facebook.com.phishing-site.net/SmithReno">Us</a>`);
  eq('lookalike domain rejected', s.fb, '');
}

/* A bare platform link ("find us on Facebook" pointing at facebook.com) is not
   a profile and must not become a handle. */
{
  const s = extractSocials(`<a href="https://facebook.com">Facebook</a><a href="https://instagram.com/">Insta</a>`);
  eq('bare facebook ignored',  s.fb, '');
  eq('bare instagram ignored', s.ig, '');
}

/* Instagram /p/ and /reel/ are POSTS, not profiles — an embedded post would
   otherwise register the post id as the handle. */
{
  const s = extractSocials(`
    <a href="https://www.instagram.com/p/DaxM5E4iF97/">our latest job</a>
    <a href="https://www.instagram.com/reel/ABC123/">reel</a>`);
  eq('instagram post ignored', s.ig, '');
}

/* Hashtag and explore links. */
{
  const s = extractSocials(`<a href="https://www.instagram.com/explore/tags/bristol/">#bristol</a>`);
  eq('hashtag/explore ignored', s.ig, '');
}

/* A real profile alongside the junk must still be found — the common case, since
   sites carry both a share button and a profile link. */
{
  const html = `
    <a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>
    <a href="https://www.facebook.com/AJWConstructionLtd">Follow us</a>`;
  eq('profile found despite a share button', extractSocials(html).fb, 'https://facebook.com/AJWConstructionLtd');
}

/* x.com and twitter.com both count; whichever appears first wins. */
{
  eq('x.com recognised', extractSocials(`<a href="https://x.com/smithreno">X</a>`).x, 'https://x.com/smithreno');
}

/* Protocol-relative hrefs are common in older markup. */
{
  eq('protocol-relative href', extractSocials(`<a href="//www.instagram.com/smithreno">ig</a>`).ig,
     'https://instagram.com/smithreno');
}

/* Query strings and trailing slashes must be stripped, or two links to the same
   profile would look like different handles. */
{
  eq('query and trailing slash stripped',
     extractSocials(`<a href="https://www.instagram.com/smithreno/?hl=en&utm_source=web">ig</a>`).ig,
     'https://instagram.com/smithreno');
}

/* Nothing in, nothing out — must not throw or invent. */
{
  const empty = extractSocials('');
  check('empty html -> empty result', !empty.ig && !empty.fb && !empty.x, JSON.stringify(empty));
  const none = extractSocials('<html><body><p>No socials here.</p></body></html>');
  check('page with no socials -> empty', !none.ig && !none.fb && !none.x, JSON.stringify(none));
  check('malformed href does not throw',
        !!extractSocials('<a href="ht!tp://[[[">x</a><a href="https://instagram.com/ok">i</a>').ig, 'threw or missed');
}

let failed = 0;
for (const x of r) { if (!x.pass) failed++; console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.n}${x.pass ? '' : '   <- ' + x.d}`); }
console.log(`\n${r.length - failed}/${r.length} passed`);
process.exit(failed ? 1 : 0);
