/**
 * 出版社配额打散（纯函数，便于单元测试）。
 *
 * 痛点：MDPI 占 82.8%，默认按截止日升序时前几页几乎全是 MDPI，信息多样性≈0。
 * 做法：渲染前对结果按出版社做「每页配额」打散——单出版社在每一页内最多占
 * `ceil(pageSize * maxFraction)` 条，其余位置按「截止日最早优先」穿插其他出版社，
 * 既保证多样性、又尽量保留时间顺序（截止日作为次级排序键）。
 *
 * 当某页剩余可放项都来自已触顶的同一出版社时（其它出版社已耗尽），允许该出版社
 * 在本页超出配额填满页面——这是数据分布本身的客观限制，无法在保证配额的同时填满。
 */

export interface QuotaOptions {
  /** 每页条数 */
  pageSize: number;
  /** 单出版社每页最大占比（如 0.6 表示最多占 60%） */
  maxFraction: number;
}

/**
 * 按出版社配额打散排序。
 * @param records 已按希望的次级顺序（如截止日升序）排好的列表
 * @param getPublisher 取出版社字段
 * @param getDeadline 取截止时间戳（用于同页内穿插时选「最早截止」），无法解析时排到末尾
 * @returns 打散后的新列表（不修改原数组）
 */
export function diversifyByPublisher<T>(
  records: T[],
  getPublisher: (r: T) => string,
  getDeadline: (r: T) => string,
  options: QuotaOptions,
): T[] {
  const { pageSize, maxFraction } = options;
  const cap = Math.max(1, Math.ceil(pageSize * maxFraction));
  if (records.length === 0) return [];

  // 按出版社分组，组内保留输入顺序（即已排好的截止日顺序）
  const groups = new Map<string, T[]>();
  for (const r of records) {
    const p = getPublisher(r);
    let g = groups.get(p);
    if (!g) {
      g = [];
      groups.set(p, g);
    }
    g.push(r);
  }
  const queues = [...groups.entries()].map(([pub, items]) => ({ pub, items }));

  const deadlineMs = (iso: string): number => {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  };

  const out: T[] = [];
  let pageCounts = new Map<string, number>();
  let placedInPage = 0;

  const resetPage = () => {
    pageCounts = new Map();
    placedInPage = 0;
  };

  const hasItems = () => queues.some((q) => q.items.length > 0);
  const take = (q: { pub: string; items: T[] }) => {
    out.push(q.items.shift() as T);
    pageCounts.set(q.pub, (pageCounts.get(q.pub) ?? 0) + 1);
    placedInPage += 1;
    if (placedInPage >= pageSize) resetPage();
  };

  while (hasItems()) {
    // 候选 = 仍有剩余且本页未触顶的出版社
    const candidates = queues.filter(
      (q) => q.items.length > 0 && (pageCounts.get(q.pub) ?? 0) < cap,
    );
    if (candidates.length === 0) {
      // 本页剩余项全部来自已触顶的出版社：取剩余最多的那个填满本页（客观限制）
      const forced = queues
        .filter((q) => q.items.length > 0)
        .sort((a, b) => b.items.length - a.items.length);
      if (forced.length === 0) break;
      take(forced[0]);
      continue;
    }
    // 同页内穿插：优先放「截止日最早」的候选项
    candidates.sort(
      (a, b) => deadlineMs(getDeadline(a.items[0])) - deadlineMs(getDeadline(b.items[0])),
    );
    take(candidates[0]);
  }

  return out;
}
