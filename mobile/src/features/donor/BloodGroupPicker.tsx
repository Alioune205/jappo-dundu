import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { formatGroup, spokenGroup } from '@/components/ui/BloodGroup'
import { Text } from '@/components/ui/Text'
import { BLOOD_GROUPS } from '@/lib/constants'
import { fonts, motion, radius, space, useTheme } from '@/theme'
import type { BloodGroup } from '@/types/api'

interface BloodGroupPickerProps {
  value: BloodGroup | null
  onChange: (group: BloodGroup) => void
  error?: string
}

/**
 * Les huit groupes en grille 4 × 2 : un seul toucher, tout visible d'un coup
 * d'œil (une liste déroulante cacherait le choix le plus important du profil).
 */
export function BloodGroupPicker({ value, onChange, error }: BloodGroupPickerProps) {
  return (
    <View style={styles.wrapper}>
      <Text variant="label" tone="muted">
        Groupe sanguin
      </Text>
      <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Groupe sanguin">
        {BLOOD_GROUPS.map((group) => (
          <GroupCell key={group} group={group} selected={group === value} onPress={() => onChange(group)} invalid={!!error} />
        ))}
      </View>
      {error ? (
        <Text variant="caption" tone="brand" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : (
        <Text variant="caption" tone="subtle">
          Il figure sur votre carte de donneur ou un résultat d’analyse.
        </Text>
      )}
    </View>
  )
}

function GroupCell({ group, selected, invalid, onPress }: { group: BloodGroup; selected: boolean; invalid: boolean; onPress: () => void }) {
  const { colors } = useTheme()
  const scale = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <Animated.View style={[styles.cell, style]}>
      <Pressable
        onPress={() => {
          if (!selected) {
            Haptics.selectionAsync()
            // Petite pulsation de confirmation : la case « bat » une fois.
            scale.set(withSequence(withTiming(0.92, { duration: 90 }), withSpring(1, motion.spring)))
          }
          onPress()
        }}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={spokenGroup(group)}
        style={[
          styles.press,
          {
            backgroundColor: selected ? colors.brand : colors.surface,
            borderColor: selected ? colors.brand : invalid ? colors.brand : colors.lineStrong,
          },
        ]}
      >
        <Text style={styles.label} tone={selected ? 'onBrand' : 'fg'}>
          {formatGroup(group)}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrapper: { gap: space.xs + 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // 4 colonnes : (100 % - 3 gouttières) / 4.
  cell: { width: '22.9%', flexGrow: 1 },
  press: { height: 56, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.semibold, fontSize: 19, lineHeight: 24, letterSpacing: -0.2 },
})
