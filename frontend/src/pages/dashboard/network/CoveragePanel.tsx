import React, { useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'
import { EmptyNote, Panel } from '@/components/dash/Panel'
import { SENEGAL_REGIONS, SENEGAL_VIEWBOX } from '@/components/map/senegalRegions'
import { formatNumber, formatPercent } from '@/lib/format'
import { REGIONS } from '@/lib/constants'
import type { FacilitySummary, RegionCode } from '@/types/api'

/** Libellés accentués de l'application (les contours sources n'ont pas d'accents). */
const REGION_LABEL = Object.fromEntries(REGIONS.map((r) => [r.value, r.label])) as Record<RegionCode, string>

interface CoveragePanelProps {
  facilities: FacilitySummary[]
  loading: boolean
  i?: number
  className?: string
}

/**
 * Couverture nationale : où se trouvent les structures connectées. Chaque
 * région est teintée selon son nombre de structures ; une région sans
 * structure reste sur la piste pâle (absence, pas zéro mesuré).
 */
export const CoveragePanel: React.FC<CoveragePanelProps> = ({ facilities, loading, i = 0, className = '' }) => {
  const [hovered, setHovered] = useState<RegionCode | null>(null)

  const { counts, total, max, ranking } = useMemo(() => {
    const map = new Map<RegionCode, number>()
    for (const f of facilities) {
      if ((f as { is_active?: boolean }).is_active === false) continue
      map.set(f.region, (map.get(f.region) ?? 0) + 1)
    }
    const sum = [...map.values()].reduce((a, b) => a + b, 0)
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1])
    return { counts: map, total: sum, max: Math.max(1, ...map.values()), ranking: sorted }
  }, [facilities])

  const top = ranking.slice(0, 4)
  const others = ranking.slice(4).reduce((acc, [, n]) => acc + n, 0)
  const leader = ranking[0]
  const focus = hovered ?? leader?.[0] ?? null
  const focusCount = focus ? (counts.get(focus) ?? 0) : 0

  return (
    <Panel
      i={i}
      className={className}
      eyebrow="Géographie"
      title={
        <span className="flex items-center gap-2">
          <MapPin className="h-[1.125rem] w-[1.125rem] text-tint-blue" aria-hidden="true" />
          Couverture nationale
        </span>
      }
      subtitle={
        total > 0
          ? `${formatNumber(total)} structure${total > 1 ? 's' : ''} connectée${total > 1 ? 's' : ''} · ${counts.size} région${counts.size > 1 ? 's' : ''} sur 14`
          : 'Répartition des structures connectées'
      }
      bodyClassName="px-5 pb-3 pt-5"
    >
      {loading ? (
        <div className="skeleton h-[210px]" aria-label="Chargement" />
      ) : total === 0 ? (
        <EmptyNote title="Aucune structure connectée" hint="Les établissements apparaîtront ici dès leur inscription au réseau." />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <div className="relative mx-auto w-full max-w-[26rem]">
            <svg viewBox={SENEGAL_VIEWBOX} className="h-auto w-full" role="img" aria-label="Carte des régions du Sénégal, teintées selon le nombre de structures connectées">
              {(Object.keys(SENEGAL_REGIONS) as RegionCode[]).map((code) => {
                const region = SENEGAL_REGIONS[code]
                const n = counts.get(code) ?? 0
                const active = code === focus
                return (
                  <path
                    key={code}
                    d={region.d}
                    onMouseEnter={() => setHovered(code)}
                    onMouseLeave={() => setHovered(null)}
                    className="cursor-default transition-[fill-opacity] duration-200"
                    fill={n > 0 ? 'var(--tint-blue)' : 'var(--tint-blue-soft)'}
                    fillOpacity={n > 0 ? 0.35 + 0.65 * (n / max) : 1}
                    stroke={active ? 'var(--fg)' : 'color-mix(in oklab, var(--tint-blue) 30%, var(--surface))'}
                    strokeWidth={active ? 1.4 : 0.9}
                    strokeLinejoin="round"
                  >
                    <title>{`${REGION_LABEL[code]} : ${n} structure${n > 1 ? 's' : ''}`}</title>
                  </path>
                )
              })}
              {focus && (
                <circle
                  cx={SENEGAL_REGIONS[focus].cx}
                  cy={SENEGAL_REGIONS[focus].cy}
                  r={4}
                  fill="var(--tint-red)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              )}
            </svg>
            {/* Attribution exigée par la licence CC BY 4.0 des contours. */}
            <span className="pointer-events-none absolute bottom-0 right-0 text-[0.625rem] text-subtle">© geoBoundaries</span>
            {focus && (
              <span
                className="pointer-events-none absolute left-1 top-1 rounded-lg bg-surface px-2.5 py-1.5 text-2xs shadow-[var(--shadow-raised)]"
                aria-live="polite"
              >
                <span className="block font-semibold text-fg">{REGION_LABEL[focus]}</span>
                <span className="num text-muted">
                  {formatNumber(focusCount)} structure{focusCount > 1 ? 's' : ''} · {formatPercent(focusCount / total, 1)}
                </span>
              </span>
            )}
          </div>

          <div className="border-t border-line pt-3">
            <p className="mb-2.5 text-xs font-semibold text-fg">Régions principales</p>
            <ul className="grid grid-cols-2 gap-x-5 gap-y-2.5 text-xs">
              {top.map(([code, n]) => (
                <li key={code}>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-muted">{REGION_LABEL[code]}</span>
                    <span className="num font-semibold text-fg">{formatPercent(n / total, 1)}</span>
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-track" aria-hidden="true">
                    <span className="bar-fill block h-full rounded-full bg-tint-blue" style={{ width: `${(n / max) * 100}%` }} />
                  </span>
                </li>
              ))}
              {others > 0 && (
                <li className="flex items-baseline justify-between gap-2">
                  <span className="text-muted">Autres</span>
                  <span className="num font-semibold text-fg">{formatPercent(others / total, 1)}</span>
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </Panel>
  )
}
