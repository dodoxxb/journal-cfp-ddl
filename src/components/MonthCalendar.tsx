import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { CFPRecord } from '../lib/types';
import { daysUntil } from '../lib/filters';

/**
 * 月历副视图（P2-1）。
 *
 * 把筛选结果按「截止日」铺到月历格子里，用来回答卡片列表很难回答的问题：
 * 「这个月哪几天有截止？」「我能不能错开两个ddl？」
 *
 * - 每格显示当天截止的条数；条数越多色块越重
 * - 颜色沿用紧迫度语义（≤7 天红 / ≤30 天琥珀 / 更远绿），与列表保持一致
 * - 点击某一天 → 列表只显示当天（再点一次取消）
 * - 周一为一周起点（国内习惯）
 */

export interface MonthCalendarProps {
  records: CFPRecord[];
  now: number;
  selectedDay: string | null;
  onSelectDay: (ymd: string | null) => void;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

/** YYYY-MM-DD -> 当天的截止条数与该天最近一条的剩余天数 */
type DayStat = { count: number; minDays: number };

function monthKeyOf(ymd: string): string {
  return ymd.slice(0, 7);
}

function ymdOf(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 计算某月日历需要的首格日期（周一为起点） */
function gridStart(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  // getDay(): 0=周日 … 6=周六；换算成「距上一个周一的天数」
  const offset = (first.getDay() + 6) % 7;
  return new Date(year, month, 1 - offset);
}

function urgencyClass(minDays: number): string {
  if (minDays < 0) return 'bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-500';
  if (minDays <= 7) return 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300';
  if (minDays <= 30) return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
  return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
}

export default function MonthCalendar({ records, now, selectedDay, onSelectDay }: MonthCalendarProps) {
  const today = useMemo(() => ymdOf(new Date(now)), [now]);
  const [month, setMonth] = useState<string>(() => monthKeyOf(selectedDay ?? today));

  const stats = useMemo(() => {
    const m = new Map<string, DayStat>();
    for (const r of records) {
      if (r.rolling) continue; // 滚动征稿没有截止日，无法落到日历格
      const ymd = (r.d || '').slice(0, 10);
      if (!ymd) continue;
      const days = daysUntil(r.dt, now);
      const prev = m.get(ymd);
      if (prev) {
        prev.count += 1;
        prev.minDays = Math.min(prev.minDays, days);
      } else {
        m.set(ymd, { count: 1, minDays: days });
      }
    }
    return m;
  }, [records, now]);

  const [year, mon] = month.split('-').map(Number);
  const cells = useMemo(() => {
    const start = gridStart(year, mon - 1);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { date: d, ymd: ymdOf(d), inMonth: d.getMonth() === mon - 1 };
    });
  }, [year, mon]);

  const shift = (delta: number) => {
    const d = new Date(year, mon - 1 + delta, 1);
    setMonth(monthKeyOf(ymdOf(d)));
  };

  const monthTotal = useMemo(
    () => [...stats.entries()].filter(([k]) => k.startsWith(month)).reduce((s, [, v]) => s + v.count, 0),
    [stats, month],
  );

  return (
    <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-gray-800 rounded-xl p-3 sm:p-4 mb-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => shift(-1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="上一月"
          >
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums min-w-[6.5rem] text-center">
            {year} 年 {mon} 月
          </span>
          <button
            onClick={() => shift(1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="下一月"
          >
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            本月 {monthTotal} 条截止
          </span>
          {selectedDay && (
            <button
              onClick={() => onSelectDay(null)}
              className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              清除选中
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[11px] font-medium text-gray-400 dark:text-gray-500 py-1">
            {w}
          </div>
        ))}
        {cells.map(({ date, ymd, inMonth }) => {
          const stat = stats.get(ymd);
          const isToday = ymd === today;
          const selected = ymd === selectedDay;
          return (
            <button
              key={ymd}
              onClick={() => onSelectDay(selected ? null : ymd)}
              disabled={!stat}
              className={[
                'relative h-11 sm:h-12 rounded-lg text-xs transition-colors tabular-nums',
                stat ? 'cursor-pointer' : 'cursor-default',
                inMonth ? '' : 'opacity-35',
                stat ? urgencyClass(stat.minDays) : 'text-gray-400 dark:text-gray-600',
                selected ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-[#161b22]' : '',
                isToday && !selected ? 'ring-1 ring-indigo-300 dark:ring-indigo-700' : '',
              ].join(' ')}
              title={stat ? `${ymd}：${stat.count} 条截止` : ymd}
            >
              <span className="absolute left-1 top-1 text-[10px] leading-none">
                {date.getDate()}
              </span>
              {stat && (
                <span className="absolute inset-x-0 bottom-1 text-[11px] font-semibold leading-none">
                  {stat.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
        格子里是当天截止的条数；点击某天可让下方列表只看这一天。滚动征稿无截止日，不进入日历。
      </p>
    </div>
  );
}
