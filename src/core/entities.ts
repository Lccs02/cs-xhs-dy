import type { Entity } from './types';
import { normalizeText } from './utils';

export interface EntityCandidateScore {
  score: number;
  evidence: string[];
  blocked: boolean;
  conflicts: string[];
}

const normalized = (value: string | null) => (value ? normalizeText(value).toLocaleLowerCase('zh-CN') : null);

export function scoreEntityCandidate(left: Entity, right: Entity): EntityCandidateScore {
  const evidence: string[] = [];
  const conflicts: string[] = [];
  let score = 0;
  const leftNames = [left.name, ...left.aliases].map((value) => normalized(value));
  const rightNames = [right.name, ...right.aliases].map((value) => normalized(value));
  if (leftNames.some((name) => name && rightNames.includes(name))) {
    score += 55;
    evidence.push('名称或别名完全一致');
  } else if (leftNames.some((name) => name && rightNames.some((other) => other && (name.includes(other) || other.includes(name))))) {
    score += 24;
    evidence.push('名称存在包含关系');
  }

  for (const field of ['brand', 'model', 'city', 'store'] as const) {
    const a = normalized(left[field]);
    const b = normalized(right[field]);
    if (a && b && a === b) {
      score += field === 'model' ? 28 : 12;
      evidence.push(`${field} 一致`);
    } else if (a && b && a !== b) {
      conflicts.push(`${field} 冲突：${left[field]} / ${right[field]}`);
    }
  }

  const hardConflict = conflicts.some((conflict) => conflict.startsWith('model') || conflict.startsWith('city') || conflict.startsWith('store'));
  return { score: Math.min(score, 100), evidence, blocked: hardConflict, conflicts };
}
