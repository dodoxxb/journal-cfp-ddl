import { describe, it, expect } from 'vitest'
import { getCountdown, formatDate, getPublisherStyle, getCountdownStyle, getCFPTypeLabel, getRankBadges } from '../lib/utils'

describe('utils.ts', () => {
  describe('getCountdown', () => {
    it('should return Expired for past dates', () => {
      const result = getCountdown('2020-01-01T23:59:59Z')
      expect(result.isExpired).toBe(true)
      expect(result.text).toBe('Expired')
    })

    it('should return days for dates within 30 days', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 10)
      futureDate.setHours(0, 0, 0, 0)
      const result = getCountdown(futureDate.toISOString())
      expect(result.isExpired).toBe(false)
      expect(result.days).toBeGreaterThanOrEqual(9)
    })

    it('should return hours for same-day countdown', () => {
      // Use a date that's within hours to test hours display
      const today = new Date()
      today.setHours(today.getHours() + 5)
      const result = getCountdown(today.toISOString())
      expect(result.isExpired).toBe(false)
      // Should show hours, not days
      expect(result.text).toMatch(/\d+h/)
    })
  })

  describe('formatDate', () => {
    it('should format date in en-US locale', () => {
      const result = formatDate('2024-06-15T23:59:59Z')
      expect(result).toContain('Jun')
      expect(result).toContain('2024')
    })
  })

  describe('getPublisherStyle', () => {
    it('should return correct style for Springer Nature', () => {
      const result = getPublisherStyle('Springer Nature')
      expect(result.bg).toBe('bg-blue-50')
      expect(result.text).toBe('text-blue-700')
    })

    it('should return correct style for Elsevier', () => {
      const result = getPublisherStyle('Elsevier')
      expect(result.bg).toBe('bg-orange-50')
    })

    it('should return default style for unknown publisher', () => {
      const result = getPublisherStyle('Unknown Publisher')
      expect(result.bg).toBe('bg-gray-50')
    })
  })

  describe('getCountdownStyle', () => {
    it('should return gray for expired status', () => {
      const result = getCountdownStyle('expired', 0)
      expect(result.text).toBe('text-gray-500')
    })

    it('should return red for closing (within 7 days)', () => {
      const result = getCountdownStyle('open', 5)
      expect(result.text).toBe('text-red-600')
    })

    it('should return green for open (>30 days)', () => {
      const result = getCountdownStyle('open', 60)
      expect(result.text).toBe('text-green-600')
    })
  })

  describe('getCFPTypeLabel', () => {
    it('should return Collection for collection type', () => {
      const result = getCFPTypeLabel('collection')
      expect(result.label).toBe('Collection')
    })

    it('should return Special Issue for special_issue type', () => {
      const result = getCFPTypeLabel('special_issue')
      expect(result.label).toBe('Special Issue')
    })

    it('should return default CFP for unknown type', () => {
      const result = getCFPTypeLabel('unknown' as any)
      expect(result.label).toBe('CFP')
    })
  })

  describe('getRankBadges', () => {
    it('should return empty array for undefined rank', () => {
      const result = getRankBadges(undefined)
      expect(result).toHaveLength(0)
    })

    it('should return badges for rank data', () => {
      const result = getRankBadges({ impact_factor: 5.0, sjr: 'Q1' })
      expect(result.length).toBeGreaterThan(0)
      expect(result.find(b => b.label === 'IF')).toBeDefined()
      expect(result.find(b => b.label === 'SJR')).toBeDefined()
    })
  })
})