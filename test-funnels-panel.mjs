/* The Funnels panel had never rendered — it sits behind the owner gate, so
   nothing had ever executed loadFunnels()/renderFunnel(). "Built" is not
   "works" (CLAUDE.md Self-Review · Verified).

   This drives the real dashboard.html in a browser with ONLY the Supabase
   client stubbed, so the panel's own code runs: the aggregation, the
   distinct-session counting, the >=5 minimum sample, the worst-drop pick and
   the DOM writes. The RLS read path is proven separately in SQL (authenticated
   reads, anon reads nothing).

   Run: node test-funnels-panel.mjs */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const FILE = 'file://' + path.resolve('dashboard.html');

/* Three fixtures, each asking a different question of the same code. */
const FIXTURES = {
  empty: [],

  /* What is actually in the table today: six step-0 views, no step 1, no
     completions. Every session saw question one and nothing else. */
  liveToday: Array.from({ length: 6 }, (_, i) => ({
    funnel: 'apply', event: 'view', step_key: 'businessName',
    step_index: 0, total_steps: 9, session: 's' + i,
  })),

  /* A funnel with a real shape: a clear cliff at question 3, one small step
     under the minimum sample, and some completions. */
  realistic: (() => {
    const rows = [];
    const reach = [40, 36, 31, 9, 8, 7, 7, 6, 6];   // sessions reaching each step
    reach.forEach((n, i) => {
      for (let s = 0; s < n; s++) {
        rows.push({ funnel: 'apply', event: 'view', step_key: 'q' + i,
                    step_index: i, total_steps: 9, session: 'u' + s });
      }
    });
    for (let s = 0; s < 5; s++) rows.push({ funnel: 'apply', event: 'complete', session: 'u' + s, total_steps: 9 });
    for (let s = 0; s < 4; s++) rows.push({ funnel: 'apply', event: 'submit', session: 'u' + s, total_steps: 9 });
    // a second funnel so the picker has something to switch between
    for (let s = 0; s < 12; s++) rows.push({ funnel: 'diagnosis', event: 'view', step_key: 'd0',
                                             step_index: 0, total_steps: 3, session: 'd' + s });
    return rows;
  })(),
};

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function run(fixtureName, signedIn = true) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // Stub the Supabase client BEFORE the page script runs. Everything else —
  // the gate bypass aside — is the real page.
  await page.addInitScript(({ rows, signedIn }) => {
    window.__rows = rows;
    window.__signedIn = signedIn;
    window.supabase = {
      createClient: () => ({
        from: () => {
          const q = {
            select: () => q, gte: () => q,
            limit: async () => ({ data: window.__rows, error: null }),
          };
          return q;
        },
        auth: {
          getSession: async () => ({ data: { session: window.__signedIn ? { user: {} } : null } }),
          signInWithPassword: async () => ({ error: null }),
          signOut: async () => {},
        },
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {},
      }),
    };
  }, { rows: FIXTURES[fixtureName], signedIn });

  // The page pulls the real Supabase SDK from a CDN, which would overwrite the
  // stub. Block it so window.supabase stays ours.
  await page.route('**/supabase-js*', r => r.abort());
  await page.route('**/chart.js*', r => r.abort());

  await page.goto(FILE);
  await page.waitForFunction(() => typeof window.loadFunnels === 'function');
  await page.evaluate(() => {
    document.getElementById('gate').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
  });
  await page.evaluate(() => window.loadFunnels());
  await page.waitForTimeout(400);

  const out = await page.evaluate(() => ({
    stats: document.getElementById('funnelStatsRow')?.innerText.replace(/\s+/g, ' ').trim() || '',
    steps: document.getElementById('funnelSteps')?.innerText.replace(/\s+/g, ' ').trim() || '',
    options: [...(document.getElementById('funnelPick')?.options || [])].map(o => o.value),
  }));

  await browser.close();
  return { ...out, errors };
}

const empty = await run('empty');
check('empty: no JS errors', empty.errors.length === 0, empty.errors[0]);
check('empty: says it fills in with traffic', /No funnel visits recorded/i.test(empty.steps));

/* The trap this panel would otherwise fall into: an unauthorised read under
   RLS returns [] with no error, so "no rows" and "not allowed" look identical. */
const signedOut = await run('empty', false);
check('signed out: does NOT claim zero traffic', !/No funnel visits recorded/i.test(signedOut.steps),
      signedOut.steps.slice(0, 80));
check('signed out: says it cannot read', /cannot be read|not signed in/i.test(signedOut.steps));

const today = await run('liveToday');
check('liveToday: no JS errors', today.errors.length === 0, today.errors[0]);
check('liveToday: counts 6 starts', /\b6\b/.test(today.stats), today.stats.slice(0, 90));
check('liveToday: reports 0 completions', /\b0\b/.test(today.stats));

const real = await run('realistic');
check('realistic: no JS errors', real.errors.length === 0, real.errors[0]);
check('realistic: picker lists both funnels',
      real.options.includes('apply') && real.options.includes('diagnosis'),
      real.options.join(','));
check('realistic: counts 40 starts', /\b40\b/.test(real.stats), real.stats.slice(0, 110));
check('realistic: finds the q3 cliff', /71%|71 %/.test(real.steps + real.stats),
      'expected the 31->9 drop (71%) to be the worst');
check('realistic: renders a row per step', (real.steps.match(/\n|·/g) || []).length > 0);

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
