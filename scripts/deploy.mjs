import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const config=JSON.parse(fs.readFileSync('deployment.json','utf8'));
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID||config.account_id;
if(!token)throw new Error('Set CLOUDFLARE_API_TOKEN in the deployment environment. Never commit it.');
execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});
async function request(path,method,body){const r=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers:{Authorization:'Bearer '+token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:JSON.stringify(body)});const result=await r.json();if(!r.ok||!result.success)throw new Error('Cloudflare request failed: '+method+' '+path+' '+JSON.stringify(result.errors));return result;}
const form=new FormData();
await request(`/accounts/${account}/d1/database/${config.database_id}/query`,'POST',{sql:'CREATE TABLE IF NOT EXISTS provider_cache (key TEXT PRIMARY KEY,payload TEXT NOT NULL,fetched_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)'});
form.append('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:config.compatibility_date,bindings:[{type:'plain_text',name:'DUBAI_DATA_ENABLED',text:'true'},{type:'d1',name:'DB',id:config.database_id},{type:'r2_bucket',name:'ARCHIVE',bucket_name:config.bucket_name},{type:'ai',name:'AI'}],observability:{enabled:true,logs:{enabled:true,invocation_logs:true},traces:{enabled:true}},placement:{mode:'smart'},limits:{cpu_ms:300000}})],{type:'application/json'}));
form.append('worker.mjs',new Blob([fs.readFileSync('dist/worker.mjs')],{type:'application/javascript+module'}),'worker.mjs');
await request(`/accounts/${account}/workers/scripts/${config.worker_name}`,'PUT',form);
for(const [name,class_name,steps] of [['swk-data-import','DataImport',180],['swk-data-seed','SeedImport',20],['swk-data-ajman','AjmanImport',12]])await request(`/accounts/${account}/workflows/${name}`,'PUT',{script_name:config.worker_name,class_name,concurrency:{limit:1},limits:{steps}});
await request(`/accounts/${account}/workers/scripts/${config.worker_name}/schedules`,'PUT',[{cron:config.refresh_cron_utc}]);
console.log('Deployed SWK DATA. Existing archive-import jobs are not restarted.');
