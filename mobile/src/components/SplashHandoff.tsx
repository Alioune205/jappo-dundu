import React, { useEffect } from 'react'
import { StyleSheet, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { BrandMark } from '@/components/ui/BrandMark'
import { onboardingLayout } from '@/features/onboarding/layout'
import { motion, useTheme } from '@/theme'

/** Taille du logo du splash natif (app.json : expo-splash-screen.imageWidth). */
const SPLASH_MARK = 96

interface SplashHandoffProps {
  /** Premier lancement : le logo rejoint celui de l'onboarding. Sinon : un battement et fondu. */
  toOnboarding: boolean
  onDone: () => void
}

/**
 * Relais du splash natif. Le splash système disparaît instantanément au
 * profit de cette copie exacte (même fond, même logo, même position), qui
 * peut, elle, s'animer :
 * - premier lancement : le logo vole jusqu'à sa place sur le premier écran
 *   de l'onboarding pendant que le fond s'efface — une seule image continue ;
 * - lancements suivants : un battement, puis fondu (moins de 0,5 s).
 */
export function SplashHandoff({ toOnboarding, onDone }: SplashHandoffProps) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const reduceMotion = useReducedMotion()
  const t = useSharedValue(0)
  const beat = useSharedValue(0)

  const target = onboardingLayout(width, height, insets).mark
  const dx = toOnboarding ? target.centerX - width / 2 : 0
  const dy = toOnboarding ? target.centerY - height / 2 : 0
  const endScale = toOnboarding ? target.size / SPLASH_MARK : 1

  useEffect(() => {
    const finish = (done?: boolean) => {
      'worklet'
      if (done) scheduleOnRN(onDone)
    }
    if (reduceMotion) {
      t.set(withTiming(1, { duration: 160 }, finish))
      return
    }
    if (toOnboarding) {
      t.set(withTiming(1, { duration: 620, easing: motion.easeOut }, finish))
    } else {
      const ease = Easing.bezier(0.33, 0, 0.2, 1)
      beat.set(withSequence(
        withTiming(1, { duration: 120, easing: ease }),
        withTiming(0, { duration: 160, easing: ease })
      ))
      t.set(withSequence(withTiming(0, { duration: 260 }), withTiming(1, { duration: 240, easing: motion.easeOut }, finish)))
    }
  }, [beat, onDone, reduceMotion, t, toOnboarding])

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, toOnboarding ? [0.3, 0.85] : [0, 1], [1, 0], 'clamp'),
  }))
  const flies = toOnboarding && !reduceMotion
  const markStyle = useAnimatedStyle(() => ({
    // En vol, la copie reste opaque jusqu'à l'atterrissage : le vrai logo n'apparaît
    // dessous qu'à 85 % du vol (copie à moins d'un pixel de sa place), puis le relais
    // est retiré. Aucun dédoublement visible.
    opacity: flies ? 1 : interpolate(t.value, [0, 1], [1, 0]),
    transform: [
      { translateX: dx * t.value },
      { translateY: dy * t.value },
      { scale: (1 + (endScale - 1) * t.value) * (1 + beat.value * 0.08) },
    ],
  }))

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas }, backdropStyle]} />
      <Animated.View style={[styles.center, markStyle]}>
        <BrandMark size={SPLASH_MARK} />
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
})
