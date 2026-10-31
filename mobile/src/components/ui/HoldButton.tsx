import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { radius, useTheme } from '@/theme'
import { Text } from './Text'

/** Durée d'appui qui confirme l'action (assez courte pour l'urgence, assez longue contre la poche). */
export const HOLD_MS = 1200

interface HoldButtonProps {
  label: string
  hint: string
  onConfirm: () => void
  disabled?: boolean
  loading?: boolean
}

/**
 * Bouton à maintenir : la barre se remplit pendant l'appui, l'action part
 * au bout de HOLD_MS. Évite les alertes déclenchées dans une poche. Un
 * lecteur d'écran déclenche l'action directement (double toucher volontaire).
 */
export function HoldButton({ label, hint, onConfirm, disabled = false, loading = false }: HoldButtonProps) {
  const { colors } = useTheme()
  const progress = useSharedValue(0)
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }))
  const inactive = disabled || loading

  const reset = () => {
    cancelAnimation(progress)
    progress.set(withTiming(0, { duration: 150 }))
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => !inactive && onConfirm()}
      disabled={inactive}
      delayLongPress={HOLD_MS}
      onPressIn={() => {
        Haptics.selectionAsync()
        progress.set(withTiming(1, { duration: HOLD_MS, easing: Easing.linear }))
      }}
      onPressOut={reset}
      onLongPress={() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        reset()
        onConfirm()
      }}
      style={[styles.base, { backgroundColor: colors.brand, opacity: inactive ? 0.5 : 1 }]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: 'rgba(255,255,255,0.28)' }, fill]} />
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={colors.onBrand} />
        ) : (
          <>
            <Text variant="bodyStrong" tone="onBrand">
              {label}
            </Text>
            <Text variant="caption" tone="onBrand">
              {hint}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { height: 72, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  content: { alignItems: 'center', gap: 2 },
})
