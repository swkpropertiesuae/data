import {csvObjects,parseCSV} from './csv.mjs';
import {normalize} from './retrieval.mjs';
export const SNAPSHOT_ROOT='https://huggingface.co/datasets/dubairealestatedata/dubai-real-estate-sales-transactions/resolve/main/';
async function state(env,id){return JSON.parse((await env.DB.prepare('SELECT state FROM ingest_state WHERE id=?').bind(id).first())?.state||'{}');}
async function save(env,id,value){await env.DB.prepare('INSERT INTO ingest_state(id,state,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at').bind(id,JSON.stringify(value),new Date().toISOString()).run();}
export async function refreshDataset(env,dataset,cutoff){
  const isReference=['service_charges','stock'].includes(dataset);
  const sourceUrl=isReference?`https://datadubai.ae/${dataset==='service_charges'?'service-charges':'stock'}.json`:`https://raw.githubusercontent.com/datadubai/dubai-real-estate-dld/main/data/${dataset}.csv`;
  const response=await fetch(sourceUrl,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`Upstream CSV returned ${response.status}`);
  const bytes=Number(response.headers.get('content-length')||0);if(bytes>8e6)throw new Error('CSV exceeds bounded aggregate import size');
  const text=await response.text();if(text.length>8e6)throw new Error('CSV exceeds aggregate limit');
  let rows;
  if(isReference){const reference=JSON.parse(text);rows=dataset==='service_charges'?reference.communities.map(r=>({...r,budget_year:reference.year})): [{band:'All registered projects',projects:reference.projects,units_total:reference.units_total,units_under_construction:reference.units_under_construction},...reference.bands];cutoff=dataset==='stock'?reference.through:'2026 budget; snapshot date unspecified';}
  else rows=csvObjects(text);
  if(!rows.length)throw new Error('Empty upstream data; retaining previous snapshot');
  const version=crypto.randomUUID(),now=new Date().toISOString();
  // Stage the entire replacement before deleting old rows. Failed imports preserve the prior snapshot.
  let aggregateStatements=[];
  for(let i=0;i<rows.length;i+=40){
    const values=rows.slice(i,i+40).map((r,j)=>[`${dataset}:${version}:${i+j}`,`${dataset}:staging:${version}`,r.name||r.community||r.entity||r.label||'Dubai',normalize(Object.values(r).join(' ')),JSON.stringify(r),r.url||'https://datadubai.ae/',cutoff,now]).map(fields=>'('+fields.map(v=>"'"+String(v).replaceAll("'","''")+"'").join(',')+')');
    aggregateStatements.push(env.DB.prepare('INSERT INTO records(id,dataset,name,search_text,payload,source_url,data_through,imported_at) VALUES'+values.join(',')));
    if(aggregateStatements.length===12){await env.DB.batch(aggregateStatements);aggregateStatements=[];}
  }
  if(aggregateStatements.length)await env.DB.batch(aggregateStatements);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM records WHERE dataset=?').bind(dataset),
    env.DB.prepare('UPDATE records SET dataset=? WHERE dataset=?').bind(dataset,`${dataset}:staging:${version}`),
    env.DB.prepare("INSERT INTO dataset_status(id,rows,data_through,imported_at,status,last_error) VALUES(?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET rows=excluded.rows,data_through=excluded.data_through,imported_at=excluded.imported_at,status=excluded.status,last_error=NULL").bind(dataset,rows.length,cutoff,now,'loaded')
  ]);
  await env.ARCHIVE.put(`aggregates/${dataset}.${isReference?'json':'csv'}`,text,{httpMetadata:{contentType:isReference?'application/json':'text/csv;charset=utf-8'}});
  return rows.length;
}
export async function archiveSales(env){
  const s=await state(env,'sales_archive');if(s.complete)return s;
  // Stream both original source formats into durable storage; never buffer the bulk file in memory.
  const files=['dld_sales_transactions.parquet','dld_sales_transactions.csv'];
  for(const file of files){
    if(await env.ARCHIVE.head(file))continue;
    const r=await fetch(SNAPSHOT_ROOT+file,{signal:AbortSignal.timeout(120000)});
    if(!r.ok||!r.body)throw new Error(`Bulk source ${file}: HTTP ${r.status}`);
    await env.ARCHIVE.put(file,r.body,{httpMetadata:{contentType:file.endsWith('csv')?'text/csv':'application/vnd.apache.parquet'},customMetadata:{publisher:'Dubai Real Estate Data',license:'CC BY 4.0',source:SNAPSHOT_ROOT+file}});
  }
  const csv=await env.ARCHIVE.head(files[1]);
  const result={complete:true,bytes:csv.size,archivedAt:new Date().toISOString(),source:SNAPSHOT_ROOT,license:'CC BY 4.0'};
  await save(env,'sales_archive',result);return result;
}
export async function importSalesChunk(env){
  const s=await state(env,'sales_import');if(s.complete)return s;
  const archive=await env.ARCHIVE.head('dld_sales_transactions.csv');if(!archive)return {waitingForArchive:true};
  const offset=s.offset||0,length=Math.min(2*1024*1024,archive.size-offset);
  if(length<=0){s.complete=true;await save(env,'sales_import',s);return s;}
  const object=await env.ARCHIVE.get('dld_sales_transactions.csv',{range:{offset,length}});
  // CSV source is UTF-8: carry the incomplete trailing bytes, not a decoded replacement character.
  const bytes=new Uint8Array(await object.arrayBuffer());
  let end=bytes.length;const lastChunk=offset+bytes.length>=archive.size;
  if(!lastChunk){while(end>0&&bytes[end-1]!==10)end--;if(!end)throw new Error('No CSV row boundary in import chunk');}
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,end));
  const parsed=parseCSV(text),headers=s.headers||parsed.shift();
  const objects=parsed.filter(r=>r.length===headers.length).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]])));
  let statements=[];
  for(let i=0;i<objects.length;i+=80){
    const values=objects.slice(i,i+80).map((r,j)=>{
      const pick=(...keys)=>keys.map(k=>r[k]).find(v=>v!==undefined&&v!=='')||'';
      const id=pick('transaction_id','transaction_number','id')||`${offset}:${i+j}`;
      const fields=[id,pick('instance_date','transaction_date','date'),pick('area_name_en','area','area_name'),pick('project_name','building_name','project_name_en'),pick('property_type_label','property_type_en'),pick('reg_type_label','reg_type_en'),pick('rooms_bucket','rooms_en'),Number(pick('area_sqm','procedure_area'))||null,Number(pick('price_aed','actual_worth'))||null,null,JSON.stringify(r)];
      // Values come from the licensed CSV, never from a query. Escape every literal; cap each SQL statement below D1's 100 KB limit.
      return '('+fields.map(v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'").join(',')+')';
    });
    const sql='INSERT OR IGNORE INTO transactions(id,date,area,project,property_type,registration,bedrooms,size_sqm,price_aed,price_sqm,payload) VALUES'+values.join(',');
    if(new TextEncoder().encode(sql).length>99000)throw new Error('Bulk insert exceeds SQL size limit');
    statements.push(env.DB.prepare(sql));
    if(statements.length===16){await env.DB.batch(statements);statements=[];}
  }
  if(statements.length)await env.DB.batch(statements);
  const next={offset:offset+end,headers,rows:(s.rows||0)+objects.length,bytes:archive.size,complete:offset+end>=archive.size,updatedAt:new Date().toISOString()};
  await save(env,'sales_import',next);return next;
}
export async function scheduledIngest(env,manifest){
  const lease=await env.DB.prepare("INSERT INTO ingest_state(id,state,updated_at) VALUES('lease',?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at WHERE updated_at < ? RETURNING id").bind('{}',new Date().toISOString(),new Date(Date.now()-8*60000).toISOString()).first();
  if(!lease)return;
  try{
    await archiveSales(env);
    for(let i=0;i<5;i++){const r=await importSalesChunk(env);if(r.complete||r.waitingForArchive)break;}
    const completed=await state(env,'sales_import');
    if(completed.complete){
      const refresh=await state(env,'aggregate_refresh');
      const day=new Date().toISOString().slice(0,10);
      if(refresh.completedDay!==day){
        // Read the publisher's cutoff instead of labelling today's import as today's market data.
        const readme=await fetch('https://raw.githubusercontent.com/datadubai/dubai-real-estate-dld/main/README.md',{signal:AbortSignal.timeout(15000)});
        const cutoff=(await readme.text()).match(/Data through:\s*([0-9-]{10})/i)?.[1]||manifest.dataThrough||'2026-10-29';
        const index=refresh.workingDay===day?(refresh.index||0):0;
        for(let i=index;i<manifest.datasets.length;i++)await refreshDataset(env,manifest.datasets[i].id,cutoff);
        const nextIndex=manifest.datasets.length;
        await save(env,'aggregate_refresh',{completedDay:nextIndex>=manifest.datasets.length?day:null,workingDay:day,index:nextIndex>=manifest.datasets.length?0:nextIndex,cutoff});
      }
    }
  }catch(e){console.error(JSON.stringify({event:'ingestion_failed',message:e.message}));await save(env,'last_ingest_error',{message:e.message,at:new Date().toISOString()});}
  finally{await env.DB.prepare("DELETE FROM ingest_state WHERE id='lease'").run();}
}
