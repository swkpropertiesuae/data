import http from 'node:http';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {csvObjects} from '../src/csv.mjs';
import {normalize} from '../src/retrieval.mjs';
execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});
const worker=(await import('../src/worker.mjs')).default;
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('src/schema.sql','utf8'));
const manifest=(await import('../src/generated.mjs')).MANIFEST;
const insert=db.prepare('INSERT INTO records(id,dataset,name,search_text,payload,source_url,data_through,imported_at) VALUES(?,?,?,?,?,?,?,?)');
db.exec('BEGIN');
for(const d of manifest.datasets){const id=d.id.replace('datadubai_','');let rows;if(d.file.endsWith('.json')){const ref=JSON.parse(fs.readFileSync(d.file,'utf8'));rows=id==='service_charges'?ref.communities.map(r=>({...r,budget_year:ref.year})):[{band:'All registered projects',projects:ref.projects,units_total:ref.units_total,units_under_construction:ref.units_under_construction},...ref.bands];}else rows=csvObjects(fs.readFileSync(d.file,'utf8'));rows.forEach((r,i)=>insert.run(id+':'+i,id,r.name||r.community||r.entity||r.label||'Dubai',normalize(Object.values(r).join(' ')),JSON.stringify(r),r.url||d.sourceUrl,d.dataThrough,manifest.generatedAt));db.prepare('INSERT INTO dataset_status(id,rows,data_through,imported_at,status) VALUES(?,?,?,?,?)').run(id,rows.length,d.dataThrough,manifest.generatedAt,'loaded');}
db.exec('COMMIT');
function prepare(sql){let args=[];return {bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args),success:true};},async run(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}};}
const env={DB:{prepare,async batch(statements){db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.all());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}},ARCHIVE:{async get(){return null;},async head(){return null;}}};
const server=http.createServer(async(req,res)=>{try{const data=[];for await(const chunk of req)data.push(chunk);const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(data)}:{})});const response=await worker.fetch(request,env,{waitUntil(p){p.catch(console.error);}});res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)for await(const c of response.body)res.write(c);res.end();}catch(e){console.error(e);res.writeHead(500);res.end('Preview error');}});
const portIndex=process.argv.indexOf('--port');const port=Number(process.argv[portIndex+1]||process.env.PORT||3000);server.listen(port,'0.0.0.0',()=>console.log('SWK DATA preview on '+port));
