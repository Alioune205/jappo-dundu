import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, ShieldAlert } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { canManage } from '@/lib/access'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { QrCode } from '@/components/ui/QrCode'
import { formatDateTime } from '@/lib/format'
import type { FacilitySummary } from '@/types/api'

const TWO_FACTOR = ['two-factor'] as const

/** Double authentification : un code à 6 chiffres après le mot de passe. */
export const TwoFactorPanel: React.FC = () => {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: TWO_FACTOR, queryFn: () => api.get<{ enabled: boolean }>('/api/auth/2fa/') })
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const start = useMutation({
    mutationFn: () => api.post<{ secret: string; otpauth_uri: string }>('/api/auth/2fa/setup/'),
    onSuccess: setSetup,
  })
  const confirm = useMutation({
    mutationFn: () => api.post('/api/auth/2fa/confirm/', { code }),
    onSuccess: () => {
      setSetup(null)
      setCode('')
      queryClient.invalidateQueries({ queryKey: TWO_FACTOR })
    },
  })
  const disable = useMutation({
    mutationFn: () => api.post('/api/auth/2fa/disable/', { code, password }),
    onSuccess: () => {
      setCode('')
      setPassword('')
      queryClient.invalidateQueries({ queryKey: TWO_FACTOR })
    },
  })
  const error = start.error ?? confirm.error ?? disable.error

  return (
    <section className="panel p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <KeyRound className="h-4 w-4 text-brand" aria-hidden="true" />
        Double authentification
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        Recommandée pour tous les comptes professionnels : un mot de passe volé ne suffit plus.
      </p>
      {error && (
        <Alert tone="danger" className="mt-3">
          {error instanceof Error ? error.message : 'Action impossible.'}
        </Alert>
      )}
      {data?.enabled ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            disable.mutate()
          }}
        >
          <p className="text-sm font-semibold text-ok">Activée sur ce compte.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Code actuel"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Input
              label="Mot de passe"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="ghost"
              isLoading={disable.isPending}
              disabled={code.length !== 6 || !password}
            >
              Désactiver
            </Button>
          </div>
        </form>
      ) : setup ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            confirm.mutate()
          }}
        >
          <div className="flex flex-wrap items-center gap-4">
            <QrCode
              value={setup.otpauth_uri}
              size={160}
              label="QR code à scanner avec l’application d’authentification"
            />
            <div className="min-w-0 flex-1 space-y-2 text-xs text-muted">
              <p>
                1. Scannez ce code avec une application d’authentification (Google Authenticator, Microsoft
                Authenticator…).
              </p>
              <p>
                Ou saisissez la clé : <span className="num break-all font-semibold text-fg">{setup.secret}</span>
              </p>
              <p>2. Entrez le code à 6 chiffres qu’elle affiche.</p>
            </div>
          </div>
          <Input
            label="Code à 6 chiffres"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="flex justify-end">
            <Button type="submit" variant="primary" isLoading={confirm.isPending} disabled={code.length !== 6}>
              Activer
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex justify-end">
          <Button
            variant="secondary"
            isLoading={start.isPending}
            onClick={() => start.mutate()}
            disabled={data === undefined}
          >
            Activer la double authentification
          </Button>
        </div>
      )}
    </section>
  )
}

const DOMAINS = [
  { value: 'beds', label: 'Lits' },
  { value: 'blood', label: 'Sang' },
  { value: 'ambulances', label: 'Ambulances' },
] as const

interface EmergencyAccessRow {
  id: number
  user: string
  facility: { id: number; name: string }
  domain: string
  reason: string
  created_at: string
  expires_at: string
  active: boolean
}

/**
 * Accès d'urgence : agir 60 minutes pour un autre établissement qui ne répond
 * pas, quand la vie d'un patient en dépend. Motif obligatoire, tout est
 * journalisé et visible par l'administrateur général.
 */
export const EmergencyAccessPanel: React.FC = () => {
  const { roles, isAdmin } = useAuth()
  const queryClient = useQueryClient()
  // Domaines administrés (l'administrateur général voit déjà tout : pas de formulaire).
  const domains = isAdmin ? [] : DOMAINS.filter((d) => canManage(roles, d.value))
  const [facilityId, setFacilityId] = useState('')
  const [domain, setDomain] = useState<string>(domains[0]?.value ?? '')
  const [reason, setReason] = useState('')
  const { data: facilities = [] } = useQuery<FacilitySummary[]>({
    queryKey: ['facility-options-all'],
    queryFn: async () => (await api.get<{ results: FacilitySummary[] }>('/api/facilities/')).results || [],
    enabled: domains.length > 0,
  })
  const { data: accesses = [] } = useQuery<EmergencyAccessRow[]>({
    queryKey: ['emergency-accesses'],
    queryFn: () => api.get<EmergencyAccessRow[]>('/api/security/emergency-access/'),
  })
  const open = useMutation({
    mutationFn: () => api.post('/api/security/emergency-access/', { facility_id: Number(facilityId), domain, reason }),
    onSuccess: () => {
      setReason('')
      queryClient.invalidateQueries({ queryKey: ['emergency-accesses'] })
      queryClient.invalidateQueries()
    },
  })
  if (domains.length === 0 && !isAdmin) return null

  return (
    <section className="panel p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <ShieldAlert className="h-4 w-4 text-critical" aria-hidden="true" />
        Accès d’urgence
      </h3>
      <p className="mt-0.5 text-xs text-muted">
        Seulement si la vie d’un patient en dépend et que l’établissement concerné ne répond pas. 60 minutes, motif
        obligatoire, journalisé.
      </p>
      {open.error && (
        <Alert tone="danger" className="mt-3">
          {open.error instanceof Error ? open.error.message : 'Ouverture impossible.'}
        </Alert>
      )}
      {domains.length > 0 && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            open.mutate()
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Select label="Établissement" value={facilityId} onChange={(e) => setFacilityId(e.target.value)} required>
              <option value="">Choisir…</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
            <Select label="Domaine" value={domain} onChange={(e) => setDomain(e.target.value)}>
              {domains.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
          <Textarea
            label="Motif"
            placeholder="ex. Hôpital B injoignable, polytraumatisé en route, lit de réanimation à bloquer"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={10}
            required
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="danger"
              isLoading={open.isPending}
              disabled={!facilityId || reason.trim().length < 10}
            >
              Ouvrir l’accès (60 min)
            </Button>
          </div>
        </form>
      )}
      {accesses.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line text-xs">
          {accesses.slice(0, 5).map((a) => (
            <li key={a.id} className="py-2">
              <span className={`font-semibold ${a.active ? 'text-critical' : 'text-muted'}`}>
                {a.active ? 'En cours' : 'Terminé'}
              </span>{' '}
              · {a.user} → {a.facility.name} ({a.domain}) · {formatDateTime(a.created_at)}
              <span className="block text-muted">{a.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
