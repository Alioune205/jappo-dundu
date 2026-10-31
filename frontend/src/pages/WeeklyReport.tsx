import React, { useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/context/AuthContext'
import { REGIONS } from '@/lib/constants'
import { formatDateTime, formatNumber } from '@/lib/format'
import { formatKpi, useKpis } from './dashboard/kpis'

const VOLUME_LABELS: Record<string, string> = {
  missions: 'Missions d’ambulance',
  missions_completed: 'Missions terminées',
  late_missions: 'Arrivées sur place après 30 min',
  sos: 'Alertes SOS de citoyens',
  transfers: 'Transferts entre établissements',
  incidents: 'Incidents à plusieurs victimes',
  blood_requests_closed: 'Demandes de sang clôturées',
  blood_units_collected: 'Poches collectées pour ces demandes',
}

const STATUS_LABELS = { ok: 'Atteint', warning: 'À surveiller', critical: 'Hors objectif', no_data: 'Pas de données' }

/**
 * Rapport hebdomadaire (ministère, CNTS, direction des hôpitaux) : objectifs
 * et volumes, prêt à imprimer ou à enregistrer en PDF depuis le navigateur.
 */
export const WeeklyReport: React.FC = () => {
  const { isAdmin } = useAuth()
  const [days, setDays] = useState(7)
  const [region, setRegion] = useState('')
  const { data } = useKpis(days, region)

  return (
    <div className="report space-y-6">
      <PageHeader
        title="Rapport de pilotage"
        description={
          data
            ? `${data.days} derniers jours · ${data.region ? (REGIONS.find((r) => r.value === data.region)?.label ?? data.region) : 'tout le pays'} · généré le ${formatDateTime(data.generated_at)}`
            : 'Chargement…'
        }
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Select
              aria-label="Période"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-auto"
            >
              <option value={7}>7 jours</option>
              <option value={30}>30 jours</option>
            </Select>
            {isAdmin && (
              <Select aria-label="Région" value={region} onChange={(e) => setRegion(e.target.value)} className="w-auto">
                <option value="">Tout le pays</option>
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            )}
            <Button
              variant="primary"
              size="sm"
              icon={<Printer className="h-3.5 w-3.5" />}
              onClick={() => window.print()}
            >
              Imprimer / PDF
            </Button>
          </div>
        }
      />
      {data && (
        <>
          <section className="panel">
            <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-fg">Objectifs</h2>
            <table className="ops-table" aria-label="Objectifs">
              <thead>
                <tr>
                  <th>Indicateur</th>
                  <th className="text-right">Valeur</th>
                  <th className="text-right">Objectif</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {data.indicators.map((kpi) => (
                  <tr key={kpi.key}>
                    <td>{kpi.label}</td>
                    <td className="num text-right font-semibold">{formatKpi(kpi.value, kpi.unit)}</td>
                    <td className="num text-right">{formatKpi(kpi.target, kpi.unit)}</td>
                    <td>{STATUS_LABELS[kpi.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="panel">
            <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-fg">Activité</h2>
            <table className="ops-table" aria-label="Activité">
              <tbody>
                {Object.entries(VOLUME_LABELS).map(([key, label]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td className="num text-right font-semibold">{formatNumber(data.volumes[key] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <p className="text-xs text-muted">
            Sources : missions, demandes de sang et capacités en lits enregistrées dans Jappo Dundu. Objectifs
            indicatifs, à valider avec le ministère de la Santé.
          </p>
        </>
      )}
    </div>
  )
}
