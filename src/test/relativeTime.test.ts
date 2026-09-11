import { describe, it, expect } from 'vitest';
import { relativeTime, formatAbsoluteTime } from '../lib/relativeTime';

const NOW = Date.parse('2026-09-11T12:00:00Z');
const ago = (ms: number) => NOW - ms;

describe('relativeTime.ts', () => {
  it('不足 1 分钟：刚刚', () => {
    expect(relativeTime(ago(30 * 1000), NOW)).toBe('刚刚');
  });

  it('不足 1 小时：N 分钟前', () => {
    expect(relativeTime(ago(5 * 60 * 1000), NOW)).toBe('5 分钟前');
  });

  it('不足 24 小时：N 小时前', () => {
    expect(relativeTime(ago(3 * 3600 * 1000), NOW)).toBe('3 小时前');
  });

  it('不足 30 天：N 天前', () => {
    expect(relativeTime(ago(2 * 86_400_000), NOW)).toBe('2 天前');
  });

  it('不足 12 个月：N 个月前', () => {
    expect(relativeTime(ago(60 * 86_400_000), NOW)).toBe('2 个月前');
  });

  it('超过 12 个月：N 年前', () => {
    expect(relativeTime(ago(400 * 86_400_000), NOW)).toBe('1 年前');
  });

  it('未来时间（差为负）按 0 处理为刚刚', () => {
    expect(relativeTime(NOW + 1000, NOW)).toBe('刚刚');
  });

  it('formatAbsoluteTime 回退到原串对非法输入', () => {
    expect(formatAbsoluteTime('bad')).toBe('bad');
    expect(typeof formatAbsoluteTime('2026-09-11T12:00:00Z')).toBe('string');
  });
});
