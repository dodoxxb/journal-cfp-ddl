/**
 * 相对时间（纯函数，便于单元测试）。
 * 用于 Header「数据更新于 X」之类的相对表述，hover 时再展示绝对时间。
 */

/** 计算相对时间文案，如「3 小时前」「2 天前」。 */
export function relativeTime(fromMs: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - fromMs);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} 个月前`;
  const year = Math.floor(day / 365);
  return `${year} 年前`;
}

/** 把 ISO 时间格式化为本地绝对时间字符串（用于 tooltip） */
export function formatAbsoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
