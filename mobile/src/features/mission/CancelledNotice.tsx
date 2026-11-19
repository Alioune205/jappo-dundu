import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Icon } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { timeAgo } from '@/lib/dates'
import { radius, space, useTheme } from '@/theme'
import type { Mission } from '@/types/api'

/**
 * Bandeau « Mission annulée » : la régulation a annulé l'intervention en cours.
 * Le motif est affiché tel que saisi ; le bandeau reste jusqu'à ce que
 * l'ambulancier l'ait lu (« Compris »).
 */
export function CancelledNotice({ mission, now, onDismiss }: { mission: Mission; now: number; onDismiss: () => void }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.box, { backgroundColor: colors.brandSoft, borderColor: colors.brand }]} accessibilityRole="alert">
      <View style={styles.head}>
        <Icon name="alert" size={20} color="brand" />
        <View style={styles.flex}>
          <Text variant="bodyStrong" tone="brand">
            Mission n° {mission.id} annulée
          </Text>
          {mission.cancelled_at ? (
            <Text variant="caption" tone="muted">
              par la régulation · {timeAgo(mission.cancelled_at, now)}
            </Text>
          ) : null}
        </View>
      </View>
      <Text variant="body">{mission.cancellation_reason || 'Aucun motif précisé. Restez disponible, la régulation peut vous rappeler.'}</Text>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Compris" hitSlop={8} style={styles.ok}>
        <Text variant="label" tone="brand">
          Compris
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  ok: { alignSelf: 'flex-end', minHeight: 36, justifyContent: 'center' },
})
