import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { BLOOD_GROUPS, URGENCIES } from '@/lib/constants'
import type { BloodGroup, BloodRequest, BloodRequestInput, Urgency } from '@/types/api'
import { QK } from '@/lib/queryKeys'

const EMPTY_REQUEST: BloodRequestInput = {
  blood_group: 'O+',
  units_needed: 2,
  urgency: 'urgent',
  notes: '',
  needed_by: null,
  search_radius_km: 25,
}

/** Création d'une demande de sang ; les donneurs compatibles sont alertés à l'enregistrement. */
export const CreateRequestModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Nouvelle demande de sang"
    description="Les donneurs compatibles à proximité sont alertés dès l'enregistrement."
  >
    {/* Remonté à chaque ouverture : formulaire vierge, erreurs effacées. */}
    {isOpen && <CreateRequestForm onDone={onClose} />}
  </Modal>
)

const CreateRequestForm: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<BloodRequestInput>(EMPTY_REQUEST)
  const set = (patch: Partial<BloodRequestInput>) => setForm((current) => ({ ...current, ...patch }))

  const create = useMutation({
    mutationFn: () => api.post<BloodRequest>('/api/sang/requests/', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.bloodRequests })
      onDone()
    },
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate()
      }}
    >
      {create.error && (
        <Alert tone="danger">{create.error instanceof Error ? create.error.message : 'Erreur lors de la création.'}</Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Groupe sanguin"
          value={form.blood_group}
          onChange={(e) => set({ blood_group: e.target.value as BloodGroup })}
        >
          {BLOOD_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <Input
          label="Poches"
          type="number"
          min={1}
          max={50}
          value={form.units_needed}
          onChange={(e) => set({ units_needed: parseInt(e.target.value, 10) || 1 })}
        />
        <Select label="Urgence" value={form.urgency} onChange={(e) => set({ urgency: e.target.value as Urgency })}>
          {URGENCIES.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </Select>
        <Input
          label="Rayon de recherche (km)"
          type="number"
          min={1}
          max={200}
          value={form.search_radius_km}
          onChange={(e) => set({ search_radius_km: parseInt(e.target.value, 10) || 20 })}
        />
      </div>
      <Textarea
        label="Précisions cliniques"
        placeholder="ex. bloc opératoire 2, patient polytraumatisé"
        value={form.notes}
        onChange={(e) => set({ notes: e.target.value })}
      />

      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" isLoading={create.isPending}>
          Diffuser la demande
        </Button>
      </div>
    </form>
  )
}
