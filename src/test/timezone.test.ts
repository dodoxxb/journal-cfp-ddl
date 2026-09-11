import { describe, it, expect } from 'vitest';
import {
  getLocalTimeZone,
  formatInTimeZone,
  aoeLabel,
  deadlineTimeZones,
  AOE_HINT,
} from '../lib/timezone';

describe('timezone.ts', () => {
  it('getLocalTimeZone 返回非空时区名或 local 回退', () => {
    const tz = getLocalTimeZone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });

  it('formatInTimeZone 在指定时区格式化并带时区名', () => {
    const out = formatInTimeZone('2026-12-31T23:59:59Z', 'America/New_York');
    // 纽约冬季为 EST（UTC-5），23:59Z -> 18:59
    expect(out).toContain('America/New_York');
    expect(out).toContain('12-31');
    expect(out).toContain('18:59');
  });

  it('formatInTimeZone 对非法输入返回空串', () => {
    expect(formatInTimeZone('not-a-date', 'UTC')).toBe('');
  });

  it('aoeLabel 拼接日期与 AoE 标注', () => {
    expect(aoeLabel('2026-12-31')).toBe('2026-12-31 · AoE');
    expect(aoeLabel('')).toBe('AoE');
  });

  it('deadlineTimeZones 返回 AoE + 本地时区 + 提示', () => {
    const r = deadlineTimeZones('2026-12-31T23:59:59Z', '2026-12-31', 'Asia/Shanghai');
    expect(r).not.toBeNull();
    expect(r?.aoe).toBe('2026-12-31 · AoE');
    expect(r?.local).toContain('Asia/Shanghai');
    expect(r?.hint).toBe(AOE_HINT);
  });

  it('deadlineTimeZones 对滚动征稿（无截止日）返回 null', () => {
    expect(deadlineTimeZones('', '', 'UTC')).toBeNull();
  });
});
