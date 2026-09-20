import type { WorkbenchDatabase } from './db';
import { classifyText, systemCategories, toItemCategories } from './classification';
import { buildExcerpts } from './excerpts';
import type {
  BookmarkMembership,
  FinishEvidence,
  Platform,
  PlatformAccount,
  ScannedItem,
  SourceItem,
  SyncRun,
} from './types';
import { accountKey, itemKey, membershipKey, normalizeText, nowIso, stableHash, tokenizeChinese } from './utils';

export const ADAPTER_VERSIONS: Record<Platform, string> = {
  xiaohongshu: 'xhs-web-unverified-0.1.0',
  douyin: 'douyin-web-unverified-0.1.0',
};

export interface StartRunInput {
  id?: string;
  sessionToken?: string;
  platform: Platform;
  scopeKey?: string;
  tabId: number;
  startedAt?: string;
}

export async function ensureSystemCategories(database: WorkbenchDatabase): Promise<void> {
  const count = await database.categories.count();
  if (count === 0) await database.categories.bulkPut(systemCategories());
}

export async function startSyncRun(database: WorkbenchDatabase, input: StartRunInput): Promise<SyncRun> {
  const active = await database.syncRuns
    .where('platform')
    .equals(input.platform)
    .filter((run) => ['starting', 'scanning', 'paused'].includes(run.status))
    .first();
  if (active) throw new Error('SYNC_ALREADY_RUNNING');
  const at = input.startedAt ?? nowIso();
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const run: SyncRun = {
    id: input.id ?? `run-${random}`,
    sessionToken: input.sessionToken ?? `token-${random}`,
    platform: input.platform,
    accountId: null,
    scopeKey: input.scopeKey ?? 'account:all-visible-favorites',
    adapterVersion: ADAPTER_VERSIONS[input.platform],
    tabId: input.tabId,
    startedAt: at,
    finishedAt: null,
    status: 'starting',
    observedCount: 0,
    uniqueCount: 0,
    textCount: 0,
    organizedCount: 0,
    errors: [],
    terminationBasis: null,
    coverageStatus: 'unknown',
    completeForScope: false,
    accountWideCoverageVerified: false,
    identityVerified: false,
    checkpoint: { scrollTop: 0, batches: 0 },
    protectionReason: null,
  };
  await database.syncRuns.add(run);
  return run;
}

export async function bindSyncAccount(
  database: WorkbenchDatabase,
  runId: string,
  stableAccountId: string,
  displayName: string | null,
): Promise<PlatformAccount> {
  if (!stableAccountId || stableAccountId.length < 4) throw new Error('IDENTITY_UNVERIFIED');
  const run = await database.syncRuns.get(runId);
  if (!run) throw new Error('RUN_NOT_FOUND');
  const at = nowIso();
  const id = accountKey(run.platform, stableAccountId);
  const existing = await database.accounts.get(id);
  const account: PlatformAccount = {
    id,
    platform: run.platform,
    stableAccountId,
    displayName,
    identityStatus: 'verified',
    firstVerifiedAt: existing?.firstVerifiedAt ?? at,
    lastVerifiedAt: at,
  };
  await database.transaction('rw', database.accounts, database.syncRuns, async () => {
    await database.accounts.put(account);
    await database.syncRuns.update(runId, { accountId: id, identityVerified: true, status: 'scanning' });
  });
  return account;
}

async function organizeItem(database: WorkbenchDatabase, item: SourceItem): Promise<void> {
  await ensureSystemCategories(database);
  const categories = await database.categories.toArray();
  const locked = await database.itemCategories.where('itemId').equals(item.id).filter((entry) => entry.locked).toArray();
  const auto = toItemCategories(item, classifyText(item.title, item.text, categories));
  const lockedIds = new Set(locked.map((entry) => entry.categoryId));
  await database.itemCategories.where('itemId').equals(item.id).filter((entry) => !entry.locked).delete();
  await database.itemCategories.bulkPut(auto.filter((entry) => !lockedIds.has(entry.categoryId)));
  await database.excerpts.where('itemId').equals(item.id).delete();
  await database.excerpts.bulkPut(buildExcerpts(item));
}

