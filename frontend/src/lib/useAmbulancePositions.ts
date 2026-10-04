import { useEffect } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useRealtime } from '@/context/RealtimeContext'
import { RealtimeEvent } from '@/lib/realtimeEvents'
import type { Ambulance } from '@/types/api'

/**
 * Applique les positions GPS reçues en temps réel directement dans le cache
 * des listes d'ambulances, sans requête HTTP : la télémétrie peut arriver
 * toutes les quelques secondes pour chaque véhicule.
 */
export function useAmbulancePositions(queryKey: QueryKey) {
  const { subscribe } = useRealtime()
  const queryClient = useQueryClient()
  const signature = JSON.stringify(queryKey)

  useEffect(() => {
    const key = JSON.parse(signature) as QueryKey
    return subscribe(RealtimeEvent.ambulancePosition, (_event, data) => {
      const id = data.ambulance_id
      const latitude = data.latitude
      const longitude = data.longitude
      if (typeof id !== 'number' || typeof latitude !== 'number' || typeof longitude !== 'number') return

      queryClient.setQueriesData<Ambulance[]>({ queryKey: key }, (current) =>
        !Array.isArray(current)
          ? current
          : current.map((ambulance) =>
          ambulance.id === id
            ? {
                ...ambulance,
                latitude,
                longitude,
                location_updated_at:
                  typeof data.location_updated_at === 'string' ? data.location_updated_at : ambulance.location_updated_at,
              }
            : ambulance
        )
      )
    })
  }, [signature, subscribe, queryClient])
}
