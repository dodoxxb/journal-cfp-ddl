/**
 * 保存的筛选视图（命名视图）纯函数层。
 *
 * 竞品均未做「保存筛选视图」（docs/frontend-design-spec.md 模式 12），是差异化空白。
 * 视图 = 命名 + 完整筛选状态（复用 CfpFilterState 结构，来自 urlState）。
 *
 * 本文件只负责：
 *  - 从 localStorage 解析 / 序列化（try/catch 降级，不抛错）；
 *  - 增 / 删 / 改名（不可变更新）；
 *  - 用稳定 key 判断「当前筛选是否正好等于某个已保存视图」。
 *
 * 持久化由调用方（React）负责；测试可注入 Storage 实现。
 */

import type { CfpFilterState } from './types';

/** localStorage key */
export const SAVED_VIEWS_KEY = 'journal-cfp-ddl:savedViews';

export interface SavedView {
  /** 视图名称（唯一，重名则覆盖） */
  name: string;
  /** 完整的筛选状态快照 */
  state: CfpFilterState;
  /** 创建时间戳（毫秒） */
  createdAt: number;
}

function resolveStorage(storage?: Storage | null): Storage | null {
  if (storage) return storage;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function isSavedView(v: unknown): v is SavedView {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.name === 'string' && o.state !== null && typeof o.state === 'object';
}

/** 从 localStorage 读取已保存视图列表（失败 / 缺失返回空数组） */
export function loadSavedViews(storage?: Storage | null): SavedView[] {
  const s = resolveStorage(storage);
  if (!s) return [];
  try {
    const raw = s.getItem(SAVED_VIEWS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(isSavedView);
  } catch {
    return [];
  }
}

/** 写入已保存视图列表（失败静默忽略） */
export function saveSavedViews(views: SavedView[], storage?: Storage | null): void {
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
  } catch {
    /* 配额 / 隐私模式：忽略 */
  }
}

/** 新增 / 覆盖命名视图（同名覆盖，空名忽略）。返回新的列表（不可变） */
export function addSavedView(views: SavedView[], name: string, state: CfpFilterState): SavedView[] {
  const trimmed = name.trim();
  if (!trimmed) return views;
  const view: SavedView = { name: trimmed, state, createdAt: Date.now() };
  const next = views.filter((v) => v.name !== trimmed);
  return [...next, view];
}

/** 删除命名视图。返回新的列表（不可变） */
export function removeSavedView(views: SavedView[], name: string): SavedView[] {
  return views.filter((v) => v.name !== name);
}

/** 重命名视图（newName 为空忽略）。返回新的列表（不可变） */
export function renameSavedView(views: SavedView[], oldName: string, newName: string): SavedView[] {
  const trimmed = newName.trim();
  if (!trimmed) return views;
  return views.map((v) => (v.name === oldName ? { ...v, name: trimmed } : v));
}

/** 生成筛选状态的稳定序列化 key（数组字段排序，忽略创建时间等无关字段） */
export function viewStateKey(state: CfpFilterState): string {
  return JSON.stringify({
    search: state.search,
    publishers: [...state.publishers].sort(),
    categories: [...state.categories].sort(),
    types: [...state.types].sort(),
    quartiles: [...state.quartiles].sort(),
    range: state.range,
    sort: state.sort,
    dir: state.dir,
    bucket: state.bucket,
    hideMdpiRolling: state.hideMdpiRolling,
    balanced: state.balanced,
  });
}

/** 若当前筛选正好等于某个已保存视图，返回其名称，否则返回 null */
export function appliedViewName(views: SavedView[], state: CfpFilterState): string | null {
  const key = viewStateKey(state);
  const match = views.find((v) => viewStateKey(v.state) === key);
  return match ? match.name : null;
}
