import React from 'react'
import { MapPin, Phone, Siren } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatPhone, formatRelative } from '@/lib/format'
import { useNow } from '@/lib/useNow'
import type { Mission } from '@/types/api'
import { pendingSos } from './missionUtils'

interface SosAlertsProps {
  missions: Mission[]
  /**
   * Ouvre la régulation de l'alerte (qualifier, affecter, fausse alerte).
   * Absent pour l'administrateur général (supervision) : il ne régule pas,
   * il est invité à contacter la régulation SAMU.
   */
  onDispatch?: (mission: Mission) => void
}

/**
 * Bandeau des alertes SOS envoyées par des citoyens depuis l'application :
 * qui, où (position GPS du téléphone), depuis quand. Le régulateur rappelle,
 * qualifie l'urgence puis envoie l'ambulance, ou classe en fausse alerte.
 */
export const SosAlerts: React.FC<SosAlertsProps> = ({ missions, onDispatch }) => {
  const now = useNow(15_000)
  const alerts = pendingSos(missions)
  if (alerts.length === 0) return null

  return (
    <section
      className="overflow-hidden rounded-xl border border-critical bg-critical/5"
      aria-label={`${alerts.length} alerte${alerts.length > 1 ? 's' : ''} SOS à traiter`}
      role="alert"
    >
      <div className="flex items-center gap-2 border-b border-critical/30 px-5 py-2.5 text-sm font-semibold text-critical">
        <Siren className="h-4 w-4 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
        {alerts.length > 1 ? `${alerts.length} alertes SOS à traiter` : 'Alerte SOS à traiter'}
      </div>
      <ul className="divide-y divide-critical/20">
        {alerts.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold text-fg">
                {m.description.replace(/^SOS — /, '') || 'Urgence'}
                <span className="font-normal text-muted">
                  {' '}
                  · {m.created_by?.full_name ?? 'Citoyen'} · {formatRelative(m.created_at, now)}
                </span>
              </p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {m.pickup_address} ·{' '}
                  <span className="num">
                    {m.pickup_latitude.toFixed(5)}, {m.pickup_longitude.toFixed(5)}
                  </span>
                </span>
                {m.caller_phone && (
                  <span className="num inline-flex items-center gap-1 font-semibold text-fg">
                    <Phone className="h-3 w-3" aria-hidden="true" />
                    {formatPhone(m.caller_phone)}
                  </span>
                )}
              </p>
            </div>
            {onDispatch ? (
              <Button variant="danger" size="sm" onClick={() => onDispatch(m)} aria-label={`Traiter l'alerte SOS ${m.id}`}>
                Traiter
              </Button>
            ) : (
              <span className="text-xs font-semibold text-critical">Contactez la régulation SAMU</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
