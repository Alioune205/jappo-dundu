import React, { useState } from 'react'
import { StyleSheet, Switch, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/Segmented'
import { Text } from '@/components/ui/Text'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/dates'
import { space, useTheme } from '@/theme'

interface Readiness {
  ready: boolean
  checked_at: string | null
  issues: string[]
}

type Fuel = 'full' | 'half' | 'low'

const key = (id: number) => ['ambulance-check', id] as const

/**
 * Vérification de début de garde : oxygène, matériel, carburant, équipage.
 * Une ambulance non vérifiée (ou avec un défaut) passe après les autres à
 * l'affectation automatique : la régulation envoie un véhicule prêt.
 */
export function ShiftCheckCard({ ambulanceId, now }: { ambulanceId: number; now: number }) {
  const { colors } = useTheme()
  const client = useQueryClient()
  const { data } = useQuery({
    queryKey: key(ambulanceId),
    queryFn: () => api.get<Readiness>(`/api/ambulances/vehicles/${ambulanceId}/check/`),
  })
  const [editing, setEditing] = useState(false)
  const [oxygen, setOxygen] = useState(true)
  const [equipment, setEquipment] = useState(true)
  const [fuel, setFuel] = useState<Fuel>('full')
  const save = useMutation({
    mutationFn: () =>
      api.post<Readiness>(`/api/ambulances/vehicles/${ambulanceId}/check/`, {
        oxygen_ok: oxygen,
        equipment_ok: equipment,
        fuel,
        crew_count: 2,
      }),
    onSuccess: (readiness) => {
      client.setQueryData(key(ambulanceId), readiness)
      setEditing(false)
    },
  })

  if (!data) return null
  if (data.ready && !editing) {
    return (
      <Text variant="caption" tone="ok">
        Véhicule vérifié {data.checked_at ? timeAgo(data.checked_at, now) : ''} · prêt à partir
      </Text>
    )
  }

  return (
    <Card style={[styles.card, { borderColor: data.ready ? colors.line : colors.warning }]}>
      <Text variant="heading">Vérification de garde</Text>
      {!editing ? (
        <>
          <Text variant="body" tone="muted">
            {data.issues.join(' · ')}
          </Text>
          <Button label="Vérifier le véhicule" onPress={() => setEditing(true)} haptic />
        </>
      ) : (
        <>
          <Row label="Oxygène suffisant" value={oxygen} onChange={setOxygen} />
          <Row label="Matériel complet (brancard, défibrillateur, trousse)" value={equipment} onChange={setEquipment} />
          <Segmented<Fuel>
            label="Carburant"
            value={fuel}
            options={[
              { value: 'full', label: 'Plein' },
              { value: 'half', label: 'Moitié' },
              { value: 'low', label: 'Réserve' },
            ]}
            onChange={setFuel}
          />
          {save.error ? (
            <Text variant="caption" tone="brand">
              {save.error.message}
            </Text>
          ) : null}
          <Button label="Enregistrer la vérification" onPress={() => save.mutate()} loading={save.isPending} haptic />
        </>
      )}
    </Card>
  )
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useTheme()
  return (
    <View style={styles.row}>
      <Text variant="body" style={styles.flex}>
        {label}
      </Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: colors.ok, false: colors.line }} />
    </View>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.md, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
})
