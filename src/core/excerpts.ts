import type { Excerpt, SourceItem } from './types';
import { normalizeText, nowIso, stableHash } from './utils';

export const EXCERPT_ALGORITHM_VERSION = 'extractive-1.0.0';

function sentencesWithOffsets(text: string): Array<{ text: string; start: number; end: number }> {
  const result: Array<{ text: string; start: number; end: number }> = [];
  const matcher = /[^。！？!?\n]+[。！？!?]?/g;
  for (const match of text.matchAll(matcher)) {
    const value = normalizeText(match[0]);
    if (value.length < 6 || match.index === undefined) continue;
    result.push({ text: value.slice(0, 180), start: match.index, end: match.index + match[0].length });
  }
  return result;
}

export function buildExcerpts(item: SourceItem, entityId: string | null = null, entityTerms: string[] = []): Excerpt[] {
  const at = nowIso();
  if (!item.text) {
    return [{
      id: `${item.id}|${entityId ?? 'general'}|title`,
      itemId: item.id,
      entityId,
      sourceField: 'title',
      text: `${item.title} · 正文未获取，暂不能形成内容摘要`,
      start: 0,
      end: item.title.length,
      contentVersion: item.contentVersion,
      algorithmVersion: EXCERPT_ALGORITHM_VERSION,
      createdAt: at,
    }];
  }

  const sentences = sentencesWithOffsets(item.text);
  const ranked = sentences
    .map((sentence, index) => ({
      ...sentence,
      score: entityTerms.reduce((score, term) => score + (sentence.text.includes(term) ? 3 : 0), 0) + Math.max(0, 3 - index * 0.1),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .sort((left, right) => left.start - right.start);

  return ranked.map((sentence) => ({
    id: `${item.id}|${entityId ?? 'general'}|${stableHash(`${sentence.start}:${sentence.text}`)}`,
    itemId: item.id,
    entityId,
    sourceField: 'text',
    text: sentence.text,
    start: sentence.start,
    end: sentence.end,
    contentVersion: item.contentVersion,
    algorithmVersion: EXCERPT_ALGORITHM_VERSION,
    createdAt: at,
  }));
}
