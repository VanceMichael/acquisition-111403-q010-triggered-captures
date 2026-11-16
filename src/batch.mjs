import {digest, canonical, itemDigest} from './digest.mjs';

const DECLARATIONS = new Set(['delivered', 'missed', 'pending']);
const AWAITING = new Set(['awaiting-binding', 'awaiting-segment', 'awaiting-samples']);
const BLOCKING = new Set(['conflict', 'invalid-binding', 'invalid-segment', 'invalid-samples']);

export const SEGMENT_STATUS = Object.freeze({
  complete:{terminal:true,captured:true,retryable:false,detail:'片段与声明计数已收齐'},
  missed:{terminal:true,captured:false,retryable:false,detail:'来源显式声明该设备本次未触发'},
  'awaiting-binding':{terminal:false,captured:false,retryable:true,detail:'等待来源给出触发与设备片段的绑定'},
  'awaiting-segment':{terminal:false,captured:false,retryable:true,detail:'等待该设备片段到达'},
  'awaiting-samples':{terminal:false,captured:false,retryable:true,detail:'片段已登记，样本尚未收齐或暂不可取'},
  conflict:{terminal:false,captured:false,retryable:false,detail:'来源存在互相矛盾的绑定或片段记录'},
  'invalid-binding':{terminal:false,captured:false,retryable:false,detail:'绑定字段不完整，无法证明片段归属'},
  'invalid-segment':{terminal:false,captured:false,retryable:false,detail:'片段字段无效或同一片段存在冲突定义'},
  'invalid-samples':{terminal:false,captured:false,retryable:false,detail:'样本长度与片段声明不符'},
  'unknown-expectation':{terminal:false,captured:false,retryable:false,detail:'来源声明状态无法识别'}
});

const identity = value => value === undefined || value === null ? '' : String(value);
const present = value => value !== undefined && value !== null && identity(value) !== '';
const round = value => Number.isFinite(value) ? Number(value.toFixed(9)) : value;
const fail = (message, statusCode = 502) => { const error = new Error(message); error.statusCode = statusCode; return error; };

export const batchIdFor = (session, triggerId) =>
  encodeURIComponent(identity(session)) + ':' + encodeURIComponent(identity(triggerId));
const bindingKey = binding => JSON.stringify([identity(binding.device), identity(binding.boot), identity(binding.localTrigger)]);
const segmentKey = segment => JSON.stringify([identity(segment.device), identity(segment.boot), identity(segment.localTrigger)]);
const receiptOf = (url, status, hash) => digest(Buffer.from(url + ':' + status + ':' + hash));

function receiptFor(client, path) {
  const target = new URL(path, client.origin).href;
  for (let index = client.exchanges.length - 1; index >= 0; index -= 1) {
    const exchange = client.exchanges[index];
    if (exchange.url !== target) continue;
    const hash = digest(exchange.bytes);
    return {url:exchange.url,status:exchange.status,hash,receiptId:receiptOf(exchange.url,exchange.status,hash)};
  }
  return null;
}

function itemsOf(document, label) {
  if (document === null || document === undefined) return [];
  if (typeof document !== 'object' || !Array.isArray(document.items)) throw fail('来源' + label + '结构无效');
  return document.items;
}

async function optionalDocument(client, path) {
  try {
    const document = await client(path);
    return {document,receipt:receiptFor(client,path),available:true};
  } catch (error) {
    const receipt = receiptFor(client,path);
    if (error.status === 404) return {document:null,receipt,available:false};
    throw error;
  }
}

function historyWith(history, entry, limit = 20) {
  const previous = Array.isArray(history) ? history : [];
  const stamp = canonical({status:entry.status,receiptId:entry.receiptId ?? null,stale:entry.stale === true});
  if (previous.some(item => canonical({status:item.status,receiptId:item.receiptId ?? null,stale:item.stale === true}) === stamp)) return structuredClone(previous);
  return [...structuredClone(previous),structuredClone(entry)].slice(-limit);
}

