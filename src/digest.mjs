import {createHash} from 'node:crypto';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).filter(key => value[key] !== undefined).sort()
      .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value ?? null);
}

export const itemDigest = value => digest(Buffer.from(canonical(value)));
