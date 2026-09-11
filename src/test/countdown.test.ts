import { describe, it, expect } from 'vitest';
import { countdownState, isNearDeadline } from '../lib/countdown';

const NOW = Date.parse('2026-09-11T12:00:00Z');
const dt = (days: number, h = 0, m = 0, s = 0) =>
  new Date(NOW + (days * 86_400 + h * 3600 + m * 60 + s) * 1000).toISOString();

describe('countdown.ts', () => {
  it('远（>30 天）：给「还有 N 天」且不 tick', () => {
    const r = countdownState(dt(45), NOW, false);
    expect(r.tier).toBe('far');
    expect(r.text).toBe('还有 45 天');
    expect(r.label).toBe('时间充裕');
    expect(r.tick).toBe(false);
  });

  it('中（1–30 天）：给「X 天 Y 小时」', () => {
    const r = countdownState(dt(5, 15), NOW, false);
    expect(r.tier).toBe('mid');
    expect(r.text).toBe('5 天 15 小时');
    expect(r.label).toBe('30 天内');
    expect(r.tick).toBe(false);
  });

  it('中（≤3 天）：标签为「3 天内」', () => {
    const r = countdownState(dt(2, 10), NOW, false);
    expect(r.tier).toBe('mid');
    expect(r.label).toBe('3 天内');
  });

  it('近（<24 小时）：秒级 HH:MM:SS 且 tick=true', () => {
    // 约 19 小时 11 分 32 秒后
    const target = NOW + (19 * 3600 + 11 * 60 + 32) * 1000;
    const r = countdownState(new Date(target).toISOString(), NOW, false);
    expect(r.tier).toBe('near');
    expect(r.text).toBe('19:11:32');
    expect(r.label).toBe('24 小时内');
    expect(r.tick).toBe(true);
  });

  it('已过期：标签「已过期」', () => {
    const r = countdownState(dt(-3), NOW, false);
    expect(r.tier).toBe('expired');
    expect(r.label).toBe('已过期');
    expect(r.text).toBe('3 天前截止');
    expect(r.tick).toBe(false);
  });

  it('滚动征稿：长期有效，不 tick', () => {
    const r = countdownState('', NOW, true);
    expect(r.tier).toBe('rolling');
    expect(r.text).toBe('长期开放');
    expect(r.label).toBe('长期有效');
    expect(r.tick).toBe(false);
  });

  it('日期缺失：na 档', () => {
    const r = countdownState('', NOW, false);
    expect(r.tier).toBe('na');
    expect(r.label).toBe('日期待定');
  });

  it('isNearDeadline 仅在 <24h 且未过期时为真', () => {
    expect(isNearDeadline(new Date(NOW + 3600 * 1000).toISOString(), NOW, false)).toBe(true);
    expect(isNearDeadline(new Date(NOW + 3 * 86_400_000).toISOString(), NOW, false)).toBe(false);
    expect(isNearDeadline(new Date(NOW - 1000).toISOString(), NOW, false)).toBe(false);
    expect(isNearDeadline('', NOW, true)).toBe(false);
  });
});
