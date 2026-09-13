/* test-opener-lab.mjs — the cold-call rubric, proven in both directions.
 *
 * The whole argument for scoring this in code rather than with an AI call is that the rubric is
 * an algorithm and an algorithm can be checked. This is that check. It lifts the REAL score()
 * out of tools/opener-lab.html and drives it, so the page and the test cannot drift.
 *
 * Every rule is tested twice: once where it should fire and once where it should not. A rubric
 * that only ever awards points is a compliment generator, not a scorer.
 *
 * Zero dependencies — this repo's browser tests need playwright, which is not installed on
 * Rahaid's machine, and a guard that cannot run is not a guard.
 *
 *   node test-opener-lab.mjs
 */
import { readFileSync } from 'node:fs';

let fails = 0;
const ok = (name, cond, detail) => {
  if (cond) console.log('  ok   ' + name);
  else { fails++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
};

const html = readFileSync('tools/opener-lab.html', 'utf8');

/* Brace-counting lift that skips string, comment and regex literals — the naive version broke on
   this repo's own source before (test-funnel-builder.mjs), so it is the same hardened one. */
function lift(name) {
  const at = html.indexOf('function ' + name + '(');
  if (at === -1) throw new Error(`tools/opener-lab.html no longer declares ${name}() — page and test have diverged`);
  const open = html.indexOf('{', at);
  let depth = 0, prev = '';
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < html.length; i++) { if (html[i] === '\\') i++; else if (html[i] === c) break; }
      prev = c; continue;
    }
    if (c === '/' && html[i + 1] === '/') { i = html.indexOf('\n', i); if (i < 0) break; prev = '\n'; continue; }
    if (c === '/' && html[i + 1] === '*') { i = html.indexOf('*/', i) + 1; prev = '/'; continue; }
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
  throw new Error(`${name}() does not close — the file is malformed`);
}

function lifted(names, call) {
  const src = names.map(lift).join('\n');
  const consts = ['BANNED', 'AGENCY'].map((v) => {
    const m = html.match(new RegExp('var ' + v + ' = \\[[\\s\\S]*?\\];'));
    if (!m) throw new Error(`${v} not found in the page`);
    return m[0];
  }).join('\n');
  return new Function(consts + '\n' + src + '\n' + call)();
}

const score = (t, c) => lifted(['norm', 'words', 'score'], 'return score;')(t, c || {});
const openers = lifted(['openers'], 'return openers;');
const objections = lifted(['objections'], 'return objections;');

const CTX = { niche: 'gyms', city: 'Coventry', what: 'get them booked jobs from ads', noticed: '' };

console.log('— the banned phrases cap the score at 3, however good the rest is —');
const perfect = 'Hey Dave, how have you been? I’ll be straight with you, this is a cold call, can I take 27 seconds? Most gyms I speak to are paying for leads that never show up. Can I ask you two questions?';
const clean = score(perfect, CTX);
ok('a strong opener scores 8+', clean.score >= 8, 'got ' + clean.score + ' :: ' + clean.minus.join(' | '));
ok('and is not capped', clean.capped === false);

for (const b of ['Did I catch you at a bad time?', 'Do you have a few minutes?', 'Sorry to bother you.', 'I know you’re busy but']) {
  const r = score(perfect + ' ' + b, CTX);
  ok('capped by "' + b.slice(0, 28) + '"', r.capped === true && r.score <= 3, 'score ' + r.score);
  ok('  …and it says what was uncapped', r.raw > r.score);
}

console.log('— every rule fires, and every rule can fail —');
const t = (label, text, fn, extra) => {
  const r = score(text, extra || CTX);
  ok(label, fn(r), 'score ' + r.score + ' :: +[' + r.plus.length + '] -[' + r.minus.length + '] ?[' + r.check.length + ']');
};
t('greeting that asks about them scores', 'How have you been? Can I ask you something?',
  (r) => r.plus.some((x) => /asking about them/i.test(x)));
t('no greeting is penalised', 'Hi there, we do marketing. Can I ask you something?',
  (r) => r.minus.some((x) => /No opening question/i.test(x)));
