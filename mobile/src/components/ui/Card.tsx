import React from 'react'
import { StyleSheet, View, type ViewProps } from 'react-native'
import { radius, space, useTheme } from '@/theme'

/** Surface : fond surélevé et filet, sans ombre (lisible au soleil comme en mode sombre). */
export function Card({ style, ...props }: ViewProps) {
  const { colors } = useTheme()
  return <View {...props} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, style]} />
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg },
})
