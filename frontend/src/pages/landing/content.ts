/**
 * Contenu de la page d'accueil publique.
 *
 * Les fonctionnalités décrites sont celles du code (modules sang, lits,
 * ambulances, prévisions, temps réel, rôles). Les informations sur le don de
 * sang viennent du Centre National de Transfusion Sanguine (cnts.gouv.sn,
 * consulté le 6 octobre 2026) : à tenir à jour avec lui.
 */

export const SOURCE = {
  name: 'Centre National de Transfusion Sanguine (CNTS)',
  url: 'https://cnts.gouv.sn',
  consulted: '6 octobre 2026',
}

export type ModuleKey = 'blood' | 'beds' | 'ambulances'

/** Les trois modules, au même niveau. */
export const MODULES: {
  key: ModuleKey
  name: string
  tagline: string
  features: string[]
}[] = [
  {
    key: 'blood',
    name: 'Jappo Sang',
    tagline: 'Le bon donneur, au bon moment.',
    features: [
      'Les hôpitaux publient leurs besoins : groupe, nombre de poches, urgence, rayon de recherche.',
      'Les donneurs compatibles les plus proches reçoivent une alerte sur leur téléphone.',
      'Réponse en un geste ; l’hôpital voit qui vient et confirme le don.',
      'Délais entre deux dons respectés automatiquement.',
    ],
  },
  {
    key: 'beds',
    name: 'Jappo Lits',
    tagline: 'Chaque lit libre, visible en temps réel.',
    features: [
      'Capacités par service : réanimation, urgences, maternité, pédiatrie…',
      'Entrées et sorties en un clic, taux d’occupation à jour.',
      'Alerte dès qu’un service vital est saturé, ou à nouveau disponible.',
      'Recherche des établissements les plus proches ayant des lits libres.',
    ],
  },
  {
    key: 'ambulances',
    name: 'Jappo Ambulance',
    tagline: 'L’ambulance la plus proche, sans perdre une minute.',
    features: [
      'Création des missions par la régulation, par niveau de priorité.',
      'Affectation automatique de l’ambulance disponible la plus proche.',
      'Suivi GPS des véhicules et des missions sur la carte, en direct.',
      'Destination proposée : les hôpitaux proches qui ont un lit libre.',
    ],
  },
]

/** Une urgence de bout en bout : les trois modules travaillent ensemble. */
export const SCENARIO = [
  {
    module: 'ambulances' as ModuleKey,
    time: '00:00',
    title: 'L’appel arrive au SAMU',
    text: 'La régulation crée la mission ; l’ambulance disponible la plus proche est affectée automatiquement.',
  },
  {
    module: 'beds' as ModuleKey,
    time: '00:04',
    title: 'Un lit est trouvé avant l’arrivée',
    text: 'L’équipage voit les hôpitaux proches qui ont un lit libre dans le bon service et s’y dirige.',
  },
  {
    module: 'beds' as ModuleKey,
    time: '00:18',
    title: 'L’hôpital se prépare',
    text: 'L’administrateur des lits suit la mission qui arrive et enregistre l’admission en un clic.',
  },
  {
    module: 'blood' as ModuleKey,
    time: '00:25',
    title: 'Il faut du sang O−',
    text: 'L’hôpital publie une demande urgente : les donneurs compatibles les plus proches sont alertés.',
  },
]

/** Groupes en tension publiés par le CNTS. */
export const BLOOD_NEEDS = {
  updated: '30 septembre 2026',
  groups: [
    { group: 'O−', level: 'critical' as const },
    { group: 'B−', level: 'critical' as const },
    { group: 'A+', level: 'low' as const },
    { group: 'A−', level: 'low' as const },
  ],
}

/** Conditions du don (CNTS) : le titre dit la règle, le détail la précise. */
export const DONOR_CONDITIONS = [
  { key: 'age', title: 'Avoir entre 18 et 60 ans', detail: 'Âge requis pour donner' },
  { key: 'weight', title: 'Peser au moins 50 kg', detail: 'Poids minimum' },
  { key: 'men', title: 'Hommes : tous les 3 mois', detail: '4 dons par an au plus' },
  { key: 'women', title: 'Femmes : tous les 4 mois', detail: '3 dons par an au plus' },
  {
    key: 'health',
    title: 'Être en bonne santé le jour du don',
    detail: 'Un entretien médical confidentiel confirme l’aptitude.',
  },
] as const

export const FAQ = [
  {
    q: 'Qu’est-ce que Jappo Dundu ?',
    a: 'Une plateforme qui relie en temps réel les donneurs de sang, les lits hospitaliers et les ambulances au Sénégal. « Jappo Dundu » signifie « Connecter la vie » en wolof.',
  },
  {
    q: 'Qui peut utiliser la plateforme ?',
    a: 'Les donneurs, avec l’application mobile ; les hôpitaux, le SAMU et la supervision nationale, avec l’interface web. Chaque professionnel a un rôle qui limite ce qu’il voit à son domaine et à son établissement.',
  },
  {
    q: 'Comment mon hôpital peut-il rejoindre Jappo Dundu ?',
    a: 'L’administrateur général crée l’établissement, puis les comptes de ses administrateurs (lits, sang ou ambulances).',
  },
  {
    q: 'Ma position est-elle partagée ?',
    a: 'Elle sert seulement à vous montrer les demandes des hôpitaux proches. Elle n’est jamais transmise aux hôpitaux.',
  },
  {
    q: 'Qui peut donner son sang ?',
    a: 'Les personnes de 18 à 60 ans, de 50 kg au moins, en bonne santé. Un entretien médical confidentiel confirme l’aptitude le jour du don.',
  },
  {
    q: 'Jappo Dundu remplace-t-il le CNTS ?',
    a: 'Non. La plateforme facilite la mise en relation ; le prélèvement et la sécurité transfusionnelle restent assurés par le CNTS et ses centres.',
  },
]
