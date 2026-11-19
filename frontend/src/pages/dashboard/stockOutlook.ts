import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { QK } from '@/lib/queryKeys'
import { BLOOD_GROUPS } from '@/lib/constants'
import { formatNumber, formatShortDate } from '@/lib/format'
import type { CapsuleDatum } from '@/components/dash/CapsuleChart'
import type { Signal } from '@/components/dash/tones'
import type { BloodGroup, BloodRequest, BloodStockRecord, Prediction, RegionCode, RiskLevel } from '@/types/api'
import { groupLabel, plural } from './shared'

/** Horizon des alertes de pénurie affichées sur l'accueil. */
export const OUTLOOK_DAYS = 7
const DAY_MS = 86_400_000
const RISK_RANK: Record<RiskLevel, number> = { CRITICAL: 0, WARNING: 1, NORMAL: 2 }

export interface GroupOutlook {
  units: number | null
  risk: RiskLevel | null
  riskDate: string | null
  daysOfSupply: number | null
}

export const riskSignal = (risk: RiskLevel | null): Signal =>
  risk === 'CRITICAL' ? 'critical' : risk === 'WARNING' ? 'warning' : 'ok'

/**
 * Réserves par groupe sanguin et pénuries prévues, pour une région (le CNTS
 * couvre sa région) ou pour tout le réseau (`region` absent : administrateur
 * général). Le dernier relevé de stock fait foi ; les prévisions critiques ou
 * en vigilance dans les `OUTLOOK_DAYS` jours colorent chaque groupe.
 */
export function useStockOutlook(region: RegionCode | string | undefined, now: number, enabled = true) {
  const scope = region ?? 'all'

  const { data: stocks = [], isPending: stocksPending } = useQuery<BloodStockRecord[]>({
    queryKey: [...QK.bloodStocks, scope],
    queryFn: async () =>
      (
        await api.get<{ results: BloodStockRecord[] }>('/api/ml/stocks/', region ? { region, days: 1 } : { days: 1 })
      ).results || [],
    enabled,
  })

  const { data: risks = [] } = useQuery<Prediction[]>({
    queryKey: [...QK.mlPredictionsList, 'outlook', scope],
    queryFn: async () => {
      const [critical, warning] = await Promise.all(
        (['CRITICAL', 'WARNING'] as const).map(
          async (risk_level) =>
            (
              await api.get<{ results: Prediction[] }>(
                '/api/ml/predictions/',
                region ? { region, risk_level } : { risk_level }
              )
            ).results || []
        )
      )
      return [...critical, ...warning]
    },
    enabled,
  })

  const latestDate = stocks.reduce<string | null>((max, s) => (!max || s.date > max ? s.date : max), null)
  const simulated = stocks.some((s) => s.source === 'synthetic')
  const horizon = new Date(now + OUTLOOK_DAYS * DAY_MS).toISOString().slice(0, 10)

  const outlook = useMemo(() => {
    const byGroup = new Map<BloodGroup, GroupOutlook>(
      BLOOD_GROUPS.map((g) => [g, { units: null, risk: null, riskDate: null, daysOfSupply: null }])
    )
    for (const s of stocks) {
      if (s.date !== latestDate) continue
      const entry = byGroup.get(s.blood_group)
      if (entry) entry.units = (entry.units ?? 0) + s.units_available
    }
    for (const p of risks) {
      if (p.prediction_date > horizon) continue
      const entry = byGroup.get(p.blood_group)
      if (!entry) continue
      const worse = !entry.risk || RISK_RANK[p.risk_level] < RISK_RANK[entry.risk]
      const sooner = entry.risk === p.risk_level && entry.riskDate !== null && p.prediction_date < entry.riskDate
      if (worse || sooner) {
        entry.risk = p.risk_level
        entry.riskDate = p.prediction_date
        entry.daysOfSupply = p.days_of_supply
      }
    }
    return byGroup
  }, [stocks, risks, latestDate, horizon])

  const hasStock = BLOOD_GROUPS.some((g) => outlook.get(g)?.units != null)
  const criticalGroups = BLOOD_GROUPS.filter((g) => outlook.get(g)?.risk === 'CRITICAL')
  // Échelle commune des capsules : la plus haute réserve, arrondie à la dizaine.
  const stockScale = Math.max(
    10,
    Math.ceil(Math.max(0, ...BLOOD_GROUPS.map((g) => outlook.get(g)?.units ?? 0)) / 10) * 10
  )

  return { stocks, stocksPending, outlook, latestDate, simulated, hasStock, criticalGroups, stockScale }
}

/** Une capsule par groupe : la hauteur dit la réserve, la couleur le risque prévu. */
export function stockCapsules(
  outlook: Map<BloodGroup, GroupOutlook>,
  stockScale: number,
  openRequests: BloodRequest[]
): CapsuleDatum[] {
  return BLOOD_GROUPS.map((g) => {
    const o = outlook.get(g)!
    const requestsForGroup = openRequests.filter((r) => r.blood_group === g).length
    return {
      key: g,
      label: groupLabel(g),
      value: o.units,
      capacity: stockScale,
      signal: o.units === null ? 'neutral' : riskSignal(o.risk),
      valueText: o.units === null ? 'Pas de relevé' : `${formatNumber(o.units)} poches`,
      // Sous la capsule : le chiffre seul (l'unité est dans le sous-titre de la carte).
      shortText: o.units === null ? '—' : formatNumber(o.units),
      details: [
        o.risk && o.riskDate
          ? `${o.risk === 'CRITICAL' ? 'Critique' : 'Bas'} le ${formatShortDate(o.riskDate)}${
              o.daysOfSupply != null ? ` · ${formatNumber(o.daysOfSupply, 1)} j de stock` : ''
            }`
          : `Pas de risque prévu à ${OUTLOOK_DAYS} j`,
        requestsForGroup > 0 ? plural(requestsForGroup, 'demande ouverte', 'demandes ouvertes') : 'Aucune demande ouverte',
      ],
    }
  })
}
