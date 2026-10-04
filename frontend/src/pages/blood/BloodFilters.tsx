import React from 'react'
import { Select } from '@/components/ui/Input'
import { BLOOD_GROUPS, REGIONS, URGENCIES } from '@/lib/constants'
import type { BloodFilterValues } from './bloodStats'

interface BloodFiltersProps {
  value: BloodFilterValues
  onChange: (value: BloodFilterValues) => void
}

/** Filtres serveur de la liste des demandes. */
export const BloodFilters: React.FC<BloodFiltersProps> = ({ value, onChange }) => {
  const set = (patch: Partial<BloodFilterValues>) => onChange({ ...value, ...patch })

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Select label="Statut" value={value.status} onChange={(e) => set({ status: e.target.value })}>
        <option value="">Tous</option>
        <option value="open">Ouvertes</option>
        <option value="fulfilled">Satisfaites</option>
        <option value="cancelled">Annulées</option>
      </Select>
      <Select label="Groupe sanguin" value={value.bloodGroup} onChange={(e) => set({ bloodGroup: e.target.value })}>
        <option value="">Tous</option>
        {BLOOD_GROUPS.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </Select>
      <Select label="Urgence" value={value.urgency} onChange={(e) => set({ urgency: e.target.value })}>
        <option value="">Toutes</option>
        {URGENCIES.map((u) => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
      </Select>
      <Select label="Région" value={value.region} onChange={(e) => set({ region: e.target.value })}>
        <option value="">Toutes</option>
        {REGIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>
    </div>
  )
}
