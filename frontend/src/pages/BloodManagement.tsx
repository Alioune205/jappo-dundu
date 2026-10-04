import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Phone,
  UserCheck,
  RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { StatCard } from '@/components/ui/StatCard'
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
  const {
    data: requests = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<BloodRequest[]>({
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

  // 2. Donneurs compatibles suggérés pour la demande sélectionnée (PostGIS KNN)
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
      alert('Don enregistré avec succès ! Le profil du donneur a été mis à jour.')
      setLookedUpDonor(null)
      setLookupPhone('')
    },
    onError: (err: unknown) => {
      alert(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement du don')
    },
  })

  // Statistiques agrégées
  const stats = useMemo(() => {
    const totalOpen = requests.filter((r) => r.status === 'open').length
    const criticalCount = requests.filter((r) => r.status === 'open' && r.urgency === 'critical').length
    const totalUnitsNeeded = requests
      .filter((r) => r.status === 'open')
      .reduce((acc, r) => acc + r.units_remaining, 0)
    const fulfilledCount = requests.filter((r) => r.status === 'fulfilled').length
    return { totalOpen, criticalCount, totalUnitsNeeded, fulfilledCount }
  }, [requests])

  return (
    <div className="space-y-6">
      {/* En-tête institutionnel CNTS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-main)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              CNTS & Banques de Sang Régionales
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              Coordination Transfusionnelle Active
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Banque de Sang & Urgences Transfusionnelles
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Gestion des demandes de poches, appariement géodésique PostGIS de donneurs compatibles et mobilisation d'urgence.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            isLoading={isRefetching}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Actualiser
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            Nouvelle Demande
          </Button>
        </div>
      </div>

      {/* Cartes KPI d'urgence transfusionnelle (Standard Linear/Stripe) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Demandes Actives"
          value={stats.totalOpen}
          unit="demandes en cours"
          trend={`${stats.totalUnitsNeeded} poches requises`}
          trendTone="neutral"
          description="Besoins déclarés par les hôpitaux"
        />

        <StatCard
          title="Urgences Vitales P1"
          value={stats.criticalCount}
          unit="immédiat"
          badge={stats.criticalCount > 0 ? `${stats.criticalCount} critiques` : undefined}
          badgeTone={stats.criticalCount > 0 ? 'danger' : 'neutral'}
          trend={stats.criticalCount > 0 ? 'Mobilisation donneurs O-/A- urgente' : 'Aucune urgence absolue'}
          trendTone={stats.criticalCount > 0 ? 'danger' : 'success'}
          description="Menace vitale immédiate"
        />

        <StatCard
          title="Volume de Poches Requis"
          value={stats.totalUnitsNeeded}
          unit="unités"
          trend="En attente de délivrance"
          trendTone="neutral"
          description="Besoins cumulés des services"
        />

        <StatCard
          title="Demandes Clôturées"
          value={stats.fulfilledCount}
          unit="délivrées"
          trend="Dons et transferts finalisés"
          trendTone="success"
          description="Collectes & transfusions réussies"
        />
      </div>

      {/* Barre de Filtres */}
      <div className="clinical-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select
            label="Statut"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Tous les statuts</option>
            <option value="open">Ouvertes (actives)</option>
            <option value="fulfilled">Satisfaites (terminées)</option>
            <option value="cancelled">Annulées</option>
          </Select>

          <Select
            label="Groupe Sanguin"
            value={bloodGroupFilter}
            onChange={(e) => setBloodGroupFilter(e.target.value)}
          >
            <option value="">Tous les 8 groupes</option>
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
            label="Région sanitaire"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
          >
            <option value="">Toutes les 14 régions</option>
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Disposition principale : Liste + Panneau latéral de détails */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des demandes (2 colonnes) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Demandes Transfusionnelles ({requests.length})
            </h2>
          </div>

          {isLoading ? (
            <div className="clinical-card p-12 text-center text-xs text-[var(--text-muted)]">
              Chargement des demandes de sang en temps réel...
            </div>
          ) : requests.length === 0 ? (
            <div className="clinical-card p-12 text-center text-xs text-[var(--text-muted)]">
              Aucune demande ne correspond à ces critères.
            </div>
          ) : (
            requests.map((req) => {
              const isSelected = selectedRequest?.id === req.id
              const isCritical = req.urgency === 'critical'
              const isUrgent = req.urgency === 'urgent'

              return (
                <div
                  key={req.id}
                  onClick={() => setSelectedRequest(req)}
                  className={`clinical-card p-4 transition-all duration-200 cursor-pointer flex items-center justify-between gap-4 ${
                    isSelected
                      ? 'ring-2 ring-red-500 bg-red-50/20 dark:bg-red-950/20'
                      : 'hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 font-mono font-bold text-base flex items-center justify-center shrink-0">
                      {req.blood_group}
                    </span>

                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--text-main)] truncate">
                          {req.facility?.name}
                        </span>
                        <Badge
                          tone={isCritical ? 'danger' : isUrgent ? 'warning' : 'info'}
                          size="sm"
                        >
                          {req.urgency_display}
                        </Badge>
                      </div>

                      <div className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-3">
                        <span>
                          Requis : <strong className="text-[var(--text-main)]">{req.units_needed} poches</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Manquantes :{' '}
                          <strong
                            className={
                              req.units_remaining > 0
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-emerald-600 dark:text-emerald-400'
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
                    <div className="text-[10px] text-[var(--text-muted)] mt-1">
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
            <div className="clinical-card p-5 sticky top-20 space-y-4">
              <div className="pb-3 border-b border-[var(--border-main)] flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-[var(--text-main)]">
                      Demande #{selectedRequest.id}
                    </span>
                    <Badge tone="brand">{selectedRequest.blood_group}</Badge>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {selectedRequest.facility?.name} • {selectedRequest.facility?.city}
                  </p>
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
              </div>

              {/* Statuts et compteurs */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-main)]">
                  <span className="text-[var(--text-muted)] text-[10px] uppercase font-semibold block">
                    Poches collectées
                  </span>
                  <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                    {selectedRequest.units_collected} / {selectedRequest.units_needed}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-main)]">
                  <span className="text-[var(--text-muted)] text-[10px] uppercase font-semibold block">
                    Rayon de recherche
                  </span>
                  <div className="text-base font-bold text-[var(--text-main)] font-mono mt-0.5">
                    {selectedRequest.search_radius_km} km
                  </div>
                </div>
              </div>

              {selectedRequest.notes && (
                <div className="p-3 rounded-lg bg-[var(--bg-subtle)] text-xs text-[var(--text-main)] italic border-l-2 border-red-500">
                  « {selectedRequest.notes} »
                </div>
              )}

              {/* Donneurs compatibles proches (PostGIS KNN) */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Donneurs Proches ({matches.length})
                  </h4>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Calculé PostGIS
                  </span>
                </div>

                {isLoadingMatches ? (
                  <div className="text-xs text-[var(--text-muted)] text-center py-4">
                    Recherche des profils compatibles...
                  </div>
                ) : matches.length === 0 ? (
                  <div className="text-xs text-[var(--text-muted)] p-3 bg-[var(--bg-subtle)] rounded-lg text-center">
                    Aucun donneur disponible dans ce rayon géographique.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {matches.map((m) => (
                      <div
                        key={m.donor_id}
                        className="p-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-main)] text-xs flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 font-mono font-bold flex items-center justify-center text-xs">
                            {m.blood_group}
                          </span>
                          <span className="font-medium text-[var(--text-main)]">
                            Donneur #{m.donor_id}
                          </span>
                        </div>
                        <span className="text-[var(--text-muted)] font-mono">
                          {formatDistance(m.distance_km)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Réponses reçues des donneurs */}
              <div className="space-y-3 pt-2 border-t border-[var(--border-main)]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Réponses des Donneurs ({responses.length})
                </h4>

                {isLoadingResponses ? (
                  <div className="text-xs text-[var(--text-muted)] text-center py-4">
                    Chargement des réponses...
                  </div>
                ) : responses.length === 0 ? (
                  <div className="text-xs text-[var(--text-muted)] p-3 bg-[var(--bg-subtle)] rounded-lg text-center">
                    Aucune réponse enregistrée pour le moment.
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1 text-xs">
                    {responses.map((resp) => (
                      <div
                        key={resp.id}
                        className="p-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-main)] flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-bold text-[var(--text-main)]">
                            {resp.donor.full_name || `Donneur #${resp.donor.id}`}
                          </div>
                          {resp.donor.phone_number && (
                            <a
                              href={`tel:${resp.donor.phone_number}`}
                              className="text-[11px] text-red-600 dark:text-red-400 font-semibold flex items-center gap-1 mt-0.5 hover:underline"
                            >
                              <Phone className="w-3 h-3" />
                              {resp.donor.phone_number}
                            </a>
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
            </div>
          ) : (
            <div className="clinical-card p-8 text-center text-xs text-[var(--text-muted)] border-dashed">
              Sélectionnez une demande dans la liste pour voir les donneurs géolocalisés et gérer les réponses.
            </div>
          )}

          {/* Recherche rapide donneur par téléphone (enregistrement direct de don) */}
          <div className="clinical-card p-5 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-main)]">
                  Enregistrement Rapide de Don
                </h3>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Retrouvez un donneur bénévole par son numéro de téléphone mobile
              </p>
            </div>

            <form onSubmit={handleLookup} className="flex gap-2">
              <Input
                placeholder="77 123 45 67"
                value={lookupPhone}
                onChange={(e) => setLookupPhone(e.target.value)}
              />
              <Button type="submit" variant="secondary" size="md">
                Rechercher
              </Button>
            </form>

            {lookupError && (
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{lookupError}</p>
            )}

            {lookedUpDonor && (
              <div className="p-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-main)] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[var(--text-main)]">{lookedUpDonor.full_name}</span>
                  <Badge tone="brand">{lookedUpDonor.blood_group}</Badge>
                </div>
                <div className="text-[var(--text-muted)] text-[11px]">
                  Dernier don : {formatDate(lookedUpDonor.last_donation_date)}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-main)]">
                  <span
                    className={
                      lookedUpDonor.is_eligible
                        ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                        : 'text-red-600 dark:text-red-400'
                    }
                  >
                    {lookedUpDonor.is_eligible ? '✓ Éligible au don' : '✕ Inéligible temporairement'}
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => recordSpontaneousDonation.mutate(lookedUpDonor.id)}
                    isLoading={recordSpontaneousDonation.isPending}
                  >
                    Valider le Don
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modale de Création d'une Demande de Sang */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Création d'une Demande de Sang d'Urgence"
        description="Une alerte temps réel sera immédiatement diffusée aux donneurs compatibles proches via WebSocket et notification"
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
