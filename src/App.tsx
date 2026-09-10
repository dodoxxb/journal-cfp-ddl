/**
 * Journal CFP Deadlines — 主入口组件
 *
 * 数据加载：index.json + 按月份分片（src/lib/dataLoader）
 * 筛选 / 搜索 / 排序：纯函数集合（src/lib/filters）
 * URL 状态同步：src/lib/urlState
 * 主题 / 倒计时 / 搜索防抖：src/hooks/*
 *
 * 设计目标：
 *  1. 首屏只加载 index.json + 当前月及未来 3 个月分片；
 *  2. 翻页式浏览（每页 30 条），末页可按需加载更多月份分片；
 *  3. 已加载数据在客户端做筛选 + 排序 + 搜索，秒级响应；
 *  4. 筛选 / 搜索条件实时同步到 URL，便于分享与刷新恢复；
 *  5. 同时支持深色 / 浅色主题，移动端单列自适应。
 *  6. 视觉：GitHub Primer / HuggingFace 风格 —— 圆角卡片、org 头像、
 *     紧迫度色条、渐变品牌标。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  ExternalLink,
  Filter,
  Flame,
  Infinity as InfinityIcon,
  Loader2,
  Moon,
  Search,
  Sparkles,
  Sun,
  TrendingUp,
  X,
} from 'lucide-react';

import type {
  CfpFilterState,
  CfpIndex,
  CfpSortField,
  CFPRecord,
  DatasetStats,
  JournalMetric,
  LoadPhase,
  TimeRange,
} from './lib/types';
import {
  fetchIndex,
  fetchJournalMeta,
  listMonthKeys,
  loadShard,
  monthKeyOf,
  resetShardCache,
  selectInitialMonths,
  selectMonthsForFacets,
  selectNextMonths,
} from './lib/dataLoader';
import {
  DEFAULT_FILTER_STATE,
  computeStats,
  countActiveFilters,
  daysUntil,
  facetQuartileCounts,
  filterRecords,
  hasAnyFilter,
  sortRecords,
} from './lib/filters';
import { parseFilterState, serializeFilterState } from './lib/urlState';
import { useTheme } from './hooks/useTheme';
import { useNow } from './hooks/useNow';
import { useDebounce } from './hooks/useDebounce';
import { LOAD_MORE_MONTH_SPAN, NOW_TICK_MS, SEARCH_DEBOUNCE_MS } from './lib/constants';

// ───────────────────────────────────────────────────────────────────
// 倒计时颜色策略（urgency 语义）
// ───────────────────────────────────────────────────────────────────

type Urgency = 'rolling' | 'na' | 'expired' | 'critical' | 'soon' | 'month' | 'later';

function urgencyOf(days: number, rolling: boolean): Urgency {
  if (rolling) return 'rolling';
  if (Number.isNaN(days)) return 'na';
  if (days < 0) return 'expired';
  if (days <= 3) return 'critical';
  if (days <= 7) return 'soon';
  if (days <= 30) return 'month';
  return 'later';
}

const URGENCY_TEXT: Record<Urgency, string> = {
  rolling: 'text-purple-600 dark:text-purple-400',
  na: 'text-gray-500 dark:text-gray-400',
  expired: 'text-gray-400 dark:text-gray-500 line-through',
  critical: 'text-red-600 dark:text-red-400 font-semibold',
  soon: 'text-orange-600 dark:text-orange-400 font-medium',
  month: 'text-amber-600 dark:text-amber-400',
  later: 'text-emerald-700 dark:text-emerald-400',
};

const URGENCY_STRIPE: Record<Urgency, string> = {
  rolling: 'bg-purple-500',
  na: 'bg-gray-300 dark:bg-gray-700',
  expired: 'bg-gray-300 dark:bg-gray-700',
  critical: 'bg-red-500',
  soon: 'bg-orange-500',
  month: 'bg-amber-500',
  later: 'bg-emerald-500',
};

function urgencyClass(days: number, rolling: boolean): string {
  return URGENCY_TEXT[urgencyOf(days, rolling)];
}

function formatCountdown(days: number, rolling: boolean): string {
  if (rolling) return '滚动征稿';
  if (Number.isNaN(days)) return '待公布';
  if (days < 0) return `${-days} 天前截止`;
  if (days === 0) return '今日截止';
  if (days === 1) return '明天截止';
  return `还有 ${days} 天`;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

// ───────────────────────────────────────────────────────────────────
// 出版社视觉：徽章色 + org 头像（HuggingFace org 风格）
// ───────────────────────────────────────────────────────────────────

const PUBLISHER_COLORS: Record<string, { badge: string; avatar: string }> = {
  MDPI: { badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300', avatar: 'bg-blue-500' },
  Springer: { badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', avatar: 'bg-emerald-500' },
  'Nature Portfolio': { badge: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300', avatar: 'bg-rose-500' },
  Elsevier: { badge: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300', avatar: 'bg-orange-500' },
  Wiley: { badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300', avatar: 'bg-cyan-600' },
  Frontiers: { badge: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300', avatar: 'bg-violet-500' },
  IEEE: { badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300', avatar: 'bg-indigo-500' },
  ACM: { badge: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300', avatar: 'bg-sky-500' },
  ACS: { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', avatar: 'bg-amber-500' },
  OUP: { badge: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', avatar: 'bg-red-500' },
  'FEBS Press': { badge: 'bg-lime-100 text-lime-700 dark:bg-lime-950 dark:text-lime-300', avatar: 'bg-lime-600' },
  'Emerald Publishing': { badge: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300', avatar: 'bg-teal-600' },
  'UPenn CFP Aggregator': { badge: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300', avatar: 'bg-fuchsia-500' },
};

const FALLBACK_COLORS = [
  'bg-slate-500', 'bg-stone-500', 'bg-zinc-500', 'bg-neutral-500',
];

function publisherStyle(p: string): { badge: string; avatar: string } {
  if (PUBLISHER_COLORS[p]) return PUBLISHER_COLORS[p];
  let h = 0;
  for (let i = 0; i < p.length; i++) h = (h * 31 + p.charCodeAt(i)) >>> 0;
  const avatar = FALLBACK_COLORS[h % FALLBACK_COLORS.length];
  return {
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    avatar,
  };
}

function publisherInitial(p: string): string {
  return (p.trim()[0] ?? '?').toUpperCase();
}

function cfpTypeLabel(t: string): string {
  return {
    special_issue: 'Special Issue',
    collection: 'Collection',
    research_topic: 'Research Topic',
    call_for_papers: 'Call for Papers',
    cfp: 'CFP',
    conference: 'Conference',
  }[t] ?? t;
}

// ───────────────────────────────────────────────────────────────────
// 子组件：顶部
// ───────────────────────────────────────────────────────────────────
interface HeaderProps {
  index: CfpIndex | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

function Header({ index, theme, onToggleTheme }: HeaderProps) {
  return (
    <header className="border-b border-gray-200 dark:border-gray-800 bg-white/85 dark:bg-[#0d1117]/85 backdrop-blur sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 flex items-center justify-center shadow-sm shadow-indigo-500/25 shrink-0">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">
              Journal CFP Deadlines
            </h1>
            {index && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                数据更新于 {formatDate(index.generated_at)} · 窗口 {index.window_months} 个月 · 共 {index.total.toLocaleString()} 条
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="切换主题"
          title={theme === 'dark' ? '切换到浅色' : '切换到深色'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}

// ───────────────────────────────────────────────────────────────────
// 子组件：统计概览
// ───────────────────────────────────────────────────────────────────
function StatsBar({ stats, index }: { stats: DatasetStats; index: CfpIndex | null }) {
  const rollingCount = index?.rolling_count ?? 0;
  const cards = [
    { label: '已加载', value: stats.loaded, sub: index ? `/ ${stats.loadable.toLocaleString()} 可浏览` : '', tone: 'text-blue-600 dark:text-blue-400', chip: 'bg-blue-100 dark:bg-blue-950/60', Icon: Database },
    { label: '7 天内截止', value: stats.expiringIn7, sub: '紧迫', tone: 'text-red-600 dark:text-red-400', chip: 'bg-red-100 dark:bg-red-950/60', Icon: Flame },
    { label: '30 天内截止', value: stats.expiringIn30, sub: '近期', tone: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-100 dark:bg-amber-950/60', Icon: Clock },
    { label: '滚动征稿', value: rollingCount, sub: '长期开放', tone: 'text-purple-600 dark:text-purple-400', chip: 'bg-purple-100 dark:bg-purple-950/60', Icon: InfinityIcon },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-xl p-3 flex items-center gap-3"
        >
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c.chip}`}>
            <c.Icon className={`w-5 h-5 ${c.tone}`} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-500 dark:text-gray-400">{c.label}</div>
            <div className={`text-xl font-semibold leading-tight ${c.tone}`}>
              {c.value.toLocaleString()}
              <span className="text-[11px] font-normal text-gray-400 dark:text-gray-500 ml-1">{c.sub}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// 子组件：筛选条
// ───────────────────────────────────────────────────────────────────
interface FilterBarProps {
  filter: CfpFilterState;
  setFilter: (f: CfpFilterState) => void;
  records: CFPRecord[];
  publishers: string[];
  categories: string[];
  types: string[];
  journalMeta: Map<string, JournalMetric>;
  index: CfpIndex | null;
  showExpired: boolean;
  onToggleExpired: () => void;
}

const RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'soon', label: '7 天内' },
  { value: 'month', label: '30 天内' },
  { value: 'quarter', label: '90 天内' },
];

const SORT_OPTIONS: { value: CfpSortField; label: string }[] = [
  { value: 'deadline', label: '按截止日期' },
  { value: 'journal', label: '按期刊名' },
  { value: 'publisher', label: '按出版社' },
];

function FilterBar({ filter, setFilter, records, publishers, categories, types, journalMeta, index, showExpired, onToggleExpired }: FilterBarProps) {
  // 芯片计数用 index.json 全库统计（稳定、真实），而非已加载子集——
  // 否则未加载月份里的出版社（如 Wiley/ACS）会错误显示 (0)
  const pubCounts = useMemo(() => {
    const m = new Map<string, number>();
    index?.publishers.forEach((p) => m.set(p.name, p.count));
    return m;
  }, [index]);
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    index?.categories.forEach((c) => m.set(c.name, c.count));
    return m;
  }, [index]);
  const tyCounts = useMemo(() => {
    const m = new Map<string, number>();
    index?.types.forEach((t) => m.set(t.name, t.count));
    return m;
  }, [index]);
  const qCounts = useMemo(() => facetQuartileCounts(records, journalMeta), [records, journalMeta]);

  const toggle = (key: 'publishers' | 'categories' | 'types' | 'quartiles', value: string) => {
    const cur = filter[key];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    setFilter({ ...filter, [key]: next });
  };

  const activeCount = countActiveFilters(filter);
  const hasSearch = filter.search.trim().length > 0;

  return (
    <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-xl p-3 sm:p-4 mb-4 space-y-3 shadow-sm">
      {/* 搜索框 + 时间范围 */}
      <div className="flex gap-2 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filter.search}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
            placeholder="搜索标题 / 期刊 / 标签..."
            className="w-full pl-9 pr-9 py-2 bg-gray-50 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          {hasSearch && (
            <button
              onClick={() => setFilter({ ...filter, search: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              aria-label="清空搜索"
            >
              <X className="w-3.5 h-3.5 text-gray-500" />
            </button>
          )}
        </div>
        <select
          value={filter.range}
          onChange={(e) => setFilter({ ...filter, range: e.target.value as TimeRange })}
          className="py-2 px-3 bg-gray-50 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={filter.sort}
          onChange={(e) => setFilter({ ...filter, sort: e.target.value as CfpSortField })}
          className="py-2 px-3 bg-gray-50 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          onClick={() => setFilter({ ...filter, dir: filter.dir === 'asc' ? 'desc' : 'asc' })}
          className="py-2 px-3 bg-gray-50 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
          title={`当前：${filter.dir === 'asc' ? '升序' : '降序'}，点击切换`}
        >
          {filter.dir === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {/* 出版社多选 */}
      {publishers.length > 0 && (
        <ChipGroup
          title="出版社"
          options={publishers}
          selected={filter.publishers}
          counts={pubCounts}
          onToggle={(v) => toggle('publishers', v)}
        />
      )}
      {/* 学科多选 */}
      {categories.length > 0 && (
        <ChipGroup
          title="学科"
          options={categories}
          selected={filter.categories}
          counts={catCounts}
          onToggle={(v) => toggle('categories', v)}
        />
      )}
      {/* 类型多选 */}
      {types.length > 0 && (
        <ChipGroup
          title="类型"
          options={types.map(cfpTypeLabel)}
          values={types}
          selected={filter.types}
          counts={tyCounts}
          onToggle={(v) => toggle('types', v)}
        />
      )}
      {/* SJR 分区多选（依赖 journal_meta.json，无数据时隐藏） */}
      {qCounts.size > 0 && (
        <ChipGroup
          title="分区（SJR）"
          options={['Q1', 'Q2', 'Q3', 'Q4'].filter((q) => qCounts.has(q))}
          selected={filter.quartiles}
          counts={qCounts}
          onToggle={(v) => toggle('quartiles', v)}
        />
      )}

      {activeCount > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>已选 {activeCount} 个筛选条件</span>
          <button
            onClick={() => setFilter({ ...filter, publishers: [], categories: [], types: [], quartiles: [], range: 'all' })}
            className="text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            清空筛选
          </button>
        </div>
      )}

      {/* 显示已过期开关：默认关闭，保持「向前看」；开启后允许加载并展示早于当前月的分片 */}
      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showExpired}
          onChange={onToggleExpired}
          className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500"
        />
        显示已过期（含早于当前月的分片）
      </label>
    </div>
  );
}

