import { useColorScheme } from 'react-native'
import { palettes, type Palette } from './tokens'

export * from './tokens'

export interface Theme {
  scheme: 'light' | 'dark'
  colors: Palette
}

/** Thème du système (clair / sombre), recalculé quand l'utilisateur change de mode. */
export function useTheme(): Theme {
  const scheme = useColorScheme() === 'light' ? 'light' : 'dark'
  return { scheme, colors: palettes[scheme] }
}
