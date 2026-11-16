import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startSource} from '../provider/server.mjs';
import {createClient} from '../src/source.mjs';
import {openArchive} from '../src/archive.mjs';
import {claimBatch, batchIdFor} from '../src/batch.mjs';
import {startIntake} from '../src/app.mjs';

async function environment(run){
 const directory=await mkdtemp(join(tmpdir(),'batch-test-'));const source=await startSource();
 try{await run({directory,source});}finally{await source.close();await rm(directory,{recursive:true,force:true});}
}

async function claim(directory,source,{session,triggerId}={}){
 const archive=await openArchive(directory);const client=createClient(source.origin);
 const result=await claimBatch({client,archive,session,triggerId,now:'2026-11-16T00:00:00.000Z'});
 await archive.commit(result.records,client.exchanges,[result.batch]);
 return {result,archive,batch:archive.batch(result.batch.id)};
}

const channelOf=(batch,device)=>batch.channels.find(channel=>channel.device===device);

test('一次触发按来源绑定收齐多台设备，不按到达顺序凑包',()=>environment(async({directory,source})=>{
 const {batch,result}=await claim(directory,source,{session:'s1',triggerId:'3'});
 assert.equal(batch.id,'s1:3');
 assert.equal(batch.completeness.state,'partial');
 assert.equal(channelOf(batch,'meter').status,'complete');
 assert.equal(channelOf(batch,'camera').status,'awaiting-segment');
 assert.deepEqual(result.records.map(record=>record.id),['meter:b1:3']);
 assert.equal(result.records[0].batchId,'s1:3');
 assert.equal(result.records[0].triggerId,'3');
 source.setPhase('camera-arrived');
 const next=await claim(directory,source,{session:'s1',triggerId:'3'});
 assert.equal(next.batch.completeness.state,'complete');
 assert.deepEqual(next.result.records.map(record=>record.id),['camera:c1:7','meter:b1:3']);
 assert.deepEqual(next.batch.history.map(entry=>entry.state),['partial','complete']);
}));

test('领取后可继续补收，已收通道不会因另一次领取丢失',()=>environment(async({directory,source})=>{
 await claim(directory,source,{session:'s1',triggerId:'3'});
 const {archive}=await claim(directory,source,{session:'s1',triggerId:'3'});
 const records=archive.records();
 assert.deepEqual(records.map(record=>record.id),['meter:b1:3']);
 assert.equal(records[0].samples.length,3);
}));

test('pending不是漏采，missed只影响对应设备且其余通道保留',()=>environment(async({directory,source})=>{
 const pending=await claim(directory,source,{session:'s1',triggerId:'3'});
 assert.equal(channelOf(pending.batch,'camera').declaration.status,'pending');
 assert.equal(pending.batch.completeness.state,'partial');
 source.setPhase('missed');
 const missed=await claim(directory,source,{session:'s1',triggerId:'3'});
 assert.equal(channelOf(missed.batch,'camera').status,'missed');
 assert.equal(channelOf(missed.batch,'camera').declaration.status,'missed');
 assert.equal(missed.batch.completeness.state,'complete');
 assert.equal(missed.batch.completeness.captured,1);
 assert.equal(missed.batch.completeness.missed,1);
 assert.deepEqual(missed.result.records.map(record=>record.id),['meter:b1:3']);
}));

test('来源声明漏采但实际片段完整时按实收保留并显式记录',()=>environment(async({directory,source})=>{
 source.setPhase('missed-then-arrived');
 const {batch,result}=await claim(directory,source,{session:'s1',triggerId:'3'});
 assert.equal(channelOf(batch,'camera').declaration.status,'missed');
 assert.equal(channelOf(batch,'camera').status,'complete');
 assert.ok(channelOf(batch,'camera').issues.some(issue=>issue.code==='declared-missed-but-captured'));
 assert.deepEqual(result.records.map(record=>record.id),['camera:c1:7','meter:b1:3']);
 assert.equal(batch.completeness.state,'complete');
}));

