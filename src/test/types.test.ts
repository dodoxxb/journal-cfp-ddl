import { describe, it, expect } from 'vitest'
import type { Journal, CFP, JournalRank, CFPType, CFPStatus, SortField, ViewMode } from '../lib/types'

describe('types.ts', () => {
  it('should export Journal interface', () => {
    const journal: Journal = {
      title: 'Test Journal',
      publisher: 'Test Publisher',
      category: 'Science',
      cfps: [],
    }
    expect(journal.title).toBe('Test Journal')
  })

  it('should export CFP interface with required fields', () => {
    const cfp: CFP = {
      title: 'Test CFP',
      deadline: '2024-12-31T23:59:59Z',
      link: 'https://example.com',
    }
    expect(cfp.title).toBe('Test CFP')
  })

  it('should export optional CFP fields', () => {
    const cfp: CFP = {
      title: 'Test CFP',
      deadline: '2024-12-31T23:59:59Z',
      link: 'https://example.com',
      type: 'collection',
      description: 'Description here',
      status: 'open',
      days_remaining: 30,
    }
    expect(cfp.type).toBe('collection')
    expect(cfp.days_remaining).toBe(30)
  })

  it('should export JournalRank interface', () => {
    const rank: JournalRank = {
      impact_factor: 5.0,
      sjr: 'Q1',
      jcr: 'Q1',
      ccf: 'A',
    }
    expect(rank.impact_factor).toBe(5.0)
  })

  it('should export CFPType union type', () => {
    const types: CFPType[] = ['cfp', 'collection', 'special_issue', 'research_topic']
    expect(types).toContain('cfp')
    expect(types).toContain('collection')
  })

  it('should export CFPStatus union type', () => {
    const statuses: CFPStatus[] = ['open', 'upcoming', 'closing', 'expired', 'unknown']
    expect(statuses).toContain('open')
    expect(statuses).toContain('expired')
  })

  it('should export SortField type', () => {
    const fields: SortField[] = ['deadline', 'title', 'impact_factor', 'publisher']
    expect(fields).toContain('deadline')
  })

  it('should export ViewMode type', () => {
    const modes: ViewMode[] = ['card', 'table']
    expect(modes).toContain('card')
  })
})