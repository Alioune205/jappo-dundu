import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRealtime } from '@/context/RealtimeContext'

/** Intervalle de relevé quand le flux temps réel est coupé (ms). */
export const FALLBACK_POLL_MS = 30_000

/**
 * Mode dégradé : tant que le flux temps réel est interrompu, les données
 * affichées sont relues par l'API REST à intervalle régulier. Les écrans ne
 * restent donc jamais figés plus de 30 s, même sans WebSocket.
 */
export function useFallbackPolling(intervalMs = FALLBACK_POLL_MS) {
  const { status } = useRealtime()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (status !== 'interrupted') return
    const timer = setInterval(() => {
      // Seules les requêtes affichées à l'écran sont rechargées.
      queryClient.invalidateQueries({ refetchType: 'active' })
    }, intervalMs)
    return () => clearInterval(timer)
  }, [status, intervalMs, queryClient])
}
