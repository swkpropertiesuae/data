import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/worker.mjs';
import {MANIFEST} from '../src/generated.mjs';
import {csvObjects} from '../src/csv.mjs';
import {normalize} from '../src/retrieval.mjs';
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('src/schema.sql','utf8'));
const insert=db.prepare('INSERT INTO records(id,dataset,name,search_text,payload,source_url,data_through,imported_at) VALUES(?,?,?,?,?,?,?,?)');
db.exec('BEGIN');for(const d of MANIFEST.datasets.filter(d=>d.file.endsWith('.csv'))){const id=d.id.replace('datadubai_','');csvObjects(fs.readFileSync(d.file,'utf8')).forEach((r,i)=>insert.run(id+':'+i,id,r.name||r.community||r.entity||r.label||'Dubai',normalize(Object.values(r).join(' ')),JSON.stringify(r),r.url||d.sourceUrl,d.dataThrough,MANIFEST.generatedAt));}db.exec('COMMIT');
function prepare(sql){let params=[];return {bind(...p){params=p;return this;},async first(){return db.prepare(sql).get(...params)||null;},async all(){return {results:db.prepare(sql).all(...params),success:true};},async run(){db.prepare(sql).run(...params);return {success:true};}};}
const env={DB:{prepare,async batch(items){const out=[];for(const i of items)out.push(await i.all());return out;}},ARCHIVE:{async get(){return null;}}};
const ctx={waitUntil(){}};
test('API retrieves both communities from the genuine snapshot',async()=>{const r=await worker.fetch(new Request('https://data.swk.rent/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'Compare JVC and Business Bay'})}),env,ctx);assert.equal(r.status,200);const a=await r.json();assert.equal(a.rows.length,2);assert.ok(a.rows.some(x=>x.name==='Business Bay'&&Number(x.price_median)===2000000));assert.ok(a.sources[0].url.startsWith('https://github.com/datadubai/'));});
test('API rejects unknown dataset names instead of interpolating SQL',async()=>{const r=await worker.fetch(new Request('https://data.swk.rent/api/records?dataset='+encodeURIComponent("communities'; DROP TABLE records;--")),env,ctx);assert.equal(r.status,400);assert.ok(db.prepare('SELECT count(*) n FROM records').get().n>9000);});
test('API does not attach Dubai observations to Abu Dhabi questions',async()=>{const r=await worker.fetch(new Request('https://data.swk.rent/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'What are the rental yields in Abu Dhabi?'})}),env,ctx);const a=await r.json();assert.deepEqual(a.rows,[]);assert.ok(a.answer.includes('do not have loaded'));});
test('Cross-origin chat submissions are rejected',async()=>{const r=await worker.fetch(new Request('https://data.swk.rent/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://unrelated.example'},body:'{"question":"JVC"}'}),env,ctx);assert.equal(r.status,403);});
test('CSV export contains publisher field names and formula-safe quoted values',async()=>{const r=await worker.fetch(new Request('https://data.swk.rent/api/export?dataset=communities&search=Business%20Bay'),env,ctx);assert.equal(r.status,200);assert.ok(r.headers.get('content-disposition').includes('communities.csv'));const csv=await r.text();assert.ok(csv.includes('"price_median"'));assert.ok(csv.includes('"Business Bay"'));});
