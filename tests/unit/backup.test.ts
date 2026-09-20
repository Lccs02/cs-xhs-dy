import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportBackup, restoreBackup } from '../../src/core/backup';
import { WorkbenchDatabase } from '../../src/core/db';
import { seedDemo } from '../../src/core/demo';

let source: WorkbenchDatabase;
let target: WorkbenchDatabase;
beforeEach(() => { source = new WorkbenchDatabase(`source-${crypto.randomUUID()}`); target = new WorkbenchDatabase(`target-${crypto.randomUUID()}`); });
afterEach(async () => { await source.delete(); await target.delete(); });

describe('本地备份', () => {
  it('恢复后记录、关系和人工锁定一致', async () => {
    await seedDemo(source);
    await source.itemCategories.update('xiaohongshu:xhs-01|cat-travel', { locked: true, source: 'user' });
    const backup = await exportBackup(source);
    await restoreBackup(target, backup);
    expect(await target.items.count()).toBe(await source.items.count());
    expect(await target.itemEntities.count()).toBe(await source.itemEntities.count());
    expect((await target.itemCategories.get('xiaohongshu:xhs-01|cat-travel'))?.locked).toBe(true);
  });

  it('拒绝未知版本与缺表备份', async () => {
    await expect(restoreBackup(target, { format: 'other', version: 99, tables: {} })).rejects.toThrow();
  });
});
