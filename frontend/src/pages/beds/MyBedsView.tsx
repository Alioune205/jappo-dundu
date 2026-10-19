import React, { useMemo, useState } from 'react'
import { BedDouble, BookmarkCheck, Info, TriangleAlert, X } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Select } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { BED_CATEGORIES } from '@/lib/constants'
import { useNow } from '@/lib/useNow'
import type { BedCapacity, BedReservation, FacilitySummary } from '@/types/api'
import { ServiceCard } from './ServiceCard'
import type { ReservationViewer } from './reservationAccess'
import type { BedActions } from './useBedActions'

const HELP_KEY = 'jd.beds.help.hidden'
const ORDER = new Map(BED_CATEGORIES.map((c, i) => [c.value, i]))

function readHelpHidden() {
  try {
    return window.localStorage.getItem(HELP_KEY) === '1'
  } catch {
    return false
  }
}

interface MyBedsViewProps {
  capacities: BedCapacity[]
  reservations: BedReservation[]
  viewer: ReservationViewer
  actions: BedActions
  onReserve: (cap: BedCapacity) => void
  onEdit: (cap: BedCapacity) => void
}

/**
 * « Mes lits » : les services d'UN établissement, avec les actions du
 * quotidien (admettre, sortie, réserver) et les patients attendus.
 * Le gestionnaire voit son hôpital ; l'administrateur général choisit lequel gérer.
 */
export const MyBedsView: React.FC<MyBedsViewProps> = ({ capacities, reservations, viewer, actions, onReserve, onEdit }) => {
  const now = useNow(30_000)
  const [helpHidden, setHelpHidden] = useState(readHelpHidden)

  const facilities = useMemo(() => {
    const byId = new Map<number, FacilitySummary>()
    capacities.forEach((c) => c.facility && byId.set(c.facility.id, c.facility))
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [capacities])
  const ownId = viewer.isAdmin ? undefined : viewer.user?.facility?.id
  const [chosenId, setChosenId] = useState<number | undefined>(undefined)
  const facilityId = ownId ?? chosenId ?? facilities[0]?.id
  const facility = facilities.find((f) => f.id === facilityId) ?? viewer.user?.facility ?? null

  const services = useMemo(
    () =>
      capacities
        .filter((c) => c.facility?.id === facilityId)
        .sort((a, b) => (ORDER.get(a.category) ?? 99) - (ORDER.get(b.category) ?? 99)),
    [capacities, facilityId]
  )
  const byCapacity = useMemo(() => {
    const map = new Map<number, BedReservation[]>()
    reservations.forEach((r) => map.set(r.capacity.id, [...(map.get(r.capacity.id) ?? []), r]))
    return map
  }, [reservations])

  const total = services.reduce((n, c) => n + c.total_beds, 0)
  const occupied = services.reduce((n, c) => n + c.occupied_beds, 0)
  const reserved = services.reduce((n, c) => n + c.reserved_beds, 0)
  const free = services.reduce((n, c) => n + c.available_beds, 0)
  const full = services.filter((c) => c.available_beds === 0)
  const rate = total ? Math.round((occupied / total) * 100) : 0

  const hideHelp = () => {
    setHelpHidden(true)
    try {
      window.localStorage.setItem(HELP_KEY, '1')
    } catch {
      /* stockage indisponible : l'aide réapparaîtra, sans gravité */
    }
  }

  return (
    <div className="space-y-5">
      {viewer.isAdmin && (
        <Select
          label="Établissement à gérer"
          className="max-w-md"
          value={facilityId ?? ''}
          onChange={(e) => setChosenId(Number(e.target.value))}
        >
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.city})
            </option>
          ))}
        </Select>
      )}

      {!helpHidden && (
        <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/5 px-4 py-3 text-sm text-fg">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
          <p className="flex-1 leading-relaxed">
            <strong>Admettre</strong> : un patient occupe un lit. <strong>Sortie</strong> : son lit se libère.{' '}
            <strong>Réserver</strong> : un lit est bloqué pour un patient en route ; il se libère tout seul si le patient
            n’arrive pas à temps. À son arrivée, cliquez sur <strong>Patient arrivé</strong>.
          </p>
          <button
            type="button"
            onClick={hideHelp}
            className="rounded p-1 text-muted hover:bg-raised hover:text-fg"
            aria-label="Masquer l’aide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="Lits libres"
          accent="green"
          icon={<BedDouble className="h-5 w-5" />}
          value={free}
          unit={`/ ${total}`}
          description={facility ? facility.name : 'Votre établissement'}
        />
        <StatCard
          title="Patients attendus"
          accent="blue"
          icon={<BookmarkCheck className="h-5 w-5" />}
          value={reserved}
          unit={`lit${reserved > 1 ? 's' : ''} réservé${reserved > 1 ? 's' : ''}`}
          description="Bloqués pour des patients en route"
        />
        <StatCard
          title="Taux d’occupation"
          accent="yellow"
          icon={<BedDouble className="h-5 w-5" />}
          value={`${rate} %`}
          unit={`${occupied} / ${total}`}
          progress={{ value: occupied, max: total || 1, tone: rate > 85 ? 'danger' : rate > 75 ? 'warning' : 'success' }}
        />
        <StatCard
          title="Services complets"
          accent="red"
          icon={<TriangleAlert className="h-5 w-5" />}
          value={full.length}
          unit={`/ ${services.length}`}
          description={full.length ? full.map((c) => c.category_display).join(', ') : 'Aucun service complet'}
        />
      </div>

      {actions.error && (
        <Alert tone="danger" onClose={actions.clearError}>
          {actions.error instanceof Error ? actions.error.message : 'Action impossible.'}
        </Alert>
      )}

      {services.length === 0 ? (
        <EmptyState
          title="Aucun service déclaré"
          description="Les services de cet établissement apparaîtront ici dès qu’ils seront déclarés."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {services.map((cap) => (
            <ServiceCard
              key={cap.id}
              cap={cap}
              reservations={byCapacity.get(cap.id) ?? []}
              viewer={viewer}
              actions={actions}
              now={now}
              onReserve={onReserve}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  )
}
