import React from 'react'
import { Text as RNText, type TextProps as RNTextProps } from 'react-native'
import { type, useTheme, type Palette } from '@/theme'

export type TextVariant = keyof typeof type
export type TextTone = 'fg' | 'muted' | 'subtle' | 'brand' | 'onBrand' | 'ok' | 'warning'

export interface TextProps extends RNTextProps {
  variant?: TextVariant
  tone?: TextTone
}

/** Texte typographié : la variante fixe la famille, la taille et l'interlignage. */
export function Text({ variant = 'body', tone = 'fg', style, ...props }: TextProps) {
  const { colors } = useTheme()
  return <RNText {...props} style={[type[variant], { color: colors[tone as keyof Palette] }, style]} />
}
