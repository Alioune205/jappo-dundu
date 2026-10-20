import React from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Sheet } from '@/components/ui/Sheet'
import { Text } from '@/components/ui/Text'
import { formatDistance } from '@/lib/location'
import { useDestinations } from '@/lib/missions'
import { radius, space, useTheme } from '@/theme'
import type { BedDestination } from '@/types/api'

interface DestinationSheetProps {
  missionId: number | null
  visible: boolean
  /** Envoi en cours : la liste reste affichée, les choix sont bloqués. */
  busy: boolean
  error: string | null
  onPick: (facility: BedDestination) => void
  onClose: () => void
}

/**
 * Choix de l'hôpital avant le transport : établissements les plus proches
 * de l'ambulance ayant des lits d'urgence libres (temps réel, côté serveur).
 * Le patient part vers un lit disponible, pas vers un service saturé.
 */
export function DestinationSheet({ missionId, visible, busy, error, onPick, onClose }: DestinationSheetProps) {
  const { colors } = useTheme()
  const destinations = useDestinations(visible ? missionId : null)
  const results = destinations.data?.results ?? []

  return (
    <Sheet visible={visible} onClose={onClose} label="Choix de l'hôpital de destination">
      <View style={styles.body}>
        <View style={styles.head}>
          <Text variant="title">Vers quel hôpital ?</Text>
          <Text variant="body" tone="muted">
            Lits d’urgence libres autour de vous, les plus proches d’abord.
          </Text>
        </View>

        {destinations.isPending ? (
          <ActivityIndicator style={styles.loading} color={colors.muted} />
        ) : destinations.isError ? (
          <View style={styles.block}>
            <Text variant="body" tone="muted">
              {destinations.error.message}
            </Text>
            <Button label="Réessayer" variant="secondary" onPress={() => destinations.refetch()} />
          </View>
        ) : results.length === 0 ? (
          <Text variant="body" tone="muted">
            Aucun lit d’urgence libre à moins de 50 km. Appelez la régulation pour l’orientation du patient.
          </Text>
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {results.map((facility) => (
              <Pressable
                key={facility.id}
                onPress={() => onPick(facility)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`${facility.name}, ${facility.available_beds} lits libres`}
                style={({ pressed }) => [
                  styles.row,
                  { borderColor: colors.line, backgroundColor: pressed ? colors.raised : colors.surface, opacity: busy ? 0.6 : 1 },
                ]}
              >
                <View style={[styles.icon, { backgroundColor: colors.raised }]}>
                  <Icon name="hospital" size={20} />
                </View>
                <View style={styles.rowText}>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {facility.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {[facility.city, formatDistance(facility.distance_km)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={styles.beds}>
                  <Text variant="title" tone="ok">
                    {facility.available_beds}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {facility.available_beds > 1 ? 'lits libres' : 'lit libre'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {error ? (
          <Text variant="caption" tone="brand" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Button label="Annuler" variant="ghost" onPress={onClose} disabled={busy} />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  body: { gap: space.lg },
  head: { gap: space.xs },
  loading: { paddingVertical: space.xl },
  block: { gap: space.md },
  list: { maxHeight: 380 },
  listContent: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  beds: { alignItems: 'flex-end' },
})
