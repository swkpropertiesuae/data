import {WorkflowEntrypoint} from 'cloudflare:workers';
import {archiveSales,importSalesChunk,refreshDataset} from './ingestion.mjs';
import {MANIFEST} from './generated.mjs';
import {importAjman,AJMAN_IDS} from './ajman.mjs';
export class AjmanImport extends WorkflowEntrypoint {
  async run(event,step){
    const results=[];
    const params=typeof event.payload==='string'?JSON.parse(event.payload):event.payload||{};
    const ids=params.dataset?AJMAN_IDS.filter(id=>id===params.dataset):AJMAN_IDS;
    for(const id of ids)results.push(await step.do(`import Ajman ${id}`,{retries:{limit:1,delay:'10 seconds'},timeout:'5 minutes'},()=>importAjman(this.env,id)));
    return {complete:true,results};
  }
}
export class SeedImport extends WorkflowEntrypoint {
  async run(event,step){
    const imported=[];
    for(const d of MANIFEST.datasets){const id=d.id.replace(/^datadubai_/,'');const rows=await step.do(`import ${id}`,{retries:{limit:2,delay:'10 seconds'},timeout:'5 minutes'},()=>refreshDataset(this.env,id,d.dataThrough));imported.push({id,rows});}
    return {complete:true,imported};
  }
}
export class DataImport extends WorkflowEntrypoint {
  async run(event,step){
    // One fixed snapshot, at most 175 chunks / 350 MiB; no schedule and no arbitrary URLs.
    const archive=await step.do('archive licensed sales snapshot',{retries:{limit:2,delay:'30 seconds'},timeout:'5 minutes'},()=>archiveSales(this.env));
    if(archive.bytes>350*1024*1024)throw new Error('Snapshot exceeds the bounded 350 MiB import allowance');
    for(let i=0;i<175;i++){
      const result=await step.do(`index sales part ${i}`,{retries:{limit:2,delay:'10 seconds'},timeout:'5 minutes'},()=>importSalesChunk(this.env));
      if(result.complete)return {complete:true,rows:result.rows,source:'DLD via Dubai Real Estate Data',dataThrough:'2026-11-02'};
    }
    throw new Error('Import reached bounded step limit; manual review required');
  }
}
