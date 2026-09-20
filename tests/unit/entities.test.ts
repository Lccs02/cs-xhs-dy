import { describe, expect, it } from 'vitest';
import { scoreEntityCandidate } from '../../src/core/entities';
import type { Entity } from '../../src/core/types';

const entity = (overrides: Partial<Entity>): Entity => ({
  id: crypto.randomUUID(), name: '示例对象', type: 'other', aliases: [], brand: null, model: null,
  city: null, store: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...overrides,
});

describe('对象候选评分', () => {
  it('名称和型号一致时提供候选证据', () => {
    const score = scoreEntityCandidate(entity({ name: 'Air One', model: 'A100' }), entity({ name: 'Air One 耳机', aliases: ['Air One'], model: 'A100' }));
    expect(score.blocked).toBe(false);
    expect(score.score).toBeGreaterThanOrEqual(80);
  });

  it('同名但不同门店或城市时阻止自动合并', () => {
    const score = scoreEntityCandidate(entity({ name: '山野咖啡', city: '广州', store: '东山店' }), entity({ name: '山野咖啡', city: '深圳', store: '南山店' }));
    expect(score.blocked).toBe(true);
    expect(score.conflicts).toEqual(expect.arrayContaining([expect.stringContaining('city'), expect.stringContaining('store')]));
  });

  it('相似但不同型号时阻止自动合并', () => {
    const score = scoreEntityCandidate(entity({ name: 'Example Pro', model: '2025' }), entity({ name: 'Example Pro', model: '2026' }));
    expect(score.blocked).toBe(true);
  });
});
