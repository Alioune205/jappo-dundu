import React from 'react'
import { CircleAlert, CircleCheck, CircleDashed, Target, TriangleAlert } from 'lucide-react'
import { formatKpi, useKpis } from './kpis'

const STATUS = {
  ok: {
    icon: CircleCheck,
    text: 'text-ok',
    bg: 'bg-ok/10 text-ok',
    bar: 'bg-ok',
    label: 'Objectif atteint',
  },
  warning: {
    icon: TriangleAlert,
    text: 'text-warning',
    bg: 'bg-warning/15 text-warning',
    bar: 'bg-warning',
    label: 'À surveiller',
  },
  critical: {
    icon: CircleAlert,
    text: 'text-critical',
    bg: 'bg-critical/12 text-critical',
    bar: 'bg-critical',
    label: 'Hors objectif',
  },
  no_data: {
    icon: CircleDashed,
    text: 'text-subtle',
    bg: 'bg-raised text-muted',
    bar: 'bg-subtle',
    label: 'Pas de données',
  },
} as const

/** Indicateurs de pilotage avec leur objectif : l'état se lit sans couleur (icône + libellé + jauge). */
export const KpiPanel: React.FC<{ days?: number }> = ({ days = 7 }) => {
  const { data } = useKpis(days)
  if (!data) return null
  return (
    <section className="panel dash-panel-in overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Target className="h-4 w-4 text-brand" aria-hidden="true" />
            Objectifs du réseau
          </h2>
          <p className="text-xs text-muted">{data.days} derniers jours · objectifs à valider avec le ministère</p>
        </div>
        <span className="rounded-full bg-raised px-2.5 py-1 text-2xs font-medium text-muted">
          Fenêtre glissante {data.days} j
        </span>
      </div>
      <ul className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
        {data.indicators.map((kpi) => {
          const status = STATUS[kpi.status]
          const Icon = status.icon
          const fillPct =
            kpi.value == null || kpi.target <= 0
              ? 0
              : kpi.unit === 'minutes'
                ? Math.min(100, Math.max(12, Math.round((kpi.target / Math.max(kpi.value, 1)) * 100)))
                : Math.min(100, Math.max(8, Math.round((kpi.value / kpi.target) * 100)))

          return (
            <li key={kpi.key} className="flex flex-col justify-between bg-surface px-5 py-4 transition-colors hover:bg-raised/40">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-muted">{kpi.label}</p>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.bg}`}>
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {status.label}
                  </span>
                </div>
                <p className="num mt-2 text-2xl font-bold tracking-tight text-fg">{formatKpi(kpi.value, kpi.unit)}</p>
              </div>

              <div className="mt-3 space-y-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised" aria-hidden="true">
                  <div className={`bar-origin-left h-full rounded-full ${status.bar}`} style={{ width: `${fillPct}%` }} />
                </div>
                <p className="flex items-center justify-between text-2xs text-muted">
                  <span>Cible ministérielle</span>
                  <span className="num font-semibold text-fg">objectif {formatKpi(kpi.target, kpi.unit)}</span>
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
