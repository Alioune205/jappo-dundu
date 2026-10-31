import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { BedCapacity } from '@/types/api'
import { QK } from '@/lib/queryKeys'

interface CapacityEditModalProps {
  /** Service à ajuster ; null ferme la fenêtre. */
  capacity: BedCapacity | null
  onClose: () => void
}

/**
 * Ajustement manuel des lits installés, occupés et des sorties prévues d'un service. Le
 * formulaire est remonté à chaque ouverture (clé = service) : il part
 * toujours des valeurs actuelles.
 */
export const CapacityEditModal: React.FC<CapacityEditModalProps> = ({ capacity, onClose }) => (
  <Modal
    isOpen={capacity !== null}
    onClose={onClose}
    title="Ajuster la capacité"
    description={capacity ? `${capacity.category_display} · ${capacity.facility?.name}` : ''}
  >
    {capacity && <CapacityForm key={capacity.id} capacity={capacity} onDone={onClose} />}
  </Modal>
)

const CapacityForm: React.FC<{ capacity: BedCapacity; onDone: () => void }> = ({ capacity, onDone }) => {
  const queryClient = useQueryClient()
  const [total, setTotal] = useState(capacity.total_beds)
  const [occupied, setOccupied] = useState(capacity.occupied_beds)
  const [discharges, setDischarges] = useState(capacity.expected_discharges)
  const error = occupied > total ? 'Ne peut pas dépasser le total de lits.' : undefined
  const dischargesError = discharges > occupied ? 'Ne peut pas dépasser les lits occupés.' : undefined

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<BedCapacity>(`/api/lits/capacities/${capacity.id}/`, {
        total_beds: total,
        occupied_beds: occupied,
        expected_discharges: discharges,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK.bedCapacities })
      queryClient.invalidateQueries({ queryKey: QK.bedsSummary })
      onDone()
    },
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!error && !dischargesError) mutation.mutate()
      }}
    >
      {mutation.error && (
        <Alert tone="danger">
          {mutation.error instanceof Error ? mutation.error.message : 'Mise à jour impossible.'}
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Lits installés"
          type="number"
          min={1}
          value={total}
          onChange={(e) => setTotal(parseInt(e.target.value, 10) || 1)}
        />
        <Input
          label="Lits occupés"
          type="number"
          min={0}
          max={total}
          value={occupied}
          onChange={(e) => setOccupied(parseInt(e.target.value, 10) || 0)}
          error={error}
        />
      </div>
      <Input
        label="Sorties prévues"
        helperText="Patients qui quittent le service dans les prochaines heures : le réseau voit les lits bientôt libres."
        type="number"
        min={0}
        max={occupied}
        value={discharges}
        onChange={(e) => setDischarges(parseInt(e.target.value, 10) || 0)}
        error={dischargesError}
      />
      <p className="text-xs text-muted">
        Lits libres après modification : <span className="num text-fg">{Math.max(0, total - occupied)}</span>
      </p>
      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" disabled={!!error || !!dischargesError} isLoading={mutation.isPending}>
          Enregistrer
        </Button>
      </div>
    </form>
  )
}