function validateSegment(raw) {
  const issues = [];
  const count = raw.count;
  const sampleRate = raw.sampleRate;
  const preSamples = raw.preSamples;
  const startTick = raw.startTick;
  if (!present(raw.device)) issues.push({code:'missing-device',message:'片段缺少设备标识'});
  if (!present(raw.boot)) issues.push({code:'missing-boot',message:'片段缺少启动标识，无法区分计数器回绕'});
  if (!present(raw.localTrigger)) issues.push({code:'missing-local-trigger',message:'片段缺少设备本地触发号'});
  if (!Number.isInteger(count) || count < 0) issues.push({code:'invalid-count',message:'片段样本计数不是非负整数'});
  if (typeof sampleRate !== 'number' || !Number.isFinite(sampleRate) || sampleRate <= 0) issues.push({code:'invalid-sample-rate',message:'片段采样率无效'});
  if (!Number.isInteger(preSamples) || preSamples < 0) issues.push({code:'invalid-pre-samples',message:'预采样数不是非负整数'});
  else if (Number.isInteger(count) && preSamples > count) issues.push({code:'pre-samples-exceed-count',message:'预采样数超过片段总样本数'});
  if (typeof startTick !== 'number' || !Number.isFinite(startTick)) issues.push({code:'invalid-start-tick',message:'片段起始刻度无效'});
  if (typeof raw.url !== 'string' || !raw.url.trim()) issues.push({code:'missing-url',message:'片段缺少样本地址'});
  return {
    segment:{
      device:identity(raw.device),boot:identity(raw.boot),localTrigger:raw.localTrigger,
      preSamples,sampleRate,startTick,count,url:typeof raw.url === 'string' ? raw.url : null
    },
    issues
  };
}

function validateClock(raw) {
  if (!raw || !present(raw.device) || !present(raw.boot)) return null;
  const offset = raw.offset;
  if (!Array.isArray(offset) || offset.length !== 2) return null;
  if (!offset.every(value => typeof value === 'number' && Number.isFinite(value))) return null;
  if (typeof raw.scale !== 'number' || !Number.isFinite(raw.scale)) return null;
  if (typeof raw.fromTick !== 'number' || !Number.isFinite(raw.fromTick)) return null;
  if (typeof raw.toTick !== 'number' || !Number.isFinite(raw.toTick) || raw.toTick < raw.fromTick) return null;
  return {
    device:identity(raw.device),boot:identity(raw.boot),
    fromTick:raw.fromTick,toTick:raw.toTick,
    offset:[Math.min(...offset),Math.max(...offset)],scale:raw.scale
  };
}

function timingFor(segment, clocks) {
  if (!segment || !Array.isArray(clocks) || clocks.length === 0) return {timing:null,issue:segment?{code:'clock-unavailable',message:'该设备启动没有时钟校准区间，控制器时间不可换算'}:null};
  const startTick = segment.startTick;
  const spanTicks = segment.count / segment.sampleRate;
  const endTick = startTick + spanTicks;
  const triggerTick = startTick + segment.preSamples / segment.sampleRate;
  const covering = clocks.find(clock => startTick >= clock.fromTick && endTick <= clock.toTick);
  const clock = covering || clocks.reduce((best,item) => {
    const distance = Math.min(Math.abs(startTick - item.fromTick),Math.abs(startTick - item.toTick));
    return best === null || distance < best.distance ? {item,distance} : best;
  },null).item;
  const map = tick => {
    const low = clock.offset[0] + clock.scale * tick;
    const high = clock.offset[1] + clock.scale * tick;
    return {low:round(Math.min(low, high)),high:round(Math.max(low, high))};
  };
  return {
    timing:{
      startTick:segment.startTick,endTick:round(endTick),triggerTick:round(triggerTick),
      start:map(startTick),end:map(endTick),trigger:map(triggerTick),
      uncertaintySeconds:round(clock.offset[1] - clock.offset[0]),
      extrapolated:!covering,
      clock:{fromTick:clock.fromTick,toTick:clock.toTick,offset:[...clock.offset],scale:clock.scale}
    },
    issue:covering?null:{code:'clock-extrapolated',message:'片段刻度超出已校准区间，时间范围按最近区间外推'}
  };
}

