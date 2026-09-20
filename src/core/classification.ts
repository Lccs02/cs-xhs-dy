import type { Category, ItemCategory, SourceItem } from './types';
import { normalizeText, nowIso } from './utils';

export const BASIC_CLASSIFIER_VERSION = 'rules-zh-1.0.0';

const CATEGORY_PRESETS: Array<Pick<Category, 'id' | 'name' | 'color' | 'keywords'>> = [
  { id: 'cat-travel', name: '旅行', color: '#2f766f', keywords: ['旅行', '景点', '酒店', '民宿', '攻略', '路线', '城市', '机票', '打卡'] },
  { id: 'cat-food', name: '美食', color: '#c9633c', keywords: ['美食', '餐厅', '咖啡', '烘焙', '菜谱', '探店', '好吃', '火锅', '甜品'] },
  { id: 'cat-digital', name: '数码', color: '#466c9e', keywords: ['手机', '电脑', '相机', '耳机', '数码', '显示器', '键盘', '芯片', '测评'] },
  { id: 'cat-study', name: '学习', color: '#7b65a1', keywords: ['学习', '课程', '读书', '论文', '英语', '考试', '教程', '笔记', '知识'] },
  { id: 'cat-home', name: '家居', color: '#89734f', keywords: ['家居', '装修', '收纳', '家具', '清洁', '厨房', '卧室', '软装'] },
  { id: 'cat-sport', name: '运动', color: '#497f50', keywords: ['运动', '健身', '跑步', '瑜伽', '骑行', '徒步', '训练', '球鞋'] },
];

export function systemCategories(at = nowIso()): Category[] {
  return [
    ...CATEGORY_PRESETS.map((category) => ({ ...category, isSystem: true, createdAt: at, updatedAt: at })),
    { id: 'cat-other', name: '待分类', color: '#77736b', keywords: [], isSystem: true, createdAt: at, updatedAt: at },
  ];
}

export interface ClassificationResult {
  categoryId: string;
  score: number;
  evidence: string[];
}

export function classifyText(title: string, text: string | null, categories: Category[]): ClassificationResult[] {
  const haystack = normalizeText(`${title} ${text ?? ''}`).toLocaleLowerCase('zh-CN');
  const results = categories
    .filter((category) => category.id !== 'cat-other')
    .map((category) => {
      const evidence = category.keywords.filter((keyword) => haystack.includes(keyword.toLocaleLowerCase('zh-CN')));
      const titleHits = evidence.filter((keyword) => title.includes(keyword)).length;
      const score = Math.min(100, evidence.length * 18 + titleHits * 14);
      return { categoryId: category.id, score, evidence: evidence.slice(0, 5) };
    })
    .filter((result) => result.score >= 24)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  return results.length > 0 ? results : [{ categoryId: 'cat-other', score: 0, evidence: ['未命中已配置关键词'] }];
}

export function toItemCategories(item: SourceItem, results: ClassificationResult[], at = nowIso()): ItemCategory[] {
  return results.map((result) => ({
    id: `${item.id}|${result.categoryId}`,
    itemId: item.id,
    categoryId: result.categoryId,
    source: 'auto',
    score: result.score,
    evidence: result.evidence,
    locked: false,
    updatedAt: at,
  }));
}
