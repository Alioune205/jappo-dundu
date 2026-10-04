import React from 'react'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Input'
import { Skeleton, EmptyState } from '@/components/ui/Skeleton'
import { FACILITY_TYPES, REGIONS } from '@/lib/constants'
import type { Facility } from '@/types/api'

interface FacilitiesTableProps {
  facilities: Facility[]
  isLoading: boolean
  region: string
  onRegionChange: (value: string) => void
  type: string
  onTypeChange: (value: string) => void
}

/** Onglet « Établissements » : filtres et tableau. */
export const FacilitiesTable: React.FC<FacilitiesTableProps> = ({
  facilities,
  isLoading,
  region,
  onRegionChange,
  type,
  onTypeChange,
}) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-2/3">
      <Select label="Région" value={region} onChange={(e) => onRegionChange(e.target.value)}>
        <option value="">Toutes</option>
        {REGIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>
      <Select label="Type" value={type} onChange={(e) => onTypeChange(e.target.value)}>
        <option value="">Tous</option>
        {FACILITY_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
    </div>

    {isLoading ? (
      <div className="space-y-2 rounded-md border border-line bg-surface p-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    ) : facilities.length === 0 ? (
      <EmptyState title="Aucun établissement" description="Aucun établissement ne correspond à ces filtres." />
    ) : (
      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="ops-table">
            <thead>
              <tr>
                <th scope="col">Établissement</th>
                <th scope="col">Type</th>
                <th scope="col">Localisation</th>
                <th scope="col">Téléphone</th>
                <th scope="col">État</th>
              </tr>
            </thead>
            <tbody>
              {facilities.map((fac) => (
                <tr key={fac.id}>
                  <td className="w-full max-w-0">
                    <div className="truncate font-medium text-fg">{fac.name}</div>
                    {fac.address && <div className="truncate text-2xs text-muted">{fac.address}</div>}
                  </td>
                  <td className="whitespace-nowrap text-muted">{fac.facility_type_display}</td>
                  <td className="whitespace-nowrap">
                    <span className="text-fg">{fac.city}</span>
                    <span className="text-muted"> · {fac.region_display}</span>
                  </td>
                  <td className="whitespace-nowrap">
                    {fac.phone_number ? (
                      <a href={`tel:${fac.phone_number}`} className="num text-muted hover:text-fg">
                        {fac.phone_number}
                      </a>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td>
                    <Badge tone={fac.is_active ? 'success' : 'neutral'} size="sm">
                      {fac.is_active ? 'Actif' : 'Désactivé'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>
)
