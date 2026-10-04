import React from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { SlideInDown } from 'react-native-reanimated'
import { motion, radius, space, useTheme } from '@/theme'

interface SheetProps {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
  /** Libellé lu par le lecteur d'écran à l'ouverture. */
  label: string
}

/** Feuille modale basse : le fond s'assombrit, la feuille monte et se pose sans rebond. */
export function Sheet({ visible, onClose, children, label }: SheetProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer" />
      <Animated.View
        entering={SlideInDown.duration(motion.slow).easing(motion.easeOut)}
        accessibilityViewIsModal
        accessibilityLabel={label}
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, borderColor: colors.line, paddingBottom: insets.bottom + space.lg },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
        {children}
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    borderTopWidth: 1,
    paddingHorizontal: space.xl,
  },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: space.sm, marginBottom: space.lg },
})
