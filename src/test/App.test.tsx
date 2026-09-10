import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../App';

const mockIndex = {
  generated_at: '2026-09-15T00:00:00Z',
  window_months: 3,
  cutoff: '2026-06-15T00:00:00Z',
  total: 3,
  rolling_count: 1,
  publishers: [{ name: 'Springer', count: 1 }, { name: 'Nature Portfolio', count: 1 }],
  categories: [{ name: 'Computer Science', count: 2 }],
  types: [{ name: 'special_issue', count: 1 }, { name: 'collection', count: 2 }],
  months: [
    { name: '2026-09', file: 'shards/2026-09.json', count: 1 },
    { name: '2026-10', file: 'shards/2026-10.json', count: 1 },
    { name: '2026-11', file: 'shards/2026-11.json', count: 1 },
    { name: 'rolling', file: 'shards/rolling.json', count: 1 },
  ],
};

const mockSep = [
  {
    id: 'aaa1', t: 'Graph Neural Networks for Drug Discovery',
    j: 'Nature Methods', p: 'Springer', d: '2026-09-25', dt: '2026-09-25T23:59:59Z',
    u: 'https://example.com/a', c: 'Computer Science', ty: 'collection',
    ad: '', g: ['gnn'], x: '', jn: 1,
  },
];

const mockOct = [
  {
    id: 'ccc3', t: 'Quantum Error Correction',
    j: 'NPJ Quantum', p: 'Nature Portfolio', d: '2026-10-15', dt: '2026-10-15T23:59:59Z',
    u: 'https://example.com/c', c: 'Computer Science', ty: 'collection',
    ad: '', g: ['quantum'], x: '', jn: 1,
  },
];

const mockNov = [
  {
    id: 'ddd4', t: 'Pediatric Oncology Special Issue',
    j: 'Pediatrics', p: 'Springer', d: '2026-11-30', dt: '2026-11-30T23:59:59Z',
    u: 'https://example.com/d', c: 'Computer Science', ty: 'special_issue',
    ad: '', g: ['oncology'], x: '', jn: 1,
  },
];

const mockRolling = [
  {
    id: 'rrr5', t: 'Open Call for AI Papers', j: 'AI Open', p: 'Springer', d: '', dt: '',
    u: 'https://example.com/e', c: 'Computer Science', ty: 'research_topic',
    ad: '', g: ['ai'], x: '', jn: 1, rolling: true,
  },
];

function makeFetch() {
  return vi.fn((url: string) => {
    const file = url.split('/').pop() || '';
    if (file === 'index.json') return Promise.resolve({ ok: true, json: () => Promise.resolve(mockIndex) });
    if (file === '2026-09.json') return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSep) });
    if (file === '2026-10.json') return Promise.resolve({ ok: true, json: () => Promise.resolve(mockOct) });
    if (file === '2026-11.json') return Promise.resolve({ ok: true, json: () => Promise.resolve(mockNov) });
    if (file === 'rolling.json') return Promise.resolve({ ok: true, json: () => Promise.resolve(mockRolling) });
    return Promise.reject(new Error('unmocked: ' + url));
  });
}

describe('App.tsx 数据加载与展示', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', makeFetch());
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('加载数据后展示统计概览与 CFP 列表', async () => {
    render(<App />);
    await waitFor(
      () => {
        expect(screen.getByText(/数据更新于/)).toBeInTheDocument();
        expect(screen.getByText(/Graph Neural Networks/)).toBeInTheDocument();
      },
      { timeout: 8000 },
    );
  });

  it('搜索关键词过滤 CFP', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Graph Neural Networks/)).toBeInTheDocument();
    }, { timeout: 8000 });

    const input = screen.getByPlaceholderText(/搜索/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'quantum' } });
    await waitFor(() => {
      expect(screen.getByText(/Quantum Error Correction/)).toBeInTheDocument();
    }, { timeout: 4000 });
  });
});