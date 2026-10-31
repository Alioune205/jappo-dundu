import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { api } from '@/lib/api'
import { Select } from '@/components/ui/Input'
import { formatDateTime } from '@/lib/format'

interface AuditEvent {
  id: number
  created_at: string
  action: string
  user: { id: number; full_name: string } | null
  facility: { id: number; name: string } | null
  target: string
  detail: Record<string, unknown>
  ip_address: string | null
}

const ACTIONS = [
  { value: '', label: 'Toutes les actions' },
  { value: 'donor.', label: 'Recherche de donneurs' },
  { value: 'sos.', label: 'Fiches d’urgence consultées' },
  { value: 'emergency_access.', label: 'Accès d’urgence' },
  { value: 'two_factor.', label: 'Double authentification' },
]

const ACTION_LABELS: Record<string, string> = {
  'donor.lookup': 'Recherche d’un donneur',
  'sos.caller_card': 'Fiche d’urgence consultée',
  'emergency_access.open': 'Accès d’urgence ouvert',
  'two_factor.enabled': 'Double authentification activée',
  'two_factor.disabled': 'Double authentification désactivée',
}

/** Journal d'audit (administrateur général) : qui a consulté ou fait quoi, quand, d'où. */
export const AuditLogPanel: React.FC = () => {
  const [action, setAction] = useState('')
  const { data: events = [], isLoading } = useQuery<AuditEvent[]>({
    queryKey: ['audit-log', action],
    queryFn: () => api.get<AuditEvent[]>('/api/security/audit/', { action: action || undefined, limit: 100 }),
  })

  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <ScrollText className="h-4 w-4 text-muted" aria-hidden="true" />
          Journal d’audit
        </h2>
        <Select
          aria-label="Filtrer par action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="w-auto"
        >
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
      </div>
      {isLoading ? (
        <p className="px-4 py-6 text-xs text-muted">Chargement…</p>
      ) : events.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">Aucun événement.</p>
      ) : (
        <table className="ops-table" aria-label="Journal d’audit">
          <thead>
            <tr>
              <th>Date</th>
              <th>Action</th>
              <th>Compte</th>
              <th>Établissement</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td className="num whitespace-nowrap">{formatDateTime(event.created_at)}</td>
                <td>{ACTION_LABELS[event.action] ?? event.action}</td>
                <td>{event.user?.full_name ?? '—'}</td>
                <td>{event.facility?.name ?? '—'}</td>
                <td className="text-muted">
                  {[event.target, typeof event.detail.reason === 'string' ? event.detail.reason : '', event.ip_address]
                    .filter(Boolean)
                    .join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
