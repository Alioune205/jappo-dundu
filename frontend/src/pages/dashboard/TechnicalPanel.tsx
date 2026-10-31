import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Stethoscope } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CAPABILITIES } from '@/lib/constants'
import { formatPhone } from '@/lib/format'
import type { Capability, FacilitySummary } from '@/types/api'

interface Technical {
  capabilities: Capability[]
  on_call_phone: string
}

const technicalKey = (id: number) => ['facility-technical', id] as const

/**
 * Plateau technique et ligne de garde, déclarés par l'établissement : la
 * régulation oriente les patients vers un hôpital équipé pour leur cas.
 */
export const TechnicalPanel: React.FC<{ facility: FacilitySummary }> = ({ facility }) => {
  const [editing, setEditing] = useState(false)
  const { data } = useQuery<Technical>({
    queryKey: technicalKey(facility.id),
    queryFn: () => api.get<Technical>(`/api/facilities/${facility.id}/technical/`),
  })

  return (
    <section className="panel">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Stethoscope className="h-4 w-4 text-accent-blue" aria-hidden="true" />
          Plateau technique
        </h2>
        {data && !editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Modifier
          </Button>
        )}
      </div>
      {!data ? (
        <p className="px-5 py-6 text-xs text-muted">Chargement…</p>
      ) : editing ? (
        <TechnicalForm facilityId={facility.id} initial={data} onDone={() => setEditing(false)} />
      ) : (
        <div className="space-y-2 px-5 py-4">
          {data.capabilities.length === 0 ? (
            <p className="text-xs text-muted">
              Rien de déclaré : la régulation ne peut pas vous orienter de patients selon votre équipement.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {CAPABILITIES.filter((c) => data.capabilities.includes(c.value)).map((c) => (
                <li key={c.value} className="rounded-md bg-raised px-2 py-1 text-xs text-fg">
                  {c.label}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">
            Ligne de garde :{' '}
            <span className="num text-fg">
              {data.on_call_phone ? formatPhone(data.on_call_phone) : 'non renseignée'}
            </span>
          </p>
        </div>
      )}
    </section>
  )
}

const TechnicalForm: React.FC<{ facilityId: number; initial: Technical; onDone: () => void }> = ({
  facilityId,
  initial,
  onDone,
}) => {
  const queryClient = useQueryClient()
  const [capabilities, setCapabilities] = useState<Capability[]>(initial.capabilities)
  const [phone, setPhone] = useState(initial.on_call_phone)
  const save = useMutation({
    mutationFn: () =>
      api.patch<Technical>(`/api/facilities/${facilityId}/technical/`, { capabilities, on_call_phone: phone }),
    onSuccess: (data) => {
      queryClient.setQueryData(technicalKey(facilityId), data)
      onDone()
    },
  })

  return (
    <form
      className="space-y-3 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      {save.error && (
        <p role="alert" className="text-xs text-critical">
          {save.error instanceof Error ? save.error.message : 'Enregistrement impossible.'}
        </p>
      )}
      <fieldset className="grid grid-cols-2 gap-1.5">
        <legend className="sr-only">Équipements et spécialités disponibles</legend>
        {CAPABILITIES.map((c) => (
          <label key={c.value} className="flex cursor-pointer items-center gap-2 text-xs text-fg">
            <input
              type="checkbox"
              checked={capabilities.includes(c.value)}
              onChange={(e) =>
                setCapabilities((list) => (e.target.checked ? [...list, c.value] : list.filter((v) => v !== c.value)))
              }
            />
            {c.label}
          </label>
        ))}
      </fieldset>
      <Input
        label="Ligne de garde (24 h/24)"
        type="tel"
        placeholder="33 800 00 00"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" size="sm" isLoading={save.isPending}>
          Enregistrer
        </Button>
      </div>
    </form>
  )
}
