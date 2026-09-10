import { describe, it, expect, beforeEach } from 'vitest';
import {
  selectNextMonths,
  selectMonthsForFacets,
  selectInitialMonths,
  listMonthKeys,
  monthKeyOf,
  resetShardCache,
} from '../lib/dataLoader';
import type { CfpIndex } from '../lib/types';

/** 构造带 facet_months 的索引（模拟数据层生成，本地 index.json 当前还没有该字段） */
function makeIndex(withFacetMonths: boolean): CfpIndex {
  const base: CfpIndex = {
    generated_at: '2026-09-15T00:00:00Z',
    window_months: 6,
    cutoff: '2026-03-15T00:00:00Z',
    total: 1000,
    publishers: [
      { name: 'ACS', count: 4 },
      { name: 'MDPI', count: 600 },

      { name: 'OUP', count: 1 },
    ],
    categories: [{ name: 'Computer Science', count: 400 }],
    types: [
      { name: 'special_issue', count: 900 },
      { name: 'collection', count: 100 },
    ],
    months: [
      { name: '2026-07', file: 'shards/2026-07.json', count: 10 },
      { name: '2026-08', file: 'shards/2026-08.json', count: 20 },
      { name: '2026-09', file: 'shards/2026-09.json', count: 300 },
      { name: '2026-10', file: 'shards/2026-10.json', count: 300 },
      { name: '2026-11', file: 'shards/2026-11.json', count: 200 },
      { name: '2026-12', file: 'shards/2026-12.json', count: 170 },
    ],
  };
  if (withFacetMonths) {
    base.facet_months = {
      publisher: {
        ACS: { '2026-08': 4 },
        MDPI: { '2026-09': 400, '2026-10': 200 },
        OUP: { '2026-08': 1 },
      },
      category: {
        'Computer Science': { '2026-09': 400, '2026-10': 200 },
      },
      type: {
        special_issue: { '2026-09': 500, '2026-10': 400 },
        collection: { '2026-09': 100 },
      },
    };
  }
  return base;
}

/** 固定“当前月”为 2026-09，便于断言过去/未来边界 */
const NOW = new Date('2026-09-15T00:00:00Z');

beforeEach(() => resetShardCache());

