import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkbenchDatabase } from '../../src/core/db';
import { applyObservationBatch, bindSyncAccount, finishSyncRun, markInterruptedRuns, startSyncRun } from '../../src/core/sync';
import type { FinishEvidence, ScannedItem } from '../../src/core/types';

let database: WorkbenchDatabase;
const item = (id: string, text: string | null = '这是一段可用于测试的正文。'): ScannedItem => ({
  stableItemId: id,
  canonicalUrl: `https://www.xiaohongshu.com/explore/${id}`,
  navigationUrl: `https://www.xiaohongshu.com/explore/${id}`,
  title: `标题 ${id}`,
  author: null,
  publishedAt: null,
  collectedAt: null,
  text,
  textStatus: text ? 'text_available' : 'content_unavailable',
  textScope: text ? '合成测试正文' : '合成测试不可访问',
  collectionId: null,
});
const trusted: FinishEvidence = {
  coverageStatus: 'complete_for_scope', completeForScope: true, accountWideCoverageVerified: true,
  identityVerified: true, terminationBasis: 'verified_end_marker', membershipSnapshotVerified: true, errors: [],
};

async function start(id: string, scopeKey = 'account:all') {
  const run = await startSyncRun(database, { id, sessionToken: `token-${id}`, platform: 'xiaohongshu', scopeKey, tabId: 1 });
  await bindSyncAccount(database, run.id, 'account-stable-1', '测试账号');
  return (await database.syncRuns.get(run.id))!;
}

beforeEach(() => { database = new WorkbenchDatabase(`test-${crypto.randomUUID()}`); });
afterEach(async () => { await database.delete(); });

describe('安全同步与对账', () => {
  it('重复同步不增加重复收藏', async () => {
    const first = await start('r1');
    await applyObservationBatch(database, first.id, [item('item-00000001'), item('item-00000001')], { scrollTop: 1, batches: 1 });
    await finishSyncRun(database, first.id, trusted);
    const second = await start('r2');
    await applyObservationBatch(database, second.id, [item('item-00000001')], { scrollTop: 2, batches: 1 });
    await finishSyncRun(database, second.id, trusted);
    expect(await database.items.count()).toBe(1);
    expect((await database.memberships.toArray()).filter((membership) => membership.active)).toHaveLength(1);
  });

  it('未知终止与网络错误不触发破坏性删除', async () => {
    const first = await start('r1');
    await applyObservationBatch(database, first.id, [item('item-00000001'), item('item-00000002')], { scrollTop: 1, batches: 1 });
    await finishSyncRun(database, first.id, trusted);
    const second = await start('r2');
    await applyObservationBatch(database, second.id, [item('item-00000001')], { scrollTop: 2, batches: 1 });
    await finishSyncRun(database, second.id, { ...trusted, coverageStatus: 'unknown', completeForScope: false, membershipSnapshotVerified: false, terminationBasis: 'error', errors: ['NETWORK'] });
    expect((await database.memberships.toArray()).filter((membership) => membership.active)).toHaveLength(2);
  });

  it('可信完整快照移除缺失关系并清理仅依赖它的派生数据', async () => {
    const first = await start('r1');
    await applyObservationBatch(database, first.id, [item('item-00000001'), item('item-00000002')], { scrollTop: 1, batches: 1 });
    await finishSyncRun(database, first.id, trusted);
    expect(await database.excerpts.where('itemId').equals('xiaohongshu:item-00000002').count()).toBeGreaterThan(0);
    const second = await start('r2');
    await applyObservationBatch(database, second.id, [item('item-00000001')], { scrollTop: 2, batches: 1 });
    await finishSyncRun(database, second.id, trusted);
    const removed = await database.items.get('xiaohongshu:item-00000002');
    expect(removed?.active).toBe(false);
    expect(removed?.text).toBeNull();
    expect(await database.excerpts.where('itemId').equals(removed!.id).count()).toBe(0);
  });

  it('一个内容属于另一个范围时不会清理内容', async () => {
    const all = await start('r1', 'account:all');
    await applyObservationBatch(database, all.id, [item('item-00000001')], { scrollTop: 1, batches: 1 });
    await finishSyncRun(database, all.id, trusted);
    const folder = await start('r2', 'folder:favorites-a');
    await applyObservationBatch(database, folder.id, [item('item-00000001')], { scrollTop: 1, batches: 1 });
    await finishSyncRun(database, folder.id, trusted);
    const empty = await start('r3', 'account:all');
    await finishSyncRun(database, empty.id, { ...trusted, terminationBasis: 'verified_empty_state' });
    expect((await database.items.get('xiaohongshu:item-00000001'))?.active).toBe(true);
    expect((await database.memberships.toArray()).filter((membership) => membership.active)).toHaveLength(1);
  });

  it('页面突然大幅变空进入保护状态', async () => {
    const first = await start('r1');
    await applyObservationBatch(database, first.id, Array.from({ length: 12 }, (_, index) => item(`item-${String(index).padStart(8, '0')}`)), { scrollTop: 1, batches: 1 });
    await finishSyncRun(database, first.id, trusted);
    const second = await start('r2');
    await applyObservationBatch(database, second.id, [item('item-00000000')], { scrollTop: 2, batches: 1 });
    const result = await finishSyncRun(database, second.id, trusted);
    expect(result.status).toBe('protected');
    expect((await database.memberships.toArray()).filter((membership) => membership.active)).toHaveLength(12);
  });

  it('内容不可访问不等于取消收藏', async () => {
    const run = await start('r1');
    await applyObservationBatch(database, run.id, [item('item-00000001', null)], { scrollTop: 1, batches: 1 });
    await finishSyncRun(database, run.id, trusted);
    expect((await database.items.get('xiaohongshu:item-00000001'))?.active).toBe(true);
    expect((await database.items.get('xiaohongshu:item-00000001'))?.textStatus).toBe('content_unavailable');
  });

  it('service worker 重启后把未完成任务标为需重启', async () => {
    const run = await start('r1');
    await markInterruptedRuns(database);
    expect((await database.syncRuns.get(run.id))?.status).toBe('interrupted_needs_restart');
  });

  it('人工锁定分类不会被后续自动整理覆盖', async () => {
    const run = await start('r1');
    await applyObservationBatch(database, run.id, [item('item-00000001', '旅行和美食攻略')], { scrollTop: 1, batches: 1 });
    await database.itemCategories.put({ id: 'xiaohongshu:item-00000001|cat-study', itemId: 'xiaohongshu:item-00000001', categoryId: 'cat-study', source: 'user', score: null, evidence: ['用户设置'], locked: true, updatedAt: new Date().toISOString() });
    await applyObservationBatch(database, run.id, [item('item-00000001', '新的旅行正文')], { scrollTop: 2, batches: 2 });
    expect((await database.itemCategories.get('xiaohongshu:item-00000001|cat-study'))?.locked).toBe(true);
  });
});
