import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
const OUT='/tmp/claude-0/-home-user/a6c90bf2-d205-5724-994b-91078fef5d75/scratchpad/photo';
for (const [w,h,tag] of [[1280,900,'desktop'],[390,844,'phone']]){
  const page = await b.newPage({viewport:{width:w,height:h}});
  await page.goto('http://localhost:8899/about.html',{waitUntil:'networkidle'});
  await page.addStyleTag({content:'*{animation:none!important;transition:none!important;opacity:1!important;clip-path:none!important;transform:none!important}'});
  const box = await page.evaluate(()=>{const f=document.querySelector('figure.duo');f.scrollIntoView({block:'center'});const r=f.getBoundingClientRect();return {x:Math.max(0,r.x-20),y:Math.max(0,r.y-20),width:Math.min(r.width+40, innerWidth),height:Math.min(r.height+40, innerHeight)};});
  await page.waitForTimeout(300);
  await page.screenshot({path:`${OUT}/page-${tag}.png`, clip:box});
  console.log(tag, JSON.stringify(box));
  await page.close();
}
await b.close();
