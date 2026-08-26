/* Social handles + the DM gate (v3 spec P0 #2).
 *
 * Before this there was no social field at all: the DM card linked to the firm's
 * website, so Diego opened a homepage and went hunting for the profile himself.
 * Levi's acceptance check: "import an Instagram (or X, or FB) handle -> DM button
 * opens that platform; a Twitter-only lead is DM-eligible."
 *
 * Extracted from crm.html between the SEQ-SOCIAL markers so this drives shipped code.
 */
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./crm.html', import.meta.url), 'utf8');
const core = html.slice(html.indexOf('/* SEQ-SOCIAL-START'), html.indexOf('/* SEQ-SOCIAL-END */'));
if (!core.includes('canDm')) throw new Error('social core not found between markers');
const { socialUrl, leadSocials, canDm } =
  new Function(core + ';return {socialUrl,leadSocials,canDm};')();

const r = [];
const check = (n, pass, d) => r.push({ n, pass, d });
const eq = (n, got, want) => check(n, got === want, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

/* Handles — what someone actually types off a phone. */
eq('bare handle -> instagram url',        socialUrl('ig', 'smithreno'),  'https://instagram.com/smithreno');
eq('@handle strips the at',               socialUrl('ig', '@smithreno'), 'https://instagram.com/smithreno');
eq('facebook handle',                     socialUrl('fb', 'SmithReno'),  'https://facebook.com/SmithReno');
eq('x handle',                            socialUrl('x',  '@smithreno'), 'https://x.com/smithreno');

/* URLs — pasted from a browser. Must not be double-prefixed. */
eq('full https url passes through',   socialUrl('ig', 'https://instagram.com/smithreno'), 'https://instagram.com/smithreno');
eq('bare host gets a scheme',         socialUrl('ig', 'instagram.com/smithreno'),         'https://instagram.com/smithreno');
eq('www host gets a scheme',          socialUrl('fb', 'www.facebook.com/SmithReno'),      'https://www.facebook.com/SmithReno');
eq('twitter.com counts as X',         socialUrl('x',  'twitter.com/smithreno'),           'https://twitter.com/smithreno');

/* Junk in must not become a broken link out. */
eq('empty is empty',        socialUrl('ig', ''),        '');
eq('whitespace is empty',   socialUrl('ig', '   '),     '');
eq('null is empty',         socialUrl('ig', null),      '');
eq('a lone @ is empty',     socialUrl('ig', '@'),       '');
eq('unknown platform key',  socialUrl('tiktok', 'x'),   '');
/* A handle with trailing path/query must not smuggle it into the URL. */
eq('trailing path is trimmed', socialUrl('ig', 'smithreno/reels?x=1'), 'https://instagram.com/smithreno');

/* The gate: ANY platform makes a lead DM-able. Levi's check names the X-only case. */
check('no social -> not DM-able',      !canDm({}), 'canDm({}) was true');
check('empty strings -> not DM-able',  !canDm({ social: { ig: '', fb: '  ', x: '' } }), 'blank handles counted');
check('instagram only -> DM-able',      canDm({ social: { ig: 'smithreno' } }), 'ig-only failed');
check('facebook only -> DM-able',       canDm({ social: { fb: 'SmithReno' } }), 'fb-only failed');
check('X only -> DM-able (Levi\'s case)',canDm({ social: { x: '@smithreno' } }), 'x-only failed');

/* The card renders one link per platform on file, in a stable order. */
{
  const got = leadSocials({ social: { ig: 'a', x: 'b' } }).map(s => s.short).join(',');
  eq('links render for each platform present', got, 'IG,X');
}
{
  const got = leadSocials({ social: { fb: 'a', ig: 'b', x: 'c' } }).map(s => s.short).join(',');
  eq('order is stable regardless of key order', got, 'IG,FB,X');
}

let failed = 0;
for (const x of r) { if (!x.pass) failed++; console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.n}${x.pass ? '' : '   <- ' + x.d}`); }
console.log(`\n${r.length - failed}/${r.length} passed`);
process.exit(failed ? 1 : 0);
