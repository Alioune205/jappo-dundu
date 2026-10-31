import React, { useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { BrandMark, BrandName } from '@/components/layout/BrandMark'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { FACILITY_TYPES, REGIONS } from '@/lib/constants'

const EMPTY = {
  name: '',
  facility_type: 'hospital',
  region: 'dakar',
  city: '',
  address: '',
  contact_name: '',
  contact_role: '',
  contact_phone: '',
  contact_email: '',
  message: '',
}

/**
 * Demande d'adhésion d'un établissement (page publique) : l'administrateur
 * général la valide, puis crée les comptes de ses administrateurs.
 */
export const JoinNetwork: React.FC = () => {
  const [form, setForm] = useState(EMPTY)
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<typeof EMPTY>) => setForm((current) => ({ ...current, ...patch }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setState('sending')
    setError(null)
    try {
      const response = await fetch('/api/facilities/applications/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        const first = Object.values(body as Record<string, string[] | string>)[0]
        throw new Error(Array.isArray(first) ? first[0] : String(first ?? 'Envoi impossible.'))
      }
      setState('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.')
      setState('idle')
    }
  }

  return (
    <main className="min-h-full bg-canvas px-5 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <Link to="/bienvenue" className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour
        </Link>
        <div className="flex items-center gap-2">
          <BrandMark className="h-9 w-9" />
          <BrandName className="text-lg" />
        </div>
        {state === 'sent' ? (
          <div className="panel space-y-3 p-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-ok" aria-hidden="true" />
            <h1 className="text-xl font-bold text-fg">Demande envoyée</h1>
            <p className="text-sm text-muted">
              L’administrateur du réseau vous rappelle pour vérifier l’établissement et créer les comptes de vos
              équipes.
            </p>
          </div>
        ) : (
          <form className="panel space-y-4 p-6" onSubmit={submit}>
            <div>
              <h1 className="text-xl font-bold text-fg">Rejoindre le réseau Jappo Dundu</h1>
              <p className="mt-1 text-sm text-muted">
                Hôpitaux, centres de santé, cliniques, centres de transfusion, services d’ambulances.
              </p>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
            <Input
              label="Nom de l’établissement"
              required
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Type" value={form.facility_type} onChange={(e) => set({ facility_type: e.target.value })}>
                {FACILITY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <Select label="Région" value={form.region} onChange={(e) => set({ region: e.target.value })}>
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
              <Input label="Ville" required value={form.city} onChange={(e) => set({ city: e.target.value })} />
              <Input label="Adresse" value={form.address} onChange={(e) => set({ address: e.target.value })} />
              <Input
                label="Responsable"
                required
                value={form.contact_name}
                onChange={(e) => set({ contact_name: e.target.value })}
              />
              <Input
                label="Fonction"
                value={form.contact_role}
                onChange={(e) => set({ contact_role: e.target.value })}
              />
              <Input
                label="Téléphone"
                type="tel"
                required
                value={form.contact_phone}
                onChange={(e) => set({ contact_phone: e.target.value })}
              />
              <Input
                label="E-mail"
                type="email"
                value={form.contact_email}
                onChange={(e) => set({ contact_email: e.target.value })}
              />
            </div>
            <Textarea
              label="Message (facultatif)"
              value={form.message}
              maxLength={500}
              onChange={(e) => set({ message: e.target.value })}
            />
            <div className="flex justify-end">
              <Button type="submit" variant="primary" isLoading={state === 'sending'}>
                Envoyer la demande
              </Button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
