import React from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '@/components/ui/Text'
import { space } from '@/theme'

interface ScreenHeaderProps {
  title: string
  /** Ligne d'état sous le titre (fraîcheur des données, disponibilité…). */
  meta?: React.ReactNode
  right?: React.ReactNode
}

/** En-tête des onglets : grand titre aligné sur la marge, état discret dessous. */
export function ScreenHeader({ title, meta, right }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.lg }]}>
      <View style={styles.row}>
        <Text variant="display" accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {right}
      </View>
      {meta ? <View style={styles.meta}>{meta}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  title: { flexShrink: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 20 },
})
