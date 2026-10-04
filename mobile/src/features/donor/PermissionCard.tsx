import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { Card } from '@/components/ui/Card'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { motion, radius, space, useTheme } from '@/theme'

export type PermissionState = 'todo' | 'busy' | 'done' | 'blocked'

interface PermissionCardProps {
  icon: IconName
  title: string
  body: string
  state: PermissionState
  actionLabel: string
  doneLabel: string
  /** Libellé quand l'autorisation a été refusée (renvoie aux réglages). */
  blockedLabel?: string
  onAction: () => void
}

/**
 * Autorisation demandée en contexte : on explique d'abord pourquoi, la
 * fenêtre système n'apparaît qu'au toucher du bouton.
 */
export function PermissionCard({ icon, title, body, state, actionLabel, doneLabel, blockedLabel = 'Ouvrir les réglages', onAction }: PermissionCardProps) {
  const { colors } = useTheme()
  const done = state === 'done'
  return (
    <Card style={styles.card}>
      <View style={[styles.icon, { backgroundColor: done ? colors.raised : colors.brandSoft }]}>
        <Icon name={done ? 'check' : icon} size={20} color={done ? 'ok' : 'brand'} strokeWidth={done ? 2.2 : 1.8} />
      </View>
      <View style={styles.text}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" tone="muted">
          {body}
        </Text>
        {done ? (
          <Animated.View entering={FadeIn.duration(motion.base)} style={styles.status}>
            <Text variant="label" tone="ok">
              {doneLabel}
            </Text>
          </Animated.View>
        ) : (
          <Pressable
            onPress={onAction}
            disabled={state === 'busy'}
            accessibilityRole="button"
            accessibilityState={{ busy: state === 'busy' }}
            style={({ pressed }) => [styles.action, { borderColor: colors.lineStrong, backgroundColor: pressed ? colors.raised : 'transparent' }]}
          >
            {state === 'busy' ? (
              <ActivityIndicator size="small" color={colors.fg} />
            ) : (
              <Text variant="label">{state === 'blocked' ? blockedLabel : actionLabel}</Text>
            )}
          </Pressable>
        )}
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space.md },
  icon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: space.xs },
  status: { marginTop: space.xs },
  action: {
    alignSelf: 'flex-start',
    minWidth: 120,
    height: 40,
    marginTop: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
