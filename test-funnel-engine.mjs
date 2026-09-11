/* test-funnel-engine.mjs — the spec must render the SAME funnel apply.html renders.
 *
 * funnels/apply.json was extracted from apply.html by hand. An extraction that quietly
 * changes a question, drops an option or renames a key is not a refactor, it is a rewrite
 * with a refactor's commit message — and the change would reach real applicants. These
 * checks compare the two directly, and they are what lets apply.html migrate later with
 * evidence rather than hope.
 *
 * Also pins the read-back, including the one rule that matters commercially: when the
 * "too early" line applies it MUST be shown. The first version of that code computed it
 * and dropped it, because only two lines render and it was third.
 */
import { readFileSync } from 'node:fs';

let fails = 0;
const ok = (name, cond, detail) => {
  if (cond) console.log('  ok   ' + name);
  else { fails++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
};

const html = readFileSync('apply.html', 'utf8');
const spec = JSON.parse(readFileSync('funnels/apply.json', 'utf8'));

/* apply.html is authored with HTML entities; the engine stores literal characters. Decode
   before comparing, or every £ and en dash reads as a difference. */
const dec = s => s
  .replace(/&pound;/g, '£').replace(/&ndash;/g, '–').replace(/&rsquo;/g, '’')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();

/* ── what the live page actually contains ─────────────────────────────────── */
const pageSteps = [...html.matchAll(/<section class="step[^"]*" data-key="([^"]+)"[\s\S]*?(?=<section class="step|<p class="err")/g)]
  .map(m => {
    const block = m[0];
    const q = dec((block.match(/<h1 class="q">([\s\S]*?)<\/h1>/) || [, ''])[1]);
    const opts = [...block.matchAll(/class="opt"[^>]*>([^<]*)<\/button>/g)].map(o => dec(o[1]));
    return { key: m[1], q, opts };
  });

ok('found the steps in apply.html', pageSteps.length > 0, 'parsed ' + pageSteps.length);
ok('spec has the same number of steps as the page',
   spec.steps.length === pageSteps.length, spec.steps.length + ' vs ' + pageSteps.length);

pageSteps.forEach((p, i) => {
  const s = spec.steps[i] || {};
  ok('step ' + (i + 1) + ' key matches (' + p.key + ')', s.key === p.key, 'spec has ' + s.key);
  ok('step ' + (i + 1) + ' question matches', s.q === p.q, JSON.stringify({ spec: s.q, page: p.q }));
  const specOpts = s.options || [];
  ok('step ' + (i + 1) + ' options match (' + p.opts.length + ')',
     JSON.stringify(specOpts) === JSON.stringify(p.opts),
     JSON.stringify({ spec: specOpts, page: p.opts }));
});

/* ── the payload the endpoint receives must not change shape ───────────────── */
for (const k of ['businessName', 'businessUrl', 'contactName', 'email', 'trade', 'monthlyBudget', 'message']) {
  ok('payload carries ' + k, Object.prototype.hasOwnProperty.call(spec.payload, k));
}
ok('revenue still rides in monthlyBudget (the endpoint stores one budget field)',
   spec.payload.monthlyBudget === '{{revenue}}');
ok('ad spend and sell model still ride in the message', /adspend/.test(spec.payload.message) && /sellModel/.test(spec.payload.message));

/* ── the read-back ────────────────────────────────────────────────────────── */
const engine = readFileSync('funnel-engine.js', 'utf8');
globalThis.window = globalThis;
eval(engine);
const reveal = globalThis.KEFunnel.reveals['ecom-margin'];
ok('the spec names a reveal the engine actually has', typeof reveal === 'function', spec.reveal);

const REVS = spec.steps.find(s => s.key === 'revenue').options;
const COGS = spec.steps.find(s => s.key === 'costShare').options;
const ADS  = spec.steps.find(s => s.key === 'adspend').options;

let empty = 0, combos = 0;
for (const revenue of REVS) for (const costShare of COGS) for (const adspend of ADS) {
  combos++;
  const out = reveal({ revenue, costShare, adspend, sellModel: 'Drops on a schedule' });
  if (!out || !out.first) empty++;
}
ok('every answer combination produces a read-back (' + combos + ')', empty === 0, empty + ' produced nothing');

const early = reveal({ revenue: 'Under £5k', costShare: 'About half', adspend: 'Nothing yet' });
ok('the "too early" line is shown, not dropped', /too early/.test(early.second || ''), early.second);

const healthy = reveal({ revenue: '£40k – £100k', costShare: 'About a third', adspend: '£5k – £15k' });
ok('a healthy brand is not told it is too early', !/too early/.test(healthy.second || ''));
ok('the reveal proves rather than solves',
   !/(we will build|we would run|sign up|book now|our system)/i.test(JSON.stringify(healthy)));

/* ── the host page ────────────────────────────────────────────────────────── */
const host = readFileSync('f.html', 'utf8');
ok('funnel name is whitelisted as a slug (no path traversal into the fetch)',
   /\^\[a-z0-9-\]\{1,40\}\$/.test(host));
ok('host loads the engine', /funnel-engine\.js/.test(host));


/* ── telemetry ────────────────────────────────────────────────────────────────
   The rule worth guarding is privacy, not plumbing: a step beacon must carry which
   step was reached and never what was typed. If someone later "helpfully" adds the
   answers to the payload, that widens our processor surface silently. */
const eng = engine;
ok('engine emits a step view', /emit\(this\.spec, 'view'/.test(eng));
ok('engine emits back, submit and complete', /'back'/.test(eng) && /'submit'/.test(eng) && /'complete'/.test(eng));
/* Scoped to the emit() body itself. The first version of this check matched "emit"
   anywhere within 900 chars of `data` and fired on ordinary code — a guard that cries
   wolf is one you learn to skip, which is the failure it exists to prevent. */
const _es = eng.indexOf('function emit(');
const emitBody = _es < 0 ? '' : eng.slice(_es, eng.indexOf('function Funnel(', _es));
ok('emit() exists to be checked', emitBody.length > 100);
ok('the beacon body carries NO answer content',
   emitBody.length > 100 && emitBody.indexOf('.data') === -1);
ok('telemetry cannot break the funnel (errors swallowed)',
   /catch \(e\) \{ \/\* telemetry never breaks the funnel \*\/ \}/.test(eng));
ok('uses sendBeacon so a mid-funnel close still records', /navigator\.sendBeacon/.test(eng));

const api = readFileSync('api/funnel-event.js', 'utf8');
ok('endpoint whitelists the event name', /EVENTS\.includes\(event\)/.test(api));
ok('endpoint validates the funnel slug', /\^\[a-z0-9-\]\{1,40\}\$/.test(api));
ok('endpoint validates the session id', /\^\[A-Za-z0-9_-\]\{6,40\}\$/.test(api));
ok('endpoint stores no answer fields',
   !/(businessName|email|contactName|revenue|costShare|adspend|trade)/.test(api.replace(/\/\*[\s\S]*?\*\//g, '')));
ok('endpoint does not require the service-role key', /SUPABASE_SERVICE_ROLE_KEY \|\| SUPABASE_ANON_KEY/.test(api));

console.log(fails ? `\n${fails} check(s) failed` : '\nfunnel engine: spec matches the live page, read-back pinned');
process.exit(fails ? 1 : 0);
