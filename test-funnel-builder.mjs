/* test-funnel-builder.mjs — the builder must speak the ENGINE's model, and its gate must hold.
 *
 * WHY THIS EXISTS. v1 of the builder exported a standalone .html funnel with its own
 * embedded engine, which fed nothing: no /funnels entry, no /f.html route, and no
 * telemetry — so anything built with it was invisible to the dashboard's "Funnels —
 * where people give up" panel sitting directly above its own nav link. Nothing was
 * looking, so it stayed linked in the Owners Portal nav for two months.
 *
 * The headline check is a ROUND TRIP: the builder's validator must accept
 * funnels/apply.json, the funnel already in production. If it cannot, the builder does
 * not speak the engine's model and the rest of its opinions are worthless.
 *
 * The rest is the gate, red side: every rule must be provably able to FAIL, because a
 * validator that cannot reject is not a validator. Each bad shape here is a way the
 * ENGINE actually breaks, read off funnel-engine.js — and every one is silent until a
 * stranger hits it.
 *
 * Zero dependencies on purpose. This repo's browser tests need playwright, which is not
 * installed on Rahaid's machine, and a guard that cannot run is not a guard.
 *
 *   node test-funnel-builder.mjs
 */
import { readFileSync } from 'node:fs';

let fails = 0;
const ok = (name, cond, detail) => {
  if (cond) console.log('  ok   ' + name);
  else { fails++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
};

const html = readFileSync('tools/funnel-builder.html', 'utf8');

/* Lift a function out of the shipped file by counting braces, so the test runs the REAL
 * code rather than a copy of it. A failed lift throws — it must never degrade into
 * "0 tests passed". */
function lift(name) {
  const at = html.indexOf('function ' + name + '(');
  if (at === -1) throw new Error(`tools/funnel-builder.html no longer declares ${name}() — the builder and this test have diverged`);
  const open = html.indexOf('{', at);
  /* Braces must be counted OUTSIDE literals. The first version counted raw characters
     and broke immediately on this very file: problems() contains the string '{{' and the
     regex /\{\{(\w+)/g, so the count never returned to zero and the lift threw. It threw
     loudly, which is the only reason this was a five-minute fix rather than a test that
     quietly measured a truncated function. */
  let depth = 0, prev = '';
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (c === '"' || c === "'" || c === '`') {                       // string literal
      for (i++; i < html.length; i++) {
        if (html[i] === '\\') i++;
        else if (html[i] === c) break;
      }
      prev = c; continue;
    }
    if (c === '/' && html[i + 1] === '/') { i = html.indexOf('\n', i); if (i < 0) break; prev = '\n'; continue; }
    if (c === '/' && html[i + 1] === '*') { i = html.indexOf('*/', i) + 1; prev = '/'; continue; }
    /* A '/' is a regex literal rather than division when what precedes it cannot end an
       expression. Standard heuristic, and sufficient for our own source. */
    if (c === '/' && /[([{,;:=!&|?+\-*%~^]|^$/.test(prev)) {
      for (i++; i < html.length; i++) {
        if (html[i] === '\\') i++;
        else if (html[i] === '[') { for (i++; i < html.length && html[i] !== ']'; i++) if (html[i] === '\\') i++; }
        else if (html[i] === '/') break;
      }
      prev = '/'; continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return html.slice(at, i + 1);
    if (!/\s/.test(c)) prev = c;
  }
  throw new Error(`${name}() does not close — tools/funnel-builder.html is malformed`);
}

/* problems() reads `cfg` from its closure, so it is bound as a parameter here. */
const validate = new Function('cfg', lift('problems') + '\nreturn problems();');
const starter = new Function(lift('starter') + '\nreturn starter();');

const clone = (o) => JSON.parse(JSON.stringify(o));

console.log('— the round trip: the builder must accept the funnel that is already live —');
const live = JSON.parse(readFileSync('funnels/apply.json', 'utf8'));
const liveProblems = validate(live);
ok('funnels/apply.json validates clean', liveProblems.length === 0, liveProblems.join(' | '));

console.log('— the starter must itself be shippable —');
const base = starter();
const baseProblems = validate(base);
ok('starter funnel validates clean', baseProblems.length === 0, baseProblems.join(' | '));
ok('starter has a real endpoint, not a placeholder', base.endpoint === '/api/submit-lead');
ok('starter maps a payload', Object.keys(base.payload || {}).length > 0);

console.log('— the gate, red side: every rule must be able to fail —');
const bad = (label, mutate, expect) => {
  const c = clone(base);
  mutate(c);
  const p = validate(c);
  const hit = p.some((x) => x.toLowerCase().includes(expect.toLowerCase()));
  ok(label, hit, p.length ? 'got: ' + p.join(' | ') : 'validator returned NO problems');
};

bad('name with a slash is rejected (f.html whitelists a slug)', (c) => { c.name = 'a/b'; }, 'slug');
bad('name with a dot is rejected', (c) => { c.name = 'a.json'; }, 'slug');
bad('capitals in the name are rejected', (c) => { c.name = 'Apply'; }, 'slug');
bad('missing endpoint is caught', (c) => { c.endpoint = ''; }, 'nowhere');
bad('a step with no key is caught', (c) => { c.steps[0].key = ''; }, 'no key');
bad('a key the payload tokeniser cannot express is caught', (c) => {
  c.steps[0].key = 'business-name'; c.payload = { x: '{{email}}' };
}, 'must start with a letter');
bad('a duplicate key is caught', (c) => {
  c.steps[1].key = c.steps[0].key;
  c.payload = { a: '{{' + c.steps[0].key + '}}' };
}, 'duplicate');
bad('a step with no question is caught', (c) => { c.steps[0].q = ''; }, 'no question');
bad('a choice step with one option is caught', (c) => {
  c.steps[0] = { key: 'pick', type: 'choice', q: 'Which?', options: ['Only one'] };
  c.payload = { a: '{{pick}}', b: '{{email}}' };
}, 'at least two options');
bad('a blank option is caught', (c) => {
  c.steps[0] = { key: 'pick', type: 'choice', q: 'Which?', options: ['One', '  '] };
  c.payload = { a: '{{pick}}', b: '{{email}}' };
}, 'blank');
bad('a field with no id is caught (answers are read by input id)', (c) => { c.steps[0].fields[0].id = ''; }, 'no id');
bad('required set on a field whose id differs from the step key is caught', (c) => {
  c.steps[0].fields[0].id = 'somethingElse';
  c.payload = { a: '{{email}}' };
}, 'can never be passed');
bad('a payload token matching no step is caught', (c) => { c.payload.ghost = '{{nosuchkey}}'; }, 'matches no step');
bad('an empty payload is caught', (c) => { c.payload = {}; }, 'no payload');

console.log('— v1 must be gone, not merely unused —');
/* Asserted against the file with COMMENTS STRIPPED. The first version of these checks
 * failed on the rewritten file, because its header comment explains the fix and therefore
 * names every string the check was hunting for: forge/tools/funnel-engine.html, #8B5CF6,
 * KaizenForge. A guard that cannot tell a live value from a historical note punishes you
 * for documenting the bug you fixed — the same reason check-names.py in rahaid-os reads
 * only what a person SEES. What the page USES is what matters here. */
const code = html
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');
ok('comment stripping left the file intact', code.length > 8000 && code.includes('function problems'));
ok('no embedded standalone engine template', !code.includes('engineTpl'));
ok('no standalone .html export', !/download\s*=\s*['"]?funnel-/.test(code) && !code.includes('buildHTML'));
ok('no reference to the non-existent forge/tools engine', !code.includes('forge/tools/funnel-engine.html'));
ok('retired COSMIC palette gone (#8B5CF6)', !/#8B5CF6/i.test(code));
ok('retired COSMIC ground gone (#0D0B1A)', !/#0D0B1A/i.test(code));
ok('no KaizenForge branding on a KaizenEvol tool', !/KaizenForge/i.test(code));
ok('v1 localStorage key not reused (its model is incompatible)', !code.includes("'kf_builder_v1'"));
ok("step types offered are exactly the engine's", ['choice', 'text', 'email', 'long'].every((t) => code.includes('value="' + t + '"')));
ok('no step type the engine cannot render', !/NEW_STEP\s*=\s*\{[^}]*slider/.test(html) && !html.includes('scoreBands'));

console.log('— the preview must not contaminate live data —');
ok('export writes a .json', /download\s*=\s*cfg\.name\s*\+\s*'\.json'/.test(html));
ok('preview loads the real engine', html.includes('src="/funnel-engine.js"'));
ok('preview loads the real stylesheet', html.includes('href="/funnel.css"'));
ok('preview stubs sendBeacon (ke_funnel_events is what the dashboard panel reads)',
   /navigator\.sendBeacon\s*=\s*function/.test(html));
ok('preview intercepts /api/ so no lead is created', html.includes('indexOf("/api/")'));

console.log(fails ? `\n${fails} failure(s)` : '\nFUNNEL BUILDER CLEAN');
process.exit(fails ? 1 : 0);
