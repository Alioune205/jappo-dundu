import React, { forwardRef, useEffect, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native'
import Animated, { FadeIn, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { fonts, motion, radius, space, useTheme } from '@/theme'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'

export interface TextFieldProps extends TextInputProps {
  label: string
  error?: string
  hint?: string
  /** Pictogramme à gauche : il dit ce qu'on attend avant même de lire le libellé. */
  icon?: IconName
  /** Préfixe fixe (ex. « +221 ») affiché avant la saisie. */
  prefix?: string
  /** Mot de passe : saisie masquée et bouton œil pour l'afficher. */
  password?: boolean
}

/**
 * Champ de saisie « rempli » : fond légèrement teinté, pictogramme à gauche,
 * libellé toujours visible au-dessus (jamais remplacé par le texte d'exemple).
 * Au focus, le fond s'éclaircit et un liseré de marque apparaît en fondu ;
 * une erreur garde le liseré rouge et s'affiche sous le champ.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, icon, prefix, password = false, style, onFocus, onBlur, editable = true, ...props },
  ref
) {
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const focus = useSharedValue(0)

  useEffect(() => {
    focus.set(withTiming(focused ? 1 : 0, { duration: motion.fast }))
  }, [focus, focused])

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(focus.value, [0, 1], [colors.raised, colors.surface]),
    borderColor: error ? colors.brand : interpolateColor(focus.value, [0, 1], [colors.raised, colors.brand]),
  }))

  const iconColor = error ? 'brand' : focused ? 'brand' : 'subtle'
  return (
    <View style={styles.wrapper}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Animated.View style={[styles.box, { opacity: editable ? 1 : 0.6 }, boxStyle]}>
        {icon ? <Icon name={icon} size={20} color={iconColor} /> : null}
        {prefix ? (
          <View style={[styles.prefix, { borderRightColor: colors.lineStrong }]}>
            <Text variant="bodyStrong" tone="muted">
              {prefix}
            </Text>
          </View>
        ) : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.subtle}
          selectionColor={colors.brand}
          cursorColor={colors.brand}
          secureTextEntry={password && !revealed}
          autoCapitalize={password ? 'none' : props.autoCapitalize}
          autoCorrect={password ? false : props.autoCorrect}
          editable={editable}
          {...props}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            onBlur?.(e)
          }}
          style={[styles.input, { color: colors.fg }, style]}
        />
        {password ? (
          <Pressable
            onPress={() => setRevealed((value) => !value)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            style={styles.eye}
          >
            <Icon name={revealed ? 'eyeOff' : 'eye'} size={20} color={revealed ? 'fg' : 'subtle'} />
          </Pressable>
        ) : null}
      </Animated.View>
      {error ? (
        <Animated.View entering={FadeIn.duration(motion.fast)}>
          <Text variant="caption" tone="brand" accessibilityLiveRegion="polite">
            {error}
          </Text>
        </Animated.View>
      ) : hint ? (
        <Text variant="caption" tone="subtle">
          {hint}
        </Text>
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  wrapper: { gap: space.xs + 2 },
  box: {
    height: 56,
    borderRadius: radius.md + 4,
    borderWidth: 1.5,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  prefix: { paddingRight: space.md, borderRightWidth: 1, height: 24, justifyContent: 'center' },
  // Pas de contour du navigateur : le liseré animé de la boîte en tient lieu.
  input: { flex: 1, height: '100%', fontFamily: fonts.regular, fontSize: 16, padding: 0, outlineWidth: 0 },
  eye: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
})
