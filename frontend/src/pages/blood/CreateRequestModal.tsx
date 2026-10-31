import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { BLOOD_GROUPS, COMPONENTS, RARE_PHENOTYPES, URGENCIES } from '@/lib/constants'
import type {
  BloodComponent,
  BloodGroup,
  BloodRequest,
  BloodRequestInput,
  FacilitySummary,
  RarePhenotype,
  Urgency,
} from '@/types/api'
import { QK } from '@/lib/queryKeys'
import { FULL_FEATURES } from '@/lib/features'

/** Établissements qui peuvent demander du sang (pas les services d'ambulances). */
const BLOOD_SITE_TYPES = new Set(['hospital', 'health_center', 'clinic', 'blood_bank'])

const EMPTY_REQUEST: BloodRequestInput = {
  blood_group: 'O+',
  component: 'red_cells',
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
    description="Les donneurs compatibles les plus proches sont alertés. Pour une urgence immédiate, commandez aussi des poches en stock depuis le détail de la demande."
  >
    {/* Remonté à chaque ouverture : formulaire vierge, erreurs effacées. */}
    {isOpen && <CreateRequestForm onDone={onClose} />}
  </Modal>
)

const CreateRequestForm: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<BloodRequestInput>(EMPTY_REQUEST)
  const set = (patch: Partial<BloodRequestInput>) => setForm((current) => ({ ...current, ...patch }))
  // L'administrateur général n'est rattaché à aucun établissement : il choisit
  // celui qui demande (l'API l'exige). Les autres rôles demandent pour le leur.
  const { isAdmin } = useAuth()
  const { data: sites = [] } = useQuery<FacilitySummary[]>({
    queryKey: QK.facilitiesBloodSites,
    queryFn: async () =>
      ((await api.get<{ results: FacilitySummary[] }>('/api/facilities/')).results || []).filter((f) =>
        BLOOD_SITE_TYPES.has(f.facility_type)
      ),
    enabled: isAdmin,
  })
  const missingFacility = isAdmin && !form.facility_id

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
        <Alert tone="danger">
          {create.error instanceof Error ? create.error.message : 'Erreur lors de la création.'}
        </Alert>
      )}

      {isAdmin && (
        <Select
          label="Établissement demandeur"
          required
          value={form.facility_id ?? ''}
          onChange={(e) => set({ facility_id: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">Choisir un établissement…</option>
          {sites.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.city})
            </option>
          ))}
        </Select>
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
        {FULL_FEATURES && (
          <Select
            label="Produit"
            value={form.component}
            onChange={(e) => set({ component: e.target.value as BloodComponent })}
          >
            {COMPONENTS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        )}
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
      {FULL_FEATURES && (
        <Select
          label="Phénotype rare (facultatif)"
          value={form.rare_phenotype ?? ''}
          onChange={(e) => set({ rare_phenotype: e.target.value as RarePhenotype | '' })}
        >
          <option value="">Aucun : donneurs compatibles à proximité</option>
          {RARE_PHENOTYPES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label} : registre national
            </option>
          ))}
        </Select>
      )}
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
        <Button type="submit" variant="primary" isLoading={create.isPending} disabled={missingFacility}>
          Diffuser la demande
        </Button>
      </div>
    </form>
  )
}
