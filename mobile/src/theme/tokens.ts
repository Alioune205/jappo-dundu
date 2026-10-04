/**
 * Jetons de design de l'application mobile.
 *
 * Mêmes valeurs que l'interface web (frontend/src/index.css) : un donneur qui
 * voit un écran du CNTS et l'application reconnaît le même produit. Le rouge,
 * réservé à la gravité dans la salle de régulation, est ici aussi la couleur
 * de marque (le sang) ; les autres couleurs gardent leur sens.
 */
import { Easing } from 'react-native-reanimated'

export interface Palette {
  canvas: string
  surface: string
  raised: string
  line: string
  lineStrong: string
  fg: string
  muted: string
  subtle: string
  brand: string
  brandSoft: string
  onBrand: string
  warning: string
  ok: string
  info: string
}

export const palettes: Record<'light' | 'dark', Palette> = {
  dark: {
    canvas: '#0A0C0F',
    surface: '#101317',
    raised: '#161A1F',
    line: '#22272E',
    lineStrong: '#30363D',
    fg: '#E6EDF3',
    muted: '#8D96A0',
    subtle: '#5F6873',
    brand: '#F04438',
    brandSoft: 'rgba(240, 68, 56, 0.14)',
    onBrand: '#FFFFFF',
    warning: '#F79009',
    ok: '#17B26A',
    info: '#4E9BFF',
  },
  light: {
    canvas: '#F4F5F7',
    surface: '#FFFFFF',
    raised: '#F0F1F4',
    line: '#E1E4E8',
    lineStrong: '#C9CED6',
    fg: '#0D1117',
    muted: '#57606A',
    subtle: '#8B949E',
    brand: '#D92D20',
    brandSoft: 'rgba(217, 45, 32, 0.10)',
    onBrand: '#FFFFFF',
    warning: '#B54708',
    ok: '#067647',
    info: '#175CD3',
  },
}

/** Familles chargées par expo-font (voir src/app/_layout.tsx). */
export const fonts = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  mono: 'IBMPlexMono_500Medium',
} as const

/** Échelle typographique (tailles en dp, interlignage explicite pour un rythme vertical régulier). */
export const type = {
  display: { fontFamily: fonts.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  eyebrow: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 16, letterSpacing: 1.4, textTransform: 'uppercase' as const },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, letterSpacing: 0.2 },
} as const

/** Grille de 4 dp. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const

/**
 * Tempo du mouvement : courtes durées, décélération franche (les éléments
 * arrivent vite et se posent en douceur), ressort sans rebond visible.
 */
export const motion = {
  fast: 160,
  base: 260,
  slow: 420,
  stagger: 70,
  easeOut: Easing.bezier(0.22, 1, 0.36, 1),
  easeInOut: Easing.bezier(0.65, 0, 0.35, 1),
  spring: { damping: 20, stiffness: 220, mass: 0.9 },
  press: { damping: 18, stiffness: 420, mass: 0.6 },
} as const