async function readSamples(client, segment) {
  let target;
  try { target = new URL(segment.url, client.origin); }
  catch { return {state:'invalid',issue:{code:'invalid-sample-url',message:'样本地址无法解析'}}; }
  if (target.origin !== new URL(client.origin).origin) {
    return {state:'invalid',issue:{code:'sample-url-outside-origin',message:'样本地址超出来源范围，拒绝收取'}};
  }
  let payload;
  try { payload = await client(target.href); }
  catch (error) {
    return {state:'unavailable',issue:{code:'samples-unavailable',message:'样本暂不可取：' + error.message,status:error.status ?? null},receipt:receiptFor(client,target.href)};
  }
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { /* 保持原文，下面按结构无效处理 */ }
  }
  const receipt = receiptFor(client,target.href);
  if (!Array.isArray(payload)) return {state:'invalid',issue:{code:'samples-not-array',message:'样本不是数组'},receipt};
  const samples = {
    url:target.href,declaredCount:segment.count,receivedCount:payload.length,
    digest:itemDigest(payload),evidence:receipt,retained:false
  };
  if (payload.length === segment.count) return {state:'complete',payload,samples,receipt};
  if (payload.length < segment.count) return {state:'partial',payload,samples,receipt,issue:{code:'samples-incomplete',message:'样本分批到达，已收' + payload.length + '/' + segment.count}};
  return {state:'invalid',payload,samples,receipt,issue:{code:'samples-exceed-count',message:'样本数' + payload.length + '超过片段声明' + segment.count}};
}

function declarationOf(device, expected, storedChannel, sourceTriggerPresent, triggersReceipt, observedAt) {
  let status;
  let declared = false;
  let stale = false;
  let raw = null;
  if (Object.hasOwn(expected, device)) {
    status = expected[device];
    declared = true;
    raw = status;
    if (typeof status !== 'string' || !DECLARATIONS.has(status)) status = 'unknown';
  } else if (storedChannel?.declaration?.status && storedChannel.declaration.status !== 'undeclared') {
    status = storedChannel.declaration.status;
    stale = true;
  } else {
    status = 'undeclared';
  }
  const entry = {
    status,declared,stale,raw,
    sourceTriggerPresent,
    evidence:triggersReceipt,
    history:historyWith(storedChannel?.declaration?.history,{
      status,declared,stale,raw,
      sourceTriggerPresent,
      receiptId:triggersReceipt?.receiptId ?? null,
      observedAt
    })
  };
  return entry;
}

function completenessOf(channels) {
  const count = status => channels.filter(channel => channel.status === status).length;
  const captured = count('complete');
  const missed = count('missed');
  const awaiting = channels.filter(channel => AWAITING.has(channel.status));
  const blocking = channels.filter(channel => BLOCKING.has(channel.status));
  const declared = {delivered:0,missed:0,pending:0,undeclared:0,unknown:0};
  for (const channel of channels) {
    const status = channel.declaration?.status;
    if (status === 'delivered' || status === 'missed' || status === 'pending') declared[status] += 1;
    else if (status === 'unknown') declared.unknown += 1;
    else declared.undeclared += 1;
  }
  let state;
  if (channels.length === 0) state = 'empty';
  else if (channels.every(channel => SEGMENT_STATUS[channel.status]?.terminal)) state = 'complete';
  else if (blocking.length) state = 'blocked';
  else state = 'partial';
  const unresolved = channels.length - captured - missed;
  const reason = state === 'empty'
    ? '来源未声明该触发批次的任何设备通道'
    : state === 'complete'
      ? '全部通道已落实：' + captured + '个片段通过声明计数校验，' + missed + '个由来源显式声明漏采'
      : state === 'blocked'
        ? '有' + blocking.length + '个通道需要来源修正或人工核对，已收到的通道仍保留'
        : '仍有' + unresolved + '个通道等待来源补发，可再次领取同一触发批次';
  return {
    state,reason,
    declared,captured,missed,unresolved,
    awaiting:awaiting.length,blocking:blocking.length,
    retryable:awaiting.length > 0,
    channels:channels.map(channel => ({
      device:channel.device,status:channel.status,
      captured:channel.captured,retryable:channel.retryable,
      detail:channel.detail
    })),
    criteria:{
      association:'session+triggerId 经来源 bindings 绑定到 device+boot+localTrigger',
      completeness:'逐通道按来源声明与片段 count 判断，不使用通道长度相等',
      equalChannelLengthsUsed:false,
      timeProximityUsed:false,
      uncertainTimeVisible:true
    }
  };
}

