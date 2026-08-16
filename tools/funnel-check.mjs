/* Verifies the funnel tracker by DRIVING the real form, not by reading the diff.
   Shape-agnostic: fills whatever visible inputs the current step has and clicks
   whatever advances it, so it works across 2-, 3- and 4-step forms and on pages
   carrying more than one form. */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const target = process.argv[2] || 'contact.html';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

const tracked = [];
let submitPosted = false;

await page.route('**/api/track-funnel', async (route) => {
  try { tracked.push(JSON.parse(route.request().postData())); } catch { /* ignore */ }
  await route.fulfill({ status: 204, body: '' });
});
await page.route('**/api/submit-lead', async (route) => {
  submitPosted = true;
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
});

await page.goto(`${BASE}/${target}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);

const evs = () => tracked.map((t) => t.event + (t.value ? ':' + t.value : ''));
const afterLoad = evs();

const form = page.locator('form:has(.lf-step)').first();
const chipCount = await form.locator('.lf-chip').count();
let chipLabel = '';
if (chipCount) {
  const chip = form.locator('.lf-chip').first();
  chipLabel = (await chip.getAttribute('data-trade')) || '';
  await chip.click();
  await page.waitForTimeout(250);
}

const sample = (t) => (t === 'email' ? 'check@example.com' : t === 'tel' ? '07700900000' : 'Verification Test Ltd');

let beforeBack = 0, afterBack = 0, didBack = false;

for (let pass = 0; pass < 5; pass++) {
  const inputs = form.locator('.lf-step:not([hidden]) input:visible, .lf-step:not([hidden]) select:visible');
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i);
    const tag = await el.evaluate((e) => e.tagName.toLowerCase());
    if (tag === 'select') { await el.selectOption({ index: 1 }).catch(() => {}); continue; }
    const type = (await el.getAttribute('type')) || 'text';
    if (type === 'hidden') continue;
    await el.fill(sample(type)).catch(() => {});
  }

  if (pass === 1 && !didBack) {
    const back = form.locator('.lf-step:not([hidden]) [data-back]:visible').first();
    if (await back.count()) {
      beforeBack = tracked.length;
      await back.click(); await page.waitForTimeout(200);
      const fwd = form.locator('.lf-step:not([hidden]) [data-next]:visible').first();
      if (await fwd.count()) { await fwd.click(); await page.waitForTimeout(250); }
      afterBack = tracked.length; didBack = true;
    }
  }

  const next = form.locator('.lf-step:not([hidden]) [data-next]:visible').first();
  if (await next.count()) { await next.click(); await page.waitForTimeout(250); continue; }

  const submit = form.locator('.lf-step:not([hidden]) button[type="submit"]:visible').first();
  if (await submit.count()) { await submit.click(); await page.waitForTimeout(800); }
  break;
}

const final = evs();
await browser.close();

const checks = [
  ['view fired on load',        afterLoad.includes('view')],
  ['step1 fired on load',       afterLoad.includes('step:1')],
  ['chip fired with label',     !chipCount || final.includes('chip:' + chipLabel)],
  ['advanced past step 1',      final.includes('step:2')],
  ['submit POSTed',             submitPosted],
  ['submit event fired',        final.includes('submit')],
  ['Back did not double-count', !didBack || afterBack === beforeBack],
  ['no duplicate events',       new Set(final).size === final.length],
];

console.log(`\nPAGE: ${target}`);
console.log('events:', JSON.stringify(final));
let fail = 0;
for (const [label, ok] of checks) { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) fail++; }
console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(fail ? 1 : 0);
