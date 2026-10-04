import React from 'react'
import Svg, { Path, Rect } from 'react-native-svg'
import { useTheme } from '@/theme'

/**
 * Marque Jappo Dundu : la croix blanche sur carré rouge de l'interface web
 * (même géométrie : viewBox 24, bras 5→19, trait 3).
 */
export function BrandMark({ size = 32 }: { size?: number }) {
  const { colors } = useTheme()
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Jappo Dundu">
      <Rect width={24} height={24} rx={5.5} fill={colors.brand} />
      <Path d="M12 6.5v11M6.5 12h11" stroke={colors.onBrand} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  )
}
