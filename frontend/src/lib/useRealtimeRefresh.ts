import { useEffect } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useRealtime } from '@/context/RealtimeContext'

export interface RefreshRule {
  /** Événements métier déclencheurs (ex. `bed_capacity_updated`). */
  events: readonly string[]
  /** Requêtes à invalider (préfixes TanStack Query). */
  queryKeys: readonly QueryKey[]
}

/** Fenêtre de regroupement par défaut (ms). */
export const REFRESH_WINDOW_MS = 1000

/**
 * Rafraîchit des requêtes quand des événements temps réel arrivent, sans
 * tempête de requêtes : tous les événements reçus pendant une fenêtre
 * (1 s par défaut) sont regroupés et chaque requête n'est invalidée qu'une
 * fois à la fin de la fenêtre. Le même fait métier reçu sur deux flux
 * (alertes et tableau de bord) ne coûte donc qu'un seul rechargement, et une
 * rafale d'événements au plus un rechargement par seconde.
 */
export function useRealtimeRefresh(rules: readonly RefreshRule[], windowMs = REFRESH_WINDOW_MS) {
  const { subscribe } = useRealtime()
  const queryClient = useQueryClient()

  // Les règles sont souvent écrites en ligne : on les compare par valeur pour
  // ne pas se réabonner à chaque rendu (clés de requête = tableaux JSON simples).
  const signature = JSON.stringify(rules)

  useEffect(() => {
    const pending = new Map<string, QueryKey>()
    let timer: ReturnType<typeof setTimeout> | null = null

    const flush = () => {
      timer = null
      pending.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }))
      pending.clear()
    }

    const activeRules = JSON.parse(signature) as RefreshRule[]
    const events = new Set(activeRules.flatMap((rule) => rule.events))
    const unsubscribers = [...events].map((event) =>
      subscribe(event, () => {
        for (const rule of activeRules) {
          if (!rule.events.includes(event)) continue
          for (const queryKey of rule.queryKeys) pending.set(JSON.stringify(queryKey), queryKey)
        }
        if (!timer) timer = setTimeout(flush, windowMs)
      })
    )

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      if (timer) clearTimeout(timer)
    }
  }, [signature, windowMs, subscribe, queryClient])
}
