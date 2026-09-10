import { useEffect, useState } from 'react';

/**
 * 每 intervalMs 毫秒返回一次新的当前时间。
 * 只用于驱动倒计时刷新；组件树中仅可见区域依赖该值。
 *
 * @param intervalMs 刷新周期（毫秒）
 */
export function useNow(intervalMs: number = 30_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}

export default useNow;
