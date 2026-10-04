import React, { memo, useEffect } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { Text } from '@/components/ui/Text'
import { space, useTheme } from '@/theme'
import type { Slide as SlideContent } from './content'
import { PARALLAX } from './motion'
import { PhotoOverlay } from './PhotoOverlay'

interface SlideProps {
  slide: SlideContent
  index: number
  count: number
  progress: SharedValue<number>
  /** Entrée de l'onboarding (0 → 1), ne concerne que le premier écran visible. */
  intro: SharedValue<number>
  width: number
  photoHeight: number
  active: boolean
  /** Animations d'ambiance autorisées (après l'entrée de l'onboarding). */
  ambient: boolean
  reduceMotion: boolean
  compact: boolean
}

/** Durée du lent zoom « Ken Burns » sur la photo de l'écran actif. */
const KEN_BURNS_MS = 9000

/**
 * Un écran : une photo réelle plein cadre qui respire (zoom lent), l'interface
 * de l'application posée dessus, puis le titre en grand. Au balayage, la
 * photo glisse moins vite que la page (parallaxe) et le texte arrive en
 * décalé, plan par plan.
 */
export const Slide = memo(function Slide({
  slide,
  index,
  count,
  progress,
  intro,
  width,
  photoHeight,
  active,
  ambient,
  reduceMotion,
  compact,
}: SlideProps) {
  const { colors } = useTheme()
  const k = reduceMotion ? 0 : 1
  const zoom = useSharedValue(0)
  const live = active && ambient

  useEffect(() => {
    if (reduceMotion) return
    if (!live) {
      cancelAnimation(zoom)
      zoom.set(withTiming(0, { duration: 600 }))
      return
    }
    zoom.set(withTiming(1, { duration: KEN_BURNS_MS, easing: Easing.out(Easing.quad) }))
  }, [live, reduceMotion, zoom])

  const photoStyle = useAnimatedStyle(() => {
    const offset = Math.max(-1, Math.min(1, index - progress.value))
    // Première ouverture : la photo se révèle en dézoomant (1,18 → 1,04).
    const reveal = interpolate(intro.value, [0.15, 0.85], [0, 1], Extrapolation.CLAMP)
    const scale = 1.02 + 0.14 * (1 - reveal) * k + 0.06 * zoom.value * k
    return {
      opacity: reveal,
      transform: [
        { translateX: -offset * width * 0.45 * k },
        { translateY: -zoom.value * 10 * k },
        { scale },
      ],
    }
  })
  const overlayStyle = useAnimatedStyle(() => {
    const offset = Math.max(-1, Math.min(1, index - progress.value))
    return {
      opacity: interpolate(Math.abs(offset), [0, 0.5], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: offset * width * 0.25 * k }],
    }
  })
  const eyebrowStyle = useLayerStyle(progress, intro, index, width, PARALLAX.eyebrow * k, 0.35)
  const titleStyle = useLayerStyle(progress, intro, index, width, PARALLAX.title * k, 0.43)
  const bodyStyle = useLayerStyle(progress, intro, index, width, PARALLAX.body * k, 0.51)

  return (
    <View
      style={{ width }}
      accessible
      accessibilityLabel={`Écran ${index + 1} sur ${count}. ${slide.title} ${slide.body}`}
      importantForAccessibility={active ? 'yes' : 'no-hide-descendants'}
    >
      <View style={[styles.photoFrame, { height: photoHeight }]}>
        <Animated.View style={[StyleSheet.absoluteFill, photoStyle]}>
          <Image source={slide.photo} resizeMode="cover" style={styles.photo} />
        </Animated.View>
        {/* Haut assombri (barre de marque lisible), bas fondu dans le fond de l'écran. */}
        <Svg width={width} height={photoHeight} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={`fade-${slide.key}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000000" stopOpacity={0.55} />
              <Stop offset="0.22" stopColor="#000000" stopOpacity={0} />
              <Stop offset="0.55" stopColor={colors.canvas} stopOpacity={0} />
              <Stop offset="0.9" stopColor={colors.canvas} stopOpacity={0.92} />
              <Stop offset="1" stopColor={colors.canvas} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect width={width} height={photoHeight} fill={`url(#fade-${slide.key})`} />
        </Svg>
        <Animated.View style={[styles.overlay, overlayStyle]}>
          <PhotoOverlay kind={slide.key} active={live} reduceMotion={reduceMotion} />
        </Animated.View>
      </View>
      <View style={styles.copy}>
        <Animated.View style={eyebrowStyle}>
          <Text variant="eyebrow" tone="brand">
            {slide.eyebrow}
          </Text>
        </Animated.View>
        <Animated.View style={titleStyle}>
          <Text variant="display" style={compact ? styles.compactTitle : styles.title}>
            {slide.title}
          </Text>
        </Animated.View>
        <Animated.View style={bodyStyle}>
          <Text variant="body" tone="muted" style={compact ? styles.compactBody : undefined}>
            {slide.body}
          </Text>
        </Animated.View>
      </View>
    </View>
  )
})

/**
 * Plan de texte : parallaxe au geste, et entrée en cascade (fenêtre `from` →
 * `from + 0.4` de l'intro). Les valeurs partagées sont lues directement dans
 * le worklet du style : Reanimated ne suit pas celles lues dans une fonction
 * imbriquée, le style resterait figé.
 */
function useLayerStyle(
  progress: SharedValue<number>,
  intro: SharedValue<number>,
  index: number,
  width: number,
  factor: number,
  from: number
) {
  return useAnimatedStyle(() => {
    const offset = Math.max(-1, Math.min(1, index - progress.value))
    const enter = interpolate(intro.value, [from, from + 0.4], [0, 1], Extrapolation.CLAMP)
    return {
      opacity: interpolate(Math.abs(offset), [0, 0.55], [1, 0], Extrapolation.CLAMP) * enter,
      transform: [{ translateX: offset * width * factor }, { translateY: (1 - enter) * 14 }],
    }
  })
}

const styles = StyleSheet.create({
  photoFrame: { overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  overlay: { position: 'absolute', left: space.xl, right: space.xl, bottom: space.xxl },
  copy: { paddingHorizontal: space.xl, gap: space.md, marginTop: -space.sm },
  title: { fontSize: 34, lineHeight: 40, letterSpacing: -0.9 },
  compactTitle: { fontSize: 27, lineHeight: 32, letterSpacing: -0.6 },
  compactBody: { fontSize: 15, lineHeight: 22 },
})