function timelineOf(channels) {
  const entries = [];
  const uncalibrated = [];
  for (const channel of channels) {
    if (!channel.segment) continue;
    const timing = channel.segment.timing;
    if (!timing) {
      uncalibrated.push(channel.device);
      continue;
    }
    entries.push({
      device:channel.device,boot:channel.segment.boot,
      localTrigger:channel.segment.localTrigger,
      triggerWindow:{low:timing.trigger.low,high:timing.trigger.high},
      uncertaintySeconds:timing.uncertaintySeconds,
      extrapolated:timing.extrapolated
    });
  }
  return {
    entries,
    uncalibrated,
    calibrated:uncalibrated.length === 0 && entries.every(entry => !entry.extrapolated),
    associationUsed:false,
    note:'各设备窗口带有校准不确定范围；窗口是否重叠不改变触发归属，归属只来自来源bindings'
  };
}

function historyOfBatch(storedHistory, snapshot) {
  const previous = Array.isArray(storedHistory) ? storedHistory : [];
  const stamp = canonical({state:snapshot.state,captured:snapshot.captured,missed:snapshot.missed,unresolved:snapshot.unresolved});
  if (previous.some(entry => canonical({state:entry.state,captured:entry.captured,missed:entry.missed,unresolved:entry.unresolved}) === stamp)) return structuredClone(previous);
  return [...structuredClone(previous),snapshot].slice(-50);
}

