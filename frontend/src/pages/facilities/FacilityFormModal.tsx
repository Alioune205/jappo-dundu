import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { DAKAR_CENTER, FACILITY_TYPES, REGIONS } from '@/lib/constants'
import type { Facility, FacilityInput, FacilityType, RegionCode } from '@/types/api'
import { QK } from '@/lib/queryKeys'

const EMPTY_FACILITY: FacilityInput = {
  name: '',
  facility_type: 'hospital',
  region: 'dakar',
  city: '',
  address: '',
  phone_number: '',
  latitude: DAKAR_CENTER[0],
  longitude: DAKAR_CENTER[1],
  is_active: true,
}

/** Création d'un établissement de santé. */
export const FacilityFormModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Nouvel établissement" maxWidth="lg">
    {isOpen && <FacilityForm onDone={onClose} />}
  </Modal>
)

const FacilityForm: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FacilityInput>(EMPTY_FACILITY)
  const set = (patch: Partial<FacilityInput>) => setForm((current) => ({ ...current, ...patch }))
  const canSave = form.name.trim() !== '' && form.city.trim() !== ''

  const create = useMutation({
    mutationFn: () => api.post<Facility>('/api/facilities/', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.adminFacilities })
      onDone()
    },
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSave) create.mutate()
      }}
    >
      {create.error && (
        <Alert tone="danger">{create.error instanceof Error ? create.error.message : 'Erreur lors de la création.'}</Alert>
      )}

      <Input
        label="Nom"
        placeholder="ex. Hôpital Principal de Dakar"
        required
        value={form.name}
        onChange={(e) => set({ name: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Type"
          value={form.facility_type}
          onChange={(e) => set({ facility_type: e.target.value as FacilityType })}
        >
          {FACILITY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
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
        <Input
          label="Ville ou commune"
          placeholder="ex. Dakar Plateau"
          required
          value={form.city}
          onChange={(e) => set({ city: e.target.value })}
        />
        <Input
          label="Téléphone"
          type="tel"
          placeholder="33 839 50 50"
          value={form.phone_number}
          onChange={(e) => set({ phone_number: e.target.value })}
        />
      </div>
      <Input
        label="Adresse"
        placeholder="ex. 1 avenue Nelson Mandela"
        value={form.address}
        onChange={(e) => set({ address: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Latitude"
          type="number"
          step="any"
          className="num"
          value={form.latitude ?? ''}
          onChange={(e) => set({ latitude: parseFloat(e.target.value) || null })}
        />
        <Input
          label="Longitude"
          type="number"
          step="any"
          className="num"
          value={form.longitude ?? ''}
          onChange={(e) => set({ longitude: parseFloat(e.target.value) || null })}
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" disabled={!canSave} isLoading={create.isPending}>
          Enregistrer
        </Button>
      </div>
    </form>
  )
}
