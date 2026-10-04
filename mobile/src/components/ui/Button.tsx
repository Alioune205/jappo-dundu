import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import * as Haptics from 'expo-haptics'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { motion, radius, space, useTheme } from '@/theme'
import { Text } from './Text'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string
  variant?: 'primary' | 'secondary' | 'ghost'
  loading?: boolean
  style?: StyleProp<ViewStyle>
  /** Retour haptique au déclenchement (actions importantes uniquement). */
  haptic?: boolean
}

/**
 * Bouton : légère compression au toucher (ressort sur le thread UI), retour
 * haptique optionnel, état de chargement sans changement de taille.
 */
export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  haptic = false,
  onPress,
  style,
  ...props
}: ButtonProps) {
  const { colors } = useTheme()
  const pressed = useSharedValue(0)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.03 }],
    opacity: 1 - pressed.value * 0.08,
  }))

  const palette = {
    primary: { bg: colors.brand, fg: 'onBrand' as const, border: colors.brand },
    secondary: { bg: colors.surface, fg: 'fg' as const, border: colors.lineStrong },
    ghost: { bg: 'transparent', fg: 'muted' as const, border: 'transparent' },
  }[variant]
  const isDisabled = disabled || loading

  return (
    <AnimatedPressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      onPressIn={() => {
        pressed.set(withSpring(1, motion.press))
      }}
      onPressOut={() => {
        pressed.set(withSpring(0, motion.press))
      }}
      onPress={(event) => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
        onPress?.(event)
      }}
      style={[
        styles.base,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: isDisabled ? 0.5 : 1 },
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onBrand : colors.fg} />
      ) : (
        <Text variant="bodyStrong" tone={palette.fg}>
          {label}
        </Text>
      )}
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    borderRadius: radius.md + 4,
    borderWidth: 1,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
