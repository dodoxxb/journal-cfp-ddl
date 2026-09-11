import { describe, it, expect } from 'vitest';
import { diversifyByPublisher } from '../lib/quota';
import type { CFPRecord } from '../lib/types';

function rec(id: string, p: string, dayOffset: number): CFPRecord {
  const d = new Date(Date.parse('2026-09-11T23:59:59Z') + dayOffset * 86_400_000).toISOString();
  return {
    id,
    t: `Title ${id}`,
    j: `Journal ${id}`,
    p,
    d: d.slice(0, 10),
    dt: d,
    u: `https://example.com/${id}`,
    ty: 'special_issue',
    c: 'Computer Science',
    ad: '',
    g: [],
    x: '',
    jn: 1,
  };
}

describe('quota.ts', () => {
  it('不丢记录、数量一致', () => {
    const records = [
      rec('1', 'MDPI', 1),
      rec('2', 'MDPI', 2),
      rec('3', 'Springer', 3),
      rec('4', 'Elsevier', 4),
    ];
    const out = diversifyByPublisher(records, (r) => r.p, (r) => r.dt, {
      pageSize: 30,
      maxFraction: 0.6,
    });
    expect(out.map((r) => r.id).sort()).toEqual(['1', '2', '3', '4']);
  });

  it('每页单出版社不超过配额上限（多样性充足时）', () => {
    // 12 条 MDPI + 12 条 Springer + 12 条 Elsevier，pageSize=30，maxFraction≈0.33 → cap=10
    const records: CFPRecord[] = [];
    for (let i = 0; i < 12; i += 1) records.push(rec(`m${i}`, 'MDPI', i));
    for (let i = 0; i < 12; i += 1) records.push(rec(`s${i}`, 'Springer', 100 + i));
    for (let i = 0; i < 12; i += 1) records.push(rec(`e${i}`, 'Elsevier', 200 + i));

    const out = diversifyByPublisher(records, (r) => r.p, (r) => r.dt, {
      pageSize: 30,
      maxFraction: 1 / 3,
    });
    expect(out).toHaveLength(36);

    const firstPage = out.slice(0, 30);
    const mdpiInFirst = firstPage.filter((r) => r.p === 'MDPI').length;
    expect(mdpiInFirst).toBeLessThanOrEqual(10);
  });

  it('单一出版社占绝对多数时，少量出版社仍被前置展示（保证多样性）', () => {
    // 40 条 MDPI + 5 条 Springer + 5 条 Elsevier
    const records: CFPRecord[] = [];
    for (let i = 0; i < 40; i += 1) records.push(rec(`m${i}`, 'MDPI', i));
    for (let i = 0; i < 5; i += 1) records.push(rec(`s${i}`, 'Springer', 100 + i));
    for (let i = 0; i < 5; i += 1) records.push(rec(`e${i}`, 'Elsevier', 200 + i));

    const out = diversifyByPublisher(records, (r) => r.p, (r) => r.dt, {
      pageSize: 30,
      maxFraction: 1 / 3,
    });
    expect(out).toHaveLength(50);

    // 前 20 条里应包含全部 10 条非 MDPI（先保证多样性，再填满）
    const first20 = out.slice(0, 20);
    expect(first20.filter((r) => r.p !== 'MDPI')).toHaveLength(10);
  });

  it('配额足够大时保持原（截止日）顺序', () => {
    const records = [rec('1', 'MDPI', 1), rec('2', 'MDPI', 2), rec('3', 'MDPI', 3)];
    const out = diversifyByPublisher(records, (r) => r.p, (r) => r.dt, {
      pageSize: 30,
      maxFraction: 1, // cap=30，不会重排
    });
    expect(out.map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('空输入返回空数组', () => {
    expect(
      diversifyByPublisher<CFPRecord>([], (r) => r.p, (r) => r.dt, {
        pageSize: 30,
        maxFraction: 0.6,
      }),
    ).toEqual([]);
  });
});
