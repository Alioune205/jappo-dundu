import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { FACILITY_TYPES, REGIONS, ROLES } from '@/lib/constants'
import { formatDateTime } from '@/lib/format'
import type {
  Facility,
  FacilityInput,
  FacilityType,
  RegionCode,
  AdminUser,
  AdminUserInput,
  Role,
} from '@/types/api'

export const FacilitiesManagement: React.FC = () => {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'facilities' | 'users'>('facilities')

  // Filtres Établissements
  const [filterRegion, setFilterRegion] = useState('')
  const [filterType, setFilterType] = useState('')

  // Modale Établissement
  const [isFacilityModalOpen, setIsFacilityModalOpen] = useState(false)
  const [facilityForm, setFacilityForm] = useState<FacilityInput>({
    name: '',
    facility_type: 'hospital',
    region: 'dakar',
    city: '',
    address: '',
    phone_number: '',
    latitude: 14.6928,
    longitude: -17.4467,
    is_active: true,
  })
  const [facilityError, setFacilityError] = useState<string | null>(null)

  // Filtres Utilisateurs
  const [userRoleFilter, setUserRoleFilter] = useState('')
  const [userSearch, setUserSearch] = useState('')

  // Modale Utilisateur
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [userForm, setUserForm] = useState<AdminUserInput>({
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
  })
  const [userError, setUserError] = useState<string | null>(null)

  // 1. Liste des Établissements
  const { data: facilities = [], isLoading: isLoadingFacilities } = useQuery<Facility[]>({
    queryKey: ['admin-facilities', filterRegion, filterType],
    queryFn: async () => {
      const res = await api.get<{ results: Facility[] }>('/api/facilities/', {
        region: filterRegion || undefined,
        facility_type: filterType || undefined,
      })
      return res.results || []
    },
  })

  // 2. Liste des Utilisateurs
  const { data: users = [], isLoading: isLoadingUsers } = useQuery<AdminUser[]>({
    queryKey: ['admin-users', userRoleFilter, userSearch],
    queryFn: async () => {
      const res = await api.get<{ results: AdminUser[] }>('/api/users/', {
        role: userRoleFilter || undefined,
        search: userSearch || undefined,
      })
      return res.results || []
    },
  })

  // Mutation : Créer un établissement
  const createFacilityMutation = useMutation({
    mutationFn: (data: FacilityInput) => api.post<Facility>('/api/facilities/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-facilities'] })
      setIsFacilityModalOpen(false)
      setFacilityForm({
        name: '',
        facility_type: 'hospital',
        region: 'dakar',
        city: '',
        address: '',
        phone_number: '',
        latitude: 14.6928,
        longitude: -17.4467,
        is_active: true,
      })
    },
    onError: (err: unknown) => {
      setFacilityError(err instanceof Error ? err.message : 'Erreur lors de la création')
    },
  })

  // Mutation : Créer un utilisateur
  const createUserMutation = useMutation({
    mutationFn: (data: AdminUserInput) => api.post<AdminUser>('/api/users/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setIsUserModalOpen(false)
      setUserForm({
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
      })
    },
    onError: (err: unknown) => {
      setUserError(err instanceof Error ? err.message : 'Erreur lors de la création du compte')
    },
  })

  if (!isAdmin) {
    return (
      <div className="surface p-12 text-center text-rose-400">
        Accès restreint aux administrateurs du système.
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white tracking-tight">
            Administration & Référentiel
          </h1>
          <p className="text-xs text-ink-400 mt-1">
            Gestion du parc des hôpitaux, centres de transfusion et comptes d'accès
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'facilities' ? (
            <Button
              variant="primary"
              onClick={() => setIsFacilityModalOpen(true)}
              icon={<span className="text-base">🏥</span>}
            >
              Ajouter un Établissement
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => setIsUserModalOpen(true)}
              icon={<span className="text-base">👤</span>}
            >
              Créer un Utilisateur
            </Button>
          )}
        </div>
      </div>

      {/* Onglets Établissements vs Utilisateurs */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3">
        <button
          onClick={() => setActiveTab('facilities')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
            activeTab === 'facilities'
              ? 'bg-brand-600 text-white'
              : 'text-ink-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          Établissements de Santé ({facilities.length})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
            activeTab === 'users'
              ? 'bg-brand-600 text-white'
              : 'text-ink-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          Utilisateurs & Droits ({users.length})
        </button>
      </div>

      {activeTab === 'facilities' ? (
        /* Section Établissements */
        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label="Filtrer par Région"
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
              >
                <option value="">Toutes les régions</option>
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>

              <Select
                label="Type d'Établissement"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">Tous les types</option>
                {FACILITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoadingFacilities ? (
              <div className="surface p-12 text-center text-xs text-ink-500 col-span-3">
                Chargement des établissements...
              </div>
            ) : (
              facilities.map((fac) => (
                <Card key={fac.id} className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-ink-100">{fac.name}</h4>
                      <span className="text-[11px] text-sky-400 font-medium">
                        {fac.facility_type_display}
                      </span>
                    </div>
                    <Badge tone={fac.is_active ? 'success' : 'neutral'} size="sm">
                      {fac.is_active ? 'Actif' : 'Désactivé'}
                    </Badge>
                  </div>

                  <div className="text-xs space-y-1 text-ink-400 border-t border-white/[0.04] pt-2">
                    <div>Ville : <span className="text-ink-200">{fac.city} ({fac.region_display})</span></div>
                    {fac.address && <div>Adresse : <span className="text-ink-200">{fac.address}</span></div>}
                    {fac.phone_number && (
                      <div>Téléphone : <span className="text-ink-200">{fac.phone_number}</span></div>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Section Utilisateurs */
        <div className="space-y-4">
          <Card className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Rechercher"
                placeholder="Nom, email ou téléphone..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />

              <Select
                label="Filtrer par Rôle"
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
              >
                <option value="">Tous les rôles</option>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
          </Card>

          <div className="surface border border-white/10 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-ink-950/60 text-ink-400 font-semibold border-b border-white/[0.08]">
                  <tr>
                    <th className="py-3 px-4">Utilisateur</th>
                    <th className="py-3 px-4">Identifiant</th>
                    <th className="py-3 px-4">Rôle</th>
                    <th className="py-3 px-4">Établissement</th>
                    <th className="py-3 px-4">Téléphone</th>
                    <th className="py-3 px-4">Date de Création</th>
                    <th className="py-3 px-4 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-ink-200">
                  {isLoadingUsers ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-ink-500">
                        Chargement des utilisateurs...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-ink-500">
                        Aucun utilisateur trouvé.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-4 font-semibold text-ink-100">{u.full_name}</td>
                        <td className="py-3 px-4 text-ink-400">{u.username}</td>
                        <td className="py-3 px-4">
                          <Badge
                            tone={
                              u.role === 'admin'
                                ? 'brand'
                                : u.role === 'hospital_staff'
                                ? 'info'
                                : 'neutral'
                            }
                            size="sm"
                          >
                            {u.role ? u.role : 'Donneur'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-ink-300">
                          {u.facility ? u.facility.name : '—'}
                        </td>
                        <td className="py-3 px-4 text-ink-400">{u.phone_number || '—'}</td>
                        <td className="py-3 px-4 text-ink-400">{formatDateTime(u.date_joined)}</td>
                        <td className="py-3 px-4 text-right">
                          <Badge tone={u.is_active ? 'success' : 'neutral'} size="sm">
                            {u.is_active ? 'Actif' : 'Bloqué'}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modale d'ajout d'établissement */}
      <Modal
        isOpen={isFacilityModalOpen}
        onClose={() => setIsFacilityModalOpen(false)}
        title="Ajouter un Établissement de Santé"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsFacilityModalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setFacilityError(null)
                createFacilityMutation.mutate(facilityForm)
              }}
              isLoading={createFacilityMutation.isPending}
            >
              Enregistrer l'Établissement
            </Button>
          </>
        }
      >
        {facilityError && (
          <Alert tone="danger" onClose={() => setFacilityError(null)}>
            {facilityError}
          </Alert>
        )}

        <div className="space-y-4">
          <Input
            label="Nom de l'établissement"
            placeholder="ex. Hôpital Principal de Dakar"
            required
            value={facilityForm.name}
            onChange={(e) => setFacilityForm({ ...facilityForm, name: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type"
              value={facilityForm.facility_type}
              onChange={(e) =>
                setFacilityForm({
                  ...facilityForm,
                  facility_type: e.target.value as FacilityType,
                })
              }
            >
              {FACILITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>

            <Select
              label="Région"
              value={facilityForm.region}
              onChange={(e) =>
                setFacilityForm({ ...facilityForm, region: e.target.value as RegionCode })
              }
            >
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Ville / Commune"
              placeholder="ex. Dakar Plateau"
              required
              value={facilityForm.city}
              onChange={(e) => setFacilityForm({ ...facilityForm, city: e.target.value })}
            />

            <Input
              label="Téléphone"
              placeholder="33 839 50 50"
              value={facilityForm.phone_number}
              onChange={(e) =>
                setFacilityForm({ ...facilityForm, phone_number: e.target.value })
              }
            />
          </div>

          <Input
            label="Adresse physique"
            placeholder="ex. 1 Avenue Nelson Mandela"
            value={facilityForm.address}
            onChange={(e) => setFacilityForm({ ...facilityForm, address: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Latitude"
              type="number"
              step="any"
              value={facilityForm.latitude || ''}
              onChange={(e) =>
                setFacilityForm({
                  ...facilityForm,
                  latitude: parseFloat(e.target.value) || null,
                })
              }
            />
            <Input
              label="Longitude"
              type="number"
              step="any"
              value={facilityForm.longitude || ''}
              onChange={(e) =>
                setFacilityForm({
                  ...facilityForm,
                  longitude: parseFloat(e.target.value) || null,
                })
              }
            />
          </div>
        </div>
      </Modal>

      {/* Modale d'ajout d'utilisateur */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        title="Créer un Compte Professionnel"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsUserModalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setUserError(null)
                createUserMutation.mutate(userForm)
              }}
              isLoading={createUserMutation.isPending}
            >
              Créer le Compte
            </Button>
          </>
        }
      >
        {userError && (
          <Alert tone="danger" onClose={() => setUserError(null)}>
            {userError}
          </Alert>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Prénom"
              required
              value={userForm.first_name}
              onChange={(e) => setUserForm({ ...userForm, first_name: e.target.value })}
            />
            <Input
              label="Nom"
              required
              value={userForm.last_name}
              onChange={(e) => setUserForm({ ...userForm, last_name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Identifiant de connexion"
              required
              placeholder="ex. dr.diallo"
              value={userForm.username}
              onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
            />
            <Input
              label="Mot de passe initial"
              type="password"
              required
              placeholder="••••••••••••"
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Adresse e-mail"
              type="email"
              placeholder="ex. diallo@hopital.sn"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
            />
            <Input
              label="Numéro de téléphone"
              placeholder="77 123 45 67"
              value={userForm.phone_number}
              onChange={(e) => setUserForm({ ...userForm, phone_number: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Rôle"
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value as Role })}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>

            <Select
              label="Établissement rattaché"
              value={userForm.facility_id || ''}
              onChange={(e) =>
                setUserForm({
                  ...userForm,
                  facility_id: e.target.value ? parseInt(e.target.value, 10) : null,
                })
              }
            >
              <option value="">Aucun établissement</option>
              {facilities.map((fac) => (
                <option key={fac.id} value={fac.id}>
                  {fac.name} ({fac.city})
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  )
}
