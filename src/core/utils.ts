import type { Platform } from './types';

export const nowIso = () => new Date().toISOString();

export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function itemKey(platform: Platform, stableItemId: string): string {
  return `${platform}:${stableItemId}`;
}

export function accountKey(platform: Platform, stableAccountId: string): string {
  return `${platform}:${stableAccountId}`;
}

export function membershipKey(accountId: string, scopeKey: string, itemId: string): string {
  return `${accountId}|${scopeKey}|${itemId}`;
}

export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeChinese(text: string): string[] {
  const normalized = normalizeText(text).toLocaleLowerCase('zh-CN');
  const words = normalized.match(/[a-z0-9][a-z0-9+._-]*|[\p{Script=Han}]{1,}/gu) ?? [];
  const tokens = new Set<string>();
  for (const word of words) {
    tokens.add(word);
    if (/^[\p{Script=Han}]+$/u.test(word)) {
      for (let index = 0; index < word.length - 1; index += 1) tokens.add(word.slice(index, index + 2));
      for (let index = 0; index < word.length - 2; index += 1) tokens.add(word.slice(index, index + 3));
    }
  }
  return [...tokens].slice(0, 256);
}

export function sanitizeUrl(raw: string, platform: Platform): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    const allowed = platform === 'xiaohongshu'
      ? ['xiaohongshu.com', 'www.xiaohongshu.com']
      : ['douyin.com', 'www.douyin.com'];
    if (!allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null;
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|spm|source|share|share_token|timestamp|track)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
