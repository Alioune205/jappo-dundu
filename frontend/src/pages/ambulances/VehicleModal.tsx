import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { AMBULANCE_TYPES } from '@/lib/constants'
import { QK } from '@/lib/queryKeys'
import type { Ambulance, AmbulanceInput, AmbulanceType, DriverOption, Facility, FacilitySummary } from '@/types/api'

interface VehicleModalProps {
  /** Véhicule à modifier, `'new'` pour un ajout, `null` : fenêtre fermée. */
  vehicle: Ambulance | 'new' | null
  /**
   * Service de l'administrateur des ambulances : les véhicules y sont
   * rattachés d'office. `null` : administrateur général, qui choisit la base.
   */
  service: FacilitySummary | null
  onClose: () => void
}

/**
 * Ajout ou modification d'une ambulance : immatriculation, type, base et
 * chauffeur. Le formulaire est remonté à chaque ouverture (clé = véhicule).
 */
export const VehicleModal: React.FC<VehicleModalProps> = ({ vehicle, service, onClose }) => (
  <Modal
    isOpen={vehicle !== null}
    onClose={onClose}
    title={vehicle === 'new' ? 'Nouveau véhicule' : 'Modifier le véhicule'}
    description={
      vehicle && vehicle !== 'new'
        ? `${vehicle.plate_number} · ${vehicle.facility?.name ?? ''}`
        : "Le chauffeur reçoit les missions de ce véhicule dans l'application mobile."
    }
  >
    {vehicle !== null && (
      <VehicleForm
        key={vehicle === 'new' ? 'new' : vehicle.id}
        vehicle={vehicle === 'new' ? null : vehicle}
        service={service}
        onDone={onClose}
      />
    )}
  </Modal>
)

const VehicleForm: React.FC<{ vehicle: Ambulance | null; service: FacilitySummary | null; onDone: () => void }> = ({
  vehicle,
  service,
  onDone,
}) => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AmbulanceInput>({
    plate_number: vehicle?.plate_number ?? '',
    facility_id: vehicle?.facility?.id ?? service?.id ?? 0,
    ambulance_type: vehicle?.ambulance_type ?? 'basic',
    driver_id: vehicle?.driver?.id ?? null,
  })
  const set = (patch: Partial<AmbulanceInput>) => setForm((current) => ({ ...current, ...patch }))
  const canSave = form.plate_number.trim().length >= 4 && form.facility_id > 0

  const { data: drivers = [], isLoading: isLoadingDrivers } = useQuery<DriverOption[]>({
    queryKey: QK.ambulanceDrivers,
    queryFn: () => api.get<DriverOption[]>('/api/ambulances/vehicles/drivers/'),
  })

  // Administrateur général : bases possibles (services d'ambulances et hôpitaux).
  const { data: bases = [] } = useQuery<Facility[]>({
    queryKey: QK.facilityOptions,
    queryFn: async () => (await api.get<{ results: Facility[] }>('/api/facilities/')).results || [],
    enabled: service === null,
    select: (facilities) => facilities.filter((f) => f.facility_type === 'ambulance_service' || f.facility_type === 'hospital'),
  })

  const save = useMutation({
    mutationFn: () =>
      vehicle
        ? api.patch<Ambulance>(`/api/ambulances/vehicles/${vehicle.id}/`, form)
        : api.post<Ambulance>('/api/ambulances/vehicles/', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.ambulancesFleet })
      queryClient.invalidateQueries({ queryKey: QK.ambulanceDrivers })
      onDone()
    },
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave) save.mutate()
      }}
    >
      {save.error && (
        <Alert tone="danger">{save.error instanceof Error ? save.error.message : 'Enregistrement impossible.'}</Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Immatriculation"
          placeholder="DK-1234-AB"
          required
          autoFocus={!vehicle}
          className="num uppercase"
          value={form.plate_number}
          onChange={(e) => set({ plate_number: e.target.value })}
        />
        <Select
          label="Type"
          value={form.ambulance_type}
          onChange={(e) => set({ ambulance_type: e.target.value as AmbulanceType })}
        >
          {AMBULANCE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>

      {service ? (
        <Input label="Base" value={service.name} disabled readOnly helperText="Véhicule rattaché à votre service." />
      ) : (
        <Select
          label="Base"
          required
          value={form.facility_id || ''}
          onChange={(e) => set({ facility_id: parseInt(e.target.value, 10) || 0 })}
        >
          <option value="">Choisir l’établissement</option>
          {bases.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.city})
            </option>
          ))}
        </Select>
      )}

      <Select
        label="Chauffeur"
        value={form.driver_id ?? ''}
        disabled={isLoadingDrivers}
        onChange={(e) => set({ driver_id: e.target.value ? parseInt(e.target.value, 10) : null })}
        helperText={
          drivers.length === 0 && !isLoadingDrivers
            ? service
              ? 'Aucun compte ambulancier dans votre service : demandez sa création à l’administrateur général.'
              : 'Aucun compte ambulancier : créez-le depuis la page « Structures ».'
            : 'Un ambulancier conduit un seul véhicule.'
        }
      >
        <option value="">Sans chauffeur</option>
        {drivers.map((d) => {
          const elsewhere = d.ambulance && d.ambulance.id !== vehicle?.id ? d.ambulance.plate_number : null
          return (
            <option key={d.id} value={d.id} disabled={!!elsewhere}>
              {d.full_name}
              {elsewhere ? ` — conduit déjà ${elsewhere}` : ''}
            </option>
          )
        })}
      </Select>

      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" disabled={!canSave} isLoading={save.isPending}>
          {vehicle ? 'Enregistrer' : 'Ajouter le véhicule'}
        </Button>
      </div>
    </form>
  )
}
