/* Every piece of visible text must meet WCAG AA against the ground it sits on.
 *
 * Written 2026-09-11 after a head-to-head audit measured three stable token
 * pairs failing on the live site: --stone on --page at 3.4:1 (the hero eyebrow
 * and the footer copyright), --muted on --hairline at 3.64:1, and --stone on
 * --hairline at 2.48:1. None of them are borderline and none had ever been
 * measured, because the palette was only ever checked pair-by-pair by eye.
 *
 * --stone (#8A857C) reaches AA on NOTHING in the palette. --muted (#6E6A63)
 * reaches it on --page and --recess only. --ink always passes. That is the
 * whole rule and this file is what enforces it against real rendered output
 * rather than against the token list, because a token is fine until something
 * puts 11px of it on the wrong ground.
 *
 * Elements that are deliberately dimmed mid-animation (the Kaizen Loop's
 * inactive cards carry their own opacity) are skipped: an element is measured
 * only when it and every ancestor are fully opaque. An earlier version of this
 * measurement counted those and reported 1.6:1 "failures" that were simply the
 * carousel doing its job — a check that cannot tell a state from a defect
 * produces findings nobody can act on.
 */
import { chromium } from 'playwright';
import { readdirSync } from 'fs';

const BASE = process.env.BASE || 'http://localhost:8899';
const SKIP = new Set(['crm.html','dashboard.html','portal.html','onboard.html','booked.html',
                      '404.html','hero-lab.html','motion-lab.html','lab-cta.html','showcase-home.html']);
const pages = readdirSync('.').filter(f => f.endsWith('.html') && !SKIP.has(f));
const WIDTHS = [390, 1440];

const probe = () => {
  const lum = c => { const [r,g,b] = c.map(v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }); return .2126*r+.7152*g+.0722*b; };
  const nums = s => { const m = String(s).match(/[\d.]+/g); return m ? m.map(Number) : null; };
  const opaqueChain = el => { let n = el; while (n && n !== document.documentElement) { if (parseFloat(getComputedStyle(n).opacity) < 1) return false; n = n.parentElement; } return true; };
  /* Composite every translucent layer, do not skip them. `.cell` is
     rgba(252,252,250,.86) over a --hairline grid: an earlier version required
     alpha > 0.95 and so reported the cell text as sitting on #D8D4CC at
     3.64:1, when the real ground composites to near-white and it passes. A
     check that reads the wrong ground invents failures as readily as it hides
     them. */
  const groundOf = el => {
    const layers = [];
    let n = el;
    while (n) {
      const c = nums(getComputedStyle(n).backgroundColor);
      if (c) {
        const a = c[3] === undefined ? 1 : c[3];
        if (a > 0.001) { layers.push([c.slice(0,3), a]); if (a >= 0.999) break; }
      }
      n = n.parentElement;
    }
    let out = [255,255,255];
    for (let i = layers.length - 1; i >= 0; i--) {
      const [c, a] = layers[i];
      out = out.map((v,k) => c[k]*a + v*(1-a));
    }
    return out.map(Math.round);
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length || !el.textContent.trim()) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') continue;
    if (!opaqueChain(el)) continue;
    const fgRaw = nums(s.color); if (!fgRaw) continue;
    const a = fgRaw[3] === undefined ? 1 : fgRaw[3];
    const bg = groundOf(el);
    const fg = fgRaw.slice(0,3).map((v,i) => v*a + bg[i]*(1-a));
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1,L2)+.05) / (Math.min(L1,L2)+.05);
    const size = parseFloat(s.fontSize), weight = parseInt(s.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need) out.push({
      ratio: +ratio.toFixed(2), need,
      fg: `rgb(${fg.map(Math.round).join(',')})`, bg: `rgb(${bg.join(',')})`,
      size: Math.round(size), weight,
      text: el.textContent.trim().replace(/\s+/g,' ').slice(0,44)
    });
  }
  return out;
};

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let fail = 0, checked = 0;
for (const w of WIDTHS) {
  const ctx = await b.newContext({ viewport:{width:w,height:900}, ...(w < 500 ? {isMobile:true,hasTouch:true} : {}) });
  for (const f of pages) {
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${f}`, { waitUntil:'domcontentloaded' });
    await p.waitForTimeout(500);
    const bad = await p.evaluate(probe);
    await p.close();
    checked++;
    const seen = new Set();
    for (const x of bad) {
      const k = `${x.fg}|${x.bg}|${x.size}|${x.weight}`;
      if (seen.has(k)) continue;
      seen.add(k);
      fail++;
      console.log(`FAIL  ${f} @${w}px  ${x.ratio}:1 (needs ${x.need})  ${x.fg} on ${x.bg} @${x.size}px/${x.weight}  "${x.text}"`);
    }
  }
  await ctx.close();
}
await b.close();
console.log(`\n${checked} page/width combos checked, ${fail} distinct contrast failure(s)`);
process.exit(fail ? 1 : 0);
