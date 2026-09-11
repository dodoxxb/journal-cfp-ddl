/**
 * 截稿密度直方图的数据聚合（纯函数，便于单元测试）。
 *
 * 数据来源优先级：
 *  - 无筛选时：直接取 `index.months` 的月度 count（全量精确，无需加载分片）。
 *  - 有筛选（出版社 / 学科 / 类型）时：用 `facet_months` 在每个激活维度上
 *    累加所选取值的月度分布，再对各激活维度取「月份交集」（某月必须在该维度有 >0 数据），
 *    柱高取各维度月度计数的最小值作为联合计数的上界近似（因为单条记录同时只属于一个
 *    出版社 / 学科 / 类型，真实联合计数 ≤ 任一维度的边缘计数）。
 *  - `facet_months` 缺失时返回 `null`，调用方降级为全量直方图（不抛错）。
 */

import type { CfpIndex } from './types';
import { listMonthKeys } from './dataLoader';

/** 直方图激活的筛选维度（与 CfpFilterState 的同名字段对应） */
export interface HistogramFilters {
  publishers: string[];
  categories: string[];
  types: string[];
}

/**
 * 计算直方图每月的截稿条数。返回 `month -> count` 的 Map；
 * 筛选激活但 `facet_months` 缺失时返回 `null`（调用方降级）。
 */
export function aggregateHistogramCounts(
  index: CfpIndex,
  filters: HistogramFilters,
): Map<string, number> | null {
  const months = index.months;
  const active =
    filters.publishers.length > 0 ||
    filters.categories.length > 0 ||
    filters.types.length > 0;

  if (!active) {
    // 全量精确：直接用索引里的月度分片计数
    const m = new Map<string, number>();
    for (const mo of months) m.set(mo.name, mo.count);
    return m;
  }

  const fm = index.facet_months;
  if (!fm) return null; // 缺失 → 降级

  // 单个维度：把所选取值的月度分布累加为「月份 -> 计数」
  const seriesFor = (
    dim: 'publisher' | 'category' | 'type',
    names: string[],
  ): Map<string, number> => {
    const out = new Map<string, number>();
    const dimMap = fm[dim];
    if (!dimMap) return out;
    for (const name of names) {
      const monthMap = dimMap[name];
      if (!monthMap) continue;
      for (const [mk, c] of Object.entries(monthMap)) {
        if (!c) continue;
        out.set(mk, (out.get(mk) ?? 0) + c);
      }
    }
    return out;
  };

  const dims = [
    seriesFor('publisher', filters.publishers),
    seriesFor('category', filters.categories),
    seriesFor('type', filters.types),
  ].filter((s) => s.size > 0);

  // 所有选中取值在 facet_months 里都查不到 → 该筛选下没有任何匹配，全月为 0
  if (dims.length === 0) {
    const zero = new Map<string, number>();
    for (const mk of listMonthKeys(index)) zero.set(mk, 0);
    return zero;
  }

  const allMonths = listMonthKeys(index);
  const result = new Map<string, number>();
  for (const mk of allMonths) {
    let presentInAll = true;
    let val = Number.POSITIVE_INFINITY;
    for (const s of dims) {
      const c = s.get(mk) ?? 0;
      if (c <= 0) {
        presentInAll = false;
        break;
      }
      val = Math.min(val, c);
    }
    result.set(mk, presentInAll ? val : 0);
  }
  return result;
}
