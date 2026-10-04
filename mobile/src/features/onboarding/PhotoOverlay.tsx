import React, { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import Svg, { Path } from 'react-native-svg'
import Animated, { useAnimatedReaction, useAnimatedStyle, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { BrandMark } from '@/components/ui/BrandMark'
import { Text } from '@/components/ui/Text'
import { fonts, palettes } from '@/theme'
import type { SlideKey } from './content'
import { easeOut, easeOutBack, useLoop, usePlay, win } from './story'

interface OverlayProps {
  kind: SlideKey
  active: boolean
  reduceMotion: boolean
}

/**
 * Interface réelle de l'application posée sur la photo : ce que la personne
 * de l'image vit à cet instant. Cartes « verre fumé », lisibles sur toutes
 * les photos et dans les deux thèmes.
 */
export function PhotoOverlay({ kind, active, reduceMotion }: OverlayProps) {
  if (kind === 'need') return <NeedOverlay active={active} reduceMotion={reduceMotion} />
  if (kind === 'alert') return <AlertOverlay active={active} reduceMotion={reduceMotion} />
  if (kind === 'donate') return <DonateOverlay active={active} reduceMotion={reduceMotion} />
  return <ImpactOverlay active={active} reduceMotion={reduceMotion} />
}

type Props = Omit<OverlayProps, 'kind'>

const RED = palettes.dark.brand
const GREEN = palettes.dark.ok
const AMBER = palettes.dark.warning
const BLUE = palettes.dark.info

/** Entrée d'une carte : monte de 24 dp avec un léger rebond, fenêtre [from, from + 0.18]. */
function useRise(play: SharedValue<number>, from: number) {
  return useAnimatedStyle(() => {
    const t = win(play.value, from, from + 0.18)
    return { opacity: win(play.value, from, from + 0.06), transform: [{ translateY: (1 - easeOutBack(t)) * 24 }] }
  })
}

function Pulse({ color, active, reduceMotion, size = 8 }: { color: string; active: boolean; reduceMotion: boolean; size?: number }) {
  const loop = useLoop(active && !reduceMotion, 1400)
  const ring = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - loop.value), transform: [{ scale: 1 + loop.value * 1.8 }] }))
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size, backgroundColor: color }, ring]} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: size, backgroundColor: color }]} />
    </View>
  )
}

/** 1 — Urgence : le stock du CHU fond sous nos yeux. */
function NeedOverlay({ active, reduceMotion }: Props) {
  const play = usePlay(active, reduceMotion, 2200, 400)
  const card = useRise(play, 0)
  const level = useAnimatedStyle(() => ({ width: `${62 - 50 * easeOut(win(play.value, 0.25, 0.85))}%` }))
  const [units, setUnits] = useState(reduceMotion ? 2 : 9)
  useAnimatedReaction(
    () => Math.round(9 - 7 * easeOut(win(play.value, 0.25, 0.85))),
    (now, before) => {
      if (now !== before) scheduleOnRN(setUnits, now)
    }
  )
  return (
    <Animated.View style={[styles.glass, card]}>
      <View style={styles.row}>
        <Pulse color={RED} active={active} reduceMotion={reduceMotion} />
        <Text style={styles.eyebrow}>ALERTE · CHU DE FANN</Text>
      </View>
      <Text style={styles.big}>
        Stock O+ : {units} poche{units > 1 ? 's' : ''}
      </Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: RED }, level]} />
      </View>
    </Animated.View>
  )
}

const notify = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

/** 2 — Alerte : la vraie notification arrive (et le téléphone vibre). */
function AlertOverlay({ active, reduceMotion }: Props) {
  const play = usePlay(active, reduceMotion, 1600, 450)
  const card = useRise(play, 0)
  useAnimatedReaction(
    () => play.value > 0.05,
    (now, before) => {
      if (now && before === false) scheduleOnRN(notify)
    }
  )
  return (
    <Animated.View style={[styles.glass, styles.notification, card]}>
      <BrandMark size={34} />
      <View style={styles.flex}>
        <View style={styles.between}>
          <Text style={styles.app}>Jappo Dundu</Text>
          <Text style={styles.muted}>maintenant</Text>
        </View>
        <Text style={styles.title}>Urgence vitale — groupe O+</Text>
        <Text style={styles.muted} numberOfLines={1}>
          CHU de Fann · 2,4 km · 3 poches
        </Text>
      </View>
    </Animated.View>
  )
}

/** 3 — Réponse : « On vous attend », puis l'arrivée estimée. */
function DonateOverlay({ active, reduceMotion }: Props) {
  const play = usePlay(active, reduceMotion, 1800, 400)
  const first = useRise(play, 0)
  const second = useRise(play, 0.35)
  return (
    <View style={styles.stack}>
      <Animated.View style={[styles.pill, { backgroundColor: GREEN }, first]}>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path d="M5 12.5l4.5 4.5L19 7.5" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
        <Text style={styles.pillText}>On vous attend au CHU de Fann</Text>
      </Animated.View>
      <Animated.View style={[styles.glass, styles.pillGlass, second]}>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path d="M5 20l7-16 7 16-7-4z" stroke="#FFFFFF" strokeWidth={1.8} strokeLinejoin="round" fill="none" />
        </Svg>
        <Text style={styles.pillText}>Arrivée estimée · 9 min</Text>
      </Animated.View>
    </View>
  )
}

/** 4 — Impact : le compteur monte jusqu'à trois vies. */
function ImpactOverlay({ active, reduceMotion }: Props) {
  const play = usePlay(active, reduceMotion, 2000, 400)
  const card = useRise(play, 0)
  const [lives, setLives] = useState(reduceMotion ? 3 : 0)
  useAnimatedReaction(
    () => Math.min(3, Math.floor(win(play.value, 0.15, 0.85) * 3.999)),
    (now, before) => {
      if (now !== before) scheduleOnRN(setLives, now)
    }
  )
  useEffect(() => {
    if (lives > 0 && active && !reduceMotion) Haptics.selectionAsync()
  }, [lives, active, reduceMotion])
  return (
    <Animated.View style={[styles.glass, styles.impact, card]}>
      <Text style={styles.counter}>{lives}</Text>
      <View style={styles.flex}>
        <Text style={styles.title}>vie{lives > 1 ? 's' : ''} sauvée{lives > 1 ? 's' : ''} par un don</Text>
        <View style={styles.dots}>
          {[RED, AMBER, BLUE].map((color, i) => (
            <View key={color} style={[styles.dot, { backgroundColor: i < lives ? color : 'rgba(255,255,255,0.18)' }]} />
          ))}
          <Text style={styles.muted}>  globules · plasma · plaquettes</Text>
        </View>
      </View>
    </Animated.View>
  )
}

const WHITE = '#FFFFFF'
const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  glass: {
    backgroundColor: 'rgba(10,12,15,0.72)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  eyebrow: { color: 'rgba(255,255,255,0.75)', fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1.2 },
  big: { color: WHITE, fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.16)', overflow: 'hidden', marginTop: 2 },
  fill: { height: 6, borderRadius: 3 },
  notification: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  app: { color: WHITE, fontFamily: fonts.semibold, fontSize: 13 },
  title: { color: WHITE, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  muted: { color: 'rgba(255,255,255,0.68)', fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17 },
  stack: { gap: 10, alignItems: 'flex-start' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  pillGlass: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  pillText: { color: WHITE, fontFamily: fonts.semibold, fontSize: 14 },
  impact: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  counter: { color: WHITE, fontFamily: fonts.semibold, fontSize: 44, lineHeight: 50, letterSpacing: -1.5, minWidth: 30, textAlign: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
})
