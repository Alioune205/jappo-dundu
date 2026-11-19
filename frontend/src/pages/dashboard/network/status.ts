import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** Délai d'affectation au-delà duquel une mission sans ambulance devient critique. */
export const ASSIGN_TARGET_MINUTES = 5

interface StatusPayload {
  status: 'healthy' | 'degraded'
  checks: Record<string, { status: string }>
}

/** Ce qu'une panne change pour l'utilisateur (pas le détail technique). */
const CHECK_IMPACT: Record<string, string> = {
  database: 'Données momentanément inaccessibles',
  channel_layer: 'Mises à jour en direct interrompues',
  ml_model: 'Prévisions de pénurie indisponibles',
}

/**
 * État des services en une phrase, à partir de la sonde réelle de l'API
 * (base, temps réel, modèle), relue chaque minute.
 */
export function useSystemStatus(enabled: boolean): { ok: boolean; text: string } | null {
  const query = useQuery<StatusPayload>({
    queryKey: ['system-status'],
    queryFn: () => api.get<StatusPayload>('/api/status/'),
    refetchInterval: 60_000,
    enabled,
  })
  if (!enabled || query.isPending) return null
  if (query.isError || !query.data) return { ok: false, text: 'État des services indisponible' }
  const failing = Object.entries(query.data.checks ?? {}).filter(([, c]) => c.status !== 'up')
  if (failing.length === 0) return { ok: true, text: 'Services opérationnels' }
  return { ok: false, text: failing.map(([key]) => CHECK_IMPACT[key] ?? 'Un service est à surveiller').join(' · ') }
}
