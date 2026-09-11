/**
 * 时区展示（纯函数，便于单元测试）。
 *
 * 数据局限（README Known gaps）：`dt` 硬编码为 `<date>T23:59:59Z`，
 * 多数出版社实际按 Anywhere on Earth（UTC−12）截止，可能相差最多 ~12 小时。
 * 因此展示策略：
 *  - 主行标注 AoE（在无法判断原始时区时统一标注 AoE，并在 tooltip 说明差异）；
 *  - 同时用浏览器本地时区展示对应时间，便于用户换算。
 */

/** AoE 提示文案（tooltip / 说明） */
export const AOE_HINT =
  '多数出版社按 Anywhere on Earth（UTC−12）截止，实际可能比记录时间晚约 12 小时（相差 1 天）。';

/** 取浏览器本地 IANA 时区名，失败时回退 'local' */
export function getLocalTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || 'local';
  } catch {
    return 'local';
  }
}

/** 把 ISO 时间戳格式化为指定时区的 `MM-DD HH:mm (时区)` 形式 */
export function formatInTimeZone(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')} ${tz}`;
}

/** 把 YYYY-MM-DD 日期拼成 AoE 标注（如 `2026-12-31 · AoE`） */
export function aoeLabel(dateStr: string): string {
  return dateStr ? `${dateStr} · AoE` : 'AoE';
}

export interface DeadlineTz {
  /** AoE 标注（基于记录日期） */
  aoe: string;
  /** 用户本地时区下的对应时间 */
  local: string;
  /** 时区说明（AoE 与记录时间的差异提示） */
  hint: string;
}

/**
 * 计算一条 CFP 的时区展示信息。
 * 滚动征稿（无截止日）返回 null，调用方据此显示「长期开放（无截止日）」。
 */
export function deadlineTimeZones(dtIso: string, dateStr: string, tz: string): DeadlineTz | null {
  if (!dtIso) return null;
  return {
    aoe: aoeLabel(dateStr),
    local: formatInTimeZone(dtIso, tz),
    hint: AOE_HINT,
  };
}
