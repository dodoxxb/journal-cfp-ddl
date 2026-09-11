import { describe, it, expect } from 'vitest';
import {
  parseFavorites,
  serializeFavorites,
  toggleFavorite,
  FAVORITES_KEY,
} from '../lib/favorites';

describe('parseFavorites', () => {
  it('null / 空值返回空集', () => {
    expect(parseFavorites(null)).toEqual(new Set());
    expect(parseFavorites('')).toEqual(new Set());
  });

  it('非法 JSON 返回空集（不抛错）', () => {
    expect(parseFavorites('{not json')).toEqual(new Set());
  });

  it('合法数组解析为 id 集合', () => {
    expect(parseFavorites('["a","b","c"]')).toEqual(new Set(['a', 'b', 'c']));
  });

  it('非数组或含非字符串元素被忽略', () => {
    expect(parseFavorites('{"a":1}')).toEqual(new Set());
    expect(parseFavorites('["a",2,null,"b"]')).toEqual(new Set(['a', 'b']));
  });
});

describe('toggleFavorite', () => {
  it('未收藏时加入集合', () => {
    const next = toggleFavorite(new Set(), 'x');
    expect(next.has('x')).toBe(true);
  });

  it('已收藏时移除集合（不可变更新，原集合不变）', () => {
    const orig = new Set(['x']);
    const next = toggleFavorite(orig, 'x');
    expect(next.has('x')).toBe(false);
    expect(orig.has('x')).toBe(true); // 原集合不变
  });

  it('多次切换回到原状态', () => {
    let s = new Set<string>();
    s = toggleFavorite(s, 'a');
    s = toggleFavorite(s, 'b');
    s = toggleFavorite(s, 'a');
    expect(s).toEqual(new Set(['b']));
  });
});

describe('serializeFavorites', () => {
  it('与 parseFavorites 互为逆操作', () => {
    const set = new Set(['a', 'b']);
    expect(parseFavorites(serializeFavorites(set))).toEqual(set);
  });
});

describe('FAVORITES_KEY', () => {
  it('使用稳定的 localStorage key', () => {
    expect(FAVORITES_KEY).toBe('journal-cfp-ddl:favorites');
  });
});
