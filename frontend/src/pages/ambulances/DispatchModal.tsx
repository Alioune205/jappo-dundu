import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BedDouble, Navigation } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { BED_CATEGORIES, CAPABILITIES, MISSION_STATUSES, URGENCIES, toneOf } from '@/lib/constants'
import { formatDistance, formatEta, formatPhone, formatRelative } from '@/lib/format'
import { QK } from '@/lib/queryKeys'
import { useNow } from '@/lib/useNow'
import { FreshnessBadge } from '@/pages/beds/FreshnessBadge'
import { canReserveAt, remainingLabel } from '@/pages/beds/reservationAccess'
import type {
  BedCategory,
  BedReservation,
  Capability,
  Mission,
  MissionDestinations,
  NearbyAmbulance,
  Urgency,
} from '@/types/api'
import { BilanSummary, CapabilityChips, DestinationStatusBadge } from './MissionClinical'
import { isActiveMission } from './missionUtils'
import { TriageInstructions } from './TriageInstructions'
import { useTriageProtocol } from './useTriage'

/** Rayon de recherche (km) des ambulances et des lits, comme l'affectation automatique de la page. */
const DISPATCH_RADIUS_KM = 60
/** Durée de blocage d'un lit réservé pour une mission (minutes). */
const HOLD_MINUTES = 45

interface DispatchModalProps {
  /** Mission régulée ; null ferme la fenêtre. */
  mission: Mission | null
  onClose: () => void
}

/**
 * Régulation d'une mission : choisir l'ambulance (les plus proches
 * disponibles), orienter vers un hôpital qui a des lits libres en y
 * réservant un lit, ou annuler. C'est ici que se rejoignent les ambulances
 * et les lits.
 */
export const DispatchModal: React.FC<DispatchModalProps> = ({ mission, onClose }) => (
  <Modal
    isOpen={mission !== null}
    onClose={onClose}
    title={mission ? `Mission #${mission.id}` : 'Mission'}
    description={mission ? mission.pickup_address : undefined}
    maxWidth="2xl"
  >
    {mission && <DispatchPanel key={mission.id} missionId={mission.id} fallback={mission} onDone={onClose} />}
  </Modal>
)

