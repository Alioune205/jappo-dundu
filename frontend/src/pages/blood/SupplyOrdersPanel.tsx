import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Truck } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { SUPPLY_ORDER_STATUSES, toneOf } from '@/lib/constants'
import { formatRelative } from '@/lib/format'
import { QK } from '@/lib/queryKeys'
import { useNow } from '@/lib/useNow'
import type { SupplyOrder } from '@/types/api'

type Side = 'received' | 'sent'

/**
 * Commandes de poches en cours : reçues (centre fournisseur : accepter,
 * expédier, refuser) et envoyées (demandeur : suivre, confirmer la réception).
 */
export const SupplyOrdersPanel: React.FC = () => {
  const [side, setSide] = useState<Side>('received')
  const now = useNow(30_000)
  const { data: orders = [] } = useQuery<SupplyOrder[]>({
    queryKey: [...QK.bloodOrders, side],
    queryFn: async () =>
      (await api.get<{ results: SupplyOrder[] }>('/api/sang/orders/', { role: side, open: 'true' })).results || [],
  })

  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Truck className="h-4 w-4 text-brand" aria-hidden="true" />
          Commandes de poches
        </h3>
        <div role="tablist" className="flex gap-1 rounded-md bg-raised p-0.5 text-xs">
          {(['received', 'sent'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={side === value}
              onClick={() => setSide(value)}
              className={`cursor-pointer rounded px-2.5 py-1 ${side === value ? 'bg-surface font-semibold text-fg shadow-sm' : 'text-muted'}`}
            >
              {value === 'received' ? 'Reçues' : 'Envoyées'}
            </button>
          ))}
        </div>
      </div>
      {orders.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">Aucune commande en cours.</p>
      ) : (
        <ul className="divide-y divide-line">
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} side={side} now={now} />
          ))}
        </ul>
      )}
    </section>
  )
}

const OrderRow: React.FC<{ order: SupplyOrder; side: Side; now: number }> = ({ order, side, now }) => {
  const queryClient = useQueryClient()
  const { isAdmin } = useAuth()
  const [refusing, setRefusing] = useState(false)
  const [note, setNote] = useState('')
  const act = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: Record<string, string> }) =>
      api.post<SupplyOrder>(`/api/sang/orders/${order.id}/${action}/`, body ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.bloodOrders })
      queryClient.invalidateQueries({ queryKey: QK.bloodInventory })
      queryClient.invalidateQueries({ queryKey: QK.bloodRequests })
    },
  })
  const busy = act.isPending
  const other = side === 'received' ? order.requester : order.supplier
  const supplierSide = side === 'received' || isAdmin

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">
            <span className="num">{order.units}</span> × {order.blood_group} · {order.component_display}
          </p>
          <p className="truncate text-xs text-muted">
            {side === 'received' ? 'Pour' : 'Chez'} {other.name} · {formatRelative(order.created_at, now)}
            {order.note ? ` · ${order.note}` : ''}
          </p>
          {order.answer_note && <p className="text-xs text-fg">{order.answer_note}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge size="sm" tone={toneOf(SUPPLY_ORDER_STATUSES, order.status)}>
            {order.status_display}
          </Badge>
          {order.urgency === 'critical' && (
            <Badge size="sm" tone="danger">
              Critique
            </Badge>
          )}
        </div>
      </div>
      {act.error && (
        <p role="alert" className="text-2xs text-critical">
          {act.error instanceof Error ? act.error.message : 'Action impossible.'}
        </p>
      )}
      {refusing ? (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (note.trim()) act.mutate({ action: 'refuse', body: { note } })
          }}
        >
          <input
            aria-label="Motif du refus"
            className="field-control h-8 flex-1 text-xs"
            placeholder="Motif (ex. stock épuisé)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
          />
          <Button type="submit" size="sm" variant="danger" disabled={!note.trim()} isLoading={busy}>
            Refuser
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {supplierSide && order.status === 'requested' && (
            <Button size="sm" variant="secondary" isLoading={busy} onClick={() => act.mutate({ action: 'accept' })}>
              Accepter
            </Button>
          )}
          {supplierSide && (order.status === 'requested' || order.status === 'accepted') && (
            <>
              <Button size="sm" variant="primary" isLoading={busy} onClick={() => act.mutate({ action: 'dispatch' })}>
                Poches expédiées
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRefusing(true)}>
                Refuser
              </Button>
            </>
          )}
          {side === 'sent' && order.status === 'dispatched' && (
            <Button size="sm" variant="primary" isLoading={busy} onClick={() => act.mutate({ action: 'deliver' })}>
              Poches reçues
            </Button>
          )}
          {side === 'sent' && (order.status === 'requested' || order.status === 'accepted') && (
            <Button size="sm" variant="ghost" isLoading={busy} onClick={() => act.mutate({ action: 'cancel' })}>
              Annuler
            </Button>
          )}
        </div>
      )}
    </li>
  )
}
