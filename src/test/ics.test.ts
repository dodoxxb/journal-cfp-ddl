import { describe, it, expect } from 'vitest';
import {
  escapeICSText,
  foldLine,
  generateICS,
  icsFilename,
  toVEvent,
  type IcsEventInput,
} from '../lib/ics';

const enc = new TextEncoder();

describe('escapeICSText', () => {
  it('转义反斜杠、分号、逗号、换行', () => {
    expect(escapeICSText('a\\b')).toBe('a\\\\b');
    expect(escapeICSText('a;b')).toBe('a\\;b');
    expect(escapeICSText('a,b')).toBe('a\\,b');
    expect(escapeICSText('a\nb')).toBe('a\\nb');
    expect(escapeICSText('a\r\nb')).toBe('a\\nb');
  });

  it('组合转义：标题含逗号与换行', () => {
    expect(escapeICSText('AI, ML\nSurvey')).toBe('AI\\, ML\\nSurvey');
  });
});

describe('foldLine', () => {
  it('不超过 75 字节的逻辑行原样返回', () => {
    const line = 'UID:abc@journal-cfp-ddl';
    expect(foldLine(line)).toBe(line);
  });

  it('超长行折叠：每行 ≤75 字节且续行以空格开头', () => {
    const line = 'DESCRIPTION:' + 'A'.repeat(200);
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(enc.encode(p).length).toBeLessThanOrEqual(75);
    }
    // 续行（除首行）必须以空格开头
    for (let i = 1; i < parts.length; i += 1) {
      expect(parts[i][0]).toBe(' ');
    }
  });

  it('多字节字符不被截断到字节中间', () => {
    // 100 个中文字符（每个 3 字节）= 300 字节
    const line = 'SUMMARY:' + '中'.repeat(100);
    const folded = foldLine(line);
    for (const p of folded.split('\r\n')) {
      expect(enc.encode(p).length).toBeLessThanOrEqual(75);
      // 续行首字符是空格，不算截断
      if (p[0] === ' ') expect(p.length).toBeGreaterThan(1);
    }
    // 还原后不应包含半个字符（无乱码）
    const restored = folded.replace(/\r\n /g, '').replace(/^SUMMARY:/, '');
    expect(restored).toBe('中'.repeat(100));
  });
});

describe('toVEvent', () => {
  const base: IcsEventInput = {
    id: 'id-1',
    title: 'Special Issue on X',
    journal: 'J. Test',
    publisher: 'MDPI',
    url: 'https://example.com/x',
    deadline: '2026-10-15',
  };

  it('rolling 条目返回空数组（跳过）', () => {
    expect(toVEvent({ ...base, rolling: true })).toEqual([]);
  });

  it('无截止日返回空数组（跳过）', () => {
    expect(toVEvent({ ...base, deadline: '' })).toEqual([]);
  });

  it('有效条目生成正确的 VEVENT 字段', () => {
    const lines = toVEvent(base);
    expect(lines).toContain('BEGIN:VEVENT');
    expect(lines).toContain('END:VEVENT');
    expect(lines).toContain('UID:id-1@journal-cfp-ddl');
    expect(lines).toContain('DTSTART;VALUE=DATE:20261015');
    expect(lines).toContain('DTEND;VALUE=DATE:20261015');
    expect(lines).toContain('SUMMARY:Special Issue on X');
    expect(lines).toContain('URL:https://example.com/x');
    // 含 VALARM 提前 7 天提醒
    expect(lines).toContain('BEGIN:VALARM');
    expect(lines).toContain('TRIGGER:-P7D');
  });
});

describe('generateICS', () => {
  it('整体结构：跳过 rolling，生成合法 VCALENDAR', () => {
    const content = generateICS([
      { id: 'a', title: 'A', journal: 'J', publisher: 'P', url: 'https://x/a', deadline: '2026-10-01' },
      { id: 'b', title: 'B', journal: 'J', publisher: 'P', url: 'https://x/b', deadline: '', rolling: true },
    ]);
    expect(content.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(content.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(content).toContain('UID:a@journal-cfp-ddl');
    expect(content).not.toContain('UID:b@journal-cfp-ddl'); // rolling 被跳过
  });

  it('逐行折叠：任意物理行不超过 75 字节', () => {
    const longTitle = 'X'.repeat(120);
    const content = generateICS([
      { id: 'a', title: longTitle, journal: 'Journal', publisher: 'MDPI', url: 'https://example.com', deadline: '2026-10-01' },
    ]);
    for (const line of content.split('\r\n')) {
      expect(enc.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('描述中转义：逗号与换行被转义', () => {
    const content = generateICS([
      { id: 'a', title: 'T', journal: 'J, Inc', publisher: 'P', url: 'https://x', deadline: '2026-10-01' },
    ]);
    expect(content).toContain('J\\, Inc');
  });
});

describe('icsFilename', () => {
  it('生成 cfp-deadlines-YYYY-MM-DD.ics', () => {
    expect(icsFilename(new Date('2026-09-10T00:00:00Z'))).toBe('cfp-deadlines-2026-09-10.ics');
  });
});
