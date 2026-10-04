import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Phone,
  MapPin,
  Shield,
  RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
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
  const {
    data: facilities = [],
    isLoading: isLoadingFacilities,
    isRefetching: isRefetchingFacilities,
    refetch: refetchFacilities,
  } = useQuery<Facility[]>({
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
  const {
    data: users = [],
    isLoading: isLoadingUsers,
    isRefetching: isRefetchingUsers,
    refetch: refetchUsers,
  } = useQuery<AdminUser[]>({
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
      setUserError(err instanceof Error ? err.message : 'Erreur lors de la création de l’utilisateur')
    },
  })

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--border-main)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
              <Shield className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              Administration Système
            </span>
            <span className="text-xs text-[var(--text-muted)]">• Répertoire National</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)]">
            Établissements de Santé & Comptes
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Gestion du maillage territorial des structures sanitaires et des habilitations professionnelles
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (activeTab === 'facilities') refetchFacilities()
              else refetchUsers()
            }}
            isLoading={isRefetchingFacilities || isRefetchingUsers}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Actualiser
          </Button>

          {isAdmin && activeTab === 'facilities' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsFacilityModalOpen(true)}
              icon={<Plus className="w-4 h-4" />}
            >
              Nouvel Établissement
            </Button>
          )}

          {isAdmin && activeTab === 'users' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsUserModalOpen(true)}
              icon={<Plus className="w-4 h-4" />}
            >
              Créer un Compte
            </Button>
          )}
        </div>
      </div>

      {/* Onglets Établissements vs Utilisateurs */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-[var(--border-main)] pb-2">
          <button
            onClick={() => setActiveTab('facilities')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'facilities'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            Structures Sanitaires ({facilities.length})
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === 'users'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            Utilisateurs & Accès ({users.length})
          </button>
        </div>

        {activeTab === 'facilities' ? (
          /* Section Établissements */
          <div className="space-y-4">
            <div className="clinical-card p-4">
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoadingFacilities ? (
                <div className="clinical-card p-12 text-center text-xs text-[var(--text-muted)] col-span-3">
                  Chargement des établissements...
                </div>
              ) : facilities.length === 0 ? (
                <div className="clinical-card p-12 text-center text-xs text-[var(--text-muted)] col-span-3">
                  Aucun établissement trouvé.
                </div>
              ) : (
                facilities.map((fac) => (
                  <div key={fac.id} className="clinical-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-sm text-[var(--text-main)]">{fac.name}</h4>
                        <span className="text-[11px] text-sky-600 dark:text-sky-400 font-medium">
                          {fac.facility_type_display}
                        </span>
                      </div>
                      <Badge tone={fac.is_active ? 'success' : 'neutral'} size="sm">
                        {fac.is_active ? 'Actif' : 'Désactivé'}
                      </Badge>
                    </div>

                    <div className="text-xs space-y-1.5 text-[var(--text-muted)] border-t border-[var(--border-main)] pt-2.5">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {fac.city} ({fac.region_display})
                        </span>
                      </div>
                      {fac.address && <div className="text-[11px] truncate">« {fac.address} »</div>}
                      {fac.phone_number && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <a
                            href={`tel:${fac.phone_number}`}
                            className="text-red-600 dark:text-red-400 font-semibold hover:underline"
                          >
                            {fac.phone_number}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Section Utilisateurs */
          <div className="space-y-4">
            <div className="clinical-card p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Rechercher un compte"
                  placeholder="Nom, identifiant ou téléphone..."
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
            </div>

            <div className="clinical-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="clinical-table">
                  <thead>
                    <tr>
                      <th>Utilisateur</th>
                      <th>Identifiant</th>
                      <th>Rôle</th>
                      <th>Établissement</th>
                      <th>Téléphone</th>
                      <th>Création</th>
                      <th className="text-right">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingUsers ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                          Chargement des utilisateurs...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                          Aucun utilisateur trouvé.
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <tr key={u.id}>
                          <td className="font-semibold text-[var(--text-main)]">{u.full_name}</td>
                          <td className="text-[var(--text-muted)] font-mono text-xs">{u.username}</td>
                          <td>
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
                          <td className="text-[var(--text-main)]">
                            {u.facility ? u.facility.name : '—'}
                          </td>
                          <td className="text-[var(--text-muted)] font-mono">{u.phone_number || '—'}</td>
                          <td className="text-[var(--text-muted)]">{formatDateTime(u.date_joined)}</td>
                          <td className="text-right">
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
      </div>

      {/* Modale d'ajout d'établissement */}
      <Modal
        isOpen={isFacilityModalOpen}
        onClose={() => setIsFacilityModalOpen(false)}
        title="Création d'une Structure Sanitaire"
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
        title="Création d'un Compte Hospitalier / SAMU"
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
              label="Identifiant"
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
