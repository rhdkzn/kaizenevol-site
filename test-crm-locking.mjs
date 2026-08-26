/* CRM optimistic-locking guard — the fixture for OPS-LRN-001's clobber family.
 *
 * The guard refuses a write whose base version is stale. That is correct for a
 * REAL conflict and wrong for mere staleness, and the difference is what four
 * previous fixes missed. These cases pin both halves down.
 *
 * The sync core is read out of crm.html between the SYNC-CORE markers, so this
 * drives the SHIPPED code. A copied-out version would drift and pass forever.
 */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./crm.html', import.meta.url), 'utf8');
const core = html.slice(html.indexOf('/* SYNC-CORE-START'), html.indexOf('/* SYNC-CORE-END */'));
if (!core.includes('_cloudPush')) throw new Error('sync core not found between markers');

/* ---- a PostgREST stub that behaves like the real thing ---- */
function makeDb(initial) {
  const rows = new Map(Object.entries(initial ?? {}));
  const db = {
    rows,
    net: null,          // set to an Error to simulate a dropped request
    from() {
      let mode, payload, id, expectVer;
      const q = {
        update(v) { mode = 'update'; payload = v; return q; },
        insert(v) { mode = 'insert'; payload = v; return q; },
        select() { return q; },
        eq(col, val) { if (col === 'id') id = val; else if (col === 'updated_at') expectVer = val; return q; },
        single() { return q.then(r => r); },
        then(res) { return Promise.resolve(run()).then(res); },
      };
      function run() {
        if (db.net) return { data: null, error: { message: String(db.net) } };
        if (mode === 'update') {
          const row = rows.get(id);
          if (!row || row.updated_at !== expectVer) return { data: [], error: null };   // 0 rows = stale
          rows.set(id, { ...row, data: payload.data, updated_at: payload.updated_at });
          return { data: [{ updated_at: payload.updated_at }], error: null };
        }
        if (mode === 'insert') {
          if (rows.has(payload.id)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          rows.set(payload.id, { ...payload });
          return { data: [{ updated_at: payload.updated_at }], error: null };
        }
        const row = rows.get(id);                                                        // select
        if (!row) return { data: null, error: { message: 'no rows' } };
        return { data: { data: row.data, updated_at: row.updated_at }, error: null };
      }
      return q;
    },
  };
  return db;
}

function load(db) {
  /* _syncConflict lives INSIDE the markers, so we stub `document` and let the
     real banner code run. Stubbing the function itself would shadow the shipped
     one and test nothing. */
  const el = { style: { display: 'none' } };
  const scope = {
    _sb: db,
    document: { getElementById: (id) => (id === 'syncConflict' ? el : null) },
    console: { warn() {} },
    localStorage: { _m: new Map(), setItem(k, v) { this._m.set(k, v); }, getItem(k) { return this._m.get(k) ?? null; } },
  };
  const fn = new Function(...Object.keys(scope), core + '\n;return {_cloudPush,_cloudPull,_ver,_bootDone:typeof _bootDone===\'function\'?_bootDone:undefined,_syncWake:typeof _syncWake===\'function\'?_syncWake:undefined};');
  const api = fn(...Object.values(scope));
  return { ...api, banner: () => el.style.display === 'flex' };
}

const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail }); };
const KEY = 'ke_leads';

/* 1 — transient pull failure, then a save.
      No base was ever recorded, so we cannot know whether our local blob is
      derived from the remote. Pushing it anyway IS the clobber. The correct
      behaviour is to refuse, keep the remote intact and say so — this pins that,
      because "make the banner go away" is exactly how the previous four fixes
      turned into data loss. */
{
  const db = makeDb({ [KEY]: { id: KEY, data: [{ id: 'a' }], updated_at: 't1' } });
  const s = load(db);
  s._bootDone();                        // post-boot: a real user edit is in flight
  db.net = new Error('offline');
  await s._cloudPull(KEY);              // fails, records no base and no version
  db.net = null;
  await s._cloudPush(KEY, [{ id: 'a' }, { id: 'b' }]);
  check('pull failed, unknown base -> remote NOT clobbered',
        JSON.stringify(db.rows.get(KEY).data) === JSON.stringify([{ id: 'a' }]),
        JSON.stringify(db.rows.get(KEY).data));
  check('pull failed, unknown base -> user told', s.banner(), `banner=${s.banner()}`);
}

