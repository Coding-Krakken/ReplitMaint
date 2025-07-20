import { describe, it, expect } from 'vitest'
import { 
  formatDate, 
  formatCurrency, 
  formatDuration, 
  formatFileSize,
  capitalizeFirst,
  truncateText,
  formatPhoneNumber,
  formatPercentage
} from '../../../client/src/utils/formatters'

describe('Formatter Utilities', () => {
  describe('formatDate', () => {
    it('should format date correctly with default format', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      const formatted = formatDate(date)
      
      expect(formatted).toMatch(/Jan 15, 2024|1\/15\/2024/)
    })

    it('should format date with custom format', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      const formatted = formatDate(date, 'yyyy-MM-dd')
      
      expect(formatted).toBe('2024-01-15')
    })

    it('should handle invalid date', () => {
      const formatted = formatDate(new Date('invalid'))
      expect(formatted).toBe('Invalid Date')
    })

    it('should format with time when specified', () => {
      const date = new Date('2024-01-15T10:30:00Z')
      const formatted = formatDate(date, 'PPp')
      
      expect(formatted).toContain('10:30')
    })
  })

  describe('formatCurrency', () => {
    it('should format currency with default USD', () => {
      const formatted = formatCurrency(1234.56)
      expect(formatted).toBe('$1,234.56')
    })

    it('should format currency with custom currency', () => {
      const formatted = formatCurrency(1234.56, 'EUR')
      expect(formatted).toBe('€1,234.56')
    })

    it('should handle zero amount', () => {
      const formatted = formatCurrency(0)
      expect(formatted).toBe('$0.00')
    })

    it('should handle negative amounts', () => {
      const formatted = formatCurrency(-123.45)
      expect(formatted).toBe('-$123.45')
    })

    it('should handle large numbers', () => {
      const formatted = formatCurrency(1000000.50)
      expect(formatted).toBe('$1,000,000.50')
    })
  })

  describe('formatDuration', () => {
    it('should format minutes correctly', () => {
      const formatted = formatDuration(45)
      expect(formatted).toBe('45m')
    })

    it('should format hours and minutes', () => {
      const formatted = formatDuration(125)
      expect(formatted).toBe('2h 5m')
    })

    it('should format days, hours, and minutes', () => {
      const formatted = formatDuration(1565) // 26h 5m = 1d 2h 5m
      expect(formatted).toBe('1d 2h 5m')
    })

    it('should handle zero duration', () => {
      const formatted = formatDuration(0)
      expect(formatted).toBe('0m')
    })

    it('should handle large durations', () => {
      const formatted = formatDuration(10080) // 1 week
      expect(formatted).toBe('7d')
    })
  })

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      const formatted = formatFileSize(512)
      expect(formatted).toBe('512 B')
    })

    it('should format kilobytes', () => {
      const formatted = formatFileSize(1536) // 1.5 KB
      expect(formatted).toBe('1.5 KB')
    })

    it('should format megabytes', () => {
      const formatted = formatFileSize(2097152) // 2 MB
      expect(formatted).toBe('2.0 MB')
    })

    it('should format gigabytes', () => {
      const formatted = formatFileSize(1073741824) // 1 GB
      expect(formatted).toBe('1.0 GB')
    })

    it('should handle zero size', () => {
      const formatted = formatFileSize(0)
      expect(formatted).toBe('0 B')
    })

    it('should handle decimal precision', () => {
      const formatted = formatFileSize(1234567)
      expect(formatted).toBe('1.2 MB')
    })
  })

  describe('capitalizeFirst', () => {
    it('should capitalize first letter', () => {
      const capitalized = capitalizeFirst('hello world')
      expect(capitalized).toBe('Hello world')
    })

    it('should handle empty string', () => {
      const capitalized = capitalizeFirst('')
      expect(capitalized).toBe('')
    })

    it('should handle single character', () => {
      const capitalized = capitalizeFirst('a')
      expect(capitalized).toBe('A')
    })

    it('should not change already capitalized string', () => {
      const capitalized = capitalizeFirst('Hello World')
      expect(capitalized).toBe('Hello World')
    })

    it('should handle special characters', () => {
      const capitalized = capitalizeFirst('123abc')
      expect(capitalized).toBe('123abc')
    })
  })

  describe('truncateText', () => {
    it('should truncate text longer than limit', () => {
      const truncated = truncateText('This is a very long text that should be truncated', 20)
      expect(truncated).toBe('This is a very lo...')
    })

    it('should not truncate text shorter than limit', () => {
      const truncated = truncateText('Short text', 20)
      expect(truncated).toBe('Short text')
    })

    it('should handle exact length', () => {
      const truncated = truncateText('Exactly twenty ch', 17)
      expect(truncated).toBe('Exactly twenty ch')
    })

    it('should handle custom suffix', () => {
      const truncated = truncateText('Long text here', 8, '---')
      expect(truncated).toBe('Long t---')
    })

    it('should handle empty string', () => {
      const truncated = truncateText('', 10)
      expect(truncated).toBe('')
    })
  })

  describe('formatPhoneNumber', () => {
    it('should format US phone number', () => {
      const formatted = formatPhoneNumber('1234567890')
      expect(formatted).toBe('(123) 456-7890')
    })

    it('should format phone number with country code', () => {
      const formatted = formatPhoneNumber('11234567890')
      expect(formatted).toBe('+1 (123) 456-7890')
    })

    it('should handle phone number with existing formatting', () => {
      const formatted = formatPhoneNumber('(123) 456-7890')
      expect(formatted).toBe('(123) 456-7890')
    })

    it('should handle invalid phone number', () => {
      const formatted = formatPhoneNumber('12345')
      expect(formatted).toBe('12345') // Return as-is if invalid
    })

    it('should handle empty string', () => {
      const formatted = formatPhoneNumber('')
      expect(formatted).toBe('')
    })
  })

  describe('formatPercentage', () => {
    it('should format percentage with default precision', () => {
      const formatted = formatPercentage(0.1234)
      expect(formatted).toBe('12.34%')
    })

    it('should format percentage with custom precision', () => {
      const formatted = formatPercentage(0.1234, 1)
      expect(formatted).toBe('12.3%')
    })

    it('should handle zero percentage', () => {
      const formatted = formatPercentage(0)
      expect(formatted).toBe('0.00%')
    })

    it('should handle 100 percent', () => {
      const formatted = formatPercentage(1)
      expect(formatted).toBe('100.00%')
    })

    it('should handle values over 100%', () => {
      const formatted = formatPercentage(1.5)
      expect(formatted).toBe('150.00%')
    })

    it('should handle negative percentages', () => {
      const formatted = formatPercentage(-0.25)
      expect(formatted).toBe('-25.00%')
    })
  })
})