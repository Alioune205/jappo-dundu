import React, { useState } from 'react'
import { Compass, MapPin, Phone } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { BED_CATEGORIES, DAKAR_CENTER } from '@/lib/constants'
import { formatDistance } from '@/lib/format'
import type { BedCategory, NearbyBedFacility } from '@/types/api'

/**
 * Orientation : établissements les plus proches (de l'établissement de
 * l'utilisateur, ou de Dakar) disposant de lits libres dans une spécialité.
 */
export const NearestBedsPanel: React.FC = () => {
  const { user } = useAuth()
  const [category, setCategory] = useState<BedCategory>('emergency')
  const [radius, setRadius] = useState(50)
  const [minAvailable, setMinAvailable] = useState(1)
  const [results, setResults] = useState<NearbyBedFacility[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSearching(true)
    setError(null)
    try {
      const res = await api.get<NearbyBedFacility[]>('/api/lits/capacities/nearest/', {
        latitude: user?.facility?.latitude ?? DAKAR_CENTER[0],
        longitude: user?.facility?.longitude ?? DAKAR_CENTER[1],
        category,
        radius_km: radius,
        min_available: minAvailable,
      })
      setResults(res || [])
    } catch (err) {
      // Une panne n'est pas « aucun lit libre » : on le dit.
      setResults(null)
      setError(err instanceof Error ? err.message : 'Recherche impossible.')
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <aside className="h-fit rounded-md border border-line bg-surface xl:sticky xl:top-0">
      <div className="border-b border-line px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Compass className="h-4 w-4 text-muted" aria-hidden="true" />
          Orientation
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          Établissements les plus proches{user?.facility ? ` de ${user.facility.name}` : ' de Dakar'} disposant de lits libres.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 px-4 py-3">
        <Select label="Spécialité" value={category} onChange={(e) => setCategory(e.target.value as BedCategory)}>
          {BED_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
              {c.vital ? ' — vital' : ''}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Rayon (km)"
            type="number"
            min={5}
            max={200}
            value={radius}
            onChange={(e) => setRadius(parseInt(e.target.value, 10) || 50)}
          />
          <Input
            label="Lits minimum"
            type="number"
            min={1}
            max={50}
            value={minAvailable}
            onChange={(e) => setMinAvailable(parseInt(e.target.value, 10) || 1)}
          />
        </div>
        <Button type="submit" variant="primary" className="w-full" isLoading={isSearching}>
          Rechercher
        </Button>
        {error && <p className="text-xs text-critical">{error}</p>}
      </form>

      {results !== null && (
        <div className="border-t border-line">
          <div className="eyebrow px-4 pb-1 pt-3">
            Résultats <span className="num ml-1 text-fg">{results.length}</span>
          </div>
          {results.length === 0 ? (
            <p className="px-4 pb-4 text-xs text-muted">Aucun lit libre dans ce rayon. Élargissez la recherche.</p>
          ) : (
            <ol className="max-h-80 divide-y divide-line overflow-y-auto">
              {results.map((facility) => (
                <li key={facility.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-fg">{facility.name}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-muted">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {facility.city} · <span className="num">{formatDistance(facility.distance_km)}</span>
                    </div>
                    {facility.phone_number && (
                      <a
                        href={`tel:${facility.phone_number}`}
                        className="num mt-0.5 inline-flex items-center gap-1 text-muted hover:text-fg"
                      >
                        <Phone className="h-3 w-3" aria-hidden="true" />
                        {facility.phone_number}
                      </a>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="num text-base leading-tight text-ok">{facility.available_beds}</div>
                    <div className="text-2xs text-muted">libres</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </aside>
  )
}
