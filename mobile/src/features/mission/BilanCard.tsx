import React, { useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { useSendBilan } from '@/lib/missions'
import { timeAgo } from '@/lib/dates'
import { radius, space, useTheme } from '@/theme'
import type { Mission, Vitals } from '@/types/api'

/** Constantes saisies en priorité : les plus utiles à l'accueil du patient. */
const FIELDS: { key: keyof Vitals; label: string; unit: string; decimal?: boolean }[] = [
  { key: 'pulse', label: 'Pouls', unit: '/min' },
  { key: 'systolic', label: 'PA sys.', unit: 'mmHg' },
  { key: 'diastolic', label: 'PA dia.', unit: 'mmHg' },
  { key: 'spo2', label: 'SpO₂', unit: '%' },
  { key: 'resp_rate', label: 'FR', unit: '/min' },
  { key: 'gcs', label: 'Glasgow', unit: '3–15' },
  { key: 'temperature', label: 'T°', unit: '°C', decimal: true },
  { key: 'glucose', label: 'Glycémie', unit: 'g/L', decimal: true },
]

/**
 * Bilan transmis à l'hôpital de destination pendant le transport : quelques
 * constantes et une phrase. L'équipe d'accueil se prépare avant l'arrivée.
 * Jamais de nom de patient.
 */
export function BilanCard({ mission, now }: { mission: Mission; now: number }) {
  const { colors } = useTheme()
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState(mission.bilan_notes ?? '')
  const send = useSendBilan()

  const vitals: Vitals = {}
  for (const field of FIELDS) {
    const raw = values[field.key]?.replace(',', '.').trim()
    if (raw) vitals[field.key] = Number(raw)
  }
  const hasData = Object.keys(vitals).length > 0 || notes.trim() !== (mission.bilan_notes ?? '')

  return (
    <Card style={styles.card}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" style={styles.head} hitSlop={8}>
        <Icon name="pulse" size={18} color="brand" />
        <View style={styles.flex}>
          <Text variant="bodyStrong">Bilan pour l’hôpital</Text>
          <Text variant="caption" tone="muted">
            {mission.bilan_updated_at ? `Envoyé ${timeAgo(mission.bilan_updated_at, now)}` : 'Constantes et observations'}
          </Text>
        </View>
        <Icon name="chevron" size={16} color="muted" />
      </Pressable>

      {open ? (
        <View style={styles.body}>
          <View style={styles.grid}>
            {FIELDS.map((field) => (
              <View key={field.key} style={[styles.cell, { borderColor: colors.line }]}>
                <Text variant="caption" tone="muted">
                  {field.label}
                </Text>
                <TextInput
                  accessibilityLabel={field.label}
                  keyboardType={field.decimal ? 'decimal-pad' : 'number-pad'}
                  placeholder={mission.vitals?.[field.key] !== undefined ? String(mission.vitals[field.key]) : field.unit}
                  placeholderTextColor={colors.subtle}
                  value={values[field.key] ?? ''}
                  onChangeText={(text) => setValues((current) => ({ ...current, [field.key]: text }))}
                  style={[styles.input, { color: colors.fg }]}
                  maxLength={5}
                />
              </View>
            ))}
          </View>
          <TextInput
            accessibilityLabel="Observations"
            placeholder="Observations (ex. conscient, douleur thoracique depuis 1 h)"
            placeholderTextColor={colors.subtle}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={500}
            style={[styles.notes, { color: colors.fg, borderColor: colors.line }]}
          />
          {send.error ? (
            <Text variant="caption" tone="brand">
              {send.error instanceof Error ? send.error.message : 'Envoi impossible.'}
            </Text>
          ) : null}
          <Button
            label="Envoyer à l’hôpital"
            disabled={!hasData}
            loading={send.isPending}
            onPress={() =>
              send.mutate(
                { id: mission.id, vitals, notes },
                {
                  onSuccess: () => {
                    setValues({})
                    setOpen(false)
                  },
                }
              )
            }
            haptic
          />
        </View>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  body: { gap: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: { width: '23%', minWidth: 70, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.sm, paddingVertical: space.xs },
  input: { fontSize: 18, fontWeight: '600', paddingVertical: 2 },
  notes: { minHeight: 64, borderWidth: 1, borderRadius: radius.md, padding: space.md, textAlignVertical: 'top' },
})
