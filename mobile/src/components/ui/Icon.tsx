import React from 'react'
import Svg, { Circle, Path } from 'react-native-svg'
import { useTheme, type Palette } from '@/theme'

/**
 * Pictogrammes au trait (grille 24, trait 1,8, extrémités arrondies), dessinés
 * pour l'application : un seul jeu cohérent, sans police d'icônes à charger.
 */
const PATHS = {
  pulse: 'M3 12h4l2.2-5 3.6 10 2.4-5H21',
  clock: 'M12 7.5V12l3 2',
  user: 'M5 19.5c1.3-3 3.9-4.5 7-4.5s5.7 1.5 7 4.5',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z',
  phone: 'M6.6 3.5h2.7l1.4 4.1-2 1.3a12 12 0 0 0 6.4 6.4l1.3-2 4.1 1.4v2.7a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z',
  route: 'M5 20l7-16 7 16-7-4z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  chevron: 'M9.5 6l6 6-6 6',
  bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5h4',
  drop: 'M12 3.5s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z',
  logout: 'M14 4.5h4.5v15H14M10 8l-4 4 4 4M6 12h9.5',
  edit: 'M4.5 19.5h4l10-10-4-4-10 10zM13 7l4 4',
  location: 'M12 3v3M12 18v3M3 12h3M18 12h3',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z',
  eyeOff: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM4.5 4.5l15 15',
  lock: 'M6.5 10.5h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  calendar: 'M5.5 6.5h13a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM4.5 10.5h15M9 4.5v4M15 4.5v4',
  shield: 'M12 3.5l7 3v5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9v-5z',
} as const

export type IconName = keyof typeof PATHS

interface IconProps {
  name: IconName
  size?: number
  color?: keyof Palette
  strokeWidth?: number
}

export function Icon({ name, size = 22, color = 'fg', strokeWidth = 1.8 }: IconProps) {
  const { colors } = useTheme()
  const stroke = colors[color]
  const common = { stroke, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={PATHS[name]} {...common} />
      {name === 'clock' && <Circle cx={12} cy={12} r={8.5} {...common} />}
      {name === 'user' && <Circle cx={12} cy={8.5} r={3.5} {...common} />}
      {name === 'pin' && <Circle cx={12} cy={10} r={2.3} {...common} />}
      {name === 'location' && <Circle cx={12} cy={12} r={5.5} {...common} />}
      {(name === 'eye' || name === 'eyeOff') && <Circle cx={12} cy={12} r={3} {...common} />}
    </Svg>
  )
}
