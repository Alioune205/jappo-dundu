/**
 * Requêtes et mutations du donneur (TanStack Query).
 *
 * Clés centralisées dans QK : une invalidation ne peut pas viser une clé mal
 * orthographiée. Les réponses aux demandes et la disponibilité sont
 * optimistes (l'écran réagit au toucher) et annulées si le serveur refuse.
 *
 * Responsable du domaine : Pape Alioune Sene (application mobile)
 */
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DonorInput, DonorProfile, MyDonation, MyResponse, NearbyRequest, Paginated, ResponseStatus } from '@/types/api'
import { api, ApiError } from './api'
import { distanceKm, type Coords } from './location'

export const QK = {
  donor: ['donor'] as const,
  nearby: ['nearby'] as const,
  history: ['history'] as const,
}

/** Le compte n'a pas encore de profil donneur (404 de /donors/me/). */
export const isMissingDonor = (error: unknown) => error instanceof ApiError && error.status === 404

/** Rafraîchissement de secours quand le flux temps réel est coupé. */
const POLL_MS = 60_000
/** Déplacement à partir duquel la liste est recalculée. */
const MOVE_KM = 0.3

export function useDonor() {
  return useQuery({
    queryKey: QK.donor,
    queryFn: () => api.get<DonorProfile>('/api/sang/donors/me/'),
    retry: (count, error) => !isMissingDonor(error) && count < 2,
  })
}

export function useSaveDonor() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: DonorInput) => api.put<DonorProfile>('/api/sang/donors/me/', input),
    onSuccess: (donor) => {
      client.setQueryData(QK.donor, donor)
      client.invalidateQueries({ queryKey: QK.nearby })
    },
  })
}

/** Mise à jour partielle (disponibilité, position) ; optimiste. */
export function useUpdateDonor() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<DonorInput>) => api.patch<DonorProfile>('/api/sang/donors/me/', patch),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: QK.donor })
      const previous = client.getQueryData<DonorProfile>(QK.donor)
      if (previous) client.setQueryData(QK.donor, { ...previous, ...patch })
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) client.setQueryData(QK.donor, context.previous)
    },
    onSuccess: (donor) => client.setQueryData(QK.donor, donor),
  })
}

/**
 * Demandes compatibles autour du donneur, les plus proches d'abord.
 * Position du téléphone si connue, sinon celle du profil (côté serveur).
 */
export function useNearby(coords: Coords | null, { enabled, live }: { enabled: boolean; live: boolean }) {
  const coordsRef = useRef<Coords | null>(coords)
  const query = useQuery({
    queryKey: QK.nearby,
    queryFn: () => api.get<NearbyRequest[]>('/api/sang/requests/nearby/', { ...coordsRef.current }),
    enabled,
    refetchInterval: live ? false : POLL_MS,
  })
  const { refetch } = query
  useEffect(() => {
    const previous = coordsRef.current
    coordsRef.current = coords
    if (enabled && coords && (!previous || distanceKm(previous, coords) > MOVE_KM)) refetch()
  }, [coords, enabled, refetch])
  return query
}

export function useRespond() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: Extract<ResponseStatus, 'accepted' | 'declined' | 'cancelled'> }) =>
      api.post<MyResponse>(`/api/sang/requests/${id}/respond/`, { status }),
    onMutate: async ({ id, status }) => {
      await client.cancelQueries({ queryKey: QK.nearby })
      const previous = client.getQueryData<NearbyRequest[]>(QK.nearby)
      client.setQueryData<NearbyRequest[]>(QK.nearby, (list) => list?.map((r) => (r.id === id ? { ...r, my_response: status } : r)))
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(QK.nearby, context.previous)
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: QK.nearby })
      client.invalidateQueries({ queryKey: QK.history })
    },
  })
}

/** Toutes les pages d'une liste paginée (bornées : un donneur a rarement plus de quelques dizaines d'entrées). */
async function fetchAll<T>(path: string, maxPages = 5): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; page <= maxPages; page++) {
    const data = await api.get<Paginated<T>>(path, { page })
    items.push(...data.results)
    if (!data.next) break
  }
  return items
}

export interface History {
  donations: MyDonation[]
  responses: MyResponse[]
}

export function useHistory() {
  return useQuery({
    queryKey: QK.history,
    queryFn: async (): Promise<History> => {
      const [donations, responses] = await Promise.all([
        fetchAll<MyDonation>('/api/sang/donors/me/donations/'),
        fetchAll<MyResponse>('/api/sang/donors/me/responses/'),
      ])
      return { donations, responses }
    },
  })
}
