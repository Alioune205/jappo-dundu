import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Inbox } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { formatDateTime, formatPhone } from '@/lib/format'

interface Application {
  id: number
  name: string
  facility_type_display: string
  region_display: string
  city: string
  address: string
  contact_name: string
  contact_role: string
  contact_phone: string
  contact_email: string
  message: string
  latitude: number | null
  longitude: number | null
  created_at: string
}

const KEY = ['facility-applications'] as const

/** Demandes d'adhésion en attente : valider (crée l'établissement) ou refuser. */
export const ApplicationsPanel: React.FC = () => {
  const { data: applications = [] } = useQuery<Application[]>({
    queryKey: KEY,
    queryFn: async () =>
      (await api.get<{ results: Application[] }>('/api/facilities/applications/', { status: 'pending' })).results || [],
  })
  if (applications.length === 0) return null
  return (
    <section className="panel">
      <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-semibold text-fg">
        <Inbox className="h-4 w-4 text-brand" aria-hidden="true" />
        Demandes d’adhésion <span className="num font-normal text-muted">{applications.length}</span>
      </h2>
      <ul className="divide-y divide-line">
        {applications.map((application) => (
          <ApplicationRow key={application.id} application={application} />
        ))}
      </ul>
    </section>
  )
}

const ApplicationRow: React.FC<{ application: Application }> = ({ application }) => {
  const queryClient = useQueryClient()
  const [position, setPosition] = useState(
    application.latitude !== null ? `${application.latitude}, ${application.longitude}` : ''
  )
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: KEY })
    queryClient.invalidateQueries({ queryKey: ['admin-facilities'] })
  }
  const approve = useMutation({
    mutationFn: () => {
      const [latitude, longitude] = position.split(',').map((part) => Number(part.trim()))
      return api.post(`/api/facilities/applications/${application.id}/approve/`, { latitude, longitude })
    },
    onSuccess: refresh,
  })
  const reject = useMutation({
    mutationFn: () => api.post(`/api/facilities/applications/${application.id}/reject/`, {}),
    onSuccess: refresh,
  })
  const error = approve.error ?? reject.error
  return (
    <li className="space-y-2 px-4 py-3 text-sm">
      <p className="font-semibold text-fg">
        {application.name}{' '}
        <span className="font-normal text-muted">
          · {application.facility_type_display} · {application.city}, {application.region_display}
        </span>
      </p>
      <p className="text-xs text-muted">
        {application.contact_name}
        {application.contact_role && ` (${application.contact_role})`} · {formatPhone(application.contact_phone)}
        {application.contact_email && ` · ${application.contact_email}`} · reçue le{' '}
        {formatDateTime(application.created_at)}
      </p>
      {application.message && <p className="text-xs text-fg">{application.message}</p>}
      {error && (
        <p role="alert" className="text-xs text-critical">
          {error instanceof Error ? error.message : 'Action impossible.'}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Position GPS (latitude, longitude)"
          className="field-control h-8 w-56 text-xs"
          placeholder="Latitude, longitude (ex. 14.69, -17.44)"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        />
        <Button
          size="sm"
          variant="primary"
          isLoading={approve.isPending}
          disabled={!position.includes(',')}
          onClick={() => approve.mutate()}
        >
          Valider et créer l’établissement
        </Button>
        <Button size="sm" variant="ghost" isLoading={reject.isPending} onClick={() => reject.mutate()}>
          Refuser
        </Button>
      </div>
    </li>
  )
}
