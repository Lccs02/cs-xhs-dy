import type { WorkbenchDatabase } from './db';
import { systemCategories, toItemCategories, classifyText } from './classification';
import { buildExcerpts } from './excerpts';
import type { Entity, ItemEntity, SourceItem } from './types';
import { nowIso, tokenizeChinese, stableHash } from './utils';

const demoRows = [
  ['xiaohongshu', 'xhs-01', '广州东山口散步路线：老街、书店与咖啡', '从署前路开始，避开周末午后高峰。三家小店步行可达，雨天石板路较滑。', 'text_available'],
  ['douyin', 'dy-01', '东山口半日路线实测', '工作日上午人少，咖啡店十点后陆续开门。建议从地铁口向北走。', 'text_partial'],
  ['xiaohongshu', 'xhs-02', '开放式耳机通勤一个月体验', '地铁环境下低频会被盖住，但步行和办公室使用更舒服。眼镜腿冲突不明显。', 'text_available'],
  ['douyin', 'dy-02', '开放式耳机别只看漏音', '视频描述：三档音量做了漏音对比，安静办公室建议控制在六成以内。', 'text_partial'],
  ['xiaohongshu', 'xhs-03', '番茄牛腩的稳定做法', '牛腩先焯水，番茄分两次加入。最后二十分钟再放盐，汤会更清甜。', 'text_available'],
  ['douyin', 'dy-03', '一锅到底番茄牛腩', null, 'metadata_only'],
  ['xiaohongshu', 'xhs-04', '信息检索课程笔记', '先明确问题，再记录关键词组合与排除词。每条结论保留来源和检索日期。', 'text_available'],
  ['douyin', 'dy-04', '十分钟拉伸跟练', '视频描述：久坐后的肩颈与髋部拉伸，不适合急性疼痛期。', 'text_partial'],
] as const;

export async function seedDemo(database: WorkbenchDatabase): Promise<void> {
  if ((await database.items.count()) > 0) return;
  const at = nowIso();
  const categories = systemCategories(at);
  await database.categories.bulkPut(categories);
  const items: SourceItem[] = demoRows.map(([platform, stableItemId, title, text, textStatus], index) => ({
    id: `${platform}:${stableItemId}`,
    platform,
    stableItemId,
    canonicalUrl: platform === 'xiaohongshu' ? `https://www.xiaohongshu.com/explore/demo${index}` : `https://www.douyin.com/video/${90000000 + index}`,
    navigationUrl: platform === 'xiaohongshu' ? `https://www.xiaohongshu.com/explore/demo${index}` : `https://www.douyin.com/video/${90000000 + index}`,
    title,
    author: ['纸飞机', '向晚', '木棉', '七号样本'][index % 4] ?? null,
    publishedAt: new Date(Date.now() - index * 86_400_000 * 4).toISOString(),
    collectedAt: null,
    importedAt: at,
    lastSeenAt: at,
    text,
    textStatus,
    textScope: textStatus === 'text_partial' ? '合成演示：仅模拟视频描述或列表可见文字' : text ? '合成演示正文' : null,
    contentHash: text ? stableHash(text) : null,
    metadataHash: stableHash(title),
    contentVersion: 1,
    adapterVersion: 'synthetic-demo-1.0.0',
    active: true,
    activeState: 'active',
    searchTokens: tokenizeChinese(`${title} ${text ?? ''}`),
  }));
  await database.items.bulkPut(items);
  for (const item of items) {
    await database.itemCategories.bulkPut(toItemCategories(item, classifyText(item.title, item.text, categories), at));
    await database.excerpts.bulkPut(buildExcerpts(item));
  }
  const entities: Entity[] = [
    { id: 'entity-dongshankou', name: '东山口', type: 'place', aliases: ['东山口街区'], brand: null, model: null, city: '广州', store: null, createdAt: at, updatedAt: at },
    { id: 'entity-open-ear', name: '开放式耳机', type: 'product', aliases: ['OWS'], brand: null, model: null, city: null, store: null, createdAt: at, updatedAt: at },
    { id: 'entity-tomato-beef', name: '番茄牛腩', type: 'other', aliases: [], brand: null, model: null, city: null, store: null, createdAt: at, updatedAt: at },
  ];
  await database.entities.bulkPut(entities);
  const entityPairs: Array<[string, string]> = [
    ['xiaohongshu:xhs-01', 'entity-dongshankou'], ['douyin:dy-01', 'entity-dongshankou'],
    ['xiaohongshu:xhs-02', 'entity-open-ear'], ['douyin:dy-02', 'entity-open-ear'],
    ['xiaohongshu:xhs-03', 'entity-tomato-beef'], ['douyin:dy-03', 'entity-tomato-beef'],
  ];
  const links: ItemEntity[] = entityPairs.map(([itemId, entityId]) => ({ id: `${itemId}|${entityId}`, itemId, entityId, status: 'user_confirmed', score: null, evidence: ['合成演示人工关联'], locked: true, updatedAt: at }));
  await database.itemEntities.bulkPut(links);
}