test('每个通道按片段自身计数判断齐套，通道长度不等不影响齐套',()=>environment(async({directory,source})=>{
 source.setPhase('multi-trigger');
 const {batch}=await claim(directory,source,{session:'s1',triggerId:'3'});
 assert.equal(batch.completeness.state,'complete');
 const meter=channelOf(batch,'meter'),camera=channelOf(batch,'camera');
 assert.equal(meter.segment.count,3);
 assert.equal(camera.segment.count,2);
 assert.notEqual(meter.samples.receivedCount,camera.samples.receivedCount);
 assert.equal(batch.completeness.criteria.equalChannelLengthsUsed,false);
 assert.equal(meter.samples.receivedCount,meter.segment.count);
 assert.equal(camera.samples.receivedCount,camera.segment.count);
}));

test('预采样计入片段起点之前，触发时刻由startTick与preSamples换算',()=>environment(async({directory,source})=>{
 const {batch}=await claim(directory,source,{session:'s1',triggerId:'3'});
 const meter=channelOf(batch,'meter');
 assert.equal(meter.segment.preSamples,2);
 assert.equal(meter.segment.startTick,80);
 assert.equal(meter.segment.timing.triggerTick,80.2);
 assert.equal(meter.segment.timing.startTick,80);
}));

test('时间校准的不确定范围可见，且不用于合并触发',()=>environment(async({directory,source})=>{
 source.setPhase('multi-trigger');
 const first=await claim(directory,source,{session:'s1',triggerId:'3'});
 const meter=channelOf(first.batch,'meter');
 assert.ok(meter.segment.timing.uncertaintySeconds>0);
 assert.ok(meter.segment.timing.trigger.high>meter.segment.timing.trigger.low);
 assert.equal(first.batch.timeline.associationUsed,false);
 const second=await claim(directory,source,{session:'s1',triggerId:'4'});
 const camera=channelOf(second.batch,'camera');
 assert.equal(camera.status,'awaiting-segment');
 assert.equal(camera.segment,null);
 assert.ok(!first.batch.channels.some(channel=>channel.device==='camera'&&channel.binding?.localTrigger===8),
  '相近时间不得自动并入其他触发');
}));

test('同一触发号在多个session中需要指定session，且各自独立归档',()=>environment(async({directory,source})=>{
 source.setPhase('trigger-reuse');
 const archive=await openArchive(directory);const client=createClient(source.origin);
 await assert.rejects(()=>claimBatch({client,archive,triggerId:'5'}),error=>error.statusCode===409);
 const first=await claim(directory,source,{session:'s1',triggerId:'5'});
 const second=await claim(directory,source,{session:'s2',triggerId:'5'});
 assert.equal(first.batch.id,'s1:5');
 assert.equal(second.batch.id,'s2:5');
 assert.deepEqual(first.result.records.map(record=>record.id),['meter:b1:5']);
 assert.deepEqual(second.result.records.map(record=>record.id),['meter:b2:0']);
 assert.notDeepEqual(first.result.records[0].timing.trigger,second.result.records[0].timing.trigger);
}));

test('设备重启后本地触发号归零不覆盖重启前片段',()=>environment(async({directory,source})=>{
 source.setPhase('multi-trigger');
 const before=await claim(directory,source,{session:'s2',triggerId:'0'});
 const after=await claim(directory,source,{session:'s2',triggerId:'1'});
 assert.deepEqual(before.result.records.map(record=>record.id),['camera:c1:0','meter:b1:0']);
 assert.deepEqual(after.result.records.map(record=>record.id),['camera:c1:1','meter:b2:0']);
 assert.equal(channelOf(after.batch,'meter').segment.boot,'b2');
 assert.equal(channelOf(after.batch,'meter').segment.localTrigger,0);
 const archive=await openArchive(directory);
 assert.equal(new Set(archive.records().map(record=>record.id)).size,4);
}));

