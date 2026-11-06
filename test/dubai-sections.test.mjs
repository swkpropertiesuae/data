import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {DUBAI_SECTIONS,DUBAI_METHODOLOGY,dubaiSectionEvidence,validateDubaiSection,protectDubaiStatistics} from '../src/dubai-sections.mjs';
import {dubaiDataPlan,queryDubaiData} from '../src/datadubai.mjs';
import {getIntent} from '../src/retrieval.mjs';
import worker from '../src/worker.mjs';
// Representative fields and rows observed from the ten public JSON feeds.
const fixtures={
  launches:{entity:'Dubai project launches',year:2026,through:'2026-10-29',count:1,units:348,projects:[{name:'Lyra',registered:'26 Oct 2026',developer:'Majid Al Futtaim Ghaf Woods L.L.C',where:'Wadi Al Safa 4',units:348,completion_pct:0,declared_completion:'15 Dec 2029',registered_sales:0,status:'Active'}]},
  mortgages:{entity:'Dubai mortgages and gifts',through:'2026-10-29',mortgages_12m:{n:41721,n_price:41164,price_median:1364000,price_total:125885452880},gifts_12m:{n:9192,n_price:8802,price_median:1896746,price_total:43458866715},mortgages_by_year:[{year:2010,n:11578,price_median:1084000,value_total:32120564340}]},
  affordability:{entity:'Affordability bands',through:'2026-10-29',bands:[{band:'under AED 750k',url:'/affordability/under-750k/',sales:31938}]},
  handover:{entity:'Handover years',through:'2026-10-29',years:{2026:{projects:311,units:83357},2027:{projects:429,units:114671}}},
  construction:{entity:'Construction bands',through:'2026-10-29',bands:[{band:'0-20% complete',projects:1400}]},
  methodology:{version:'1.0',date:'2026-09-09',trailing_months:12,min_publish:5,low_sample:20,trim_percentiles:[0.01,0.99],yield_rules:{min_rents:15,min_sales:15,corridor_pct:[2,15]},sqm_to_sqft:10.763910416709722},
  glossary:{entity:'glossary',terms:[{id:'gross-yield',term:'Gross yield',definition:'Annual rent divided by purchase price, as a percentage. Service charges, vacancy and purchase costs are not deducted.'}]},
  sources:{through:'2026-10-29',built:'1 Nov 2026',datasets:[{name:'DLD registered transactions',publisher:'Dubai Land Department',rows_held:'1\u00a0653\u00a0303',rows_used:'1\u00a0653\u00a0303',coverage:'2010 – 29 Oct 2026',last_import:'2026-10-29',refresh:'Daily'}]},
  roi:{entity:'ROI calculator',through:'2026-10-29',formula:'net_yield = (rent*(1-vacancy) - service_charge*size) / (price*(1+purchase_costs))',example:{community:'Jumeirah Village Circle',price:1050000,rent:65500,size_sqft:700,service_charge_aed_sqft:15,purchase_costs_pct:6,vacancy_management_pct:10,net_yield_pct:4.35}},
  latest:{entity:'Latest Dubai transactions',through:'2026-10-29',transactions:[{date:'2026-10-29',project:'Verdana Residence 7',area:'Dubai Investment Park First',rooms:'Studio',registration:'Off-Plan Properties',sqm:36.1,price_aed:560000,psf:1441}]}
};
function setup(){
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('src/schema.sql','utf8'));
  const prepare=sql=>{let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};};
  return {db,env:{DUBAI_DATA_ENABLED:'true',DB:{prepare,async batch(items){return Promise.all(items.map(i=>i.all()));}}}};
}
for(const [id,section] of Object.entries(DUBAI_SECTIONS)){
  test('Direct JSON feed end-to-end: '+id,async()=>{
    const question=section.question,intent=getIntent(question),plan=dubaiDataPlan(question,intent);
    assert.equal(plan.section,id);const {env}=setup();let requests=0;
    const response=await queryDubaiData({env,req:new Request('https://data.swk.rent/api/chat'),question,intent,fetcher:async(url,options)=>{requests++;assert.equal(url,'https://datadubai.ae/'+section.path+'.json');assert.equal(options.redirect,'manual');return Response.json(fixtures[id]);}});
    assert.equal(requests,1);assert.ok(response.result.rows.length);assert.equal(response.result.provider.transport,'json');assert.ok(response.result.provider.originalJsonUrl.endsWith('.json'));assert.ok(response.result.methodologyNotes.length);
    assert.equal(response.result.dataThrough,['methodology','glossary'].includes(id)?null:'2026-10-29');
  });
}
test('Mortgage and gift amounts never inherit sale-price field names or a combined population',()=>{
  const e=dubaiSectionEvidence(fixtures.mortgages,{section:'mortgages'},'mortgages and gifts');
  assert.equal(e.rows.length,2);assert.deepEqual(e.rows.map(r=>r.population),['Mortgages','Gifts']);
  assert.equal(e.rows[0].median_loan_amount_aed,1364000);assert.equal(e.rows[1].median_declared_transfer_aed,1896746);
  assert.ok(e.rows.every(r=>r.price_median===undefined&&r.price_aed===undefined));assert.ok(e.notes[0].includes('never added to sales'));
});
test('Handover year filtering reports declared supply, not delivered homes',()=>{
  const e=dubaiSectionEvidence(fixtures.handover,{section:'handover',year:'2027'},'handover 2027');assert.deepEqual(e.rows,[{year:'2027',projects:429,registered_units:114671}]);assert.ok(e.notes[0].includes('do not establish'));
});
test('Suppression keeps counts and independently adequate rental samples',()=>{
  const r=protectDubaiStatistics({n:3,price_median:1000000,psf_median:1500,n_rents:33,rent_median:70000});
  assert.equal(r.n,3);assert.equal(r.price_median,null);assert.equal(r.psf_median,null);assert.equal(r.rent_median,70000);assert.equal(r.quality,'insufficient');
  assert.equal(protectDubaiStatistics({n:19,price_median:1000000}).quality,'low');assert.equal(protectDubaiStatistics({n:20,price_median:1000000}).quality,undefined);
  assert.equal(protectDubaiStatistics({n:100,n_psf:4,psf_median:1000,price_median:500000}).psf_median,null);
  assert.equal(protectDubaiStatistics({yield_pct:10,contracts_used:14,ready_sales_used:20}).yield_pct,null);
});
test('Publisher-held counts cannot silently become SWK import counts',()=>{
  const e=dubaiSectionEvidence(fixtures.sources,{section:'sources'},'Dubai Data sources');assert.equal(e.rows[0].publisher_rows_held,1653303);assert.ok(e.notes[0].includes('not SWK'));
});
test('Methodology and glossary do not acquire an invented transaction cutoff',()=>{
  const e=dubaiSectionEvidence(fixtures.methodology,{section:'methodology'},'methodology');assert.equal(e.rows[0].value,'v1.0');assert.equal(e.rows.at(-1).value,'10.763910416709722 sqft per sqm');assert.equal(DUBAI_METHODOLOGY.rules.length,8);
  assert.throws(()=>validateDubaiSection({through:'yesterday',bands:[]},'construction'),/invalid_section_cutoff/);
});
test('Failed section requests cannot fall through to unrelated imported numerical answers',async()=>{
  const {env}=setup();env.DUBAI_DATA_FETCH=async()=>new Response('Unavailable',{status:503});
  const r=await worker.fetch(new Request('https://data.swk.rent/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"question":"Show Dubai mortgage and gift registrations separately"}'}),env,{waitUntil(){}}),data=await r.json();
  assert.equal(r.status,200);assert.deepEqual(data.rows,[]);assert.equal(data.provider.freshness,'unavailable');assert.ok(data.answer.includes('cannot provide a numerical answer'));
});
test('A missing published annual gift history remains missing, not a trailing count for the requested year',()=>{
  const e=dubaiSectionEvidence(fixtures.mortgages,{section:'mortgages',year:'2025'},'gifts in 2025');assert.deepEqual(e.rows,[]);
});
