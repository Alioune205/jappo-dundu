import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { motion, radius, space, useTheme } from '@/theme'
import type { Option } from './SelectField'
import { Text } from './Text'

interface SegmentedProps<T extends string> {
  label: string
  value: T | null
  options: readonly Option<T>[]
  onChange: (value: T) => void
  error?: string
}

/** Choix exclusif court (2 à 3 options) : le curseur glisse sous l'option choisie. */
export function Segmented<T extends string>({ label, value, options, onChange, error }: SegmentedProps<T>) {
  const { colors } = useTheme()
  const [width, setWidth] = useState(0)
  const index = options.findIndex((option) => option.value === value)
  const segment = width / options.length
  const offset = useSharedValue(0)

  useEffect(() => {
    if (index >= 0 && segment > 0) offset.set(withTiming(index * segment, { duration: motion.base, easing: motion.easeOut }))
  }, [index, segment, offset])

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }))

  return (
    <View style={styles.wrapper}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width - 8)}
        style={[styles.track, { backgroundColor: colors.raised, borderColor: error ? colors.brand : colors.line }]}
      >
        {index >= 0 && segment > 0 && (
          <Animated.View
            style={[styles.thumb, { width: segment, backgroundColor: colors.surface, borderColor: colors.lineStrong }, thumbStyle]}
          />
        )}
        {options.map((option) => {
          const selected = option.value === value
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                if (!selected) Haptics.selectionAsync()
                onChange(option.value)
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={styles.option}
            >
              <Text variant="bodyStrong" tone={selected ? 'fg' : 'muted'}>
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {error ? (
        <Text variant="caption" tone="brand" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { gap: space.xs + 2 },
  track: { height: 52, borderRadius: radius.md, borderWidth: 1, padding: 3, flexDirection: 'row' },
  thumb: { position: 'absolute', top: 3, bottom: 3, left: 3, borderRadius: radius.md - 3, borderWidth: 1 },
  option: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
