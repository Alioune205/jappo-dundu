import React, { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { Text } from '@/components/ui/Text'
import { passwordStrength } from '@/lib/validation'
import { motion, radius, space, useTheme, type Palette } from '@/theme'

const LEVELS: { label: string; color: keyof Palette }[] = [
  { label: '8 caractères minimum', color: 'subtle' },
  { label: 'Faible', color: 'brand' },
  { label: 'Correct', color: 'warning' },
  { label: 'Solide', color: 'ok' },
]

/** Jauge en trois segments sous le mot de passe : elle se remplit pendant la frappe. */
export function PasswordStrength({ password }: { password: string }) {
  const { colors } = useTheme()
  const score = passwordStrength(password)
  const level = LEVELS[score]
  if (!password) return null
  return (
    <View style={styles.row} accessible accessibilityLabel={`Solidité du mot de passe : ${level.label}`}>
      <View style={styles.bars}>
        {[1, 2, 3].map((n) => (
          <Segment key={n} on={score >= n} color={colors[level.color]} track={colors.line} />
        ))}
      </View>
      <Text variant="caption" tone="muted" style={styles.label}>
        {level.label}
      </Text>
    </View>
  )
}

function Segment({ on, color, track }: { on: boolean; color: string; track: string }) {
  const fill = useSharedValue(on ? 1 : 0)
  useEffect(() => {
    fill.set(withTiming(on ? 1 : 0, { duration: motion.base, easing: motion.easeOut }))
  }, [fill, on])
  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }))
  return (
    <View style={[styles.segment, { backgroundColor: track }]}>
      <Animated.View style={[styles.fill, { backgroundColor: color }, style]} />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: -space.sm },
  bars: { flex: 1, flexDirection: 'row', gap: space.xs },
  segment: { flex: 1, height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 4, borderRadius: radius.pill },
  label: { minWidth: 72, textAlign: 'right' },
})
