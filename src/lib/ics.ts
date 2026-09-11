/**
 * ICS 日历导出（纯函数手搓，不引入任何依赖）。
 *
 * 关键质量点（做错会导致日历软件导入失败）：
 *  1. TEXT 值转义：`\` `;` `,` 与换行必须转义；
 *  2. 行折叠（line folding）：单行不超过 75 个八位字节，续行以空格开头（RFC 5545）。
 *
 * `generateICS` 为纯函数，可不依赖 DOM 进行单元测试；`downloadICS` 负责触发浏览器下载。
 */

/** 单条导出所需的字段（从 CFPRecord 映射而来，避免 UI 层耦合） */
export interface IcsEventInput {
  id: string;
  title: string;
  journal: string;
  publisher: string;
  url: string;
  /** 截止日 YYYY-MM-DD；rolling（无截止日）的条目应置 rolling=true 且不传 deadline */
  deadline: string;
  rolling?: boolean;
}

/** 转义 ICS TEXT 值中的特殊字符（顺序：反斜杠 → 换行 → 分号 → 逗号） */
export function escapeICSText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/**
 * 把一条逻辑行按 75 八位字节折叠，续行以空格开头（RFC 5545 §3.1）。
 * 使用 UTF-8 字节长度计量；多字节字符不会被截断到字节中间。
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) {
    const chBytes = enc.encode(ch).length;
    if (curBytes > 0 && curBytes + chBytes > 75) {
      parts.push(cur);
      cur = ` ${ch}`; // 续行以空格开头
      curBytes = 1 + chBytes;
    } else {
      cur += ch;
      curBytes += chBytes;
    }
  }
  parts.push(cur);
  return parts.join('\r\n');
}

/** YYYY-MM-DD → YYYYMMDD */
function toICSDate(yyyymmdd: string): string {
  return yyyymmdd.replace(/-/g, '');
}

/** 截断到合理长度（字符数），避免个别超长标题撑爆日历条目 */
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 生成单个 VEVENT 的行数组；rolling / 无截止日的条目返回空数组（跳过） */
export function toVEvent(record: IcsEventInput): string[] {
  if (record.rolling) return [];
  if (!record.deadline || !DATE_RE.test(record.deadline)) return [];
  const date = toICSDate(record.deadline);
  const summary = truncate(escapeICSText(record.title || ''), 200);
  const description = escapeICSText(
    `${record.journal || ''}（${record.publisher || ''}）\n${record.url || ''}`,
  );
  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeICSText(record.id)}@journal-cfp-ddl`,
    `DTSTART;VALUE=DATE:${date}`,
    `DTEND;VALUE=DATE:${date}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
  ];
  if (record.url) lines.push(`URL:${record.url}`);
  lines.push(
    'BEGIN:VALARM',
    'TRIGGER:-P7D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${summary}`,
    'END:VALARM',
    'END:VEVENT',
  );
  return lines;
}

/** 把多条记录生成完整 VCALENDAR 文本（已逐行折叠，并以 CRLF 结尾） */
export function generateICS(records: IcsEventInput[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//journal-cfp-ddl//CFP Deadlines//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const r of records) {
    const ev = toVEvent(r);
    if (ev.length > 0) lines.push(...ev);
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** 触发浏览器下载 ICS 文件（Blob + createObjectURL），记得 revokeObjectURL 释放 */
export function downloadICS(filename: string, content: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 默认下载文件名：cfp-deadlines-YYYY-MM-DD.ics */
export function icsFilename(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `cfp-deadlines-${y}-${m}-${d}.ics`;
}
