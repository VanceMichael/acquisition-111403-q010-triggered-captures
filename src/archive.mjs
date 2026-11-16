import {randomUUID} from 'node:crypto';
import {mkdir, readFile, rename, open} from 'node:fs/promises';
import {join} from 'node:path';
import {digest, itemDigest} from './digest.mjs';

export {digest};

async function replace(path, bytes) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, path);
}

const receiptIdFor = exchange => {
  const hash = exchange.hash || digest(exchange.bytes);
  return digest(Buffer.from(exchange.url + ':' + exchange.status + ':' + hash));
};

function checkIndex(index) {
  if (index.version !== 1 || !Array.isArray(index.records) || !Array.isArray(index.exchanges)) throw new Error('归档索引结构无效');
  if (index.batches === undefined) index.batches = [];
  if (!Array.isArray(index.batches)) throw new Error('归档批次结构无效');
  for (const batch of index.batches) {
    if (!batch || typeof batch !== 'object' || typeof batch.id !== 'string' || !batch.id) throw new Error('归档批次缺少标识');
    if (!Array.isArray(batch.channels)) throw new Error('归档批次通道结构无效');
  }
  return index;
}

export async function openArchive(directory) {
  await mkdir(join(directory, 'objects'), {recursive:true});
  const indexPath = join(directory, 'index.json');
  let index = {version:1, records:[], exchanges:[], batches:[]};
  try { index = JSON.parse(await readFile(indexPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  checkIndex(index);
  for (const exchange of index.exchanges) {
    if (!/^[a-f0-9]{64}$/.test(exchange.hash)) throw new Error('归档摘要无效');
    const bytes = await readFile(join(directory, 'objects', exchange.hash));
    if (digest(bytes) !== exchange.hash) throw new Error('归档原文校验失败');
  }
  let queue = Promise.resolve();
  return {
    records:() => structuredClone(index.records),
    exchanges:() => structuredClone(index.exchanges),
    batches:() => structuredClone(index.batches),
    batch: id => {
      const found = index.batches.find(batch => batch.id === id);
      return found === undefined ? undefined : structuredClone(found);
    },
    raw: async hash => {
      if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('原文摘要无效');
      const bytes = await readFile(join(directory, 'objects', hash));
      if (digest(bytes) !== hash) throw new Error('原文校验失败');
      return bytes;
    },
    commit(records, exchanges, batches = []) {
      const operation = queue.then(async () => {
        const next = structuredClone(index);
        for (const exchange of exchanges) {
          const hash = digest(exchange.bytes);
          await replace(join(directory, 'objects', hash), exchange.bytes);
          const receiptId = receiptIdFor({...exchange, hash});
          if (!next.exchanges.some(existing => existing.receiptId === receiptId)) {
            next.exchanges.push({receiptId,url:exchange.url,status:exchange.status,contentType:exchange.contentType,hash});
          }
        }
        for (const record of records) {
          if (typeof record.id !== 'string' || !record.id) throw new Error('资料必须有非空标识');
          const revision = record.revision ?? itemDigest(record);
          if (!next.records.some(existing => existing.id === record.id && existing.revision === revision)) {
            next.records.push({...record,revision});
          }
        }
        for (const batch of batches) {
          if (typeof batch.id !== 'string' || !batch.id) throw new Error('批次必须有非空标识');
          if (!Array.isArray(batch.channels)) throw new Error('批次通道结构无效');
          const revision = itemDigest(batch);
          const position = next.batches.findIndex(existing => existing.id === batch.id);
          const stored = {...structuredClone(batch), revision};
          if (position === -1) next.batches.push(stored);
          else next.batches[position] = stored;
        }
        await replace(indexPath, Buffer.from(JSON.stringify(next, null, 2)));
        index = next;
        return {records:next.records.length,exchanges:next.exchanges.length,batches:next.batches.length};
      });
      queue = operation.catch(() => {});
      return operation;
    }
  };
}
