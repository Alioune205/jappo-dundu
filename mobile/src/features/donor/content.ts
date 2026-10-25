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
  'Hommes : 3 mois entre deux dons, 4 dons par an au plus',
  'Femmes : 4 mois entre deux dons, 3 dons par an au plus',
]

export interface DonationDrive {
  id: string
  title: string
  date: string
  time: string
  location: string
  city: string
  target: string
  organizer: string
  tag: string
}

export const CNTS_DONATION_DRIVES: DonationDrive[] = [
  {
    id: 'ucad-2026',
    title: 'Grande Collecte Universitaire UCAD',
    date: 'Samedi 31 Octobre 2026',
    time: 'De 08h30 à 16h00 (Journée continue)',
    location: 'Campus UCAD II · Devant le Pavillon A, Dakar',
    city: 'Dakar',
    target: 'Objectif : 250 poches pour les urgences',
    organizer: 'Organisé par le CNTS & la Croix-Rouge Sénégalaise',
    tag: 'Collecte Prioritaire',
  },
  {
    id: 'place-nation-2026',
    title: 'Collecte Citoyenne Place de la Nation',
    date: 'Mercredi 4 Novembre 2026',
    time: 'De 09h00 à 17h00 (Sans interruption)',
    location: 'Place de la Nation (Obélisque de Colobane), Dakar',
    city: 'Dakar',
    target: 'Objectif : 180 poches pour les maternités',
    organizer: 'Bus mobile CNTS Sénégal',
    tag: 'Bus Mobile CNTS',
  },
]

/**
 * Contenu du QR code de la carte : le code aléatoire du donneur (jamais son
 * identifiant interne, qui permettrait de parcourir l'annuaire). Le centre de
 * don le lit avec une douchette dans l'interface web (« Enregistrer un don »).
 */
export const cardQrPayload = (cardCode: string) => `JAPPODUNDU:DONNEUR:${cardCode}`