const DispatchPanel: React.FC<{ missionId: number; fallback: Mission; onDone: () => void }> = ({ missionId, fallback, onDone }) => {
  const queryClient = useQueryClient()
  const now = useNow(30_000)
  const [error, setError] = useState<string | null>(null)

  // Mission relue en continu : l'ambulancier la fait avancer pendant que la fenêtre est ouverte.
  const { data: mission = fallback } = useQuery<Mission>({
    queryKey: [...QK.missionsAll, missionId],
    queryFn: () => api.get<Mission>(`/api/ambulances/missions/${missionId}/`),
    initialData: fallback,
    refetchInterval: 15_000,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: QK.missionsAll })
    queryClient.invalidateQueries({ queryKey: QK.missionsActive })
    queryClient.invalidateQueries({ queryKey: QK.ambulancesFleet })
    queryClient.invalidateQueries({ queryKey: QK.ambulancesNearest })
    queryClient.invalidateQueries({ queryKey: QK.missionDestinations })
    queryClient.invalidateQueries({ queryKey: QK.bedReservations })
    queryClient.invalidateQueries({ queryKey: QK.bedCapacities })
  }
  const fail = (fallbackMessage: string) => (err: unknown) => setError(err instanceof Error ? err.message : fallbackMessage)

  const active = isActiveMission(mission)

  return (
    <div className="space-y-5">
      {error && (
        <Alert tone="danger" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge tone={toneOf(URGENCIES, mission.priority)} size="sm">
          {mission.priority_display}
        </Badge>
        <Badge tone={toneOf(MISSION_STATUSES, mission.status)} size="sm">
          {mission.status_display}
        </Badge>
        <span>Déclenchée {formatRelative(mission.created_at, now)}</span>
        {mission.eta_at && (
          <span className="font-semibold text-fg" title={mission.eta_source === 'osrm' ? 'Durée par la route' : 'Durée estimée'}>
            · Arrivée {mission.status === 'transporting' ? 'à l’hôpital' : 'sur place'} {formatEta(mission.eta_at, now)}
          </span>
        )}
        {mission.caller_phone && <span className="num">· Appelant {formatPhone(mission.caller_phone)}</span>}
      </div>
      {mission.source === 'sos' ? (
        <p className="text-sm text-fg">
          <span className="font-semibold text-critical">Alerte SOS</span> envoyée depuis l’application par{' '}
          {mission.created_by?.full_name ?? 'un citoyen'} : position GPS du téléphone{' '}
          <span className="num text-muted">
            ({mission.pickup_latitude.toFixed(5)}, {mission.pickup_longitude.toFixed(5)})
          </span>
          . Rappelez la personne avant d’envoyer une ambulance.
          {mission.caller_history && mission.caller_history.cancelled_by_regulation > 0 && (
            <span className="mt-1 block text-xs font-semibold text-warning">
              Attention : {mission.caller_history.cancelled_by_regulation} alerte(s) de cet appelant annulée(s) par
              la régulation en {mission.caller_history.days} jours.
            </span>
          )}
        </p>
      ) : (
        mission.description && <p className="text-sm text-fg">{mission.description}</p>
      )}

      {mission.incident_summary && (
        <p className="rounded-lg border border-critical/40 bg-critical/5 px-4 py-2 text-xs text-fg">
          <span className="font-semibold text-critical">Incident #{mission.incident_summary.id}</span> ·{' '}
          {mission.incident_summary.victims} victimes · {mission.incident_summary.assigned}/
          {mission.incident_summary.missions} ambulances affectées
          {mission.incident_summary.destinations.length > 0 &&
            ` · hôpitaux : ${mission.incident_summary.destinations.join(', ')}`}
        </p>
      )}

      {mission.caller_card && (
        <section className="rounded-lg border border-info/40 bg-info/5 px-4 py-3 text-xs" aria-label="Fiche d’urgence">
          <h3 className="font-semibold uppercase tracking-wide text-muted">Fiche d’urgence de l’appelant</h3>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
            {mission.caller_card.blood_group && (
              <>
                <dt className="text-muted">Groupe sanguin</dt>
                <dd className="num font-semibold text-fg">{mission.caller_card.blood_group}</dd>
              </>
            )}
            {mission.caller_card.allergies && (
              <>
                <dt className="text-muted">Allergies</dt>
                <dd className="font-semibold text-critical">{mission.caller_card.allergies}</dd>
              </>
            )}
            {mission.caller_card.conditions && (
              <>
                <dt className="text-muted">Maladies</dt>
                <dd className="text-fg">{mission.caller_card.conditions}</dd>
              </>
            )}
            {mission.caller_card.medications && (
              <>
                <dt className="text-muted">Traitements</dt>
                <dd className="text-fg">{mission.caller_card.medications}</dd>
              </>
            )}
          </dl>
        </section>
      )}

      {mission.triage_assessment && <TriageSummary mission={mission} />}

      <BilanSummary mission={mission} now={now} />

      {mission.source === 'sos' && mission.status === 'pending' && (
        <QualifySos mission={mission} onSaved={refresh} onError={fail('Enregistrement impossible.')} />
      )}

      {(mission.status === 'pending' || mission.status === 'assigned') && <LocationLinkButton mission={mission} />}

      {mission.status === 'pending' ? (
        <AmbulancePicker mission={mission} onAssigned={refresh} onError={fail('Affectation impossible.')} />
      ) : mission.ambulance ? (
        <section className="rounded-lg border border-line px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Ambulance</h3>
          <p className="mt-1 text-sm text-fg">
            <span className="num font-semibold">{mission.ambulance.plate_number}</span> · {mission.ambulance.ambulance_type_display}
            {mission.ambulance.driver ? ` · ${mission.ambulance.driver.full_name}` : ' · sans chauffeur'}
          </p>
        </section>
      ) : null}

      {active && <DestinationPicker mission={mission} onReserved={refresh} onError={fail('Réservation impossible.')} />}

      {active && <CancelMission mission={mission} onCancelled={() => (refresh(), onDone())} onError={fail('Annulation impossible.')} />}
    </div>
  )
}

/** SMS à l'appelant : un lien qui fait remonter sa position GPS exacte (sans application). */
const LocationLinkButton: React.FC<{ mission: Mission }> = ({ mission }) => {
  const [phone, setPhone] = useState(mission.caller_phone || '')
  const send = useMutation({
    mutationFn: () =>
      api.post<{ sent_to: string }>(`/api/ambulances/missions/${mission.id}/location-link/`, { phone_number: phone }),
  })
  return (
    <section className="flex flex-wrap items-end gap-2 rounded-lg border border-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Position exacte de l’appelant</h3>
        <p className="text-xs text-muted">
          {send.data
            ? `Lien envoyé au ${formatPhone(send.data.sent_to)} : le lieu se mettra à jour dès qu’il le touche.`
            : 'Un SMS avec un lien : l’appelant touche, sa position GPS remonte (sans application).'}
        </p>
        {send.error && (
          <p role="alert" className="text-xs text-critical">
            {send.error instanceof Error ? send.error.message : 'Envoi impossible.'}
          </p>
        )}
      </div>
      <Input
        aria-label="Téléphone de l’appelant"
        type="tel"
        className="h-9 w-40"
        placeholder="77 123 45 67"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <Button size="sm" variant="secondary" isLoading={send.isPending} disabled={!phone.trim()} onClick={() => send.mutate()}>
        Envoyer le lien
      </Button>
    </section>
  )
}

/** Raisons de la priorité et consignes à rappeler à l'appelant, issues du tri de l'appel. */
const TriageSummary: React.FC<{ mission: Mission }> = ({ mission }) => {
  const { data: protocol } = useTriageProtocol()
  const assessment = mission.triage_assessment
  if (!assessment) return null
  return (
    <section className="space-y-2 rounded-lg border border-line px-4 py-3">
      {assessment.reasons.length > 0 && (
        <p className="text-xs text-muted">
          Tri de l’appel : <span className="text-fg">{assessment.reasons.join(', ')}</span>
        </p>
      )}
      <TriageInstructions codes={assessment.instructions} protocol={protocol} />
    </section>
  )
}

/** Après le rappel du citoyen : gravité, motif et repère précisés par le régulateur. */
const QualifySos: React.FC<{ mission: Mission; onSaved: () => void; onError: (err: unknown) => void }> = ({
  mission,
  onSaved,
  onError,
}) => {
  const [priority, setPriority] = useState<Urgency>(mission.priority)
  const [description, setDescription] = useState(mission.description)
  const [address, setAddress] = useState(mission.pickup_address)
  const changed = priority !== mission.priority || description !== mission.description || address !== mission.pickup_address
  const save = useMutation({
    mutationFn: () =>
      api.patch<Mission>(`/api/ambulances/missions/${mission.id}/`, {
        priority,
        description: description.trim(),
        pickup_address: address.trim(),
      }),
    onSuccess: onSaved,
    onError,
  })

  return (
    <form
      className="space-y-3 rounded-lg border border-line px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (changed) save.mutate()
      }}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Qualifier l’alerte</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
        <Select label="Gravité" value={priority} onChange={(e) => setPriority(e.target.value as Urgency)}>
          {URGENCIES.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </Select>
        <Input label="Motif" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <Input
        label="Lieu ou point de repère"
        value={address}
        maxLength={255}
        onChange={(e) => setAddress(e.target.value)}
        helperText="Ce que l’appelant décrit : l’ambulancier le lit sur son téléphone."
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="secondary" disabled={!changed} isLoading={save.isPending}>
          Enregistrer
        </Button>
      </div>
    </form>
  )
}

