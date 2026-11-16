import {createServer} from 'node:http';
import {openArchive} from './archive.mjs';
import {createClient} from './source.mjs';
import {collect} from './reader.mjs';
import {claimBatch, batchIdFor} from './batch.mjs';

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      const error = new Error('请求体超出上限');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch {
    const error = new Error('请求体不是合法JSON');
    error.statusCode = 400;
    throw error;
  }
}

const identifier = value => value === undefined || value === null ? undefined : String(value);

export async function startIntake({origin,directory,port=0,clock=() => new Date().toISOString()}) {
  const archive=await openArchive(directory);
  let claimQueue=Promise.resolve();
  const server=createServer(async (request,response)=>{
    const send=(value,status=200)=>{response.writeHead(status,{'content-type':'application/json; charset=utf-8'});response.end(JSON.stringify(value));};
    try {
      const url=new URL(request.url,'http://localhost');
      const path=url.pathname;
      if(request.method==='GET'&&path==='/health'){send({status:'运行中'});return;}
      if(request.method==='GET'&&path==='/records'){send(archive.records());return;}
      if(request.method==='GET'&&path==='/receipts'){send(archive.exchanges());return;}
      if(request.method==='GET'&&path==='/batches'){send(archive.batches());return;}
      if(request.method==='GET'&&path.startsWith('/batches/')) {
        const id=decodeURIComponent(path.slice('/batches/'.length));
        const batch=archive.batch(id);
        if(!batch){send({message:'触发批次不存在'},404);return;}
        send(batch);return;
      }
      if(request.method==='POST'&&path==='/collect'){
        const client=createClient(origin);const records=await collect(client);
        send(await archive.commit(records,client.exchanges));return;
      }
      if(request.method==='POST'&&path==='/batches/claim'){
        const body=await readJson(request);
        const operation=claimQueue.then(async()=>{
          const client=createClient(origin);
          const result=await claimBatch({
            client,archive,
            session:identifier(body?.session),
            triggerId:identifier(body?.triggerId),
            now:clock()
          });
          const committed=await archive.commit(result.records,client.exchanges,[result.batch]);
          return {batch:archive.batch(result.batch.id),records:result.records,receipts:committed};
        });
        claimQueue=operation.catch(()=>{});
        send(await operation);return;
      }
      send({message:'接口不存在'},404);
    } catch(error){send({message:error.message},error.statusCode??502);}
  });
  await new Promise(resolve=>server.listen(port,'0.0.0.0',resolve));
  return {origin:`http://127.0.0.1:${server.address().port}`,archive,close:()=>new Promise(resolve=>server.close(resolve))};
}
