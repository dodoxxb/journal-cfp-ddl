/**
 * URL query string <-> CfpFilterState 的纯函数序列化。
 * 支持把搜索词、筛选条件、排序写入地址栏，便于分享与刷新恢复。
 */

import type {
  BucketMode,
  CfpFilterState,
  CfpSortField,
  SortDirection,
  TimeRange,
} from './types';
import { DEFAULT_FILTER_STATE } from './filters';

const SORT_FIELDS: CfpSortField[] = ['deadline', 'journal', 'publisher'];
const TIME_RANGES: TimeRange[] = ['all', 'soon', 'month', 'quarter'];
const BUCKETS: BucketMode[] = ['upcoming', 'rolling'];

/** 拆分逗号分隔的参数值，过滤空串 */
function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(',').map((v) => v.trim()).filter((v) => v.length > 0))];
}

/**
 * 把 `a=1&b=2` 形式的 query string 解析为筛选状态。
 * 非法或未知的值一律回退到默认值，保证页面不会被脏 URL 搞崩。
 */
export function parseFilterState(query: string): CfpFilterState {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);

  const sortRaw = params.get('sort') as CfpSortField | null;
  const rangeRaw = params.get('range') as TimeRange | null;
  const dirRaw = params.get('dir');
  const bucketRaw = params.get('bucket') as BucketMode | null;

  return {
    search: params.get('q') ?? DEFAULT_FILTER_STATE.search,
    publishers: parseList(params.get('pub')),
    categories: parseList(params.get('cat')),
    types: parseList(params.get('ty')),
    quartiles: parseList(params.get('sjrq')),
    range: rangeRaw && TIME_RANGES.includes(rangeRaw) ? rangeRaw : DEFAULT_FILTER_STATE.range,
    sort: sortRaw && SORT_FIELDS.includes(sortRaw) ? sortRaw : DEFAULT_FILTER_STATE.sort,
    dir: dirRaw === 'desc' ? 'desc' : ('asc' as SortDirection),
    bucket: bucketRaw && BUCKETS.includes(bucketRaw) ? bucketRaw : DEFAULT_FILTER_STATE.bucket,
    hideMdpiRolling: params.get('nomdpiroll') === '1',
    balanced: params.get('balanced') === '0' ? false : DEFAULT_FILTER_STATE.balanced,
  };
}

/**
 * 把筛选状态序列化为 query string（不含开头的 `?`）。
 * 默认值会被省略，保持地址栏简洁。
 */
export function serializeFilterState(state: CfpFilterState): string {
  const params = new URLSearchParams();
  if (state.search.trim()) params.set('q', state.search.trim());
  if (state.publishers.length) params.set('pub', state.publishers.join(','));
  if (state.categories.length) params.set('cat', state.categories.join(','));
  if (state.types.length) params.set('ty', state.types.join(','));
  if (state.quartiles.length) params.set('sjrq', state.quartiles.join(','));
  if (state.range !== 'all') params.set('range', state.range);
  if (state.sort !== 'deadline') params.set('sort', state.sort);
  if (state.dir !== 'asc') params.set('dir', state.dir);
  if (state.bucket !== 'upcoming') params.set('bucket', state.bucket);
  if (state.hideMdpiRolling) params.set('nomdpiroll', '1');
  if (!state.balanced) params.set('balanced', '0');
  return params.toString();
}

/** 生成可分享的完整 URL（无参数时返回纯 pathname） */
export function buildShareUrl(base: string, state: CfpFilterState): string {
  const query = serializeFilterState(state);
  return query ? `${base}?${query}` : base;
}
