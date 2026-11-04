import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { canManage } from '@/lib/access'
import { Select } from '@/components/ui/Input'
import { BLOOD_GROUPS, COMPONENTS } from '@/lib/constants'
import { QK } from '@/lib/queryKeys'
import type { BloodComponent, BloodGroup, BloodStock } from '@/types/api'

/**
 * Inventaire de l'établissement : poches disponibles et périmant bientôt, par
 * groupe, pour un produit. Une case modifiée s'enregistre en quittant le champ.
 */
export const StockInventoryPanel: React.FC = () => {
  const { user, roles } = useAuth()
  const facilityId = user?.facility?.id
  const operates = canManage(roles, 'blood')
  const [component, setComponent] = useState<BloodComponent>('red_cells')
  const { data: lines = [] } = useQuery<BloodStock[]>({
    queryKey: [...QK.bloodInventory, facilityId, component],
    queryFn: async () =>
      (await api.get<{ results: BloodStock[] }>('/api/sang/stocks/', { facility: facilityId, component })).results ||
      [],
    enabled: facilityId !== undefined,
  })

  // Saisie de l'inventaire : administrateur du sang de l'établissement. Jamais
  // l'administrateur général (supervision, lecture seule).
  if (facilityId === undefined || !operates) return null
  const byGroup = new Map(lines.map((line) => [line.blood_group, line]))
  const total = lines.reduce((sum, line) => sum + line.units_available, 0)
  const expiring = lines.reduce((sum, line) => sum + line.units_expiring_soon, 0)

  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Boxes className="h-4 w-4 text-brand" aria-hidden="true" />
            Stock de l’établissement
          </h3>
          <p className="text-xs text-muted">
            <span className="num text-fg">{total}</span> poche{total > 1 ? 's' : ''}
            {expiring > 0 && (
              <span className="text-warning">
                {' '}
                · <span className="num">{expiring}</span> périment sous 72 h
              </span>
            )}
          </p>
        </div>
        <Select
          aria-label="Produit"
          value={component}
          onChange={(e) => setComponent(e.target.value as BloodComponent)}
          className="w-auto"
        >
          {COMPONENTS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>
      <table className="w-full text-xs" aria-label="Stock par groupe">
        <thead>
          <tr className="text-left text-muted">
            <th className="px-4 py-2 font-medium">Groupe</th>
            <th className="px-2 py-2 text-right font-medium">Disponibles</th>
            <th className="px-4 py-2 text-right font-medium">Périment sous 72 h</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {BLOOD_GROUPS.map((group) => (
            <StockRow
              key={`${component}-${group}-${byGroup.get(group)?.updated_at ?? 'vide'}`}
              group={group}
              component={component}
              line={byGroup.get(group)}
            />
          ))}
        </tbody>
      </table>
    </section>
  )
}

const StockRow: React.FC<{ group: BloodGroup; component: BloodComponent; line: BloodStock | undefined }> = ({
  group,
  component,
  line,
}) => {
  const queryClient = useQueryClient()
  const [available, setAvailable] = useState(String(line?.units_available ?? 0))
  const [expiring, setExpiring] = useState(String(line?.units_expiring_soon ?? 0))
  const save = useMutation({
    mutationFn: () =>
      api.post<BloodStock>('/api/sang/stocks/', {
        blood_group: group,
        component,
        units_available: Number(available) || 0,
        units_expiring_soon: Math.min(Number(expiring) || 0, Number(available) || 0),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK.bloodInventory }),
  })
  const commit = () => {
    if (Number(available) !== (line?.units_available ?? 0) || Number(expiring) !== (line?.units_expiring_soon ?? 0)) {
      save.mutate()
    }
  }
  const low = (line?.units_available ?? 0) <= 2

  return (
    <tr>
      <td className={`px-4 py-1.5 font-semibold ${low ? 'text-critical' : 'text-fg'}`}>{group}</td>
      <td className="px-2 py-1.5 text-right">
        <input
          aria-label={`Poches ${group} disponibles`}
          className="field-control num h-7 w-20 text-right text-xs"
          type="number"
          min={0}
          value={available}
          onChange={(e) => setAvailable(e.target.value)}
          onBlur={commit}
        />
      </td>
      <td className="px-4 py-1.5 text-right">
        <input
          aria-label={`Poches ${group} périmant sous 72 h`}
          className="field-control num h-7 w-20 text-right text-xs"
          type="number"
          min={0}
          value={expiring}
          onChange={(e) => setExpiring(e.target.value)}
          onBlur={commit}
        />
        {save.error && (
          <span role="alert" className="block text-2xs text-critical">
            {save.error instanceof Error ? save.error.message : 'Erreur'}
          </span>
        )}
      </td>
    </tr>
  )
}
