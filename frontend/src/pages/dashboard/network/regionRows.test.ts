import { describe, expect, it } from 'vitest'
import { bloodRequest, facility, mission } from '@/test/fixtures'
import type { BedSummaryRow, PredictionSummaryRow } from '@/types/api'
import { buildRegionRows } from './regionRows'

const beds = (region: BedSummaryRow['region'], total: number, occupied: number): BedSummaryRow => ({
  region,
  region_display: region,
  category: 'emergency',
  category_display: 'Urgences',
  total_beds: total,
  occupied_beds: occupied,
  reserved_beds: 0,
  available_beds: total - occupied,
  occupancy_rate: occupied / total,
})

const risk = (region: PredictionSummaryRow['region'], critical: number, warning = 0): PredictionSummaryRow => ({
  region,
  region_display: region,
  total_predictions: critical + warning + 1,
  critical_count: critical,
  warning_count: warning,
  normal_count: 1,
})

describe('buildRegionRows', () => {
  it('agrège les trois modules par région et place d’abord les régions en alerte', () => {
    const rows = buildRegionRows({
      bedSummary: [beds('dakar', 10, 9), beds('thies', 10, 5), beds('thies', 10, 5)],
      predictions: [risk('thies', 0, 2), risk('kaolack', 1)],
      requests: [
        bloodRequest({ id: 1, urgency: 'critical', facility: facility({ region: 'dakar' }) }),
        bloodRequest({ id: 2, urgency: 'urgent', facility: facility({ region: 'dakar' }) }),
      ],
      missions: [mission({ id: 1, status: 'pending', region: 'dakar' }), mission({ id: 2, status: 'on_site', region: 'thies' })],
      facilities: [facility({ id: 1, region: 'dakar' }), facility({ id: 2, region: 'dakar' })],
    })

    const dakar = rows.find((r) => r.code === 'dakar')!
    expect(dakar).toMatchObject({ vital: 1, openRequests: 2, pending: 1, activeMissions: 1, facilities: 2, alarms: 2, signal: 'critical' })
    expect(dakar.rate).toBeCloseTo(0.9)

    // Thiès : deux services additionnés (10 occupés sur 20), vigilance seulement, aucun point critique.
    const thies = rows.find((r) => r.code === 'thies')!
    expect(thies.beds).toEqual({ total: 20, occupied: 10, available: 10 })
    expect(thies.alarms).toBe(0)

    // Kaolack n'a pas de lits déclarés : pas de taux inventé.
    const kaolack = rows.find((r) => r.code === 'kaolack')!
    expect(kaolack.rate).toBeNull()
    expect(kaolack.signal).toBe('neutral')

    expect(rows.map((r) => r.code)).toEqual(['dakar', 'kaolack', 'thies'])
  })

  it('ignore une région qui n’a que des structures, sans aucune donnée', () => {
    const rows = buildRegionRows({
      bedSummary: [],
      predictions: [],
      requests: [],
      missions: [],
      facilities: [facility({ region: 'matam' })],
    })
    expect(rows).toEqual([])
  })
})
