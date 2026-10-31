/**
 * Requêtes et mutations de l'ambulancier (TanStack Query).
 *
 * Un ambulancier conduit une seule ambulance (GET vehicles/mine/) et ne voit
 * que les missions de celle-ci (filtrage côté serveur). La mission en cours
 * se relit à chaque alerte du flux temps réel la concernant ; un sondage
 * prend le relais si le flux est coupé.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Ambulance, AmbulanceStatus, DestinationsResponse, Mission, MissionStatus, Paginated, Vitals } from '@/types/api'
import { api, ApiError } from './api'
import { QK } from './queries'

/** Aucun véhicule n'est affecté à ce compte (404 de vehicles/mine/). */
export const isMissingAmbulance = (error: unknown) => error instanceof ApiError && error.status === 404

/** Sondage de secours quand le flux temps réel est coupé : une mission ne peut pas attendre une minute. */
const POLL_MS = 20_000

/** Rôle de l'ambulancier ; un compte qui régule aussi les missions utilise le tableau de bord web. */
export const isDriver = (roles: readonly string[] | undefined) => !!roles?.includes('ambulance_driver')

export function useMyAmbulance() {
  return useQuery({
    queryKey: QK.ambulance,
    queryFn: () => api.get<Ambulance>('/api/ambulances/vehicles/mine/'),
    retry: (count, error) => !isMissingAmbulance(error) && count < 2,
  })
}

export interface DriverMissions {
  /** Mission en cours (au plus une par ambulance, contrainte en base). */
  active: Mission | null
  /** Dernières missions terminées ou annulées. */
  recent: Mission[]
}

export function useMyMissions({ enabled, live }: { enabled: boolean; live: boolean }) {
  return useQuery({
    queryKey: QK.missions,
    queryFn: async (): Promise<DriverMissions> => {
      const [active, done] = await Promise.all([
        api.get<Paginated<Mission>>('/api/ambulances/missions/', { active: true }),
        api.get<Paginated<Mission>>('/api/ambulances/missions/', { active: false }),
      ])
      return { active: active.results[0] ?? null, recent: done.results.slice(0, 5) }
    },
    enabled,
    refetchInterval: live ? false : POLL_MS,
  })
}

export type DriverStep = Extract<MissionStatus, 'on_site' | 'transporting' | 'completed'>

/** Fait avancer la mission ; la réponse du serveur remplace aussitôt la mission en cache. */
export function useAdvanceMission() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, destinationId }: { id: number; status: DriverStep; destinationId?: number }) =>
      api.post<Mission>(`/api/ambulances/missions/${id}/status/`, {
        status,
        ...(destinationId !== undefined ? { destination_id: destinationId } : {}),
      }),
    onSuccess: (mission) => {
      client.setQueryData<DriverMissions>(QK.missions, (previous) =>
        previous && mission.status !== 'completed'
          ? { ...previous, active: mission }
          : { active: null, recent: [mission, ...(previous?.recent ?? []).filter((m) => m.id !== mission.id)].slice(0, 5) }
      )
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: QK.missions })
      client.invalidateQueries({ queryKey: QK.ambulance })
    },
  })
}

/** Bilan de l'équipage (constantes, observations) transmis à l'hôpital de destination. */
export function useSendBilan() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, vitals, notes }: { id: number; vitals: Vitals; notes: string }) =>
      api.post<Mission>(`/api/ambulances/missions/${id}/bilan/`, {
        ...(Object.keys(vitals).length > 0 ? { vitals } : {}),
        notes,
      }),
    onSuccess: (mission) => {
      client.setQueryData<DriverMissions>(QK.missions, (previous) => (previous ? { ...previous, active: mission } : previous))
    },
  })
}

/** En service / hors service (refusé par le serveur pendant une mission). */
export function useSetAvailability() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: Extract<AmbulanceStatus, 'available' | 'out_of_service'> }) =>
      api.post<Ambulance>(`/api/ambulances/vehicles/${id}/availability/`, { status }),
    onSuccess: (ambulance) => client.setQueryData(QK.ambulance, ambulance),
  })
}

/** Hôpitaux proches avec des lits d'urgence libres, depuis l'ambulance (sinon le lieu d'intervention). */
export function useDestinations(missionId: number | null) {
  return useQuery({
    queryKey: [...QK.destinations, missionId],
    queryFn: () =>
      api.get<DestinationsResponse>(`/api/ambulances/missions/${missionId}/destinations/`, {
        category: 'emergency',
        radius_km: 50,
        limit: 8,
      }),
    enabled: missionId !== null,
    staleTime: 30_000,
  })
}
