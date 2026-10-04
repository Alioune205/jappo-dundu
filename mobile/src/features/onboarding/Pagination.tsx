import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated'
import { useTheme } from '@/theme'

const DOT = 6
const ACTIVE = 22

interface PaginationProps {
  progress: SharedValue<number>
  count: number
  onSelect: (index: number) => void
}

/**
 * Pagination continue : le point actif s'étire en pastille et se teinte de
 * rouge en suivant exactement le doigt (pas de saut entre deux états).
 * Chaque point est aussi un raccourci vers son écran.
 */
export function Pagination({ progress, count, onSelect }: PaginationProps) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} index={i} count={count} progress={progress} onPress={() => onSelect(i)} />
      ))}
    </View>
  )
}

function Dot({ index, count, progress, onPress }: { index: number; count: number; progress: SharedValue<number>; onPress: () => void }) {
  const { colors } = useTheme()
  const style = useAnimatedStyle(() => {
    const focus = interpolate(Math.abs(progress.value - index), [0, 1], [1, 0], Extrapolation.CLAMP)
    return {
      width: DOT + (ACTIVE - DOT) * focus,
      backgroundColor: interpolateColor(focus, [0, 1], [colors.lineStrong, colors.brand]),
    }
  })
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 14, bottom: 14, left: 4, right: 4 }}
      accessibilityRole="tab"
      accessibilityLabel={`Écran ${index + 1} sur ${count}`}
    >
      <Animated.View style={[styles.dot, style]} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: DOT, borderRadius: DOT / 2 },
})
