/* An emptied cloud lead book must STAY empty.
 *
 * The lead book was cleared in Supabase (379 reno leads archived to
 * ke_leads_kaizendesk). Every browser still holding the old copy re-pushed it,
 * because both sync paths tested `remote.length > 0` and treated an empty
 * array the same as a missing row. _cloudPull returns null when the row is
 * ABSENT and [] when someone emptied it on purpose — that difference is the
 * whole fix, and these cases pin it.
 *
 * Driven off the shipped code between the LEAD-SYNC markers in crm.html. A
 * copied-out version would drift and pass forever.
 */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./crm.html', import.meta.url), 'utf8');
const a = html.indexOf('/* LEAD-SYNC-START');
const b = html.indexOf('/* LEAD-SYNC-END */');
if (a < 0 || b < 0) throw new Error('LEAD-SYNC markers not found in crm.html');
const core = html.slice(a, b);
if (!core.includes('_adoptLeads')) throw new Error('_adoptLeads not found between markers');

const LEADS_KEY = 'ke_leads';

function load({ local, notesFocused = false }) {
  const store = new Map();
  if (local !== undefined) store.set(LEADS_KEY, JSON.stringify(local));
  const pushed = [];
  const rendered = [];
  const scope = {
    LEADS_KEY,
    _notesFocused: notesFocused,
    localStorage: { setItem(k, v) { store.set(k, v); }, getItem(k) { return store.get(k) ?? null; } },
    loadLeads() { try { return JSON.parse(store.get(LEADS_KEY) || '[]'); } catch (e) { return []; } },
    _cloudPush(k, v) { pushed.push([k, v]); return Promise.resolve(); },
    renderLeads() { rendered.push('leads'); },
    renderLeadStats() { rendered.push('stats'); },
    renderOutreachQueue() { rendered.push('queue'); },
  };
  const fn = new Function(...Object.keys(scope), core + '\n;return {_adoptLeads};');
  const { _adoptLeads } = fn(...Object.values(scope));
  return {
    _adoptLeads, pushed, rendered,
    stored: () => (store.has(LEADS_KEY) ? JSON.parse(store.get(LEADS_KEY)) : undefined),
  };
}

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });
const LEADS = [{ id: '1' }, { id: '2' }, { id: '3' }];

/* 1 — THE BUG. The row exists and is empty; the browser holds the old 379.
      An empty remote is a deletion someone made on purpose. */
{
  const s = load({ local: LEADS });
  await s._adoptLeads([], { seed: true });
  check('emptied remote -> local cleared', JSON.stringify(s.stored()) === '[]', JSON.stringify(s.stored()));
  check('emptied remote -> nothing pushed back', s.pushed.length === 0, JSON.stringify(s.pushed));
  check('emptied remote -> re-rendered', s.rendered.length === 3, JSON.stringify(s.rendered));
}

/* 2 — the row is genuinely ABSENT (first ever boot). Seeding from local is
      correct here, and is the behaviour case 1 must not take away. */
{
  const s = load({ local: LEADS });
  await s._adoptLeads(null, { seed: true });
  check('absent row -> local seeded up', s.pushed.length === 1 && s.pushed[0][1].length === 3, JSON.stringify(s.pushed));
  check('absent row -> local kept', s.stored().length === 3, String(s.stored().length));
}

/* 3 — absent row and nothing local. Nothing to seed. */
{
  const s = load({ local: [] });
  await s._adoptLeads(null, { seed: true });
  check('absent row, empty local -> no push', s.pushed.length === 0, JSON.stringify(s.pushed));
}

/* 4 — the live-sync path never seeds. A 60s tick that pushed a stale local
      book on a failed pull is the clobber bug wearing a timer. */
{
  const s = load({ local: LEADS });
  await s._adoptLeads(null);
  check('live sync, absent row -> never pushes', s.pushed.length === 0, JSON.stringify(s.pushed));
}

/* 5 — ordinary adopt. */
{
  const s = load({ local: [] });
  await s._adoptLeads(LEADS, { seed: true });
  check('populated remote -> adopted', s.stored().length === 3, String(s.stored().length));
}

/* 6 — remote identical to local: no re-render. Repainting the list under a
      typing user every 60s is what _notesFocused exists to avoid. */
{
  const s = load({ local: LEADS });
  await s._adoptLeads(LEADS);
  check('identical remote -> no re-render', s.rendered.length === 0, JSON.stringify(s.rendered));
}

/* 7 — notes focused: adopt the data, do not repaint the textarea away. */
{
  const s = load({ local: LEADS, notesFocused: true });
  await s._adoptLeads([], { rerender: false });
  check('notes focused -> data adopted', JSON.stringify(s.stored()) === '[]', JSON.stringify(s.stored()));
  check('notes focused -> no re-render', s.rendered.length === 0, JSON.stringify(s.rendered));
}

/* 8 — a non-array, non-null value (a corrupt row) is not a lead book. Do not
      write it into localStorage. */
{
  const s = load({ local: LEADS });
  await s._adoptLeads({ oops: true });
  check('corrupt remote -> local untouched', s.stored().length === 3, String(s.stored().length));
}

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '  -> ' + r.detail}`);
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
