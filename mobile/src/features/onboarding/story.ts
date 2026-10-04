/**
 * Horloges de l'onboarding photographique.
 *
 * - `usePlay` : 0 → 1 quand l'écran devient actif (les éléments d'interface
 *   posés sur la photo se jouent), remis à zéro quand il ne l'est plus ;
 * - `useLoop` : boucle d'ambiance (point qui pulse), écran actif seulement.
 * Mouvement réduit : état final d'emblée, aucune boucle.
 */
import { useEffect } from 'react'
import { cancelAnimation, Easing, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated'

export function win(value: number, a: number, b: number) {
  'worklet'
  return Math.min(1, Math.max(0, (value - a) / (b - a)))
}

export function easeOut(t: number) {
  'worklet'
  return 1 - Math.pow(1 - t, 3)
}

/** Léger dépassement puis retour : arrivée « posée » d'une carte. */
export function easeOutBack(t: number) {
  'worklet'
  const c = 1.3
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

export function usePlay(active: boolean, reduceMotion: boolean, duration: number, delay = 250) {
  const play = useSharedValue(reduceMotion ? 1 : 0)
  useEffect(() => {
    if (reduceMotion) {
      play.set(1)
      return
    }
    if (!active) {
      cancelAnimation(play)
      play.set(0)
      return
    }
    play.set(withDelay(delay, withTiming(1, { duration, easing: Easing.linear })))
  }, [active, delay, duration, play, reduceMotion])
  return play
}

export function useLoop(enabled: boolean, duration: number) {
  const loop = useSharedValue(0)
  useEffect(() => {
    if (!enabled) {
      cancelAnimation(loop)
      loop.set(0)
      return
    }
    loop.set(withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false))
    return () => cancelAnimation(loop)
  }, [enabled, duration, loop])
  return loop
}
