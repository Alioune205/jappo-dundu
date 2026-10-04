import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ROLES } from '@/lib/constants'
import type { AdminUser, AdminUserInput, Facility, Role } from '@/types/api'
import { QK } from '@/lib/queryKeys'

const EMPTY_USER: AdminUserInput = {
  username: '',
  password: '',
  first_name: '',
  last_name: '',
  email: '',
  phone_number: '',
  region: 'dakar',
  role: 'hospital_staff',
  facility_id: null,
  is_active: true,
}

/** Création d'un compte du personnel (hôpital, régulation, administration). */
export const UserFormModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Nouveau compte"
    description="Personnel hospitalier, régulation ou administration."
    maxWidth="lg"
  >
    {isOpen && <UserForm onDone={onClose} />}
  </Modal>
)

const UserForm: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AdminUserInput>(EMPTY_USER)
  const set = (patch: Partial<AdminUserInput>) => setForm((current) => ({ ...current, ...patch }))
  const canSave = !!form.username?.trim() && !!form.password

  // Liste complète des établissements, indépendante des filtres de l'onglet.
  const { data: facilities = [] } = useQuery<Facility[]>({
    queryKey: QK.facilityOptions,
    queryFn: async () => (await api.get<{ results: Facility[] }>('/api/facilities/')).results || [],
  })

  const create = useMutation({
    mutationFn: () => api.post<AdminUser>('/api/users/', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.adminUsers })
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
        <Alert tone="danger">
          {create.error instanceof Error ? create.error.message : 'Erreur lors de la création du compte.'}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input label="Prénom" required value={form.first_name} onChange={(e) => set({ first_name: e.target.value })} />
        <Input label="Nom" required value={form.last_name} onChange={(e) => set({ last_name: e.target.value })} />
        <Input
          label="Identifiant"
          required
          autoComplete="off"
          placeholder="ex. dr.diallo"
          value={form.username}
          onChange={(e) => set({ username: e.target.value })}
        />
        <Input
          label="Mot de passe initial"
          type="password"
          required
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => set({ password: e.target.value })}
        />
        <Input
          label="Adresse e-mail"
          type="email"
          placeholder="ex. diallo@hopital.sn"
          value={form.email}
          onChange={(e) => set({ email: e.target.value })}
        />
        <Input
          label="Téléphone"
          type="tel"
          placeholder="77 123 45 67"
          value={form.phone_number}
          onChange={(e) => set({ phone_number: e.target.value })}
        />
        <Select label="Rôle" value={form.role} onChange={(e) => set({ role: e.target.value as Role })}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <Select
          label="Établissement"
          value={form.facility_id || ''}
          onChange={(e) => set({ facility_id: e.target.value ? parseInt(e.target.value, 10) : null })}
        >
          <option value="">Aucun</option>
          {facilities.map((fac) => (
            <option key={fac.id} value={fac.id}>
              {fac.name} ({fac.city})
            </option>
          ))}
        </Select>
      </div>

      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" disabled={!canSave} isLoading={create.isPending}>
          Créer le compte
        </Button>
      </div>
    </form>
  )
}
