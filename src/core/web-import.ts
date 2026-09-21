import type { WorkbenchDatabase } from './db';
import { classifyText, systemCategories, toItemCategories } from './classification';
import { buildExcerpts } from './excerpts';
import type { Entity, ItemEntity, Platform, SourceItem, TextStatus } from './types';
import { itemKey, normalizeText, nowIso, sanitizeUrl, stableHash, tokenizeChinese } from './utils';

export interface WebBookmarkInput {
  platform: Platform;
  url: string;
  title: string;
  author?: string;
  text?: string;
  entityName?: string;
}

export interface QuickImportRow extends WebBookmarkInput {
  line: number;
}

export interface QuickImportResult {
  rows: QuickImportRow[];
  errors: string[];
}

export function detectPlatform(url: string): Platform | null {
  try {
    const host = new URL(url).hostname.toLocaleLowerCase('en-US');
    if (host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com')) return 'xiaohongshu';
    if (host === 'douyin.com' || host.endsWith('.douyin.com')) return 'douyin';
    return null;
  } catch {
    return null;
  }
}

export function parseQuickImport(value: string): QuickImportResult {
  const rows: QuickImportRow[] = [];
  const errors: string[] = [];
  value.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const clean = raw.trim();
    if (!clean) return;
    const parts = clean.includes('\t') ? clean.split('\t') : clean.split('|');
    const [urlPart = '', titlePart = '', textPart = '', entityPart = ''] = parts.map((part) => part.trim());
    const platform = detectPlatform(urlPart);
    if (!platform) {
      errors.push(`第 ${line} 行不是受支持的小红书或抖音 HTTPS 链接`);
      return;
    }
    const safeUrl = sanitizeUrl(urlPart, platform);
    if (!safeUrl) {
      errors.push(`第 ${line} 行链接无效或协议不安全`);
      return;
    }
    const fallbackTitle = new URL(safeUrl).pathname.split('/').filter(Boolean).at(-1) ?? '未命名收藏';
    rows.push({
      line,
      platform,
      url: safeUrl,
      title: normalizeText(titlePart || fallbackTitle).slice(0, 180),
      text: normalizeText(textPart).slice(0, 20_000),
      entityName: normalizeText(entityPart).slice(0, 80),
    });
  });
  return { rows, errors };
}

function stableItemIdFromUrl(url: string): string {
  const parsed = new URL(url);
  const knownId = parsed.pathname.match(/\/(?:explore|discovery\/item|video|note)\/([^/?#]+)/i)?.[1];
  return knownId ? knownId.slice(0, 160) : `web-${stableHash(`${parsed.hostname}${parsed.pathname}`)}`;
}

async function ensureSystemCategories(database: WorkbenchDatabase): Promise<void> {
  const existingIds = new Set((await database.categories.toCollection().primaryKeys()).map(String));
  const missing = systemCategories().filter((category) => !existingIds.has(category.id));
  if (missing.length > 0) await database.categories.bulkPut(missing);
}

async function resolveEntity(database: WorkbenchDatabase, rawName: string | undefined, at: string): Promise<Entity | null> {
  const name = normalizeText(rawName ?? '').slice(0, 80);
  if (!name) return null;
  const normalizedName = name.toLocaleLowerCase('zh-CN');
  const existing = (await database.entities.toArray()).find((entity) =>
    [entity.name, ...entity.aliases].some((candidate) => candidate.toLocaleLowerCase('zh-CN') === normalizedName),
  );
  if (existing) return existing;
  const entity: Entity = {
    id: `entity-web-${stableHash(normalizedName)}-${crypto.randomUUID().slice(0, 8)}`,
    name,
    type: 'other',
    aliases: [],
    brand: null,
    model: null,
    city: null,
    store: null,
    createdAt: at,
    updatedAt: at,
  };
  await database.entities.add(entity);
  return entity;
}

export async function saveWebBookmark(database: WorkbenchDatabase, input: WebBookmarkInput): Promise<SourceItem> {
  const safeUrl = sanitizeUrl(input.url, input.platform);
  if (!safeUrl) throw new Error('仅支持小红书或抖音的 HTTPS 内容链接');
  const title = normalizeText(input.title).slice(0, 180);
  if (!title) throw new Error('请填写标题');
  const text = normalizeText(input.text ?? '').slice(0, 20_000) || null;
  const author = normalizeText(input.author ?? '').slice(0, 80) || null;
  const stableItemId = stableItemIdFromUrl(safeUrl);
  const id = itemKey(input.platform, stableItemId);
  const existing = await database.items.get(id);
  const at = nowIso();
  const metadataHash = stableHash(`${title}|${author ?? ''}|${safeUrl}`);
  const contentHash = text ? stableHash(text) : null;
  const changed = Boolean(existing && (existing.contentHash !== contentHash || existing.metadataHash !== metadataHash));
  const textStatus: TextStatus = text ? 'text_available' : 'metadata_only';
  const item: SourceItem = {
    id,
    platform: input.platform,
    stableItemId,
    canonicalUrl: safeUrl,
    navigationUrl: safeUrl,
    title,
    author,
    publishedAt: existing?.publishedAt ?? null,
    collectedAt: existing?.collectedAt ?? null,
    importedAt: existing?.importedAt ?? at,
    lastSeenAt: at,
    text,
    textStatus,
    textScope: text ? '由用户在网页版中主动粘贴的文字' : null,
    contentHash,
    metadataHash,
    contentVersion: existing ? existing.contentVersion + (changed ? 1 : 0) : 1,
    adapterVersion: 'web-manual-1.0.0',
    active: true,
    activeState: 'active',
    searchTokens: tokenizeChinese(`${title} ${author ?? ''} ${text ?? ''}`),
  };

  await ensureSystemCategories(database);
  const categories = await database.categories.toArray();
  const automaticCategories = toItemCategories(item, classifyText(item.title, item.text, categories), at);
  const lockedCategories = await database.itemCategories.where('itemId').equals(item.id).filter((entry) => entry.locked).toArray();
  const entity = await resolveEntity(database, input.entityName, at);
  const entityLink: ItemEntity | null = entity ? {
    id: `${item.id}|${entity.id}`,
    itemId: item.id,
    entityId: entity.id,
    status: 'user_confirmed',
    score: null,
    evidence: ['网页版导入时由用户指定'],
    locked: true,
    updatedAt: at,
  } : null;

  await database.transaction(
    'rw',
    database.items,
    database.itemCategories,
    database.excerpts,
    database.itemEntities,
    async () => {
      await database.items.put(item);
      await database.itemCategories.where('itemId').equals(item.id).filter((entry) => !entry.locked).delete();
      const lockedIds = new Set(lockedCategories.map((entry) => entry.categoryId));
      await database.itemCategories.bulkPut(automaticCategories.filter((entry) => !lockedIds.has(entry.categoryId)));
      await database.excerpts.where('itemId').equals(item.id).delete();
      await database.excerpts.bulkPut(buildExcerpts(item));
      if (entityLink) await database.itemEntities.put(entityLink);
    },
  );
  return item;
}
