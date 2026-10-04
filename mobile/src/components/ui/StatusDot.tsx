import React, { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { useTheme, type Palette } from '@/theme'

interface StatusDotProps {
  color: keyof Palette
  /** Onde lente autour du point : signale un état vivant (« En direct »). */
  pulse?: boolean
  size?: number
}

export function StatusDot({ color, pulse = false, size = 8 }: StatusDotProps) {
  const { colors } = useTheme()
  const reduceMotion = useReducedMotion()
  const wave = useSharedValue(0)
  const animate = pulse && !reduceMotion

  useEffect(() => {
    if (!animate) {
      cancelAnimation(wave)
      wave.set(0)
      return
    }
    wave.set(withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false))
    return () => cancelAnimation(wave)
  }, [animate, wave])

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - wave.value),
    transform: [{ scale: 1 + wave.value * 1.6 }],
  }))

  return (
    <View style={{ width: size, height: size }}>
      {animate && (
        <Animated.View style={[styles.fill, { borderRadius: size / 2, backgroundColor: colors[color] }, ringStyle]} />
      )}
      <View style={[styles.fill, { borderRadius: size / 2, backgroundColor: colors[color] }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
})
