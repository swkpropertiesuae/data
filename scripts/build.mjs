import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const CATALOG=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'),'utf8'));
const MANIFEST=JSON.parse(fs.readFileSync(path.join(root,'data/manifest.json'),'utf8'));
for(const [id,title,file,columns,rows,dataThrough] of [
  ['service_charges','Community service charges','datadubai_service_charges.json',['name','buildings','median_aed_sqft','budget_year'],46,'2026 budget; snapshot date unspecified'],
  ['stock','Registered stock and pipeline','datadubai_stock.json',['band','projects','units_total','units_under_construction'],6,'2026-10-29']
])MANIFEST.datasets.push({id:'datadubai_'+id,name:title,file:'data/references/'+file,columns,rows,dataThrough,sourceUrl:'https://datadubai.ae/'+(id==='service_charges'?'service-charges':'stock')+'/',publisher:'Dubai Data / Continental Club Property',license:'Attribution and source link required'});
const ASSETS={};
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(!e.name.endsWith('.json')){const ext=path.extname(file),binary=['.png','.ico','.webp'].includes(ext);ASSETS['/'+path.relative(path.join(root,'public'),file).replaceAll(path.sep,'/')]={body:fs.readFileSync(file,binary?undefined:'utf8').toString(binary?'base64':'utf8'),base64:binary,type:{'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8','.js':'text/javascript;charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}[ext]||'application/octet-stream'};}}}
walk(path.join(root,'public'));
const generated=`export const CATALOG=${JSON.stringify(CATALOG)};\nexport const MANIFEST=${JSON.stringify(MANIFEST)};\nexport const ASSETS=${JSON.stringify(ASSETS)};\n`;
fs.writeFileSync(path.join(root,'src/generated.mjs'),generated);
const files=['generated.mjs','retrieval.mjs','csv.mjs','ingestion.mjs','ajman.mjs','workflow.mjs','worker.mjs'];
let source="import {WorkflowEntrypoint} from 'cloudflare:workers';\n";
for(const file of files){let code=fs.readFileSync(path.join(root,'src',file),'utf8').replace(/^import .*;\s*$/gm,'').replace(/^export \{[^}]+\};?\s*$/gm,'');code=code.replace(/export (const|function|async function)/g,'$1');source+='\n'+code;}
fs.mkdirSync(path.join(root,'dist'),{recursive:true});fs.writeFileSync(path.join(root,'dist/worker.mjs'),source);
console.log(JSON.stringify({ok:true,assets:Object.keys(ASSETS).length,sources:CATALOG.length,rows:MANIFEST.datasets.reduce((n,d)=>n+d.rows,0),workerBytes:Buffer.byteLength(source)}));
