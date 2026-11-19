import React, { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { EmptyNote, Legend, LegendItem, Panel } from '@/components/dash/Panel'
import { SIGNAL_FILL, SIGNAL_TEXT, type Signal } from '@/components/dash/tones'
import { SENEGAL_REGIONS, SENEGAL_VIEWBOX } from '@/components/map/senegalRegions'
import { formatNumber, formatPercent } from '@/lib/format'
import type { RegionCode } from '@/types/api'
import { REGION_LABEL, buildRegionRows, type RegionSources } from './regionRows'


/** Remplissage de la carte selon l'occupation des lits de la région. */
const MAP_FILL: Record<Signal, string> = {
  critical: 'var(--viz-crit)',
  warning: 'var(--viz-warn)',
  ok: 'var(--viz-base-soft)',
  info: 'var(--viz-base-soft)',
  neutral: 'var(--track)',
}

interface RegionPressureProps extends RegionSources {
  show: { beds: boolean; blood: boolean; fleet: boolean }
  loading: boolean
  i?: number
  className?: string
}

/** Compte d'exceptions : rouge et gras s'il y en a, discret sinon. */
const Count: React.FC<{ value: number }> = ({ value }) =>
  value > 0 ? (
    <span className="num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-critical/10 px-1.5 text-2xs font-bold text-critical">
      {value}
    </span>
  ) : (
    <span className="num text-subtle">0</span>
  )

/**
 * Tension par région : la carte du Sénégal teintée selon l'occupation des lits
 * (seules les régions en vigilance ou en tension prennent une couleur), un
 * repère rouge sur chaque région qui a un point critique, et le tableau qui
 * détaille les trois modules. Survoler une ligne éclaire la région, et
 * inversement.
 */
export const RegionPressure: React.FC<RegionPressureProps> = ({ show, loading, i = 0, className = '', ...data }) => {
  const [focus, setFocus] = useState<RegionCode | null>(null)
  const rows = useMemo(
    () => buildRegionRows(data),
    // Les tableaux sont stables (mémoïsés par l'appelant).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.bedSummary, data.predictions, data.requests, data.missions, data.facilities]
  )
  const byCode = new Map(rows.map((r) => [r.code, r]))
  const shown = rows.slice(0, 8)
  const hidden = rows.length - shown.length
  const tense = rows.filter((r) => r.signal === 'critical' || r.signal === 'warning').length
  const withAlarm = rows.filter((r) => r.alarms > 0).length
  const focused = focus ? byCode.get(focus) : undefined

  const subtitle = loading
    ? 'Chargement des régions'
    : rows.length === 0
      ? 'Aucune donnée régionale'
      : [
          withAlarm > 0 ? `${withAlarm} région${withAlarm > 1 ? 's' : ''} avec un point critique` : 'Aucun point critique',
          show.beds ? `${tense} en tension sur les lits` : null,
        ]
          .filter(Boolean)
          .join(' · ')

  return (
    <Panel
      i={i}
      className={className}
      title="Tension par région"
      subtitle={subtitle}
      footer={
        rows.length > 0 ? (
          <>
            <Legend label="Légende de la carte">
              {show.beds && (
                <>
                  <LegendItem className="bg-viz-base-soft">Lits ≤ 70 %</LegendItem>
                  <LegendItem className="bg-viz-warn">70 à 85 %</LegendItem>
                  <LegendItem className="bg-viz-crit">&gt; 85 %</LegendItem>
                  <LegendItem kind="rest">Sans déclaration</LegendItem>
                </>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border-2 border-surface bg-critical shadow-[0_0_0_1px_var(--critical)]" />
                Point critique
              </span>
            </Legend>
            <span className="text-subtle">Contours © geoBoundaries (CC BY 4.0)</span>
          </>
        ) : undefined
      }
      bodyClassName="px-5 pb-4 pt-4"
    >
      {loading ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" aria-label="Chargement">
          <div className="skeleton h-[230px]" />
          <div className="space-y-2.5">
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <span key={k} className="skeleton block h-7" />
            ))}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyNote title="Aucune donnée régionale" hint="Les régions apparaîtront dès que les structures publieront leurs lits, demandes ou missions." />
      ) : (
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          {/* Carte : une seule variable (occupation des lits), plus le repère des points critiques. */}
          <div className="relative">
            <svg
              viewBox={SENEGAL_VIEWBOX}
              className="h-auto w-full"
              role="img"
              aria-label="Carte des régions du Sénégal teintées selon l’occupation des lits, avec un repère sur les régions qui ont un point critique"
            >
              {(Object.keys(SENEGAL_REGIONS) as RegionCode[]).map((code) => {
                const row = byCode.get(code)
                const active = code === focus
                return (
                  <path
                    key={code}
                    d={SENEGAL_REGIONS[code].d}
                    onMouseEnter={() => setFocus(code)}
                    onMouseLeave={() => setFocus(null)}
                    className="region-shape cursor-default"
                    fill={show.beds && row ? MAP_FILL[row.signal] : 'var(--track)'}
                    fillOpacity={focus && !active ? 0.55 : 1}
                    stroke={active ? 'var(--fg)' : 'var(--surface)'}
                    strokeWidth={active ? 1.6 : 1.1}
                    strokeLinejoin="round"
                  >
                    <title>{REGION_LABEL[code]}</title>
                  </path>
                )
              })}
              {rows
                .filter((r) => r.alarms > 0)
                .map((r) => (
                  <g key={r.code} pointerEvents="none">
                    <circle className="map-ping" cx={SENEGAL_REGIONS[r.code].cx} cy={SENEGAL_REGIONS[r.code].cy} r={9} fill="var(--critical)" opacity={0.22} />
                    <circle cx={SENEGAL_REGIONS[r.code].cx} cy={SENEGAL_REGIONS[r.code].cy} r={4.5} fill="var(--critical)" stroke="var(--surface)" strokeWidth={2} />
                  </g>
                ))}
            </svg>
            {focused && (
              <div className="pointer-events-none absolute left-0 top-0 rounded-xl bg-inverse px-3 py-2 text-2xs text-on-inverse shadow-[var(--shadow-raised)]" aria-live="polite">
                <p className="text-xs font-semibold">{focused.label}</p>
                {focused.rate !== null && (
                  <p className="num opacity-80">
                    {formatPercent(focused.rate)} des lits occupés · {formatNumber(focused.beds?.available)} libres
                  </p>
                )}
                <p className="num opacity-80">
                  {focused.facilities} structure{focused.facilities > 1 ? 's' : ''} connectée{focused.facilities > 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>

          {/* Tableau : une ligne par région, les plus exposées d'abord. */}
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[21rem] border-separate border-spacing-0 text-xs">
              <caption className="sr-only">Situation des régions, les plus exposées en premier</caption>
              <thead>
                <tr className="text-left align-bottom text-2xs font-medium leading-tight text-subtle">
                  <th scope="col" className="pb-2 pr-2 font-medium">Région</th>
                  {show.beds && <th scope="col" className="pb-2 pr-2 font-medium">Lits occupés</th>}
                  {show.blood && (
                    <th scope="col" className="pb-2 pr-2 text-right font-medium">
                      Urgences
                      <br />
                      vitales
                    </th>
                  )}
                  {show.fleet && (
                    <th scope="col" className="pb-2 pr-2 text-right font-medium">
                      Sans
                      <br />
                      ambulance
                    </th>
                  )}
                  {show.blood && (
                    <th scope="col" className="pb-2 text-right font-medium" title="Séries centre × groupe sanguin en risque critique dans les 7 jours">
                      Pénurie
                      <br />
                      prévue
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const active = r.code === focus
                  return (
                    <tr
                      key={r.code}
                      onMouseEnter={() => setFocus(r.code)}
                      onMouseLeave={() => setFocus(null)}
                      className={`transition-colors ${active ? 'bg-raised' : ''}`}
                    >
                      <th scope="row" className="rounded-l-lg border-t border-line py-2 pl-1 pr-2 text-left font-semibold text-fg">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.alarms > 0 ? 'bg-critical' : 'bg-transparent'}`}
                          />
                          <span className="truncate">{r.label}</span>
                        </span>
                      </th>
                      {show.beds && (
                        <td className="border-t border-line py-2 pr-2">
                          {r.rate === null ? (
                            <span className="text-subtle">—</span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-track" aria-hidden="true">
                                <span className={`bar-fill block h-full rounded-full ${SIGNAL_FILL[r.signal]}`} style={{ width: `${Math.min(1, r.rate) * 100}%` }} />
                              </span>
                              <span className={`num font-semibold ${r.signal === 'ok' ? 'text-fg' : SIGNAL_TEXT[r.signal]}`}>{formatPercent(r.rate)}</span>
                            </span>
                          )}
                        </td>
                      )}
                      {show.blood && (
                        <td className="border-t border-line py-2 pr-2 text-right">
                          <Count value={r.vital} />
                        </td>
                      )}
                      {show.fleet && (
                        <td className="border-t border-line py-2 pr-2 text-right">
                          <Count value={r.pending} />
                        </td>
                      )}
                      {show.blood && (
                        <td className="rounded-r-lg border-t border-line py-2 text-right">
                          {r.risk === null ? <span className="text-subtle">—</span> : <Count value={r.risk.critical} />}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-2xs text-subtle">
              <span>
                {hidden > 0
                  ? `+ ${hidden} autre${hidden > 1 ? 's' : ''} région${hidden > 1 ? 's' : ''}, moins exposée${hidden > 1 ? 's' : ''}`
                  : `${rows.length} région${rows.length > 1 ? 's' : ''} avec des données`}
              </span>
              {show.beds && (
                <Link to="/beds" className="font-semibold text-fg underline-offset-2 hover:underline">
                  Lits par établissement
                </Link>
              )}
            </p>
          </div>
        </div>
      )}
    </Panel>
  )
}
