import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import Svg, { Path } from 'react-native-svg'
import Animated, { useAnimatedStyle, useDerivedValue, withSpring, withTiming } from 'react-native-reanimated'
import { motion, space, useTheme } from '@/theme'
import { Text } from './Text'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Texte de la case ; peut contenir un lien (Text pressable). */
  children: React.ReactNode
  accessibilityLabel: string
  error?: string
}

/** Case à cocher : la coche apparaît d'un petit ressort, la case se colore. */
export function Checkbox({ checked, onChange, children, accessibilityLabel, error }: CheckboxProps) {
  const { colors } = useTheme()
  const on = useDerivedValue(() => withTiming(checked ? 1 : 0, { duration: motion.fast }))
  const mark = useDerivedValue(() => withSpring(checked ? 1 : 0, motion.spring))
  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: on.value > 0.5 ? colors.brand : 'transparent',
    borderColor: on.value > 0.5 ? colors.brand : error ? colors.brand : colors.lineStrong,
  }))
  const markStyle = useAnimatedStyle(() => ({ opacity: mark.value, transform: [{ scale: 0.4 + 0.6 * mark.value }] }))

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync()
          onChange(!checked)
        }}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={accessibilityLabel}
        style={styles.row}
      >
        <Animated.View style={[styles.box, boxStyle]}>
          <Animated.View style={markStyle}>
            <Svg width={14} height={14} viewBox="0 0 24 24">
              <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={colors.onBrand} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Svg>
          </Animated.View>
        </Animated.View>
        <View style={styles.label}>{children}</View>
      </Pressable>
      {error ? (
        <Text variant="caption" tone="brand" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1 },
})
