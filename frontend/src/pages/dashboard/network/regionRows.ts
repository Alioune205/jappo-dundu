import { occupancySignal, type Signal } from '@/components/dash/tones'
import { REGIONS } from '@/lib/constants'
import type { BedSummaryRow, BloodRequest, FacilitySummary, Mission, PredictionSummaryRow, RegionCode } from '@/types/api'

export const REGION_LABEL = Object.fromEntries(REGIONS.map((r) => [r.value, r.label])) as Record<RegionCode, string>

export interface RegionSources {
  bedSummary: BedSummaryRow[]
  predictions: PredictionSummaryRow[]
  requests: BloodRequest[]
  missions: Mission[]
  facilities: FacilitySummary[]
}

export interface RegionRow {
  code: RegionCode
  label: string
  facilities: number
  beds: { total: number; occupied: number; available: number } | null
  rate: number | null
  signal: Signal
  risk: { critical: number; warning: number } | null
  vital: number
  openRequests: number
  pending: number
  activeMissions: number
  /** Points critiques : urgence vitale, mission sans ambulance, pénurie critique prévue. */
  alarms: number
}

/** Agrège les données des trois modules par région (seules les régions avec au moins une donnée). */
export function buildRegionRows({
  bedSummary,
  predictions,
  requests,
  missions,
  facilities,
}: RegionSources): RegionRow[] {
  const rows = new Map<RegionCode, RegionRow>()
  const get = (code: RegionCode) => {
    let row = rows.get(code)
    if (!row) {
      row = {
        code,
        label: REGION_LABEL[code] ?? code,
        facilities: 0,
        beds: null,
        rate: null,
        signal: 'neutral',
        risk: null,
        vital: 0,
        openRequests: 0,
        pending: 0,
        activeMissions: 0,
        alarms: 0,
      }
      rows.set(code, row)
    }
    return row
  }
  for (const f of facilities) {
    if ((f as { is_active?: boolean }).is_active === false || !f.region) continue
    get(f.region).facilities += 1
  }
  for (const b of bedSummary) {
    const row = get(b.region)
    row.beds ??= { total: 0, occupied: 0, available: 0 }
    row.beds.total += b.total_beds
    row.beds.occupied += b.occupied_beds
    row.beds.available += b.available_beds
  }
  for (const p of predictions) {
    if (p.critical_count + p.warning_count + p.normal_count === 0) continue
    get(p.region).risk = { critical: p.critical_count, warning: p.warning_count }
  }
  for (const r of requests) {
    const code = r.facility?.region
    if (!code) continue
    const row = get(code)
    row.openRequests += 1
    if (r.urgency === 'critical') row.vital += 1
  }
  for (const m of missions) {
    if (!m.region) continue
    const row = get(m.region)
    row.activeMissions += 1
    if (m.status === 'pending') row.pending += 1
  }
  for (const row of rows.values()) {
    row.rate = row.beds && row.beds.total > 0 ? row.beds.occupied / row.beds.total : null
    row.signal = occupancySignal(row.rate)
    row.alarms = row.vital + row.pending + (row.risk?.critical ?? 0)
  }
  return [...rows.values()]
    .filter((r) => r.beds || r.risk || r.openRequests || r.activeMissions)
    .sort(
      (a, b) =>
        b.alarms - a.alarms ||
        (b.rate ?? -1) - (a.rate ?? -1) ||
        b.facilities - a.facilities
    )
}
