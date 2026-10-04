import React, { createContext, useCallback, useContext, useState } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

/** Clé partagée avec le script anti-flash de index.html. */
const STORAGE_KEY = 'jappo-dundu.theme'

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Le sombre est le mode par défaut (poste de régulation 24/7). index.html a
  // déjà appliqué la classe avant le rendu : on part de l'état du document.
  const [theme, setThemeState] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  )

  // La classe est posée avant le re-rendu : les composants qui lisent les
  // variables CSS calculées (graphiques) voient déjà les nouvelles valeurs.
  const setTheme = useCallback((next: Theme) => {
    document.documentElement.classList.toggle('dark', next === 'dark')
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Stockage indisponible (navigation privée) : le thème reste en mémoire.
    }
    setThemeState(next)
  }, [])

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light')

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
