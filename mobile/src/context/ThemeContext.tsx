import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { palettes, type Palette } from '@/theme/tokens'

export type ThemeMode = 'system' | 'light' | 'dark'

export interface ThemeContextValue {
  scheme: 'light' | 'dark'
  themeMode: ThemeMode
  colors: Palette
  setThemeMode: (mode: ThemeMode) => Promise<void>
  toggleTheme: () => Promise<void>
}

const STORAGE_KEY = '@jappo_theme_mode'

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light'
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setThemeModeState(stored)
        }
      })
      .catch(() => undefined)
  }, [])

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode)
    try {
      await AsyncStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // Ignorer erreur de stockage local
    }
  }, [])

  const scheme: 'light' | 'dark' = useMemo(() => {
    if (themeMode === 'system') return systemScheme
    return themeMode
  }, [themeMode, systemScheme])

  const toggleTheme = useCallback(async () => {
    const next = scheme === 'dark' ? 'light' : 'dark'
    await setThemeMode(next)
  }, [scheme, setThemeMode])

  const colors = useMemo(() => palettes[scheme], [scheme])

  const value = useMemo(
    () => ({ scheme, themeMode, colors, setThemeMode, toggleTheme }),
    [scheme, themeMode, colors, setThemeMode, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    return {
      scheme: 'light',
      themeMode: 'system',
      colors: palettes.light,
      setThemeMode: async () => {},
      toggleTheme: async () => {},
    }
  }
  return context
}