/** Ambulances disponibles les plus proches du lieu d'intervention (PostGIS). */
const AmbulancePicker: React.FC<{ mission: Mission; onAssigned: () => void; onError: (err: unknown) => void }> = ({
  mission,
  onAssigned,
  onError,
}) => {
  const { data: nearest = [], isLoading } = useQuery<NearbyAmbulance[]>({
    queryKey: [...QK.ambulancesNearest, mission.id],
    queryFn: () =>
      api.get<NearbyAmbulance[]>('/api/ambulances/vehicles/nearest/', {
        latitude: mission.pickup_latitude,
        longitude: mission.pickup_longitude,
        radius_km: DISPATCH_RADIUS_KM,
        limit: 6,
      }),
  })

  const assign = useMutation({
    mutationFn: (ambulanceId: number) =>
      api.post<Mission>(`/api/ambulances/missions/${mission.id}/assign/`, { ambulance_id: ambulanceId }),
    onSuccess: onAssigned,
    onError,
  })

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Ambulances disponibles</h3>
      {isLoading ? (
        <p className="text-xs text-muted">Recherche des véhicules proches…</p>
      ) : nearest.length === 0 ? (
        <p className="text-sm text-muted">Aucune ambulance disponible à moins de {DISPATCH_RADIUS_KM} km.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {nearest.map((amb, index) => (
            <li key={amb.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-fg">
                  <span className="num font-semibold">{amb.plate_number}</span> · {amb.ambulance_type_display}
                  {index === 0 && (
                    <Badge tone="success" size="sm" className="ml-2">
                      La plus proche
                    </Badge>
                  )}
                </p>
                <p className="truncate text-xs text-muted">
                  <Navigation className="mr-1 inline h-3 w-3" aria-hidden="true" />
                  {amb.travel_minutes !== null && (
                    <span className="font-semibold text-fg" title={amb.travel_source === 'osrm' ? 'Par la route' : 'Estimation'}>
                      ~{Math.round(amb.travel_minutes)} min ·{' '}
                    </span>
                  )}
                  {formatDistance(amb.distance_km)} · {amb.facility?.name}
                  {amb.readiness && !amb.readiness.ready && (
                    <span className="ml-1 font-semibold text-warning" title={amb.readiness.issues.join(', ')}>
                      · {amb.readiness.issues[0]}
                    </span>
                  )}
                  {amb.driver ? ` · ${amb.driver.full_name}` : ' · sans chauffeur'}
                </p>
              </div>
              <Button
                size="sm"
                variant={index === 0 ? 'primary' : 'secondary'}
                onClick={() => assign.mutate(amb.id)}
                isLoading={assign.isPending && assign.variables === amb.id}
                disabled={assign.isPending}
                aria-label={`Affecter ${amb.plate_number}`}
              >
                Affecter
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Hôpitaux proches avec des lits libres : réserver un lit oriente la mission vers cet hôpital. */
const DestinationPicker: React.FC<{ mission: Mission; onReserved: () => void; onError: (err: unknown) => void }> = ({
  mission,
  onReserved,
  onError,
}) => {
  const auth = useAuth()
  const now = useNow(30_000)
  const [category, setCategory] = useState<BedCategory>('emergency')
  const [required, setRequired] = useState<Capability[]>([])

  const { data: destinations, isLoading } = useQuery<MissionDestinations>({
    queryKey: [...QK.missionDestinations, mission.id, category, required.join(',')],
    queryFn: () =>
      api.get<MissionDestinations>(`/api/ambulances/missions/${mission.id}/destinations/`, {
        category,
        radius_km: DISPATCH_RADIUS_KM,
        limit: 6,
        ...(required.length > 0 ? { capability: required.join(',') } : {}),
      }),
  })

  const { data: reservations = [] } = useQuery<BedReservation[]>({
    queryKey: [...QK.bedReservations, 'mission', mission.id],
    queryFn: async () =>
      (await api.get<{ results: BedReservation[] }>('/api/lits/reservations/', { mission: mission.id, status: 'active' }))
        .results || [],
  })
  const held = reservations[0]

  const reserve = useMutation({
    mutationFn: (facilityId: number) =>
      api.post<BedReservation>('/api/lits/reservations/', {
        facility_id: facilityId,
        category,
        mission_id: mission.id,
        hold_minutes: HOLD_MINUTES,
      }),
    onSuccess: onReserved,
    onError,
  })

  const results = destinations?.results ?? []

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Hôpital de destination</h3>
          <p className="text-xs text-muted">
            {mission.destination ? (
              <>
                Actuelle : <span className="font-medium text-fg">{mission.destination.name}</span>{' '}
                <DestinationStatusBadge mission={mission} />
                {held
                  ? ` · lit réservé en ${held.capacity.category_display.toLowerCase()}, expire dans ${remainingLabel(held.expires_at, now)}`
                  : ' · aucun lit réservé'}
              </>
            ) : (
              'Aucune : réservez un lit pour orienter l’ambulance.'
            )}
          </p>
        </div>
        <Select
          aria-label="Service recherché"
          value={category}
          onChange={(e) => setCategory(e.target.value as BedCategory)}
          className="w-auto"
        >
          {BED_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Plateau technique requis">
        <span className="mr-1 text-2xs text-muted">Il faut :</span>
        {CAPABILITIES.map((c) => {
          const on = required.includes(c.value)
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={on}
              onClick={() => setRequired((list) => (on ? list.filter((v) => v !== c.value) : [...list, c.value]))}
              className={`cursor-pointer rounded-md border px-2 py-0.5 text-2xs transition-colors ${
                on ? 'border-brand bg-brand text-on-brand' : 'border-line text-muted hover:text-fg'
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted">Recherche des lits libres…</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-muted">
          Aucun lit libre dans ce service à moins de {DISPATCH_RADIUS_KM} km
          {required.length > 0 ? ' avec ce plateau technique' : ''}.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {results.map((facility) => {
            const current = mission.destination?.id === facility.id
            const allowed = canReserveAt(auth, facility)
            return (
              <li key={facility.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">
                    {facility.name}
                    {current && (
                      <Badge tone="info" size="sm" className="ml-2">
                        Destination
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {facility.city} · {formatDistance(facility.distance_km)} ·{' '}
                    <span className="num font-semibold text-ok">
                      <BedDouble className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                      {facility.available_beds} lit{facility.available_beds > 1 ? 's' : ''} libre
                      {facility.available_beds > 1 ? 's' : ''}
                    </span>
                  </p>
                  {facility.freshness !== 'fresh' && (
                    <FreshnessBadge freshness={facility.freshness} confirmedAt={facility.confirmed_at} now={now} />
                  )}
                  <CapabilityChips codes={facility.capabilities} highlight={required} />
                </div>
                <Button
                  size="sm"
                  variant={current ? 'ghost' : 'secondary'}
                  onClick={() => reserve.mutate(facility.id)}
                  isLoading={reserve.isPending && reserve.variables === facility.id}
                  disabled={!allowed || reserve.isPending || (current && !!held)}
                  title={allowed ? undefined : 'Établissement hors de votre région de régulation.'}
                  aria-label={`Réserver un lit à ${facility.name}`}
                >
                  {current && held ? 'Lit réservé' : 'Réserver un lit'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Annulation par la régulation, motif obligatoire (l'ambulancier est prévenu, le lit réservé libéré). */
const CancelMission: React.FC<{ mission: Mission; onCancelled: () => void; onError: (err: unknown) => void }> = ({
  mission,
  onCancelled,
  onError,
}) => {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const cancel = useMutation({
    mutationFn: () =>
      api.post<Mission>(`/api/ambulances/missions/${mission.id}/status/`, {
        status: 'cancelled',
        cancellation_reason: reason.trim(),
      }),
    onSuccess: onCancelled,
    onError,
  })

  // Le transport commencé ne s'annule plus (le patient est à bord).
  if (mission.status === 'transporting') return null

  if (!open) {
    return (
      <div className="border-t border-line pt-3">
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {mission.source === 'sos' && mission.status === 'pending' ? 'Fausse alerte ou sans suite…' : 'Annuler la mission…'}
        </Button>
      </div>
    )
  }
  return (
    <form
      className="space-y-3 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (reason.trim()) cancel.mutate()
      }}
    >
      <Textarea
        label="Motif d’annulation"
        placeholder="ex. patient transporté par les sapeurs-pompiers"
        required
        autoFocus
        maxLength={255}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Retour
        </Button>
        <Button type="submit" variant="danger" size="sm" disabled={!reason.trim()} isLoading={cancel.isPending}>
          Annuler la mission
        </Button>
      </div>
    </form>
  )
}
