/* Attribution: does an ad click actually reach the lead record?
 *
 * Written 2026-09-05 alongside utm.js. Before it, index/apply/contact captured
 * no utm_source, gclid or fbclid at all — we ran paid ads into forms that could
 * not say which ad produced the lead. This guards the whole path, because every
 * link in it can break independently and all of them fail silently:
 *
 *   URL params -> read by utm.js -> carried across same-origin links ->
 *   read again at submit -> POSTed -> whitelisted by the API -> on the record.
 *
 * The silent-failure risk is the point. A lead still arrives when attribution
 * is broken; it just arrives anonymous, and nobody notices until someone asks
 * which campaign is working and the answer is gone.
 *
 * Needs Playwright:  npm i playwright && node test-utm-attribution.mjs
 */
import { chromium } from 'playwright'
import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'

const DIR = new URL('.', import.meta.url).pathname.replace(/\/$/, '')
const srv = http.createServer((q, s) => {
  const path = decodeURIComponent(q.url.split('?')[0])
  const f = DIR + (path === '/' ? '/index.html' : path)
  if (!existsSync(f)) { s.writeHead(404); return s.end('') }
  const ext = path.split('.').pop()
  const type = { html:'text/html', css:'text/css', js:'text/javascript', woff2:'font/woff2',
                 png:'image/png', ico:'image/x-icon', svg:'image/svg+xml', jpg:'image/jpeg' }[ext] || 'text/plain'
  s.writeHead(200, { 'Content-Type': type }); s.end(readFileSync(f))
})
await new Promise(r => srv.listen(0, r))
const port = srv.address().port
const pw = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium'
const browser = await chromium.launch(existsSync(pw) ? { executablePath: pw } : {})

const r = []
const check = (n, pass, d) => r.push([n, pass, d])
const QS = 'utm_source=meta&utm_medium=cpc&utm_campaign=founding5&fbclid=ABC123'

