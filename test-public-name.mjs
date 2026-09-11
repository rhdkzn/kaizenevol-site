/* Verifies the GOAL, not the edit: no page CARRIES the word "Rahaid" where a reader could reach it.
   textContent, not innerText: innerText skips display:none, and that is exactly
   how a name inside onboard.html's hidden block survived the first sweep.
   Reads the DOM's innerText plus the attributes a reader can surface (alt,
   title, aria-label, placeholder) — the exact strings that were replaced are
   never searched for, because a check derived from the edit can only confirm
   itself. */
import { chromium } from 'playwright';
import { readdirSync, readFileSync, existsSync } from 'fs';
const BASE = process.env.BASE || 'http://localhost:8899';
const pages = readdirSync('.').filter(f => f.endsWith('.html'));
/* Served from the root but not HTML, so the DOM pass never sees them. */
const plain = ['llms.txt', 'robots.txt', 'sitemap.xml'].filter(f => existsSync(f));
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx = await b.newContext();
let hits = 0;
for (const f of pages) {
  const p = await ctx.newPage();
  await p.goto(BASE + '/' + f, {waitUntil:'domcontentloaded'});
  const found = await p.evaluate(() => {
    const re = /\brahaid\b/i, out = [];
    const skip = t => /rahaid-crm|calendly\.com\/rahaid/i.test(t);
    // every text node in the tree EXCEPT script and style: hidden elements count
    // (innerText skips them, which is how a name in onboard.html's hidden block
    // survived the first sweep), CSS and JS comments do not.
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: n => /^(SCRIPT|STYLE|TEMPLATE)$/.test(n.parentNode.nodeName)
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const nodes = []; for (let n; (n = w.nextNode());) nodes.push(n.nodeValue);
    for (const m of nodes.join('\n').split('\n'))
      if (re.test(m) && !skip(m)) out.push('text: ' + m.trim().slice(0, 90));
    for (const el of document.querySelectorAll('[alt],[title],[aria-label],[placeholder],[href]'))
      for (const a of ['alt','title','aria-label','placeholder','href']) {
        const v = el.getAttribute(a);
        if (v && re.test(v) && !skip(v)) out.push(`${a}: ${v.slice(0, 90)}`);
      }
    return out;
  });
  if (found.length) { hits += found.length; console.log(`RENDERS "Rahaid"  ${f}`); found.forEach(x => console.log('   ' + x)); }
  await p.close();
}
await b.close();

for (const f of plain) {
  const re = /\brahaid\b/i;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (re.test(line) && !/rahaid-crm|calendly\.com\/rahaid/i.test(line)) {
      hits++; console.log(`CARRIES "Rahaid"  ${f}`); console.log('   ' + line.trim().slice(0, 90));
    }
  }
}

console.log(hits === 0 ? `clean: ${pages.length} pages + ${plain.length} text file(s), none render the name` : `${hits} occurrence(s) still visible`);
process.exit(hits === 0 ? 0 : 1);
