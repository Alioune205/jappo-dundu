import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { REGIONS } from '@/lib/constants'
import { formatDateTime, localInputToIso } from '@/lib/format'
import type { RegionCode } from '@/types/api'

interface Drive {
  id: number
  title: string
  location: string
  city: string
  region: RegionCode
  starts_at: string
  ends_at: string
  target_units: number | null
  organizer: { id: number; name: string }
}

const KEY = ['blood-drives'] as const

/**
 * Collectes mobiles et horaires du centre : ce que l'application des donneurs
 * affiche (« Journées de don », liste des centres).
 */
export const DrivesPanel: React.FC = () => {
  const { user } = useAuth()
  const facility = user?.facility
  const queryClient = useQueryClient()
  const { data: drives = [] } = useQuery<Drive[]>({
    queryKey: KEY,
    queryFn: async () => (await api.get<{ results: Drive[] }>('/api/sang/drives/')).results || [],
  })
  const [form, setForm] = useState({
    title: '',
    location: '',
    city: '',
    region: (facility?.region ?? 'dakar') as RegionCode,
    start: '',
    end: '',
    target: '',
  })
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }))
  const create = useMutation({
    mutationFn: () =>
      api.post('/api/sang/drives/', {
        title: form.title,
        location: form.location,
        city: form.city,
        region: form.region,
        starts_at: localInputToIso(form.start),
        ends_at: localInputToIso(form.end),
        target_units: form.target ? Number(form.target) : null,
      }),
    onSuccess: () => {
      set({ title: '', location: '', start: '', end: '', target: '' })
      queryClient.invalidateQueries({ queryKey: KEY })
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/sang/drives/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })

  return (
    <section className="panel">
      <div className="border-b border-line px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <CalendarDays className="h-4 w-4 text-brand" aria-hidden="true" />
          Collectes mobiles
        </h3>
        <p className="text-xs text-muted">Publiées dans l’application des donneurs de la région.</p>
      </div>
      {facility && <OpeningHours facilityId={facility.id} />}
      {drives.length > 0 && (
        <ul className="divide-y divide-line border-b border-line text-xs">
          {drives.map((drive) => (
            <li key={drive.id} className="flex items-center justify-between gap-2 px-4 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium text-fg">{drive.title}</span>
                <span className="text-muted">
                  {formatDateTime(drive.starts_at)} · {drive.location}
                </span>
              </span>
              {drive.organizer.id === facility?.id && (
                <button
                  type="button"
                  aria-label={`Supprimer ${drive.title}`}
                  onClick={() => remove.mutate(drive.id)}
                  className="cursor-pointer rounded-md p-1.5 text-muted hover:bg-raised hover:text-critical"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid grid-cols-2 gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <Input
          label="Titre"
          required
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          className="col-span-2"
        />
        <Input label="Lieu" required value={form.location} onChange={(e) => set({ location: e.target.value })} />
        <Input label="Ville" required value={form.city} onChange={(e) => set({ city: e.target.value })} />
        <Input
          label="Début"
          type="datetime-local"
          required
          value={form.start}
          onChange={(e) => set({ start: e.target.value })}
        />
        <Input
          label="Fin"
          type="datetime-local"
          required
          value={form.end}
          onChange={(e) => set({ end: e.target.value })}
        />
        <Select label="Région" value={form.region} onChange={(e) => set({ region: e.target.value as RegionCode })}>
          {REGIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <Input
          label="Objectif (poches)"
          type="number"
          min={1}
          value={form.target}
          onChange={(e) => set({ target: e.target.value })}
        />
        {create.error && (
          <p role="alert" className="col-span-2 text-xs text-critical">
            {create.error instanceof Error ? create.error.message : 'Publication impossible.'}
          </p>
        )}
        <div className="col-span-2 flex justify-end">
          <Button type="submit" size="sm" variant="primary" isLoading={create.isPending}>
            Publier la collecte
          </Button>
        </div>
      </form>
    </section>
  )
}

/** Horaires d'ouverture du centre, affichés aux donneurs. */
const OpeningHours: React.FC<{ facilityId: number }> = ({ facilityId }) => {
  const { data } = useQuery({
    queryKey: ['facility-technical', facilityId],
    queryFn: () => api.get<{ opening_hours: string }>(`/api/facilities/${facilityId}/technical/`),
  })
  return data ? (
    <OpeningHoursForm key={data.opening_hours} facilityId={facilityId} initial={data.opening_hours} />
  ) : null
}

const OpeningHoursForm: React.FC<{ facilityId: number; initial: string }> = ({ facilityId, initial }) => {
  const queryClient = useQueryClient()
  const [value, setValue] = useState(initial)
  const save = useMutation({
    mutationFn: () => api.patch(`/api/facilities/${facilityId}/technical/`, { opening_hours: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['facility-technical', facilityId] }),
  })
  return (
    <form
      className="flex items-end gap-2 border-b border-line px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <Input
        label="Horaires du centre"
        placeholder="ex. Lun–Ven 8 h–17 h, sam. 8 h–13 h"
        value={value}
        maxLength={120}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button type="submit" size="sm" variant="secondary" isLoading={save.isPending} disabled={value === initial}>
        Enregistrer
      </Button>
    </form>
  )
}
