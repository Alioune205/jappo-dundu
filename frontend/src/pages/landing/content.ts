/**
 * Contenu de la page d'accueil publique.
 *
 * Informations issues du site officiel du Centre National de Transfusion
 * Sanguine (https://cnts.gouv.sn), consulté le 6 octobre 2026. À tenir à jour
 * avec lui : les règles d'aptitude et l'état des stocks évoluent.
 */

export const SOURCE = {
  name: 'Centre National de Transfusion Sanguine (CNTS)',
  url: 'https://cnts.gouv.sn',
  consulted: '6 octobre 2026',
}

export const KEY_FIGURES = [
  { value: '3', label: 'vies sauvées par un seul don' },
  { value: '45 min', label: 'de votre temps, de l’accueil à la collation' },
  { value: '33', label: 'structures de transfusion au Sénégal' },
  { value: '100 %', label: 'des dons bénévoles, anonymes et gratuits' },
]

export const TICKER = [
  { strong: 'O− et B−', text: 'niveau critique : votre don est attendu' },
  { strong: '1 don', text: 'jusqu’à 3 vies sauvées' },
  { strong: 'Fann', text: 'lun–ven 8 h–17 h · sam 8 h–13 h' },
  { strong: '14 régions', text: 'couvertes par le réseau de transfusion' },
  { strong: '18–60 ans', text: 'et au moins 50 kg pour donner' },
]

export type StockLevel = 'critical' | 'low'

/** Groupes en tension publiés par le CNTS. */
export const BLOOD_NEEDS = {
  updated: '30 septembre 2026',
  groups: [
    { group: 'O−', level: 'critical' as StockLevel, note: 'Donneur universel' },
    { group: 'B−', level: 'critical' as StockLevel, note: 'Groupe rare' },
    { group: 'A+', level: 'low' as StockLevel, note: 'Stock en baisse' },
    { group: 'A−', level: 'low' as StockLevel, note: 'Stock en baisse' },
  ],
}

export const ELIGIBILITY = {
  criteria: [
    { title: '18 à 60 ans', text: 'L’âge requis pour donner son sang.' },
    { title: '50 kg minimum', text: 'Un poids suffisant pour un prélèvement sans risque.' },
    { title: 'Bonne santé', text: 'Un taux d’hémoglobine suffisant, vérifié avant chaque don.' },
    {
      title: 'Bon intervalle',
      text: 'Hommes : tous les 3 mois, 4 fois par an au plus. Femmes : tous les 4 mois, 3 fois par an au plus.',
    },
  ],
  postpone: [
    'Rhume, fièvre ou maladie en cours',
    'Chirurgie récente',
    'Traitement médical lourd',
    'Retour d’un voyage à risque',
    'Grossesse ou accouchement récent',
    'Tatouage ou piercing de moins de 4 mois',
  ],
  note:
    'En cas de doute, un entretien confidentiel avec un professionnel de santé décide de votre aptitude le jour du don.',
}

export const JOURNEY = [
  { step: 'Accueil', duration: '5 min', text: 'Accueil et enregistrement par l’équipe.' },
  { step: 'Entretien', duration: '10 min', text: 'Vérification confidentielle de votre aptitude avec un professionnel de santé.' },
  { step: 'Prélèvement', duration: '8 à 10 min', text: 'Une légère piqûre, puis le don en toute sécurité.' },
  { step: 'Collation', duration: '15 min', text: 'Une pause et une collation offertes avant de repartir.' },
]

export const ADVICE = [
  { when: 'Avant', items: ['Bien dormir', 'Boire de l’eau', 'Manger léger : inutile d’être à jeun'] },
  { when: 'Pendant', items: ['Respirer calmement', 'Signaler tout malaise', 'Suivre les consignes du personnel'] },
  { when: 'Après', items: ['Se reposer', 'Boire et prendre la collation', 'Éviter les efforts physiques'] },
]

export const PRODUCTS = [
  { name: 'Globules rouges', keeps: '42 jours à +4 °C', use: 'Anémies sévères, hémorragies, chirurgie' },
  { name: 'Plasma', keeps: '1 an à −30 °C', use: 'Troubles de la coagulation, grands brûlés' },
  { name: 'Plaquettes', keeps: '5 jours à +22 °C', use: 'Chimiothérapie, leucémies' },
  { name: 'Sang total', keeps: '35 jours', use: 'Urgences et préparation des autres produits' },
]

export const SITES = [
  {
    name: 'CNTS — Siège national',
    city: 'Dakar',
    address: 'Avenue Cheikh Anta Diop, Fann-Résidence',
    hours: 'Lun–ven 8 h–17 h · Sam 8 h–13 h',
    phone: '+221 33 815 17 62',
    lat: 14.6957,
    lng: -17.4657,
  },
  {
    name: 'Centre régional de Kaolack',
    city: 'Kaolack',
    address: 'Léona, près de l’hôpital El Hadji Ibrahima Niass',
    hours: 'Horaires à confirmer auprès du CNTS',
    phone: '+221 33 815 17 62',
    lat: 14.141561,
    lng: -16.07623,
  },
  {
    name: 'Centre régional de Matam',
    city: 'Matam',
    address: 'Tantadji, près de la Direction régionale de la santé',
    hours: 'Horaires à confirmer auprès du CNTS',
    phone: '+221 33 815 17 62',
    lat: 15.660078,
    lng: -13.263137,
  },
]

export const FAQ = [
  {
    q: 'Est-ce que donner son sang fait mal ?',
    a: 'Vous sentez une légère piqûre au moment de l’insertion de l’aiguille, comme pour une prise de sang classique. Le don lui-même n’est pas douloureux.',
  },
  {
    q: 'Combien de temps dure un don ?',
    a: 'Le prélèvement dure 8 à 10 minutes. Comptez environ 45 minutes en tout, de l’accueil à la collation.',
  },
  {
    q: 'Faut-il être à jeun ?',
    a: 'Non. Prenez un repas léger et buvez bien (eau, jus) avant de venir.',
  },
  {
    q: 'À quelle fréquence puis-je donner ?',
    a: 'Les hommes tous les 3 mois (4 fois par an au plus), les femmes tous les 4 mois (3 fois par an au plus) : le temps pour le corps de reconstituer son sang.',
  },
  {
    q: 'Que devient mon sang ?',
    a: 'Il est analysé (groupe sanguin, dépistage du VIH, des hépatites et de la syphilis), puis séparé en globules rouges, plasma et plaquettes, distribués aux hôpitaux.',
  },
  {
    q: 'Serai-je prévenu si mes analyses montrent un problème ?',
    a: 'Oui, un médecin du CNTS vous contacte si une anomalie est détectée.',
  },
  {
    q: 'Quand vais-je recevoir ma carte de donneur ?',
    a: 'Elle vous est remise après votre deuxième don.',
  },
  {
    q: 'Je suis sous traitement, puis-je donner ?',
    a: 'Cela dépend du médicament : le médecin en décide lors de l’entretien confidentiel avant le don.',
  },
]

/** Ce que Jappo Dundu ajoute au parcours du donneur et des hôpitaux. */
export const PLATFORM = [
  {
    name: 'Jappo Sang',
    text: 'Les hôpitaux publient leurs besoins ; les donneurs compatibles les plus proches reçoivent une alerte et répondent en un geste.',
  },
  {
    name: 'Jappo Lits',
    text: 'La disponibilité des lits par service, en temps réel, pour orienter chaque patient vers le bon hôpital.',
  },
  {
    name: 'Jappo Ambulance',
    text: 'Le SAMU affecte l’ambulance disponible la plus proche et suit les missions sur la carte.',
  },
]
