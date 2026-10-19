import React from 'react'
import { Search } from 'lucide-react'
import { Input, Select } from '@/components/ui/Input'
import { BED_CATEGORIES, REGIONS } from '@/lib/constants'

interface BedFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  category: string
  onCategoryChange: (value: string) => void
  region: string
  onRegionChange: (value: string) => void
}

/** Recherche et filtres (service, région) de « Trouver un lit ». */
export const BedFilters: React.FC<BedFiltersProps> = ({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  region,
  onRegionChange,
}) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <div className="relative">
      <Input
        label="Recherche"
        type="search"
        placeholder="Hôpital, ville, service…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="pl-7"
      />
      <Search className="pointer-events-none absolute bottom-2.5 left-2.5 h-3.5 w-3.5 text-subtle" aria-hidden="true" />
    </div>
    <Select label="Service" value={category} onChange={(e) => onCategoryChange(e.target.value)}>
      <option value="">Tous</option>
      {BED_CATEGORIES.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
          {c.vital ? ' — vital' : ''}
        </option>
      ))}
    </Select>
    <Select label="Région" value={region} onChange={(e) => onRegionChange(e.target.value)}>
      <option value="">Toutes</option>
      {REGIONS.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </Select>
  </div>
)
