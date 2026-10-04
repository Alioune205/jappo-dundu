/**
 * Géométrie de l'onboarding, calculée à partir de la fenêtre et des marges
 * sûres. Partagée avec la transition du splash (src/components/SplashHandoff)
 * pour que le logo du splash atterrisse exactement sur la marque de la barre
 * du haut.
 */
export interface OnboardingLayout {
  topBar: number
  /** Hauteur de la photo (du haut de l'écran, sous la barre de marque). */
  photoHeight: number
  /** Marque de la barre du haut : taille et centre (coordonnées écran). */
  mark: { size: number; centerX: number; centerY: number }
  controlsBottom: number
  compact: boolean
}

const TOP_BAR = 52
const GUTTER = 24
const BRAND = 24
/** Rangée de contrôles (56) + lien de connexion (8 + 48), voir Controls. */
const CONTROLS = 112
/** Texte sous la photo : surtitre, titre sur 2 lignes, description sur 3 lignes. */
const COPY = 236
const COPY_COMPACT = 200

export function onboardingLayout(width: number, height: number, insets: { top: number; bottom: number }): OnboardingLayout {
  const compact = height < 720
  const topBar = insets.top + TOP_BAR
  const controlsBottom = insets.bottom + 12
  // La photo prend tout ce que le texte et les contrôles laissent, sans dépasser le 3:4.
  const available = height - controlsBottom - CONTROLS - (compact ? COPY_COMPACT : COPY)
  const photoHeight = Math.round(Math.max(260, Math.min(available, width * (4 / 3))))
  return {
    topBar,
    photoHeight,
    mark: { size: BRAND, centerX: GUTTER + BRAND / 2, centerY: insets.top + TOP_BAR / 2 },
    controlsBottom,
    compact,
  }
}
