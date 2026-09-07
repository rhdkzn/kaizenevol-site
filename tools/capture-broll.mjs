/* tools/capture-broll.mjs — safe screen b-roll of the CRM.
 *
 * WHY THIS EXISTS. Swipe #139 banked a reel whose cheapest mechanic was using the
 * product's own documentation as b-roll: no shot list, no mockups, just scroll the
 * real thing under a voiceover. Rahaid asked for the same for our CRM. Two problems
 * had to be solved first, and neither was the one the reel had:
 *
 *   1. THE CRM HAS NO README. Its docs are the UI. So the b-roll is the app itself,
 *      which is better footage than any docs page — it just has to be safe.
 *   2. THE LIVE CRM HOLDS 379 REAL LEADS. Names, phones and emails of real
 *      businesses. Filming the live app publishes prospect data. Every brand,
 *      person, number and address below is INVENTED, and .example domains are
 *      reserved by RFC 2606 so none of them can ever resolve to anyone.
 *
 * HOW IT RUNS WITH NO NETWORK. crm.html loads supabase-js from jsdelivr and replaces
 * the whole page with "The database library did not load" if it cannot. In this
 * container the CDN needs the egress proxy, but the proxy refuses the plain-HTTP
 * localhost page, and Playwright's bypass did not hold. Rather than fight that, the
 * CDN request is FULFILLED WITH A STUB: the seeded render needs no cloud at all, so
 * removing the only off-box dependency removes the conflict. No proxy, no session,
 * no Supabase.
 *
 * Board shape gotcha, found the hard way: `cards` is a FLAT array on the board with
 * each card carrying `col`. It is not nested inside columns. Seeding it nested gives
 * a board header with no columns and a "reading 'filter'" error.
 *
 * Run:  python3 -m http.server 8909   (from the repo root)
 *       node tools/capture-broll.mjs ./broll-out
 */
const OUT = process.argv[2]
// FICTIONAL brands, invented for footage. No real lead, client, phone or email touches this.
const SEED = {
  leads: [
    ['Marrow Studio','Ada Okonkwo','Bristol','streetwear','proposal',5],
    ['Cadence Athletic','Theo Lindqvist','Manchester','activewear','contacted',4],
    ['Ninefold','Priya Raman','London','jewellery','new',4],
    ['Harbour & Ash','Callum Frey','Brighton','homeware','won',5],
    ['Vellum Press','Noor Haddad','Leeds','print','contacted',3],
    ['Third Coast','Marco Bellini','Glasgow','footwear','proposal',4],
    ['Ember Goods','Sana Iqbal','Birmingham','candles','new',3],
    ['Northgate Denim','Owen Pryce','Sheffield','denim','contacted',4],
  ].map(([business,owner,area,niche,stage,score],i)=>({
    id:'demo'+i, business, owner, area, niche, stage,
    phone:'07700 900'+String(100+i), email:'hello@'+business.toLowerCase().replace(/[^a-z]/g,'')+'.example',
    notes:`Score: ${score} · seeded demo row`, updatedAt: Date.now()-i*86400000,
    followUp: i%3===0 ? new Date(Date.now()+i*86400000).toISOString().slice(0,10) : ''
  })),
  data: { clients:[
      {id:'c_demo1',name:'Harbour & Ash',status:'active',terms:'Founding £1,000/mo',retainerValue:1000,
       founding:true,baselineRevenue:12000,segment:'homeware',founder:'Callum Frey',email:'callum@harbour.example'},
      {id:'c_demo2',name:'Third Coast',status:'active',terms:'Standard £2,000/mo',retainerValue:2000,
       founding:false,baselineRevenue:41000,segment:'footwear',founder:'Marco Bellini',email:'marco@thirdcoast.example'}],
    clientTasks:{},
    boards:[{ id:'b_demo', name:'Content pipeline', clientId:'c_demo1',
      columns:[{id:'c1',name:'Idea'},{id:'c2',name:'Shooting'},{id:'c3',name:'Edit'},{id:'c4',name:'Scheduled'}],
      cards:[
        {id:'k1',col:'c1',title:'Drop 2 teaser — fabric close-ups',tags:['reel']},
        {id:'k2',col:'c1',title:'Founder voiceover: why heavyweight',tags:['reel']},
        {id:'k3',col:'c2',title:'Lookbook stills — bone colourway',tags:['photo'],due:'2026-09-12'},
        {id:'k4',col:'c3',title:'Drop 1 recap — 30s cutdown',tags:['reel'],due:'2026-09-10'},
        {id:'k5',col:'c4',title:'Restock announcement',tags:['story'],due:'2026-09-15'}] }] }

}
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport:{width:1440,height:900}, deviceScaleFactor:2 })
const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,90)))
// Stub supabase-js. The seeded render needs no cloud, and this removes the only
// off-box dependency, which is what the proxy conflict was really about.
const STUB = `window.supabase={createClient:()=>({
  auth:{ getSession:async()=>({data:{session:null}}), signInWithPassword:async()=>({error:{message:'stub'}}),
         onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
  from:()=>({ select(){return this}, eq(){return this}, order(){return this}, single:async()=>({data:null,error:null}),
              insert:async()=>({error:null}), update:async()=>({error:null}), upsert:async()=>({error:null}),
              then:(r)=>r({data:null,error:null}) })
})};`
await p.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'application/javascript', body: STUB }))
await p.goto('http://127.0.0.1:8909/crm.html',{waitUntil:'domcontentloaded'})
await p.evaluate(s => {
  localStorage.setItem('ke_leads', JSON.stringify(s.leads))
  localStorage.setItem('ke_data',  JSON.stringify(s.data))
  localStorage.setItem('ke_scraper','{}'); localStorage.setItem('ke_email','{}')
}, SEED)
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1200)
await p.evaluate(()=>{ try{ showApp() }catch(e){ console.log('showApp: '+e.message) } })
await p.waitForTimeout(2500)
for (const v of ['today','leads','clients','outreach','boards']) {
  await p.evaluate(n=>{ try{ showView(n) }catch(e){} }, v)
  await p.waitForTimeout(1400)
  await p.screenshot({ path:`${OUT}/crm-${v}.png` })
  const vis = await p.evaluate(()=>{const a=document.getElementById('app');return a?getComputedStyle(a).display:'NO #app'})
  console.log(`  ${v.padEnd(9)} captured  (app display: ${vis||'?'})`)
}
console.log('  page errors:', errs.length? errs.slice(0,3) : 'none')
await b.close()
