import handler from '/home/user/kaizenevol-site/api/ig-comment-webhook.js';

process.env.IG_VERIFY_TOKEN = 'vt-123';
process.env.IG_WEBHOOK_SECRET = 'ws-456';
process.env.IG_PAGE_TOKEN = 'PAGE_TOKEN';
process.env.IG_SELF_ID = '999';

const calls = [];
globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), body: opts && opts.body });
  return { ok: true, json: async () => ({ data: [] }), text: async () => '' };
};

function mockRes() {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  return r;
}

// 1. GET verify — correct token echoes challenge
let res = mockRes();
await handler({ method: 'GET', query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'vt-123', 'hub.challenge': 'CHAL' } }, res);
console.log('verify ok:', res.code === 200 && res.body === 'CHAL');

// 2. GET verify — wrong token rejected
res = mockRes();
await handler({ method: 'GET', query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': 'CHAL' } }, res);
console.log('verify reject:', res.code === 403);

// 3. POST without secret rejected
res = mockRes();
await handler({ method: 'POST', query: {}, body: {} }, res);
console.log('secret reject:', res.code === 403);

// 4. POST gate comment -> DM + public reply + CRM
const event = { object: 'instagram', entry: [{ id: '999', changes: [{ field: 'comments', value: {
  id: 'C1', text: 'site please!', from: { id: '111', username: 'marlowroofing' }, media: { id: 'M1' } } }] }] };
res = mockRes();
calls.length = 0;
await handler({ method: 'POST', query: { secret: 'ws-456' }, body: event }, res);
const dm = calls.find(c => c.url.includes('/me/messages'));
const pub = calls.find(c => c.url.includes('/C1/replies'));
const crm = calls.find(c => c.url.includes('supabase'));
console.log('gate -> DM:', !!dm && dm.body.includes('"comment_id":"C1"'));
console.log('gate -> public reply:', !!pub);
console.log('gate -> CRM:', !!crm, '| 200:', res.code === 200);

// 5. Non-gate comment -> nothing sent
calls.length = 0; res = mockRes();
await handler({ method: 'POST', query: { secret: 'ws-456' }, body: { object: 'instagram', entry: [{ changes: [{ field: 'comments', value: { id: 'C2', text: 'lovely website mate', from: { id: '112', username: 'x' } } }] }] } }, res);
console.log('non-gate ignored:', calls.length === 0 && res.code === 200);

// 6. Own comment (self id) -> ignored, no loop
calls.length = 0; res = mockRes();
await handler({ method: 'POST', query: { secret: 'ws-456' }, body: { object: 'instagram', entry: [{ changes: [{ field: 'comments', value: { id: 'C3', text: 'SITE', from: { id: '999', username: 'kaizenevol' } } }] }] } }, res);
console.log('self ignored:', calls.length === 0);

// 7. "website" must NOT match gate word SITE (word boundary)
calls.length = 0; res = mockRes();
await handler({ method: 'POST', query: { secret: 'ws-456' }, body: { object: 'instagram', entry: [{ changes: [{ field: 'comments', value: { id: 'C4', text: 'nice website', from: { id: '113', username: 'y' } } }] }] } }, res);
console.log('substring not matched:', calls.length === 0);