/* --- browser: read, carry, and hand over --------------------------------- */
for (const page of ['index.html', 'apply.html', 'contact.html']) {
  const ctx = await browser.newContext()
  const pg = await ctx.newPage()
  await pg.goto(`http://127.0.0.1:${port}/${page}?${QS}`, { waitUntil: 'load' })
  await pg.waitForTimeout(300)

  const attr = await pg.evaluate(() => window.keAttribution ? window.keAttribution() : 'NO_FUNCTION')
  check(`${page}: utm.js is loaded`, attr !== 'NO_FUNCTION', 'window.keAttribution undefined')
  check(`${page}: captures utm_source`, attr && attr.utm_source === 'meta', JSON.stringify(attr))
  check(`${page}: captures utm_campaign`, attr && attr.utm_campaign === 'founding5', JSON.stringify(attr))
  check(`${page}: captures fbclid`, attr && attr.fbclid === 'ABC123', JSON.stringify(attr))

  /* Carried across our own links, and NOT leaked to anyone else's. */
  const links = await pg.evaluate(() => {
    const out = { internal: [], external: [], special: [] }
    for (const a of document.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href')
      if (/^(mailto:|tel:)/i.test(h)) out.special.push(h)
      else if (a.hostname && a.hostname !== location.hostname) out.external.push(h)
      else if (!/^#/.test(h)) out.internal.push(h)
    }
    return out
  })
  if (links.internal.length) {
    check(`${page}: params carried onto same-origin links`,
      links.internal.every(h => h.includes('utm_source=meta')),
      'undecorated: ' + links.internal.filter(h => !h.includes('utm_source=meta')).slice(0,3).join(' '))
  }
  check(`${page}: params NOT leaked to external links`,
    links.external.every(h => !h.includes('utm_source')),
    'leaked: ' + links.external.filter(h => h.includes('utm_source')).slice(0,3).join(' '))
  check(`${page}: mailto/tel left alone`,
    links.special.every(h => !h.includes('utm_source')),
    'mangled: ' + links.special.filter(h => h.includes('utm_source')).slice(0,3).join(' '))

  /* A visit with no parameters must produce null, not an empty object that
     reads like data in the CRM. */
  const bare = await ctx.newPage()
  await bare.goto(`http://127.0.0.1:${port}/${page}`, { waitUntil: 'load' })
  await bare.waitForTimeout(200)
  const none = await bare.evaluate(() => window.keAttribution && window.keAttribution())
  check(`${page}: direct visit yields null, not empty data`, none === null, JSON.stringify(none))
  await ctx.close()
}

/* --- the payload the form actually POSTs --------------------------------- */
/* Drive the real multi-step form, touching ONLY #go and the .opt buttons inside
 * the active step. An earlier version of this test clicked
 * `button:not([hidden])`, which matched the nav burger, fired transitions.js and
 * hung the run — a reminder that a broad selector in a test is a bug that costs
 * you a session rather than a user. */
{
  const ctx = await browser.newContext()
  const pg = await ctx.newPage()
  let posted = null
  await pg.route('**/api/submit-lead', route => {
    try { posted = JSON.parse(route.request().postData() || '{}') } catch (_) {}
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await pg.goto(`http://127.0.0.1:${port}/apply.html?${QS}`, { waitUntil: 'load' })
  await pg.waitForTimeout(300)

  const total = await pg.$$eval('.step', els => els.length)
  for (let step = 0; step < total + 2 && !posted; step++) {
    await pg.evaluate(() => {
      const s = document.querySelector('.step.on'); if (!s) return
      /* querySelectorAll, not querySelector: the last step asks for the name AND the
         email on one screen since 2026-09-06, and filling only the first left the form
         with no address, failing validation and never POSTing. */
      const fs = s.querySelectorAll('input, textarea')
      if (fs.length) {
        fs.forEach((f) => {
          f.value = f.type === 'email' ? 'law@kaizenevol.com'
                  : f.type === 'url'   ? 'https://example.com'
                  : 'ATTRIBUTION TEST'
          f.dispatchEvent(new Event('input', { bubbles: true }))
        })
      } else {
        const o = s.querySelector('.opt'); if (o) o.click()
      }
    })
    await pg.click('#go', { timeout: 5000 }).catch(() => {})
    await pg.waitForTimeout(150)
  }
  check('apply.html: form POST carries attribution',
    !!(posted && posted.attribution && posted.attribution.utm_source === 'meta'),
    posted ? 'payload: ' + JSON.stringify(posted.attribution) : 'form never POSTed after ' + total + ' steps')
  check('apply.html: attribution rides WITH the lead fields, not instead of them',
    !!(posted && posted.businessName), posted ? 'businessName=' + posted.businessName : 'no POST')
  await ctx.close()
}

/* --- the API whitelist ---------------------------------------------------- */
{
  const mod = await import('./api/submit-lead.js')
  let upserted = null
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('app_data') && opts?.method === 'POST') {
      upserted = JSON.parse(opts.body); return { ok: true, json: async () => ({}), text: async () => '' }
    }
    return { ok: true, json: async () => ([{ data: [] }]), text: async () => '' }
  }
  const res = { statusCode: 0, status (c) { this.statusCode = c; return this }, json () { return this } }
  await mod.default({ method: 'POST', body: {
    businessName: 'TESTCO', email: 'a@b.com',
    attribution: { utm_source: 'meta', utm_campaign: 'founding5', evil: 'DROP TABLE', landing: '/index.html' },
  } }, res)
  globalThis.fetch = realFetch
  const lead = upserted && upserted.data && upserted.data[upserted.data.length - 1]
  check('API: stores attribution on the lead', !!(lead && lead.attribution && lead.attribution.utm_source === 'meta'),
    JSON.stringify(lead && lead.attribution))
  check('API: drops keys not on the whitelist', !!(lead && lead.attribution && lead.attribution.evil === undefined),
    'unwhitelisted key survived: ' + JSON.stringify(lead && lead.attribution))
  check('API: writes a readable Ad: line into notes', !!(lead && /Ad: meta \/ founding5/.test(lead.notes || '')),
    'notes: ' + (lead && lead.notes))
  check('API: source field unchanged for the CRM', !!(lead && lead.source === 'Website'), 'source=' + (lead && lead.source))
}

await browser.close(); srv.close()
let failed = 0
for (const [n, pass, d] of r) { if (!pass) failed++; if (!pass || process.env.VERBOSE) console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${pass ? '' : '   <- ' + (d || '')}`) }
console.log(`\n${r.length - failed}/${r.length} passed`)
process.exit(failed ? 1 : 0)
