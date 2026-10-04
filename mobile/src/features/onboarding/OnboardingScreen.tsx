import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Haptics from 'expo-haptics'
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { BrandMark } from '@/components/ui/BrandMark'
import { Text } from '@/components/ui/Text'
import { useOnboarding } from '@/context/OnboardingContext'
import { motion, radius, space, useTheme } from '@/theme'
import { SLIDES } from './content'
import { Controls } from './Controls'
import { onboardingLayout } from './layout'
import { Slide } from './Slide'

const COUNT = SLIDES.length
const LAST = COUNT - 1

/**
 * Onboarding du premier lancement : l'histoire d'un don en quatre scènes
 * illustrées (pénurie, alerte, réponse, impact), puis l'inscription : le
 * bouton « Commencer » s'agrandit jusqu'à devenir l'écran suivant.
 *
 * Tout le mouvement dérive de `progress` (position du défilement, sur le
 * thread UI). L'état React ne change qu'au passage d'un écran à l'autre
 * (`active`) : quatre rendus pour tout le parcours, pas un par image.
 */
export function OnboardingScreen() {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const reduceMotion = useReducedMotion()
  const router = useRouter()
  const { complete } = useOnboarding()
  const layout = onboardingLayout(width, height, insets)

  const scrollRef = useRef<Animated.ScrollView>(null)
  const progress = useSharedValue(0)
  const intro = useSharedValue(reduceMotion ? 1 : 0)
  const leave = useSharedValue(0)
  const [active, setActive] = useState(0)
  // Transition « Commencer » : le bouton grandit jusqu'à couvrir l'écran.
  const reveal = useSharedValue(0)
  // Les scènes attendent la fin de l'entrée : le logo du splash se pose sur
  // l'enseigne de l'hôpital, puis le décor se construit autour.
  const [introDone, setIntroDone] = useState(reduceMotion)
  const leaving = useRef(false)

  // Entrée : le logo du splash vient de se poser, le reste arrive en cascade.
  useEffect(() => {
    if (reduceMotion) return
    intro.set(withDelay(
      120,
      withTiming(1, { duration: 900, easing: motion.easeOut }, (finished) => {
        if (finished) scheduleOnRN(setIntroDone, true)
      })
    ))
  }, [intro, reduceMotion])

  const onScroll = useAnimatedScrollHandler((event) => {
    progress.value = event.contentOffset.x / width
  })

  // Changement d'écran : seul passage par le thread JS (retour haptique, lecteur d'écran).
  useAnimatedReaction(
    () => Math.round(progress.value),
    (current, previous) => {
      if (previous !== null && current !== previous) scheduleOnRN(setActive, current)
    }
  )
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    Haptics.selectionAsync()
    AccessibilityInfo.announceForAccessibility(`Écran ${active + 1} sur ${COUNT} : ${SLIDES[active].title}`)
  }, [active])

  const goTo = useCallback(
    (index: number) => {
      scrollRef.current?.scrollTo({ x: Math.max(0, Math.min(LAST, index)) * width, animated: !reduceMotion })
    },
    [reduceMotion, width]
  )

  // Sortie vers l'inscription (« transformation de conteneur ») : le bouton
  // quitte son rouge dès le premier instant, puis la surface grandit jusqu'à
  // devenir l'écran suivant — l'inscription apparaît « dedans ».
  // Vers la connexion : simple effacement du contenu.
  const finish = useCallback(
    (target: '/register' | '/login') => {
      if (leaving.current) return
      leaving.current = true
      complete()
      const navigate = () => router.replace(target)
      if (reduceMotion) return navigate()
      const done = (finished?: boolean) => {
        'worklet'
        if (finished) scheduleOnRN(navigate)
      }
      leave.set(withTiming(1, { duration: motion.base, easing: motion.easeInOut }, target === '/login' ? done : undefined))
      if (target === '/register') reveal.set(withTiming(1, { duration: 560, easing: motion.easeInOut }, done))
    },
    [complete, leave, reduceMotion, reveal, router]
  )

  // Bouton « Commencer » (voir Controls : rangée de 56, bouton de 52 centré, lien de 48 dessous).
  const cta = { top: height - layout.controlsBottom - 112 + 2, left: space.xl, width: width - space.xl * 2, height: 52 }
  const revealStyle = useAnimatedStyle(() => {
    const r = reveal.value
    const e = r * r * (3 - 2 * r)
    return {
      opacity: r > 0 ? 1 : 0,
      top: cta.top * (1 - e),
      left: cta.left * (1 - e),
      width: cta.width + (width - cta.width) * e,
      height: cta.height + (height - cta.height) * e,
      borderRadius: radius.md * (1 - e),
      backgroundColor: interpolateColor(r, [0, 0.16, 0.7, 1], [colors.brand, colors.surface, colors.surface, colors.canvas]),
    }
  })
  const revealLabelStyle = useAnimatedStyle(() => ({ opacity: 1 - interpolate(reveal.value, [0, 0.12], [0, 1], Extrapolation.CLAMP) }))

  const topStyle = useAnimatedStyle(() => ({ opacity: 1 - leave.value }))
  // La marque n'apparaît qu'à l'atterrissage du logo du splash (vol de 620 ms ≈ intro 0,55) :
  // jamais deux logos à l'écran. Le nom et « Passer » arrivent juste après.
  const markStyle = useAnimatedStyle(() => ({ opacity: interpolate(intro.value, [0.5, 0.56], [0, 1], Extrapolation.CLAMP) }))
  const brandTextStyle = useAnimatedStyle(() => ({
    opacity: interpolate(intro.value, [0.5, 0.8], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(intro.value, [0.5, 0.8], [-8, 0], Extrapolation.CLAMP) }],
  }))
  const skipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [LAST - 1, LAST - 0.5], [1, 0], Extrapolation.CLAMP),
  }))
  const bodyStyle = useAnimatedStyle(() => ({
    opacity: 1 - leave.value,
    transform: [{ translateY: -16 * leave.value }],
  }))
  const controlsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(intro.value, [0.55, 1], [0, 1], Extrapolation.CLAMP) * (1 - leave.value * 0.6),
    transform: [{ translateY: interpolate(intro.value, [0.55, 1], [12, 0], Extrapolation.CLAMP) }],
  }))

  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
      {/* Heure et batterie en blanc sur la photo. */}
      <StatusBar style="light" />
      <Animated.View style={[styles.topBar, { paddingTop: insets.top, height: layout.topBar }, topStyle]}>
        <View style={styles.brand}>
          <Animated.View style={markStyle}>
            <BrandMark size={24} />
          </Animated.View>
          <Animated.View style={brandTextStyle}>
            <Text variant="heading" style={styles.onPhoto}>
              Jappo Dundu
            </Text>
          </Animated.View>
        </View>
        <Animated.View style={[skipStyle, brandTextStyle, { pointerEvents: active === LAST ? 'none' : 'auto' }]}>
          <Pressable
            onPress={() => goTo(LAST)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Passer la présentation"
          >
            <Text variant="label" style={styles.onPhoto}>
              Passer
            </Text>
          </Pressable>
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.fill, bodyStyle]}>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          overScrollMode="never"
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          accessibilityRole="adjustable"
        >
          {SLIDES.map((slide, index) => (
            <Slide
              key={slide.key}
              slide={slide}
              index={index}
              count={COUNT}
              progress={progress}
              intro={intro}
              width={width}
              photoHeight={layout.photoHeight}
              active={active === index}
              ambient={introDone}
              reduceMotion={reduceMotion}
              compact={layout.compact}
            />
          ))}
        </Animated.ScrollView>
      </Animated.View>

      <Animated.View style={[styles.controls, { bottom: layout.controlsBottom }, controlsStyle]}>
        <Controls
          progress={progress}
          count={COUNT}
          width={width - space.xl * 2}
          isLast={active === LAST}
          onNext={() => goTo(active + 1)}
          onPrevious={() => goTo(active - 1)}
          onSelect={goTo}
          onStart={() => finish('/register')}
          onLogin={() => finish('/login')}
        />
      </Animated.View>

      <Animated.View style={[styles.reveal, revealStyle]}>
        <Animated.View style={revealLabelStyle}>
          <Text variant="bodyStrong" tone="onBrand">
            Commencer
          </Text>
        </Animated.View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  // Sur la photo (haut assombri) : texte blanc dans les deux thèmes.
  onPhoto: { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 },
  reveal: { position: 'absolute', zIndex: 5, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  controls: { position: 'absolute', left: space.xl, right: space.xl },
})