describe('selectMonthsForFacets', () => {
  it('无筛选时返回空数组（不触发自动扩展）', () => {
    const idx = makeIndex(true);
    expect(selectMonthsForFacets(idx, {})).toEqual([]);
    expect(selectMonthsForFacets(idx, { publishers: [], categories: [], types: [] })).toEqual([]);
  });

  it('facet_months 缺失时降级返回 null', () => {
    const idx = makeIndex(false);
    expect(selectMonthsForFacets(idx, { publishers: ['ACS'] })).toBeNull();
  });

  it('单维度：选中 ACS 返回其唯一数据月份（已过期）', () => {
    const idx = makeIndex(true);
    expect(selectMonthsForFacets(idx, { publishers: ['ACS'] }, NOW)).toEqual(['2026-08']);
  });

  it('单维度：选中 MDPI 返回其数据月份（未来）', () => {
    const idx = makeIndex(true);
    expect(selectMonthsForFacets(idx, { publishers: ['MDPI'] }, NOW)).toEqual(['2026-09', '2026-10']);
  });

  it('多维度交集：publisher=MDPI 且 type=special_issue 取交集', () => {
    const idx = makeIndex(true);
    // MDPI: 2026-09,2026-10；special_issue: 2026-09,2026-10 → 交集两月
    expect(selectMonthsForFacets(idx, { publishers: ['MDPI'], types: ['special_issue'] }, NOW)).toEqual([
      '2026-09',
      '2026-10',
    ]);
  });

  it('多维度交集：publisher=MDPI 且 type=collection 交集仅 2026-09', () => {
    const idx = makeIndex(true);
    // MDPI: 2026-09,2026-10；collection: 2026-09 → 交集 2026-09
    expect(selectMonthsForFacets(idx, { publishers: ['MDPI'], types: ['collection'] }, NOW)).toEqual(['2026-09']);
  });

  it('多维度交集无重叠时返回空数组', () => {
    const idx = makeIndex(true);
    // ACS 仅 2026-08；special_issue 仅 2026-09/2026-10 → 无交集
    expect(selectMonthsForFacets(idx, { publishers: ['ACS'], types: ['special_issue'] }, NOW)).toEqual([]);
  });

  it('含过去月份：按与当前月距离升序、同等距离未来优先', () => {
    // 构造一个同时含过去与未来候选的索引
    const custom: CfpIndex = {
      ...makeIndex(true),
      months: [
        { name: '2026-08', file: 'shards/2026-08.json', count: 1 },
        { name: '2026-09', file: 'shards/2026-09.json', count: 1 },
        { name: '2026-10', file: 'shards/2026-10.json', count: 1 },
        { name: '2026-12', file: 'shards/2026-12.json', count: 1 },
      ],
    };
    custom.facet_months = {
      publisher: {
        // 2026-08(past, 距离1)、2026-10(future, 距离1)、2026-12(future, 距离3)
        X: { '2026-08': 1, '2026-10': 1, '2026-12': 1 },
      },
      category: {},
      type: {},
    };
    // 距离升序：2026-08 与 2026-10 同为距离 1，未来(10)优先于过去(08)，然后 2026-12
    expect(selectMonthsForFacets(custom, { publishers: ['X'] }, NOW)).toEqual([
      '2026-10',
      '2026-08',
      '2026-12',
    ]);
  });

  it('只保留索引中真实存在的月份', () => {
    const idx = makeIndex(true);
    // ACS 数据在 2026-08，索引 months 包含 2026-08 → 返回；若索引不含该月则被过滤
    expect(listMonthKeys(idx)).toContain('2026-08');
    expect(selectMonthsForFacets(idx, { publishers: ['ACS'] }, NOW)).toEqual(['2026-08']);
  });
});

describe('selectNextMonths', () => {
  it('默认(includePast=false) 只返回当前月及未来未加载月份', () => {
    const idx = makeIndex(true);
    const loaded = new Set(['2026-09']);
    // 当前月 2026-09，未来未加载：2026-10,2026-11,2026-12（2026-07/08 为过去，被过滤）
    expect(selectNextMonths(idx, loaded, NOW, 100)).toEqual(['2026-10', '2026-11', '2026-12']);
  });

  it('includePast=true 在末尾追加按时间倒序的过去月份', () => {
    const idx = makeIndex(true);
    const loaded = new Set(['2026-09']);
    // 未来：2026-10,2026-11,2026-12；过去未加载：2026-08,2026-07（倒序）
    expect(selectNextMonths(idx, loaded, NOW, 100, true)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      '2026-08',
      '2026-07',
    ]);
  });

  it('includePast=true 仅取未加载的过去月份（已加载的不重复）', () => {
    const idx = makeIndex(true);
    const loaded = new Set(['2026-09', '2026-08']);
    expect(selectNextMonths(idx, loaded, NOW, 100, true)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
      '2026-07',
    ]);
  });

  it('受 count 限制：includePast 时仍先给未来再给过去', () => {
    const idx = makeIndex(true);
    const loaded = new Set(['2026-09']);
    expect(selectNextMonths(idx, loaded, NOW, 2, true)).toEqual(['2026-10', '2026-11']);
  });

  it('完全向后兼容：签名保持不变（不传 includePast 仍编译/运行）', () => {
    const idx = makeIndex(true);
    const loaded = new Set(['2026-09']);
    // 默认 count = LOAD_MORE_MONTH_SPAN = 2，未来未加载月份按序前 2 个
    expect(selectNextMonths(idx, loaded, NOW)).toEqual(['2026-10', '2026-11']);
    expect(monthKeyOf(NOW)).toBe('2026-09');
    expect(selectInitialMonths(idx, NOW).length).toBeGreaterThan(0);
  });
});
