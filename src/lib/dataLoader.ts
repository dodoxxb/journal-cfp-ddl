/**
 * 数据加载层：index.json + 按月份分片（shards/YYYY-MM.json）。
 *
 * 设计目标（性能第一）：
 * 1. 首屏只请求 index.json（约 1KB）+ 当前月及未来 2 个月的分片；
 * 2. 分片结果缓存在模块级 Map 中，重复访问 / 组件重挂载不再发起网络请求；
 * 3. 同一个分片的并发请求会被合并（in-flight 去重）；
 * 4. 对外只暴露纯函数 + 少量命令式 API，便于单元测试 mock。
 */

import type { CFPRecord, CfpIndex, JournalMetric, MonthShardMeta } from './types';
import { INITIAL_MONTH_SPAN, LOAD_MORE_MONTH_SPAN } from './constants';

/** Vite 部署基址（GitHub Pages 子路径部署时为相对路径） */
const RAW_BASE: string = (import.meta.env?.BASE_URL ?? '/') as string;
const BASE_URL: string = RAW_BASE.endsWith('/') ? RAW_BASE : `${RAW_BASE}/`;

/** 把 data 目录下的相对路径拼成可请求的 URL */
export function dataUrl(relativePath: string): string {
  return `${BASE_URL}data/${relativePath}`;
}

/**
 * 带状态检查的 JSON 请求。
 * @param url 请求地址
 * @param signal 可选的中断信号
 */
export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`数据请求失败 (HTTP ${response.status})：${url}`);
  }
  return (await response.json()) as T;
}

/** 加载索引文件 */
export async function fetchIndex(signal?: AbortSignal): Promise<CfpIndex> {
  return fetchJson<CfpIndex>(dataUrl('index.json'), signal);
}

/** 期刊指标表：issn8 -> JournalMetric（journal_meta.json） */
export type JournalMetricMap = Record<string, JournalMetric>;

/** 模块级指标缓存（随 resetShardCache 一并清空） */
let metaCache: JournalMetricMap | null = null;
let metaInflight: Promise<JournalMetricMap> | null = null;

/**
 * 加载期刊指标表（可选数据）。
 * 文件缺失（404）时静默返回空表——指标是增强信息，不能影响主流程稳定性。
 */
export async function fetchJournalMeta(signal?: AbortSignal): Promise<JournalMetricMap> {
  if (metaCache) return metaCache;
  if (metaInflight) return metaInflight;
  metaInflight = fetchJson<JournalMetricMap>(dataUrl('journal_meta.json'), signal)
    .then((meta) => {
      metaCache = meta && typeof meta === 'object' ? meta : {};
      return metaCache;
    })
    .catch(() => {
      metaCache = {};
      return metaCache;
    })
    .finally(() => {
      metaInflight = null;
    });
  return metaInflight;
}

/** 模块级分片缓存：monthKey -> 分片记录数组 */
const shardCache = new Map<string, CFPRecord[]>();

/** 正在请求中的分片：monthKey -> Promise，用于并发去重 */
const inflight = new Map<string, Promise<CFPRecord[]>>();

/** 清空分片缓存（测试用） */
export function resetShardCache(): void {
  shardCache.clear();
  inflight.clear();
  metaCache = null;
}

/** 当前缓存的分片数（测试 / 调试用） */
export function cachedShardCount(): number {
  return shardCache.size;
}

/**
 * 取本地时区的月份键（YYYY-MM）。
 * 使用本地时区而非 UTC，避免用户在月初 / 月末看到与实际不符的月份。
 */
export function monthKeyOf(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * 在月份键上做加减（支持跨年）。
 * @param key 形如 2026-12
 * @param delta 月偏移量，可为负
 */
export function shiftMonthKey(key: string, delta: number): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

/** 取索引中所有月份键（升序，去重） */
export function listMonthKeys(index: CfpIndex): string[] {
  return [...new Set(index.months.map((m) => m.name))].sort();
}

/** 按月份键查找分片元信息 */
export function findMonthMeta(index: CfpIndex, key: string): MonthShardMeta | undefined {
  return index.months.find((m) => m.name === key);
}

/**
 * 计算首屏需要加载的月份：当前月起的连续 N 个月（只取索引中存在的月份）。
 * 若索引中已无当前月之后的月份（历史数据），退化为取最后 N 个月。
 */
export function selectInitialMonths(
  index: CfpIndex,
  now: Date = new Date(),
  span: number = INITIAL_MONTH_SPAN,
): string[] {
  const available = listMonthKeys(index);
  if (available.length === 0) return [];
  const current = monthKeyOf(now);
  const start = available.findIndex((key) => key >= current);
  if (start === -1) {
    return available.slice(Math.max(0, available.length - span));
  }
  return available.slice(start, start + span);
}

/**
 * 计算「加载更多」时要追加的月份：已加载月份之后的连续 N 个未加载月份。
 * 早于当前月的分片（已过期的历史数据）不主动加载。
 */
export function selectNextMonths(
  index: CfpIndex,
  loaded: Iterable<string>,
  now: Date = new Date(),
  count: number = LOAD_MORE_MONTH_SPAN,
): string[] {
  const loadedSet = new Set(loaded);
  const current = monthKeyOf(now);
  return listMonthKeys(index)
    .filter((key) => key >= current && !loadedSet.has(key))
    .slice(0, count);
}

/** 索引里「当月及未来月份」的 CFP 总条数（即用户最多可浏览的条数） */
export function countLoadable(index: CfpIndex, now: Date = new Date()): number {
  const current = monthKeyOf(now);
  return index.months
    .filter((m) => m.name >= current)
    .reduce((sum, m) => sum + m.count, 0);
}

/**
 * 加载单个月份分片。
 * 命中缓存直接返回；同一分片的并发调用共享同一个 Promise。
 * @param index 索引（用于定位分片文件）
 * @param key 月份键
 * @param signal 可选的中断信号
 */
export async function loadShard(
  index: CfpIndex,
  key: string,
  signal?: AbortSignal,
): Promise<CFPRecord[]> {
  const cached = shardCache.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const meta = findMonthMeta(index, key);
  if (!meta) {
    // 索引中不存在该月份（例如超出数据窗口），按空分片处理
    shardCache.set(key, []);
    return [];
  }

  const task = fetchJson<CFPRecord[]>(dataUrl(meta.file), signal)
    .then((records) => {
      shardCache.set(key, Array.isArray(records) ? records : []);
      inflight.delete(key);
      return shardCache.get(key) as CFPRecord[];
    })
    .catch((error: unknown) => {
      inflight.delete(key);
      throw error;
    });

  inflight.set(key, task);
  return task;
}

/**
 * 批量加载月份分片（并发），返回「月份键 -> 记录数组」的 Map。
 * 已在缓存中的分片不会发起网络请求。
 */
export async function loadShards(
  index: CfpIndex,
  keys: string[],
  signal?: AbortSignal,
): Promise<Map<string, CFPRecord[]>> {
  const result = new Map<string, CFPRecord[]>();
  const entries = await Promise.all(
    keys.map(async (key) => [key, await loadShard(index, key, signal)] as const),
  );
  for (const [key, records] of entries) {
    result.set(key, records);
  }
  return result;
}