/* 2 — stale version, but the remote data is UNCHANGED from what we edited.
      This is the backgrounded phone and the two unsubscribed keys: the version
      moved, the content did not. Retrying loses nothing. */
{
  const base = [{ id: 'a' }];
  const db = makeDb({ [KEY]: { id: KEY, data: base, updated_at: 't1' } });
  const s = load(db);
  await s._cloudPull(KEY);                                        // base + version t1
  db.rows.set(KEY, { id: KEY, data: base, updated_at: 't2' });    // version bumped, same content
  await s._cloudPush(KEY, [{ id: 'a' }, { id: 'b' }]);
  check('stale version, same content -> no banner', !s.banner(), `banner=${s.banner()}`);
  check('stale version, same content -> write landed', db.rows.get(KEY).data.length === 2,
        JSON.stringify(db.rows.get(KEY).data));
}

/* 3 — THE ORIGINAL CLOBBER. Remote genuinely diverged from our base. This one
      MUST still refuse and banner. If this ever goes green-by-accident the
      data-loss bug is back. */
{
  const db = makeDb({ [KEY]: { id: KEY, data: [{ id: 'a' }], updated_at: 't1' } });
  const s = load(db);
  s._bootDone();                        // a user's stale write, not boot seeding
  await s._cloudPull(KEY);
  db.rows.set(KEY, { id: KEY, data: [{ id: 'a' }, { id: 'FROM_OTHER_DEVICE' }], updated_at: 't2' });
  await s._cloudPush(KEY, [{ id: 'a' }, { id: 'mine' }]);         // stale whole-blob write
  const survived = db.rows.get(KEY).data.some(r => r.id === 'FROM_OTHER_DEVICE');
  check('REAL conflict -> banner raised', s.banner(), `banner=${s.banner()}`);
  check("REAL conflict -> other device's write survived", survived,
        JSON.stringify(db.rows.get(KEY).data));
}

/* 4 — a real network error during the write must never banner. Nothing is known
      to have changed; screaming conflict at a dropped packet is what path 1 did. */
{
  const db = makeDb({ [KEY]: { id: KEY, data: [{ id: 'a' }], updated_at: 't1' } });
  const s = load(db);
  await s._cloudPull(KEY);
  db.net = new Error('offline');
  await s._cloudPush(KEY, [{ id: 'a' }, { id: 'b' }]);
  check('write fails offline -> no banner', !s.banner(), `banner=${s.banner()}`);
}

/* 5 — ten consecutive solo saves. A lock that blocks normal single-user work
      would be worse than the bug it prevents. */
{
  const db = makeDb({ [KEY]: { id: KEY, data: [], updated_at: 't1' } });
  const s = load(db);
  await s._cloudPull(KEY);
  for (let i = 0; i < 10; i++) await s._cloudPush(KEY, Array.from({ length: i + 1 }, (_, n) => ({ id: n })));
  check('ten solo saves -> no banner', !s.banner(), `banner=${s.banner()}`);
  check('ten solo saves -> last write landed', db.rows.get(KEY).data.length === 10,
        String(db.rows.get(KEY).data.length));
}

/* 6 — a genuine network error on the INSERT path must not banner either. Only a
      duplicate key (the row exists) is a version problem; a dropped request is not. */
{
  const db = makeDb({});
  const s = load(db);
  db.net = new Error('offline');
  await s._cloudPush('ke_scraper', { q: 1 });
  check('insert fails offline -> no banner', !s.banner(), `banner=${s.banner()}`);
}

