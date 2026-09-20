import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WorkbenchDatabase } from '../../src/core/db';
import type { SourceItem } from '../../src/core/types';
import { stableHash, tokenizeChinese } from '../../src/core/utils';

const database = new WorkbenchDatabase(`stress-${crypto.randomUUID()}`);
beforeAll(async () => {
  const at = new Date().toISOString();
  let seed = 20260920;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const topics = ['旅行路线', '数码测评', '学习笔记', '家居收纳', '运动训练', '餐厅探店'];
  const items: SourceItem[] = Array.from({ length: 10_000 }, (_, index) => {
    const title = `${topics[Math.floor(random() * topics.length)]} · 合成记录 ${index}`;
    const text = `这是由固定种子生成的合成文本 ${index}，仅用于本地分页和检索压力测试。`;
    const platform = index % 2 === 0 ? 'xiaohongshu' as const : 'douyin' as const;
    return {
      id: `${platform}:stress-${index}`, platform, stableItemId: `stress-${index}`,
      canonicalUrl: platform === 'xiaohongshu' ? `https://www.xiaohongshu.com/explore/stress-${index}` : `https://www.douyin.com/video/${100000000 + index}`,
      navigationUrl: platform === 'xiaohongshu' ? `https://www.xiaohongshu.com/explore/stress-${index}` : `https://www.douyin.com/video/${100000000 + index}`,
      title, author: null, publishedAt: null, collectedAt: null, importedAt: at, lastSeenAt: at, text,
      textStatus: 'text_available', textScope: '固定种子合成数据', contentHash: stableHash(text), metadataHash: stableHash(title),
      contentVersion: 1, adapterVersion: 'stress-fixture-1', active: true, activeState: 'active', searchTokens: tokenizeChinese(`${title} ${text}`),
    };
  });
  await database.items.bulkPut(items);
}, 60_000);
afterAll(async () => { await database.delete(); });

describe('10,000 条固定种子压力目标', () => {
  it('分页查询不会一次渲染全库', async () => {
    const started = performance.now();
    const page = await database.items.where('activeState').equals('active').offset(4_960).limit(40).toArray();
    const elapsed = performance.now() - started;
    expect(page).toHaveLength(40);
    expect(await database.items.count()).toBe(10_000);
    console.info(`[stress] 10k records, page=40, query=${elapsed.toFixed(1)}ms, heap=${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB, runtime=Node ${process.version} + fake-indexeddb`);
  }, 30_000);
});
