import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatDate } from '@/lib/format'
import type { DonorLookup } from '@/types/api'

/** Enregistrement d'un don spontané : recherche du donneur par téléphone, puis validation. */
export const DonationLookupPanel: React.FC = () => {
  const { user } = useAuth()
  const [phone, setPhone] = useState('')
  const [donor, setDonor] = useState<DonorLookup | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null)

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone) return
    setLookupError(null)
    setMessage(null)
    try {
      setDonor(await api.get<DonorLookup>('/api/sang/donors/lookup/', { phone_number: phone }))
    } catch {
      setLookupError('Aucun profil donneur trouvé pour ce numéro de téléphone.')
      setDonor(null)
    }
  }

  const record = useMutation({
    mutationFn: (donorId: number) =>
      api.post('/api/sang/donations/', { donor_id: donorId, facility_id: user?.facility?.id }),
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Don enregistré. Le profil du donneur est à jour.' })
      setDonor(null)
      setPhone('')
    },
    onError: (err: unknown) => {
      setMessage({
        type: 'danger',
        text: err instanceof Error ? err.message : 'Erreur lors de l’enregistrement du don.',
      })
    },
  })

  return (
    <section className="rounded-md border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-fg">Enregistrer un don</h3>
      <p className="mt-0.5 text-xs text-muted">Retrouver un donneur par son numéro de téléphone.</p>

      <form onSubmit={handleLookup} className="mt-3 flex items-end gap-2">
        <Input
          label="Téléphone"
          type="tel"
          placeholder="77 123 45 67"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Button type="submit" variant="secondary">
          Rechercher
        </Button>
      </form>

      {lookupError && <p className="mt-2 text-xs text-critical">{lookupError}</p>}
      {message && (
        <Alert tone={message.type} className="mt-3" onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {donor && (
        <div className="mt-3 rounded border border-line text-xs">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="truncate font-medium text-fg">{donor.full_name}</span>
            <span className="num font-medium text-fg">{donor.blood_group}</span>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
            <span className="text-muted">
              Dernier don : <span className="num text-fg">{formatDate(donor.last_donation_date)}</span>
            </span>
            <span className={`inline-flex items-center gap-1.5 ${donor.is_eligible ? 'text-ok' : 'text-critical'}`}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${donor.is_eligible ? 'bg-ok' : 'bg-critical'}`} />
              {donor.is_eligible ? 'Éligible' : 'Inéligible'}
            </span>
          </div>
          <div className="flex justify-end border-t border-line px-3 py-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => record.mutate(donor.id)}
              isLoading={record.isPending}
              disabled={!donor.is_eligible}
            >
              Valider le don
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
