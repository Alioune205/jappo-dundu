import React, { forwardRef, useEffect, useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { fonts, motion, radius, space, useTheme } from '@/theme'
import { Text } from './Text'

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  length?: number
  error?: string
  /** Incrémenté par l'écran à chaque refus : le champ « fait non ». */
  shakeKey?: number
  autoFocus?: boolean
}

/**
 * Code à usage unique : une case par chiffre. Un seul champ invisible reçoit
 * la saisie (collage et remplissage automatique du SMS compris) ; la case en
 * cours porte le liseré de marque et un curseur qui clignote.
 */
export const OtpInput = forwardRef<TextInput, OtpInputProps>(function OtpInput(
  { value, onChange, length = 6, error, shakeKey = 0, autoFocus = false },
  ref
) {
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)
  const shake = useSharedValue(0)
  const inputRef = React.useRef<TextInput>(null)
  React.useImperativeHandle(ref, () => inputRef.current as TextInput)

  useEffect(() => {
    if (!shakeKey) return
    shake.set(withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(9, { duration: 70 }),
      withTiming(-6, { duration: 70 }),
      withTiming(0, { duration: 60 })
    ))
  }, [shake, shakeKey])
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }))

  return (
    <View style={styles.wrapper}>
      <View>
        <Animated.View style={[styles.row, rowStyle]}>
          {Array.from({ length }, (_, i) => (
            <Cell
              key={i}
              digit={value[i] ?? ''}
              active={focused && (i === value.length || (i === length - 1 && value.length === length))}
              error={!!error}
              colors={colors}
            />
          ))}
        </Animated.View>
        <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        accessibilityLabel={`Code à ${length} chiffres`}
        style={styles.hidden}
        />
      </View>
      {error ? (
        <Text variant="caption" tone="brand" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  )
})

function Cell({ digit, active, error, colors }: { digit: string; active: boolean; error: boolean; colors: ReturnType<typeof useTheme>['colors'] }) {
  const pop = useSharedValue(1)
  const caret = useSharedValue(1)

  useEffect(() => {
    if (digit) pop.set(withSequence(withTiming(1.12, { duration: 80 }), withSpring(1, motion.spring)))
  }, [digit, pop])
  useEffect(() => {
    caret.set(active ? withRepeat(withSequence(withTiming(0, { duration: 450 }), withTiming(1, { duration: 450 })), -1) : 1)
  }, [active, caret])

  const cellStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }))
  const caretStyle = useAnimatedStyle(() => ({ opacity: caret.value }))

  return (
    <Animated.View
      style={[
        styles.cell,
        {
          backgroundColor: active ? colors.surface : colors.raised,
          borderColor: error ? colors.brand : active ? colors.brand : digit ? colors.lineStrong : colors.raised,
        },
        cellStyle,
      ]}
    >
      {digit ? (
        <Text style={styles.digit}>{digit}</Text>
      ) : active ? (
        <Animated.View style={[styles.caret, { backgroundColor: colors.brand }, caretStyle]} />
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrapper: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  cell: {
    flex: 1,
    height: 60,
    borderRadius: radius.md + 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30 },
  caret: { width: 2, height: 26, borderRadius: 1 },
  // Champ réel, invisible, posé sur les cases : il reçoit le toucher, le clavier,
  // le collage et l'autoremplissage du SMS.
  hidden: { ...StyleSheet.absoluteFill, opacity: 0.01, color: 'transparent' },
})
