/**
 * 收藏夹 Hook：基于 localStorage 持久化 CFP 的 `id` 集合。
 * - key: `journal-cfp-ddl:favorites`
 * - 跨会话、跨分片加载有效（id 是稳定指纹）
 * - 隐私模式 / 配额不足时静默降级（不影响主流程）
 */

import { useCallback, useEffect, useState } from 'react';
import { FAVORITES_KEY, parseFavorites, serializeFavorites, toggleFavorite } from '../lib/favorites';

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      return parseFavorites(window.localStorage.getItem(FAVORITES_KEY));
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FAVORITES_KEY, serializeFavorites(favorites));
    } catch {
      // 忽略写入失败（隐私模式 / 配额）
    }
  }, [favorites]);

  const toggle = useCallback((id: string) => {
    setFavorites((prev) => toggleFavorite(prev, id));
  }, []);

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);

  return { favorites, count: favorites.size, toggle, isFavorite };
}

export default useFavorites;
