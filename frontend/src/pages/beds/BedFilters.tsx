import React from 'react'
import { LayoutGrid, List, Search } from 'lucide-react'
import { Input, Select } from '@/components/ui/Input'
import { BED_CATEGORIES, REGIONS } from '@/lib/constants'

export type BedViewMode = 'table' | 'grid'

interface BedFiltersProps {
  search: string
  onSearchChange: (value: string) => void
  category: string
  onCategoryChange: (value: string) => void
  region: string
  onRegionChange: (value: string) => void
  viewMode: BedViewMode
  onViewModeChange: (mode: BedViewMode) => void
}

const VIEW_MODES = [
  { id: 'table', label: 'Tableau', icon: List },
  { id: 'grid', label: 'Cartes', icon: LayoutGrid },
] as const

/** Recherche locale, filtres serveur (service, région) et choix de l'affichage. */
export const BedFilters: React.FC<BedFiltersProps> = ({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  region,
  onRegionChange,
  viewMode,
  onViewModeChange,
}) => (
  <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
    <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
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

    <div role="radiogroup" aria-label="Affichage" className="flex shrink-0 self-start rounded border border-line p-0.5 lg:self-auto">
      {VIEW_MODES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={viewMode === id}
          onClick={() => onViewModeChange(id)}
          className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors ${
            viewMode === id ? 'bg-raised text-fg' : 'text-muted hover:text-fg'
          }`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  </div>
)