interface ChipGroupProps {
  title: string;
  options: string[];
  values?: string[];
  selected: string[];
  counts: Map<string, number>;
  onToggle: (v: string) => void;
}

function ChipGroup({ title, options, values, selected, counts, onToggle }: ChipGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? options : options.slice(0, 8);
  const keys = values ?? options;
  return (
    <div>
      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((opt, i) => {
          const k = keys[i];
          const on = selected.includes(k);
          const c = counts.get(k) ?? 0;
          return (
            <button
              key={k}
              onClick={() => onToggle(k)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                on
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/25'
                  : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500'
              }`}
            >
              {opt} <span className="opacity-70">({c})</span>
            </button>
          );
        })}
        {options.length > 8 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs px-2.5 py-1 text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            {expanded ? '收起' : `+${options.length - 8} 更多`}
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// 子组件：期刊指标徽章（SCImago 口径，免费数据源）
// ───────────────────────────────────────────────────────────────────

/** 分区徽章配色（Q1 金 / Q2 蓝 / Q3 绿 / Q4 灰） */
const QUARTILE_CLASS: Record<string, string> = {
  Q1: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  Q2: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  Q3: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  Q4: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function metricTitle(m: JournalMetric): string {
  const parts: string[] = ['SCImago 指标（免费口径，非 Clarivate JCR）'];
  if (m.q) parts.push(`分区 ${m.q}`);
  if (m.s != null) parts.push(`SJR ${m.s}`);
  if (m.h != null) parts.push(`H 指数 ${m.h}`);
  if (m.oa === 1) parts.push('开放获取');
  return parts.join('｜');
}

function MetricBadge({ metric }: { metric?: JournalMetric }) {
  if (!metric) return null;
  const qClass = QUARTILE_CLASS[metric.q ?? ''] ?? QUARTILE_CLASS.Q4;
  return (
    <span
      className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium ${qClass}`}
      title={metricTitle(metric)}
    >
      {metric.q ? metric.q : 'SJR'}
      {metric.s != null && ` · SJR ${metric.s.toFixed(2)}`}
      {metric.oa === 1 && ' · OA'}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────
// 子组件：单条 CFP 卡片
// ───────────────────────────────────────────────────────────────────
function CFPCard({ record, now, metric }: { record: CFPRecord; now: number; metric?: JournalMetric }) {
  const [expanded, setExpanded] = useState(false);
  const rolling = Boolean(record.rolling);
  const days = daysUntil(record.dt, now);
  const urgency = urgencyOf(days, rolling);
  const pStyle = publisherStyle(record.p);
  return (
    <article className="relative bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md hover:shadow-indigo-500/5 transition-all">
      {/* 左侧紧迫度色条 */}
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${URGENCY_STRIPE[urgency]}`} aria-hidden />
      <div className="p-3 sm:p-4 pl-4 sm:pl-5 flex items-start gap-3">
        {/* 期刊头像 */}
        <div
          className={`w-9 h-9 rounded-lg ${pStyle.avatar} text-white flex items-center justify-center font-semibold text-sm shrink-0 select-none`}
          title={record.j}
        >
          {publisherInitial(record.j)}
        </div>

        <div className="flex-1 min-w-0">
          {/* 标题 + 链接 */}
          <div className="flex items-start gap-2">
            <a
              href={record.u}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 leading-snug line-clamp-2"
            >
              {record.t}
            </a>
            <a
              href={record.u}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-indigo-500 shrink-0 mt-0.5"
              aria-label="在原文打开"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* 期刊 + 指标 + 出版社 + 学科 */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className={`px-2 py-0.5 rounded-md ${pStyle.badge}`}>{record.p}</span>
            <span className="text-gray-700 dark:text-gray-300 font-medium">{record.j}</span>
            <MetricBadge metric={metric} />
            <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
              {record.c}
            </span>
            <span className="text-gray-500 dark:text-gray-400">{cfpTypeLabel(record.ty)}</span>
            {record.jn > 1 && (
              <span className="text-gray-500 dark:text-gray-400" title="参与期刊数">
                · {record.jn} 本刊
              </span>
            )}
          </div>

          {/* 描述（可展开） */}
          {record.x && (
            <div className="mt-2">
              <p className={`text-xs text-gray-600 dark:text-gray-400 ${expanded ? '' : 'line-clamp-2'}`}>
                {record.x}
              </p>
              {record.x.length > 120 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-0.5"
                >
                  {expanded ? '收起' : '展开'}
                </button>
              )}
            </div>
          )}

          {/* 标签 */}
          {record.g && record.g.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {record.g.slice(0, 4).map((tag) => (
                <span key={tag} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 右侧：倒计时胶囊 */}
        <div className="text-right shrink-0 w-24 sm:w-28">
          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium bg-gray-50 dark:bg-gray-800/80 ${urgencyClass(days, rolling)}`}>
            {formatCountdown(days, rolling)}
          </span>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
            {rolling ? '长期开放' : formatDate(record.d)}
          </div>
          {!rolling && record.ad && record.ad !== record.d && (
            <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              摘要 {formatDate(record.ad)}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ───────────────────────────────────────────────────────────────────
// 子组件：分页器
// ───────────────────────────────────────────────────────────────────

/** 生成带省略号的页码序列：1 … p-1 p p+1 … N */
function pageSequence(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = new Set<number>([1, 2, current - 1, current, current + 1, total - 1, total]);
  const sorted = [...wanted].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const seq = pageSequence(page, totalPages);
  const btn = 'min-w-[2rem] h-8 px-2 inline-flex items-center justify-center rounded-lg text-sm border transition-colors select-none';
  return (
    <nav className="flex items-center justify-center gap-1 mt-4 flex-wrap" aria-label="分页">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className={`${btn} bg-white dark:bg-[#161b22] border-gray-300 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:border-indigo-400`}
        aria-label="上一页"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      {seq.map((p, i) =>
        p === '…' ? (
          <span key={`dots-${i}`} className="w-6 text-center text-gray-400 select-none">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPage(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`${btn} ${
              p === page
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/25 font-medium'
                : 'bg-white dark:bg-[#161b22] border-gray-300 dark:border-gray-700 hover:border-indigo-400'
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        className={`${btn} bg-white dark:bg-[#161b22] border-gray-300 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:border-indigo-400`}
        aria-label="下一页"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
}

// ───────────────────────────────────────────────────────────────────
// 子组件：列表 + 分页
// ───────────────────────────────────────────────────────────────────
const PAGE_SIZE = 30;

interface ListAreaProps {
  records: CFPRecord[];
  filtered: CFPRecord[];
  now: number;
  hasFilter: boolean;
  filterSignature: string;
  onLoadMore: () => void;
  loadingMore: boolean;
  hasMoreMonths: boolean;
  journalMeta: Map<string, JournalMetric>;
  index: CfpIndex | null;
  activeFacets: { publishers: string[]; categories: string[]; types: string[] };
  showExpired: boolean;
  onShowExpired: () => void;
}

function ListArea({ records, filtered, now, hasFilter, filterSignature, onLoadMore, loadingMore, hasMoreMonths, journalMeta, index, activeFacets, showExpired, onShowExpired }: ListAreaProps) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // 筛选条件变化时回到第一页（加载更多月份不重置）
  const prevSig = useRef(filterSignature);
  useEffect(() => {
    if (prevSig.current !== filterSignature) {
      prevSig.current = filterSignature;
      setPage(1);
    }
  }, [filterSignature]);

  const safePage = Math.min(page, totalPages);
  const visible = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );
  const onLastPage = safePage >= totalPages;

  const goto = useCallback((p: number) => {
    setPage(Math.min(Math.max(1, p), totalPages));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [totalPages]);

  // 解释性空状态：某筛选维度下确有数据，但全部位于已过期（早于当前月）月份。
  // 此时给出总条数 + 最近截止月份，并提供「查看全部（含已过期）」按钮，
  // 点击后开启「显示已过期」并加载对应月份。facet_months 缺失时降级为通用空状态。
  const expiredInfo = useMemo(() => {
    if (filtered.length > 0) return null;
    const hasFacet =
      activeFacets.publishers.length > 0 ||
      activeFacets.categories.length > 0 ||
      activeFacets.types.length > 0;
    if (!hasFacet || !index) return null;
    const candidates = selectMonthsForFacets(index, activeFacets);
    if (!candidates || candidates.length === 0) return null;
    const current = monthKeyOf();
    const allPast = candidates.every((k) => k < current);
    if (!allPast || showExpired) return null;

    let total = 0;
    const sumCounts = (list: { name: string; count: number }[] | undefined, set: Set<string>) =>
      (list ?? []).filter((x) => set.has(x.name)).reduce((s, x) => s + x.count, 0);
    if (activeFacets.publishers.length > 0) {
      total = sumCounts(index.publishers, new Set(activeFacets.publishers));
    } else if (activeFacets.categories.length > 0) {
      total = sumCounts(index.categories, new Set(activeFacets.categories));
    } else if (activeFacets.types.length > 0) {
      total = sumCounts(index.types, new Set(activeFacets.types));
    }
    const latestMonth = candidates.reduce((a, b) => (b > a ? b : a), candidates[0]);
    return { total, latestMonth };
  }, [filtered.length, activeFacets, index, showExpired]);

  if (filtered.length === 0 && records.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
        正在加载数据…
      </div>
    );
  }
  if (filtered.length === 0) {
    if (expiredInfo && expiredInfo.total > 0) {
      return (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Filter className="w-6 h-6 mx-auto mb-2 opacity-50" />
          <p className="text-sm">
            该筛选维度下共 <span className="font-medium text-gray-700 dark:text-gray-300">{expiredInfo.total}</span> 条，
            但全部位于已过期月份（最近截止 {expiredInfo.latestMonth}）
          </p>
          <button
            onClick={onShowExpired}
            className="mt-3 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 inline-flex items-center gap-2"
          >
            <Clock className="w-4 h-4" />
            查看全部 {expiredInfo.total} 条（含已过期）
          </button>
        </div>
      );
    }
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <Filter className="w-6 h-6 mx-auto mb-2 opacity-50" />
        <p>没有匹配的 CFP</p>
        {hasFilter && <p className="text-xs mt-1">尝试调整搜索词或清空筛选</p>}
        {hasMoreMonths && (
          <>
            <p className="text-xs mt-1 text-indigo-600 dark:text-indigo-400">
              匹配结果可能位于未加载的月份分片中
            </p>
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="mt-3 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
              {loadingMore ? '加载中…' : (
                <>
                  <Sparkles className="w-4 h-4" />
                  加载更多月份分片
                </>
              )}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 px-1 flex items-center justify-between">
        <span>共 {filtered.length.toLocaleString()} 条匹配</span>
        {totalPages > 1 && <span>第 {safePage} / {totalPages} 页</span>}
      </div>
      <div className="space-y-2">
        {visible.map((r) => (
          <CFPCard key={r.id} record={r} now={now} metric={r.is ? journalMeta.get(r.is) : undefined} />
        ))}
      </div>

      {/* 末页且还有未加载月份 → 提供加载更多分片入口 */}
      {onLastPage && hasMoreMonths && (
        <div className="mt-4">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="w-full py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
            {loadingMore ? '加载中…' : (
              <>
                <Sparkles className="w-4 h-4" />
                加载更多月份分片
              </>
            )}
          </button>
        </div>
      )}

      <Pagination page={safePage} totalPages={totalPages} onPage={goto} />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────
// 子组件：加载 / 错误状态
// ───────────────────────────────────────────────────────────────────
function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0d1117]">
      <div className="text-center">
        <Loader2 className="w-8 h-8 mx-auto animate-spin text-indigo-600 dark:text-indigo-400 mb-3" />
        <p className="text-gray-700 dark:text-gray-300">{message}</p>
      </div>
    </div>
  );
}

function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0d1117] px-4">
      <div className="text-center max-w-md">
        <p className="text-red-600 dark:text-red-400 font-medium mb-2">数据加载失败</p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{error}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          重试
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// 主组件
// ───────────────────────────────────────────────────────────────────
export default function App() {
  const { theme, toggleTheme } = useTheme();
  const now = useNow(NOW_TICK_MS);
  const [phase, setPhase] = useState<LoadPhase>('idle');
  const [error, setError] = useState('');
  const [index, setIndex] = useState<CfpIndex | null>(null);
  const [loadedKeys, setLoadedKeys] = useState<Set<string>>(new Set());
  const [records, setRecords] = useState<CFPRecord[]>([]);
  const [journalMeta, setJournalMeta] = useState<Map<string, JournalMetric>>(new Map());
  const [filter, setFilterRaw] = useState<CfpFilterState>(DEFAULT_FILTER_STATE);
  const [loadingMore, setLoadingMore] = useState(false);
  const initialMount = useRef(true);

  // URL → state（首屏）
  useEffect(() => {
    setFilterRaw(parseFilterState(window.location.search));
  }, []);

  // state → URL（防抖）
  const debouncedFilter = useDebounce(filter, SEARCH_DEBOUNCE_MS);
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    const next = serializeFilterState(debouncedFilter);
    const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
    window.history.replaceState({}, '', url);
  }, [debouncedFilter]);

  // 初始加载：index + 首屏月份分片
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        setPhase('loading-index');
        resetShardCache();
        setLoadedKeys(new Set());
        setRecords([]);

        const idx = await fetchIndex(ctrl.signal);
        setIndex(idx);

        // 期刊指标（可选增强数据：缺失/失败时静默降级为空表，不影响主流程）
        fetchJournalMeta(ctrl.signal)
          .then((m) => setJournalMeta(new Map(Object.entries(m))))
          .catch(() => setJournalMeta(new Map()));

        const initialKeys = selectInitialMonths(idx);
        if (initialKeys.length === 0) {
          setPhase('ready');
          return;
        }

        setPhase('loading-shards');
        const loaded = await Promise.all(
          initialKeys.map(async (k) => [k, await loadShard(idx, k, ctrl.signal)] as const),
        );
        const merged = loaded.flatMap(([, recs]) => recs);
        setRecords(merged);
        setLoadedKeys(new Set(initialKeys));
        setPhase('ready');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setError((e as Error).message);
          setPhase('error');
        }
      }
    })();
    return () => ctrl.abort();
  }, []);

  const setFilter = useCallback((f: CfpFilterState) => setFilterRaw(f), []);

  const filtered = useMemo(() => filterRecords(records, filter, now.getTime(), journalMeta), [records, filter, now, journalMeta]);
  const sorted = useMemo(() => sortRecords(filtered, filter.sort, filter.dir, now.getTime()), [filtered, filter.sort, filter.dir, now]);
  const stats = useMemo(() => computeStats(records, index, now.getTime()), [records, index, now]);

  const publisherList = useMemo(() => index?.publishers.map((p) => p.name) ?? [], [index]);
  const categoryList = useMemo(() => index?.categories.map((c) => c.name) ?? [], [index]);
  const typeList = useMemo(() => index?.types.map((t) => t.name) ?? [], [index]);

  // 筛选签名：仅筛选条件变化时分页回到第一页（数据追加不重置）
  const filterSignature = useMemo(
    () =>
      [
        filter.search, filter.range, filter.sort, filter.dir,
        filter.publishers.join(','), filter.categories.join(','),
        filter.types.join(','), filter.quartiles.join(','),
      ].join('|'),
    [filter],
  );

  // 「显示已过期」开关：开启后允许加载并展示早于当前月的分片（默认关闭，保持向前看）
  const [showExpired, setShowExpired] = useState(false);
  // 自动扩展时的轻量提示（如「已自动扩展到 2026-08 以匹配你的筛选」）
  const [expansionHint, setExpansionHint] = useState<string | null>(null);

  // 筛选感知的自动范围扩展：
  // 当激活 publisher / category / type 且已加载月份里匹配结果为 0，但 selectMonthsForFacets
  // 算出的候选月份里还有未加载的（且未被「显示已过期」屏蔽），自动分批加载，直到出现结果或候选穷尽。
  // index.facet_months 缺失时 selectMonthsForFacets 返回 null，此处优雅降级为原行为（不自动扩展）。
  const facetSig = `${filter.publishers.join(',')}|${filter.categories.join(',')}|${filter.types.join(',')}|${showExpired}`;
  const autoExpandedSig = useRef<string>('');

  useEffect(() => {
    if (!index) return;
    const hasFacet = filter.publishers.length > 0 || filter.categories.length > 0 || filter.types.length > 0;
    if (!hasFacet) {
      setExpansionHint(null);
      autoExpandedSig.current = '';
      return;
    }
    const candidates = selectMonthsForFacets(index, {
      publishers: filter.publishers,
      categories: filter.categories,
      types: filter.types,
    });
    if (!candidates) return; // facet_months 缺失 → 降级

    const current = monthKeyOf(now);
    let targets = candidates.filter((k) => !loadedKeys.has(k));
    if (!showExpired) targets = targets.filter((k) => k >= current);

    // 仅当当前尚无匹配结果、且本次筛选签名尚未自动扩展过时，才自动加载
    if (sorted.length > 0) return;
    if (targets.length === 0) return;
    if (autoExpandedSig.current === facetSig) return;
    autoExpandedSig.current = facetSig;
    setExpansionHint(null);

    (async () => {
      setLoadingMore(true);
      try {
        const loaded: string[] = [];
        for (let i = 0; i < targets.length; i += LOAD_MORE_MONTH_SPAN) {
          const batch = targets.slice(i, i + LOAD_MORE_MONTH_SPAN);
          const res = await Promise.all(
            batch.map(async (k) => [k, await loadShard(index, k)] as const),
          );
          const recs = res.flatMap(([, r]) => r);
          setRecords((prev) => [...prev, ...recs]);
          setLoadedKeys((prev) => {
            const n = new Set(prev);
            batch.forEach((k) => n.add(k));
            return n;
          });
          loaded.push(...batch);
        }
        if (loaded.length > 0) {
          setExpansionHint(`已自动扩展到 ${loaded.join('、')} 以匹配你的筛选`);
        }
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [index, filter.publishers, filter.categories, filter.types, showExpired, loadedKeys, sorted.length, now, facetSig]);

  // 加载更多月份
  const handleLoadMore = useCallback(async () => {
    if (!index) return;
    const nextKeys = selectNextMonths(index, loadedKeys, now, LOAD_MORE_MONTH_SPAN, showExpired);
    if (nextKeys.length === 0) return;
    setLoadingMore(true);
    try {
      const more = await Promise.all(
        nextKeys.map(async (k) => [k, await loadShard(index, k)] as const),
      );
      setRecords((prev) => [...prev, ...more.flatMap(([, recs]) => recs)]);
      setLoadedKeys((prev) => {
        const n = new Set(prev);
        for (const k of nextKeys) n.add(k);
        return n;
      });
    } finally {
      setLoadingMore(false);
    }
  }, [index, loadedKeys, now, showExpired]);
  const hasMoreMonths = useMemo(() => {
    if (!index) return false;
    const all = listMonthKeys(index).filter((k) => k !== 'rolling');
    const current = monthKeyOf();
    return all.some((k) => (showExpired ? !loadedKeys.has(k) : k >= current && !loadedKeys.has(k)));
  }, [index, loadedKeys, showExpired]);

  // 顶级渲染
  if (phase === 'idle' || phase === 'loading-index') {
    return <LoadingScreen message="加载索引…" />;
  }
  if (phase === 'error') {
    return (
      <ErrorScreen
        error={error}
        onRetry={() => {
          setError('');
          setPhase('idle');
          setLoadedKeys(new Set());
          setRecords([]);
          // 触发重新加载：改变 phase 让 useEffect 重新跑
          setTimeout(() => setPhase('idle'), 0);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-gray-100">
      <Header index={index} theme={theme} onToggleTheme={toggleTheme} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {phase === 'loading-shards' && records.length === 0 ? (
          <LoadingScreen message={`加载 ${selectInitialMonths(index!).length} 个月份分片…`} />
        ) : (
          <>
            <StatsBar stats={stats} index={index} />
            <FilterBar
              filter={filter}
              setFilter={setFilter}
              records={records}
              publishers={publisherList}
              categories={categoryList}
              types={typeList}
              journalMeta={journalMeta}
              index={index}
              showExpired={showExpired}
              onToggleExpired={() => setShowExpired((v) => !v)}
            />
            {expansionHint && (
              <div className="mb-3 text-center text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-lg py-2 px-3">
                <Sparkles className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                {expansionHint}
              </div>
            )}
            <ListArea
              records={records}
              filtered={sorted}
              now={now.getTime()}
              hasFilter={hasAnyFilter(filter)}
              filterSignature={filterSignature}
              onLoadMore={handleLoadMore}
              loadingMore={loadingMore}
              hasMoreMonths={hasMoreMonths}
              journalMeta={journalMeta}
              index={index}
              activeFacets={{ publishers: filter.publishers, categories: filter.categories, types: filter.types }}
              showExpired={showExpired}
              onShowExpired={() => setShowExpired(true)}
            />
            {index && (
              <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
                <TrendingUp className="w-3 h-3 inline mr-1 -mt-0.5" />
                全库共 {index.total.toLocaleString()} 条 · 已加载 {records.length.toLocaleString()} 条
                {index.rolling_count ? ` · 含滚动征稿 ${index.rolling_count.toLocaleString()} 条` : ''}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
