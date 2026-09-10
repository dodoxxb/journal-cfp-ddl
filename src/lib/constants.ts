/**
 * 前端全局常量。
 * 集中放置便于统一调优渲染性能与加载策略。
 */

/** 搜索防抖时长（毫秒） */
export const SEARCH_DEBOUNCE_MS = 250;

/** 倒计时刷新周期（毫秒） */
export const NOW_TICK_MS = 30_000;

/** 首屏加载的月份数：当前月 + 未来 N-1 个月 */
export const INITIAL_MONTH_SPAN = 3;

/** 每次「加载更多」追加的月份数 */
export const LOAD_MORE_MONTH_SPAN = 2;

/** 单张 CFP 卡片高度（像素，固定高度以保证虚拟滚动稳定） */
export const CARD_HEIGHT = 124;

/** 卡片展开描述后的额外高度（像素） */
export const CARD_EXPANDED_EXTRA = 56;

/** 卡片之间的间距（像素） */
export const CARD_GAP = 10;

/** 虚拟滚动上下缓冲渲染的条数 */
export const VIRTUAL_OVERSCAN = 6;

/** jsdom / 未测量出容器高度时的兜底视口高度（像素） */
export const FALLBACK_VIEWPORT_HEIGHT = 720;

/** 距离列表底部多少条时触发「加载更多月份」 */
export const REACH_END_THRESHOLD = 12;

/** 移动端断点（与 Tailwind sm 断点保持一致） */
export const MOBILE_BREAKPOINT = 640;
