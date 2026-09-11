/**
 * 倒计时三态粒度（纯函数，便于单元测试）。
 *
 * 竞品调研结论（docs/frontend-design-spec.md 模式 1/2/3）：
 *  - 远（>30 天）：只给「还有 N 天」，不需要秒级噪音；
 *  - 中（1–30 天）：给「5 天 15 小时」；
 *  - 近（<24 小时）：给「HH:MM:SS」秒级跳动（秒级 tick 由调用方用更短的 useNow 周期驱动）。
 *
 * 紧迫度不能只靠颜色表达：每个状态都带一个语义文字标签（label），
 * 例如「3 天内」「已过期」「长期有效」，色条/pill 同时承载文字与颜色。
 */

export type CountdownTier =
  | 'far' // 充裕（>30 天）
  | 'mid' // 中期（1–30 天）
  | 'near' // 临近（<24 小时）
  | 'expired' // 已过期
  | 'rolling' // 滚动征稿（无截止日）
  | 'na'; // 日期缺失

export interface CountdownState {
  /** 三态分级，用于选择配色 / 是否逐秒刷新 */
  tier: CountdownTier;
  /** 主倒计时文本（如 "还有 38 天" / "5 天 15 小时" / "19:11:32"） */
  text: string;
  /** 与紧迫度绑定的语义文字标签（不依赖颜色即可理解） */
  label: string;
  /** 是否应逐秒跳动（仅临近截止） */
  tick: boolean;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const SECOND_MS = 1000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 计算倒计时三态。
 * @param dtIso 截止时间戳（ISO 8601，含时区），滚动征稿请传空串
 * @param nowMs 当前时间戳（毫秒）
 * @param rolling 是否为滚动征稿（无截止日）
 */
export function countdownState(dtIso: string, nowMs: number, rolling: boolean): CountdownState {
  if (rolling) {
    return { tier: 'rolling', text: '长期开放', label: '长期有效', tick: false };
  }

  const target = Date.parse(dtIso);
  if (Number.isNaN(target)) {
    return { tier: 'na', text: '日期待定', label: '日期待定', tick: false };
  }

  const diff = target - nowMs;

  // 已过期
  if (diff <= 0) {
    const days = Math.ceil(-diff / DAY_MS);
    return {
      tier: 'expired',
      text: days > 0 ? `${days} 天前截止` : '今日已截止',
      label: '已过期',
      tick: false,
    };
  }

  // 近（<24 小时）：秒级 HH:MM:SS
  if (diff < DAY_MS) {
    const totalSec = Math.floor(diff / SECOND_MS);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return { tier: 'near', text: `${pad2(h)}:${pad2(m)}:${pad2(s)}`, label: '24 小时内', tick: true };
  }

  // 中（1–30 天）：X 天 Y 小时
  if (diff < 30 * DAY_MS) {
    const days = Math.floor(diff / DAY_MS);
    const hours = Math.floor((diff % DAY_MS) / HOUR_MS);
    return {
      tier: 'mid',
      text: `${days} 天 ${pad2(hours)} 小时`,
      label: days <= 3 ? '3 天内' : '30 天内',
      tick: false,
    };
  }

  // 远（>30 天）
  const days = Math.floor(diff / DAY_MS);
  return { tier: 'far', text: `还有 ${days} 天`, label: '时间充裕', tick: false };
}

/**
 * 倒计时是否临近（<24 小时、未过期）。用于决定 useNow 是否要切到秒级刷新周期。
 */
export function isNearDeadline(dtIso: string, nowMs: number, rolling: boolean): boolean {
  if (rolling) return false;
  const target = Date.parse(dtIso);
  if (Number.isNaN(target)) return false;
  const diff = target - nowMs;
  return diff > 0 && diff < DAY_MS;
}
