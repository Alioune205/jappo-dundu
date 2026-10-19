import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { QK } from '@/lib/queryKeys'
import type { BedCapacity, BedReservation } from '@/types/api'

/**
 * Actions sur les lits partagées par « Mes lits », « Trouver un lit » et le
 * tableau de bord : admission, sortie, arrivée du patient attendu, libération
 * d'un lit réservé. Chaque action rafraîchit les lits et les réservations.
 */
export function useBedActions() {
  const queryClient = useQueryClient()
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: QK.bedCapacities })
    queryClient.invalidateQueries({ queryKey: QK.bedsSummary })
    queryClient.invalidateQueries({ queryKey: QK.bedReservations })
  }

  const admit = useMutation({
    mutationFn: (capacityId: number) => api.post<BedCapacity>(`/api/lits/capacities/${capacityId}/admit/`),
    onSuccess: refresh,
  })
  const discharge = useMutation({
    mutationFn: (capacityId: number) => api.post<BedCapacity>(`/api/lits/capacities/${capacityId}/discharge/`),
    onSuccess: refresh,
  })
  const fulfill = useMutation({
    mutationFn: (reservationId: number) => api.post<BedReservation>(`/api/lits/reservations/${reservationId}/fulfill/`),
    onSuccess: refresh,
  })
  const cancel = useMutation({
    mutationFn: (reservationId: number) => api.post<BedReservation>(`/api/lits/reservations/${reservationId}/cancel/`),
    onSuccess: refresh,
  })

  const all = [admit, discharge, fulfill, cancel]
  return {
    admit,
    discharge,
    fulfill,
    cancel,
    /** Une action est en cours : on évite les doubles clics. */
    busy: all.some((m) => m.isPending),
    error: all.find((m) => m.error)?.error ?? null,
    clearError: () => all.forEach((m) => m.reset()),
  }
}

export type BedActions = ReturnType<typeof useBedActions>
