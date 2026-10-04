import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Compass,
  Edit2,
  Phone,
  Search,
  Building2,
  MapPin,
  RefreshCw,
  LayoutGrid,
  List,
  Plus,
  Minus,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { StatCard } from '@/components/ui/StatCard'
import { BED_CATEGORIES, REGIONS } from '@/lib/constants'
import { formatPercent, formatDateTime, formatDistance } from '@/lib/format'
import type { BedCapacity, BedCategory, NearbyBedFacility } from '@/types/api'

export const BedsManagement: React.FC = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Mode d'affichage : Tableau haute densité (standard médical) vs Grille de cartes
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')

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
      {/* En-tête institutionnel d'autorité médicale */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-main)]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Régulation Médicale & Orientation Hospitalière
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              Veille Opérationnelle Active
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Supervision & Orientation des Lits
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Gestion temps réel des capacités d'accueil, admission directe d'urgence et routage géodésique PostGIS inter-hospitalier.
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
        </div>
      </div>

      {/* 4 Indicateurs de régulation clinique (Standard Linear/Apple Health) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Réanimation Vitale"
          value={stats.reaBeds}
          unit="lits libres"
          trend={stats.reaBeds <= 2 ? 'Tension extrême en réa' : 'Capacité disponible'}
          trendTone={stats.reaBeds <= 2 ? 'danger' : 'success'}
          description="Soins intensifs & déchocage"
          badge={stats.reaBeds === 0 ? 'Alerte 0 Lit' : undefined}
          badgeTone="danger"
        />

        <StatCard
          title="Accueil Urgences"
          value={stats.urgBeds}
          unit="lits disponibles"
          trend={`${stats.availableBeds} lits libres tous services`}
          trendTone="neutral"
          description="SAU & hospitalisation courte durée"
        />

        <StatCard
          title="Taux d'Occupation Réseau"
          value={`${stats.globalRate.toFixed(1)}%`}
          unit={`${stats.occupiedBeds} / ${stats.totalBeds}`}
          trend={`${stats.totalBeds - stats.occupiedBeds} places disponibles`}
          trendTone={stats.globalRate > 85 ? 'danger' : stats.globalRate > 75 ? 'warning' : 'success'}
          progress={{
            value: stats.occupiedBeds,
            max: stats.totalBeds || 1,
            tone: stats.globalRate > 85 ? 'danger' : stats.globalRate > 75 ? 'warning' : 'success',
          }}
          description="Capacité totale installée"
        />

        <StatCard
          title="Services Saturés"
          value={stats.saturatedCount}
          unit={`/ ${capacities.length} services`}
          badge={stats.saturatedCount > 0 ? `${stats.saturatedCount} à 100%` : 'Aucun'}
          badgeTone={stats.saturatedCount > 0 ? 'warning' : 'success'}
          trend={stats.saturatedCount > 0 ? 'Délestage requis' : 'Aucun service bloqué'}
          trendTone={stats.saturatedCount > 0 ? 'warning' : 'success'}
          description="Services à disponibilité nulle"
        />
      </div>

      {/* Barre de commande : Recherche rapide, filtres et sélecteur de vue */}
      <div className="clinical-card p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Filtrer hôpital, ville, service..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="clinical-input pl-8"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>

            <Select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">Tous les services médicaux</option>
              {BED_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label} {c.vital ? '(Vital)' : ''}
                </option>
              ))}
            </Select>

            <Select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
            >
              <option value="">Toutes les régions sanitaires</option>
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Basculeur de mode de vue (Tableau haute densité vs Grille) */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-md self-start lg:self-auto shrink-0 border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="Tableau de régulation haute densité"
            >
              <List className="w-3.5 h-3.5" />
              Tableau
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="Vue cartes de services"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Cartes
            </button>
          </div>
        </div>
      </div>

      {/* Disposition principale : Liste/Table des lits (2 cols) + Panneau d'orientation PostGIS (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne gauche (2 cols) : Tableau ou Grille */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Services Hospitaliers Déclarés ({filteredCapacities.length})
            </h2>
            <span className="text-xs text-slate-400">
              {filteredCapacities.filter((c) => c.available_beds > 0).length} avec lits immédiatement vacants
            </span>
          </div>

          {isLoading ? (
            <div className="clinical-card p-12 text-center text-xs text-slate-500">
              Chargement des capacités hospitalières en temps réel...
            </div>
          ) : filteredCapacities.length === 0 ? (
            <div className="clinical-card p-12 text-center text-xs text-slate-500">
              Aucun service ne correspond aux critères sélectionnés.
            </div>
          ) : viewMode === 'table' ? (
            /* Mode Tableau Haute Densité (Standard Régulation Médicale) */
            <div className="clinical-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="clinical-table">
                  <thead>
                    <tr>
                      <th>Service & Établissement</th>
                      <th>Région</th>
                      <th>Occupation</th>
                      <th className="text-right">Disponibles</th>
                      <th className="text-right">Occupés / Total</th>
                      <th className="text-center">Actions Immédiates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCapacities.map((cap) => {
                      const isSaturated = cap.available_beds === 0
                      const isHigh = cap.occupancy_rate > 0.85
                      const pct = Math.round(cap.occupancy_rate * 100)

                      return (
                        <tr
                          key={cap.id}
                          className={
                            isSaturated
                              ? 'bg-red-50/30 dark:bg-red-950/20'
                              : undefined
                          }
                        >
                          {/* Service & Hôpital */}
                          <td>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {cap.category_display}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              <span>{cap.facility?.name}</span>
                            </div>
                          </td>

                          {/* Région */}
                          <td className="text-slate-600 dark:text-slate-400">
                            {cap.facility?.city}
                          </td>

                          {/* Occupation & Jauge fine */}
                          <td className="w-36">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span
                                className={`font-semibold tabular-nums ${
                                  isSaturated
                                    ? 'text-red-600 dark:text-red-400'
                                    : isHigh
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {pct}%
                              </span>
                              {isSaturated && (
                                <span className="text-[10px] uppercase font-bold text-red-600 dark:text-red-400">
                                  Saturé
                                </span>
                              )}
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  isSaturated
                                    ? 'bg-red-600'
                                    : isHigh
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                          </td>

                          {/* Lits Disponibles */}
                          <td className="text-right">
                            <span
                              className={`text-base font-bold tabular-nums ${
                                cap.available_beds > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {cap.available_beds}
                            </span>
                          </td>

                          {/* Occupés / Total */}
                          <td className="text-right text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {cap.occupied_beds}
                            </span>
                            <span> / {cap.total_beds}</span>
                          </td>

                          {/* Boutons d'action rapides */}
                          <td>
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                disabled={cap.available_beds === 0 || admitMutation.isPending}
                                onClick={() => admitMutation.mutate(cap.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                                title="Enregistrer une admission directe (+1 lit)"
                              >
                                <Plus className="w-3 h-3" />
                                Entrée
                              </button>

                              <button
                                type="button"
                                disabled={cap.occupied_beds === 0 || dischargeMutation.isPending}
                                onClick={() => dischargeMutation.mutate(cap.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                title="Enregistrer une décharge (-1 lit)"
                              >
                                <Minus className="w-3 h-3" />
                                Sortie
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCapacity(cap)
                                  setTotalBedsInput(cap.total_beds)
                                  setOccupiedBedsInput(cap.occupied_beds)
                                }}
                                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                title="Ajuster la capacité globale"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Mode Grille de Cartes (Design Épuré sans bordures de couleur grossières) */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCapacities.map((cap) => {
                const isSaturated = cap.available_beds === 0
                const isHighOccupancy = cap.occupancy_rate > 0.85
                const pct = Math.round(cap.occupancy_rate * 100)

                return (
                  <div
                    key={cap.id}
                    className="clinical-card p-5 relative overflow-hidden transition-all duration-150"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                          {cap.category_display}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 shrink-0 text-slate-400" />
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

                    {/* Jauge fine */}
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mb-3.5">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isSaturated
                            ? 'bg-red-600'
                            : isHighOccupancy
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>

                    {/* Chiffres clés */}
                    <div className="flex items-center justify-between text-xs py-2.5 border-t border-b border-[var(--border-subtle)] mb-3.5 px-2 bg-slate-50/50 dark:bg-slate-800/30 rounded">
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase font-medium">
                          Lits Disponibles
                        </span>
                        <span
                          className={`text-lg font-bold tabular-nums ${
                            cap.available_beds > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {cap.available_beds}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase font-medium">
                          Occupés / Total
                        </span>
                        <span className="text-lg font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                          {cap.occupied_beds}{' '}
                          <span className="text-xs font-normal text-slate-500">
                            / {cap.total_beds}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Actions d'admission et de décharge directes */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1 text-xs"
                        disabled={cap.available_beds === 0}
                        isLoading={admitMutation.isPending}
                        onClick={() => admitMutation.mutate(cap.id)}
                      >
                        + 1 Admission
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs"
                        disabled={cap.occupied_beds === 0}
                        isLoading={dischargeMutation.isPending}
                        onClick={() => dischargeMutation.mutate(cap.id)}
                      >
                        - 1 Sortie
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        title="Ajuster la capacité manuellement"
                        onClick={() => {
                          setEditingCapacity(cap)
                          setTotalBedsInput(cap.total_beds)
                          setOccupiedBedsInput(cap.occupied_beds)
                        }}
                      >
                        <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                      </Button>
                    </div>

                    <div className="text-[10px] text-slate-400 mt-2.5 text-right tabular-nums">
                      MàJ : {formatDateTime(cap.updated_at)}
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
                <Compass className="w-4 h-4 text-slate-900 dark:text-slate-100" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Orientation PostGIS d'Urgence
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Calcul géodésique précis des hôpitaux les plus proches disposant de lits immédiatement disponibles.
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
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Hôpitaux compatibles ({searchResult.length})
                  </h4>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Calculé en temps réel
                  </span>
                </div>

                {searchResult.length === 0 ? (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md text-center text-xs text-slate-600 dark:text-slate-400">
                    Aucun lit disponible répertorié dans ce rayon géographique. Élargissez le rayon de recherche.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {searchResult.map((facility) => (
                      <div
                        key={facility.id}
                        className="p-3 bg-white dark:bg-slate-900 border border-[var(--border-main)] rounded-md text-xs flex items-center justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {facility.name}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                            <span>{facility.city}</span>
                            <span>•</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {formatDistance(facility.distance_km)}
                            </span>
                          </div>
                          {facility.phone_number && (
                            <a
                              href={`tel:${facility.phone_number}`}
                              className="text-[11px] text-slate-900 dark:text-slate-200 font-medium flex items-center gap-1 mt-1 hover:underline"
                            >
                              <Phone className="w-3 h-3 text-slate-400" />
                              {facility.phone_number}
                            </a>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <Badge tone="success" size="sm">
                            {facility.available_beds} libres
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

          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded text-xs text-slate-600 dark:text-slate-400">
            Lits disponibles calculés :{' '}
            <strong className="text-slate-900 dark:text-slate-100 font-semibold tabular-nums">
              {Math.max(0, totalBedsInput - occupiedBedsInput)}
            </strong>
          </div>
        </div>
      </Modal>
    </div>
  )
}