test('片段分批到达时保留已收部分并允许后续补收',()=>environment(async({directory,source})=>{
 source.setPhase('partial-samples');
 const waiting=await claim(directory,source,{session:'s1',triggerId:'3'});
 const meter=channelOf(waiting.batch,'meter');
 assert.equal(meter.status,'awaiting-samples');
 assert.equal(meter.samples.receivedCount,2);
 assert.equal(meter.samples.declaredCount,5);
 assert.equal(meter.samples.valid,false);
 assert.deepEqual(waiting.result.records,[]);
 assert.ok(meter.issues.some(issue=>issue.code==='samples-incomplete'));
 source.setPhase('partial-samples-arrived');
 const done=await claim(directory,source,{session:'s1',triggerId:'3'});
 assert.equal(done.batch.completeness.state,'complete');
 assert.deepEqual(done.result.records.map(record=>record.id),['meter:b1:3']);
 assert.equal(done.result.records[0].samples.length,5);
}));

test('来源声明漏采时仍按绑定与片段继续补收，并注明声明缺失',()=>environment(async({directory,source})=>{
 source.setPhase('declaration-gap');
 const {batch,result}=await claim(directory,source,{session:'s1',triggerId:'3'});
 const camera=channelOf(batch,'camera');
 assert.equal(camera.declaration.status,'undeclared');
 assert.equal(camera.status,'complete');
 assert.ok(camera.evidence.declaration);
 assert.ok(Array.isArray(camera.declaration.history));
 assert.deepEqual(result.records.map(record=>record.id),['camera:c1:7','meter:b1:3']);
}));

test('绑定缺失时保留其他通道并明确等待，不臆造归属',()=>environment(async({directory,source})=>{
 source.setPhase('missing-bindings');
 const {batch,result}=await claim(directory,source,{session:'s1',triggerId:'3'});
 const meter=channelOf(batch,'meter');
 assert.equal(meter.status,'awaiting-binding');
 assert.equal(meter.binding,null);
 assert.deepEqual(result.records,[]);
 assert.equal(batch.completeness.state,'partial');
 assert.equal(batch.completeness.retryable,true);
}));

test('缺少boot或本地触发号的片段不纳入齐套，但作为待核对线索保留',()=>environment(async({directory,source})=>{
 source.setPhase('unbound-segment');
 const {batch}=await claim(directory,source,{session:'s1',triggerId:'3'});
 const camera=channelOf(batch,'camera');
 assert.equal(camera.status,'awaiting-segment');
 assert.equal(camera.segment,null);
 const hint=camera.issues.find(issue=>issue.code==='segment-unbound');
 assert.ok(hint);
 assert.equal(hint.candidates.length,1);
 assert.equal(batch.completeness.state,'partial');
}));

test('同一切片被两个触发批次绑定时标记冲突，不静默合并',()=>environment(async({directory,source})=>{
 source.setPhase('multi-trigger');
 const archive=await openArchive(directory);
 const client=createClient(source.origin);
 const first=await claimBatch({client,archive,session:'s1',triggerId:'3'});
 await archive.commit(first.records,client.exchanges,[first.batch]);
 const forged=structuredClone(first.batch);
 forged.id='s1:99';forged.triggerId='99';
 forged.channels[1].binding.triggerId='99';
 await archive.commit([],[], [{...forged,revision:undefined}]);
 const second=await claimBatch({client:createClient(source.origin),archive,session:'s1',triggerId:'3'});
 assert.ok(second.batch.channels.some(channel=>channel.issues.some(issue=>issue.code==='segment-claimed-by-other-batch')));
}));

test('缺少时钟校准区间时明确标注不可换算，不猜测时间',()=>environment(async({directory,source})=>{
 source.setPhase('declaration-gap');
 const {batch}=await claim(directory,source,{session:'s1',triggerId:'3'});
 const camera=channelOf(batch,'camera');
 assert.equal(camera.segment.timing,null);
 assert.ok(camera.issues.some(issue=>issue.code==='clock-unavailable'));
 assert.equal(batch.timeline.calibrated,false);
}));

