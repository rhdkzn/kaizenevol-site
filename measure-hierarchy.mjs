/* Re-measures the numbers behind "you don't know what to look at" (OPS-WEB-013).
 * Run it before and after any hierarchy change so the claim is a diff, not an
 * adjective. Everything here comes from the DOM: a screenshot proves what
 * something looks like and nothing about geometry. */
import { chromium, devices } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8899';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
await p.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
const m = await p.evaluate(() => {
  const main = document.querySelector('main') || document.body;
  const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]);
  const sizes = {};
  for (const el of main.querySelectorAll('h1,h2,h3,p,li,div,span,a,button')) {
    if (!el.textContent.trim()) continue;
    if (el.children.length && !/^(P|LI|H1|H2|H3|SPAN|A|BUTTON)$/.test(el.tagName)) continue;
    const s = Math.round(px(el, 'fontSize'));
    sizes[s] = (sizes[s] || 0) + el.textContent.trim().split(/\s+/).length;
  }
  const hero = document.querySelector('.hero h1, h1');
  const bodyDominant = Object.entries(sizes)
    .filter(([s]) => +s >= 12 && +s <= 24)
    .sort((a, b) => b[1] - a[1])[0];
  return {
    words: main.textContent.trim().split(/\s+/).length,
    pageHeightPx: document.documentElement.scrollHeight,
    phoneScreens: +(document.documentElement.scrollHeight / window.innerHeight).toFixed(1),
    sections: main.querySelectorAll('section').length,
    headings: main.querySelectorAll('h2').length,
    sectionEyebrows: [...main.querySelectorAll('section .smallcaps')]
      .filter((e) => !e.closest('.hero')).map((e) => e.textContent.trim()),
    distinctSizes: Object.keys(sizes).map(Number).sort((a, b) => b - a),
    bodyWorkWithin5px: Object.keys(sizes).map(Number)
      .filter((s) => s >= 13 && s <= 22).sort((a, b) => b - a),
    heroPx: hero ? Math.round(px(hero, 'fontSize')) : null,
    dominantBodyPx: bodyDominant ? +bodyDominant[0] : null,
  };
});
m.heroToBody = m.heroPx && m.dominantBodyPx ? +(m.heroPx / m.dominantBodyPx).toFixed(2) : null;
console.log(JSON.stringify(m, null, 2));
await b.close();
