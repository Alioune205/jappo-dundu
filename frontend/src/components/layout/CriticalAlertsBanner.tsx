import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Siren } from 'lucide-react'
import { api } from '@/lib/api'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { useAuth } from '@/context/AuthContext'
import { isSupervisor } from '@/lib/access'

interface CriticalAlert {
  critical_alert_id: number
  kind: 'mission' | 'prealert' | 'blood_order'
  title: string
  message: string
  created_at: string
}

const KEY = ['critical-alerts'] as const

/**
 * Alertes critiques à prendre en charge (mission critique, pré-alerte sans
 * réponse, commande de poches critique). Sans accusé de réception, elles
 * sont relancées par SMS à la ligne de garde, puis à l'administrateur.
 * L'administrateur général les voit toutes mais ne les prend pas en charge
 * lui-même : il est invité à contacter le service qui agit.
 */

/** Consigne affichée à l'administrateur général (même texte que ses SMS d'escalade). */
const SUPERVISOR_HINTS: Record<CriticalAlert['kind'], string> = {
  mission: 'Contactez la régulation SAMU de la région.',
  prealert: 'Contactez l’hôpital de destination.',
  blood_order: 'Contactez le centre fournisseur.',
}
export const CriticalAlertsBanner: React.FC = () => {
  const queryClient = useQueryClient()
  const { roles } = useAuth()
  const supervisor = isSupervisor(roles)
  useRealtimeRefresh([{ events: ['critical_alert', 'mission_updated', 'blood_order_updated'], queryKeys: [KEY] }])
  const { data: alerts = [] } = useQuery<CriticalAlert[]>({
    queryKey: KEY,
    queryFn: () => api.get<CriticalAlert[]>('/api/realtime/critical-alerts/'),
    refetchInterval: 30_000,
  })
  const ack = useMutation({
    mutationFn: (id: number) => api.post(`/api/realtime/critical-alerts/${id}/ack/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })
  if (alerts.length === 0) return null

  return (
    <div role="alert" className="border-b border-critical/40 bg-critical/10">
      <ul className="mx-auto max-w-[1320px] divide-y divide-critical/20 px-4 lg:px-10">
        {alerts.slice(0, 3).map((alert) => (
          <li key={alert.critical_alert_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <Siren className="h-4 w-4 shrink-0 text-critical" aria-hidden="true" />
            <span className="font-semibold text-fg">{alert.title}</span>
            <span className="min-w-0 flex-1 text-xs text-muted">{alert.message}</span>
            {supervisor ? (
              <span className="text-xs font-semibold text-critical">{SUPERVISOR_HINTS[alert.kind]}</span>
            ) : (
              <button
                type="button"
                onClick={() => ack.mutate(alert.critical_alert_id)}
                disabled={ack.isPending}
                className="cursor-pointer rounded-md bg-critical px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                Je m’en occupe
              </button>
            )}
          </li>
        ))}
        {alerts.length > 3 && (
          <li className="py-1.5 text-xs text-muted">+ {alerts.length - 3} autre(s) alerte(s) critique(s)</li>
        )}
      </ul>
    </div>
  )
}
