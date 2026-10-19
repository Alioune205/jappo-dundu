import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { QK } from '@/lib/queryKeys'
import type { BedCapacity, BedReservation, BedReservationInput, Mission } from '@/types/api'

/** Durées proposées (minutes) ; le serveur accepte de 5 à 240. */
const HOLD_OPTIONS = [30, 45, 60, 90, 120, 240]
/** Rôles qui voient des missions SAMU (régulation, hôpital de destination). */
const MISSION_VIEWERS = ['admin', 'hospital_staff', 'ambulance_manager', 'bed_manager']

/** Réserver un lit du service pour un patient attendu (mission SAMU, transfert, admission programmée). */
export const ReserveBedModal: React.FC<{ capacity: BedCapacity | null; onClose: () => void }> = ({
  capacity,
  onClose,
}) => (
  <Modal
    isOpen={capacity !== null}
    onClose={onClose}
    title="Réserver un lit"
    description="Le lit est bloqué pour le patient attendu, puis libéré automatiquement à l'expiration du délai."
  >
    {/* Remonté à chaque ouverture : formulaire vierge, erreurs effacées. */}
    {capacity && <ReserveBedForm capacity={capacity} onDone={onClose} />}
  </Modal>
)

const ReserveBedForm: React.FC<{ capacity: BedCapacity; onDone: () => void }> = ({ capacity, onDone }) => {
  const queryClient = useQueryClient()
  const { roles } = useAuth()
  const [form, setForm] = useState<BedReservationInput>({
    capacity_id: capacity.id,
    mission_id: null,
    reference: '',
    notes: '',
    hold_minutes: 45,
  })
  const set = (patch: Partial<BedReservationInput>) => setForm((current) => ({ ...current, ...patch }))

  const canSeeMissions = roles.some((r) => MISSION_VIEWERS.includes(r))
  const { data: missions = [] } = useQuery<Mission[]>({
    queryKey: [...QK.missionsActive, 'reservable'],
    queryFn: async () =>
      (await api.get<{ results: Mission[] }>('/api/ambulances/missions/', { active: 'true' })).results || [],
    enabled: canSeeMissions,
  })

  const reserve = useMutation({
    mutationFn: () => api.post<BedReservation>('/api/lits/reservations/', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.bedReservations })
      queryClient.invalidateQueries({ queryKey: QK.bedCapacities })
      queryClient.invalidateQueries({ queryKey: QK.bedsSummary })
      queryClient.invalidateQueries({ queryKey: QK.missionsActive })
      onDone()
    },
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        reserve.mutate()
      }}
    >
      {reserve.error && (
        <Alert tone="danger">{reserve.error instanceof Error ? reserve.error.message : 'Réservation impossible.'}</Alert>
      )}

      <div className="rounded-lg border border-line bg-raised px-3 py-2.5">
        <p className="text-sm font-medium text-fg">
          {capacity.category_display} · {capacity.facility?.name}
        </p>
        <p className="num text-xs text-muted">
          {capacity.available_beds} lit{capacity.available_beds > 1 ? 's' : ''} libre
          {capacity.available_beds > 1 ? 's' : ''} · {capacity.reserved_beds} déjà réservé
          {capacity.reserved_beds > 1 ? 's' : ''}
        </p>
      </div>

      {canSeeMissions && (
        <Select
          label="Mission SAMU (facultatif)"
          value={form.mission_id ?? ''}
          onChange={(e) => set({ mission_id: e.target.value ? Number(e.target.value) : null })}
          helperText="La mission sera orientée vers cet établissement ; sa clôture admettra le patient."
        >
          <option value="">Aucune (transfert, admission programmée…)</option>
          {missions.map((m) => (
            <option key={m.id} value={m.id}>
              #{m.id} · {m.priority_display} · {m.pickup_address || m.region_display}
            </option>
          ))}
        </Select>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Référence"
          placeholder="ex. transfert bloc 2"
          maxLength={120}
          value={form.reference}
          onChange={(e) => set({ reference: e.target.value })}
          helperText="Jamais le nom du patient."
        />
        <Select
          label="Bloquer pendant"
          value={form.hold_minutes}
          onChange={(e) => set({ hold_minutes: Number(e.target.value) })}
        >
          {HOLD_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes < 60 ? `${minutes} min` : `${minutes / 60} h`}
            </option>
          ))}
        </Select>
      </div>
      <Textarea
        label="Précisions"
        placeholder="ex. patient intubé, arrivée prévue vers 14 h"
        maxLength={500}
        value={form.notes}
        onChange={(e) => set({ notes: e.target.value })}
      />

      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" isLoading={reserve.isPending} disabled={capacity.available_beds === 0}>
          Réserver le lit
        </Button>
      </div>
    </form>
  )
}
