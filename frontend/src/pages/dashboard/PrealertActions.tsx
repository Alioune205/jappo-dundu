import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { QK } from '@/lib/queryKeys'
import type { Mission } from '@/types/api'

/** Motifs de refus fréquents, en un clic (le texte reste modifiable). */
const REFUSAL_REASONS = ['Service saturé', 'Équipement indisponible', 'Spécialiste absent', 'Mauvaise orientation']

/**
 * Pré-alerte : l'hôpital accepte le patient annoncé, ou le refuse avec un
 * motif. Un refus libère le lit réservé et prévient la régulation et
 * l'équipage, qui réorientent l'ambulance.
 */
export const PrealertActions: React.FC<{ mission: Mission }> = ({ mission }) => {
  const queryClient = useQueryClient()
  const [refusing, setRefusing] = useState(false)
  const [note, setNote] = useState('')

  const answer = useMutation({
    mutationFn: (body: { accepted: boolean; note?: string }) =>
      api.post<Mission>(`/api/ambulances/missions/${mission.id}/destination-response/`, body),
    onSuccess: () => {
      setRefusing(false)
      queryClient.invalidateQueries({ queryKey: QK.missionsActive })
      queryClient.invalidateQueries({ queryKey: QK.bedReservations })
      queryClient.invalidateQueries({ queryKey: QK.bedCapacities })
    },
  })

  if (mission.destination_status !== 'pending') return null

  return (
    <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-2.5">
      <p className="text-xs font-semibold text-fg">Pouvez-vous accueillir ce patient ?</p>
      {answer.error && (
        <p role="alert" className="text-2xs text-critical">
          {answer.error instanceof Error ? answer.error.message : 'Réponse impossible.'}
        </p>
      )}
      {refusing ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (note.trim()) answer.mutate({ accepted: false, note })
          }}
        >
          <div className="flex flex-wrap gap-1">
            {REFUSAL_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => setNote(reason)}
                className="cursor-pointer rounded-md border border-line px-2 py-0.5 text-2xs text-muted hover:text-fg"
              >
                {reason}
              </button>
            ))}
          </div>
          <input
            aria-label="Motif du refus"
            className="field-control h-8 text-xs"
            placeholder="Motif du refus (obligatoire)"
            value={note}
            maxLength={255}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setRefusing(false)}>
              Retour
            </Button>
            <Button type="submit" variant="danger" size="sm" disabled={!note.trim()} isLoading={answer.isPending}>
              Refuser le patient
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex gap-1.5">
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            icon={<Check className="h-3.5 w-3.5" />}
            isLoading={answer.isPending}
            onClick={() => answer.mutate({ accepted: true })}
          >
            Accepter
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            icon={<X className="h-3.5 w-3.5" />}
            onClick={() => setRefusing(true)}
          >
            Refuser
          </Button>
        </div>
      )}
    </div>
  )
}
