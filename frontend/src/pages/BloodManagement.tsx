import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { BLOOD_GROUPS, REGIONS, URGENCIES } from '@/lib/constants'
import { formatDateTime, formatDate, formatDistance } from '@/lib/format'
import type {
  BloodRequest,
  BloodRequestInput,
  DonorMatch,
  DonorResponse,
  DonorLookup,
  BloodGroup,
  Urgency,
} from '@/types/api'

export const BloodManagement: React.FC = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Filtres
  const [statusFilter, setStatusFilter] = useState<string>('open')
  const [bloodGroupFilter, setBloodGroupFilter] = useState<string>('')
  const [urgencyFilter, setUrgencyFilter] = useState<string>('')
  const [regionFilter, setRegionFilter] = useState<string>('')

  // Modale de création
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<BloodRequestInput>({
    blood_group: 'O+',
    units_needed: 2,
    urgency: 'urgent',
    notes: '',
    needed_by: null,
    search_radius_km: 25,
  })
  const [formError, setFormError] = useState<string | null>(null)

  // Détail d'une demande sélectionnée
  const [selectedRequest, setSelectedRequest] = useState<BloodRequest | null>(null)

  // Recherche de donneur par téléphone
  const [lookupPhone, setLookupPhone] = useState('')
  const [lookedUpDonor, setLookedUpDonor] = useState<DonorLookup | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)

  // 1. Liste des demandes de sang
  const { data: requests = [], isLoading } = useQuery<BloodRequest[]>({
    queryKey: ['blood-requests', statusFilter, bloodGroupFilter, urgencyFilter, regionFilter],
    queryFn: async () => {
      const res = await api.get<{ results: BloodRequest[] }>('/api/sang/requests/', {
        status: statusFilter || undefined,
        blood_group: bloodGroupFilter || undefined,
        urgency: urgencyFilter || undefined,
        region: regionFilter || undefined,
      })
      return res.results || []
    },
  })

  // 2. Donneurs compatibles suggérés pour la demande sélectionnée
  const { data: matches = [], isLoading: isLoadingMatches } = useQuery<DonorMatch[]>({
    queryKey: ['request-matches', selectedRequest?.id],
    queryFn: async () => {
      if (!selectedRequest) return []
      const res = await api.get<DonorMatch[]>(`/api/sang/requests/${selectedRequest.id}/matches/`, {
        limit: 15,
      })
      return res || []
    },
    enabled: !!selectedRequest && selectedRequest.status === 'open',
  })

  // 3. Réponses de donneurs pour la demande sélectionnée
  const { data: responses = [], isLoading: isLoadingResponses } = useQuery<DonorResponse[]>({
    queryKey: ['request-responses', selectedRequest?.id],
    queryFn: async () => {
      if (!selectedRequest) return []
      const res = await api.get<{ results: DonorResponse[] }>(
        `/api/sang/requests/${selectedRequest.id}/responses/`
      )
      return res.results || []
    },
    enabled: !!selectedRequest,
  })

  // Mutation : Créer une demande
  const createMutation = useMutation({
    mutationFn: (data: BloodRequestInput) => api.post<BloodRequest>('/api/sang/requests/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blood-requests'] })
      setIsCreateOpen(false)
      setCreateForm({
        blood_group: 'O+',
        units_needed: 2,
        urgency: 'urgent',
        notes: '',
        needed_by: null,
        search_radius_km: 25,
      })
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de la création')
    },
  })

  // Mutation : Confirmer un don
  const confirmDonationMutation = useMutation({
    mutationFn: ({ reqId, respId }: { reqId: number; respId: number }) =>
      api.post(`/api/sang/requests/${reqId}/responses/${respId}/confirm/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blood-requests'] })
      queryClient.invalidateQueries({ queryKey: ['request-responses'] })
      if (selectedRequest) {
        queryClient.invalidateQueries({ queryKey: ['request-matches', selectedRequest.id] })
      }
    },
  })

  // Mutation : Annuler une demande
  const cancelMutation = useMutation({
    mutationFn: (reqId: number) => api.post(`/api/sang/requests/${reqId}/cancel/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blood-requests'] })
      setSelectedRequest(null)
    },
  })

  // Recherche de donneur
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lookupPhone) return
    setLookupError(null)
    try {
      const data = await api.get<DonorLookup>('/api/sang/donors/lookup/', {
        phone_number: lookupPhone,
      })
      setLookedUpDonor(data)
    } catch {
      setLookupError('Aucun profil donneur trouvé pour ce numéro de téléphone.')
      setLookedUpDonor(null)
    }
  }

  // Enregistrer un don direct pour le donneur trouvé
  const recordSpontaneousDonation = useMutation({
    mutationFn: (donorId: number) =>
      api.post('/api/sang/donations/', {
        donor_id: donorId,
        facility_id: user?.facility?.id,
      }),
    onSuccess: () => {
      alert('Don spontané enregistré avec succès ! Le profil du donneur a été mis à jour.')
      setLookedUpDonor(null)
      setLookupPhone('')
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement du don')
    },
  })

  return (
    <div className="space-y-8 animate-fade-in">
      {/* En-tête de section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white tracking-tight">
            Banque de Sang & Transfusion
          </h1>
          <p className="text-xs text-ink-400 mt-1">
            Gestion des demandes de poches, appariement géographique de donneurs compatibles et dons
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => setIsCreateOpen(true)}
          icon={<span className="text-base">🩸</span>}
        >
          Nouvelle Demande de Sang
        </Button>
      </div>

      {/* Barre de Filtres */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select
            label="Statut de la demande"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tous les statuts</option>
            <option value="open">Ouvertes (en cours)</option>
            <option value="fulfilled">Satisfaites (terminées)</option>
            <option value="cancelled">Annulées</option>
          </Select>

          <Select
            label="Groupe Sanguin"
            value={bloodGroupFilter}
            onChange={(e) => setBloodGroupFilter(e.target.value)}
          >
            <option value="">Tous les groupes</option>
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                Groupe {g}
              </option>
            ))}
          </Select>

          <Select
            label="Niveau d'Urgence"
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
          >
            <option value="">Toutes les urgences</option>
            {URGENCIES.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </Select>

          <Select
            label="Région"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
          >
            <option value="">Toutes les régions</option>
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {/* Disposition principale : Liste + Panneau latéral de détails */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des demandes (2 colonnes) */}
        <div className="lg:col-span-2 space-y-3">
          {isLoading ? (
            <div className="surface p-12 text-center text-xs text-ink-500">
              Chargement des demandes de sang...
            </div>
          ) : requests.length === 0 ? (
            <div className="surface p-12 text-center text-xs text-ink-500">
              Aucune demande ne correspond à ces critères.
            </div>
          ) : (
            requests.map((req) => {
              const isSelected = selectedRequest?.id === req.id
              return (
                <div
                  key={req.id}
                  onClick={() => setSelectedRequest(req)}
                  className={`surface p-4 transition-all duration-200 cursor-pointer flex items-center justify-between gap-4 border ${
                    isSelected
                      ? 'border-brand-500/80 bg-brand-500/[0.05] shadow-brand'
                      : 'hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="w-12 h-12 rounded-2xl bg-brand-600/20 border border-brand-500/40 text-brand-300 font-display font-bold text-base flex items-center justify-center shrink-0">
                      {req.blood_group}
                    </span>

                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-ink-100 truncate">
                          {req.facility?.name}
                        </span>
                        <Badge
                          tone={
                            req.urgency === 'critical'
                              ? 'danger'
                              : req.urgency === 'urgent'
                              ? 'warning'
                              : 'info'
                          }
                          size="sm"
                        >
                          {req.urgency_display}
                        </Badge>
                      </div>

                      <div className="text-xs text-ink-400 mt-1 flex items-center gap-3">
                        <span>
                          Requis : <strong className="text-white">{req.units_needed} poches</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Restant :{' '}
                          <strong
                            className={
                              req.units_remaining > 0 ? 'text-rose-400' : 'text-emerald-400'
                            }
                          >
                            {req.units_remaining}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>{req.facility?.city}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <Badge
                      tone={
                        req.status === 'open'
                          ? 'brand'
                          : req.status === 'fulfilled'
                          ? 'success'
                          : 'neutral'
                      }
                      size="sm"
                    >
                      {req.status_display}
                    </Badge>
                    <div className="text-[10px] text-ink-500 mt-1">
                      {formatDateTime(req.created_at)}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Détail & Actions pour la demande sélectionnée (1 colonne) */}
        <div className="space-y-6">
          {selectedRequest ? (
            <Card className="sticky top-20 space-y-5">
              <CardHeader className="pb-3 border-b border-white/[0.08]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-white">
                      Demande #{selectedRequest.id}
                    </span>
                    <Badge tone="brand">{selectedRequest.blood_group}</Badge>
                  </div>
                  <CardDescription>{selectedRequest.facility?.name}</CardDescription>
                </div>

                {selectedRequest.status === 'open' && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => cancelMutation.mutate(selectedRequest.id)}
                    isLoading={cancelMutation.isPending}
                  >
                    Annuler
                  </Button>
                )}
              </CardHeader>

              {/* Statuts et compteurs */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-ink-850 border border-white/[0.04]">
                  <span className="text-ink-400 text-[10px] uppercase">Poches collectées</span>
                  <div className="text-base font-bold text-emerald-400">
                    {selectedRequest.units_collected} / {selectedRequest.units_needed}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-ink-850 border border-white/[0.04]">
                  <span className="text-ink-400 text-[10px] uppercase">Rayon de recherche</span>
                  <div className="text-base font-bold text-ink-200">
                    {selectedRequest.search_radius_km} km
                  </div>
                </div>
              </div>

              {selectedRequest.notes && (
                <div className="p-3 rounded-xl bg-ink-850 text-xs text-ink-300 italic">
                  « {selectedRequest.notes} »
                </div>
              )}

              {/* Donneurs suggérés compatibles (PostGIS) */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-300">
                    Donneurs compatibles proches ({matches.length})
                  </h4>
                  <span className="text-[10px] text-ink-500">PostGIS KNN</span>
                </div>

                {isLoadingMatches ? (
                  <div className="text-xs text-ink-500 text-center py-4">Recherche...</div>
                ) : matches.length === 0 ? (
                  <div className="text-xs text-ink-500 p-3 bg-ink-850 rounded-xl text-center">
                    Aucun donneur disponible dans un rayon de {selectedRequest.search_radius_km} km.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto divide-y divide-white/[0.04] text-xs">
                    {matches.map((m) => (
                      <div key={m.donor_id} className="py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-ink-800 text-brand-400 font-bold flex items-center justify-center text-[11px]">
                            {m.blood_group}
                          </span>
                          <span className="text-ink-300">Donneur #{m.donor_id}</span>
                        </div>
                        <span className="text-ink-400 text-[11px]">
                          {formatDistance(m.distance_km)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Réponses reçues des donneurs */}
              <div className="space-y-3 pt-2 border-t border-white/[0.08]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-300">
                  Réponses des Donneurs ({responses.length})
                </h4>

                {isLoadingResponses ? (
                  <div className="text-xs text-ink-500 text-center py-4">Chargement...</div>
                ) : responses.length === 0 ? (
                  <div className="text-xs text-ink-500 p-3 bg-ink-850 rounded-xl text-center">
                    Aucune réponse enregistrée pour le moment.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto divide-y divide-white/[0.04] text-xs">
                    {responses.map((resp) => (
                      <div key={resp.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-ink-200">
                            {resp.donor.full_name || `Donneur #${resp.donor.id}`}
                          </div>
                          {resp.donor.phone_number && (
                            <div className="text-[11px] text-sky-400">
                              {resp.donor.phone_number}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge
                            tone={
                              resp.status === 'accepted'
                                ? 'info'
                                : resp.status === 'donated'
                                ? 'success'
                                : 'neutral'
                            }
                            size="sm"
                          >
                            {resp.status_display}
                          </Badge>

                          {resp.status === 'accepted' && (
                            <Button
                              variant="primary"
                              size="sm"
                              className="text-[11px] px-2 py-1"
                              onClick={() =>
                                confirmDonationMutation.mutate({
                                  reqId: selectedRequest.id,
                                  respId: resp.id,
                                })
                              }
                              isLoading={confirmDonationMutation.isPending}
                            >
                              Confirmer Don
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <div className="surface p-8 text-center text-xs text-ink-500 border border-dashed border-white/10 rounded-2xl">
              Sélectionnez une demande dans la liste pour voir les donneurs géolocalisés et gérer les
              réponses.
            </div>
          )}

          {/* Recherche rapide donneur par téléphone (enregistrement direct de don) */}
          <Card className="space-y-4">
            <CardTitle className="text-sm">Enregistrement Rapide de Don</CardTitle>
            <CardDescription>
              Retrouvez un donneur citoyen par son numéro de téléphone
            </CardDescription>

            <form onSubmit={handleLookup} className="flex gap-2">
              <Input
                placeholder="77 123 45 67"
                value={lookupPhone}
                onChange={(e) => setLookupPhone(e.target.value)}
              />
              <Button type="submit" variant="secondary" size="md">
                Chercher
              </Button>
            </form>

            {lookupError && <p className="text-xs text-rose-400">{lookupError}</p>}

            {lookedUpDonor && (
              <div className="p-3 rounded-xl bg-ink-850 border border-white/[0.08] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink-100">{lookedUpDonor.full_name}</span>
                  <Badge tone="brand">{lookedUpDonor.blood_group}</Badge>
                </div>
                <div className="text-ink-400 text-[11px]">
                  Dernier don : {formatDate(lookedUpDonor.last_donation_date)}
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span
                    className={
                      lookedUpDonor.is_eligible ? 'text-emerald-400 font-medium' : 'text-rose-400'
                    }
                  >
                    {lookedUpDonor.is_eligible ? '✓ Éligible au don' : '✕ Inéligible'}
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => recordSpontaneousDonation.mutate(lookedUpDonor.id)}
                    isLoading={recordSpontaneousDonation.isPending}
                  >
                    Enregistrer Don
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Modale de Création d'une Demande de Sang */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Créer une Demande de Sang"
        description="Une alerte temps réel sera immédiatement diffusée aux donneurs compatibles proches"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setFormError(null)
                createMutation.mutate(createForm)
              }}
              isLoading={createMutation.isPending}
            >
              Diffuser l'Alerte
            </Button>
          </>
        }
      >
        {formError && (
          <Alert tone="danger" onClose={() => setFormError(null)}>
            {formError}
          </Alert>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Groupe Sanguin Requis"
              value={createForm.blood_group}
              onChange={(e) =>
                setCreateForm({ ...createForm, blood_group: e.target.value as BloodGroup })
              }
            >
              {BLOOD_GROUPS.map((g) => (
                <option key={g} value={g}>
                  Groupe {g}
                </option>
              ))}
            </Select>

            <Input
              label="Nombre de Poches"
              type="number"
              min={1}
              max={50}
              value={createForm.units_needed}
              onChange={(e) =>
                setCreateForm({ ...createForm, units_needed: parseInt(e.target.value, 10) || 1 })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Niveau d'Urgence"
              value={createForm.urgency}
              onChange={(e) =>
                setCreateForm({ ...createForm, urgency: e.target.value as Urgency })
              }
            >
              {URGENCIES.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>

            <Input
              label="Rayon de Recherche (km)"
              type="number"
              min={1}
              max={200}
              value={createForm.search_radius_km}
              onChange={(e) =>
                setCreateForm({
                  ...createForm,
                  search_radius_km: parseInt(e.target.value, 10) || 20,
                })
              }
            />
          </div>

          <Textarea
            label="Précisions Cliniques (réservé aux soignants)"
            placeholder="ex. Bloc opératoire 2, patient polytraumatisé"
            value={createForm.notes}
            onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
          />
        </div>
      </Modal>
    </div>
  )
}
