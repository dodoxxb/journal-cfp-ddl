import { describe, expect, it } from 'vitest';

import { liveFacetCounts, DEFAULT_FILTER_STATE } from '../lib/filters';
import type { CFPRecord, CfpFilterState, JournalMetric } from '../lib/types';

const NOW = Date.parse('2026-09-11T00:00:00Z');

function rec(
  id: string,
  over: Partial<Pick<CFPRecord, 'p' | 'c' | 'ty' | 'is' | 'rolling'>>,
): CFPRecord {
  return {
    id,
    t: `title ${id}`,
    j: `journal ${id}`,
    p: over.p ?? 'MDPI',
    d: '2026-10-01',
    dt: '2026-10-01T23:59:59Z',
    u: `https://example.com/${id}`,
    ty: over.ty ?? 'special_issue',
    c: over.c ?? 'Computer Science',
    ad: '',
    g: [],
    x: '',
    jn: 1,
    ...(over.is ? { is: over.is } : {}),
    ...(over.rolling ? { rolling: true } : {}),
  };
}

const RECORDS: CFPRecord[] = [
  rec('a', { p: 'MDPI', c: 'Computer Science', is: '11111111' }),
  rec('b', { p: 'MDPI', c: 'Medicine', is: '22222222' }),
  rec('c', { p: 'Springer', c: 'Computer Science', is: '33333333' }),
  rec('d', { p: 'Springer', c: 'Medicine' }),
  rec('e', { p: 'Wiley', c: 'Physics', ty: 'cfp' }),
];

const META = new Map<string, JournalMetric>([
  ['11111111', { q: 'Q1' } as JournalMetric],
  ['22222222', { q: 'Q2' } as JournalMetric],
  ['33333333', { q: 'Q1' } as JournalMetric],
]);

const base: CfpFilterState = { ...DEFAULT_FILTER_STATE, range: 'all' };

describe('liveFacetCounts', () => {
  it('无筛选时按字段真实分布计数', () => {
    const c = liveFacetCounts(RECORDS, base, NOW, META);
    expect(c.publishers.get('MDPI')).toBe(2);
    expect(c.publishers.get('Springer')).toBe(2);
    expect(c.publishers.get('Wiley')).toBe(1);
    expect(c.categories.get('Computer Science')).toBe(2);
    expect(c.types.get('special_issue')).toBe(4);
    expect(c.types.get('cfp')).toBe(1);
    expect(c.quartiles.get('Q1')).toBe(2);
    expect(c.quartiles.get('Q2')).toBe(1);
  });

  it('本组自身选择不影响本组计数（可多选累加）', () => {
    const c = liveFacetCounts(
      RECORDS,
      { ...base, publishers: ['MDPI'] },
      NOW,
      META,
    );
    // 已选 MDPI 时，Springer 仍显示 2 —— 用户可继续叠加第二个出版社
    expect(c.publishers.get('Springer')).toBe(2);
  });

  it('其它组的筛选会传导到本组计数', () => {
    const c = liveFacetCounts(
      RECORDS,
      { ...base, categories: ['Computer Science'] },
      NOW,
      META,
    );
    // 学科限定为 CS 后，Wiley 命中 0 —— 该芯片应被禁用，避免点进去空列表
    expect(c.publishers.get('MDPI')).toBe(1);
    expect(c.publishers.get('Springer')).toBe(1);
    expect(c.publishers.get('Wiley') ?? 0).toBe(0);
  });

  it('核心不变量：芯片显示 N 条，点下去就真的得到 N 条', () => {
    const c = liveFacetCounts(RECORDS, base, NOW, META);

    for (const [value, n] of c.publishers) {
      expect(RECORDS.filter((r) => r.p === value).length, `出版社 ${value}`).toBe(n);
    }
    for (const [value, n] of c.categories) {
      expect(RECORDS.filter((r) => r.c === value).length, `学科 ${value}`).toBe(n);
    }
    for (const [value, n] of c.types) {
      expect(RECORDS.filter((r) => r.ty === value).length, `类型 ${value}`).toBe(n);
    }
    for (const [value, n] of c.quartiles) {
      const hit = RECORDS.filter((r) => (r.is ? META.get(r.is)?.q : undefined) === value).length;
      expect(hit, `分区 ${value}`).toBe(n);
    }
  });

  it('时间范围筛选同样传导到分面计数', () => {
    const soon = liveFacetCounts(RECORDS, { ...base, range: 'soon' }, NOW, META);
    // 全部截止日为 2026-10-01，距 2026-09-11 约 20 天，不在「7 天内」窗口
    expect(soon.publishers.get('MDPI') ?? 0).toBe(0);

    const quarter = liveFacetCounts(RECORDS, { ...base, range: 'quarter' }, NOW, META);
    expect(quarter.publishers.get('MDPI')).toBe(2);
  });
});
