import React from 'react'
import { Image } from 'react-native'
import { useTheme } from '@/theme'

const LIGHT = require('../../../assets/logo-mark.png')
// Variante sombre : le bleu marine du logo devient clair pour rester lisible.
const DARK = require('../../../assets/logo-mark-dark.png')

/**
 * Symbole Jappo Dundu (cœur, goutte de sang, pouls, main), même fichier que le web.
 * `onDark` : posé sur une photo ou un fond sombre, quel que soit le thème.
 */
export function BrandMark({ size = 32, onDark = false }: { size?: number; onDark?: boolean }) {
  const { scheme } = useTheme()
  return (
    <Image
      source={onDark || scheme === 'dark' ? DARK : LIGHT}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityLabel="Jappo Dundu"
    />
  )
}
