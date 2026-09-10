import { useEffect, useState } from 'react';
import type { ThemeMode } from '../lib/types';

const STORAGE_KEY = 'journal-cfp-theme';

function readStoredTheme(): ThemeMode | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    // 隐私模式下 localStorage 可能不可用，忽略即可
    return null;
  }
}

/**
 * 主题管理：优先读 localStorage，其次跟随系统偏好。
 * 通过给 <html> 加 / 去 `dark` class 生效（Tailwind darkMode: 'class'）。
 */
export function useTheme(): { theme: ThemeMode; toggleTheme: () => void } {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = readStoredTheme();
    if (stored) return stored;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // 忽略写入失败
    }
  }, [theme]);

  const toggleTheme = (): void => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return { theme, toggleTheme };
}

export default useTheme;
