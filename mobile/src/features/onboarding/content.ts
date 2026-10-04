/**
 * Contenu de l'onboarding : l'histoire d'un don en quatre photos réelles.
 *
 * Photos : Unsplash (licence Unsplash, usage commercial libre) — crédits dans
 * mobile/assets/onboarding/CREDITS.md. Chaque promesse du texte correspond à
 * une règle réelle du backend (sang/services.py, sang/eligibility.py).
 */
import type { ImageSourcePropType } from 'react-native'

export type SlideKey = 'need' | 'alert' | 'donate' | 'impact'

export interface Slide {
  key: SlideKey
  photo: ImageSourcePropType
  eyebrow: string
  title: string
  body: string
}

export const SLIDES: readonly Slide[] = [
  {
    key: 'need',
    photo: require('../../../assets/onboarding/need.jpg'),
    eyebrow: 'Chaque jour, au Sénégal',
    title: 'Un hôpital manque de sang.',
    body: 'Accident, accouchement difficile, anémie sévère : certaines transfusions ne peuvent pas attendre.',
  },
  {
    key: 'alert',
    photo: require('../../../assets/onboarding/alert.jpg'),
    eyebrow: 'Vous êtes prévenu',
    title: 'L’alerte arrive en quelques secondes.',
    body: 'Seulement si votre groupe est compatible et l’hôpital proche. Votre position n’est jamais transmise aux hôpitaux.',
  },
  {
    key: 'donate',
    photo: require('../../../assets/onboarding/donate.jpg'),
    eyebrow: 'Vous répondez',
    title: 'Un geste pour dire « j’arrive ».',
    body: 'L’hôpital sait aussitôt qu’il peut compter sur vous. Vous avez l’itinéraire et son numéro.',
  },
  {
    key: 'impact',
    photo: require('../../../assets/onboarding/impact.jpg'),
    eyebrow: 'Votre don',
    title: 'Une poche, jusqu’à trois vies.',
    body: 'Globules rouges, plasma, plaquettes : votre don soigne trois patients. Inscription en une minute.',
  },
] as const
