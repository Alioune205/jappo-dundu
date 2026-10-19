import React, { useEffect, useRef, useState } from 'react'
import { BookmarkPlus, Clock, Minus, MoreHorizontal, Plus, Siren } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { BED_CATEGORIES } from '@/lib/constants'
import type { BedCapacity, BedReservation } from '@/types/api'
import { CapacityBar } from './CapacityBar'
import { canCancel, canFulfill, remainingLabel, type ReservationViewer } from './reservationAccess'
import type { BedActions } from './useBedActions'

const VITAL = new Set(BED_CATEGORIES.filter((c) => c.vital).map((c) => c.value))

interface ServiceCardProps {
  cap: BedCapacity
  /** Réservations en cours de ce service. */
  reservations: BedReservation[]
  viewer: ReservationViewer
  actions: BedActions
  now: number
  onReserve: (cap: BedCapacity) => void
  onEdit: (cap: BedCapacity) => void
}

/** Un service de l'établissement : son état d'un coup d'œil, ses patients attendus, ses actions. */
export const ServiceCard: React.FC<ServiceCardProps> = ({ cap, reservations, viewer, actions, now, onReserve, onEdit }) => {
  const full = cap.available_beds === 0
  const pending = (m: { isPending: boolean; variables?: number }) => m.isPending && m.variables === cap.id

  return (
    <article
      className={`panel flex flex-col ${full ? 'border-l-2 border-l-critical' : ''}`}
      aria-label={`${cap.category_display} : ${cap.available_beds} libres sur ${cap.total_beds}`}
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
            {cap.category_display}
            {VITAL.has(cap.category) && (
              <Badge tone="danger" size="sm">
                Vital
              </Badge>
            )}
          </h3>
        </div>
        <div className="flex items-start gap-3">
          <p className="text-right leading-tight">
            <span className={`num block text-2xl font-semibold ${full ? 'text-critical' : 'text-fg'}`}>
              {cap.available_beds}
            </span>
            <span className="num text-2xs text-muted">libre{cap.available_beds > 1 ? 's' : ''} sur {cap.total_beds}</span>
          </p>
          <MoreMenu label={`Plus d'actions — ${cap.category_display}`} onEdit={() => onEdit(cap)} />
        </div>
      </header>

      <CapacityBar cap={cap} className="px-4 pt-3" />

      {reservations.length > 0 && (
        <ul className="mx-4 mt-3 space-y-2 rounded-lg border border-info/30 bg-info/5 p-2.5" aria-label="Patients attendus">
          {reservations.map((r) => {
            const remaining = remainingLabel(r.expires_at, now)
            const soon = remaining === 'expirée' || (/^\d+ min$/.test(remaining) && parseInt(remaining, 10) <= 10)
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-fg">
                  {r.mission ? <Siren className="h-3.5 w-3.5 shrink-0 text-critical" aria-hidden="true" /> : null}
                  <span className="truncate font-medium">
                    {r.mission ? `Mission SAMU #${r.mission.id}` : r.reference || 'Patient attendu'}
                  </span>
                  <span
                    className={`num inline-flex shrink-0 items-center gap-1 ${soon ? 'font-semibold text-critical' : 'text-muted'}`}
                    title={`Lit bloqué jusqu'au ${new Date(r.expires_at).toLocaleString('fr-FR')}`}
                  >
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {remaining === 'expirée' ? 'délai écoulé' : `encore ${remaining}`}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  {canCancel(viewer, r) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={actions.busy}
                      isLoading={actions.cancel.isPending && actions.cancel.variables === r.id}
                      onClick={() => actions.cancel.mutate(r.id)}
                    >
                      Libérer le lit
                    </Button>
                  )}
                  {canFulfill(viewer, r) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={actions.busy}
                      isLoading={actions.fulfill.isPending && actions.fulfill.variables === r.id}
                      onClick={() => actions.fulfill.mutate(r.id)}
                      title="Le patient est arrivé : son lit réservé devient occupé"
                    >
                      Patient arrivé
                    </Button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <footer className="mt-auto flex flex-wrap gap-2 px-4 pb-4 pt-4">
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          icon={<Plus className="h-3.5 w-3.5" />}
          disabled={full || (actions.busy && !pending(actions.admit))}
          isLoading={pending(actions.admit)}
          onClick={() => actions.admit.mutate(cap.id)}
          title={full ? 'Aucun lit libre dans ce service' : 'Un patient sans réservation occupe un lit'}
        >
          Admettre un patient
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          icon={<Minus className="h-3.5 w-3.5" />}
          disabled={cap.occupied_beds === 0 || (actions.busy && !pending(actions.discharge))}
          isLoading={pending(actions.discharge)}
          onClick={() => actions.discharge.mutate(cap.id)}
          title="Un patient quitte le service : son lit se libère"
        >
          Sortie d’un patient
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          icon={<BookmarkPlus className="h-3.5 w-3.5" />}
          disabled={full}
          onClick={() => onReserve(cap)}
          title="Bloquer un lit pour un patient en route"
        >
          Réserver un lit
        </Button>
      </footer>
    </article>
  )
}

/** Action rare (ajuster la capacité) rangée à l'écart des actions quotidiennes. */
const MoreMenu: React.FC<{ label: string; onEdit: () => void }> = ({ label, onEdit }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-line text-muted transition-colors hover:bg-raised hover:text-fg"
        aria-label={label}
        title="Plus d’actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-8 z-10 w-56 panel p-1 shadow-[var(--shadow-raised)]">
          <button
            type="button"
            role="menuitem"
            className="w-full rounded-md px-3 py-2 text-left text-sm text-fg hover:bg-raised"
            onClick={() => {
              setOpen(false)
              onEdit()
            }}
          >
            Ajuster la capacité
            <span className="block text-2xs text-muted">Lits installés, inventaire</span>
          </button>
        </div>
      )}
    </div>
  )
}