/* 7 — the wake handler. A backgrounded phone misses realtime events, and two of
      the four keys have no subscription at all. Both holes close the same way:
      re-read every key's version on wake. */
{
  const db = makeDb({
    ke_leads:   { id: 'ke_leads',   data: [{ id: 'a' }], updated_at: 't1' },
    ke_scraper: { id: 'ke_scraper', data: { q: 1 },      updated_at: 't1' },
  });
  const s = load(db);
  await s._cloudPull('ke_leads');
  await s._cloudPull('ke_scraper');
  db.rows.set('ke_leads',   { id: 'ke_leads',   data: [{ id: 'a' }], updated_at: 't9' });
  db.rows.set('ke_scraper', { id: 'ke_scraper', data: { q: 1 },      updated_at: 't9' });
  check('wake handler exists', typeof s._syncWake === 'function', typeof s._syncWake);
  if (typeof s._syncWake === 'function') {
    await s._syncWake();
    check('wake refreshes every key version',
          s._ver.ke_leads === 't9' && s._ver.ke_scraper === 't9',
          JSON.stringify(s._ver));
  } else check('wake refreshes every key version', false, 'no _syncWake');
}

/* 8 — THE ONE DIEGO HIT. At boot, one of four parallel pulls fails, so no base is
      recorded; the seeding write hits a duplicate key. There is no user edit in
      flight, so "your last change was not saved" is a false statement. Boot must
      adopt the server's state and stay silent. */
{
  const db = makeDb({ [KEY]: { id: KEY, data: [{ id: 'server' }], updated_at: 't1' } });
  const s = load(db);                   // _booting is true until _bootDone()
  db.net = new Error('flaky 5G');
  await s._cloudPull(KEY);              // one pull of four fails
  db.net = null;
  await s._cloudPush(KEY, [{ id: 'stale-local' }]);   // boot seeding push
  check('boot with a failed pull -> NO banner', !s.banner(), `banner=${s.banner()}`);
  check('boot with a failed pull -> server state kept',
        JSON.stringify(db.rows.get(KEY).data) === JSON.stringify([{ id: 'server' }]),
        JSON.stringify(db.rows.get(KEY).data));
}

/* 9 — the same shape AFTER boot must still banner. If this ever goes quiet, the
      guard has been silenced rather than fixed. */
{
  const db = makeDb({ [KEY]: { id: KEY, data: [{ id: 'server' }], updated_at: 't1' } });
  const s = load(db);
  s._bootDone();
  db.net = new Error('offline');
  await s._cloudPull(KEY);
  db.net = null;
  await s._cloudPush(KEY, [{ id: 'mine' }]);
  check('same shape after boot -> banner still raised', s.banner(), `banner=${s.banner()}`);
  check('same shape after boot -> server not clobbered',
        JSON.stringify(db.rows.get(KEY).data) === JSON.stringify([{ id: 'server' }]),
        JSON.stringify(db.rows.get(KEY).data));
}

/* 10 — the boot window must not be able to stay open. If boot throws before
      _bootDone() runs, a timeout closes it; otherwise every refused write would
      silently adopt remote forever and the clobber returns by the side door. */
{
  const core = readFileSync(new URL('./crm.html', import.meta.url), 'utf8');
  const block = core.slice(core.indexOf('/* SYNC-CORE-START'), core.indexOf('/* SYNC-CORE-END */'));
  check('boot window has a timeout backstop',
        /setTimeout\(\s*_bootDone/.test(block), 'no setTimeout(_bootDone) in the core');
}

/* 11 — the banner must clear itself once sync is healthy again. It had no off
      switch at all: one legitimate blip and the red bar stayed up for the rest of
      the session, through every successful save after it. A warning nobody can
      clear is a warning everybody learns to ignore. */
{
  const db = makeDb({ [KEY]: { id: KEY, data: [{ id: 'a' }], updated_at: 't1' } });
  const s = load(db);
  s._bootDone();
  await s._cloudPull(KEY);
  db.rows.set(KEY, { id: KEY, data: [{ id: 'a' }, { id: 'other' }], updated_at: 't2' });
  await s._cloudPush(KEY, [{ id: 'mine' }]);                  // real conflict
  check('conflict raises the banner', s.banner(), `banner=${s.banner()}`);
  await s._cloudPull(KEY);                                    // user reloads / realtime catches up
  await s._cloudPush(KEY, [{ id: 'a' }, { id: 'other' }, { id: 'new' }]);
  check('a write that lands clears the banner', !s.banner(), `banner=${s.banner()}`);
  check('and that write actually landed', db.rows.get(KEY).data.length === 3,
        String(db.rows.get(KEY).data.length));
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '   <- ' + r.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
