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
import type { ReactNode } from 'react';
import {
  BarChart3,
  Bookmark,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Download,
  ExternalLink,
  EyeOff,
  Filter,
  Flame,
  Globe,
  Infinity as InfinityIcon,
  Keyboard,
  LayoutGrid,
  LayoutList,
  Loader2,
  Moon,
  Palette,
  Save,
  Scale,
  Search,
  Sparkles,
  Star,
  Sun,
  TrendingUp,
  X,
} from 'lucide-react';

import type {
  BucketMode,
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
import { aggregateHistogramCounts } from './lib/histogram';
import { useFavorites } from './hooks/useFavorites';
import { generateICS, downloadICS, icsFilename } from './lib/ics';
import type { IcsEventInput } from './lib/ics';
import DensityHistogram from './components/DensityHistogram';
import MonthCalendar from './components/MonthCalendar';
import {
  DEFAULT_FILTER_STATE,
  computeStats,
  countActiveFilters,
  daysUntil,
  filterRecords,
  liveFacetCounts,
  normalizeCustomDays,
  CUSTOM_DAYS_MAX,
  CUSTOM_DAYS_MIN,
  hasAnyFilter,
  sortRecords,
} from './lib/filters';
import { parseFilterState, serializeFilterState } from './lib/urlState';
import { useTheme } from './hooks/useTheme';
import { useNow } from './hooks/useNow';
import { useDebounce } from './hooks/useDebounce';
import { SHORTCUT_HELP, useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { LOAD_MORE_MONTH_SPAN, NOW_TICK_MS, SEARCH_DEBOUNCE_MS } from './lib/constants';
import { countdownState, isNearDeadline } from './lib/countdown';
import { deadlineTimeZones, getLocalTimeZone, AOE_HINT } from './lib/timezone';
import { relativeTime, formatAbsoluteTime } from './lib/relativeTime';
import { loadSkin, saveSkin, SKIN_LABELS } from './lib/skin';
import type { Skin } from './lib/skin';
import { diversifyByPublisher } from './lib/quota';
import type { SavedView } from './lib/savedViews';
import {
  addSavedView,
  appliedViewName,
  loadSavedViews,
  removeSavedView,
  saveSavedViews,
} from './lib/savedViews';

// ───────────────────────────────────────────────────────────────────
// 倒计时颜色策略（urgency 语义）
// ───────────────────────────────────────────────────────────────────

/**
 * 紧迫度档位（P1-2：从 7 档收敛为语义 4 档 + 2 个非语义态）。
 *
 * 4 个语义档：critical ≤7 天 / soon ≤30 天 / later >30 天 / expired 已截止
 * 2 个非语义态：rolling（滚动征稿，无截止日）/ na（日期缺失）
 *
 * 原来 critical(≤3) 与 soon(≤7) 两档在视觉上几乎不可分（红 vs 橙），
 * 但认知上要记两套含义，合并为「≤7 天 = 紧急」后可读性更好。
 */
type Urgency = 'rolling' | 'na' | 'expired' | 'critical' | 'soon' | 'later';

/** 语义档的中文标签，供无障碍与 tooltip 使用 */
const URGENCY_LABEL: Record<Urgency, string> = {
  rolling: '滚动征稿',
  na: '日期未知',
  expired: '已截止',
  critical: '紧急（7 天内）',
  soon: '临近（30 天内）',
  later: '充裕（30 天以上）',
};

/** 列表呈现方式：卡片（信息全）/ 紧凑行（密度高）/ 日历（月历副视图，P2-1） */
type ViewMode = 'card' | 'row' | 'cal';
const VIEW_MODE_KEY = 'journal-cfp-ddl:view';

/** 把 localStorage 里的字符串收敛为合法 ViewMode */
function parseViewMode(raw: string | null): ViewMode {
  return raw === 'row' || raw === 'cal' ? raw : 'card';
}

/** 出版社占比面板是否展开 */
const PREF_PUB_DIST = 'journal-cfp-ddl:pubdist';
/** 列表里「已过期」分组是否展开 */
const PREF_EXPIRED_OPEN = 'journal-cfp-ddl:expired-open';

/**
 * 读取布尔型界面偏好。localStorage 在隐私模式下可能不可读/不可写，
 * 这里的读写全部包了 try-catch，失败时静默回退默认值。
 */
function loadPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function savePref(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* 隐私模式下不可写，忽略即可 */
  }
}

function urgencyOf(days: number, rolling: boolean): Urgency {
  if (rolling) return 'rolling';
  if (Number.isNaN(days)) return 'na';
  if (days < 0) return 'expired';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'soon';
  return 'later';
}

const URGENCY_TEXT: Record<Urgency, string> = {
  rolling: 'text-purple-600 dark:text-purple-400',
  na: 'text-gray-500 dark:text-gray-400',
  expired: 'text-gray-400 dark:text-gray-500 line-through',
  critical: 'text-red-600 dark:text-red-400 font-semibold',
  soon: 'text-amber-700 dark:text-amber-400 font-medium',
  later: 'text-emerald-700 dark:text-emerald-400',
};

const URGENCY_STRIPE: Record<Urgency, string> = {
  rolling: 'bg-purple-500',
  na: 'bg-gray-300 dark:bg-gray-700',
  expired: 'bg-gray-300 dark:bg-gray-700',
  critical: 'bg-red-500',
  soon: 'bg-amber-500',
  later: 'bg-emerald-500',
};

function urgencyClass(days: number, rolling: boolean): string {
  return URGENCY_TEXT[urgencyOf(days, rolling)];
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
  favoritesCount: number;
  favoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  onExportCurrent: () => void;
  onExportFavorites: () => void;
  currentResultCount: number;
  now: number;
  savedViews: SavedView[];
  onApplyView: (view: SavedView) => void;
  onDeleteView: (name: string) => void;
  appliedView: string | null;
  skin: Skin;
  onToggleSkin: () => void;
}

/**
 * 全站 iCal 订阅源的绝对地址（P2-2）。
 * 源文件由 `scripts/build_site_data.py` 在构建期预生成到 `public/data/cfp.ics`，
 * 内容为未来 180 天内截止的条目（上限 3000 条）。
 */
function absoluteIcsUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}${base.endsWith('/') ? base : `${base}/`}data/cfp.ics`;
}

function Header({
  index,
  theme,
  onToggleTheme,
  favoritesCount,
  favoritesOnly,
  onToggleFavoritesOnly,
  onExportCurrent,
  onExportFavorites,
  currentResultCount,
  now,
  savedViews,
  onApplyView,
  onDeleteView,
  appliedView,
  skin,
  onToggleSkin,
}: HeaderProps) {
  const updatedRelative = index ? relativeTime(Date.parse(index.generated_at), now) : '';
  const updatedAbsolute = index ? formatAbsoluteTime(index.generated_at) : '';
  // P2-2：订阅源地址在浏览器端按当前站点根拼接，webcal:// 交给日历客户端
  const icsUrl = absoluteIcsUrl();
  const subscribeUrl = icsUrl.replace(/^https?:/, 'webcal:');
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
                <span title={updatedAbsolute} className="cursor-help">
                  数据更新于 {updatedRelative}
                </span>
                {' · '}窗口 {index.window_months} 个月 · 共 {index.total.toLocaleString()} 条
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* 皮肤切换：精致 / 简约（两套视觉语言，同一套功能） */}
          <button
            onClick={onToggleSkin}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1"
            aria-label={`切换皮肤，当前：${SKIN_LABELS[skin].name}`}
            title={`皮肤：${SKIN_LABELS[skin].name} —— ${SKIN_LABELS[skin].hint}（点击切换）`}
          >
            <Palette className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">{SKIN_LABELS[skin].name}</span>
          </button>

          {/* 收藏夹开关 + 角标 */}
          <button
            onClick={onToggleFavoritesOnly}
            className={`relative p-2 rounded-lg border transition-colors ${
              favoritesOnly
                ? 'border-amber-400 text-amber-500 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            aria-label="只看收藏"
            title={favoritesOnly ? '取消只看收藏' : '只看收藏'}
          >
            <Star className={`w-4 h-4 ${favoritesOnly ? 'fill-amber-400 text-amber-400' : ''}`} />
            {favoritesCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold flex items-center justify-center">
                {favoritesCount}
              </span>
            )}
          </button>

          {/* 已保存视图下拉（竞品均未提供，真空白） */}
          <details className="relative">
            <summary
              className="list-none p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer flex items-center"
              aria-label="已保存视图"
              title="已保存视图"
            >
              <Bookmark className={`w-4 h-4 ${appliedView ? 'fill-indigo-500 text-indigo-500' : ''}`} />
            </summary>
            <div className="absolute right-0 mt-1 w-60 z-40 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#161b22] shadow-lg py-1 text-sm">
              {savedViews.length === 0 ? (
                <p className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">
                  暂无保存的视图。在筛选栏点「保存当前视图」即可创建。
                </p>
              ) : (
                savedViews.map((v) => (
                  <div
                    key={v.name}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <button
                      onClick={() => onApplyView(v)}
                      className={`flex-1 text-left truncate ${
                        appliedView === v.name
                          ? 'text-indigo-600 dark:text-indigo-400 font-medium'
                          : 'text-gray-700 dark:text-gray-200'
                      }`}
                      title={appliedView === v.name ? '当前已应用此视图' : `应用视图：${v.name}`}
                    >
                      {v.name}
                    </button>
                    <button
                      onClick={() => onDeleteView(v.name)}
                      className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 shrink-0"
                      aria-label={`删除视图 ${v.name}`}
                      title="删除视图"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </details>

          {/* ICS 导出（当前结果 / 收藏） */}
          <details className="relative">
            <summary
              className="list-none p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer flex items-center"
              aria-label="导出日历"
              title="导出日历（ICS）"
            >
              <Download className="w-4 h-4" />
            </summary>
            <div className="absolute right-0 mt-1 w-56 z-40 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#161b22] shadow-lg py-1 text-sm">
              <button
                onClick={onExportCurrent}
                className="w-full text-left px-3 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5 text-indigo-500" />
                导出当前结果（{currentResultCount}）
              </button>
              <button
                onClick={onExportFavorites}
                className="w-full text-left px-3 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={favoritesCount === 0}
              >
                <Star className="w-3.5 h-3.5 text-amber-500" />
                导出收藏（{favoritesCount}）
              </button>
              {/* P2-2：构建期预生成的全站订阅源（未来 180 天 / 3000 条上限） */}
              <a
                href={subscribeUrl}
                className="w-full text-left px-3 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 border-t border-gray-100 dark:border-gray-800"
                title="用日历客户端订阅，截止日自动同步更新"
              >
                <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                订阅全站日历（webcal）
              </a>
              <a
                href={icsUrl}
                download="journal-cfp-deadlines.ics"
                className="w-full text-left px-3 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                下载 .ics 文件（1.3MB）
              </a>
            </div>
          </details>

          <button
            onClick={onToggleTheme}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="切换主题"
            title={theme === 'dark' ? '切换到浅色' : '切换到深色'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
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

  // 出版社占比默认折叠：它是"看一眼就好"的元信息，不是日常浏览需要的。
  // 折叠态只留一条摘要（头部出版社 + 占比），想细看再点开，偏好持久化。
  const [distOpen, setDistOpen] = useState(
    () => loadPref(PREF_PUB_DIST, false),
  );
  useEffect(() => {
    savePref(PREF_PUB_DIST, distOpen);
  }, [distOpen]);

  // 出版社真实占比（透明化：让读者知道分布是真实的，而非被均衡视图掩盖）
  const pubDist = useMemo(() => {
    if (!index || index.publishers.length === 0) return [];
    const total = index.publishers.reduce((s, p) => s + p.count, 0) || 1;
    return [...index.publishers]
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
      .map((p) => ({ name: p.name, pct: (p.count / total) * 100 }));
  }, [index]);

  return (
    <>
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

      {pubDist.length > 0 && (
        <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-xl mb-4">
          <button
            onClick={() => setDistOpen((v) => !v)}
            aria-expanded={distOpen}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            title={distOpen ? '收起出版社占比' : '展开出版社占比'}
          >
            <BarChart3 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              全库出版社占比
              {!distOpen && pubDist[0] && (
                <span className="ml-1 text-gray-400 dark:text-gray-500">
                  · {pubDist[0].name} {pubDist[0].pct.toFixed(1)}%
                </span>
              )}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 ml-auto shrink-0 transition-transform ${distOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {distOpen && (
            <div className="px-3 pb-3">
              <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                {pubDist.map((p) => (
                  <div
                    key={p.name}
                    className="h-full bg-indigo-500 dark:bg-indigo-400"
                    style={{ width: `${p.pct}%` }}
                    title={`${p.name} ${p.pct.toFixed(1)}%`}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                {pubDist.map((p) => (
                  <span key={p.name} className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-indigo-500 dark:bg-indigo-400" />
                    {p.name} {p.pct.toFixed(1)}%
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
                这是全库真实分布，均衡视图只改变排序，不改变此处数字。
              </p>
            </div>
          )}
        </div>
      )}
    </>
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
  nowMs: number;
  showExpired: boolean;
  onToggleExpired: () => void;
  favoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  onSaveView: (name: string) => void;
  balanced: boolean;
  onToggleBalanced: () => void;
  hideMdpiRolling: boolean;
  onToggleHideMdpiRolling: () => void;
}

const RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'soon', label: '7 天内' },
  { value: 'month', label: '30 天内' },
  { value: 'quarter', label: '90 天内' },
  { value: 'custom', label: '自定义 N 天…' },
];

const SORT_OPTIONS: { value: CfpSortField; label: string }[] = [
  { value: 'deadline', label: '按截止日期' },
  { value: 'journal', label: '按期刊名' },
  { value: 'publisher', label: '按出版社' },
];


interface SearchToolbarProps {
  filter: CfpFilterState;
  setFilter: (f: CfpFilterState) => void;
  activeCount: number;
  facetOpen: boolean;
  onToggleFacetOpen: () => void;
}

/**
 * 顶部工具条：搜索 + 时间范围 + 排序 + 升降序。
 * 窄屏（<lg）额外提供「筛选」按钮展开分面面板；宽屏分面常驻左侧，按钮隐藏。
 */
function SearchToolbar({
  filter,
  setFilter,
  activeCount,
  facetOpen,
  onToggleFacetOpen,
}: SearchToolbarProps) {
  const hasSearch = filter.search.trim().length > 0;
  return (
    <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-xl p-3 sm:p-4 mb-4 shadow-sm">
      <div className="flex gap-2 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="cfp-search"
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
          aria-label="时间范围"
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {/* P1-6：自定义「N 天内」——匹配「我还有 6 周能写完」这类真实诉求 */}
        {filter.range === 'custom' && (
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="number"
              min={CUSTOM_DAYS_MIN}
              max={CUSTOM_DAYS_MAX}
              value={filter.customDays}
              onChange={(e) =>
                setFilter({ ...filter, customDays: normalizeCustomDays(e.target.valueAsNumber) })
              }
              onBlur={(e) =>
                setFilter({ ...filter, customDays: normalizeCustomDays(e.target.valueAsNumber) })
              }
              aria-label="自定义天数"
              className="w-20 py-2 px-2.5 bg-gray-50 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">天内</span>
          </div>
        )}
        <select
          value={filter.sort}
          onChange={(e) => setFilter({ ...filter, sort: e.target.value as CfpSortField })}
          className="py-2 px-3 bg-gray-50 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
          aria-label="排序字段"
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
        <button
          onClick={onToggleFacetOpen}
          aria-expanded={facetOpen}
          className="lg:hidden flex items-center justify-center gap-1.5 py-2 px-3 bg-gray-50 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Filter className="w-3.5 h-3.5" />
          筛选
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[11px] font-medium">
              {activeCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function FilterBar({
  filter,
  setFilter,
  records,
  publishers,
  categories,
  types,
  journalMeta,
  nowMs,
  showExpired,
  onToggleExpired,
  favoritesOnly,
  onToggleFavoritesOnly,
  onSaveView,
  balanced,
  onToggleBalanced,
  hideMdpiRolling,
  onToggleHideMdpiRolling,
}: FilterBarProps) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  // 分面计数口径统一（P1-3）：每组计数 = 在「除本组外所有条件」下的命中数，
  // 也就是「点下去会得到几条」。四组共用一个口径，杜绝点进去 0 条的死路。
  const live = useMemo(
    () => liveFacetCounts(records, filter, nowMs, journalMeta),
    [records, filter, nowMs, journalMeta],
  );

  const toggle = (key: 'publishers' | 'categories' | 'types' | 'quartiles', value: string) => {
    const cur = filter[key];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    setFilter({ ...filter, [key]: next });
  };

  const activeCount = countActiveFilters(filter);

  // 选项按命中数降序：0 命中的沉到末尾（ChipGroup 里会置灰），已选的优先置顶
  const rank = (names: string[], counts: Map<string, number>) =>
    [...names].sort((a, b) => {
      const sa = filter.publishers.includes(a) || filter.categories.includes(a) || filter.types.includes(a) || filter.quartiles.includes(a);
      const sb = filter.publishers.includes(b) || filter.categories.includes(b) || filter.types.includes(b) || filter.quartiles.includes(b);
      if (sa !== sb) return sa ? -1 : 1;
      const d = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
      return d !== 0 ? d : a.localeCompare(b);
    });

  return (
    <div className="space-y-4">
      {/* 出版社多选 */}
      {publishers.length > 0 && (
        <ChipGroup
          title="出版社"
          options={rank(publishers, live.publishers)}
          selected={filter.publishers}
          counts={live.publishers}
          onToggle={(v) => toggle('publishers', v)}
        />
      )}
      {/* 学科多选 */}
      {categories.length > 0 && (
        <ChipGroup
          title="学科"
          options={rank(categories, live.categories)}
          selected={filter.categories}
          counts={live.categories}
          onToggle={(v) => toggle('categories', v)}
        />
      )}
      {/* 类型多选 */}
      {types.length > 0 && (
        <ChipGroup
          title="类型"
          options={rank(types, live.types).map(cfpTypeLabel)}
          values={rank(types, live.types)}
          selected={filter.types}
          counts={live.types}
          onToggle={(v) => toggle('types', v)}
        />
      )}
      {/* SJR 分区多选（依赖 journal_meta.json，无数据时隐藏） */}
      {live.quartiles.size > 0 && (
        <ChipGroup
          title="分区（SJR）"
          options={['Q1', 'Q2', 'Q3', 'Q4'].filter((q) => live.quartiles.has(q))}
          selected={filter.quartiles}
          counts={live.quartiles}
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

      {/* 保存当前筛选为命名视图（竞品均未提供，真空白）。状态写入 localStorage，可在 Header 下拉切换/删除 */}
      <div className="flex items-center gap-2">
        {saveOpen ? (
          <>
            <input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSaveView(saveName);
                  setSaveName('');
                  setSaveOpen(false);
                }
                if (e.key === 'Escape') {
                  setSaveName('');
                  setSaveOpen(false);
                }
              }}
              placeholder="视图名称…"
              className="flex-1 py-1.5 px-2.5 bg-gray-50 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => {
                onSaveView(saveName);
                setSaveName('');
                setSaveOpen(false);
              }}
              className="py-1.5 px-3 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
            >
              保存
            </button>
            <button
              onClick={() => {
                setSaveName('');
                setSaveOpen(false);
              }}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="取消保存视图"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <button
            onClick={() => setSaveOpen(true)}
            className="flex items-center gap-1.5 py-1.5 px-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Save className="w-3.5 h-3.5" />
            保存当前视图
          </button>
        )}
      </div>

      {/* 均衡展示开关：开启后按出版社配额打散，对抗 MDPI 占比过高 */}
      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={balanced}
          onChange={onToggleBalanced}
          className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500"
        />
        <Scale className="w-3.5 h-3.5 text-indigo-500" />
        均衡展示（按出版社配额打散，避免 MDPI 刷屏）
      </label>

      {/* 一键隐藏 MDPI 滚动征稿 */}
      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={hideMdpiRolling}
          onChange={onToggleHideMdpiRolling}
          className="rounded border-gray-300 dark:border-gray-700 text-indigo-600 focus:ring-indigo-500"
        />
        <EyeOff className="w-3.5 h-3.5 text-indigo-500" />
        隐藏 MDPI 滚动征稿
      </label>

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

      {/* 只看收藏开关：开启后仅展示已收藏条目（收藏可能分布在未加载分片，会自动按需加载） */}
      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={favoritesOnly}
          onChange={onToggleFavoritesOnly}
          className="rounded border-gray-300 dark:border-gray-700 text-amber-500 focus:ring-amber-500"
        />
        只看收藏
      </label>
    </div>
  );
}

/**
 * 分面栏容器（P1-1）。
 * - 宽屏 ≥lg：常驻左侧 272px，sticky 吸附，面板内部独立滚动，不再横向挤占结果区；
 * - 窄屏 <lg：由顶部工具条的「筛选」按钮控制展开 / 收起。
 *
 * 分面内容（FilterBar）与容器解耦，两种布局共用同一份 JSX，不重复渲染。
 */
function FacetSidebar({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <aside
      className={`${
        open ? 'block' : 'hidden'
      } lg:block lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1`}
    >
      <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-xl p-3 sm:p-4 shadow-sm mb-4 lg:mb-0">
        {children}
      </div>
    </aside>
  );
}

/** 快捷键帮助浮层（P2-3）：按 `?` 打开，`Esc` 或点击遮罩关闭 */
function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="键盘快捷键"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">键盘快捷键</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="关闭"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <ul className="space-y-1.5">
          {SHORTCUT_HELP.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-gray-600 dark:text-gray-300">{s.desc}</span>
              <kbd className="shrink-0 px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-xs font-mono text-gray-700 dark:text-gray-200">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
          在输入框中打字时快捷键自动失效。
        </p>
      </div>
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
          // 0 命中且未选中 → 禁用，避免点进去空列表（P1-3 死路治理）
          return (
            <button
              key={k}
              onClick={() => onToggle(k)}
              disabled={!on && c === 0}
              title={!on && c === 0 ? '当前其它筛选条件下没有匹配结果' : `${opt}：${c} 条`}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                on
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/25'
                  : c === 0
                    ? 'bg-gray-50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-600 border-gray-200 dark:border-gray-800 cursor-not-allowed'
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
function CFPCard({ record, now, metric, favorite, onToggleFavorite, tz }: { record: CFPRecord; now: number; metric?: JournalMetric; favorite: boolean; onToggleFavorite: (id: string) => void; tz: string }) {
  const [expanded, setExpanded] = useState(false);
  const rolling = Boolean(record.rolling);
  const days = daysUntil(record.dt, now);
  const urgency = urgencyOf(days, rolling);
  const cd = countdownState(record.dt, now, rolling);
  const tzInfo = deadlineTimeZones(record.dt, record.d, tz);
  const pStyle = publisherStyle(record.p);
  return (
    <article className="relative bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md hover:shadow-indigo-500/5 transition-all">
      {/* 左侧紧迫度色条 */}
      <span
        className={`absolute left-0 top-0 bottom-0 w-1 ${URGENCY_STRIPE[urgency]}`}
        title={URGENCY_LABEL[urgency]}
        aria-label={URGENCY_LABEL[urgency]}
      />
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

        {/* 右侧：收藏星标 + 倒计时 + 时区 + CTA */}
        <div className="text-right shrink-0 w-32 sm:w-40 flex flex-col items-end gap-1">
          <button
            onClick={() => onToggleFavorite(record.id)}
            className={`p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
              favorite ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'
            }`}
            aria-label={favorite ? '取消收藏' : '收藏'}
            title={favorite ? '取消收藏' : '收藏'}
          >
            <Star className={`w-4 h-4 ${favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>

          {/* 倒计时：三态粒度 + 等宽数字（tabular-nums 防抖动）+ 无障碍 timer
              注意：秒级跳动的 near 区域不加 aria-live，避免逐秒播报 */}
          <div role="timer" aria-atomic="true" aria-roledescription="倒计时" className="flex flex-col items-end">
            <span
              className={`inline-block px-2 py-1 rounded-full text-xs font-medium bg-gray-50 dark:bg-gray-800/80 tabular-nums ${urgencyClass(days, rolling)}`}
            >
              {cd.text}
            </span>
            {/* 文字标签：不依赖颜色即可理解紧迫度 */}
            <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{cd.label}</span>
          </div>

          {/* 时区说明：AoE（统一标注）+ 用户本地时区对应时间 */}
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 text-right break-words" title={tzInfo?.hint}>
            {tzInfo ? (
              <>
                <div className="flex items-center gap-1 justify-end">
                  <Globe className="w-3 h-3 shrink-0" />
                  <span className="tabular-nums">{tzInfo.aoe}</span>
                </div>
                <div className="tabular-nums">{tzInfo.local}</div>
              </>
            ) : (
              <span>长期开放（无截止日）</span>
            )}
          </div>

          {!rolling && record.ad && record.ad !== record.d && (
            <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              摘要 {formatDate(record.ad)}
            </div>
          )}

          {/* CTA：查看征稿详情外链 */}
          <a
            href={record.u}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
            title="在出版商官网查看征稿详情"
          >
            查看征稿详情 <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </article>
  );
}

// ───────────────────────────────────────────────────────────────────
// 子组件：紧凑表格行（P0-4）
//
// 卡片视图 ~110px 一行，一屏只能看 5 条；6 万条数据下扫读极其痛苦。
// 紧凑行 ~44px，同屏能看到 12 条左右，扫读效率翻倍，首屏渲染量反而下降。
// 信息优先级（从左到右）：收藏 → 标题 → 期刊 → 出版社 → 分区 → 学科 → 倒计时 → CTA，
// 窄屏按 md/lg/xl 逐级隐藏次要列，保证标题与倒计时永远可见。
// ───────────────────────────────────────────────────────────────────
function CFPRow({
  record,
  now,
  metric,
  favorite,
  onToggleFavorite,
}: {
  record: CFPRecord;
  now: number;
  metric?: JournalMetric;
  favorite: boolean;
  onToggleFavorite: (id: string) => void;
}) {
  const rolling = Boolean(record.rolling);
  const days = daysUntil(record.dt, now);
  const urgency = urgencyOf(days, rolling);
  const cd = countdownState(record.dt, now, rolling);
  const pStyle = publisherStyle(record.p);

  return (
    <div className="relative flex items-center gap-2 pl-3 pr-2 py-2 border-b border-gray-100 dark:border-gray-800/70 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20 transition-colors group">
      <span
        className={`absolute left-0 top-0 bottom-0 w-0.5 ${URGENCY_STRIPE[urgency]}`}
        title={URGENCY_LABEL[urgency]}
        aria-label={URGENCY_LABEL[urgency]}
      />

      <button
        onClick={() => onToggleFavorite(record.id)}
        className={`p-0.5 rounded shrink-0 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
          favorite ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600 hover:text-gray-500'
        }`}
        aria-label={favorite ? '取消收藏' : '收藏'}
        title={favorite ? '取消收藏' : '收藏'}
      >
        <Star className={`w-3.5 h-3.5 ${favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
      </button>

      <a
        href={record.u}
        target="_blank"
        rel="noopener noreferrer"
        title={record.t}
        className="flex-1 min-w-0 truncate text-sm text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400"
      >
        {record.t}
      </a>

      <span
        className="hidden md:block w-40 shrink-0 truncate text-xs text-gray-600 dark:text-gray-400"
        title={record.j}
      >
        {record.j}
      </span>

      <span
        className={`hidden lg:block w-24 shrink-0 truncate px-1.5 py-0.5 rounded text-[11px] text-center ${pStyle.badge}`}
        title={record.p}
      >
        {record.p}
      </span>

      <span className="hidden sm:block shrink-0">
        <MetricBadge metric={metric} />
      </span>

      <span className="hidden xl:block w-28 shrink-0 truncate text-[11px] text-gray-500 dark:text-gray-500">
        {record.c}
      </span>

      <span
        className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-50 dark:bg-gray-800/80 tabular-nums ${urgencyClass(days, rolling)}`}
        title={cd.label}
      >
        {cd.text}
      </span>

      <a
        href={record.u}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-gray-400 hover:text-indigo-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        aria-label="查看征稿详情"
        title="在出版商官网查看征稿详情"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
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
/** 紧凑行更高更省空间，每页给更多条，翻页次数显著减少 */
const PAGE_SIZE_ROW = 50;

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
  favoritesOnly: boolean;
  favoritesCount: number;
  onLoadFavorites: () => void;
  favHint: string | null;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  tz: string;
  /** 列表呈现方式：卡片（信息全）或紧凑行（密度高） */
  viewMode: ViewMode;
  /** 当前页码（提升到 App，供键盘快捷键 ← → 使用） */
  page: number;
  setPage: (p: number) => void;
}

function ListArea({ records, filtered, now, hasFilter, filterSignature, onLoadMore, loadingMore, hasMoreMonths, journalMeta, index, activeFacets, showExpired, onShowExpired, favoritesOnly, favoritesCount, onLoadFavorites, favHint, favorites, onToggleFavorite, tz, viewMode, page, setPage }: ListAreaProps) {
  const pageSize = viewMode === 'row' ? PAGE_SIZE_ROW : PAGE_SIZE;

  // P0-3：把已过期的条目从主列表里分出来，默认折叠。
  // 用户来这里是「看还能投什么」，已过期的应该让路，但不能消失——
  // 所以单独成组、默认收起、条数可见，想看一眼就点开。
  const { activeAll, expiredAll } = useMemo(() => {
    const active: CFPRecord[] = [];
    const expired: CFPRecord[] = [];
    for (const r of filtered) {
      if (r.rolling) {
        active.push(r);
        continue;
      }
      const d = daysUntil(r.dt, now);
      if (!Number.isNaN(d) && d < 0) expired.push(r);
      else active.push(r);
    }
    return { activeAll: active, expiredAll: expired };
  }, [filtered, now]);

  const [expiredOpen, setExpiredOpen] = useState(() => loadPref(PREF_EXPIRED_OPEN, false));
  useEffect(() => {
    savePref(PREF_EXPIRED_OPEN, expiredOpen);
  }, [expiredOpen]);
  // 全部结果都是已过期时强制展开，避免「有 N 条却一片空白」
  const expiredShown = expiredOpen || activeAll.length === 0;

  // 分页只按未过期条目计算，已过期走下方折叠区
  const totalPages = Math.max(1, Math.ceil(activeAll.length / pageSize));

  // 筛选条件变化时回到第一页（加载更多月份不重置）
  const prevSig = useRef(filterSignature);
  useEffect(() => {
    if (prevSig.current !== filterSignature) {
      prevSig.current = filterSignature;
      setPage(1);
    }
  }, [filterSignature, setPage]);

  const safePage = Math.min(page, totalPages);
  const visible = useMemo(
    () => activeAll.slice((safePage - 1) * pageSize, safePage * pageSize),
    [activeAll, safePage, pageSize],
  );
  const onLastPage = safePage >= totalPages;

  // 折叠区最多先渲染 20 条，避免一次铺开上千条把页面拖垮
  const expiredPreview = expiredShown ? expiredAll.slice(0, 20) : [];

  const goto = useCallback((p: number) => {
    setPage(Math.min(Math.max(1, p), totalPages));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [totalPages, setPage]);

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
    // 收藏夹为空状态（友好提示 + 引导加载未加载分片里的收藏）
    if (favoritesOnly) {
      if (favoritesCount === 0) {
        return (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Star className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p>还没有收藏任何 CFP</p>
            <p className="text-xs mt-1">点击卡片右上角的星标即可收藏，方便以后在这里快速查看</p>
          </div>
        );
      }
      return (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Star className="w-6 h-6 mx-auto mb-2 opacity-50" />
          <p>已收藏的 {favoritesCount} 条里，有一部分还在未加载的月份分片中</p>
          <button
            onClick={onLoadFavorites}
            disabled={loadingMore}
            className="mt-3 px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
            {loadingMore ? '加载中…' : '加载收藏所在月份'}
          </button>
          {favHint && <p className="text-xs mt-2 text-amber-600 dark:text-amber-400">{favHint}</p>}
        </div>
      );
    }
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
        <span>
          共 {activeAll.length.toLocaleString()} 条可投
          {expiredAll.length > 0 && (
            <span className="text-gray-400 dark:text-gray-500">（另有 {expiredAll.length.toLocaleString()} 条已截止）</span>
          )}
        </span>
        {totalPages > 1 && <span>第 {safePage} / {totalPages} 页</span>}
      </div>
      {viewMode === 'row' ? (
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden bg-white dark:bg-[#161b22]">
          {/* 表头：与 CFPRow 的列宽保持一致 */}
          <div className="hidden md:flex items-center gap-2 pl-3 pr-2 py-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
            <span className="w-4 shrink-0" />
            <span className="flex-1 min-w-0">标题</span>
            <span className="w-40 shrink-0">期刊</span>
            <span className="hidden lg:block w-24 shrink-0">出版社</span>
            <span className="hidden sm:block shrink-0">分区</span>
            <span className="hidden xl:block w-28 shrink-0">学科</span>
            <span className="w-16 shrink-0 text-right">倒计时</span>
            <span className="w-4 shrink-0" />
          </div>
          {visible.map((r) => (
            <CFPRow
              key={r.id}
              record={r}
              now={now}
              metric={r.is ? journalMeta.get(r.is) : undefined}
              favorite={favorites.has(r.id)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => (
            <CFPCard
              key={r.id}
              record={r}
              now={now}
              metric={r.is ? journalMeta.get(r.is) : undefined}
              favorite={favorites.has(r.id)}
              onToggleFavorite={onToggleFavorite}
              tz={tz}
            />
          ))}
        </div>
      )}

      {/* P0-3：已过期分组，默认折叠 */}
      {expiredAll.length > 0 && (
        <div className="mt-3 border border-gray-200 dark:border-gray-800 rounded-lg bg-white/60 dark:bg-[#161b22]/60 overflow-hidden">
          <button
            onClick={() => setExpiredOpen((v) => !v)}
            aria-expanded={expiredShown}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            已截止 {expiredAll.length.toLocaleString()} 条
            <ChevronDown
              className={`w-3.5 h-3.5 ml-auto shrink-0 transition-transform ${expiredShown ? 'rotate-180' : ''}`}
            />
          </button>
          {expiredShown && (
            <div className="border-t border-gray-200 dark:border-gray-800">
              {expiredPreview.map((r) =>
                viewMode === 'row' ? (
                  <CFPRow
                    key={r.id}
                    record={r}
                    now={now}
                    metric={r.is ? journalMeta.get(r.is) : undefined}
                    favorite={favorites.has(r.id)}
                    onToggleFavorite={onToggleFavorite}
                  />
                ) : (
                  <CFPCard
                    key={r.id}
                    record={r}
                    now={now}
                    metric={r.is ? journalMeta.get(r.is) : undefined}
                    favorite={favorites.has(r.id)}
                    onToggleFavorite={onToggleFavorite}
                    tz={tz}
                  />
                ),
              )}
              {expiredAll.length > expiredPreview.length && (
                <p className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500">
                  仅显示最近 {expiredPreview.length} 条，共 {expiredAll.length.toLocaleString()} 条。
                  需要更多请配合筛选条件缩小范围。
                </p>
              )}
            </div>
          )}
        </div>
      )}

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
// 子组件：列表桶分段切换（即将截稿 / 长期有效）
// ───────────────────────────────────────────────────────────────────
interface BucketSwitchProps {
  bucket: BucketMode;
  onBucket: (b: BucketMode) => void;
  upcomingCount: number;
  rollingCount: number;
}

function BucketSwitch({ bucket, onBucket, upcomingCount, rollingCount }: BucketSwitchProps) {
  const items: { value: BucketMode; label: string; count: number; Icon: typeof Clock }[] = [
    { value: 'upcoming', label: '即将截稿', count: upcomingCount, Icon: Clock },
    { value: 'rolling', label: '长期有效', count: rollingCount, Icon: InfinityIcon },
  ];
  return (
    <div className="flex items-center gap-2 mb-4" role="tablist" aria-label="列表桶切换">
      <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#161b22] p-0.5">
        {items.map((it) => {
          const active = bucket === it.value;
          return (
            <button
              key={it.value}
              role="tab"
              aria-selected={active}
              onClick={() => onBucket(it.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <it.Icon className="w-3.5 h-3.5" />
              {it.label}
              <span
                className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                  active ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
              >
                {it.count.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
        滚动征稿（无截止日）独立成桶，不参与截止日排序
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// 主组件
// ───────────────────────────────────────────────────────────────────
export default function App() {
  const { theme, toggleTheme } = useTheme();

  const [phase, setPhase] = useState<LoadPhase>('idle');
  const [error, setError] = useState('');
  const [index, setIndex] = useState<CfpIndex | null>(null);
  const [loadedKeys, setLoadedKeys] = useState<Set<string>>(new Set());
  const [records, setRecords] = useState<CFPRecord[]>([]);

  // 是否存在临近（<24h）截止的条目：决定 useNow 是否切到秒级刷新周期（仅近截止才逐秒跳动）
  // 注意：必须在 records 声明之后，否则 TDZ 报错（Cannot access 'records' before initialization）
  const isImminent = useMemo(
    () => records.some((r) => isNearDeadline(r.dt, Date.now(), Boolean(r.rolling))),
    [records],
  );
  const now = useNow(isImminent ? 1000 : NOW_TICK_MS);
  const [journalMeta, setJournalMeta] = useState<Map<string, JournalMetric>>(new Map());
  const [filter, setFilterRaw] = useState<CfpFilterState>(DEFAULT_FILTER_STATE);
  // 提前声明：保存视图等回调依赖它（放在后面会导致 used before declaration）
  const setFilter = useCallback((f: CfpFilterState) => setFilterRaw(f), []);
  const [loadingMore, setLoadingMore] = useState(false);
  const initialMount = useRef(true);

  // 收藏夹（localStorage 持久化）
  const { favorites, count: favCount, toggle: toggleFavorite } = useFavorites();
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [focusMonth, setFocusMonth] = useState<string | null>(null);
  const [favHint, setFavHint] = useState<string | null>(null);
  const favLoadingRef = useRef(false);

  // 保存的命名视图（竞品均未提供，真空白）：localStorage 持久化
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews());
  useEffect(() => {
    saveSavedViews(savedViews);
  }, [savedViews]);
  const appliedView = useMemo(() => appliedViewName(savedViews, filter), [savedViews, filter]);
  const handleSaveView = useCallback(
    (name: string) => setSavedViews((prev) => addSavedView(prev, name, filter)),
    [filter],
  );
  const handleApplyView = useCallback((v: SavedView) => setFilter({ ...v.state }), [setFilter]);
  const handleDeleteView = useCallback(
    (name: string) => setSavedViews((prev) => removeSavedView(prev, name)),
    [],
  );

  // 浏览器本地时区（用于截止日本地时间展示）
  const localTz = useMemo(() => getLocalTimeZone(), []);

  // 视觉皮肤：rich（精致）/ minimal（苹果级极简），localStorage 持久化
  const [skin, setSkin] = useState<Skin>(() => loadSkin());
  useEffect(() => {
    saveSkin(skin);
  }, [skin]);

  // 列表视图模式（紧凑行 / 卡片），localStorage 持久化
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return parseViewMode(localStorage.getItem(VIEW_MODE_KEY));
    } catch {
      return 'card';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      /* 隐私模式下 localStorage 不可写，忽略即可 */
    }
  }, [viewMode]);

  // 窄屏分面面板展开状态（宽屏始终常驻，此状态不生效）
  const [facetOpen, setFacetOpen] = useState(false);

  // P2-1：月历里选中的某一天（YYYY-MM-DD），为空表示不按天过滤
  const [selectedDay, setSelectedDay] = useState<string | null>(null);


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

  const filtered = useMemo(() => filterRecords(records, filter, now.getTime(), journalMeta), [records, filter, now, journalMeta]);
  const sorted = useMemo(() => sortRecords(filtered, filter.sort, filter.dir, now.getTime()), [filtered, filter.sort, filter.dir, now]);

  // 均衡视图：按出版社配额打散排序（仅「即将截稿」桶、且开启均衡时生效）
  const viewSorted = useMemo(() => {
    if (filter.bucket !== 'upcoming' || !filter.balanced) return sorted;
    return diversifyByPublisher(sorted, (r) => r.p, (r) => r.dt, {
      pageSize: PAGE_SIZE,
      maxFraction: 0.6,
    });
  }, [sorted, filter.bucket, filter.balanced]);

  const stats = useMemo(() => computeStats(records, index, now.getTime()), [records, index, now]);

  // 直方图数据：优先用全量（index.months）或筛选联动后的 facet_months 聚合；
  // 过滤掉非月份键（如 'rolling'），并标记已加载 / 已过期 / 当前月。
  const histData = useMemo(() => {
    if (!index) return [];
    const counts = aggregateHistogramCounts(index, {
      publishers: filter.publishers,
      categories: filter.categories,
      types: filter.types,
    });
    const full = new Map<string, number>();
    for (const m of index.months) full.set(m.name, m.count);
    const effective = counts ?? full;
    const current = monthKeyOf(now);
    return index.months
      .filter((m) => /^\d{4}-\d{2}$/.test(m.name))
      .map((m) => ({
        month: m.name,
        count: effective.get(m.name) ?? 0,
        loaded: loadedKeys.has(m.name),
        expired: m.name < current,
        isCurrent: m.name === current,
      }));
  }, [index, filter.publishers, filter.categories, filter.types, loadedKeys, now]);

  const histFiltered = useMemo(
    () => filter.publishers.length > 0 || filter.categories.length > 0 || filter.types.length > 0,
    [filter.publishers, filter.categories, filter.types],
  );

  // 列表展示集：受「只看收藏」与「月份聚焦」约束
  // 用 viewSorted（均衡视图生效后的顺序）而非 sorted
  const displayed = useMemo(() => {
    let list = viewSorted;
    if (favoritesOnly) list = list.filter((r) => favorites.has(r.id));
    if (focusMonth) list = list.filter((r) => (r.d || '').slice(0, 7) === focusMonth);
    if (selectedDay) list = list.filter((r) => (r.d || '').slice(0, 10) === selectedDay);
    return list;
  }, [viewSorted, favoritesOnly, favorites, focusMonth, selectedDay]);

  // 翻页状态提升到 App，以便键盘快捷键 ← / → 直接跳页
  const [page, setPage] = useState(1);
  const pageSize = viewMode === 'row' ? PAGE_SIZE_ROW : PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(displayed.length / pageSize));

  // ── P2-3 键盘快捷键 ────────────────────────────────────────────────
  // 注意：必须放在 totalPages 声明之后，否则闭包引用会触发 TDZ 运行时崩溃。
  const { helpOpen, setHelpOpen } = useKeyboardShortcuts({
    onFocusSearch: () => {
      const el = document.getElementById('cfp-search');
      if (el instanceof HTMLInputElement) {
        el.focus();
        el.select();
      }
    },
    onToggleFavorites: () => setFavoritesOnly((v) => !v),
    onScrollTop: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    onPrevPage: () => setPage((p) => Math.max(1, p - 1)),
    onNextPage: () => setPage((p) => Math.min(totalPages, p + 1)),
    // v 在三种视图间循环：紧凑 → 卡片 → 日历 → 紧凑
    onToggleView: () => setViewMode((v) => (v === 'row' ? 'card' : v === 'card' ? 'cal' : 'row')),
  });

  // 桶计数：必须桶无关（否则切到「即将截稿」后「长期有效」永远显示 0），
  // 所以分别用 bucket=upcoming / bucket=rolling 各算一次，其余筛选条件保持不变。
  const upcomingCount = useMemo(
    () => filterRecords(records, { ...filter, bucket: 'upcoming' }, now.getTime(), journalMeta).length,
    [records, filter, now, journalMeta],
  );
  const rollingCount = useMemo(
    () => filterRecords(records, { ...filter, bucket: 'rolling' }, now.getTime(), journalMeta).length,
    [records, filter, now, journalMeta],
  );

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

  // 收藏夹自动扩展：开启「只看收藏」后，若仍有收藏 id 不在已加载记录里，
  // 自动分批加载（含已过期）月份分片，直到全部收藏命中或数据窗口耗尽。
  useEffect(() => {
    if (!favoritesOnly || !index) {
      setFavHint(null);
      return;
    }
    const allLoaded = [...favorites].every((id) => records.some((r) => r.id === id));
    if (allLoaded) {
      setFavHint(null);
      return;
    }
    const remaining = [...favorites].filter((id) => !records.some((r) => r.id === id)).length;
    const targets = selectNextMonths(index, loadedKeys, now, LOAD_MORE_MONTH_SPAN, true).filter(
      (k) => !loadedKeys.has(k),
    );
    if (targets.length === 0) {
      setFavHint(`还有 ${remaining} 条收藏位于当前数据窗口之外，无法自动加载`);
      return;
    }
    if (favLoadingRef.current) return;
    favLoadingRef.current = true;
    setLoadingMore(true);
    (async () => {
      try {
        const more = await Promise.all(targets.map(async (k) => [k, await loadShard(index, k)] as const));
        setRecords((prev) => [...prev, ...more.flatMap(([, recs]) => recs)]);
        setLoadedKeys((prev) => {
          const n = new Set(prev);
          targets.forEach((k) => n.add(k));
          return n;
        });
      } finally {
        setLoadingMore(false);
        favLoadingRef.current = false;
      }
    })();
  }, [favoritesOnly, index, favorites, records, loadedKeys, now]);

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

  // CFPRecord -> ICS 输入
  const toIcsInput = useCallback((r: CFPRecord): IcsEventInput => ({
    id: r.id,
    title: r.t,
    journal: r.j,
    publisher: r.p,
    url: r.u,
    deadline: r.d,
    rolling: r.rolling,
  }), []);

  // 导出「当前结果」（受筛选 + 收藏 + 月份聚焦约束后的可见列表）
  const handleExportCurrent = useCallback(() => {
    downloadICS(icsFilename(), generateICS(displayed.map(toIcsInput)));
  }, [displayed, toIcsInput]);

  // 导出「收藏」（当前已加载记录里被收藏的条目；rolling/无截止日自动跳过）
  const handleExportFavorites = useCallback(() => {
    const list = records.filter((r) => favorites.has(r.id)).map(toIcsInput);
    downloadICS(icsFilename(), generateICS(list));
  }, [records, favorites, toIcsInput]);

  // 点击直方图柱子：未加载则加载该月分片，并把列表筛选/滚动到该月
  const handleSelectMonth = useCallback(async (month: string) => {
    if (!index) return;
    if (!loadedKeys.has(month)) {
      setLoadingMore(true);
      try {
        const recs = await loadShard(index, month);
        setRecords((prev) => [...prev, ...recs]);
        setLoadedKeys((prev) => new Set(prev).add(month));
      } finally {
        setLoadingMore(false);
      }
    }
    setFocusMonth(month);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [index, loadedKeys]);

  const clearFocusMonth = useCallback(() => setFocusMonth(null), []);

  // 手动触发「加载收藏所在月份」（自动扩展之外的加速入口；按 id 去重避免重复追加）
  const handleLoadFavorites = useCallback(async () => {
    if (!index) return;
    const targets = selectNextMonths(index, loadedKeys, now, LOAD_MORE_MONTH_SPAN, true).filter(
      (k) => !loadedKeys.has(k),
    );
    if (targets.length === 0) return;
    setLoadingMore(true);
    try {
      const more = await Promise.all(targets.map(async (k) => [k, await loadShard(index, k)] as const));
      const incoming = more.flatMap(([, recs]) => recs);
      setRecords((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...incoming.filter((r) => !seen.has(r.id))];
      });
      setLoadedKeys((prev) => {
        const n = new Set(prev);
        targets.forEach((k) => n.add(k));
        return n;
      });
    } finally {
      setLoadingMore(false);
    }
  }, [index, loadedKeys, now]);
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
    <div
      data-skin={skin}
      className="min-h-screen bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-gray-100"
    >
      <Header
        index={index}
        theme={theme}
        onToggleTheme={toggleTheme}
        favoritesCount={favCount}
        favoritesOnly={favoritesOnly}
        onToggleFavoritesOnly={() => setFavoritesOnly((v) => !v)}
        onExportCurrent={handleExportCurrent}
        onExportFavorites={handleExportFavorites}
        currentResultCount={displayed.length}
        now={now.getTime()}
        savedViews={savedViews}
        onApplyView={handleApplyView}
        onDeleteView={handleDeleteView}
        appliedView={appliedView}
        skin={skin}
        onToggleSkin={() => setSkin((s) => (s === 'rich' ? 'minimal' : 'rich'))}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {phase === 'loading-shards' && records.length === 0 ? (
          <LoadingScreen message={`加载 ${selectInitialMonths(index!).length} 个月份分片…`} />
        ) : (
          <>
            <StatsBar stats={stats} index={index} />
            <DensityHistogram
              data={histData}
              filtered={histFiltered}
              focusMonth={focusMonth}
              onSelectMonth={handleSelectMonth}
              onClearFocus={clearFocusMonth}
            />
            <SearchToolbar
              filter={filter}
              setFilter={setFilter}
              activeCount={countActiveFilters(filter)}
              facetOpen={facetOpen}
              onToggleFacetOpen={() => setFacetOpen((v) => !v)}
            />

            {/* P1-1：宽屏 = 左侧常驻分面栏 + 右侧结果区；窄屏自动回落为单列 + 折叠面板 */}
            <div className="lg:grid lg:grid-cols-[272px_minmax(0,1fr)] lg:gap-5 lg:items-start">
              <FacetSidebar open={facetOpen}>
                <FilterBar
                  filter={filter}
                  setFilter={setFilter}
                  records={records}
                  publishers={publisherList}
                  categories={categoryList}
                  types={typeList}
                  journalMeta={journalMeta}
                  nowMs={now.getTime()}
                  showExpired={showExpired}
                  onToggleExpired={() => setShowExpired((v) => !v)}
                  favoritesOnly={favoritesOnly}
                  onToggleFavoritesOnly={() => setFavoritesOnly((v) => !v)}
                  onSaveView={handleSaveView}
                  balanced={filter.balanced}
                  onToggleBalanced={() => setFilter({ ...filter, balanced: !filter.balanced })}
                  hideMdpiRolling={filter.hideMdpiRolling}
                  onToggleHideMdpiRolling={() =>
                    setFilter({ ...filter, hideMdpiRolling: !filter.hideMdpiRolling })
                  }
                />
              </FacetSidebar>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
              <BucketSwitch
                bucket={filter.bucket}
                onBucket={(b) => setFilter({ ...filter, bucket: b })}
                upcomingCount={upcomingCount}
                rollingCount={rollingCount}
              />
              {/* 视图切换：紧凑行一屏 ~12 条，卡片一屏 ~5 条 */}
              <div
                className="inline-flex rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#161b22] p-0.5 shrink-0"
                role="group"
                aria-label="列表视图切换"
              >
                {(
                  [
                    { value: 'row' as ViewMode, label: '紧凑', Icon: LayoutList, tip: '紧凑行：同屏约 12 条，适合扫读' },
                    { value: 'card' as ViewMode, label: '卡片', Icon: LayoutGrid, tip: '卡片：信息完整，适合细看' },
                    { value: 'cal' as ViewMode, label: '日历', Icon: CalendarDays, tip: '月历：看哪天有截止，可点选某一天' },
                  ]
                ).map(({ value, label, Icon, tip }) => {
                  const active = viewMode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setViewMode(value)}
                      title={tip}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                        active
                          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  );
                })}
                </div>
                </div>
                {expansionHint && (
                  <div className="mb-3 text-center text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-lg py-2 px-3">
                    <Sparkles className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                    {expansionHint}
                  </div>
                )}
                {/* P2-1：月历副视图。选中某天后下方列表自动收敛到那一天 */}
                {viewMode === 'cal' && (
                  <MonthCalendar
                    records={displayed}
                    now={now.getTime()}
                    selectedDay={selectedDay}
                    onSelectDay={setSelectedDay}
                  />
                )}
                <ListArea
                  records={records}
                  filtered={displayed}
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
                  favoritesOnly={favoritesOnly}
                  favoritesCount={favCount}
                  onLoadFavorites={handleLoadFavorites}
                  favHint={favHint}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                  tz={localTz}
                  viewMode={viewMode}
                  page={page}
                  setPage={setPage}
                />
                {index && (
                  <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
                    <TrendingUp className="w-3 h-3 inline mr-1 -mt-0.5" />
                    全库共 {index.total.toLocaleString()} 条 · 已加载 {records.length.toLocaleString()} 条
                    {index.rolling_count ? ` · 含滚动征稿 ${index.rolling_count.toLocaleString()} 条` : ''}
                  </p>
                )}
                {index && (
                  <p className="mt-1 text-center text-xs text-gray-400 dark:text-gray-500">{AOE_HINT}</p>
                )}
                <p className="mt-2 text-center text-xs text-gray-400 dark:text-gray-500">
                  <Keyboard className="w-3 h-3 inline mr-1 -mt-0.5" />
                  按 <kbd className="px-1 rounded border border-gray-300 dark:border-gray-600">?</kbd> 查看键盘快捷键
                </p>
              </div>
            </div>
          </>
        )}
      </main>
      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
