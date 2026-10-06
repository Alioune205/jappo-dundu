/**
 * Contenus d'information du donneur. Source : Centre National de Transfusion
 * Sanguine (cnts.gouv.sn, consulté le 6 octobre 2026).
 */
import type { IconName } from '@/components/ui/Icon'

/** Un don de sang total sert jusqu'à trois patients (globules rouges, plasma, plaquettes). */
export const LIVES_PER_DONATION = 3

export const WHY_DONATE: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'heart',
    title: 'Sauver des vies',
    text: 'Un seul don peut aider jusqu’à trois patients : globules rouges, plasma et plaquettes sont séparés.',
  },
  {
    icon: 'hospital',
    title: 'Des besoins chaque jour',
    text: 'Accidents, accouchements, anémies, chirurgie, cancers : les hôpitaux ont besoin de sang tous les jours.',
  },
  {
    icon: 'clock',
    title: 'Un geste simple',
    text: 'Environ 45 minutes en tout, dont une dizaine pour le prélèvement, après un entretien médical confidentiel.',
  },
  {
    icon: 'shield',
    title: 'Sans risque pour vous',
    text: 'Le matériel est stérile et à usage unique. Votre corps reconstitue le volume prélevé en quelques jours.',
  },
]

export const DONOR_CONDITIONS = [
  'Avoir entre 18 et 60 ans',
  'Peser au moins 50 kg',
  'Être en bonne santé le jour du don',
  'Hommes : 3 mois entre deux dons ; femmes : 4 mois',
]

/** « 42 » → « JD-000042 » : identifiant lisible, imprimé sous le QR code. */
export const donorCode = (id: number) => `JD-${String(id).padStart(6, '0')}`
