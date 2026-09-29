/* Form delivery for reformpilates.fit (Kavita's studio site; we maintain it).

   2026-09-29: both of her forms posted to FormSubmit's /ajax/ endpoint, which
   now answers {"message":"Server Error"} for ANY address, including a made-up
   control one. The waiver gates booking, so every new client was stuck at
   "ERROR — PLEASE EMAIL…". This replaces FormSubmit with the Resend account
   this project already has (same key and verified sender as submit-lead.js), so
   no secret had to move to her project.

   Her script.js treats `success === true || 'true'` as delivered and anything
   else as a failure, and a confirmed waiver is what unlocks booking. So this
   returns {"success":true} ONLY when Resend accepted the email. */

const ALLOWED_ORIGINS = ['https://reformpilates.fit', 'https://www.reformpilates.fit'];
const TO = 'kavfit78@gmail.com';
const MAX_BYTES = 50 * 1024;
const MAX_FIELDS = 80;
const MAX_VALUE = 5000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) { reject(Object.assign(new Error('too large'), { tooLarge: true })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const oneLine = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Vary', 'Origin');
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ success: false, message: 'Origin not allowed' });
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  if (Number(req.headers['content-length'] || 0) > MAX_BYTES) {
    return res.status(413).json({ success: false, message: 'Submission too large' });
  }

  /* Her forms send FormData (multipart). Vercel's body helper does not parse
     multipart, so read the raw stream and let the built-in Response parser do it;
     it handles urlencoded as well. req.body is never touched, so the helper never
     consumes the stream first. */
  let fields;
  try {
    const raw = await readBody(req);
    const fd = await new Response(raw, { headers: { 'content-type': req.headers['content-type'] || '' } }).formData();
    fields = [];
    for (const [k, v] of fd.entries()) {
      if (typeof v !== 'string') continue;           // no file uploads on either form
      fields.push([String(k).slice(0, 200), v.slice(0, MAX_VALUE)]);
      if (fields.length > MAX_FIELDS) break;
    }
  } catch (e) {
    if (e && e.tooLarge) return res.status(413).json({ success: false, message: 'Submission too large' });
    return res.status(400).json({ success: false, message: 'Could not read the form' });
  }

  const get = (name) => (fields.find(([k]) => k === name) || [])[1] || '';

  /* Both forms carry a visually hidden `_honey` input. A person never fills it.
     A bot that does is told it worked, and nothing is sent. */
  if (get('_honey').trim()) return res.status(200).json({ success: true });

  const isWaiver = !!get('Form Version');
  const name = oneLine(get('Full Name') || [get('First Name'), get('Last Name')].filter(Boolean).join(' ')) || 'no name given';
  const email = get('Email').trim();
  const replyTo = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email) ? email : null;

  if (!replyTo) return res.status(400).json({ success: false, message: 'A valid email address is required' });

  // Everything the visitor filled in, in form order. `_`-prefixed fields are
  // FormSubmit settings, not answers. Form Version and Signed At stay: they are
  // what tie a signed waiver to the exact wording that was agreed to.
  const lines = fields
    .filter(([k]) => !k.startsWith('_'))
    .map(([k, v]) => `${k}: ${v.trim() || '-'}`);

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.error('kavita-form: RESEND_API_KEY missing');
    return res.status(500).json({ success: false, message: 'Email is not configured' });
  }

  let r;
  try {
    r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Reformer Pilates website <noreply@mail.kaizenevol.com>',
        to: [TO],
        reply_to: replyTo,
        subject: isWaiver ? `Waiver signed: ${name}` : `Website enquiry: ${name}`,
        text: [
          isWaiver ? 'A health & liability form was signed on reformpilates.fit.' : 'New enquiry from reformpilates.fit.',
          '',
          ...lines,
          '',
          'Reply to this email to answer them directly.',
        ].join('\n'),
      }),
    });
  } catch (e) {
    console.error('kavita-form: Resend unreachable', e);
    return res.status(502).json({ success: false, message: 'Email service unreachable' });
  }

  if (!r.ok) {
    console.error('kavita-form: Resend refused', r.status, await r.text().catch(() => ''));
    return res.status(502).json({ success: false, message: 'Email could not be sent' });
  }
  return res.status(200).json({ success: true });
}
