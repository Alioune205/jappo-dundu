import { useContext } from 'react'
import { useColorScheme } from 'react-native'
import { palettes, type Palette } from './tokens'
import { ThemeContext, type ThemeMode } from '@/context/ThemeContext'

export * from './tokens'
export type { ThemeMode } from '@/context/ThemeContext'

export interface Theme {
  scheme: 'light' | 'dark'
  colors: Palette
  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => Promise<void>
  toggleTheme: () => Promise<void>
}

/** Thème actif de l'application (clair / sombre / système) avec capacité de bascule. */
export function useTheme(): Theme {
  const context = useContext(ThemeContext)
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light'

  if (context) {
    return context
  }

  const scheme = systemScheme
  return {
    scheme,
    colors: palettes[scheme],
    themeMode: 'system',
    setThemeMode: async () => {},
    toggleTheme: async () => {},
  }
}
