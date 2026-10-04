import React, { useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { radius, space, useTheme } from '@/theme'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'

export interface Option<T extends string> {
  value: T
  label: string
}

interface SelectFieldProps<T extends string> {
  label: string
  value: T | null
  options: readonly Option<T>[]
  onChange: (value: T) => void
  placeholder?: string
  error?: string
  icon?: IconName
}

/** Liste de choix : champ identique aux champs texte, liste en feuille modale. */
export function SelectField<T extends string>({ label, value, options, onChange, placeholder = 'Choisir', error, icon }: SelectFieldProps<T>) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <View style={styles.wrapper}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label} : ${selected?.label ?? 'non renseigné'}`}
        style={[styles.field, { backgroundColor: colors.raised, borderColor: error ? colors.brand : colors.raised }]}
      >
        {icon ? <Icon name={icon} size={20} color={error ? 'brand' : 'subtle'} /> : null}
        <Text variant="body" tone={selected ? 'fg' : 'subtle'} style={styles.value}>
          {selected?.label ?? placeholder}
        </Text>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path d="M6 9l6 6 6-6" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </Pressable>
      {error ? (
        <Text variant="caption" tone="brand">
          {error}
        </Text>
      ) : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Fermer la liste" />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + space.md, borderColor: colors.line }]}>
          <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
          <Text variant="heading" style={styles.sheetTitle}>
            {label}
          </Text>
          <FlatList
            data={options}
            keyExtractor={(item) => item.value}
            renderItem={({ item }) => {
              const isSelected = item.value === value
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.value)
                    setOpen(false)
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={({ pressed }) => [styles.option, { backgroundColor: pressed ? colors.raised : 'transparent' }]}
                >
                  <Text variant="body" tone={isSelected ? 'brand' : 'fg'}>
                    {item.label}
                  </Text>
                  {isSelected ? (
                    <Svg width={18} height={18} viewBox="0 0 24 24">
                      <Path d="M5 12l5 5 9-10" stroke={colors.brand} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </Svg>
                  ) : null}
                </Pressable>
              )
            }}
          />
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { gap: space.xs + 2 },
  field: {
    height: 56,
    borderRadius: radius.md + 4,
    borderWidth: 1.5,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  value: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { maxHeight: '70%', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: 1 },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: space.sm },
  sheetTitle: { paddingHorizontal: space.xl, paddingVertical: space.md },
  option: {
    height: 52,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
