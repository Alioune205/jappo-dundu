import { describe, it, expect } from 'vitest'
import {
  formatNumber,
  formatPercent,
  formatMinutes,
  formatDistance,
  formatPhone,
  initials,
} from './format'

describe('Formatters', () => {
  it('formats numbers with french locale', () => {
    expect(formatNumber(1250)).toContain('1')
    expect(formatNumber(null)).toBe('—')
  })

  it('formats percent values', () => {
    expect(formatPercent(0.85)).toContain('85')
    expect(formatPercent(null)).toBe('—')
  })

  it('formats duration in minutes and hours', () => {
    expect(formatMinutes(25)).toContain('25 min')
    expect(formatMinutes(90)).toContain('1 h 30')
    expect(formatMinutes(null)).toBe('—')
  })

  it('formats distance', () => {
    expect(formatDistance(0.5)).toBe('500 m')
    expect(formatDistance(12.4)).toContain('12,4 km')
    expect(formatDistance(null)).toBe('—')
  })

  it('formats senegalese phone number', () => {
    expect(formatPhone('+221771234567')).toBe('+221 77 123 45 67')
    expect(formatPhone(null)).toBe('—')
  })

  it('extracts initials', () => {
    expect(initials('Awa Ndiaye')).toBe('AN')
    expect(initials('Diallo')).toBe('D')
  })
})
