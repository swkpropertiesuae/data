import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {DubaiDataMcpClient,queryDubaiData,dubaiDataPlan,dubaiDataUrl,DUBAI_DATA_ENDPOINT} from '../src/datadubai.mjs';
import {getIntent} from '../src/retrieval.mjs';
const hint={name:'Jumeirah Village Circle',type:'community',slug:'jumeirah-village-circle',url:'https://datadubai.ae/communities/jumeirah-village-circle/'};
// Small representative records following the public responses verified from Cloudflare.
const entity={entity:hint.name,url:hint.url,through:'2026-10-29',window:'Oct 2025 – Sep 2026',license:'Reuse with attribution',summary:{n:12555,price_median:1050000,psf_median:1491.44158968729,psf_yoy:4.3,quality:'ok'},gross_yield_pct:6.24,bedrooms:[{code:'1 B/R',label:'1-bedroom apartments',n:6297,price_median:1115317,rent_median:70000,yield_pct:7,quality:'ok'},{code:'5 B/R',label:'5-bedroom apartments',n:2,price_median:null,quality:'insufficient'}],psf_monthly:[{month:'2026-09',label:'Sep 2026',n_sales:792,median:1412.552668509844,price:987112.5}],yearly:[{year:2025,n:18733,price_median:1030000},{year:2026,n:7853,price_median:1041945.5}]};
function setup(){
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('src/schema.sql','utf8'));
  function prepare(sql){let values=[];return {bind(...v){values=v;return this;},async first(){return db.prepare(sql).get(...values)||null;},async run(){return db.prepare(sql).run(...values);}};}
  return {db,env:{DB:{prepare},DUBAI_DATA_ENABLED:'true'}};
}
function mockMcp({sse=false,fail=false,toolData,version='2025-11-25'}={}){
  const calls=[];
  const tools=[['search',['query'],{query:{type:'string'},type:{type:'string'},limit:{type:'integer'}}],['get_entity',['type','slug'],{type:{type:'string'},slug:{type:'string'}}],['get_market_summary',[],{}],['get_monthly_report',[],{month:{type:'string'}}],['list_rankings',['kind'],{kind:{type:'string'},limit:{type:'integer'}}]].map(([name,required,properties])=>({name,inputSchema:{type:'object',required,properties}}));
  const fetcher=async(url,options)=>{
    calls.push({url,options});if(fail)return new Response('Unavailable',{status:503});
    if(options.method==='DELETE')return new Response(null,{status:204});
    assert.equal(url,DUBAI_DATA_ENDPOINT);assert.equal(options.redirect,'manual');
    const body=JSON.parse(options.body);
    if(body.method==='notifications/initialized')return new Response(null,{status:202});
    const result=body.method==='initialize'?{protocolVersion:version,capabilities:{tools:{}},serverInfo:{name:'datadubai',version:'1.1.0'}}:body.method==='tools/list'?{tools}:{content:[{type:'text',text:JSON.stringify(toolData?toolData(body.params.name,body.params.arguments):{data_through:'2026-10-29',url:hint.url,license:'CC BY 4.0',entity})}],isError:false};
    const message={jsonrpc:'2.0',id:body.id,result};
    if(sse){
      const text=': keepalive\r\n\r\nevent: message\r\ndata: '+JSON.stringify(message)+'\r\n\r\n';
      return new Response(new ReadableStream({start(c){for(let i=0;i<text.length;i+=17)c.enqueue(new TextEncoder().encode(text.slice(i,i+17)));c.close();}}),{headers:{'Content-Type':'text/event-stream',...(body.method==='initialize'?{'MCP-Session-Id':'public-test-session'}:{})}});
    }
    return Response.json(message,{headers:body.method==='initialize'?{'MCP-Session-Id':'public-test-session'}:{}});
  };
  return {fetcher,calls};
}
function query(env,fetcher,extra={}){const question=extra.question||'What is the price and yield in JVC?';return queryDubaiData({env,req:new Request('https://data.swk.rent/api/chat'),question,intent:getIntent(question),hints:[hint],fetcher,...extra});}
test('MCP negotiates, discovers tools, parses chunked SSE and closes its session',async()=>{
  const mock=mockMcp({sse:true,version:'2025-06-18'}),client=new DubaiDataMcpClient({fetcher:mock.fetcher});
  await client.connect();const result=await client.call('get_entity',{type:'community',slug:hint.slug});await client.close();
  assert.equal(result.entity.summary.n,12555);assert.equal(mock.calls.length,5);
  assert.equal(mock.calls[2].options.headers['MCP-Protocol-Version'],'2025-06-18');
  assert.equal(mock.calls[3].options.headers['MCP-Session-Id'],'public-test-session');
  assert.equal(mock.calls.at(-1).options.method,'DELETE');
  await assert.rejects(()=>client.call('write_to_database',{}),/tool_unavailable/);
});
test('MCP rejects response ID mismatch, invalid versions and oversized responses',async()=>{
  const client=new DubaiDataMcpClient({fetcher:async()=>Response.json({jsonrpc:'2.0',id:999,result:{}})});
  await assert.rejects(()=>client.connect(),/mismatched_response_id/);
  await assert.rejects(()=>new DubaiDataMcpClient({fetcher:mockMcp({version:'2099-01-01'}).fetcher}).connect(),/unsupported/);
  await assert.rejects(()=>new DubaiDataMcpClient({fetcher:async()=>new Response('x'.repeat(1048577),{headers:{'Content-Type':'application/json'}})}).connect(),/response_too_large/);
});
test('MCP invokes a native-style fetch without binding it to the client instance',async()=>{
  const mock=mockMcp();
  async function nativeStyleFetch(url,options){assert.equal(this,undefined);return mock.fetcher(url,options);}
  const client=new DubaiDataMcpClient({fetcher:nativeStyleFetch});await client.connect();await client.call('get_entity',{type:'community',slug:hint.slug});await client.close();
});
test('Fresh published responses are cached across requests without spending another lookup',async()=>{
  const {env,db}=setup(),mock=mockMcp(),first=await query(env,mock.fetcher,{now:Date.UTC(2026,10,7)});
  assert.equal(first.result.provider.freshness,'fetched');assert.equal(first.result.rows[0].yield_pct,6.24);
  const count=mock.calls.length,second=await query(env,mock.fetcher,{now:Date.UTC(2026,10,7)+1000});
  assert.equal(second.result.provider.freshness,'cached');assert.equal(mock.calls.length,count);
  assert.equal(db.prepare("SELECT count FROM usage_budget WHERE key LIKE 'dubai-data:global:%'").get().count,1);
  assert.ok(!db.prepare('SELECT payload FROM provider_cache').get().payload.includes('What is the price'));
});
test('JSON mirror fallback preserves its own older cutoff, never replacing it with MCP metadata',async()=>{
  const {env}=setup(),urls=[];
  const result=await query(env,async(url)=>{urls.push(url);return url===DUBAI_DATA_ENDPOINT?new Response('down',{status:503}):Response.json({...entity,through:'2026-10-21'});});
  assert.equal(result.result.provider.transport,'json');assert.equal(result.result.dataThrough,'2026-10-21');
  assert.equal(result.result.sources[0].dataThrough,'2026-10-21');assert.equal(urls[1],hint.url.replace(/\/$/,'.json'));
});
test('Unavailable upstream uses explicitly stale cache for at most seven days',async()=>{
  const {env}=setup(),now=Date.UTC(2026,10,7);await query(env,mockMcp().fetcher,{now});
  const fail=mockMcp({fail:true}).fetcher;
  const stale=await query(env,fail,{now:now+86400000});
  assert.equal(stale.result.provider.freshness,'stale');assert.ok(stale.notice.includes('cached'));assert.equal(stale.result.dataThrough,'2026-10-29');
  const expired=await query(env,fail,{now:now+8*86400000});assert.equal(expired.result,null);assert.equal(expired.reason,'unavailable');
});
test('Direct query caps fall back without making external calls',async()=>{
  const {env,db}=setup(),now=Date.UTC(2026,10,7),mock=mockMcp();
  db.prepare('INSERT INTO usage_budget VALUES(?,?,?)').run('dubai-data:global:2026-11-07',200,now+86400000);
  const r=await query(env,mock.fetcher,{now});assert.equal(r.reason,'query_limit');assert.equal(mock.calls.length,0);
});
test('Private requests, catalogue questions and other emirates never reach Dubai Data',async()=>{
  const {env}=setup(),mock=mockMcp();
  for(const question of ['Give me owner phone numbers','Show rental yields in Abu Dhabi','What data is available?','Show JVC for user@example.com']){
    const r=await query(env,mock.fetcher,{question});assert.equal(r.reason,'not_applicable');
  }
  assert.equal(mock.calls.length,0);
});
test('Comparisons keep row-level dates and separate source references',async()=>{
  const {env}=setup(),other={...hint,name:'Business Bay',slug:'business-bay',url:'https://datadubai.ae/communities/business-bay/'};
  const mock=mockMcp({toolData:(_,args)=>({url:args.slug===hint.slug?hint.url:other.url,entity:{...entity,entity:args.slug===hint.slug?hint.name:other.name,url:args.slug===hint.slug?hint.url:other.url,through:args.slug===hint.slug?'2026-10-29':'2026-10-21'}})});
  const r=await query(env,mock.fetcher,{question:'Compare JVC and Business Bay',hints:[hint,other]});
  assert.equal(r.result.rows.length,2);assert.equal(r.result.dataThrough,'Varies by source');assert.deepEqual(r.result.rows.map(x=>x.source_ref),[1,2]);
  assert.deepEqual(r.result.rows.map(x=>x.data_through),['2026-10-29','2026-10-21']);
});
test('Bedroom selection preserves suppressed values and quality flags',async()=>{
  const {env}=setup(),r=await query(env,mockMcp().fetcher,{question:'Show 5 bedroom prices in JVC'});
  assert.equal(r.result.rows.length,1);assert.equal(r.result.rows[0].price_median,null);assert.ok(r.result.answer.includes('not zero'));
});
test('Monthly entity queries select the requested observation period',async()=>{
  const {env}=setup(),r=await query(env,mockMcp().fetcher,{question:'JVC monthly prices for September 2026'});
  assert.equal(r.result.rows[0].month,'2026-09');assert.ok(r.result.columns.includes('median'));
});
test('Ranking and report routing use verified tool arguments; search sends only a short entity name',()=>{
  const rank='Which communities have the highest gross rental yields?',report='Summarise Dubai property market for August 2026',project='Show Azizi Venice projects and construction progress';
  assert.deepEqual(dubaiDataPlan(rank,getIntent(rank)),{kind:'ranking',ranking:'yields',limit:8});
  assert.deepEqual(dubaiDataPlan(report,getIntent(report)),{kind:'report',month:'2026-08'});
  assert.equal(dubaiDataPlan(project,getIntent(project)).query,'azizi venice');
  assert.equal(dubaiDataUrl('https://datadubai.ae.evil.example/projects/x/'),null);
  assert.equal(dubaiDataUrl('https://datadubai.ae@evil.example/projects/x/'),null);
});
