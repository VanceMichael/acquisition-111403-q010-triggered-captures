import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startSource} from '../provider/server.mjs';
import {startIntake} from '../src/app.mjs';

const directory=await mkdtemp(join(tmpdir(),'intake-demo-'));
const source=await startSource();
const intake=await startIntake({origin:source.origin,directory});
const claim=async body=>{
 const response=await fetch(intake.origin+'/batches/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const receipt=await response.json();
 if(!response.ok)throw new Error(JSON.stringify(receipt));
 return receipt;
};
const summary=batch=>({
 id:batch.id,state:batch.completeness.state,captured:batch.completeness.captured,
 missed:batch.completeness.missed,unresolved:batch.completeness.unresolved,
 channels:batch.channels.map(channel=>({device:channel.device,status:channel.status,declaration:channel.declaration.status}))
});
try{
 const first=await claim({session:'s1',triggerId:'3'});
 console.log('首次领取',JSON.stringify(summary(first.batch)));
 console.log('本次结构化资料',JSON.stringify(first.records.map(record=>({id:record.id,samples:record.samples.length,timing:record.timing})),null,2));
 source.setPhase('camera-arrived');
 const second=await claim({session:'s1',triggerId:'3'});
 console.log('相机片段到达后补收',JSON.stringify(summary(second.batch)));
 console.log('结构化资料',JSON.stringify(await(await fetch(intake.origin+'/records')).json(),null,2));
 console.log('批次明细',JSON.stringify(second.batch,null,2));
 console.log('原文凭据',JSON.stringify(await(await fetch(intake.origin+'/receipts')).json(),null,2));
}finally{await intake.close();await source.close();await rm(directory,{recursive:true,force:true});}