export async function applyObservationBatch(
  database: WorkbenchDatabase,
  runId: string,
  scanned: ScannedItem[],
  checkpoint: { scrollTop: number; batches: number },
): Promise<void> {
  const run = await database.syncRuns.get(runId);
  if (!run) throw new Error('RUN_NOT_FOUND');
  if (!run.accountId || !run.identityVerified) throw new Error('IDENTITY_UNVERIFIED');
  const accountId = run.accountId;
  if (!['starting', 'scanning', 'paused', 'interrupted_needs_restart'].includes(run.status)) throw new Error('RUN_NOT_WRITABLE');

  const at = nowIso();
  const unique = new Map(scanned.map((entry) => [entry.stableItemId, entry]));
  const organized: SourceItem[] = [];
  await database.transaction(
    'rw',
    [database.items, database.memberships, database.observations, database.syncRuns],
    async () => {
      for (const entry of unique.values()) {
        const id = itemKey(run.platform, entry.stableItemId);
        const existing = await database.items.get(id);
        const cleanTitle = normalizeText(entry.title).slice(0, 500) || '未命名收藏';
        const cleanText = entry.text ? normalizeText(entry.text).slice(0, 200_000) : null;
        const contentHash = cleanText ? stableHash(cleanText) : null;
        const metadataHash = stableHash(`${cleanTitle}|${entry.author ?? ''}|${entry.canonicalUrl}`);
        const contentChanged = contentHash !== existing?.contentHash;
        const item: SourceItem = {
          id,
          platform: run.platform,
          stableItemId: entry.stableItemId,
          canonicalUrl: entry.canonicalUrl,
          navigationUrl: entry.navigationUrl,
          title: cleanTitle,
          author: entry.author ? normalizeText(entry.author).slice(0, 200) : null,
          publishedAt: entry.publishedAt,
          collectedAt: entry.collectedAt,
          importedAt: existing?.importedAt ?? at,
          lastSeenAt: at,
          text: cleanText,
          textStatus: entry.textStatus,
          textScope: entry.textScope,
          contentHash,
          metadataHash,
          contentVersion: existing ? existing.contentVersion + (contentChanged ? 1 : 0) : 1,
          adapterVersion: run.adapterVersion,
          active: true,
          activeState: 'active',
          searchTokens: tokenizeChinese(`${cleanTitle} ${cleanText ?? ''}`),
        };
        await database.items.put(item);
        const membershipId = membershipKey(accountId, run.scopeKey, id);
        const oldMembership = await database.memberships.get(membershipId);
        const membership: BookmarkMembership = {
          id: membershipId,
          accountId,
          scopeKey: run.scopeKey,
          collectionId: entry.collectionId,
          itemId: id,
          active: true,
          firstSeenAt: oldMembership?.firstSeenAt ?? at,
          lastSeenAt: at,
          removedAt: null,
          removalReason: null,
        };
        await database.memberships.put(membership);
        await database.observations.put({ runId, itemId: id, scopeKey: run.scopeKey, observedAt: at });
        organized.push(item);
      }
      const observedIds = await database.observations.where('runId').equals(runId).primaryKeys();
      const uniqueIds = new Set((await database.observations.where('runId').equals(runId).toArray()).map((entry) => entry.itemId));
      const textCount = await database.items.bulkGet([...uniqueIds]).then((items) => items.filter((item) => item?.text).length);
      await database.syncRuns.update(runId, {
        status: 'scanning',
        observedCount: observedIds.length,
        uniqueCount: uniqueIds.size,
        textCount,
        checkpoint,
      });
    },
  );

  for (const item of organized) await organizeItem(database, item);
  await database.syncRuns.update(runId, { organizedCount: (await database.syncRuns.get(runId))?.uniqueCount ?? organized.length });
}

