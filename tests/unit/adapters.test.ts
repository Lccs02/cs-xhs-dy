// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { adapters, detectAccountIdentity, detectPageBoundary, detectPlatform, scanVisibleItems } from '../../src/adapters/shared';

describe('平台页面适配器（仅合成 fixture）', () => {
  it('只识别允许的平台域名', () => {
    expect(detectPlatform('https://www.xiaohongshu.com/user/profile/abc')).toBe('xiaohongshu');
    expect(detectPlatform('https://evil.example/?next=https://douyin.com')).toBeNull();
  });

  it('从小红书合成收藏页提取稳定账号路径和去重内容 ID', () => {
    document.body.innerHTML = `<header><a href="https://www.xiaohongshu.com/user/profile/account_12345" aria-label="测试账号"></a></header><main><h1>收藏</h1><article><a href="https://www.xiaohongshu.com/explore/item_12345678?utm_source=test"><img alt="合成标题" /></a></article><article><a href="https://www.xiaohongshu.com/explore/item_12345678">重复</a></article></main>`;
    const spec = adapters.xiaohongshu;
    expect(detectAccountIdentity(document, 'https://www.xiaohongshu.com/user/profile/account_12345?tab=collect', spec).stableAccountId).toBe('account_12345');
    const items = scanVisibleItems(document, spec);
    expect(items).toHaveLength(1);
    expect(items[0]?.canonicalUrl).not.toContain('utm_source');
  });

  it('滚动停滞不是可靠结束依据，只有合成语义标记能被单独检测', () => {
    document.body.innerHTML = '<main>还有内容正在加载</main>';
    expect(detectPageBoundary(document, adapters.douyin)).toBeNull();
    document.body.innerHTML = '<main>没有更多了</main>';
    expect(detectPageBoundary(document, adapters.douyin)).toBe('end_marker');
  });
});
