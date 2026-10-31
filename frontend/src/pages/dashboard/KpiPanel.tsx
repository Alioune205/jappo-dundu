import React from 'react'
import { CircleAlert, CircleCheck, CircleDashed, Target, TriangleAlert } from 'lucide-react'
import { formatKpi, useKpis } from './kpis'

const STATUS = {
  ok: { icon: CircleCheck, text: 'text-ok', label: 'Objectif atteint' },
  warning: { icon: TriangleAlert, text: 'text-warning', label: 'À surveiller' },
  critical: { icon: CircleAlert, text: 'text-critical', label: 'Hors objectif' },
  no_data: { icon: CircleDashed, text: 'text-subtle', label: 'Pas de données' },
} as const

/** Indicateurs de pilotage avec leur objectif : l'état se lit sans couleur (icône + libellé). */
export const KpiPanel: React.FC<{ days?: number }> = ({ days = 7 }) => {
  const { data } = useKpis(days)
  if (!data) return null
  return (
    <section className="panel">
      <div className="border-b border-line px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Target className="h-4 w-4 text-muted" aria-hidden="true" />
          Objectifs du réseau
        </h2>
        <p className="text-xs text-muted">{data.days} derniers jours · objectifs à valider avec le ministère</p>
      </div>
      <ul className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
        {data.indicators.map((kpi) => {
          const status = STATUS[kpi.status]
          const Icon = status.icon
          return (
            <li key={kpi.key} className="bg-surface px-5 py-3">
              <p className="text-xs text-muted">{kpi.label}</p>
              <p className="num mt-1 text-xl font-semibold text-fg">{formatKpi(kpi.value, kpi.unit)}</p>
              <p className={`mt-0.5 flex items-center gap-1 text-2xs font-semibold ${status.text}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {status.label}
                <span className="font-normal text-muted">· objectif {formatKpi(kpi.target, kpi.unit)}</span>
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
