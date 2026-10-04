import React, { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { motion, radius, space, useTheme } from '@/theme'

/** Écran sans contenu : un pictogramme, une phrase, au besoin une action. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName
  title: string
  body: string
  action?: { label: string; onPress: () => void; loading?: boolean }
}) {
  const { colors } = useTheme()
  return (
    <Animated.View entering={FadeIn.duration(motion.slow)} style={styles.empty}>
      <View style={[styles.emptyIcon, { borderColor: colors.line, backgroundColor: colors.surface }]}>
        <Icon name={icon} size={26} color="muted" />
      </View>
      <Text variant="heading" style={styles.center}>
        {title}
      </Text>
      <Text variant="body" tone="muted" style={styles.center}>
        {body}
      </Text>
      {action ? <Button label={action.label} onPress={action.onPress} loading={action.loading} style={styles.emptyAction} /> : null}
    </Animated.View>
  )
}

/** Bandeau d'information au-dessus de la liste (indisponibilité, délai entre deux dons). */
export function Notice({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: { label: string; onPress: () => void; disabled?: boolean }
}) {
  const { colors } = useTheme()
  return (
    <Card style={[styles.notice, { backgroundColor: colors.raised }]}>
      <View style={styles.noticeText}>
        <Text variant="label">{title}</Text>
        <Text variant="caption" tone="muted">
          {body}
        </Text>
      </View>
      {action ? (
        <Button label={action.label} variant="secondary" onPress={action.onPress} disabled={action.disabled} style={styles.noticeAction} />
      ) : null}
    </Card>
  )
}

/** Cartes fantômes pendant le premier chargement : la mise en page ne saute pas à l'arrivée des données. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  const { colors } = useTheme()
  const reduceMotion = useReducedMotion()
  const glow = useSharedValue(0)

  useEffect(() => {
    if (reduceMotion) return
    glow.set(withRepeat(withTiming(1, { duration: 900 }), -1, true))
    return () => cancelAnimation(glow)
  }, [glow, reduceMotion])

  const style = useAnimatedStyle(() => ({ opacity: 0.55 + glow.value * 0.35 }))
  const block = (width: number | `${number}%`, height: number) => (
    <View style={{ width, height, borderRadius: radius.sm, backgroundColor: colors.raised }} />
  )

  return (
    <Animated.View style={[styles.skeletons, style]} accessibilityLabel="Chargement des demandes">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} style={styles.skeleton}>
          <View style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.raised }} />
          <View style={styles.skeletonText}>
            {block('35%', 10)}
            {block('75%', 16)}
            {block('50%', 12)}
          </View>
        </Card>
      ))}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: space.sm, paddingHorizontal: space.xl, paddingTop: space.xxxl },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  emptyAction: { alignSelf: 'stretch', marginTop: space.lg },
  center: { textAlign: 'center' },
  notice: { gap: space.md },
  noticeText: { gap: 2 },
  noticeAction: { height: 40 },
  skeletons: { gap: space.md },
  skeleton: { flexDirection: 'row', gap: space.md },
  skeletonText: { flex: 1, gap: space.sm, justifyContent: 'center' },
})
