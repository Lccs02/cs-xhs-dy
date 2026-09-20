import { describe, expect, it } from 'vitest';
import { classifyText, systemCategories } from '../../src/core/classification';
import { buildExcerpts } from '../../src/core/excerpts';
import type { SourceItem } from '../../src/core/types';

describe('基础文本处理', () => {
  it('用关键词给中文内容多标签分类并展示依据', () => {
    const results = classifyText('旅行时如何拍好美食', '数码相机和餐厅探店路线，这是一篇手机拍摄测评', systemCategories());
    expect(results.map((result) => result.categoryId)).toEqual(expect.arrayContaining(['cat-travel', 'cat-food', 'cat-digital']));
    expect(results.find((result) => result.categoryId === 'cat-food')?.evidence).toContain('餐厅');
  });

  it('不确定内容保留待分类', () => {
    expect(classifyText('一些零散想法', null, systemCategories())).toEqual([
      { categoryId: 'cat-other', score: 0, evidence: ['未命中已配置关键词'] },
    ]);
  });

  it('只有标题时不生成冒充正文的摘要', () => {
    const item = { id: 'x:1', title: '一个视频标题', text: null, contentVersion: 1 } as SourceItem;
    const excerpts = buildExcerpts(item);
    expect(excerpts).toHaveLength(1);
    expect(excerpts[0]?.sourceField).toBe('title');
    expect(excerpts[0]?.text).toContain('正文未获取');
  });

  it('摘录保留原文位置', () => {
    const text = '第一句话用于铺垫。第二句话包含具体使用体验。第三句话说明适用条件。';
    const item = { id: 'x:2', title: '体验', text, contentVersion: 3 } as SourceItem;
    const excerpts = buildExcerpts(item, null, ['适用条件']);
    expect(excerpts.some((excerpt) => text.slice(excerpt.start, excerpt.end).includes('适用条件'))).toBe(true);
    expect(excerpts.every((excerpt) => excerpt.contentVersion === 3)).toBe(true);
  });
});
