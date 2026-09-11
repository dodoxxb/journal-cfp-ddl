import { describe, it, expect } from 'vitest';
import {
  addSavedView,
  removeSavedView,
  renameSavedView,
  loadSavedViews,
  saveSavedViews,
  viewStateKey,
  appliedViewName,
  SAVED_VIEWS_KEY,
  type SavedView,
} from '../lib/savedViews';
import type { CfpFilterState } from '../lib/types';

/** 最小可用的 Storage 替身（补齐 Storage 接口要求的 length / key / clear） */
class FakeStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  getItem(k: string): string | null {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

const baseState: CfpFilterState = {
  search: '',
  publishers: [],
  categories: [],
  types: [],
  quartiles: [],
  range: 'all',
  customDays: 30,
  sort: 'deadline',
  dir: 'asc',
  bucket: 'upcoming',
  hideMdpiRolling: false,
  balanced: true,
};

describe('savedViews.ts', () => {
  it('addSavedView 追加并去重同名', () => {
    let views: SavedView[] = [];
    views = addSavedView(views, '计算机', baseState);
    views = addSavedView(views, '医学', baseState);
    views = addSavedView(views, '计算机', baseState); // 同名覆盖
    expect(views).toHaveLength(2);
    expect(views.map((v) => v.name)).toEqual(['医学', '计算机']);
  });

  it('addSavedView 忽略空名', () => {
    const views = addSavedView([], '   ', baseState);
    expect(views).toHaveLength(0);
  });

  it('removeSavedView 删除指定视图', () => {
    let views = addSavedView([], 'A', baseState);
    views = addSavedView(views, 'B', baseState);
    views = removeSavedView(views, 'A');
    expect(views.map((v) => v.name)).toEqual(['B']);
  });

  it('renameSavedView 重命名', () => {
    let views = addSavedView([], 'A', baseState);
    views = renameSavedView(views, 'A', 'A2');
    expect(views[0].name).toBe('A2');
  });

  it('load/save 往返一致', () => {
    const s = new FakeStorage();
    const views = addSavedView([], '视图1', { ...baseState, publishers: ['MDPI'] });
    saveSavedViews(views, s);
    const loaded = loadSavedViews(s);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('视图1');
    expect(loaded[0].state.publishers).toEqual(['MDPI']);
  });

  it('loadSavedViews 对损坏数据返回空数组', () => {
    const s = new FakeStorage();
    s.setItem(SAVED_VIEWS_KEY, '{not json');
    expect(loadSavedViews(s)).toEqual([]);
  });

  it('viewStateKey 忽略数组顺序、appliedViewName 命中', () => {
    const a = { ...baseState, publishers: ['MDPI', 'Elsevier'] };
    const b = { ...baseState, publishers: ['Elsevier', 'MDPI'] };
    expect(viewStateKey(a)).toBe(viewStateKey(b));

    const views = addSavedView([], '我的视图', a);
    expect(appliedViewName(views, b)).toBe('我的视图');
    expect(appliedViewName(views, { ...baseState, publishers: ['Springer'] })).toBeNull();
  });
});
