import {normalize} from './retrieval.mjs';
export const AJMAN_IDS=['real-estate-units-sales','real-estate-units-transactions','real-estate-units-registration','real-estate-projects','lands-sales','lands-transactions','real-estate-offices','real-estate-offices-classification','real-estate-activities-for-each-office'];
export async function importAjman(env,id){
  if(!AJMAN_IDS.includes(id))throw new Error('Unapproved Ajman dataset');
  const dataset='ajman_'+id,base='https://data.ajman.ae/api/explore/v2.1/catalog/datasets/'+id;
  try{
    const metadataResponse=await fetch(base,{signal:AbortSignal.timeout(25000)});
    if(!metadataResponse.ok)throw new Error(`Ajman metadata HTTP ${metadataResponse.status}`);
    const metadata=await metadataResponse.json(),meta=metadata.metas?.default||{};
    const license=String(meta.license||meta.license_url||'');if(!/CC BY 4\.0|Creative Commons Attribution|creativecommons.org\/licenses\/by\/4.0/i.test(license))throw new Error('Dataset reuse licence requires verification');
    const response=await fetch(base+'/exports/json',{signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw new Error(`Ajman export HTTP ${response.status}`);
    if(Number(response.headers.get('content-length')||0)>24e6)throw new Error('Ajman export exceeds bounded 24 MB limit');
    const reader=response.body.getReader(),decoder=new TextDecoder();let text='',size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>24e6){await reader.cancel();throw new Error('Ajman export exceeds bounded size limit');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
    const rows=JSON.parse(text);if(!Array.isArray(rows)||!rows.length||rows.length>40000)throw new Error('Unexpected or oversized Ajman export');
    const cutoff=String(meta.modified||meta.data_processed||'').slice(0,10)||'Publisher date unspecified',now=new Date().toISOString(),version=crypto.randomUUID();
    let statements=[];
    for(let i=0;i<rows.length;i+=10){
      const values=rows.slice(i,i+10).map((r,j)=>{
        const name=Object.entries(r).find(([k,v])=>/project.*name|district.*name|office.*name|area.*name|name_en|name_english/i.test(k)&&typeof v==='string')?.[1]||'Ajman';
        return [`${dataset}:${version}:${i+j}`,`${dataset}:staging:${version}`,'Ajman',name,normalize(Object.values(r).join(' ')),JSON.stringify(r),base,cutoff,now];
      }).map(fields=>'('+fields.map(v=>"'"+String(v).replaceAll("'","''")+"'").join(',')+')');
      const sql='INSERT INTO records(id,dataset,emirate,name,search_text,payload,source_url,data_through,imported_at) VALUES'+values.join(',');
      if(new TextEncoder().encode(sql).length>99000)throw new Error('Ajman row exceeds bounded SQL size');
      statements.push(env.DB.prepare(sql));if(statements.length===16){await env.DB.batch(statements);statements=[];}
    }
    if(statements.length)await env.DB.batch(statements);
    await env.DB.batch([env.DB.prepare('DELETE FROM records WHERE dataset=?').bind(dataset),env.DB.prepare('UPDATE records SET dataset=? WHERE dataset=?').bind(dataset,`${dataset}:staging:${version}`),env.DB.prepare("INSERT INTO dataset_status(id,rows,data_through,imported_at,status,last_error) VALUES(?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET rows=excluded.rows,data_through=excluded.data_through,imported_at=excluded.imported_at,status=excluded.status,last_error=NULL").bind(dataset,rows.length,cutoff,now,'loaded')]);
    await env.ARCHIVE.put(`ajman/${id}.json`,text,{httpMetadata:{contentType:'application/json'},customMetadata:{license,source:base,dataThrough:cutoff}});
    return {id:dataset,rows:rows.length,cutoff};
  }catch(e){await env.DB.prepare("INSERT INTO dataset_status(id,rows,status,last_error) VALUES(?,0,'unavailable',?) ON CONFLICT(id) DO UPDATE SET last_error=excluded.last_error").bind(dataset,e.message).run();return {id:dataset,error:e.message};}
}
