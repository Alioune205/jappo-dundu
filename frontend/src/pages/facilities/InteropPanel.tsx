import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Network } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { formatDateTime } from '@/lib/format'

interface SyncRow {
  facility: { id: number; name: string; region: string }
  last_success: string | null
  hours_since: number | null
  stale: boolean
}

/** Télécharge une réponse JSON de l'API comme fichier. */
async function download(path: string, filename: string) {
  const data = await api.get<unknown>(path)
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Interopérabilité : fraîcheur des synchronisations des logiciels hospitaliers
 * (clés SIH) et exports FHIR (lits) et DHIS2 (agrégats de la semaine).
 */
export const InteropPanel: React.FC = () => {
  const { data: rows = [] } = useQuery<SyncRow[]>({
    queryKey: ['sih-monitoring'],
    queryFn: () => api.get<SyncRow[]>('/api/sih/monitoring/'),
  })
  const stamp = new Date().toISOString().slice(0, 10)

  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Network className="h-4 w-4 text-muted" aria-hidden="true" />
          Interopérabilité
        </h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => download('/api/sih/fhir/beds/', `jappo-dundu-lits-fhir-${stamp}.json`)}
          >
            Lits (FHIR)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => download('/api/sih/dhis2/', `jappo-dundu-dhis2-${stamp}.json`)}
          >
            Semaine (DHIS2)
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">Aucun logiciel hospitalier relié par clé SIH.</p>
      ) : (
        <table className="ops-table" aria-label="Synchronisations des logiciels hospitaliers">
          <thead>
            <tr>
              <th>Établissement</th>
              <th>Dernière synchronisation réussie</th>
              <th>État</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.facility.id}>
                <td>{row.facility.name}</td>
                <td className="num">{row.last_success ? formatDateTime(row.last_success) : 'jamais'}</td>
                <td className={row.stale ? 'font-semibold text-critical' : 'text-ok'}>
                  {row.stale ? 'Silencieux depuis plus de 6 h' : 'À jour'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
