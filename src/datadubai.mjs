// Fixed-origin, read-only Dubai Data provider. No API keys or user-selected tools.
import {normalize,expandAliases,formatValue,LABELS} from './retrieval.mjs';
export const DUBAI_DATA_ENDPOINT='https://mcp.datadubai.ae/mcp';
const DD_ALLOWED_TOOLS=new Set(['search','get_entity','get_market_summary','get_monthly_report','list_rankings']);
const DD_PROTOCOLS=new Set(['2025-11-25','2025-06-18','2025-03-26']);
const DD_TTL=6*3600000,DD_STALE=7*86400000,DD_MAX_BYTES=1048576;
const DD_MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
const DD_SEARCH_STOP=new Set('show tell give find compare versus vs and or by about from into of for the in on at me please details progress construction registered median per square foot sqft aed how much does cost highest lowest most least top list current currently today now report summary summarise summarize overview change moved movement year over monthly yearly annual previous since until between period statistics apartments apartment villas villa homes home city wide'.split(' '));
export function dubaiDataUrl(value){
  try{const u=new URL(value);if(u.protocol==='https:'&&u.hostname==='datadubai.ae'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash)return u.href;}catch{}
  return null;
}
export function dubaiEntityHint(row){
  const url=dubaiDataUrl(row.url||row.source_url);if(!url)return null;
  const match=new URL(url).pathname.match(/^\/(communities|projects|developers|areas)\/([a-z0-9-]+)\/$/);
  if(!match)return null;
  return {name:row.name||row.community,type:{communities:'community',projects:'project',developers:'developer',areas:'area'}[match[1]],slug:match[2],url};
}
export function dubaiDataPlan(question,intent,hints=[]){
  if(intent.privacy||intent.investor||intent.emirate||intent.dataset==='transactions'||/what data|which data|sources|datasets|scrap|api|catalog|data.*available/i.test(question))return null;
  // Never forward email, long identifier strings or contact requests to the publisher.
  if(/@|\d{7,}|phone|mobile|passport|emirates.?id|owner.?name|buyer.?name|tenant.?name/i.test(question))return null;
  const q=normalize(expandAliases(question));
  const monthISO=question.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  const monthName=DD_MONTHS.findIndex(m=>new RegExp('\\b'+m+'\\b|\\b'+m.slice(0,3)+'\\b').test(q));
  const year=q.match(/\b20\d{2}\b/)?.[0];
  const month=monthISO?monthISO[0]:monthName>=0&&year?year+'-'+String(monthName+1).padStart(2,'0'):null;
  const preferredType=/dld area|cadastral|administrative/.test(q)?'area':intent.dataset==='projects'?'project':intent.dataset==='developers'?'developer':'community';
  const sorted=hints.filter(Boolean).sort((a,b)=>Number(b.type===preferredType)-Number(a.type===preferredType));
  const entities=sorted.filter((h,i,a)=>a.findIndex(other=>normalize(other.name)===normalize(h.name))===i).filter((h,i,a)=>!a.some((other,j)=>j!==i&&normalize(other.name).includes(normalize(h.name))&&other.name.length>h.name.length)).slice(0,3);
  if(intent.dataset==='service_charges'||intent.dataset==='stock')return {kind:'json',dataset:intent.dataset,entities};
  if(entities.length)return {kind:'entities',entities,month};
  if((/report/.test(q)||month)&&!/community|project|developer/.test(q))return {kind:'report',month};
  if(/highest|top|rank|most active|leading/.test(q)&&!/lowest|cheapest/.test(q)){
    const kind=/yield|roi|return/.test(q)?'yields':/rent/.test(q)?'rents':/developer/.test(q)?'developers':'communities';
    return {kind:'ranking',ranking:kind,limit:Math.min(20,Number(q.match(/\btop (\d{1,2})\b/)?.[1])||8)};
  }
  const tokens=intent.words.filter(w=>!DD_SEARCH_STOP.has(w)&&!DD_MONTHS.some(m=>w===m||w===m.slice(0,3))&&!['sq','ft','psf','yoy','rate','rates','number','count','summarise','summarize','2026','2025'].includes(w));
  if(!tokens.length&&/dubai|market|city|sales|price|bedroom|studio/.test(q))return {kind:'market',month};
  if(/lowest|cheapest|least|service charge|supply|pipeline/.test(q))return null; // Preserve the indexed sort/filter semantics.
  if(!tokens.length)return null;
  // Only a short public entity name is sent, never the full question or history.
  return {kind:'search',query:tokens.slice(0,6).join(' ').slice(0,120),type:intent.dataset==='developers'||(tokens.length===1&&/projects|construction/.test(q))?'developer':intent.dataset==='projects'?'project':undefined,month};
}
async function ddReadMessage(response,requestId){
  if(!response.body)throw new Error('empty_response');
  const stream=response.headers.get('content-type')?.includes('text/event-stream');
  if(!stream&&!response.headers.get('content-type')?.includes('application/json')){await response.body.cancel();throw new Error('unexpected_content_type');}
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',bytes=0;
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;if(bytes>DD_MAX_BYTES)throw new Error('response_too_large');
      buffer+=decoder.decode(value,{stream:true});
      if(stream){
        buffer=buffer.replaceAll('\r\n','\n');let end;
        while((end=buffer.indexOf('\n\n'))>=0){
          const block=buffer.slice(0,end);buffer=buffer.slice(end+2);
          const data=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
          if(!data)continue;
          const message=JSON.parse(data);
          if(message.id===requestId)return message;
        }
      }
    }
    if(stream)throw new Error('incomplete_event_stream');
    const message=JSON.parse(buffer+decoder.decode());
    if(message.id!==requestId)throw new Error('mismatched_response_id');
    return message;
  }finally{try{await reader.cancel();}catch{}}
}
export class DubaiDataMcpClient {
  constructor({fetcher=fetch,signal=AbortSignal.timeout(22000)}={}){this.fetcher=(url,options)=>fetcher(url,options);this.signal=signal;this.version='2025-11-25';this.nextId=0;this.requests=0;this.tools=[];}
  async rpc(method,params,notification=false){
    if(++this.requests>12)throw new Error('request_limit');
    const id=notification?undefined:++this.nextId;
    const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream','User-Agent':'SWK-DATA/1.1 (+https://data.swk.rent)'};
    if(this.session)headers['MCP-Session-Id']=this.session;
    if(method!=='initialize')headers['MCP-Protocol-Version']=this.version;
    const response=await this.fetcher(DUBAI_DATA_ENDPOINT,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',...(notification?{}:{id}),method,...(params?{params}:{})}),redirect:'manual',signal:AbortSignal.any([this.signal,AbortSignal.timeout(7000)])});
    if(!response.ok){await response.body?.cancel();throw new Error('upstream_http_'+response.status);}
    if(method==='initialize')this.session=response.headers.get('MCP-Session-Id');
    if(notification){await response.body?.cancel();return;}
    const message=await ddReadMessage(response,id);
    if(message.error)throw new Error('mcp_error_'+message.error.code);
    if(!message.result||typeof message.result!=='object')throw new Error('invalid_mcp_result');
    return message.result;
  }
  async connect(){
    const result=await this.rpc('initialize',{protocolVersion:this.version,capabilities:{},clientInfo:{name:'swk-data',version:'1.1.0'}});
    if(!DD_PROTOCOLS.has(result.protocolVersion)||!result.capabilities?.tools)throw new Error('unsupported_mcp_capabilities');
    this.version=result.protocolVersion;this.server=result.serverInfo;
    await this.rpc('notifications/initialized',undefined,true);
    let cursor;
    for(let page=0;page<2;page++){
      const listed=await this.rpc('tools/list',cursor?{cursor}:{});
      if(!Array.isArray(listed.tools))throw new Error('invalid_tools_list');
      this.tools.push(...listed.tools.filter(t=>DD_ALLOWED_TOOLS.has(t.name)));
      cursor=listed.nextCursor;if(!cursor)break;
    }
    return {protocolVersion:this.version,serverVersion:this.server?.version,tools:this.tools.map(t=>t.name)};
  }
  async call(name,args){
    const tool=this.tools.find(t=>t.name===name);if(!tool||!DD_ALLOWED_TOOLS.has(name))throw new Error('tool_unavailable');
    const schema=tool.inputSchema;
    if(schema?.type!=='object'||(schema.required||[]).some(k=>args[k]===undefined)||Object.keys(args).some(k=>!schema.properties?.[k]))throw new Error('tool_schema_changed');
    const result=await this.rpc('tools/call',{name,arguments:args});
    if(result.isError)throw new Error('upstream_tool_error');
    const data=result.structuredContent||JSON.parse(result.content?.find(c=>c.type==='text')?.text||'null');
    if(!data||typeof data!=='object'||data.error)throw new Error('invalid_tool_data');
    return data;
  }
  async close(){if(this.session)try{const r=await this.fetcher(DUBAI_DATA_ENDPOINT,{method:'DELETE',headers:{'MCP-Session-Id':this.session,'MCP-Protocol-Version':this.version},redirect:'manual',signal:AbortSignal.timeout(1500)});await r.body?.cancel();}catch{}}
}
async function ddHash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function ddBudget(env,req,now){
  const day=new Date(now).toISOString().slice(0,10),hash=await ddHash(day+':'+(req.headers.get('CF-Connecting-IP')||'local'));
  for(const [key,max] of [[`dubai-data:global:${day}`,200],[`dubai-data:visitor:${day}:${hash}`,20]]){
    const r=await env.DB.prepare('INSERT INTO usage_budget(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count').bind(key,now+172800000,max).first();if(!r)throw new Error('direct_query_limit');
  }
}
async function ddStatus(env,update){
  const previous=await env.DB.prepare('SELECT state FROM ingest_state WHERE id=?').bind('datadubai_provider').first();
  await env.DB.prepare('INSERT INTO ingest_state(id,state,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at').bind('datadubai_provider',JSON.stringify({...JSON.parse(previous?.state||'{}'),...update}),new Date().toISOString()).run();
}
export async function dubaiDataStatus(env){
  const enabled=env.DUBAI_DATA_ENABLED==='true';
  const row=await env.DB.prepare('SELECT state FROM ingest_state WHERE id=?').bind('datadubai_provider').first();
  return {id:'datadubai',name:'Dubai Data',enabled,endpoint:DUBAI_DATA_ENDPOINT,cacheHours:6,...JSON.parse(row?.state||'{}')};
}
function ddValidate(data,method){
  if(method==='search'||method==='list_rankings'){if(!Array.isArray(data.results))throw new Error('invalid_results');}
  else if(method==='get_monthly_report'){if(!data.key_figures||!/^20\d\d-\d\d$/.test(data.month))throw new Error('invalid_report');}
  else if(method==='service_charges'){if(!Array.isArray(data.communities))throw new Error('invalid_service_charges');}
  else if(method==='stock'){if(!Array.isArray(data.bands))throw new Error('invalid_stock');}
  else{const entity=typeof data.entity==='object'?data.entity:data;if(!entity?.summary||typeof entity.entity!=='string')throw new Error('invalid_entity');}
  const url=data.url||(typeof data.entity==='object'?data.entity.url:null);
  if(url&&!dubaiDataUrl(url))throw new Error('invalid_source_url');
  return data;
}
function ddMirrorUrl(pageUrl){const u=dubaiDataUrl(pageUrl);if(!u)throw new Error('invalid_mirror_url');return u.replace(/\/$/,'')+'.json';}
async function ddJson(fetcher,url,signal){
  const response=await fetcher(url,{headers:{Accept:'application/json','User-Agent':'SWK-DATA/1.1 (+https://data.swk.rent)'},redirect:'manual',signal:AbortSignal.any([signal,AbortSignal.timeout(6000)])});
  if(!response.ok){await response.body?.cancel();throw new Error('json_http_'+response.status);}
  // Reuse the bounded JSON reader; mirrors are plain JSON, not JSON-RPC.
  if(!response.headers.get('content-type')?.includes('application/json')){await response.body?.cancel();throw new Error('unexpected_json_content_type');}
  const reader=response.body.getReader(),decoder=new TextDecoder();let text='',bytes=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>DD_MAX_BYTES)throw new Error('response_too_large');text+=decoder.decode(value,{stream:true});}return JSON.parse(text+decoder.decode());}finally{try{await reader.cancel();}catch{}}
}
export async function queryDubaiData({env,req,question,intent,hints=[],fetcher=fetch,now=Date.now()}){
  if(env.DUBAI_DATA_ENABLED!=='true')return {result:null,reason:'disabled'};
  const plan=dubaiDataPlan(question,intent,hints);if(!plan)return {result:null,reason:'not_applicable'};
  const signal=AbortSignal.timeout(22000),client=new DubaiDataMcpClient({fetcher,signal});
  let connection,connectionError,budget,notice;
  async function load(method,args={},pageUrl){
    const key='dd:v1:'+await ddHash(JSON.stringify([method,args]));
    const cached=await env.DB.prepare('SELECT payload,fetched_at,expires_at FROM provider_cache WHERE key=?').bind(key).first();
    if(cached&&cached.expires_at>now)return {...JSON.parse(cached.payload),freshness:'cached',fetchedAt:new Date(cached.fetched_at).toISOString()};
    try{
      budget??=ddBudget(env,req,now);await budget;
      let data,transport='mcp';
      try{
        if(['stock','service_charges'].includes(method))throw new Error('json_only');
        if(connectionError)throw connectionError;
        if(!connection){try{connection=await client.connect();await ddStatus(env,{state:'connected',...connection,lastConnectedAt:new Date(now).toISOString(),lastError:null});}catch(e){connectionError=e;throw e;}}
        data=ddValidate(await client.call(method,args),method);
        // MCP may truncate long histories or developer project lists. Prefer the
        // complete public JSON mirror when available, keeping its own cutoff.
        if(data.truncated&&pageUrl)try{data=ddValidate(await ddJson(fetcher,ddMirrorUrl(pageUrl),signal),method);transport='mcp+json';}catch{}
      }catch(error){
        if(!pageUrl)throw error;
        data=ddValidate(await ddJson(fetcher,ddMirrorUrl(pageUrl),signal),method);transport='json';
      }
      const payload={data,transport};
      await env.DB.prepare('INSERT INTO provider_cache(key,payload,fetched_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at').bind(key,JSON.stringify(payload),now,now+DD_TTL).run();
      await ddStatus(env,{lastFetchedAt:new Date(now).toISOString(),lastTransport:transport});
      return {...payload,freshness:'fetched',fetchedAt:new Date(now).toISOString()};
    }catch(e){
      if(cached&&now-cached.fetched_at<=DD_STALE){notice='Dubai Data could not be refreshed. Showing a dated cached response.';return {...JSON.parse(cached.payload),freshness:'stale',fetchedAt:new Date(cached.fetched_at).toISOString()};}
      throw e;
    }
  }
  try{
    const responses=[];
    if(plan.kind==='entities')for(const e of plan.entities)responses.push(await load('get_entity',{type:e.type,slug:e.slug},e.url));
    else if(plan.kind==='market')responses.push(await load('get_market_summary',{},'https://datadubai.ae/market/'));
    else if(plan.kind==='report')responses.push(await load('get_monthly_report',plan.month?{month:plan.month}:{},plan.month?'https://datadubai.ae/report/'+plan.month+'/':undefined));
    else if(plan.kind==='ranking')responses.push(await load('list_rankings',{kind:plan.ranking,limit:plan.limit}));
    else if(plan.kind==='json')responses.push(await load(plan.dataset,{},'https://datadubai.ae/'+(plan.dataset==='stock'?'stock':'service-charges')+'/'));
    else{
      const search=await load('search',{query:plan.query,...(plan.type?{type:plan.type}:{}),limit:8});
      const matches=search.data.results;
      if(!matches.length)return {result:null,reason:'no_match'};
      const exact=matches.filter(r=>normalize(r.name||r.title)===normalize(plan.query));
      if(exact.length===1&&exact[0].url&&['community','project','developer','area'].includes(exact[0].type)&&/^[a-z0-9-]+$/.test(exact[0].slug))responses.push(await load('get_entity',{type:exact[0].type,slug:exact[0].slug},exact[0].url));
      else responses.push(search);
    }
    const result=ddEvidence(responses,{question,intent,plan});
    if(!result.rows.length)return {result:null,reason:'no_matching_detail'};
    return {result,notice};
  }catch(e){
    const reason=/limit/.test(e.message)?'query_limit':'unavailable';
    try{await ddStatus(env,{state:'degraded',lastError:reason,lastAttemptAt:new Date(now).toISOString()});}catch{}
    return {result:null,reason};
  }finally{await client.close();}
}
function ddEvidence(responses,{question,intent,plan}){
  const rows=[],sources=[],details=[];
  const sourceFor=(url,date,license='CC BY 4.0')=>{
    url=dubaiDataUrl(url)||'https://datadubai.ae/';
    let index=sources.findIndex(s=>s.url===url&&s.dataThrough===date);
    if(index<0){index=sources.length;sources.push({id:'dubai-data-direct-'+(index+1),name:'Dubai Data · '+new URL(url).pathname.split('/').filter(Boolean).join(' / '),url,publisher:'Dubai Data / Continental Club Property, based on DLD open data',status:'connected',license,dataThrough:date});}
    return index+1;
  };
  const q=normalize(expandAliases(question)),bed=/\bstudio\b/.test(q)?'Studio':q.match(/\b([1-9]) ?(?:bedroom|bed|br|b r)\b/)?.[1];
  let slice='summary',total=0;
  for(const response of responses){
    const d=response.data,e=typeof d.entity==='object'?d.entity:d;
    const date=e.through||d.data_through||d.through||null;
    const url=e.url||d.url||(plan.kind==='json'?'https://datadubai.ae/'+(plan.dataset==='stock'?'stock':'service-charges')+'/':'https://datadubai.ae/');
    const sourceRef=sourceFor(url,date,d.license||e.license||'Attribution and source link required');
    let selected=[];
    if(Array.isArray(d.results)){
      total+=d.total_matches||d.results.length;
      selected=d.results.map(r=>({name:r.name||r.title,...r,n:r.sales_12m??r.n,price_median:r.median_price_aed??r.price_median,psf_median:r.aed_per_sqft??r.psf_median,completion:r.completion_pct??r.completion,source_ref:r.url?sourceFor(r.url,date):sourceRef}));slice=plan.kind==='ranking'?'ranking':'search';
      if(d.rule)details.push({methodology:d.rule});
    }else if(d.key_figures){selected=[{name:'Dubai',label:d.month,...d.key_figures}];slice='report';}
    else if(plan.kind==='json'&&plan.dataset==='service_charges'){
      selected=d.communities.filter(r=>!plan.entities.length||plan.entities.some(h=>normalize(r.name)===normalize(h.name))).map(r=>({...r,budget_year:d.year}));slice='service_charges';
    }else if(plan.kind==='json'&&plan.dataset==='stock'){
      selected=[{band:'Total registered supply',projects:d.projects,units_total:d.units_total,units_under_construction:d.units_under_construction},...d.bands];slice='stock';
    }else{
      const name=e.entity;
      if(Array.isArray(e.projects)&&/project|construction|handover/.test(q)&&!bed){
        selected=e.projects.map(r=>({...r,developer:name,n:r.sales_12m??r.n,total_units:r.units??r.total_units}));slice='developer_projects';
      }else if(bed||/bedroom|\bbeds\b|\bbr\b/.test(q)||intent.dataset==='rents_by_community'){
        selected=(e.bedrooms||[]).filter(b=>!bed||(bed==='Studio'?b.code==='Studio':b.code?.startsWith(bed+' '))).map(b=>({name,...b}));slice='bedrooms';
      }else if(/history|historical|monthly|trend/.test(q)||plan.month){
        selected=(e.psf_monthly||[]).filter(r=>plan.month?r.month===plan.month:intent.year?r.month.startsWith(intent.year):true).slice(-24).map(r=>({name,...r}));slice='monthly';
      }else if(/yearly|annual sales|annual prices/.test(q)||intent.year){
        selected=(e.yearly||[]).filter(r=>!intent.year||String(r.year)===intent.year).map(r=>({name,...r}));slice='yearly';
      }else{selected=[{name,...e.summary,yield_pct:e.gross_yield_pct??null,...(e.registry||{})}];}
      details.push({name,window:e.window,truncated:!!d.truncated,registry:e.registry||null,yield_segments:intent.dataset==='yields_by_community'?e.yield_segments:undefined});
      selected=selected.map(r=>({...r,window:e.window||null}));
    }
    rows.push(...selected.slice(0,50).map(r=>({...r,data_through:date,source_ref:r.source_ref||sourceRef})));
  }
  const preferred={summary:['name','n','price_median','psf_median','psf_yoy','yield_pct','completion','completion_date','total_units'],developer_projects:['name','developer','n','completion','total_units','status'],bedrooms:['name','label','n','price_median','psf_median','rent_median','yield_pct','quality'],monthly:['name','label','n_sales','median','price'],yearly:['name','year','n','price_median','psf_median','value_total'],report:['label','n','price_median','psf_median','n_yoy','psf_yoy','offplan_share'],ranking:['name','rank','yield_pct','rent_median','n','price_median','psf_median'],search:['name','developer','n','price_median','psf_median','completion','completion_date'],stock:['band','projects','units_total','units_under_construction'],service_charges:['name','buildings','median_aed_sqft','budget_year']}[slice];
  const columns=[...preferred.filter(k=>rows.some(r=>r[k]!==undefined)), 'data_through'];
  const dates=[...new Set(sources.map(s=>s.dataThrough).filter(Boolean))].sort();
  const fetched=[...new Set(responses.map(r=>r.fetchedAt))].sort();
  const freshness=responses.some(r=>r.freshness==='stale')?'stale':responses.every(r=>r.freshness==='cached')?'cached':'fetched';
  return {dataset:intent.dataset,rows:rows.slice(0,60),columns,total:total||rows.length,sources,details,slice,dataThrough:dates.length===1?dates[0]:dates.length?'Varies by source':null,provider:{name:'Dubai Data',transport:[...new Set(responses.map(r=>r.transport))].join('+'),freshness,fetchedAt:fetched.at(-1),cacheHours:6},answer:ddAnswer(rows,columns,sources,{slice,freshness,total:total||rows.length})};
}
function ddAnswer(rows,columns,sources,{slice,freshness,total}){
  let answer=freshness==='stale'?'Dubai Data could not be refreshed. These are cached published figures; check their source dates.':'These are Dubai Data’s published figures, retrieved directly'+(freshness==='cached'?' and served from a recent cache.':'.');
  if(slice==='search')answer+=` Showing ${rows.length} of ${total} matching entities.`;
  if(slice==='developer_projects')answer+=' This is a published project list, not a verified complete count of the developer’s registry.';
  answer+='\n\n';
  for(const row of rows.slice(0,8)){
    const title=[row.name||row.band||'Dubai',row.label||row.year].filter(Boolean).join(' · ');
    const facts=columns.filter(k=>!['name','band','label','year','data_through'].includes(k)).filter(k=>row[k]!==null&&row[k]!==undefined).slice(0,7).map(k=>`${LABELS[k]||({median:'Median AED/sqft',price:'Median sale price (AED)',budget_year:'Budget year',median_aed_sqft:'AED/sqft/year',quality:'Sample quality'}[k])||k.replaceAll('_',' ')}: ${formatValue(row[k],k)}`);
    answer+=`- **${title}** — ${facts.join('; ')||'No publishable figures for this sample'}. [${row.source_ref}]\n`;
  }
  const windows=[...new Set(rows.map(r=>r.window).filter(Boolean))];
  if(windows.length)answer+='\nSummary observation window: '+windows.join('; ')+'.';
  answer+='\nSource data dates: '+[...new Set(sources.map(s=>s.dataThrough||'not specified'))].join('; ')+'. Fetch date and source cutoff are different.';
  if(rows.some(r=>r.yield_pct!=null))answer+='\nGross yields exclude service charges, vacancy, financing and acquisition costs. They are observed benchmarks.';
  if(rows.some(r=>r.completion!==undefined))answer+='\nConstruction progress is the last recorded inspection; completion dates are registry declarations and can change.';
  if(rows.some(r=>r.quality==='low'||r.quality==='insufficient'))answer+='\nLow or insufficient samples are flagged. Suppressed values are unavailable, not zero.';
  if(slice==='service_charges')answer+='\nThe budget year is not a snapshot date. These are community benchmarks, not a building invoice.';
  if(slice==='stock')answer+='\nRegistry supply includes approved projects; it is not a count of delivered homes.';
  return answer;
}
