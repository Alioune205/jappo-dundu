import React, { useEffect } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { BrandMark } from '@/components/ui/BrandMark'
import { Icon } from '@/components/ui/Icon'
import { Text } from '@/components/ui/Text'
import { motion, radius, space, useTheme } from '@/theme'

/**
 * Entrée en cascade : chaque bloc arrive 70 ms après le précédent, glissement de 12 dp.
 * Sur le web, Reanimated ne gère proprement que ses animations prédéfinies :
 * avec des valeurs initiales personnalisées, son nettoyage fige l'élément en
 * position absolue (les blocs se chevauchent après une saisie). Le web garde
 * donc le glissement par défaut.
 */
export function enter(step: number) {
  const animation = FadeInDown.duration(motion.slow).delay(120 + step * motion.stagger).easing(motion.easeOut)
  return Platform.OS === 'web' ? animation : animation.withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] })
}

interface AuthShellProps {
  title: string
  subtitle: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** Bouton retour (absent si l'écran est le premier de la pile). */
  onBack?: () => void
  /** Parcours en plusieurs étapes : barre de progression en haut. */
  step?: { current: number; total: number }
  /** Marque animée au-dessus du titre (écran de connexion). */
  hero?: boolean
}

/**
 * Cadre des écrans de connexion, d'inscription et de profil donneur : retour
 * en haut à gauche, étape en cours à droite, grand titre, puis le formulaire
 * qui arrive en cascade.
 */
export function AuthShell({ title, subtitle, children, footer, onBack, step, hero }: AuthShellProps) {
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.topBar, { paddingTop: insets.top, height: insets.top + 60 }]}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            style={({ pressed }) => [styles.back, { backgroundColor: pressed ? colors.lineStrong : colors.raised }]}
          >
            <Icon name="arrowLeft" size={20} />
          </Pressable>
        ) : hero ? (
          <View />
        ) : (
          <BrandMark size={28} />
        )}
        {step ? <StepBar current={step.current} total={step.total} /> : null}
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {hero ? (
          <Animated.View entering={enter(0)}>
            <Hero />
          </Animated.View>
        ) : null}
        <Animated.View entering={enter(0)} style={styles.header}>
          <Text variant="display" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="body" tone="muted">
            {subtitle}
          </Text>
        </Animated.View>
        {children}
        {footer ? <Animated.View entering={enter(9)} style={styles.footer}>{footer}</Animated.View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

/** Étape du parcours : segments qui se remplissent, libellé « 1 / 2 ». */
function StepBar({ current, total }: { current: number; total: number }) {
  const { colors } = useTheme()
  const fill = useSharedValue(0)
  useEffect(() => {
    fill.set(withDelay(200, withTiming(1, { duration: 600, easing: motion.easeOut })))
  }, [fill])
  const activeStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }))
  return (
    <View style={styles.steps} accessible accessibilityLabel={`Étape ${current} sur ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.segment, { backgroundColor: colors.line }]}>
          {i < current - 1 ? (
            <View style={[styles.segmentFill, { width: '100%', backgroundColor: colors.brand }]} />
          ) : i === current - 1 ? (
            <Animated.View style={[styles.segmentFill, { backgroundColor: colors.brand }, activeStyle]} />
          ) : null}
        </View>
      ))}
      <Text variant="mono" tone="muted">
        {current}/{total}
      </Text>
    </View>
  )
}

/** La marque dans un halo qui respire : le même battement que l'onboarding. */
function Hero() {
  const { colors } = useTheme()
  const reduceMotion = useReducedMotion()
  const wave = useSharedValue(0)
  useEffect(() => {
    if (reduceMotion) return
    wave.set(withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1, false))
    return () => cancelAnimation(wave)
  }, [reduceMotion, wave])
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - wave.value), transform: [{ scale: 1 + wave.value * 0.45 }] }))
  return (
    <View style={styles.hero}>
      <Animated.View style={[styles.heroRing, { borderColor: colors.brand }, ringStyle]} />
      <View style={[styles.heroDisc, { backgroundColor: colors.brandSoft }]}>
        <BrandMark size={40} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  steps: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  segment: { width: 28, height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  segmentFill: { height: 4, borderRadius: radius.pill },
  content: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.lg },
  header: { gap: space.sm, marginBottom: space.sm },
  footer: { alignItems: 'center', marginTop: space.sm },
  // Marge : l'onde s'étend jusqu'à 1,45 fois le disque sans être rognée par le défilement.
  hero: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', marginTop: space.lg, marginBottom: space.sm },
  heroRing: { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 1.5 },
  heroDisc: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
})
