import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { BED_EVENTS } from '@/lib/realtimeEvents'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tabs } from '@/components/ui/Tabs'
import type { BedCapacity, BedReservation, Role } from '@/types/api'
import { QK } from '@/lib/queryKeys'
import { useAuth } from '@/context/AuthContext'
import { canManage } from '@/lib/access'
import { CapacityEditModal } from './beds/CapacityEditModal'
import { MyBedsView } from './beds/MyBedsView'
import { NetworkBedsView } from './beds/NetworkBedsView'
import { ReserveBedModal } from './beds/ReserveBedModal'
import { canReserveAt } from './beds/reservationAccess'
import { useBedActions } from './beds/useBedActions'

type View = 'mine' | 'network'

/** Rôles autorisés à réserver (mêmes que l'API : lits et régulation). */
const RESERVING_ROLES: Role[] = ['admin', 'hospital_staff', 'bed_manager', 'ambulance_manager']

const DESCRIPTIONS: Record<View, string> = {
  mine: 'Les services de l’établissement : admissions, sorties et patients attendus.',
  network: 'Où reste-t-il de la place ? Lits libres du réseau et réservation pour un patient en route.',
}

/**
 * Page « Lits », un écran par métier :
 * - « Mes lits » (gestionnaire des lits) : son établissement et ses actions du quotidien ;
 * - « Trouver un lit » (régulation, orientation) : le réseau, en lecture, avec réservation.
 */
export const BedsManagement: React.FC = () => {
  const { user, roles, isAdmin } = useAuth()
  const viewer = { user, roles, isAdmin }
  const managesBeds = canManage(roles, 'beds')
  const canListReservations = roles.some((r) => RESERVING_ROLES.includes(r))
  const [view, setView] = useState<View>(managesBeds && !isAdmin ? 'mine' : 'network')
  const [editing, setEditing] = useState<BedCapacity | null>(null)
  const [reserving, setReserving] = useState<BedCapacity | null>(null)
  const actions = useBedActions()

  // Mises à jour poussées par le serveur (regroupées, voir useRealtimeRefresh).
  useRealtimeRefresh([{ events: BED_EVENTS, queryKeys: [QK.bedCapacities, QK.bedsSummary, QK.bedReservations] }])

  const {
    data: capacities = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<BedCapacity[]>({
    queryKey: [...QK.bedCapacities, 'all'],
    queryFn: async () => (await api.get<{ results: BedCapacity[] }>('/api/lits/capacities/')).results || [],
  })
  const { data: reservations = [] } = useQuery<BedReservation[]>({
    queryKey: [...QK.bedReservations, 'active'],
    queryFn: async () =>
      (await api.get<{ results: BedReservation[] }>('/api/lits/reservations/', { status: 'active' })).results || [],
    enabled: canListReservations,
    // Les expirations ne poussent pas d'événement si personne n'agit : relecture régulière.
    refetchInterval: 60_000,
  })

  const canReserve = (cap: BedCapacity) => canReserveAt(viewer, cap.facility)
  const mineLabel = isAdmin ? 'Gérer un établissement' : 'Mes lits'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lits"
        description={DESCRIPTIONS[view]}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            isLoading={isRefetching}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Actualiser
          </Button>
        }
      />

      {managesBeds && (
        <Tabs<View>
          tabs={[
            { id: 'mine', label: mineLabel },
            { id: 'network', label: 'Trouver un lit' },
          ]}
          activeTab={view}
          onChange={setView}
        />
      )}

      {isLoading ? (
        <div className="space-y-2 panel p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : view === 'mine' ? (
        <MyBedsView
          capacities={capacities}
          reservations={reservations}
          viewer={viewer}
          actions={actions}
          onReserve={setReserving}
          onEdit={setEditing}
        />
      ) : (
        <NetworkBedsView
          capacities={capacities}
          canReserve={canReserve}
          onReserve={setReserving}
          showReservations={canListReservations && !(managesBeds && !isAdmin)}
        />
      )}

      <CapacityEditModal capacity={editing} onClose={() => setEditing(null)} />
      <ReserveBedModal capacity={reserving} onClose={() => setReserving(null)} />
    </div>
  )
}
