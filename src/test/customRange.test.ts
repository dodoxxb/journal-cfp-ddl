import { describe, expect, it } from 'vitest';

import {
  CUSTOM_DAYS_MAX,
  CUSTOM_DAYS_MIN,
  DEFAULT_FILTER_STATE,
  filterRecords,
  normalizeCustomDays,
  rangeMaxDays,
} from '../lib/filters';
import { parseFilterState, serializeFilterState } from '../lib/urlState';
import type { CFPRecord, CfpFilterState } from '../lib/types';

const NOW = Date.parse('2026-09-11T00:00:00Z');

/** 生成一条「距今 n 天截止」的记录 */
function recIn(id: string, n: number): CFPRecord {
  const dt = new Date(NOW + n * 86_400_000).toISOString();
  return {
    id,
    t: `title ${id}`,
    j: `journal ${id}`,
    p: 'MDPI',
    d: dt.slice(0, 10),
    dt,
    u: `https://example.com/${id}`,
    ty: 'special_issue',
    c: 'Computer Science',
    ad: '',
    g: [],
    x: '',
    jn: 1,
  };
}

const RECORDS = [recIn('a', 3), recIn('b', 20), recIn('c', 45), recIn('d', 200)];

describe('normalizeCustomDays', () => {
  it('把越界值收敛到合法区间', () => {
    expect(normalizeCustomDays(0)).toBe(CUSTOM_DAYS_MIN);
    expect(normalizeCustomDays(-5)).toBe(CUSTOM_DAYS_MIN);
    expect(normalizeCustomDays(99999)).toBe(CUSTOM_DAYS_MAX);
  });

  it('非法输入回退默认 30', () => {
    expect(normalizeCustomDays(Number.NaN)).toBe(30);
    expect(normalizeCustomDays(Number.POSITIVE_INFINITY)).toBe(30);
  });

  it('小数取整', () => {
    expect(normalizeCustomDays(7.6)).toBe(8);
    expect(normalizeCustomDays(7.2)).toBe(7);
  });
});

describe('rangeMaxDays', () => {
  it('固定档位沿用原映射', () => {
    expect(rangeMaxDays({ ...DEFAULT_FILTER_STATE, range: 'all' })).toBeNull();
    expect(rangeMaxDays({ ...DEFAULT_FILTER_STATE, range: 'soon' })).toBe(7);
    expect(rangeMaxDays({ ...DEFAULT_FILTER_STATE, range: 'month' })).toBe(30);
    expect(rangeMaxDays({ ...DEFAULT_FILTER_STATE, range: 'quarter' })).toBe(90);
  });

  it('custom 档取归一化后的 customDays', () => {
    expect(rangeMaxDays({ ...DEFAULT_FILTER_STATE, range: 'custom', customDays: 42 })).toBe(42);
    // 脏数据也必须先归一化，而不是直接透传
    expect(rangeMaxDays({ ...DEFAULT_FILTER_STATE, range: 'custom', customDays: -3 })).toBe(1);
  });
});

describe('filterRecords 自定义天数', () => {
  it('「N 天内」真的只留下 N 天内截止的条目', () => {
    const f: CfpFilterState = { ...DEFAULT_FILTER_STATE, range: 'custom', customDays: 30 };
    const hit = filterRecords(RECORDS, f, NOW).map((r) => r.id).sort();
    expect(hit).toEqual(['a', 'b']); // 3 天 / 20 天；45 天与 200 天被排除
  });

  it('滚动征稿不受自定义天数限制', () => {
    const rolling = { ...recIn('r', 999), rolling: true };
    const f: CfpFilterState = { ...DEFAULT_FILTER_STATE, range: 'custom', customDays: 7 };
    const hit = filterRecords([...RECORDS, rolling], f, NOW).map((r) => r.id);
    expect(hit).toContain('r');
  });
});

describe('URL 往返', () => {
  it('custom + days 能完整往返', () => {
    const state: CfpFilterState = { ...DEFAULT_FILTER_STATE, range: 'custom', customDays: 42 };
    const qs = serializeFilterState(state);
    expect(qs).toContain('range=custom');
    expect(qs).toContain('days=42');
    const back = parseFilterState(qs);
    expect(back.range).toBe('custom');
    expect(back.customDays).toBe(42);
  });

  it('非 custom 档不会写入 days 参数', () => {
    const qs = serializeFilterState({ ...DEFAULT_FILTER_STATE, range: 'quarter' });
    expect(qs).toContain('range=quarter');
    expect(qs).not.toContain('days=');
  });

  it('脏 days 参数不会让页面崩（回退默认）', () => {
    expect(parseFilterState('range=custom&days=abc').customDays).toBe(30);
    expect(parseFilterState('range=custom&days=-9').customDays).toBe(CUSTOM_DAYS_MIN);
    expect(parseFilterState('range=custom').customDays).toBe(30);
  });
});
