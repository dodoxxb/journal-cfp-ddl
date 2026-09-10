import { useEffect, useState } from 'react';

/**
 * 值防抖：只有停止变化 delay 毫秒后才返回最新值。
 * 用于搜索框，避免每次按键都触发全量筛选。
 *
 * @param value 原始值
 * @param delay 防抖时长（毫秒）
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default useDebounce;