test('批次与原文凭据一并归档，重开后来源证明仍在',()=>environment(async({directory,source})=>{
 const {batch}=await claim(directory,source,{session:'s1',triggerId:'3'});
 assert.ok(batch.evidence.triggers.receiptId);
 assert.ok(batch.evidence.bindings.receiptId);
 assert.ok(batch.evidence.segments.receiptId);
 const reopened=await openArchive(directory);
 const stored=reopened.batch(batchIdFor('s1','3'));
 assert.deepEqual(stored.channels.map(channel=>channel.status),batch.channels.map(channel=>channel.status));
 const receipts=new Set(reopened.exchanges().map(exchange=>exchange.receiptId));
 for(const receipt of [batch.evidence.triggers,batch.evidence.bindings,batch.evidence.segments]){
  assert.ok(receipts.has(receipt.receiptId));
  assert.ok((await reopened.raw(receipt.hash)).length>0);
 }
}));

test('原文字节变化形成不同凭据，不会被当成同一证明',()=>environment(async({directory,source})=>{
 const archive=await openArchive(directory);
 const same={url:'http://local/x',status:200,contentType:'application/json'};
 await archive.commit([],[{...same,bytes:Buffer.from('{"a":1}')}]);
 await archive.commit([],[{...same,bytes:Buffer.from('{"a":2}')}]);
 assert.equal(archive.exchanges().length,2);
}));

test('来源凭据刷新不产生重复资料版本，内容变化才形成新版本',()=>environment(async({directory,source})=>{
 const {batch}=await claim(directory,source,{session:'s1',triggerId:'3'});
 assert.equal((await openArchive(directory)).records().length,1);
 source.setPhase('camera-arrived');
 await claim(directory,source,{session:'s1',triggerId:'3'});
 source.setPhase('missing-bindings');
 await claim(directory,source,{session:'s1',triggerId:'3'});
 const archive=await openArchive(directory);
 const records=archive.records();
 assert.equal(records.filter(record=>record.id==='meter:b1:3').length,1);
 assert.equal(records.filter(record=>record.id==='camera:c1:7').length,1);
 assert.ok(batch.evidence.triggers.receiptId);
}));

test('重启服务后沿用同一归档继续补收同一批次',()=>environment(async({directory,source})=>{
 const first=await startIntake({origin:source.origin,directory});
 let batch;
 try{
  const response=await fetch(first.origin+'/batches/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session:'s1',triggerId:'3'})});
  batch=await response.json();
 }finally{await first.close();}
 assert.equal(batch.batch.completeness.state,'partial');
 source.setPhase('camera-arrived');
 const second=await startIntake({origin:source.origin,directory});
 try{
  const response=await fetch(second.origin+'/batches/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session:'s1',triggerId:'3'})});
  const next=await response.json();
  assert.equal(next.batch.completeness.state,'complete');
  assert.equal(next.batch.firstClaimedAt,batch.batch.firstClaimedAt);
  assert.deepEqual(next.batch.history.map(entry=>entry.state),['partial','complete']);
 }finally{await second.close();}
}));

test('HTTP领取与查询形成闭环，相同领取可重复执行',()=>environment(async({directory,source})=>{
 const intake=await startIntake({origin:source.origin,directory});
 try{
  const post=body=>fetch(intake.origin+'/batches/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  let response=await post({session:'s1',triggerId:'3'});
  assert.equal(response.status,200);
  const first=await response.json();
  assert.equal(first.batch.id,'s1:3');
  assert.equal(first.batch.completeness.state,'partial');
  response=await post({session:'s1',triggerId:'3'});
  assert.equal(response.status,200);
  const again=await response.json();
  assert.equal(again.batch.completeness.state,'partial');
  assert.equal((await(await fetch(intake.origin+'/batches')).json()).length,1);
  assert.equal((await(await fetch(intake.origin+'/batches/'+encodeURIComponent('s1:3'))).json()).id,'s1:3');
  assert.equal((await fetch(intake.origin+'/batches/不存在')).status,404);
  assert.equal((await post({session:'不存在',triggerId:'9'})).status,404);
  assert.equal((await fetch(intake.origin+'/batches/claim',{method:'POST',body:'{'})).status,400);
  assert.ok((await(await fetch(intake.origin+'/records')).json()).length);
  assert.ok((await(await fetch(intake.origin+'/receipts')).json()).length);
 }finally{await intake.close();}
}));
