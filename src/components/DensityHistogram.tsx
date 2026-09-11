/**
 * 截稿密度直方图（纯手写 div 柱状图，不引入图表库）。
 *
 * 交互：
 *  - X 轴 = 月份（数据窗口最早→最晚），Y 轴 = 该月截稿条数（平方根缩放，避免 MDPI 占比过高压平其他月份）。
 *  - 已加载月份实色、未加载浅色，让用户知道点一下会触发加载。
 *  - 点击柱子 = 跳到该月：未加载则加载该月分片，并把列表筛选/滚动到该月。
 *  - 当前月高亮（描边），已过期月份用灰色系。
 *  - 窄屏横向滚动。
 */

export interface HistogramDatum {
  /** 月份键 YYYY-MM */
  month: string;
  /** 截稿条数 */
  count: number;
  /** 该月分片是否已加载 */
  loaded: boolean;
  /** 该月是否早于当前月（已过期） */
  expired: boolean;
  /** 是否为当前月 */
  isCurrent: boolean;
}

interface DensityHistogramProps {
  data: HistogramDatum[];
  /** 是否为筛选联动后的近似值（false=全量精确） */
  filtered: boolean;
  /** 当前聚焦的月份（点击柱子后设置），用于高亮与清除 */
  focusMonth: string | null;
  /** 点击柱子 */
  onSelectMonth: (month: string) => void;
  /** 清除月份聚焦 */
  onClearFocus: () => void;
}

function monthLabel(month: string): string {
  // YYYY-MM → MM（在 title 里展示完整月份）
  return month.slice(5);
}

export default function DensityHistogram({
  data,
  filtered,
  focusMonth,
  onSelectMonth,
  onClearFocus,
}: DensityHistogramProps) {
  const maxCount = data.reduce((mx, d) => Math.max(mx, d.count), 0);
  const bars = data.filter((d) => /^\d{4}-\d{2}$/.test(d.month));

  return (
    <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-xl p-3 sm:p-4 mb-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">截稿密度</h2>
          {filtered && (
            <span className="text-[11px] text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
              筛选联动（近似）
            </span>
          )}
        </div>
        {focusMonth && (
          <button
            onClick={onClearFocus}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
          >
            清除月份聚焦（{focusMonth}）
          </button>
        )}
      </div>

      {maxCount === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 py-6 text-center">当前筛选下没有截稿数据</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex items-end gap-1 min-w-max">
            {bars.map((d) => {
              const heightPct = maxCount > 0 ? (Math.sqrt(d.count) / Math.sqrt(maxCount)) * 100 : 0;
              const isFocused = focusMonth === d.month;
              // 基础配色：已加载实色，未加载浅色
              let barClass: string;
              if (d.expired) {
                barClass = d.loaded
                  ? 'bg-gray-300 dark:bg-gray-700'
                  : 'bg-gray-200 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-700';
              } else {
                barClass = d.loaded
                  ? 'bg-indigo-500 dark:bg-indigo-400'
                  : 'bg-indigo-200 dark:bg-indigo-900 border border-dashed border-indigo-300 dark:border-indigo-800';
              }
              return (
                <button
                  key={d.month}
                  type="button"
                  onClick={() => onSelectMonth(d.month)}
                  className="flex flex-col items-center justify-end gap-1 flex-1 min-w-[22px] group"
                  title={`${d.month} · ${d.count} 条 · ${d.loaded ? '已加载' : '未加载'}${d.expired ? ' · 已过期' : ''}${isFocused ? ' · 已聚焦' : ''}`}
                  aria-label={`${d.month}，共 ${d.count} 条`}
                >
                  <div
                    className="w-full rounded-t-sm transition-all relative"
                    style={{ height: `${Math.max(2, heightPct)}%` }}
                  >
                    <div
                      className={`w-full h-full rounded-t-sm ${barClass} ${
                        d.isCurrent ? 'ring-2 ring-amber-400 dark:ring-amber-500' : ''
                      } ${isFocused ? 'ring-2 ring-indigo-600 dark:ring-indigo-300' : ''} group-hover:opacity-80`}
                    />
                    {d.count > 0 && (
                      <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 dark:text-gray-400 opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
                        {d.count}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] leading-none ${
                      d.isCurrent
                        ? 'text-amber-600 dark:text-amber-400 font-semibold'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {monthLabel(d.month)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400 dark:text-gray-500">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-indigo-500 dark:bg-indigo-400 inline-block" />已加载
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-indigo-200 dark:bg-indigo-900 inline-block border border-dashed border-indigo-300 dark:border-indigo-800" />未加载
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-gray-300 dark:bg-gray-700 inline-block" />已过期
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm ring-2 ring-amber-400 inline-block" />当前月
        </span>
      </div>
    </div>
  );
}