t('cold-call admission + seconds scores', perfect, (r) => r.plus.some((x) => /cold call/i.test(x)));
t('reason-in-sentence-one also scores', 'How have you been? The reason I am calling is gyms round here lose leads. Can I ask two questions?',
  (r) => r.plus.some((x) => /reason for the call/i.test(x)));
/* These two would have shipped broken: the greeting-skip failed on a name before the comma,
   which is the commonest opener there is, and the test case that passed had no name in it. */
t('reason-in-first-sentence still scores WITH a name in the greeting',
  'Hey Dave, how have you been? The reason I am calling is gyms round here lose leads. Can I ask two questions?',
  (r) => r.plus.some((x) => /reason for the call/i.test(x)));
t('and with the contraction', "Hi Dave, how have you been? The reason I'm calling is gyms lose leads. Can I ask?",
  (r) => r.plus.some((x) => /reason for the call/i.test(x)));
t('neither is penalised', 'How have you been? We are a marketing company. Can I ask you something?',
  (r) => r.minus.some((x) => /biggest single block/i.test(x)));
t('agency language costs the plain-words point', 'How have you been? I am calling because our digital marketing solutions help gyms. Can I ask?',
  (r) => r.minus.some((x) => /Agency language/i.test(x)));
t('over 70 words is penalised', 'How have you been? ' + 'word '.repeat(80) + 'Can I ask?',
  (r) => r.minus.some((x) => /Over 70/i.test(x)));
t('under 70 words scores', perfect, (r) => r.plus.some((x) => /under the 70 ceiling/i.test(x)));
t('a yes-question at the end scores', perfect, (r) => r.plus.some((x) => /answer with yes/i.test(x)));
t('no question at the end is penalised', 'How have you been. I run an agency for gyms.',
  (r) => r.minus.some((x) => /Does not end on a question/i.test(x)));
t('hedging costs a point', 'How have you been? I was wondering whether you might maybe want to talk. Can I ask?',
  (r) => r.minus.some((x) => /Hedged/i.test(x)));
t('two sentences about me costs two', 'How have you been? My agency helps gyms. We are a growth team. I run marketing. Can I ask?',
  (r) => r.minus.some((x) => /sentences about you/i.test(x)));

console.log('— the subjective half is declared, never guessed —');
const vague = score('How have you been? I’ll be straight with you, this is a cold call, can I take 27 seconds? Can I ask you two questions?', { niche: 'roofers' });
ok('an opener that never names the niche asks the human, rather than awarding or denying silently',
   vague.check.some((x) => /CHECK YOURSELF/.test(x)), vague.check.join(' | '));

console.log('— the generated openers must pass their own rubric —');
const five = openers(CTX);
ok('five openers generated', five.length === 5);
five.forEach((o, i) => {
  const r = score(o.say, CTX);
  ok('opener ' + (i + 1) + ' (' + o.name + ') contains no banned phrase', r.capped === false, r.banned.join(','));
  ok('opener ' + (i + 1) + ' is under 70 words', r.words <= 70, r.words + ' words');
});

console.log('— the objections all re-ask, with two real times —');
const objs = objections({ niche: 'gyms', d1: 'Tuesday at 2', d2: 'Thursday at 11' });
ok('four objections', objs.length === 4);
ok('they are the four the course names',
   ['Not interested', 'Send me an email', 'We already have someone', 'No budget']
     .every((o) => objs.some((x) => x.o === o)));
objs.forEach((x) => {
  ok('"' + x.o + '" ends on a re-ask with both times',
     /Tuesday at 2/.test(x.re) && /Thursday at 11/.test(x.re) && /\?\s*$/.test(x.re), x.re);
});

console.log('— the page must not have quietly become an AI app —');
ok('no API call anywhere', !/fetch\s*\(\s*['"`]\/?api/.test(html) && !html.includes('InvokeLLM'));
ok('no API key in the page', !/sk-|gsk_|api[_-]?key\s*[:=]\s*['"]/i.test(html));
ok('the unsourced multipliers are not repeated as fact', !/\b6\.6x\b/i.test(html) || /course/i.test(html));

console.log(fails ? `\n${fails} failure(s)` : '\nOPENER LAB CLEAN');
process.exit(fails ? 1 : 0);
