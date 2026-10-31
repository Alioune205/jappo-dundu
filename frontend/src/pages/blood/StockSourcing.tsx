import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PackageCheck, Truck } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDistance } from '@/lib/format'
import { QK } from '@/lib/queryKeys'
import type { BloodRequest, NearbyStockFacility, SupplyOrder } from '@/types/api'

/**
 * Poches compatibles en stock autour de l'établissement, pour une demande
 * ouverte. Une urgence se traite d'abord avec le stock : une poche donnée
 * aujourd'hui doit encore être qualifiée avant d'être transfusée.
 */
export const StockSourcing: React.FC<{ request: BloodRequest }> = ({ request }) => {
  const queryClient = useQueryClient()
  const [ordered, setOrdered] = useState<SupplyOrder | null>(null)
  const units = Math.max(1, request.units_needed - request.units_collected)

  const { data: facilities = [], isLoading } = useQuery<NearbyStockFacility[]>({
    queryKey: [...QK.stockNearby, request.id, request.blood_group, request.component, units],
    queryFn: () =>
      api.get<NearbyStockFacility[]>('/api/sang/stocks/nearby/', {
        blood_group: request.blood_group,
        component: request.component,
        units,
        facility: request.facility?.id,
      }),
  })

  const order = useMutation({
    mutationFn: (target: NearbyStockFacility) => {
      // Groupe identique d'abord (lignes déjà triées), sinon le premier compatible.
      const line = target.stock_lines.find((l) => l.units_available >= units) ?? target.stock_lines[0]
      return api.post<SupplyOrder>('/api/sang/orders/', {
        supplier_id: target.id,
        blood_group: line.blood_group,
        component: request.component,
        units: Math.min(units, line.units_available),
        blood_request_id: request.id,
        urgency: request.urgency,
      })
    },
    onSuccess: (created) => {
      setOrdered(created)
      queryClient.invalidateQueries({ queryKey: QK.bloodOrders })
    },
  })

  return (
    <div className="border-b border-line px-4 py-3">
      <h4 className="eyebrow mb-2 flex items-center gap-1.5">
        <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Poches en stock à proximité
      </h4>
      {ordered ? (
        <p className="flex items-center gap-2 rounded-md bg-ok/10 px-3 py-2 text-xs text-fg">
          <Truck className="h-3.5 w-3.5 text-ok" aria-hidden="true" />
          Commande envoyée à {ordered.supplier.name} : {ordered.units} poche{ordered.units > 1 ? 's' : ''}{' '}
          {ordered.blood_group}. Suivi dans « Commandes de poches ».
        </p>
      ) : isLoading ? (
        <Skeleton className="h-14 w-full" />
      ) : facilities.length === 0 ? (
        <p className="text-xs text-muted">
          Aucun stock compatible déclaré à proximité : les donneurs sont alertés par vagues.
        </p>
      ) : (
        <ul className="divide-y divide-line text-xs">
          {facilities.slice(0, 4).map((f) => {
            const covers = f.total_units >= units
            return (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-fg">{f.name}</span>
                  <span className="text-muted">
                    {formatDistance(f.distance_km)} ·{' '}
                    {f.stock_lines.map((l) => `${l.blood_group} : ${l.units_available}`).join(', ')}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant={covers ? 'primary' : 'secondary'}
                  isLoading={order.isPending && order.variables?.id === f.id}
                  disabled={order.isPending}
                  onClick={() => order.mutate(f)}
                  title={covers ? `Commander ${units} poche(s)` : 'Stock partiel : commande de ce qui est disponible'}
                >
                  Commander
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {order.error && (
        <p role="alert" className="mt-1 text-2xs text-critical">
          {order.error instanceof Error ? order.error.message : 'Commande impossible.'}
        </p>
      )}
    </div>
  )
}
