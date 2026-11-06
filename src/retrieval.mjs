export const LABELS = {
  name:'Name',community:'Community',entity:'Market',year:'Year',month:'Month',label:'Period / type',
  n:'Registered sales',n_sales:'Registered sales',price_median:'Median sale price (AED)',price:'Median price (AED)',
  psf_median:'Median AED/sqft',median:'Median AED/sqft',q1:'Lower quartile',q3:'Upper quartile',
  psf_yoy:'AED/sqft YoY (%)',price_yoy:'Price YoY (%)',n_yoy:'Sales YoY (%)',offplan_share:'Off-plan share (%)',
  yield_pct:'Gross yield (%)',rent_median:'Median annual rent (AED)',contracts:'Ejari contracts',
  developer:'Developer',status:'Registry status',completion:'Last inspected completion (%)',
  completion_date:'Declared completion date',total_units:'Registered units',n_projects:'Projects',
  units:'Registered units',building:'Under-construction projects',value_total:'Registered value (AED)',
  sqft_median:'Median size (sqft)',contracts_used:'Contracts in yield sample',ready_sales_used:'Ready sales in yield sample',
  segments:'Matched property types',escrow:'Escrow bank',area_name:'DLD area',n_rents:'Rental contracts',quality:'Quality flag'
};
export const TITLES = {
  communities:'Community overview',projects:'Registered projects',developers:'Developers',areas:'DLD areas',
  market_yearly:'Dubai annual sales',market_monthly:'Dubai monthly prices',market_bedrooms:'Dubai by bedroom count',
  community_monthly:'Community monthly history',community_yearly:'Community annual history',
  community_bedrooms:'Community by bedroom count',rents_by_community:'Registered rents',yields_by_community:'Gross rental yields',
  transactions:'DLD sale transactions'
};
const STOP=new Set('what which where when how why is are was were the a an of for in at on to with and or me my show tell give find compare versus vs best highest lowest top all entire every available data about can you please property properties real estate uae dubai investment invest investor investors buy budget sale sales prices price rental rent yields yield market registered projects project developers developer bedroom bedrooms br recent latest history historical monthly yearly trend trends percent percentage completion construction off plan offplan ready return returns'.split(' '));
export function normalize(v=''){return String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
export function expandAliases(q){return q.replace(/\bjvc\b/gi,'Jumeirah Village Circle').replace(/\bjvt\b/gi,'Jumeirah Village Triangle').replace(/\bjlt\b/gi,'DMCC Master Community').replace(/\bdamac island\b/gi,'Damac Islands').replace(/\bbingatti\b/gi,'Binghatti');}
export function getIntent(question){
  const q=normalize(expandAliases(question));
  const emirate=['abu dhabi','ajman','sharjah','ras al khaimah','umm al quwain','fujairah'].find(e=>q.includes(e));
  const privacy=/phone|mobile|contact list|passport|emirates id|owner names|owners names|buyer names|tenant names/.test(q);
  const investor=/investor|nationalit|golden visa|foreign investment|foreign buyer/.test(q);
  let dataset='communities';
  if(/yield|roi|return/.test(q))dataset='yields_by_community';
  else if(/rent|ejari|tenanc/.test(q))dataset='rents_by_community';
  else if(/construction|completion|handover|escrow|project|venice|sobha central|damac islands|maybach|binghatti|meriva|lunaya|greenz/.test(q))dataset='projects';
  else if(/developer/.test(q))dataset='developers';
  else if(/monthly|month|trend/.test(q))dataset='market_monthly';
  else if(/yearly|annual|20\d\d/.test(q))dataset='market_yearly';
  if(/latest sales|recent sales|individual sales|transactions|transaction records/.test(q))dataset='transactions';
  if(/\bbed|\bbr\b|studio/.test(q))dataset='community_bedrooms';
  if(/service charge|maintenance fee/.test(q))dataset='service_charges';
  if(/stock|supply|pipeline/.test(q))dataset='stock';
  const words=q.split(' ').filter(w=>w.length>1&&!STOP.has(w)&&!['gross','recorded','list','get','details','progress','communities','community','highest','lowest','have','has','there','currently'].includes(w)&&!/^\d+$/.test(w));
  return {q,emirate,privacy,investor,dataset,words:[...new Set(words)].slice(0,10),ascending:/lowest|cheapest|least|affordable/.test(q),year:q.match(/\b20\d{2}\b/)?.[0]};
}
export function selectColumns(dataset,rows){
  const preferred={projects:['name','developer','completion','completion_date','total_units','price_median','psf_median'],developers:['name','n_projects','units','n','price_median','psf_median'],yields_by_community:['name','yield_pct','price_median','contracts_used','ready_sales_used'],rents_by_community:['name','rent_median','contracts','yield_pct'],communities:['name','n','price_median','psf_median','yield_pct','offplan_share'],market_yearly:['year','n','price_median','psf_median','value_total'],market_monthly:['label','n','price','median','q1','q3'],community_bedrooms:['community','label','n','price_median','rent_median','yield_pct'],transactions:['instance_date','area_name_en','project_name','property_type_label','price_aed','area_sqm','price_psf']};
  if(dataset==='service_charges')return ['name','buildings','median_aed_sqft','budget_year'];
  if(dataset==='stock')return ['band','projects','units_total','units_under_construction'].filter(k=>rows.some(r=>r[k]!==undefined));
  if(dataset.startsWith('ajman_'))return Object.keys(rows[0]||{}).slice(0,8);
  return (preferred[dataset]||['name','year','n','price_median','psf_median']).filter(k=>rows.some(r=>r[k]!==undefined));
}
export function sortExpression(dataset){
  const metric={yields_by_community:'yield_pct',rents_by_community:'rent_median',projects:'n',developers:'n',market_yearly:'year',market_monthly:'month',community_monthly:'month',community_yearly:'year'}[dataset]||'n';
  return /month/.test(metric)?`json_extract(payload, '$.${metric}')`:`CAST(json_extract(payload, '$.${metric}') AS REAL)`;
}
export function safeLike(s){return String(s).replace(/[\\%_]/g,'\\$&');}
export function formatValue(value,key=''){
  if(value===null||value===undefined||value==='')return '—';
  if(typeof value==='string'&&!/^-?\d+(\.\d+)?$/.test(value))return value;
  const n=Number(value);if(!Number.isFinite(n))return String(value);
  return new Intl.NumberFormat('en-AE',{maximumFractionDigits:/yield|psf|median|completion|share|yoy/.test(key)?2:0}).format(n);
}
export function evidenceAnswer({question,intent,rows,total,sources,cutoff='2026-10-29',archive}){
  if(intent.privacy)return 'The public data connected here does not provide a private investor, owner, buyer or tenant contact database. I can help with registered market activity, projects, rental benchmarks and published investor statistics. Personal contact records are not included.';
  if(intent.emirate&&(intent.emirate!=='ajman'||!intent.dataset.startsWith('ajman_')||!rows.length))return `I do not have loaded records that answer this question for ${intent.emirate.replace(/\b\w/g,c=>c.toUpperCase())} yet, so I cannot calculate a reliable local price or return. The source links below show the relevant official portals and their access status.`;
  if(intent.investor)return 'Investor information is available through published market reports and aggregate statistics. No investor-level dataset has been imported here. Use the official sources below for the reported period, nationality breakdowns where published, and current eligibility guidance. I cannot infer investor identities or invent counts from property-sale totals.';
  if(!rows.length)return `I could not find matching imported records for “${question}”. Try a community, project or developer name, or browse the source catalogue. A source being listed does not mean its data has been imported.`;
  if(intent.dataset==='transactions')return `I found ${total.toLocaleString('en-AE')} matching registered sales in the indexed historical snapshot. The table shows individual records, sorted by registration date. [1]\n\nThe archive covers records through 2 November 2026. While indexing is in progress, counts cover only the imported portion. Prices are registered sale amounts, not asking prices.`;
  if(intent.dataset.startsWith('ajman_'))return `I found ${total.toLocaleString('en-AE')} matching records in the official Ajman dataset. The table preserves the publisher's fields. [1]\n\nRead period and aggregation fields carefully: quarterly or project totals are not individual property sales. Source data date: ${cutoff}.`;
  if(intent.dataset==='service_charges')return `These are community service-charge benchmarks for the **2026 budget year**, measured in **AED per sqft per year**. [1]\n\nThey combine general and reserve-fund residential rates. They are not an individual building invoice. The source JSON does not declare a separate snapshot date.`;
  if(intent.dataset==='stock')return `The DLD project registry snapshot through **${cutoff}** records the supply figures shown below. [1]\n\nRegistered unit counts describe approved projects, not confirmed delivered homes. Construction bands reflect the last inspection.`;
  const columns=selectColumns(intent.dataset,rows).slice(0,6);
  let answer=`I found ${total.toLocaleString('en-AE')} matching record${total===1?'':'s'} in **${TITLES[intent.dataset]||intent.dataset}**. ${rows.length<total?`Showing the first ${rows.length}. `:''}The imported DataDubai snapshot is through **${cutoff}**. [1]\n\n`;
  for(const row of rows.slice(0,4)){
    const title=row.name||row.community||row.label||row.year||row.entity||'Dubai';
    const facts=columns.filter(k=>!['name','community','label','year'].includes(k)).slice(0,4).map(k=>`${LABELS[k]||k}: ${formatValue(row[k],k)}`);
    answer+=`- **${title}** — ${facts.join('; ')}.\n`;
  }
  if(intent.dataset==='yields_by_community')answer+='\nGross yields exclude service charges, vacancy, financing, agency fees and transaction costs. They are observed benchmarks, not promised returns.';
  if(intent.dataset==='projects')answer+='\nCompletion is the last recorded inspection, not live site progress. Completion dates are registry declarations and may change.';
  if(/monthly|yearly/.test(intent.dataset))answer+='\nAnnual or monthly periods may have different coverage. Do not compare an incomplete year with a complete year without adjusting the period.';
  return answer;
}
export function numbersSupported(text,rows){
  const allowed=new Set(['1']);
  for(const r of rows)for(const v of Object.values(r)){for(const n of String(v??'').match(/-?\d[\d,]*(?:\.\d+)?/g)||[])allowed.add(String(Number(n.replaceAll(',',''))));}
  return (text.match(/-?\d[\d,]*(?:\.\d+)?/g)||[]).every(n=>allowed.has(String(Number(n.replaceAll(',','')))));
}
