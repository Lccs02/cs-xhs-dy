import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkbenchDatabase } from '../../src/core/db';
import { detectPlatform, parseQuickImport, saveWebBookmark } from '../../src/core/web-import';

describe('web import', () => {
  let database: WorkbenchDatabase;

  beforeEach(() => { database = new WorkbenchDatabase(`web-import-${crypto.randomUUID()}`); });
  afterEach(async () => { await database.delete(); });

  it('detects supported platform links and rejects lookalikes', () => {
    expect(detectPlatform('https://www.xiaohongshu.com/explore/abc')).toBe('xiaohongshu');
    expect(detectPlatform('https://www.douyin.com/video/123')).toBe('douyin');
    expect(detectPlatform('https://douyin.com.evil.example/video/123')).toBeNull();
  });

  it('parses rows without discarding valid lines', () => {
    const result = parseQuickImport([
      'https://www.xiaohongshu.com/explore/abc | 上海书店 | 适合工作日去 | 衡山和集',
      'not-a-url | 无效',
      'https://www.douyin.com/video/123\t耳机体验',
    ].join('\n'));
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toEqual(['第 2 行不是受支持的小红书或抖音 HTTPS 链接']);
    expect(result.rows[0]?.entityName).toBe('衡山和集');
  });

  it('saves, classifies and updates a bookmark idempotently', async () => {
    const first = await saveWebBookmark(database, {
      platform: 'xiaohongshu',
      url: 'https://www.xiaohongshu.com/explore/abc?utm_source=test',
      title: '广州咖啡店探店',
      text: '这家咖啡店适合安静阅读。',
      entityName: '木棉咖啡',
    });
    const second = await saveWebBookmark(database, {
      platform: 'xiaohongshu',
      url: 'https://www.xiaohongshu.com/explore/abc',
      title: '广州咖啡店探店（更新）',
      text: '这家咖啡店适合工作日安静阅读。',
      entityName: '木棉咖啡',
    });
    expect(second.id).toBe(first.id);
    expect(second.contentVersion).toBe(2);
    expect(await database.items.count()).toBe(1);
    expect(await database.itemCategories.where('itemId').equals(first.id).count()).toBeGreaterThan(0);
    expect(await database.excerpts.where('itemId').equals(first.id).count()).toBeGreaterThan(0);
    expect(await database.entities.count()).toBe(1);
  });
});
