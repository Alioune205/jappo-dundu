import React from 'react'
import { StyleSheet, View } from 'react-native'
import { fonts, radius, useTheme } from '@/theme'
import type { BloodGroup } from '@/types/api'
import { Text } from './Text'

/** « O- » → « O− » : vrai signe moins, de la largeur du « + ». */
export const formatGroup = (group: BloodGroup | string) => group.replace('-', '−')

/** Lecture vocale sans ambiguïté (« O négatif » plutôt que « O tiret »). */
export const spokenGroup = (group: BloodGroup | string) =>
  `${group.replace(/[+-]$/, '')} ${group.endsWith('-') ? 'négatif' : 'positif'}`

interface BloodGroupBadgeProps {
  group: BloodGroup
  size?: number
  muted?: boolean
}

/** Pastille du groupe sanguin : l'information que le donneur lit en premier. */
export function BloodGroupBadge({ group, size = 48, muted = false }: BloodGroupBadgeProps) {
  const { colors } = useTheme()
  return (
    <View
      accessibilityLabel={`Groupe ${spokenGroup(group)}`}
      style={[
        styles.badge,
        { width: size, height: size, backgroundColor: muted ? colors.raised : colors.brandSoft, borderRadius: size > 56 ? radius.lg : radius.md },
      ]}
    >
      <Text
        style={{ fontFamily: fonts.semibold, fontSize: size * 0.36, lineHeight: size * 0.44, letterSpacing: -0.4 }}
        tone={muted ? 'muted' : 'brand'}
      >
        {formatGroup(group)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
})
