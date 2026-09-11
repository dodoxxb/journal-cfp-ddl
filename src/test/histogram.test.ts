import { describe, it, expect } from 'vitest';
import { aggregateHistogramCounts } from '../lib/histogram';
import type { CfpIndex } from '../lib/types';

function makeIndex(withFacetMonths: boolean): CfpIndex {
  const base: CfpIndex = {
    generated_at: '2026-09-15T00:00:00Z',
    window_months: 6,
    cutoff: '2026-03-15T00:00:00Z',
    total: 1000,
    publishers: [
      { name: 'MDPI', count: 600 },
      { name: 'Elsevier', count: 200 },
    ],
    categories: [{ name: 'Computer Science', count: 400 }],
    types: [
      { name: 'special_issue', count: 900 },
      { name: 'collection', count: 100 },
    ],
    months: [
      { name: '2026-09', file: 'shards/2026-09.json', count: 300 },
      { name: '2026-10', file: 'shards/2026-10.json', count: 200 },
      { name: '2026-11', file: 'shards/2026-11.json', count: 100 },
    ],
  };
  if (withFacetMonths) {
    base.facet_months = {
      publisher: {
        MDPI: { '2026-09': 250, '2026-10': 180 },
        Elsevier: { '2026-10': 20, '2026-11': 80 },
      },
      category: {
        'Computer Science': { '2026-09': 150, '2026-10': 120, '2026-11': 60 },
      },
      type: {
        special_issue: { '2026-09': 500, '2026-10': 400 },
        collection: { '2026-09': 100 },
      },
    };
  }
  return base;
}

describe('aggregateHistogramCounts', () => {
  it('无筛选时返回 index.months 的精确月度计数', () => {
    const idx = makeIndex(true);
    const m = aggregateHistogramCounts(idx, { publishers: [], categories: [], types: [] });
    expect(m).not.toBeNull();
    expect(m!.get('2026-09')).toBe(300);
    expect(m!.get('2026-10')).toBe(200);
    expect(m!.get('2026-11')).toBe(100);
    expect(m!.size).toBe(3);
  });

  it('单维度筛选：未命中月份计数为 0，命中月份取该维度计数', () => {
    const idx = makeIndex(true);
    const m = aggregateHistogramCounts(idx, { publishers: ['Elsevier'], categories: [], types: [] });
    expect(m).not.toBeNull();
    // Elsevier 仅在 2026-10 / 2026-11 有数据
    expect(m!.get('2026-09')).toBe(0);
    expect(m!.get('2026-10')).toBe(20);
    expect(m!.get('2026-11')).toBe(80);
  });

  it('多维度交集：取月份交集，柱高取各维度月度计数最小值', () => {
    const idx = makeIndex(true);
    // publisher=MDPI(09:250,10:180) ∩ category=CS(09:150,10:120,11:60) → 09,10；min
    const m = aggregateHistogramCounts(idx, { publishers: ['MDPI'], categories: ['Computer Science'], types: [] });
    expect(m).not.toBeNull();
    expect(m!.get('2026-09')).toBe(150); // min(250,150)
    expect(m!.get('2026-10')).toBe(120); // min(180,120)
    expect(m!.get('2026-11')).toBe(0); // MDPI 在 11 无数据 → 交集外
  });

  it('facet_months 缺失且筛选激活时返回 null（调用方降级）', () => {
    const idx = makeIndex(false);
    expect(aggregateHistogramCounts(idx, { publishers: ['MDPI'], categories: [], types: [] })).toBeNull();
  });

  it('降级路径：无 facet_months 且无筛选仍返回精确计数', () => {
    const idx = makeIndex(false);
    const m = aggregateHistogramCounts(idx, { publishers: [], categories: [], types: [] });
    expect(m).not.toBeNull();
    expect(m!.get('2026-09')).toBe(300);
  });
});