async function clearOrphanedDerivedData(database: WorkbenchDatabase, itemId: string): Promise<void> {
  const hasActiveMembership = await database.memberships.where('itemId').equals(itemId).filter((membership) => membership.active).count();
  if (hasActiveMembership > 0) return;
  await Promise.all([
    database.itemCategories.where('itemId').equals(itemId).filter((entry) => !entry.locked).delete(),
    database.itemEntities.where('itemId').equals(itemId).filter((entry) => !entry.locked).delete(),
    database.excerpts.where('itemId').equals(itemId).delete(),
    database.featureCache.where('itemId').equals(itemId).delete(),
  ]);
  const item = await database.items.get(itemId);
  if (item) {
    await database.items.update(itemId, {
      active: false,
      activeState: 'inactive',
      text: null,
      contentHash: null,
      searchTokens: [],
      textStatus: 'content_unavailable',
      textScope: '收藏关系已从可靠快照中移除，仅保留最小同步记录',
    });
  }
}

export async function finishSyncRun(database: WorkbenchDatabase, runId: string, evidence: FinishEvidence): Promise<SyncRun> {
  const run = await database.syncRuns.get(runId);
  if (!run) throw new Error('RUN_NOT_FOUND');
  const at = nowIso();
  let status: SyncRun['status'] = evidence.errors.length > 0 ? 'partial' : 'completed';
  let protectionReason: string | null = null;

  const canReconcile = Boolean(
    run.accountId &&
      evidence.identityVerified &&
      evidence.completeForScope &&
      evidence.membershipSnapshotVerified &&
      ['verified_end_marker', 'verified_page_count', 'verified_empty_state'].includes(evidence.terminationBasis) &&
      evidence.errors.length === 0,
  );

  if (canReconcile && run.accountId) {
    const observedIds = new Set((await database.observations.where('runId').equals(runId).toArray()).map((entry) => entry.itemId));
    const previous = await database.memberships
      .where('[accountId+scopeKey]')
      .equals([run.accountId, run.scopeKey])
      .filter((membership) => membership.active)
      .toArray();
    const suddenDrop = previous.length >= 10 && observedIds.size < previous.length * 0.4;
    const unsafeEmpty = observedIds.size === 0 && evidence.terminationBasis !== 'verified_empty_state';
    if (suddenDrop || unsafeEmpty) {
      status = 'protected';
      protectionReason = suddenDrop ? '观测数量较上次可靠快照异常下降，已阻止批量移除' : '空列表缺少已验证的空状态语义';
    } else {
      const missing = previous.filter((membership) => !observedIds.has(membership.itemId));
      await database.transaction('rw', database.memberships, async () => {
        for (const membership of missing) {
          await database.memberships.update(membership.id, {
            active: false,
            removedAt: at,
            removalReason: 'missing_from_verified_snapshot',
          });
        }
      });
      for (const membership of missing) await clearOrphanedDerivedData(database, membership.itemId);
    }
  } else if (evidence.terminationBasis === 'cancelled') {
    status = 'cancelled';
  } else if (!evidence.completeForScope && status === 'completed') {
    status = 'partial';
  }

  await database.syncRuns.update(runId, {
    status,
    finishedAt: at,
    errors: evidence.errors,
    terminationBasis: evidence.terminationBasis,
    coverageStatus: evidence.coverageStatus,
    completeForScope: evidence.completeForScope,
    accountWideCoverageVerified: evidence.accountWideCoverageVerified,
    identityVerified: evidence.identityVerified,
    protectionReason,
  });
  return (await database.syncRuns.get(runId))!;
}

export async function markInterruptedRuns(database: WorkbenchDatabase): Promise<void> {
  const running = await database.syncRuns.where('status').anyOf('starting', 'scanning', 'paused').toArray();
  await database.syncRuns.bulkPut(running.map((run) => ({ ...run, status: 'interrupted_needs_restart' as const })));
}
