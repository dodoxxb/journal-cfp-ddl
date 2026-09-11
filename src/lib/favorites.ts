/**
 * 收藏夹的纯函数层（与 React / localStorage 解耦，便于单元测试）。
 * UI 层负责把 Set<string> 持久化到 localStorage，本文件只管集合的解析 / 序列化 / 增删。
 *
 * 收藏的是 CFP 的稳定指纹 `id`（跨会话、跨分片加载都有效）。
 */

export const FAVORITES_KEY = 'journal-cfp-ddl:favorites';

/** 从 localStorage 原始字符串解析出 id 集合；非法 / 空值一律返回空集，不抛错 */
export function parseFavorites(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

/** 把 id 集合序列化为可写入 localStorage 的 JSON 字符串 */
export function serializeFavorites(ids: Set<string>): string {
  return JSON.stringify([...ids]);
}

/** 切换某个 id 的收藏状态，返回新的集合（不可变更新） */
export function toggleFavorite(ids: Set<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
