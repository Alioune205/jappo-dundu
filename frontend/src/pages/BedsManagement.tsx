import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bed,
  Activity,
  AlertTriangle,
  Compass,
  Edit2,
  Phone,
  Search,
  Building2,
  MapPin,
  RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { BED_CATEGORIES, REGIONS } from '@/lib/constants'
import { formatPercent, formatDateTime, formatDistance } from '@/lib/format'
import type { BedCapacity, BedCategory, NearbyBedFacility } from '@/types/api'

export const BedsManagement: React.FC = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Filtres
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedRegion, setSelectedRegion] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Recherche d'établissements proches avec lits libres (PostGIS)
  const [searchCategory, setSearchCategory] = useState<BedCategory>('emergency')
  const [searchRadius, setSearchRadius] = useState<number>(50)
  const [minAvailable, setMinAvailable] = useState<number>(1)
  const [searchResult, setSearchResult] = useState<NearbyBedFacility[] | null>(null)
  const [isSearching, setIsSearching] = useState<boolean>(false)

  // Modale de modification de capacité
  const [editingCapacity, setEditingCapacity] = useState<BedCapacity | null>(null)
  const [totalBedsInput, setTotalBedsInput] = useState<number>(0)
  const [occupiedBedsInput, setOccupiedBedsInput] = useState<number>(0)

  // 1. Liste des capacités de lits
  const {
    data: capacities = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<BedCapacity[]>({
    queryKey: ['bed-capacities', selectedCategory, selectedRegion],
    queryFn: async () => {
      const res = await api.get<{ results: BedCapacity[] }>('/api/lits/capacities/', {
        category: selectedCategory || undefined,
        region: selectedRegion || undefined,
      })
      return res.results || []
    },
  })

  // Mutation : Admission (+1 lit)
  const admitMutation = useMutation({
    mutationFn: (id: number) => api.post<BedCapacity>(`/api/lits/capacities/${id}/admit/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bed-capacities'] })
      queryClient.invalidateQueries({ queryKey: ['beds-summary'] })
    },
  })

  // Mutation : Décharge (-1 lit)
  const dischargeMutation = useMutation({
    mutationFn: (id: number) => api.post<BedCapacity>(`/api/lits/capacities/${id}/discharge/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bed-capacities'] })
      queryClient.invalidateQueries({ queryKey: ['beds-summary'] })
    },
  })

  // Mutation : Mise à jour manuelle
  const updateMutation = useMutation({
    mutationFn: ({ id, total, occupied }: { id: number; total: number; occupied: number }) =>
      api.patch<BedCapacity>(`/api/lits/capacities/${id}/`, {
        total_beds: total,
        occupied_beds: occupied,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bed-capacities'] })
      queryClient.invalidateQueries({ queryKey: ['beds-summary'] })
      setEditingCapacity(null)
    },
  })

  // Recherche de lits libres à proximité via PostGIS
  const handleFindNearest = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSearching(true)
    try {
      const lat = user?.facility?.latitude || 14.6928
      const lng = user?.facility?.longitude || -17.4467

      const res = await api.get<NearbyBedFacility[]>('/api/lits/capacities/nearest/', {
        latitude: lat,
        longitude: lng,
        category: searchCategory,
        radius_km: searchRadius,
        min_available: minAvailable,
      })
      setSearchResult(res || [])
    } catch (err) {
      console.error('Erreur recherche lits libres:', err)
      setSearchResult([])
    } finally {
      setIsSearching(false)
    }
  }

  // Filtrage local additionnel (par nom d'établissement ou de ville)
  const filteredCapacities = useMemo(() => {
    if (!searchQuery.trim()) return capacities
    const q = searchQuery.toLowerCase()
    return capacities.filter(
      (c) =>
        c.facility?.name?.toLowerCase().includes(q) ||
        c.facility?.city?.toLowerCase().includes(q) ||
        c.category_display?.toLowerCase().includes(q)
    )
  }, [capacities, searchQuery])

  // Statistiques agrégées
  const stats = useMemo(() => {
    const totalBeds = capacities.reduce((acc, c) => acc + c.total_beds, 0)
    const occupiedBeds = capacities.reduce((acc, c) => acc + c.occupied_beds, 0)
    const availableBeds = capacities.reduce((acc, c) => acc + c.available_beds, 0)
    const globalRate = totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0

    const reaBeds = capacities
      .filter((c) => c.category === 'intensive_care')
      .reduce((acc, c) => acc + c.available_beds, 0)

    const urgBeds = capacities
      .filter((c) => c.category === 'emergency')
      .reduce((acc, c) => acc + c.available_beds, 0)

    const saturatedCount = capacities.filter((c) => c.available_beds === 0).length

    return { totalBeds, occupiedBeds, availableBeds, globalRate, reaBeds, urgBeds, saturatedCount }
  }, [capacities])

  return (
    <div className="space-y-6">
      {/* En-tête institutionnel & Régulation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--border-main)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-900">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
              SAMU 15 & Régulation Hospitalière
            </span>
            <span className="text-xs text-[var(--text-muted)]">• Disponibilité Nationale</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-main)]">
            Gestion & Orientation des Lits
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Supervision temps réel des capacités d'accueil hospitalières, admissions d'urgence et transferts inter-établissements
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            isLoading={isRefetching}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Actualiser
          </Button>
        </div>
      </div>

      {/* Cartes KPI de régulation des lits */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="clinical-card p-4">
          <div className="flex items-center justify-between text-[var(--text-muted)] mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Réanimation Libres</span>
            <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400 font-mono">
            {stats.reaBeds}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">Soins intensifs & réa vitaux</p>
        </div>

        <div className="clinical-card p-4">
          <div className="flex items-center justify-between text-[var(--text-muted)] mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Urgences Libres</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Bed className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            {stats.urgBeds}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">Accueil immédiat disponible</p>
        </div>

        <div className="clinical-card p-4">
          <div className="flex items-center justify-between text-[var(--text-muted)] mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Taux d'Occupation</span>
            <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[var(--text-main)] font-mono">
            {stats.globalRate.toFixed(1)}%
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            {stats.occupiedBeds} occupés / {stats.totalBeds} installés
          </p>
        </div>

        <div className="clinical-card p-4">
          <div className="flex items-center justify-between text-[var(--text-muted)] mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Services Saturés</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono">
            {stats.saturatedCount}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">Services à 100% de saturation</p>
        </div>
      </div>

      {/* Barre de recherche et filtres rapides */}
      <div className="clinical-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Recherche rapide
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ex. Hôpital Principal, CHU Fann..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="clinical-input pl-8"
              />
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <Select
            label="Service / Spécialité"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="">Tous les services</option>
            {BED_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label} {c.vital ? '(Vital)' : ''}
              </option>
            ))}
          </Select>

          <Select
            label="Région sanitaire"
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
          >
            <option value="">Toutes les régions</option>
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Disposition principale : Grille des capacités + Panneau PostGIS d'orientation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des capacités des services (2 colonnes) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Services Hospitaliers ({filteredCapacities.length})
            </h2>
          </div>

          {isLoading ? (
            <div className="clinical-card p-12 text-center text-xs text-[var(--text-muted)]">
              Chargement des capacités hospitalières en temps réel...
            </div>
          ) : filteredCapacities.length === 0 ? (
            <div className="clinical-card p-12 text-center text-xs text-[var(--text-muted)]">
              Aucun service ne correspond aux critères sélectionnés.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCapacities.map((cap) => {
                const isSaturated = cap.available_beds === 0
                const isHighOccupancy = cap.occupancy_rate > 0.85

                return (
                  <div
                    key={cap.id}
                    className={`clinical-card p-5 relative overflow-hidden transition-all duration-200 ${
                      isSaturated
                        ? 'border-l-4 border-l-red-500'
                        : isHighOccupancy
                        ? 'border-l-4 border-l-amber-500'
                        : 'border-l-4 border-l-emerald-500'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="font-bold text-sm text-[var(--text-main)] flex items-center gap-1.5">
                          {cap.category_display}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{cap.facility?.name}</span>
                          <span>•</span>
                          <span>{cap.facility?.city}</span>
                        </div>
                      </div>

                      <Badge
                        tone={isSaturated ? 'danger' : isHighOccupancy ? 'warning' : 'success'}
                        size="sm"
                      >
                        {isSaturated ? 'Saturé' : `${formatPercent(cap.occupancy_rate)}`}
                      </Badge>
                    </div>

                    {/* Jauge visuelle de taux d'occupation */}
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mb-3">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isSaturated
                            ? 'bg-red-500'
                            : isHighOccupancy
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.round(cap.occupancy_rate * 100))}%` }}
                      />
                    </div>

                    {/* Chiffres clés */}
                    <div className="flex items-center justify-between text-xs py-2 border-t border-b border-[var(--border-main)] mb-3 bg-[var(--bg-subtle)] px-3 rounded-lg">
                      <div>
                        <span className="text-[10px] text-[var(--text-muted)] block uppercase font-semibold">
                          Lits Disponibles
                        </span>
                        <span
                          className={`text-lg font-bold font-mono ${
                            cap.available_beds > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {cap.available_beds}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-[var(--text-muted)] block uppercase font-semibold">
                          Occupés / Total
                        </span>
                        <span className="text-lg font-bold text-[var(--text-main)] font-mono">
                          {cap.occupied_beds} <span className="text-xs font-normal text-[var(--text-muted)]">/ {cap.total_beds}</span>
                        </span>
                      </div>
                    </div>

                    {/* Actions d'admission et de décharge directes */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 text-xs"
                        disabled={cap.available_beds === 0}
                        isLoading={admitMutation.isPending}
                        onClick={() => admitMutation.mutate(cap.id)}
                      >
                        + 1 Admission
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 text-xs"
                        disabled={cap.occupied_beds === 0}
                        isLoading={dischargeMutation.isPending}
                        onClick={() => dischargeMutation.mutate(cap.id)}
                      >
                        - 1 Sortie
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="px-2.5"
                        title="Ajuster la capacité manuellement"
                        onClick={() => {
                          setEditingCapacity(cap)
                          setTotalBedsInput(cap.total_beds)
                          setOccupiedBedsInput(cap.occupied_beds)
                        }}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    <div className="text-[10px] text-[var(--text-muted)] mt-2 text-right">
                      Dernière MàJ : {formatDateTime(cap.updated_at)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Panneau latéral : Orientation PostGIS & Recherche d'hôpitaux les plus proches */}
        <div className="space-y-4">
          <div className="clinical-card p-5 space-y-4">
            <div className="border-b border-[var(--border-main)] pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Compass className="w-4 h-4 text-red-600 dark:text-red-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-main)]">
                  Orientation PostGIS d'Urgence
                </h3>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Localisez immédiatement les hôpitaux les plus proches disposant de lits libres (calcul géodésique précis)
              </p>
            </div>

            <form onSubmit={handleFindNearest} className="space-y-3">
              <Select
                label="Spécialité requise"
                value={searchCategory}
                onChange={(e) => setSearchCategory(e.target.value as BedCategory)}
              >
                {BED_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label} {c.vital ? '(Vital)' : ''}
                  </option>
                ))}
              </Select>

              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Rayon max (km)"
                  type="number"
                  min={5}
                  max={200}
                  value={searchRadius}
                  onChange={(e) => setSearchRadius(parseInt(e.target.value, 10) || 50)}
                />
                <Input
                  label="Lits min requis"
                  type="number"
                  min={1}
                  max={50}
                  value={minAvailable}
                  onChange={(e) => setMinAvailable(parseInt(e.target.value, 10) || 1)}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full mt-2"
                isLoading={isSearching}
                icon={<Compass className="w-4 h-4" />}
              >
                Localiser Établissements Proches
              </Button>
            </form>

            {/* Résultats de l'orientation PostGIS */}
            {searchResult !== null && (
              <div className="space-y-2 pt-3 border-t border-[var(--border-main)]">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Hôpitaux compatibles ({searchResult.length})
                  </h4>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Calculé en temps réel
                  </span>
                </div>

                {searchResult.length === 0 ? (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-center text-xs text-amber-800 dark:text-amber-200">
                    Aucun lit disponible répertorié dans ce rayon géographique. Élargissez le rayon de recherche.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {searchResult.map((facility) => (
                      <div
                        key={facility.id}
                        className="p-3 bg-[var(--bg-subtle)] border border-[var(--border-main)] rounded-xl text-xs flex items-center justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-bold text-[var(--text-main)] truncate">
                            {facility.name}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span>{facility.city}</span>
                            <span>•</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {formatDistance(facility.distance_km)}
                            </span>
                          </div>
                          {facility.phone_number && (
                            <a
                              href={`tel:${facility.phone_number}`}
                              className="text-[11px] text-red-600 dark:text-red-400 font-semibold flex items-center gap-1 mt-1 hover:underline"
                            >
                              <Phone className="w-3 h-3" />
                              {facility.phone_number}
                            </a>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <Badge tone="success" size="sm">
                            {facility.available_beds} lits libres
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modale de modification manuelle de capacité */}
      <Modal
        isOpen={!!editingCapacity}
        onClose={() => setEditingCapacity(null)}
        title="Ajustement de Capacité Hospitalière"
        description={
          editingCapacity
            ? `${editingCapacity.category_display} • ${editingCapacity.facility?.name}`
            : ''
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingCapacity(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!editingCapacity) return
                updateMutation.mutate({
                  id: editingCapacity.id,
                  total: totalBedsInput,
                  occupied: occupiedBedsInput,
                })
              }}
              isLoading={updateMutation.isPending}
            >
              Valider les modifications
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Total de lits opérationnels installés"
            type="number"
            min={1}
            value={totalBedsInput}
            onChange={(e) => setTotalBedsInput(parseInt(e.target.value, 10) || 1)}
          />

          <Input
            label="Lits actuellement occupés par des patients"
            type="number"
            min={0}
            max={totalBedsInput}
            value={occupiedBedsInput}
            onChange={(e) => setOccupiedBedsInput(parseInt(e.target.value, 10) || 0)}
          />

          <div className="p-3 bg-[var(--bg-subtle)] rounded-lg text-xs text-[var(--text-muted)]">
            Lits disponibles calculés :{' '}
            <strong className="text-[var(--text-main)] font-mono">
              {Math.max(0, totalBedsInput - occupiedBedsInput)}
            </strong>
          </div>
        </div>
      </Modal>
    </div>
  )
}
