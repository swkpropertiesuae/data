import {normalize,formatValue,LABELS} from './retrieval.mjs';

export const DUBAI_SECTIONS={
  launches:{name:'Project launches',path:'projects/launches',question:'Show newly registered Dubai project launches'},
  mortgages:{name:'Mortgages and gifts',path:'mortgages',question:'Show Dubai mortgage and gift registrations separately'},
  affordability:{name:'Affordability bands',path:'affordability',question:'Show Dubai affordability budget bands'},
  handover:{name:'Declared handover years',path:'handover',question:'Show declared Dubai handovers by year'},
  construction:{name:'Construction bands',path:'construction',question:'Show Dubai construction completion bands'},
  methodology:{name:'Methodology',path:'methodology',question:'Explain Dubai Data methodology and sample thresholds'},
  glossary:{name:'Property glossary',path:'glossary',question:'Show the Dubai Data glossary'},
  sources:{name:'Publisher source coverage',path:'sources',question:'Which datasets does Dubai Data hold and use?'},
  roi:{name:'Net yield worked example',path:'roi-calculator',question:'Explain the Dubai Data net yield worked example'},
  latest:{name:'Latest publisher transactions',path:'transactions',question:'Show the latest registered transactions from Dubai Data'}
};
export const DUBAI_METHODOLOGY={
  version:'1.0',versionDate:'2026-09-09',source:'https://datadubai.ae/methodology/',
  rules:[
    'Figures are medians and interquartile ranges, not means. Outliers are trimmed at P1–P99 within year, property subtype and registration type.',
    'Statistical samples below five are suppressed. Five to nineteen observations are marked low sample. Counts and each separate rental/sales sample retain their own meaning.',
    'Registered-sales counts cover all property types unless the source explicitly says residential. These populations are not interchangeable.',
    'Sales, mortgages and gifts are separate populations. Never add them as a sales count; a mortgage loan amount is not a sale price.',
    'Amounts are AED. DLD sizes are sqm; sqft uses the published conversion. Price per sqft excludes land and whole-building sales even when transaction counts include them.',
    'Gross yield uses matched asset-class and bedroom rent/ready-sale segments, requiring at least fifteen contracts and fifteen ready sales. Costs are not deducted.',
    'Headlines use twelve complete months and exclude the incomplete source month. Fetch time is not the source cutoff or observation window. Construction progress is the last irregular DLD inspection.',
    'DLD administrative areas and market communities are different geographies. Do not silently substitute one for the other.'
  ]
};
export function dubaiSectionPlan(question,intent,hints=[]){
  const q=normalize(question);let id;
  if(/net yield|net roi|roi calculator|worked example/.test(q))id='roi';
  else if(/methodology|outlier|sample threshold|low sample|suppression|interquartile|median.*mean|trim percentile/.test(q))id='methodology';
  else if(/glossary|\bdefine\b|definition|what does .* mean/.test(q)||(!hints.length&&/^what is (gross yield|net yield|ejari|off plan|freehold|leasehold)\??$/.test(q)))id='glossary';
  else if(/(dubai data|datadubai|publisher)/.test(q)&&/source|datasets|hold|coverage|rows used/.test(q))id='sources';
  else if(/mortgage|\bgifts?\b/.test(q))id='mortgages';
  else if(/affordability|budget bands|what.*budget.*buys/.test(q))id='affordability';
  else if(/project launches|new launches|newly registered.*project|new project launches/.test(q))id='launches';
  else if(/handover.*(?:years|by year)|declared completion years/.test(q)||(!hints.length&&/handover/.test(q)&&/20\d\d|how many/.test(q)))id='handover';
  else if(/construction.*bands|completion bands|construction distribution|projects by.*completion/.test(q))id='construction';
  else if(/latest|recent|newest/.test(q)&&/transactions|registered sales/.test(q)&&!/historical|archive/.test(q))id='latest';
  if(!id)return null;
  const year=intent.year;
  const path=DUBAI_SECTIONS[id].path+(id==='launches'&&year?'/'+year:'');
  return {kind:'section',section:id,pageUrl:'https://datadubai.ae/'+path+'/',year};
}
export function validateDubaiSection(data,id){
  const checks={launches:()=>Array.isArray(data.projects),mortgages:()=>data.mortgages_12m&&data.gifts_12m&&Array.isArray(data.mortgages_by_year),affordability:()=>Array.isArray(data.bands),handover:()=>data.years&&typeof data.years==='object'&&!Array.isArray(data.years),construction:()=>Array.isArray(data.bands),methodology:()=>typeof data.version==='string'&&typeof data.min_publish==='number'&&data.yield_rules,glossary:()=>Array.isArray(data.terms),sources:()=>Array.isArray(data.datasets),roi:()=>typeof data.formula==='string'&&data.example,latest:()=>Array.isArray(data.transactions)};
  if(!data||typeof data!=='object'||!checks[id]?.())throw new Error('invalid_section_'+id);
  if(data.through&&!/^20\d{2}-\d{2}-\d{2}$/.test(data.through))throw new Error('invalid_section_cutoff');
  return data;
}
export function protectDubaiStatistics(row){
  const r={...row},n=Number(r.n),hasN=r.n!==undefined&&r.n!==null;
  if(hasN&&Number.isFinite(n)){
    if(n<5){for(const k of ['price_median','price_q1','price_q3','psf_median','psf_q1','psf_q3','sqft_median','price_yoy','psf_yoy'])if(k in r)r[k]=null;r.quality='insufficient';}
    else if(n<20&&r.quality!=='insufficient')r.quality='low';
  }
  if(r.n_rents!==undefined&&Number(r.n_rents)<5)r.rent_median=null;
  if(r.n_price!==undefined&&Number(r.n_price)<5)for(const key of ['price_median','price_q1','price_q3'])if(key in r)r[key]=null;
  if(r.n_psf!==undefined&&Number(r.n_psf)<5)for(const key of ['psf_median','psf_q1','psf_q3'])if(key in r)r[key]=null;
  if((r.contracts_used!==undefined&&Number(r.contracts_used)<15)||(r.ready_sales_used!==undefined&&Number(r.ready_sales_used)<15))r.yield_pct=null;
  return r;
}
export function dubaiMethodologyNotes({question='',slice='',rows=[]}={}){
  const q=normalize(question),notes=[];
  if(rows.some(r=>r.quality==='low'||r.quality==='insufficient'))notes.push('Low samples are flagged. Suppressed statistics are unavailable, not zero; sales and rent sample sizes are separate.');
  if(['summary','report','ranking','search','bedrooms','monthly','yearly'].includes(slice))notes.push('Sales counts include all property types unless expressly labelled residential. AED/sqft uses the publisher’s built-home population, excluding land and whole buildings.');
  if(/yield|roi/.test(q)||rows.some(r=>r.yield_pct!=null))notes.push('Gross yields use matched asset-class and bedroom segments with at least 15 rents and 15 ready sales, before costs.');
  if(rows.some(r=>r.completion!==undefined)||slice==='construction')notes.push('Construction percentages are the last recorded DLD inspection, which may be irregular; they are not live progress.');
  if(/area|community|communities|marsa|marina/.test(q))notes.push('Administrative DLD areas and market communities are different geographies; compare like-for-like boundaries.');
  return notes;
}
const ddSectionCount=v=>Number(String(v??'').replace(/[\s,\u00a0\u202f]/g,''))||0;
export function dubaiSectionEvidence(data,plan,question){
  const id=plan.section,q=normalize(question);let rows=[],columns=[],notes=[],details={};
  if(id==='launches'){
    rows=data.projects.map(r=>({...r,name:r.name,registered_units:r.units,last_inspected_completion_pct:r.completion_pct}));
    columns=['name','registered','developer','where','registered_units','last_inspected_completion_pct','declared_completion','registered_sales'];
    notes=['Launches are newly DLD-registered projects, not sales launches inferred from marketing. Unit counts are registered planned supply; completion dates are declarations.'];
    details={publishedYear:data.year,publishedProjectCount:data.count,registeredUnits:data.units,registeredLast7Days:data.registered_last_7_days,registeredLast30Days:data.registered_last_30_days,registeredLast90Days:data.registered_last_90_days};
  }else if(id==='mortgages'){
    const loan=(r,extra={})=>({population:'Mortgages',...extra,registered_count:r.n,median_loan_amount_aed:r.n_price!==undefined&&r.n_price<5?null:r.price_median,total_loan_amount_aed:r.price_total??r.value_total});
    if(plan.year||/yearly|by year|history/.test(q))rows=/gift/.test(q)&&!/mortgage/.test(q)?[]:data.mortgages_by_year.filter(r=>!plan.year||String(r.year)===plan.year).map(r=>loan(r,{year:r.year}));
    else{
      if(!/gift/.test(q)||/mortgage/.test(q))rows.push(loan(data.mortgages_12m,{period:'Publisher trailing 12 complete months'}));
      if(/gift/.test(q)||!/mortgage/.test(q)){const g=data.gifts_12m;rows.push({population:'Gifts',period:'Publisher trailing 12 complete months',registered_count:g.n,median_declared_transfer_aed:g.n_price!==undefined&&g.n_price<5?null:g.price_median,total_declared_transfer_aed:g.price_total});}
    }
    columns=['population','year','period','registered_count','median_loan_amount_aed','total_loan_amount_aed','median_declared_transfer_aed','total_declared_transfer_aed'].filter(k=>rows.some(r=>k in r));
    notes=['Mortgages and gifts are separate registration populations; they are never added to sales. Loan amounts and declared gift amounts are not sale prices.','This feed reports registrations, not bank mortgage interest rates. Published annual history covers mortgages; gift annual history is not supplied.'];
  }else if(id==='affordability'){
    rows=data.bands;columns=['band','sales'];notes=['These are published registered-sale budget bands, not asking prices or available listings. A partial band cannot answer an exact custom budget.'];
  }else if(id==='handover'){
    rows=Object.entries(data.years).filter(([year])=>!plan.year||year===plan.year).map(([year,r])=>({year,projects:r.projects,registered_units:r.units}));columns=['year','projects','registered_units'];notes=['Handover years are declared completion years from the registry. Counts do not establish completed, occupied or delivered homes.'];
  }else if(id==='construction'){
    rows=data.bands;columns=['band','projects'];notes=['These are project counts by last DLD-inspected completion band. Inspections are irregular and these figures do not describe live construction progress.'];
  }else if(id==='methodology'){
    rows=[{rule:'Methodology version',value:'v'+data.version},{rule:'Methodology version date',value:data.date},{rule:'Headline complete months',value:data.trailing_months},{rule:'Minimum publishable sample',value:data.min_publish},{rule:'Low sample below',value:data.low_sample},{rule:'Trim percentiles (fraction)',value:JSON.stringify(data.trim_percentiles)},{rule:'Minimum rents per yield segment',value:data.yield_rules.min_rents},{rule:'Minimum ready sales per yield segment',value:data.yield_rules.min_sales},{rule:'Square feet per square metre',value:String(data.sqm_to_sqft)+' sqft per sqm'}];columns=['rule','value'];notes=DUBAI_METHODOLOGY.rules;details={publisherMethodologyVersion:data.version,publisherVersionDate:data.date};
  }else if(id==='glossary'){
    const matches=data.terms.filter(t=>q.includes(normalize(t.term))||q.replaceAll(' ','').includes(normalize(t.id).replaceAll(' ','')));
    rows=/glossary/.test(q)?data.terms:matches;columns=['term','definition'];notes=['Definitions describe the publisher’s data terminology; they do not provide an individual valuation or eligibility decision.'];
  }else if(id==='sources'){
    rows=data.datasets.map(r=>({...r,publisher_rows_held:ddSectionCount(r.rows_held),publisher_rows_used:ddSectionCount(r.rows_used)}));columns=['name','publisher','publisher_rows_held','publisher_rows_used','coverage','last_import','refresh'];notes=['Held and used counts refer to Dubai Data’s source warehouse, not SWK DATA’s imported totals. Publisher import date, rebuild date and source coverage are different.'];details={publisherBuilt:data.built};
  }else if(id==='roi'){
    const e=data.example;rows=[{name:'Illustrative publisher example · '+e.community,example_price_aed:e.price,example_rent_aed:e.rent,size_sqft:e.size_sqft,service_charge_aed_sqft:e.service_charge_aed_sqft,purchase_costs_pct:e.purchase_costs_pct,vacancy_management_pct:e.vacancy_management_pct,example_net_yield_pct:e.net_yield_pct}];columns=Object.keys(rows[0]);details={publishedFormula:data.formula};notes=['Published formula: '+data.formula,'This is the publisher’s illustrative worked example and its stated assumptions, not a calculated return for your property.','Net yield deducts stated vacancy/management and service charges, and includes stated purchase costs in the denominator. Mortgage costs and tax are excluded.'];
  }else if(id==='latest'){
    rows=data.transactions.filter(r=>!plan.year||String(r.date).startsWith(plan.year));columns=['date','project','area','community','rooms','registration','price_aed','sqm','psf'];notes=['This is the publisher’s limited latest-transactions feed, not the complete DLD history or all activity through today. The source cutoff is shown separately.'];
  }
  return {rows,columns,notes,details,total:rows.length};
}
export function dubaiSectionAnswer(evidence,plan,date,freshness){
  const {rows,columns,total,notes}=evidence;
  let answer=`**Dubai Data · ${DUBAI_SECTIONS[plan.section].name}** — ${freshness==='stale'?'older cached published response':freshness==='cached'?'cached published response':'fetched from the public JSON feed'}. [1]\n\n`;
  if(!rows.length)answer+='The published feed has no matching rows for the requested detail. No count or statistic is inferred.\n';
  else{
    answer+=`Showing ${Math.min(50,total)} of ${total} matching published rows.\n\n`;
    for(const r of rows.slice(0,8)){
      const title=r.name||r.population||r.rule||r.term||r.band||r.year||r.date||'Record';
      const facts=columns.filter(k=>!['name','population','rule','term','band'].includes(k)&&r[k]!==null&&r[k]!==undefined).slice(0,7).map(k=>`${LABELS[k]||k.replaceAll('_',' ')}: ${formatValue(r[k],k)}`);
      answer+=`- **${title}** — ${facts.join('; ')}. [1]\n`;
    }
  }
  answer+='\nSource data cutoff: '+(date||'not declared by this feed')+'. Fetch time is reported separately.\n\n'+notes.join('\n');
  return answer;
}
