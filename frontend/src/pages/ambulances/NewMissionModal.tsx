import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { DAKAR_CENTER, REGIONS, URGENCIES } from '@/lib/constants'
import type { FacilitySummary, Mission, MissionInput, RegionCode, Urgency } from '@/types/api'
import { QK } from '@/lib/queryKeys'

const EMPTY_MISSION: MissionInput = {
  priority: 'urgent',
  description: '',
  pickup_address: '',
  pickup_latitude: DAKAR_CENTER[0],
  pickup_longitude: DAKAR_CENTER[1],
  region: 'dakar',
  caller_phone: '',
  destination_id: null,
}

interface NewMissionModalProps {
  isOpen: boolean
  onClose: () => void
  /** Appelé avec la mission créée (la page déclenche alors l'affectation). */
  onCreated: (mission: Mission) => void
}

/** Déclenchement d'une mission d'urgence. */
export const NewMissionModal: React.FC<NewMissionModalProps> = ({ isOpen, onClose, onCreated }) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Nouvelle mission"
    description="L'ambulance disponible la plus proche du lieu est affectée automatiquement."
    maxWidth="lg"
  >
    {isOpen && (
      <NewMissionForm
        onCancel={onClose}
        onCreated={(mission) => {
          onClose()
          onCreated(mission)
        }}
      />
    )}
  </Modal>
)

const NewMissionForm: React.FC<{ onCancel: () => void; onCreated: (mission: Mission) => void }> = ({
  onCancel,
  onCreated,
}) => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<MissionInput>(EMPTY_MISSION)
  const set = (patch: Partial<MissionInput>) => setForm((current) => ({ ...current, ...patch }))
  const canDeploy = form.pickup_address.trim().length > 0

  const { data: hospitals = [] } = useQuery<FacilitySummary[]>({
    queryKey: QK.facilitiesHospitals,
    queryFn: async () =>
      (await api.get<{ results: FacilitySummary[] }>('/api/facilities/', { facility_type: 'hospital' })).results || [],
  })

  const create = useMutation({
    mutationFn: () => api.post<Mission>('/api/ambulances/missions/', form),
    onSuccess: (mission) => {
      queryClient.invalidateQueries({ queryKey: QK.missionsAll })
      queryClient.invalidateQueries({ queryKey: QK.missionsActive })
      onCreated(mission)
    },
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (canDeploy) create.mutate()
      }}
    >
      {create.error && (
        <Alert tone="danger">
          {create.error instanceof Error ? create.error.message : 'Création de la mission impossible.'}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Select label="Priorité" value={form.priority} onChange={(e) => set({ priority: e.target.value as Urgency })}>
          {URGENCIES.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </Select>
        <Select label="Région" value={form.region} onChange={(e) => set({ region: e.target.value as RegionCode })}>
          {REGIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </div>

      <Input
        label="Adresse ou point de repère"
        placeholder="ex. rond-point Liberté 6, face à la station"
        required
        autoFocus
        value={form.pickup_address}
        onChange={(e) => set({ pickup_address: e.target.value })}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Latitude"
          type="number"
          step="any"
          className="num"
          value={form.pickup_latitude}
          onChange={(e) => set({ pickup_latitude: parseFloat(e.target.value) || DAKAR_CENTER[0] })}
        />
        <Input
          label="Longitude"
          type="number"
          step="any"
          className="num"
          value={form.pickup_longitude}
          onChange={(e) => set({ pickup_longitude: parseFloat(e.target.value) || DAKAR_CENTER[1] })}
        />
        <Input
          label="Téléphone de l'appelant"
          type="tel"
          placeholder="77 123 45 67"
          value={form.caller_phone}
          onChange={(e) => set({ caller_phone: e.target.value })}
        />
        <Select
          label="Destination (optionnel)"
          value={form.destination_id || ''}
          onChange={(e) => set({ destination_id: e.target.value ? parseInt(e.target.value, 10) : null })}
        >
          <option value="">À décider selon les lits libres</option>
          {hospitals.map((fac) => (
            <option key={fac.id} value={fac.id}>
              {fac.name} ({fac.city})
            </option>
          ))}
        </Select>
      </div>

      <Textarea
        label="Motif de l'appel"
        placeholder="ex. détresse respiratoire aiguë, patient inconscient"
        value={form.description}
        onChange={(e) => set({ description: e.target.value })}
      />

      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" variant="danger" disabled={!canDeploy} isLoading={create.isPending}>
          Déclencher
        </Button>
      </div>
    </form>
  )
}
