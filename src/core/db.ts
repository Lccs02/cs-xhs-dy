import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSetting,
  BookmarkMembership,
  Category,
  Entity,
  Excerpt,
  FeatureCache,
  ItemCategory,
  ItemEntity,
  Observation,
  PlatformAccount,
  SourceItem,
  SyncRun,
  UserOverride,
} from './types';

export class WorkbenchDatabase extends Dexie {
  accounts!: EntityTable<PlatformAccount, 'id'>;
  items!: EntityTable<SourceItem, 'id'>;
  memberships!: EntityTable<BookmarkMembership, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  itemCategories!: EntityTable<ItemCategory, 'id'>;
  entities!: EntityTable<Entity, 'id'>;
  itemEntities!: EntityTable<ItemEntity, 'id'>;
  excerpts!: EntityTable<Excerpt, 'id'>;
  overrides!: EntityTable<UserOverride, 'id'>;
  syncRuns!: EntityTable<SyncRun, 'id'>;
  observations!: EntityTable<Observation, 'id'>;
  featureCache!: EntityTable<FeatureCache, 'id'>;
  settings!: EntityTable<AppSetting, 'key'>;

  constructor(name = 'ShoucangWorkbench') {
    super(name);
    this.version(1).stores({
      accounts: '&id, platform, stableAccountId, identityStatus, lastVerifiedAt',
      items: '&id, [platform+stableItemId], platform, activeState, importedAt, lastSeenAt, textStatus, *searchTokens',
      memberships: '&id, accountId, scopeKey, itemId, [accountId+scopeKey], [accountId+itemId]',
      categories: '&id, &name, isSystem, updatedAt',
      itemCategories: '&id, itemId, categoryId, source, locked, [itemId+categoryId]',
      entities: '&id, name, type, city, model, updatedAt, *aliases',
      itemEntities: '&id, itemId, entityId, status, locked, [itemId+entityId]',
      excerpts: '&id, itemId, entityId, contentVersion, [itemId+contentVersion]',
      overrides: '&id, kind, targetId, updatedAt',
      syncRuns: '&id, &sessionToken, platform, accountId, status, startedAt, [platform+accountId]',
      observations: '++id, runId, itemId, scopeKey, observedAt, [runId+itemId]',
      featureCache: '&id, itemId, kind, inputHash, [itemId+kind]',
      settings: '&key',
    });
  }
}

export const db = new WorkbenchDatabase();

let demoDb: WorkbenchDatabase | null = null;
export function getDemoDatabase(): WorkbenchDatabase {
  demoDb ??= new WorkbenchDatabase('ShoucangWorkbenchDemo');
  return demoDb;
}

export async function deleteAllLocalData(): Promise<void> {
  await db.delete();
  db.open();
  if (demoDb) {
    await demoDb.delete();
    demoDb = null;
  }
}
