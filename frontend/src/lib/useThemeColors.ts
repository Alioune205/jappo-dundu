import { useMemo } from 'react'
import { useTheme } from '@/context/ThemeContext'

export interface ThemeColors {
  canvas: string
  surface: string
  raised: string
  line: string
  lineStrong: string
  fg: string
  muted: string
  subtle: string
  critical: string
  warning: string
  ok: string
  info: string
}

/**
 * Valeurs résolues des variables de thème (index.css), pour les bibliothèques
 * qui exigent des couleurs littérales (Recharts). Recalculées à chaque bascule.
 */
export function useThemeColors(): ThemeColors {
  const { theme } = useTheme()

  return useMemo(() => {
    const style = getComputedStyle(document.documentElement)
    const read = (name: string) => style.getPropertyValue(name).trim()
    return {
      canvas: read('--canvas'),
      surface: read('--surface'),
      raised: read('--raised'),
      line: read('--line'),
      lineStrong: read('--line-strong'),
      fg: read('--fg'),
      muted: read('--fg-muted'),
      subtle: read('--fg-subtle'),
      critical: read('--critical'),
      warning: read('--warning'),
      ok: read('--ok'),
      info: read('--info'),
    }
    // `theme` est la seule dépendance réelle : la classe du document change avec lui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])
}
