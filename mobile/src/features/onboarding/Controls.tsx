import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import Svg, { Path } from 'react-native-svg'
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated'
import { Text } from '@/components/ui/Text'
import { motion, radius, space, useTheme } from '@/theme'
import { Pagination } from './Pagination'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

const ROUND = 56
const CTA_HEIGHT = 52

interface ControlsProps {
  progress: SharedValue<number>
  count: number
  /** Largeur disponible (écran moins les marges). */
  width: number
  isLast: boolean
  onNext: () => void
  onPrevious: () => void
  onSelect: (index: number) => void
  onStart: () => void
  onLogin: () => void
}

/**
 * Barre d'actions de l'onboarding.
 *
 * Le bouton rond « suivant » se transforme en bouton « Commencer » pleine
 * largeur entre l'avant-dernier et le dernier écran : la morphose suit le
 * geste (largeur, rayon et hauteur interpolés), la flèche s'efface avant que
 * le libellé n'apparaisse. La pagination et « précédent » cèdent la place au
 * même rythme ; « J'ai déjà un compte » apparaît dessous.
 */
export function Controls({ progress, count, width, isLast, onNext, onPrevious, onSelect, onStart, onLogin }: ControlsProps) {
  const { colors } = useTheme()
  const last = count - 1
  const pressed = useSharedValue(0)

  const morphStyle = useAnimatedStyle(() => {
    const m = interpolate(progress.value, [last - 1, last], [0, 1], Extrapolation.CLAMP)
    return {
      width: ROUND + (width - ROUND) * m,
      height: ROUND + (CTA_HEIGHT - ROUND) * m,
      borderRadius: ROUND / 2 + (radius.md - ROUND / 2) * m,
      transform: [{ scale: 1 - pressed.value * 0.04 }],
    }
  })
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [last - 1, last - 0.6], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(progress.value, [last - 1, last - 0.6], [0, 10], Extrapolation.CLAMP) }],
  }))
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [last - 0.4, last], [0, 1], Extrapolation.CLAMP),
  }))
  const navStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [last - 1, last - 0.5], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(progress.value, [last - 1, last - 0.5], [0, -12], Extrapolation.CLAMP) }],
  }))
  const backStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.6], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(progress.value, [0, 0.6], [-6, 0], Extrapolation.CLAMP) }],
  }))
  const loginStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [last - 0.5, last], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(progress.value, [last - 0.5, last], [8, 0], Extrapolation.CLAMP) }],
  }))

  return (
    <View style={{ width }}>
      <View style={styles.row}>
        <Animated.View style={[styles.nav, navStyle, { pointerEvents: isLast ? 'none' : 'auto' }]}>
          <Animated.View style={backStyle}>
            <Pressable
              onPress={onPrevious}
              hitSlop={8}
              style={styles.back}
              accessibilityRole="button"
              accessibilityLabel="Écran précédent"
            >
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d="M15 5l-7 7 7 7" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </Svg>
            </Pressable>
          </Animated.View>
          <Pagination progress={progress} count={count} onSelect={onSelect} />
        </Animated.View>

        <AnimatedPressable
          onPress={() => {
            if (isLast) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
              onStart()
            } else {
              onNext()
            }
          }}
          onPressIn={() => {
            pressed.set(withSpring(1, motion.press))
          }}
          onPressOut={() => {
            pressed.set(withSpring(0, motion.press))
          }}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Commencer : créer mon compte' : 'Écran suivant'}
          style={[styles.morph, { backgroundColor: colors.brand }, morphStyle]}
        >
          <Animated.View style={[styles.center, arrowStyle]}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path d="M5 12h13M13 6l6 6-6 6" stroke={colors.onBrand} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Svg>
          </Animated.View>
          <Animated.View style={[styles.center, labelStyle]}>
            <Text variant="bodyStrong" tone="onBrand" numberOfLines={1}>
              Commencer
            </Text>
          </Animated.View>
        </AnimatedPressable>
      </View>

      <Animated.View style={[styles.login, loginStyle, { pointerEvents: isLast ? 'auto' : 'none' }]}>
        <Pressable onPress={onLogin} hitSlop={8} accessibilityRole="button" accessibilityLabel="J’ai déjà un compte : me connecter">
          <Text variant="label" tone="muted">
            J’ai déjà un compte · <Text variant="label" tone="fg">Se connecter</Text>
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { height: ROUND, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  nav: { position: 'absolute', left: 0, flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  morph: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  login: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
})
