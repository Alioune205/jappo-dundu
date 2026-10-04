import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
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

  // Recherche d'établissements proches avec lits libres
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
  const { data: capacities = [], isLoading } = useQuery<BedCapacity[]>({
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

  // Recherche de lits libres à proximité
  const handleFindNearest = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSearching(true)
    try {
      // Coordonnées de l'établissement courant ou Dakar par défaut
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

  return (
    <div className="space-y-8 animate-fade-in">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-white tracking-tight">
            Gestion & Orientation des Lits
          </h1>
          <p className="text-xs text-ink-400 mt-1">
            Suivi en temps réel des capacités hospitalières, admissions et transferts inter-établissements
          </p>
        </div>
      </div>

      {/* Barre de filtres */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
            label="Région"
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
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des capacités des services (2 colonnes) */}
        <div className="lg:col-span-2 space-y-4">
          {isLoading ? (
            <div className="surface p-12 text-center text-xs text-ink-500">
              Chargement des capacités hospitalières...
            </div>
          ) : capacities.length === 0 ? (
            <div className="surface p-12 text-center text-xs text-ink-500">
              Aucun service répertorié pour ces critères.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {capacities.map((cap) => {
                const isSaturated = cap.available_beds === 0
                const isHighOccupancy = cap.occupancy_rate > 0.85

                return (
                  <Card
                    key={cap.id}
                    className={`relative overflow-hidden border ${
                      isSaturated
                        ? 'border-rose-500/40 bg-rose-500/[0.03]'
                        : isHighOccupancy
                        ? 'border-amber-500/30 bg-amber-500/[0.02]'
                        : 'border-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="font-bold text-sm text-ink-100 flex items-center gap-1.5">
                          {cap.category_display}
                        </div>
                        <div className="text-[11px] text-ink-400 truncate mt-0.5">
                          {cap.facility?.name} • {cap.facility?.city}
                        </div>
                      </div>

                      <Badge
                        tone={isSaturated ? 'danger' : isHighOccupancy ? 'warning' : 'success'}
                        size="sm"
                      >
                        {isSaturated ? 'Saturé' : `${formatPercent(cap.occupancy_rate)} occupé`}
                      </Badge>
                    </div>

                    {/* Jauge visuelle */}
                    <div className="w-full bg-ink-800 h-2 rounded-full overflow-hidden mb-3">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isSaturated
                            ? 'bg-rose-500'
                            : isHighOccupancy
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                        }`}
                        style={{ width: `${Math.min(100, Math.round(cap.occupancy_rate * 100))}%` }}
                      />
                    </div>

                    {/* Chiffres clés */}
                    <div className="flex items-center justify-between text-xs py-2 border-t border-b border-white/[0.06] mb-3">
                      <div>
                        <span className="text-[10px] text-ink-400 block uppercase">Disponibles</span>
                        <span
                          className={`text-base font-bold ${
                            cap.available_beds > 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {cap.available_beds}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-ink-400 block uppercase">Total lits</span>
                        <span className="text-base font-bold text-ink-200">
                          {cap.occupied_beds} / {cap.total_beds}
                        </span>
                      </div>
                    </div>

                    {/* Actions d'admission et de décharge atomiques */}
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
                        className="flex-1 text-xs text-ink-300"
                        disabled={cap.occupied_beds === 0}
                        isLoading={dischargeMutation.isPending}
                        onClick={() => dischargeMutation.mutate(cap.id)}
                      >
                        - 1 Sortie
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="px-2"
                        title="Modifier la capacité"
                        onClick={() => {
                          setEditingCapacity(cap)
                          setTotalBedsInput(cap.total_beds)
                          setOccupiedBedsInput(cap.occupied_beds)
                        }}
                      >
                        ✏️
                      </Button>
                    </div>

                    <div className="text-[10px] text-ink-500 mt-2 text-right">
                      Mis à jour : {formatDateTime(cap.updated_at)}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* Panneau latéral : Orientation des patients & Recherche d'établissements proches */}
        <div className="space-y-6">
          <Card className="space-y-4">
            <CardHeader className="pb-2 border-b border-white/[0.08]">
              <div>
                <CardTitle className="text-sm">Orientation & Transfert d'Urgence</CardTitle>
                <CardDescription>
                  Localisez les hôpitaux les plus proches avec lits libres (calcul PostGIS)
                </CardDescription>
              </div>
            </CardHeader>

            <form onSubmit={handleFindNearest} className="space-y-3">
              <Select
                label="Service recherché"
                value={searchCategory}
                onChange={(e) => setSearchCategory(e.target.value as BedCategory)}
              >
                {BED_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
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
                  label="Lits min"
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
                icon={<span>🧭</span>}
              >
                Trouver un Établissement
              </Button>
            </form>

            {/* Résultats de la recherche de proximité */}
            {searchResult !== null && (
              <div className="space-y-2 pt-3 border-t border-white/[0.08]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-300">
                  Résultats trouvés ({searchResult.length})
                </h4>

                {searchResult.length === 0 ? (
                  <div className="p-4 bg-ink-850 rounded-xl text-center text-xs text-rose-300">
                    Aucun lit disponible dans ce rayon.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {searchResult.map((facility) => (
                      <div
                        key={facility.id}
                        className="p-3 bg-ink-850 border border-white/[0.06] rounded-xl text-xs flex items-center justify-between"
                      >
                        <div className="truncate">
                          <div className="font-semibold text-ink-200 truncate">{facility.name}</div>
                          <div className="text-[11px] text-ink-400">
                            {facility.city} • {formatDistance(facility.distance_km)}
                          </div>
                          {facility.phone_number && (
                            <div className="text-[11px] text-sky-400 font-medium">
                              {facility.phone_number}
                            </div>
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
          </Card>
        </div>
      </div>

      {/* Modale de modification manuelle de capacité */}
      <Modal
        isOpen={!!editingCapacity}
        onClose={() => setEditingCapacity(null)}
        title="Modifier la Capacité du Service"
        description={editingCapacity ? `${editingCapacity.category_display} - ${editingCapacity.facility?.name}` : ''}
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
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Total de lits installés"
            type="number"
            min={1}
            value={totalBedsInput}
            onChange={(e) => setTotalBedsInput(parseInt(e.target.value, 10) || 1)}
          />

          <Input
            label="Lits occupés actuels"
            type="number"
            min={0}
            max={totalBedsInput}
            value={occupiedBedsInput}
            onChange={(e) => setOccupiedBedsInput(parseInt(e.target.value, 10) || 0)}
          />
        </div>
      </Modal>
    </div>
  )
}
