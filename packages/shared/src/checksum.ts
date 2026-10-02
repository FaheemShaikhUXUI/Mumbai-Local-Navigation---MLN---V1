import { createHash } from 'crypto';

/**
 * Computes deterministic SHA-256 hash of a string, Buffer, or JSON-serializable object.
 */
export function computeSha256(content: string | Buffer | object): string {
  const hash = createHash('sha256');
  if (typeof content === 'string') {
    hash.update(content, 'utf8');
  } else if (Buffer.isBuffer(content)) {
    hash.update(content);
  } else {
    // Deterministic JSON stringify by sorting keys
    const canonicalString = canonicalJsonStringify(content);
    hash.update(canonicalString, 'utf8');
  }
  return hash.digest('hex');
}

/**
 * Deterministically stringifies an object by sorting all object keys recursively.
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(
    (key) => JSON.stringify(key) + ':' + canonicalJsonStringify(obj[key])
  );
  return '{' + pairs.join(',') + '}';
}
