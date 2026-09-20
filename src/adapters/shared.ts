import type { Platform, ScannedItem } from '../core/types';
import { normalizeText, sanitizeUrl } from '../core/utils';

export interface AdapterSpec {
  platform: Platform;
  label: string;
  version: string;
  allowedHosts: string[];
  favoritesHints: string[];
  itemPatterns: RegExp[];
  accountPatterns: RegExp[];
  endMarkers: string[];
  emptyMarkers: string[];
  verifiedOnRealPlatform: false;
  membershipSnapshotVerified: false;
  knownGaps: string[];
}

export interface PageIdentity {
  stableAccountId: string | null;
  displayName: string | null;
  evidence: string;
}

export const adapters: Record<Platform, AdapterSpec> = {
  xiaohongshu: {
    platform: 'xiaohongshu',
    label: '小红书',
    version: 'xhs-web-unverified-0.1.0',
    allowedHosts: ['xiaohongshu.com'],
    favoritesHints: ['收藏', 'collect'],
    itemPatterns: [/\/(?:explore|discovery\/item)\/([a-zA-Z0-9_-]{8,})/],
    accountPatterns: [/\/user\/profile\/([a-zA-Z0-9_-]{8,})/],
    endMarkers: ['已经到底了', '没有更多了'],
    emptyMarkers: ['暂无收藏', '还没有收藏'],
    verifiedOnRealPlatform: false,
    membershipSnapshotVerified: false,
    knownGaps: ['网页端与 App 收藏范围是否一致未验证', '收藏夹与全部收藏的结束依据未验证', '图文与视频类型覆盖未验证'],
  },
  douyin: {
    platform: 'douyin',
    label: '抖音',
    version: 'douyin-web-unverified-0.1.0',
    allowedHosts: ['douyin.com'],
    favoritesHints: ['收藏', 'favorite'],
    itemPatterns: [/\/(?:video|note)\/([0-9]{8,})/],
    accountPatterns: [/\/user\/([a-zA-Z0-9_-]{8,})/],
    endMarkers: ['暂时没有更多了', '没有更多了'],
    emptyMarkers: ['暂无收藏', '还没有收藏'],
    verifiedOnRealPlatform: false,
    membershipSnapshotVerified: false,
    knownGaps: ['网页收藏可见范围与 App 是否一致未验证', '不同内容类型与收藏夹覆盖未验证', '可靠分页终止依据未验证'],
  },
};

export function detectPlatform(url: string): Platform | null {
  try {
    const host = new URL(url).hostname;
    if (host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com')) return 'xiaohongshu';
    if (host === 'douyin.com' || host.endsWith('.douyin.com')) return 'douyin';
  } catch {
    return null;
  }
  return null;
}

function matchFirst(value: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function detectAccountIdentity(document: Document, locationUrl: string, spec: AdapterSpec): PageIdentity {
  const locationId = matchFirst(new URL(locationUrl).pathname, spec.accountPatterns);
  const bodyText = document.body.innerText ?? document.body.textContent ?? '';
  if (locationId && spec.favoritesHints.some((hint) => bodyText.toLowerCase().includes(hint.toLowerCase()))) {
    return { stableAccountId: locationId, displayName: null, evidence: '收藏页面 URL 中的稳定账号路径段' };
  }
  const containers = [...document.querySelectorAll('header, nav, [role="navigation"]')];
  const candidates = containers.flatMap((container) => [...container.querySelectorAll<HTMLAnchorElement>('a[href]')]);
  for (const anchor of candidates) {
    const stableAccountId = matchFirst(anchor.href, spec.accountPatterns);
    if (stableAccountId) {
      const displayName = normalizeText(anchor.getAttribute('aria-label') ?? anchor.title ?? anchor.textContent ?? '').slice(0, 100) || null;
      return { stableAccountId, displayName, evidence: '页面顶栏账号链接中的稳定路径段' };
    }
  }
  return { stableAccountId: null, displayName: null, evidence: '未找到可保守确认的稳定账号标识；昵称不作为主键' };
}

function compactCardText(anchor: HTMLAnchorElement): { title: string; text: string | null } {
  const container = anchor.closest('article, li, [role="listitem"], section, div') ?? anchor;
  const raw = normalizeText(container.textContent ?? '').slice(0, 1200);
  const fromAttributes = normalizeText(anchor.getAttribute('aria-label') ?? anchor.title ?? anchor.querySelector('img')?.alt ?? '');
  const title = (fromAttributes || raw.split(/[。！？\n]/)[0] || '未命名收藏').slice(0, 300);
  const text = raw.length > title.length + 8 ? raw : null;
  return { title, text };
}

export function scanVisibleItems(document: Document, spec: AdapterSpec): ScannedItem[] {
  const byId = new Map<string, ScannedItem>();
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const stableItemId = matchFirst(anchor.href, spec.itemPatterns);
    if (!stableItemId) continue;
    const canonicalUrl = sanitizeUrl(anchor.href, spec.platform);
    if (!canonicalUrl) continue;
    const { title, text } = compactCardText(anchor);
    byId.set(stableItemId, {
      stableItemId,
      canonicalUrl,
      navigationUrl: canonicalUrl,
      title,
      author: null,
      publishedAt: null,
      collectedAt: null,
      text,
      textStatus: text ? 'text_partial' : 'metadata_only',
      textScope: text ? '仅来自收藏列表当前可见卡片文字，未验证为完整正文或视频内容' : null,
      collectionId: null,
    });
  }
  return [...byId.values()];
}

export function detectPageBoundary(document: Document, spec: AdapterSpec): 'end_marker' | 'empty_state' | null {
  const tail = normalizeText(document.body.innerText ?? document.body.textContent ?? '').slice(-1500);
  if (spec.emptyMarkers.some((marker) => tail.includes(marker))) return 'empty_state';
  if (spec.endMarkers.some((marker) => tail.includes(marker))) return 'end_marker';
  return null;
}