export async function claimBatch({client, archive, session, triggerId, now = new Date().toISOString()}) {
  if (typeof client !== 'function') throw fail('缺少来源客户端',500);
  if (!archive || typeof archive.batch !== 'function') throw fail('缺少归档',500);
  const wanted = {session:session === undefined ? undefined : identity(session),triggerId:triggerId === undefined ? undefined : identity(triggerId)};

  const triggersDocument = await client('/triggers');
  const triggersReceipt = receiptFor(client,'/triggers');
  const triggerItems = itemsOf(triggersDocument,'触发清单');
  const bindingsSource = await optionalDocument(client,'/bindings');
  const segmentsSource = await optionalDocument(client,'/segments');
  const clocksSource = await optionalDocument(client,'/clocks');
  const bindingsReceipt = bindingsSource.receipt;
  const segmentsReceipt = segmentsSource.receipt;
  const clocksReceipt = clocksSource.receipt;

  const matches = triggerItems.filter(item => item && present(item.session) && present(item.triggerId)
    && (wanted.session === undefined || identity(item.session) === wanted.session)
    && (wanted.triggerId === undefined || identity(item.triggerId) === wanted.triggerId));
  const unfinishedArchived = () => archive.batches()
    .filter(batch => !batchFinished(batch))
    .filter(batch => (wanted.session === undefined || identity(batch.session) === wanted.session)
      && (wanted.triggerId === undefined || identity(batch.triggerId) === wanted.triggerId))
    .sort((left,right) => left.id.localeCompare(right.id));

  let item = null;
  let target = null;
  if (wanted.session !== undefined && wanted.triggerId !== undefined) {
    item = matches.find(entry => identity(entry.session) === wanted.session && identity(entry.triggerId) === wanted.triggerId) ?? null;
    const stored = archive.batch(batchIdFor(wanted.session,wanted.triggerId));
    if (!item && !stored) throw fail('来源未声明该触发批次且本地无记录',404);
  } else if (wanted.triggerId !== undefined) {
    if (matches.length > 1) throw fail('触发号在多个session中出现，领取时需要指定session',409);
    item = matches[0] ?? null;
    if (!item) {
      const pending = unfinishedArchived();
      if (pending.length === 0) throw fail('来源未声明该触发号且无法确定session',404);
      if (new Set(pending.map(batch => batch.session)).size > 1) throw fail('触发号在多个已归档session中出现，领取时需要指定session',409);
      target = pending[0];
    }
  } else if (wanted.session !== undefined) {
    item = matches.find(entry => {
      const stored = archive.batch(batchIdFor(entry.session,entry.triggerId));
      return stored === undefined || !batchFinished(stored);
    }) ?? null;
    if (!item) {
      target = unfinishedArchived()[0] ?? null;
      if (!target) throw fail(matches.length === 0 ? '来源未声明该session的任何触发批次' : '该session内没有可领取的触发批次',matches.length === 0 ? 404 : 409);
    }
  } else {
    const ordered = [...matches].sort((left,right) => {
      const sessionOrder = identity(left.session).localeCompare(identity(right.session));
      return sessionOrder !== 0 ? sessionOrder : identity(left.triggerId).localeCompare(identity(right.triggerId));
    });
    item = ordered.find(entry => {
      const stored = archive.batch(batchIdFor(entry.session,entry.triggerId));
      return stored === undefined || !batchFinished(stored);
    }) ?? null;
    if (!item) {
      target = unfinishedArchived()[0] ?? null;
      if (!target) throw fail(matches.length === 0 ? '来源没有触发批次' : '没有可领取的触发批次',matches.length === 0 ? 404 : 409);
    }
  }

  const batchSession = identity(item?.session ?? target?.session ?? wanted.session);
  const batchTrigger = identity(item?.triggerId ?? target?.triggerId ?? wanted.triggerId);
  const id = batchIdFor(batchSession,batchTrigger);
  const stored = archive.batch(id);
  const sourceTriggerPresent = Boolean(item);

  const expected = {};
  const declarationNotes = [];
  if (item && item.expected && typeof item.expected === 'object' && !Array.isArray(item.expected)) {
    for (const [device,status] of Object.entries(item.expected)) {
      if (!present(device)) continue;
      expected[identity(device)] = status;
      if (typeof status !== 'string' || !DECLARATIONS.has(status)) declarationNotes.push({code:'unknown-declaration',device:identity(device),value:status ?? null});
    }
  } else if (item) {
    declarationNotes.push({code:'invalid-declaration',message:'触发条目的expected不是对象'});
  }
  const identityConflicts = [];
  if (item) {
    const duplicate = triggerItems.filter(entry => entry && identity(entry.session) === batchSession && identity(entry.triggerId) === batchTrigger);
    const distinctDeclarations = new Map(duplicate.map(entry => [canonical(entry.expected ?? null),entry.expected ?? null]));
    if (distinctDeclarations.size > 1) identityConflicts.push({code:'declaration-conflict',message:'来源对同一触发给出多个不同的设备声明'});
  }

  const bindings = itemsOf(bindingsSource.document,'绑定清单').filter(entry => entry
    && identity(entry.session) === batchSession && identity(entry.triggerId) === batchTrigger);
  const bindingGroups = new Map();
  for (const entry of bindings) {
    if (!present(entry.device)) continue;
    const device = identity(entry.device);
    if (!Array.isArray(bindingGroups.get(device))) bindingGroups.set(device,[]);
    bindingGroups.get(device).push(entry);
  }

  const segmentGroups = new Map();
  const unplacedSegments = [];
  for (const raw of itemsOf(segmentsSource.document,'片段清单')) {
    if (!raw || typeof raw !== 'object') continue;
    if (!present(raw.device) || !present(raw.boot) || !present(raw.localTrigger)) {
      if (present(raw.device)) unplacedSegments.push(validateSegment(raw));
      continue;
    }
    const key = segmentKey(raw);
    if (!Array.isArray(segmentGroups.get(key))) segmentGroups.set(key,[]);
    segmentGroups.get(key).push(validateSegment(raw));
  }

  const clockGroups = new Map();
  for (const raw of itemsOf(clocksSource.document,'时钟清单')) {
    const clock = validateClock(raw);
    if (!clock) continue;
    const key = JSON.stringify([clock.device,clock.boot]);
    if (!Array.isArray(clockGroups.get(key))) clockGroups.set(key,[]);
    clockGroups.get(key).push(clock);
  }

  const otherClaims = new Map();
  for (const other of archive.batches()) {
    if (other.id === id) continue;
    for (const channel of other.channels ?? []) {
      if (!channel.binding) continue;
      const key = bindingKey(channel.binding);
      if (!Array.isArray(otherClaims.get(key))) otherClaims.set(key,[]);
      otherClaims.get(key).push({batchId:other.id,status:channel.status});
    }
  }

  const devices = new Set([...Object.keys(expected),...bindingGroups.keys()]);
  for (const channel of stored?.channels ?? []) devices.add(identity(channel.device));
  if (item) for (const note of declarationNotes) if (note.device) devices.add(note.device);

  const records = [];
  const channels = [];
  const samplesEvidence = {};

  for (const device of [...devices].sort()) {
    const storedChannel = (stored?.channels ?? []).find(channel => identity(channel.device) === device) ?? null;
    const declaration = declarationOf(device,expected,storedChannel,sourceTriggerPresent,triggersReceipt,now);
    const issues = [];
    let status = null;
    let binding = null;
    let segment = null;
    let sampleResult = null;
    let segmentEvidence = segmentsReceipt;
    let bindingEvidence = bindingsReceipt;
    const candidates = bindingGroups.get(device) ?? [];
    const distinct = new Map(candidates.map(candidate => [canonical(candidate),candidate]));
    let bindingConflict = false;

    if (distinct.size > 1) {
      bindingConflict = true;
      issues.push({code:'binding-conflict',message:'同一触发对同一设备存在多个不同绑定'});
    } else if (distinct.size === 1) {
      const candidate = [...distinct.values()][0];
      if (!present(candidate.boot) || !present(candidate.localTrigger)) {
        issues.push({code:'invalid-binding',message:'绑定缺少boot或localTrigger，无法定位片段'});
      } else {
        binding = {
          device,boot:identity(candidate.boot),localTrigger:candidate.localTrigger,
          session:identity(candidate.session),triggerId:candidate.triggerId,
          stale:false,evidence:bindingsReceipt
        };
      }
    } else if (storedChannel?.binding) {
      binding = {...structuredClone(storedChannel.binding),stale:true,evidence:storedChannel.binding.evidence ?? null};
      bindingEvidence = binding.evidence;
      issues.push({code:'binding-stale',message:'来源本次未返回绑定，沿用已归档的来源证明'});
    }

    if (binding && !bindingConflict) {
      const key = bindingKey(binding);
      const group = segmentGroups.get(key) ?? [];
      const valid = new Map();
      let invalidCount = 0;
      for (const entry of group) {
        if (entry.issues.length) { invalidCount += 1; continue; }
        valid.set(canonical(entry.segment),entry.segment);
      }
      if (valid.size > 1) {
        issues.push({code:'segment-conflict',message:'同一device+boot+localTrigger存在多个不同片段定义'});
        status = 'invalid-segment';
      } else if (valid.size === 1) {
        segment = {...[...valid.values()][0],stale:false};
      } else if (invalidCount > 0) {
        issues.push({code:'invalid-segment',message:'绑定的片段字段不完整或无效'});
        status = 'invalid-segment';
      } else if (storedChannel?.segment && bindingKey(storedChannel.segment) === key) {
        segment = {...structuredClone(storedChannel.segment),stale:true};
        segmentEvidence = storedChannel.evidence?.segments ?? null;
        issues.push({code:'segment-stale',message:'来源本次未列出该片段，沿用已归档的片段记录'});
      }
    }

    if (!bindingConflict && unplacedSegments.length > 0) {
      const unbound = unplacedSegments.filter(entry => entry.segment.device === device);
      if (unbound.length > 0) {
        issues.push({
          code:'segment-unbound',
          message:'存在缺少boot或localTrigger的片段，无法证明属于本触发批次，未纳入齐套判断',
          candidates:unbound.map(entry => ({...entry.segment,issues:entry.issues}))
        });
      }
    }

    if (segment && !status) {
      const clocks = clockGroups.get(JSON.stringify([segment.device,segment.boot])) ?? [];
      const clockResult = timingFor(segment,clocks);
      if (clockResult.issue) issues.push(clockResult.issue);
      segment.timing = clockResult.timing;
      if (segment.stale && storedChannel?.segment?.timing && !clockResult.timing) {
        segment.timing = structuredClone(storedChannel.segment.timing);
      }
    }

    if (segment && !status) {
      if (segment.stale) {
        sampleResult = storedChannel?.samples?.valid
          ? {state:'complete',samples:structuredClone(storedChannel.samples),retained:true,receipt:storedChannel.samples.evidence ?? null}
          : {state:'unavailable',issue:{code:'samples-stale-unavailable',message:'片段沿用归档记录，但归档中没有通过的样本'}};
      } else {
        sampleResult = await readSamples(client,segment);
        if (sampleResult.state !== 'complete' && storedChannel?.samples?.valid
          && storedChannel.segment && segmentKey(storedChannel.segment) === segmentKey(segment)) {
          issues.push({
            code:'samples-retained',
            message:'本次样本刷新未通过，保留已归档且校验通过的样本：' + (sampleResult.issue?.message ?? '原因未知')
          });
          sampleResult = {state:'complete',samples:{...structuredClone(storedChannel.samples),retained:true},retained:true,receipt:storedChannel.samples.evidence ?? null};
        }
      }
      if (sampleResult.samples) {
        sampleResult.samples.valid = sampleResult.state === 'complete';
        samplesEvidence[device] = sampleResult.samples.evidence;
      }
      if (sampleResult.issue) issues.push(sampleResult.issue);
    }

    const crossClaims = binding && !bindingConflict ? (otherClaims.get(bindingKey(binding)) ?? []) : [];

    if (identityConflicts.length > 0) {
      status = 'conflict';
      issues.push(...structuredClone(identityConflicts));
    }

    if (status === null) {
      if (declaration.status === 'missed' && !segment) {
        status = 'missed';
      } else if (bindingConflict) {
        status = 'conflict';
      } else if (!binding) {
        status = (bindingGroups.get(device)?.length ?? 0) > 0 ? 'invalid-binding' : 'awaiting-binding';
      } else if (!segment) {
        status = declaration.status === 'missed' ? 'missed' : 'awaiting-segment';
      } else if (crossClaims.length > 0) {
        status = 'conflict';
        issues.push({code:'segment-claimed-by-other-batch',message:'同一切片也被其他触发批次绑定',otherBatches:crossClaims.map(claim => claim.batchId)});
      } else if (!sampleResult) {
        status = 'awaiting-samples';
      } else if (sampleResult.state === 'complete') {
        status = 'complete';
      } else if (sampleResult.state === 'partial' || sampleResult.state === 'unavailable') {
        status = 'awaiting-samples';
      } else {
        status = 'invalid-samples';
      }
    }

    if (declaration.status === 'unknown') issues.push({code:'unknown-declaration',message:'来源声明状态无法识别，已收到资料仍按片段自身计数校验'});
    if (declaration.stale && !sourceTriggerPresent) issues.push({code:'source-trigger-absent',message:'来源当前未列出该触发，沿用已归档的声明'});
    else if (declaration.stale) issues.push({code:'declaration-stale',message:'来源本次未再声明该设备，沿用已归档的声明'});
    if (status === 'complete' && declaration.status === 'missed') issues.push({code:'declared-missed-but-captured',message:'来源声明漏采，但实际已提供完整片段，按实收保留'});
    if (status === 'complete' && declaration.status === 'unknown') issues.push({code:'declaration-unknown-but-captured',message:'来源声明不可识别，但片段与样本自身校验通过'});

    const meta = SEGMENT_STATUS[status] ?? {terminal:false,captured:false,retryable:false,detail:'状态未知'};
    const channelEvidence = {
      declaration:triggersReceipt,
      binding:binding?.evidence ?? bindingEvidence,
      segments:segmentEvidence,
      clocks:clocksReceipt,
      sample:sampleResult?.samples?.evidence ?? sampleResult?.receipt ?? null
    };

    const channel = {
      device,
      declaration,
      binding,
      segment:segment ? {
        device:segment.device,boot:segment.boot,localTrigger:segment.localTrigger,
        preSamples:segment.preSamples,sampleRate:segment.sampleRate,startTick:segment.startTick,
        count:segment.count,url:segment.url,stale:segment.stale === true,
        timing:segment.timing ?? null
      } : null,
      samples:sampleResult?.samples ?? null,
      status,
      captured:meta.captured,
      terminal:meta.terminal,
      retryable:meta.retryable,
      detail:meta.detail,
      recordId:null,
      issues,
      evidence:channelEvidence
    };

    if (segment && sampleResult?.state === 'complete' && !sampleResult.retained && !segment.stale && !bindingConflict && status === 'complete') {
      const record = {
        id:device + ':' + segment.boot + ':' + segment.localTrigger,
        kind:'segment',
        device:segment.device,boot:segment.boot,localTrigger:segment.localTrigger,
        session:batchSession,triggerId:batchTrigger,batchId:id,
        count:segment.count,sampleRate:segment.sampleRate,
        preSamples:segment.preSamples,startTick:segment.startTick,
        samples:sampleResult.payload,
        sampleUrl:sampleResult.samples.url,
        sampleDigest:sampleResult.samples.digest,
        binding:{device,boot:segment.boot,localTrigger:segment.localTrigger,evidence:binding?.evidence ?? null},
        declaration:declaration.status,
        timing:segment.timing ?? null,
        evidence:channelEvidence
      };
      record.revision = itemDigest({
        id:record.id,batchId:record.batchId,device:record.device,boot:record.boot,
        localTrigger:record.localTrigger,count:record.count,sampleRate:record.sampleRate,
        preSamples:record.preSamples,startTick:record.startTick,sampleDigest:record.sampleDigest,
        timing:record.timing
      });
      channel.recordId = record.id;
      records.push(record);
    } else if (status === 'complete' && storedChannel?.recordId) {
      channel.recordId = storedChannel.recordId;
    }

    channels.push(channel);
  }

  const completeness = completenessOf(channels);
  const timeline = timelineOf(channels);
  const snapshot = {
    state:completeness.state,captured:completeness.captured,
    missed:completeness.missed,unresolved:completeness.unresolved,
    observedAt:now
  };
  const batch = {
    id,
    session:batchSession,
    triggerId:batchTrigger,
    kind:'trigger-batch',
    firstClaimedAt:stored?.firstClaimedAt ?? now,
    updatedAt:now,
    identity:{
      segmentKey:'device+boot+localTrigger',
      localTriggerScope:'boot',
      triggerIdScope:'session',
      note:'设备本地计数器独立运行；boot变化或触发号回绕时以来源绑定区分，不按数值先后推断'
    },
    source:{origin:client.origin},
    expected:Object.fromEntries(Object.entries(expected).map(([device,value]) => [device,value ?? null])),
    channels,
    completeness,
    timeline,
    history:historyOfBatch(stored?.history,snapshot),
    evidence:{
      triggers:triggersReceipt,
      bindings:bindingsReceipt,
      segments:segmentsReceipt,
      clocks:clocksReceipt,
      samples:samplesEvidence,
      requestCount:client.exchanges.length
    },
    notes:[
      '跨设备关联只采用来源bindings，不以文件到达时间或相近时间凑包',
      'pending不是漏采；missed只影响该设备通道，其他通道照常保留',
      '时间窗口带有校准偏移区间，区间仅用于展示，不用于合并触发'
    ],
    revision:itemDigest({channels,completeness})
  };
  return {batch,records};
}

export function batchFinished(batch) {
  const state = batch?.completeness?.state;
  return state === 'complete' || state === 'empty';
}
